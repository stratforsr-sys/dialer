"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { requireLeadAccess } from "@/lib/guard";
import { canAccessList, claimCutoff, isAdminUser } from "@/lib/lists";
import { computeNext, slotAt, type Slot, type SchedulerConfig } from "@/lib/scheduler";
import { resolveScript, firstNameOf, type ResolverVariant } from "@/lib/script-resolver";
import { getActiveScripts } from "@/app/actions/scripts";
import { RESULT_OPTIONS, OUTCOME_OPTIONS } from "@/lib/cockpit-flow";
import type {
  CallResult,
  ConversationOutcome,
  NoReason,
  FrameworkStep,
  Prisma,
} from "@/generated/prisma/client";

// ── Konfiguration ──────────────────────────────────────────────────────────

export async function getDialerConfig() {
  await requireAuth();
  const cfg = await db.dialerConfig.findUnique({ where: { id: "singleton" } });
  if (cfg) return cfg;
  // Singleton saknas bara om migrationens INSERT inte gått igenom.
  return db.dialerConfig.create({ data: { id: "singleton" } });
}

export async function getCallSlots() {
  await requireAuth();
  return db.callSlot.findMany({
    where: { active: true },
    orderBy: { order: "asc" },
  });
}

function toSchedulerConfig(cfg: {
  maxAttempts: number;
  cooldownDays: number;
  retryHoursNoAnswer: number;
  retryHoursBusy: number;
  retryHoursVoicemail: number;
  retryHoursGatekeeper: number;
  retryDaysNoSalespeople: number;
  blockedDatesJson: string;
}): SchedulerConfig {
  let blockedDates: string[] = [];
  try {
    const parsed = JSON.parse(cfg.blockedDatesJson);
    if (Array.isArray(parsed)) blockedDates = parsed.filter((d) => typeof d === "string");
  } catch {
    // Trasig JSON ska inte stoppa ringandet — spärrade datum är en guardrail,
    // inte en förutsättning.
  }
  return {
    maxAttempts: cfg.maxAttempts,
    cooldownDays: cfg.cooldownDays,
    retryHoursNoAnswer: cfg.retryHoursNoAnswer,
    retryHoursBusy: cfg.retryHoursBusy,
    retryHoursVoicemail: cfg.retryHoursVoicemail,
    retryHoursGatekeeper: cfg.retryHoursGatekeeper,
    retryDaysNoSalespeople: cfg.retryDaysNoSalespeople,
    blockedDates,
  };
}

// ── Lease: hämta nästa block med leads ─────────────────────────────────────

/**
 * Reserverar ett block leads åt säljaren, atomiskt.
 *
 * Problemet med nuvarande cockpit är att servern skickar samma 200 leads i
 * samma ordning till varje säljare, och att claim-låset tas först när
 * dispositionen sätts — alltså EFTER att samtalet redan är ringt. Två säljare
 * kan därför ringa samma bolag inom samma minut, och först den andra får veta.
 *
 * Lösningen är ett kort arbetslås som tas i förväg. Tricket i satsen nedan är
 * att det yttre WHERE upprepar villkoret från underfrågan: två samtidiga
 * körningar kan då aldrig ta samma rad — förloraren matchar noll rader i
 * stället för att skriva över vinnarens lås. Det ger samma garanti som
 * SELECT ... FOR UPDATE SKIP LOCKED, vilket SQLite inte har.
 */
export async function leaseNextLeads(listId: string | null, limit?: number) {
  const user = await requireAuth();

  if (listId) {
    const ok = await canAccessList(user, listId);
    if (!ok) throw new Error("Forbidden: list");
  }

  const [cfg, slots] = await Promise.all([getDialerConfig(), getCallSlots()]);
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + cfg.leaseMinutes * 60_000);
  const take = Math.min(limit ?? cfg.leaseBlockSize, 100);
  const currentSlot = slotAt(slots as Slot[], now);

  const nowIso = now.toISOString();
  const cutoffIso = claimCutoff(now).toISOString();
  const leaseIso = leaseUntil.toISOString();

  // Villkoren byggs upp som fragment för att slippa binda parametrar som inte
  // är relevanta (listfilter, passfilter, admin-synlighet).
  const conds: string[] = [
    `l."retired" = 0`,
    `l."hasActiveDeal" = 0`,
    `(l."leasedUntil" IS NULL OR l."leasedUntil" < ?)`,
    `(l."claimedAt" IS NULL OR l."claimedAt" < ? OR l."ownerId" = ?)`,
    `(l."nextActionAt" IS NULL OR l."nextActionAt" <= ?)`,
    // Taket gäller inte ett lead som har en förfallen, lovad återuppringning.
    // Bokningen räknar upp attemptCount som vilket samtal som helst, så ett
    // lead som bokade återkomst på sista försöket slog i taket och serverades
    // ALDRIG igen — löftet försvann tyst. Taket finns för att hindra att vi
    // ringer folk i onödan, inte för att hindra oss från att ringa när någon
    // bett oss göra det.
    `(l."attemptCount" < ? OR (l."callbackAt" IS NOT NULL AND l."callbackAt" <= ?))`,
    `EXISTS (SELECT 1 FROM "Contact" c WHERE c."leadId" = l."id")`,
    `NOT EXISTS (SELECT 1 FROM "DoNotCall" d WHERE d."leadId" = l."id"
        AND (d."expiresAt" IS NULL OR d."expiresAt" > ?))`,
    // Ett bolag med en öppen återkomst ligger UTANFÖR däcket. Inte "sist i
    // kön", inte "bara för den som lovade" — utanför. Ingen får det serverat
    // av rotationen, inte ens löftesgivaren själv och inte en admin.
    //
    // Det låter hårdare än det är, och det är hela idén: ett lovat samtal är
    // inte ett slumpmässigt nästa lead. Det ska ringas på tiden som utlovades,
    // av personen som lovade, med anteckningen om vad som ska sägas framför
    // sig. Vägen dit är notisklockan, där återkomsten ligger med nummer,
    // anteckning och en dispositionsruta — inte däcket, som delar ut bolag i
    // en ordning ingen har bestämt.
    //
    // Utan villkoret sorterades leadet i stället ÖVERST i däcket hos hela
    // golvet i samma sekund som klockan slog (se ORDER BY nedan). Första
    // kollega som dispositionerade bolaget ringde kunden och stängde löftet,
    // och det försvann ur klockan hos säljaren som gav det.
    //
    // Bolaget kommer tillbaka in i rotationen på exakt två sätt, båda aktiva:
    // någon dispositionerar samtalet (då avgör utfallet vad som händer med
    // leadet, precis som för alla andra samtal), eller någon avbokar
    // återkomsten. En admin kan avboka vems rad som helst
    // (`requireCallbackAccess`) och är därmed utvägen när en säljare slutat —
    // ett bolag släpps av en människa, inte av en klocka.
    `NOT EXISTS (SELECT 1 FROM "Callback" cb WHERE cb."leadId" = l."id"
        AND cb."status" = 'PENDING')`,
  ];
  // Ordningen följer conds ovan exakt. Den sista nowIso hör till
  // DoNotCall-villkoret; reservationen av lovade bolag binder inga parametrar.
  const args: unknown[] = [
    nowIso,
    cutoffIso,
    user.id,
    nowIso,
    cfg.maxAttempts,
    nowIso,
    nowIso,
  ];

  let join = "";
  if (listId) {
    join = `JOIN "LeadOnList" lol ON lol."leadId" = l."id"`;
    conds.push(`lol."listId" = ?`);
    args.push(listId);
  } else if (user.role !== "ADMIN") {
    // Säljare utan vald mapp: egna leads eller leads i mappar de har tillgång till.
    conds.push(`(l."ownerId" = ? OR EXISTS (
        SELECT 1 FROM "LeadOnList" lol2
        JOIN "ListAccess" la ON la."listId" = lol2."listId"
        WHERE lol2."leadId" = l."id" AND la."userId" = ?
      ))`);
    args.push(user.id, user.id);
  }

  // Passrotationen är en preferens, inte ett filter: ett lead vars tur det är
  // i ett annat pass får ändå ringas om det inte finns bättre kandidater.
  // Därför i ORDER BY och inte i WHERE.
  const slotRank = currentSlot
    ? `CASE WHEN l."nextSlotId" IS NULL OR l."nextSlotId" = ? THEN 0 ELSE 1 END,`
    : "";
  const orderArgs: unknown[] = currentSlot ? [currentSlot.id] : [];

  const sql = `
    UPDATE "Lead"
    SET "leasedById" = ?, "leasedUntil" = ?
    WHERE "rowid" IN (
      SELECT l."rowid" FROM "Lead" l
      ${join}
      WHERE ${conds.join(" AND ")}
      ORDER BY
        CASE WHEN l."callbackAt" IS NOT NULL AND l."callbackAt" <= ? THEN 0 ELSE 1 END,
        ${slotRank}
        l."nextActionAt" ASC,
        l."attemptCount" ASC,
        l."updatedAt" ASC
      LIMIT ?
    )
    AND ("leasedUntil" IS NULL OR "leasedUntil" < ?)
    RETURNING "id"
  `;

  // $queryRawUnsafe — inte $executeRawUnsafe: den senare returnerar antal rader
  // och kastar bort RETURNING.
  const rows = await db.$queryRawUnsafe<{ id: string }[]>(
    sql,
    user.id,
    leaseIso,
    ...args,
    nowIso,
    ...orderArgs,
    take,
    nowIso
  );

  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];

  const leads = await db.lead.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      companyName: true,
      website: true,
      orgNumber: true,
      // Kvalificeringsdata från importen. Säljaren ska inte behöva lämna
      // cockpiten för att se var bolaget ligger eller hur stort det är.
      address: true,
      city: true,
      industry: true,
      industrySource: true,
      employees: true,
      revenue: true,
      attemptCount: true,
      lastAttemptAt: true,
      lastResult: true,
      callbackAt: true,
      contacts: {
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          role: true,
          directPhone: true,
          switchboard: true,
          directPhoneE164: true,
          switchboardE164: true,
          email: true,
          linkedin: true,
        },
        orderBy: { createdAt: "asc" },
      },
      // Historiken. Utan den var cockpit-anteckningarna skrivskyddad data:
      // de sparades på CallAttempt och renderades inte på ett enda ställe i
      // appen. En säljare som skrev "vill ha offert efter semestern" fick
      // aldrig se det igen.
      //
      // Åtta rader räcker — det är fler än taket för antal försök, och en
      // panel som scrollar läser ingen mitt i ett samtal.
      callAttempts: {
        select: {
          id: true,
          startedAt: true,
          result: true,
          outcome: true,
          noReason: true,
          note: true,
          seller: { select: { name: true } },
        },
        orderBy: { startedAt: "desc" },
        take: 8,
      },
      // Anteckningar skrivna på lead-sidan är ett eget spår som cockpiten
      // aldrig sett. De hör hemma i samma tidslinje — säljaren bryr sig om
      // vad som sagts om bolaget, inte om vilken vy det skrevs i.
      activities: {
        where: { type: "NOTE" },
        select: {
          id: true,
          timestamp: true,
          metadata: true,
          actor: { select: { name: true } },
        },
        orderBy: { timestamp: "desc" },
        take: 8,
      },
      gatekeepers: {
        select: {
          id: true,
          name: true,
          role: true,
          lastSaid: true,
          lastEncounterAt: true,
          dmName: true,
          dmAvailability: true,
          passes: true,
          encounters: true,
        },
        orderBy: { lastEncounterAt: "desc" },
        take: 1,
      },
      // rawJson utelämnas medvetet — den får aldrig lämna servern.
      dossier: {
        select: {
          weaknessCount: true,
          overallConfidence: true,
          status: true,
          fetchedAt: true,
          claims: {
            select: {
              key: true,
              valueNum: true,
              valueStr: true,
              valueBool: true,
              unit: true,
              confidence: true,
              strength: true,
              weakness: true,
              source: true,
              sourceUrl: true,
              fetchedAt: true,
            },
            // Starkaste säljbara bristen först. Sorteras det på förekomst
            // hamnar schema.org-markup och analytics överst på varje samtal —
            // sant, men värdelöst att säga till en rörmokare.
            orderBy: [{ weakness: "desc" }, { strength: "desc" }, { confidence: "desc" }],
          },
        },
      },
    },
  });

  // Manusen löses ut här, i samma svep. Ett anrop per lead vid uppkoppling
  // skulle lägga en rundtur mellan tangenttryckning och nästa samtal — och
  // hela poängen med förberäkning är att det inte ska finnas någon väntan.
  const scripts = await getActiveScripts();

  return leads.map((lead) => ({
    ...lead,
    scripts: scripts.map((s) => ({
      step: s.step,
      name: s.name,
      versionId: s.versionId,
      resolved: resolveScript(
        s.variants as ResolverVariant[],
        lead.dossier?.claims ?? [],
        {
          företag: lead.companyName,
          // {kontakt} är tilltalsnamnet, inte hela namnet — se firstNameOf.
          // {fullnamn} finns kvar för den som uttryckligen vill ha båda delarna.
          kontakt: firstNameOf(lead.contacts[0]?.firstName, lead.contacts[0]?.name),
          förnamn: firstNameOf(lead.contacts[0]?.firstName, lead.contacts[0]?.name),
          fullnamn: lead.contacts[0]?.name ?? null,
          roll: lead.contacts[0]?.role ?? null,
          ort: lead.city ?? lead.address?.split(",").pop()?.trim() ?? null,
          säljare: user.name,
        }
      ),
    })),
  }));
}

/** Lämnar tillbaka leads som inte hanns med, så de blir ringbara direkt igen. */
export async function releaseLeases(leadIds: string[]) {
  const user = await requireAuth();
  if (leadIds.length === 0) return { released: 0 };

  const res = await db.lead.updateMany({
    where: { id: { in: leadIds }, leasedById: user.id },
    data: { leasedById: null, leasedUntil: null },
  });
  return { released: res.count };
}

// ── Registrera ett samtal ──────────────────────────────────────────────────

export interface RecordAttemptInput {
  leadId: string;
  contactId?: string | null;
  listId?: string | null;
  sessionId?: string | null;
  result: CallResult;
  outcome?: ConversationOutcome | null;
  noReason?: NoReason | null;
  note?: string | null;
  idleBeforeSec?: number;
  durationSec?: number;
  dialedE164?: string | null;
  scriptVersionId?: string | null;
  /** Bokad återuppringning. */
  callbackAt?: Date | null;
  /** Vad som ska sägas när man ringer. Syns i notisen och i påminnelsemejlet. */
  callbackNote?: string | null;
  /** Säljarens kryss för mejlpåminnelse. Enda vägen in i morgonmejlet. */
  callbackEmailReminder?: boolean;
  /**
   * Återkomsten samtalet BESVARADE, när dispositionen sker i notisklockan.
   *
   * Utan den går det inte att skilja "jag ringde löftet" från "jag råkade
   * ringa bolaget". Den som ringer en återkomst tio minuter för tidigt ska
   * inte få raden kvar i klockan resten av veckan, och tidsjämförelsen ensam
   * kan inte avgöra det. Här pekas raden ut, och då stängs just den.
   */
  answeredCallbackId?: string | null;
  /** Växelinformation, om säljaren fastnade där. */
  gatekeeper?: {
    name?: string | null;
    role?: string | null;
    said?: string | null;
    dmName?: string | null;
    dmAvailability?: string | null;
    dmAvailableAt?: Date | null;
    passed?: boolean;
  } | null;
  /** Ramverket — ETT tryck efter samtalet, aldrig avbockning under det. */
  framework?: {
    furthestStep: FrameworkStep;
    endedAtStep: FrameworkStep;
    closeAttempts?: number;
    objections?: Array<{ tag: string; atStep: FrameworkStep; handled?: boolean }>;
  } | null;
}

/**
 * Skriver samtalet och räknar om leadets schemaläggning.
 *
 * Allt som måste vara sant samtidigt ligger i en batchad transaktion — array-
 * formen, inte callback-formen. Callback-formen håller skrivlåset öppet över
 * nätverket mellan varje sats, vilket mot Turso ger timeout under belastning.
 */
export async function recordAttempt(input: RecordAttemptInput) {
  const user = await requireLeadAccess(input.leadId);

  const [cfg, slots, lead] = await Promise.all([
    db.dialerConfig.findUnique({ where: { id: "singleton" } }),
    db.callSlot.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
    db.lead.findUnique({
      where: { id: input.leadId },
      select: { attemptCount: true, noAnswerStreak: true, triedSlotsJson: true },
    }),
  ]);

  if (!lead) throw new Error("Lead not found");
  if (!cfg) throw new Error("DialerConfig saknas");

  const now = new Date();
  let triedSlotIds: string[] = [];
  try {
    const parsed = JSON.parse(lead.triedSlotsJson);
    if (Array.isArray(parsed)) triedSlotIds = parsed.filter((s) => typeof s === "string");
  } catch {
    // Trasig JSON → börja om rotationen. Inte värt att fela ett samtal på.
  }

  const decision = computeNext({
    lead: {
      attemptCount: lead.attemptCount,
      noAnswerStreak: lead.noAnswerStreak,
      triedSlotIds,
    },
    result: input.result,
    outcome: input.outcome ?? null,
    noReason: input.noReason ?? null,
    callbackAt: input.callbackAt ?? null,
    dmAvailableAt: input.gatekeeper?.dmAvailableAt ?? null,
    slots: slots as Slot[],
    config: toSchedulerConfig(cfg),
    now,
  });

  const currentSlot = slotAt(slots as Slot[], now);

  const attempt = await db.callAttempt.create({
    data: {
      leadId: input.leadId,
      contactId: input.contactId ?? null,
      sellerId: user.id,
      listId: input.listId ?? null,
      sessionId: input.sessionId ?? null,
      attemptNo: lead.attemptCount + 1,
      slotId: currentSlot?.id ?? null,
      hourOfDay: now.getHours(),
      weekday: now.getDay() === 0 ? 7 : now.getDay(),
      result: input.result,
      outcome: input.outcome ?? null,
      noReason: input.noReason ?? null,
      note: input.note ?? null,
      idleBeforeSec: Math.max(0, Math.trunc(input.idleBeforeSec ?? 0)),
      durationSec: Math.max(0, Math.trunc(input.durationSec ?? 0)),
      dialedE164: input.dialedE164 ?? null,
      scriptVersionId: input.scriptVersionId ?? null,
      endedAt: now,
    },
    select: { id: true },
  });

  const writes: Prisma.PrismaPromise<unknown>[] = [
    db.lead.update({
      where: { id: input.leadId },
      data: {
        attemptCount: decision.attemptCount,
        noAnswerStreak: decision.noAnswerStreak,
        triedSlotsJson: JSON.stringify(decision.triedSlotIds),
        nextActionAt: decision.nextActionAt,
        nextSlotId: decision.nextSlotId,
        callbackAt: decision.callbackAt,
        retired: decision.retired,
        retiredReason: decision.retiredReason,
        lastAttemptAt: now,
        lastResult: input.result,
        // `ownerId` är "senast bearbetad av" och sätts alltid. Den ger
        // säljaren leadet i sina egna vyer men låser ingen ute — låset är
        // `claimedAt`.
        ownerId: user.id,
        // Claim-låset styrs av UTFALLET, inte av att någon råkade ringa.
        // CALLBACK_BOOKED och SOLD låser; allt annat släpper ett lås som
        // satts tidigare. Se `claimsLead` i scheduler.ts för varför.
        claimedAt: decision.claimsLead ? now : null,
        // Arbetslåset släpps i samma skrivning oavsett utfall.
        leasedById: null,
        leasedUntil: null,
      },
    }),
  ];

  // ── Anteckningen in i aktivitetsloggen ───────────────────────────────────
  //
  // Anteckningen sparas på CallAttempt, men lead-sidan renderar bara Activity.
  // Utan den här raden var allt en säljare skrev i cockpiten osynligt i resten
  // av systemet — data som lagrades men aldrig lästes.
  //
  // Bara när det FINNS en anteckning. En Activity per samtal hade lagt 150
  // rader per säljare och dag i en logg vars enda syfte är att gå att läsa.
  const note = input.note?.trim();
  if (note) {
    const resultLabel =
      RESULT_OPTIONS.find((o) => o.value === input.result)?.label ?? input.result;
    const outcomeLabel = input.outcome
      ? OUTCOME_OPTIONS.find((o) => o.value === input.outcome)?.label ?? null
      : null;

    writes.push(
      db.activity.create({
        data: {
          type: "CALL",
          leadId: input.leadId,
          contactId: input.contactId ?? null,
          actorId: user.id,
          timestamp: now,
          // Formen på metadata är densamma som LeadDetail redan renderar för
          // CALL: { status, notes }. Etiketterna är svenska av samma skäl —
          // loggen läses av människor, inte av enum-kunniga.
          metadata: JSON.stringify({
            status: outcomeLabel ? `${resultLabel} — ${outcomeLabel}` : resultLabel,
            notes: note,
            attemptId: attempt.id,
          }),
        },
      })
    );
  }

  // ── Återkomster ──────────────────────────────────────────────────────────
  //
  // Ett löfte tillhör den som gav det, och det är infriat först när DEN
  // personen faktiskt ringt bolaget.
  //
  // Tidigare stängde varje samtal på leadet ALLA öppna återkomster, oavsett
  // vem som lovat och oavsett om tiden var inne. Det såg ut som en städregel
  // och var i praktiken en läcka: i samma sekund som klockan slog gick leadet
  // tillbaka i rotationen, sorterades överst i däcket hos hela golvet, och
  // första kollega som dispositionerade det stängde löftet. Säljaren som gav
  // det såg återkomsten försvinna ur klockan utan att ha ringt. Åtta av nio
  // stängda återkomster i produktion stängdes så, sju av dem före utsatt tid.
  //
  // Tre regler i stället:
  //
  //   1. **Mitt samtal stänger mina förfallna löften.** Tiden var inne och jag
  //      ringde — det är exakt vad raden bad om.
  //   2. **Bokar jag en ny stänger den mina övriga på bolaget**, oavsett tid.
  //      Två öppna löften på samma bolag är alltid ett fel.
  //   3. **Ett terminalt utfall stänger allas.** Sålt, fel nummer eller
  //      ogiltigt nummer — det finns inget kvar att ringa om, och en rad som
  //      låg kvar hade skickat en säljare till ett bolag som är ur spel.
  //
  // Kvar står: en kollegas samtal rör inte mitt löfte, och ett samtal före
  // utsatt tid rör inte ett löfte som fortfarande ligger i framtiden.
  //
  // Ordningen är avgörande: stäng gamla FÖRE den nya skapas, annars stänger
  // satsen omedelbart den återkomst som just bokades.
  // Dispositionen kan peka ut raden den svarar på (klockan gör det). Den
  // stängs då oavsett klockslag — men bara om den faktiskt hör till det här
  // leadet och till den som ringer. Ett id från klienten är ett önskemål,
  // inte ett bevis.
  let answeredId: string | null = null;
  if (input.answeredCallbackId) {
    const cb = await db.callback.findUnique({
      where: { id: input.answeredCallbackId },
      select: { id: true, leadId: true, sellerId: true },
    });
    if (cb && cb.leadId === input.leadId && (cb.sellerId === user.id || isAdminUser(user))) {
      answeredId = cb.id;
    }
  }

  const closeWhere: Prisma.CallbackWhereInput = decision.retired
    ? { leadId: input.leadId, status: "PENDING" }
    : {
        leadId: input.leadId,
        status: "PENDING",
        OR: [
          // Den utpekade raden.
          ...(answeredId ? [{ id: answeredId }] : []),
          // Mina egna som förfallit. Ringer jag bolaget efter att tiden gått
          // ut är löftet infriat även om jag kom in via däcket.
          {
            sellerId: user.id,
            ...(decision.callbackAt ? {} : { scheduledAt: { lte: now } }),
          },
        ],
      };

  writes.push(
    db.callback.updateMany({
      where: closeWhere,
      data: {
        status: "COMPLETED",
        completedAt: now,
        completedOnAttemptId: attempt.id,
      },
    })
  );

  if (decision.callbackAt) {
    writes.push(
      db.callback.create({
        data: {
          leadId: input.leadId,
          contactId: input.contactId ?? null,
          // Den som lovade, inte leadets ägare. De är samma person i det här
          // ögonblicket, men ägarskapet byter hand vid nästa disposition och
          // påminnelsen ska ändå gå till rätt telefon.
          sellerId: user.id,
          bookedOnAttemptId: attempt.id,
          scheduledAt: decision.callbackAt,
          note: input.callbackNote?.trim() || null,
          emailReminder: input.callbackEmailReminder === true,
        },
      })
    );
  }

  if (input.framework) {
    writes.push(
      db.callFrameworkProgress.create({
        data: {
          callAttemptId: attempt.id,
          leadId: input.leadId,
          sellerId: user.id,
          furthestStep: input.framework.furthestStep,
          endedAtStep: input.framework.endedAtStep,
          closeAttempts: Math.max(0, input.framework.closeAttempts ?? 0),
          closedWon: input.outcome === "SOLD",
          objectionCount: input.framework.objections?.length ?? 0,
          objectionsHandled:
            input.framework.objections?.filter((o) => o.handled).length ?? 0,
          objections: input.framework.objections?.length
            ? {
                create: input.framework.objections.map((o, i) => ({
                  tag: o.tag,
                  atStep: o.atStep,
                  handled: o.handled ?? false,
                  sequence: i,
                })),
              }
            : undefined,
        },
      })
    );
  }

  await db.$transaction(writes);

  // `Lead.callbackAt` är ett eko av den öppna raden, inte sanningen. Sedan
  // samtalet slutade stänga andras löften kan det finnas en öppen återkomst
  // kvar som dispositionen inte kände till — kollegans, eller min egen som
  // ligger i framtiden. Skrev vi då `callbackAt = null` skulle bolaget serveras
  // enligt rotationen i stället för på den lovade tiden, och löftet vore kvar
  // i klockan men borta ur däcket.
  if (!decision.callbackAt && !decision.retired) {
    const remaining = await db.callback.findFirst({
      where: { leadId: input.leadId, status: "PENDING" },
      orderBy: { scheduledAt: "asc" },
      select: { scheduledAt: true },
    });
    if (remaining) {
      await db.lead.update({
        where: { id: input.leadId },
        data: {
          callbackAt: remaining.scheduledAt,
          nextActionAt: remaining.scheduledAt,
        },
      });
    }
  }

  if (input.gatekeeper) {
    await upsertGatekeeper(input.leadId, input.gatekeeper);
  }

  return { attemptId: attempt.id, nextActionAt: decision.nextActionAt, retired: decision.retired };
}

/**
 * Växelkontakten. Matchas på namn så att samma person inte blir fem rader —
 * utan det får man sex stavningar av "Anna i receptionen" och ingen statistik.
 */
async function upsertGatekeeper(
  leadId: string,
  gk: NonNullable<RecordAttemptInput["gatekeeper"]>
) {
  const name = gk.name?.trim() || null;
  const now = new Date();

  const existing = name
    ? await db.gatekeeperContact.findFirst({ where: { leadId, name } })
    : await db.gatekeeperContact.findFirst({ where: { leadId, name: null } });

  const data = {
    role: gk.role ?? undefined,
    lastSaid: gk.said ?? undefined,
    lastEncounterAt: now,
    dmName: gk.dmName ?? undefined,
    dmAvailability: gk.dmAvailability ?? undefined,
    dmAvailableAt: gk.dmAvailableAt ?? undefined,
  };

  if (existing) {
    await db.gatekeeperContact.update({
      where: { id: existing.id },
      data: {
        ...data,
        encounters: { increment: 1 },
        passes: gk.passed ? { increment: 1 } : undefined,
      },
    });
  } else {
    await db.gatekeeperContact.create({
      data: {
        leadId,
        name,
        ...data,
        encounters: 1,
        passes: gk.passed ? 1 : 0,
      },
    });
  }
}
