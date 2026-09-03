"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { requireLeadAccess } from "@/lib/guard";
import { canAccessList, claimCutoff, isAdminUser } from "@/lib/lists";
import { computeNext, slotAt, toSchedulerConfig, type Slot } from "@/lib/scheduler";
import { blockLead } from "@/lib/donotcall";
import { resolveScript, firstNameOf, type ResolverVariant } from "@/lib/script-resolver";
import { getActiveScripts } from "@/app/actions/scripts";
import { RESULT_LABELS, OUTCOME_OPTIONS, REASON_OPTIONS, isConnected } from "@/lib/cockpit-flow";
import { findPendingCall, linkAttemptToCall } from "@/lib/telephony/link";
import { hourOfDay, weekdayOf, formatTime, formatDate, formatWhen } from "@/lib/time";
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
    // Inget krav på kontakt eller nummer. Fram till 2026-08-25 stod här
    // `EXISTS (SELECT 1 FROM "Contact" …)`, och en mapp där bolagen saknade
    // telefonnummer var därför osynlig: 986 av 1 000 leads i
    // `leads_bygg_hantverk` delades aldrig ut, och cockpiten sa "mappen är
    // slut" till en säljare som hade tusen bolag framför sig.
    //
    // Ett bolag utan nummer är inte färdigbehandlat, det är obearbetat. Numret
    // finns på bolagets sajt, i Hitta.se eller hos växeln — det är ett par
    // minuters arbete, inte ett hinder, och säljaren har bolaget framför sig
    // med ort, org-nummer och bransch. Cockpiten har en ruta för att slå upp
    // och spara numret på plats. Det som saknas är en uppgift att hämta, och
    // den hämtas i passet.
    //
    // Ordningen håller ändå isär de två sorternas arbete: ringbara bolag
    // först (se ORDER BY), så att ett pass börjar med samtal och inte med
    // uppslagning.
    // Spärrlistan. Matchar på leadId ELLER org-nummer, och det andra ledet är
    // hela poängen: `leadId` nollas när leadet raderas ("Inget telefonnummer")
    // och ett omimporterat bolag får ett nytt id. Utan org-numret skyddade
    // spärren alltså bara fram till nästa import — precis den lucka som gör
    // att ett bolag "dyker upp igen".
    `NOT EXISTS (SELECT 1 FROM "DoNotCall" d
        WHERE (d."leadId" = l."id"
               OR (d."orgNumber" IS NOT NULL AND d."orgNumber" = l."orgNumber"))
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
        -- Bolag med ett nummer först. Ett pass ska börja med samtal; de som
        -- kräver en uppslagning innan de går att ringa ligger i svansen, där
        -- de blir det man gör när det ringbara är slut i stället för ett
        -- avbrott mitt i rytmen.
        CASE WHEN EXISTS (
          SELECT 1 FROM "Contact" c
          WHERE c."leadId" = l."id"
            AND (c."directPhoneE164" IS NOT NULL OR c."switchboardE164" IS NOT NULL
                 OR c."directPhone" IS NOT NULL OR c."switchboard" IS NOT NULL)
        ) THEN 0 ELSE 1 END,
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

  return hydrateLeads(ids, user, listId);
}

// ── Inget nummer att hitta ─────────────────────────────────────────────────

/**
 * Säljaren letade och hittade inget nummer. Bolaget lämnar kön.
 *
 * Sedan filtret på kontaktrad togs bort delas bolag utan nummer ut som vilka
 * andra som helst, med `AddNumberCard` för att slå upp numret. Det som saknades
 * var vägen ut när uppslagningen inte gav något: utan den kommer bolaget
 * tillbaka i nästa block, och nästa säljare gör om exakt samma sökning.
 *
 * **Skrivs inte som ett samtal.** Det ligger nära till hands — knappen sitter
 * bland dispositionerna — men inget samtal ringdes. Statistiken räknar rader i
 * `CallAttempt` som samtal, så en `CallAttempt` här hade blivit ett samtal i
 * dagsmålet, i coachingvyn och i svarsfrekvensens nämnare. Det är precis den
 * sortens hopblandning som `result`/`outcome` finns till för att undvika.
 *
 * **Leadet raderas**, på beställning 2026-08-25: ett bolag som ingen kan ringa
 * ska inte ligga kvar och se ut som ett lead. Raderingen kaskaderar bort
 * kontakter, aktiviteter och kopplingen till mappen, så bolaget lämnar
 * ringlistan helt i stället för att bli en pensionerad rad i den.
 *
 * Två saker att veta om det:
 *
 * 1. **Det finns ingen väg tillbaka och inget spår.** `Activity.leadId` är
 *    obligatorisk och kaskaderar, så en logg-rad om raderingen hade raderats
 *    med leadet. Bolaget måste importeras på nytt för att komma tillbaka.
 *    Spärrlistan överlever däremot. `markNoPhoneFound` skriver en permanent
 *    `DoNotCall` **före** raderingen (`blockLead`), och `onDelete: SetNull`
 *    nollar bara `leadId` — org-numret står kvar. Eftersom däckets spärrfilter
 *    matchar på org-nummer också är bolaget spärrat även efter en omimport,
 *    trots att raden det spärrades på är borta. Utan den detaljen hade
 *    raderingen varit minneslös: nästa import gav ett nytt lead-id och nästa
 *    säljare gjorde om samma resultatlösa uppslagning.
 * 2. **`requireLeadAccess`, inte `requireAdmin`.** `deleteLead` i
 *    `actions/leads.ts` är admin-bara med motiveringen att aktivitetsloggen är
 *    oföränderlig och att den vägen inte får stå öppen för säljare. Här står
 *    den öppen, med flit: det är säljaren som gör uppslagningen och det är i
 *    cockpiten beslutet fattas. Undantaget gäller den här knappen och ingen
 *    annan väg.
 *
 * Undantaget från undantaget är historiken. Har bolaget ringts förut, eller
 * finns det en affär på det, pensioneras det i stället för att raderas —
 * statistiken för de samtalen ska inte försvinna för att någon inte hittade ett
 * nytt nummer i dag. I praktiken är det ett sällsynt fall: bolagen knappen
 * finns för har aldrig haft ett nummer att ringa.
 */
export async function markNoPhoneFound(leadId: string) {
  const user = await requireLeadAccess(leadId);

  // Spärren skrivs FÖRE allt annat, och särskilt före raderingen: efteråt
  // finns inget lead att läsa org-numret ur, och `blockLead` hade fått en
  // tom rad att nyckla på. `onDelete: SetNull` på `leadId` gör att raden
  // överlever raderingen med org-numret i behåll.
  await blockLead({
    leadId,
    userId: user.id,
    reason: "Inget telefonnummer gick att hitta",
  });

  const [attempts, deals] = await Promise.all([
    db.callAttempt.count({ where: { leadId } }),
    db.deal.count({ where: { leadId } }),
  ]);

  if (attempts > 0 || deals > 0) {
    await db.lead.update({
      where: { id: leadId },
      data: {
        retired: true,
        retiredReason: "inget_nummer",
        // Arbetslåset släpps i samma sats. Ligger det kvar står bolaget kvar
        // som upptaget i en kvart efter att säljaren redan lämnat det.
        leasedById: null,
        leasedUntil: null,
        nextActionAt: null,
        nextSlotId: null,
      },
    });

    await db.activity.create({
      data: {
        type: "STATUS_CHANGE",
        actorId: user.id,
        leadId,
        metadata: JSON.stringify({ status: "retired", reason: "inget_nummer" }),
      },
    });

    return { deleted: false as const };
  }

  await db.lead.delete({ where: { id: leadId } });
  return { deleted: true as const };
}

// ── Varför är däcket tomt? ─────────────────────────────────────────────────

export type DeckBlocker = {
  /** Nyckel för texten i klienten — inte en mening, så språket bor på ett ställe. */
  reason:
    | "dnc"
    | "callback"
    | "claimed"
    | "leased_by_other"
    | "leased_by_me"
    | "max_attempts"
    | "resting"
    | "retired"
    | "active_deal";
  count: number;
};

export type DeckStatus = {
  /** Antal leads i mappen (eller i säljarens synfält när ingen mapp är vald). */
  total: number;
  blockers: DeckBlocker[];
  /** Tidigaste tidpunkt då ett vilande lead blir ringbart igen. */
  nextAvailableAt: string | null;
};

/**
 * SQLite-datum till ISO.
 *
 * Prisma lagrar DateTime i SQLite som texten `2026-08-26 09:15:00` — utan
 * tidszon, men alltid i UTC. `new Date("2026-08-26 09:15:00")` i webbläsaren
 * läser den som *lokal* tid och skulle visa klockan två timmar fel på sommaren.
 * Raka SQL-skrivningar i den här filen lägger i stället in fullständig ISO, så
 * båda formaten förekommer i samma kolumn och funktionen måste tåla det.
 */
function toIso(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.includes("T")) return raw;
  return `${raw.replace(" ", "T")}Z`;
}

/**
 * Räknar upp varför inga fler leads delas ut.
 *
 * Skriven för att en enda mening i cockpitens tomläge ljög: den sa att resten
 * "väntar på sin tur i uppföljningen" oavsett vad som faktiskt hände. Den 25
 * augusti 2026 mötte den en säljare med 1 000 bolag i mappen, varav 986 utan
 * telefonnummer — de filtrerades bort av utdelningen och skärmen hittade på en
 * förklaring. Numren är nu ett arbetsmoment i stället för ett filter (se
 * `leaseNextLeads`), men skärmen ska aldrig mer gissa: står det att däcket är
 * slut ska det stå varför, räknat.
 *
 * **Villkoren speglar `leaseNextLeads` rad för rad.** Ändras ett filter där
 * måste det ändras här, annars förklarar skärmen ett däck som inte finns.
 * Varje lead räknas EN gång, på sitt första skäl i ordningen nedan — annars
 * summerar delarna till mer än helheten och siffrorna slutar gå att lita på.
 * Ordningen går från det mest permanenta till det mest tillfälliga.
 */
export async function deckStatus(listId: string | null): Promise<DeckStatus> {
  const user = await requireAuth();

  if (listId) {
    const ok = await canAccessList(user, listId);
    if (!ok) throw new Error("Forbidden: list");
  }

  const cfg = await getDialerConfig();
  const now = new Date();
  const nowIso = now.toISOString();
  const cutoffIso = claimCutoff(now).toISOString();

  const scope: string[] = [];
  const scopeArgs: unknown[] = [];
  let join = "";

  if (listId) {
    join = `JOIN "LeadOnList" lol ON lol."leadId" = l."id"`;
    scope.push(`lol."listId" = ?`);
    scopeArgs.push(listId);
  } else if (user.role !== "ADMIN") {
    scope.push(`(l."ownerId" = ? OR EXISTS (
        SELECT 1 FROM "LeadOnList" lol2
        JOIN "ListAccess" la ON la."listId" = lol2."listId"
        WHERE lol2."leadId" = l."id" AND la."userId" = ?
      ))`);
    scopeArgs.push(user.id, user.id);
  }

  const where = scope.length > 0 ? `WHERE ${scope.join(" AND ")}` : "";

  // Ett CASE med fallande prioritet: första sanna grenen är leadets skäl.
  // "no_phone" mäts som "ingen kontakt med ett nummer", inte som "ingen
  // kontakt alls" — en kontaktrad med bara en e-postadress går inte att ringa
  // heller, och att kalla den ringbar hade varit samma sorts halvsanning som
  // meningen den här funktionen ersätter.
  const sql = `
    SELECT reason, COUNT(*) AS n, MIN("nextActionAt") AS next_at
    FROM (
      SELECT
        CASE
          WHEN l."retired" = 1 THEN 'retired'
          WHEN l."hasActiveDeal" = 1 THEN 'active_deal'
          WHEN EXISTS (
            SELECT 1 FROM "DoNotCall" d
            WHERE (d."leadId" = l."id"
                   OR (d."orgNumber" IS NOT NULL AND d."orgNumber" = l."orgNumber"))
              AND (d."expiresAt" IS NULL OR d."expiresAt" > ?)
          ) THEN 'dnc'
          WHEN EXISTS (
            SELECT 1 FROM "Callback" cb WHERE cb."leadId" = l."id" AND cb."status" = 'PENDING'
          ) THEN 'callback'
          WHEN l."claimedAt" IS NOT NULL AND l."claimedAt" >= ? AND l."ownerId" <> ? THEN 'claimed'
          WHEN l."leasedUntil" IS NOT NULL AND l."leasedUntil" >= ? AND l."leasedById" <> ? THEN 'leased_by_other'
          WHEN l."leasedUntil" IS NOT NULL AND l."leasedUntil" >= ? THEN 'leased_by_me'
          WHEN l."attemptCount" >= ?
               AND NOT (l."callbackAt" IS NOT NULL AND l."callbackAt" <= ?) THEN 'max_attempts'
          WHEN l."nextActionAt" IS NOT NULL AND l."nextActionAt" > ? THEN 'resting'
          ELSE 'available'
        END AS reason,
        l."nextActionAt" AS "nextActionAt"
      FROM "Lead" l
      ${join}
      ${where}
    )
    GROUP BY reason
  `;

  const rows = await db.$queryRawUnsafe<{ reason: string; n: bigint | number; next_at: string | null }[]>(
    sql,
    nowIso,
    cutoffIso,
    user.id,
    nowIso,
    user.id,
    nowIso,
    cfg.maxAttempts,
    nowIso,
    nowIso,
    ...scopeArgs
  );

  let total = 0;
  const blockers: DeckBlocker[] = [];
  let nextAvailableAt: string | null = null;

  for (const row of rows) {
    const count = Number(row.n);
    total += count;
    if (row.reason === "available") continue;
    if (row.reason === "resting") nextAvailableAt = toIso(row.next_at);
    blockers.push({ reason: row.reason as DeckBlocker["reason"], count });
  }

  blockers.sort((a, b) => b.count - a.count);
  return { total, blockers, nextAvailableAt };
}

/**
 * Hämtar allt cockpiten behöver om ett redan leasat block: fakta, kontakter,
 * historik, växelminne, dossier och färdigupplösta manus.
 *
 * Bruten ur `leaseNextLeads` när `leaseSpecificLead` tillkom. De två tar leads
 * på helt olika sätt — den ena ur rotationen, den andra på namn — men det
 * cockpiten renderar måste vara identiskt, annars hade ett uppslaget bolag
 * saknat exempelvis historiken och skillnaden bara synts som en tom panel.
 *
 * `listId` styr bara manusvalet: mappen kan ha ett eget manus som ersätter det
 * allmänna för sina steg. Den ska vara samma mapp som cockpiten säger sig köra
 * i, annars läser säljaren ett manus som hör till en annan lista än rubriken.
 * `null` — ett bolag utan ringlista säljaren kommer åt — ger de allmänna.
 */
async function hydrateLeads(
  ids: string[],
  user: { name: string },
  listId: string | null = null
) {
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
      /// Bolagets ålder. Öppningen "ni startade ju 2023" kräver att året står
      /// på skärmen — hämtas det inte här finns kolumnen bara i databasen.
      registeredAt: true,
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
  //
  // listId följer med: har mappen ett eget manus för ett steg ersätter det det
  // allmänna. Utan mapp (ett bolag öppnat direkt i dialern) gäller bara de
  // allmänna — se getActiveScripts.
  const scripts = await getActiveScripts(listId);

  return leads.map((lead) => ({
    ...lead,
    scripts: scripts.map((s) => ({
      templateId: s.templateId,
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

/**
 * Lämnar tillbaka leads som inte hanns med, så de blir ringbara direkt igen.
 *
 * `leasedById = ?` gör satsen ofarlig att skicka för mycket till: id:n jag inte
 * håller matchar ingenting. Cockpiten utnyttjar det och skickar hela kön när
 * passet tar slut i stället för att försöka räkna ut vilka som är kvar — den
 * uträkningen var precis det som gick fel och lämnade passerade bolag låsta.
 *
 * Kön växer med varje påfyllning och är över hundra id:n mot slutet av ett
 * pass, så satsen körs i block: ett `IN` med ett obundet antal parametrar är
 * ett tak som förr eller senare nås, och då hade releasen fallit helt.
 */
const RELEASE_CHUNK = 200;

export async function releaseLeases(leadIds: string[]) {
  const user = await requireAuth();
  const ids = Array.from(new Set(leadIds));
  if (ids.length === 0) return { released: 0 };

  let released = 0;
  for (let i = 0; i < ids.length; i += RELEASE_CHUNK) {
    const res = await db.lead.updateMany({
      where: { id: { in: ids.slice(i, i + RELEASE_CHUNK) }, leasedById: user.id },
      data: { leasedById: null, leasedUntil: null },
    });
    released += res.count;
  }
  return { released };
}

/** Ett bolag som försvunnit ur kön för att någon annan hunnit ta det. */
export type LostLease = { id: string; holder: string | null };

/**
 * Hur länge en loggad överlämning räknas som samma händelse.
 *
 * Bolaget säljaren står på just nu plockas aldrig ur kön — det står kvar med
 * ett rött band tills samtalet är dispositionerat — och skickas därför in i
 * varje förnyelse så länge passet pågår. En timme täcker det utan att dölja en
 * ny krock på samma bolag senare under dagen.
 */
const LEASE_LOSS_WINDOW_MS = 60 * 60_000;

/**
 * Skriver en rad i aktivitetsloggen när ett bolag byter händer mitt i ett pass.
 *
 * Förnyelsen vet exakt när det sker men skrev ingenting, så frågan "händer det
 * fortfarande?" gick bara att svara på med ett resonemang. Nu är den en SELECT
 * mot loggen — och raden ligger dessutom på bolaget, där nästa säljare som
 * undrar varför kunden fick två samtal samma dag faktiskt tittar.
 *
 * **Bara bolag som en annan säljare nu håller loggas.** Ett förlorat id utan
 * innehavare är ingen krock: det är mitt eget lås som `recordAttempt` eller
 * `releaseLeases` släppt, med en förnyelse som hann emellan.
 *
 * Loggen får aldrig fälla förnyelsen — kön är viktigare än mätningen — men den
 * skrivs klart innan svaret går ut. En `void`-promise efter att svaret lämnat
 * en serverless-funktion är inte garanterad att köras, och en mätpunkt som
 * ibland tappar rader går inte att räkna på.
 */
async function logLeaseLosses(
  actorId: string,
  lostIds: string[],
  holderByLead: Map<string, string | null>,
  nameById: Map<string, string>
) {
  const collisions = lostIds
    .map((id) => ({ id, holderId: holderByLead.get(id) ?? null }))
    .filter((c): c is { id: string; holderId: string } => !!c.holderId && c.holderId !== actorId);
  if (collisions.length === 0) return;

  try {
    const already = await db.activity.findMany({
      where: {
        type: "LEAD_LEASE_LOST",
        actorId,
        leadId: { in: collisions.map((c) => c.id) },
        timestamp: { gte: new Date(Date.now() - LEASE_LOSS_WINDOW_MS) },
      },
      select: { leadId: true, metadata: true },
    });

    // Nyckeln är bolag + övertagare: samma bolag som går till en annan kollega
    // en stund senare är en ny händelse, inte ett eko av den förra.
    const seen = new Set(
      already.map((a) => {
        let takenById: unknown = null;
        try {
          takenById = (JSON.parse(a.metadata ?? "{}") as { takenById?: unknown }).takenById;
        } catch {
          /* trasig metadata räknas som "inte loggad" — hellre en rad för mycket */
        }
        return `${a.leadId}:${typeof takenById === "string" ? takenById : ""}`;
      })
    );

    const fresh = collisions.filter((c) => !seen.has(`${c.id}:${c.holderId}`));
    if (fresh.length === 0) return;

    await db.activity.createMany({
      data: fresh.map((c) => ({
        type: "LEAD_LEASE_LOST" as const,
        actorId,
        leadId: c.id,
        metadata: JSON.stringify({
          takenById: c.holderId,
          takenByName: nameById.get(c.holderId) ?? null,
        }),
      })),
    });
  } catch {
    /* mätningen är aldrig värd ett trasigt pass */
  }
}

/**
 * Förnyar arbetslåset på de bolag som fortfarande ligger oringda i cockpitens kö.
 *
 * Leasen är en parkering med tidsgräns, inte ett evigt lås: `leasedUntil` finns
 * för att en kraschad flik inte ska binda upp ett helt block för alltid. Men
 * blocket räcker mycket längre än leasen — 25 bolag är över en timmes samtal på
 * en parkering som dör efter en kvart — så kön måste förnyas medan säljaren
 * arbetar sig igenom den.
 *
 * Fram till 2026-08-17 gjordes ingen förnyelse alls. Intervallet i cockpiten
 * hette "förnya innan leasen går ut" men anropade `refill`, som bara leasar NYA
 * bolag och aldrig rör dem som redan ligger i kön. Svansen låg alltså olåst
 * efter en kvart medan den fortfarande stod i säljarens webbläsare, och nästa
 * säljare som startade ett pass fick samma bolag serverat av rotationen. Två
 * säljare ringde samma företag — precis det parkeringen finns för att hindra.
 *
 * **`leasedById = ?` i WHERE är hela poängen.** Satsen förlänger bara rader jag
 * fortfarande äger. Har en kollega redan tagit ett bolag — för att min lease
 * hann gå ut medan datorn låg och sov — matchar raden inte, och id:t kommer
 * tillbaka som förlorat i stället för att skrivas över. Förnyelsen kan därför
 * aldrig stjäla tillbaka ett bolag från någon som sitter i samtalet, och kön i
 * webbläsaren kan aldrig innehålla ett bolag som någon annan äger.
 */
export async function renewLeases(leadIds: string[]) {
  const user = await requireAuth();
  // Kön är ett block på 25; taket finns bara för att en trasig klient inte ska
  // kunna skicka in tusen id:n och spränga SQLites parametergräns.
  const ids = Array.from(new Set(leadIds)).slice(0, 200);
  if (ids.length === 0) return { held: [] as string[], lost: [] as LostLease[] };

  const cfg = await getDialerConfig();
  const leaseIso = new Date(Date.now() + cfg.leaseMinutes * 60_000).toISOString();

  // $queryRawUnsafe — inte $executeRawUnsafe: den senare kastar bort RETURNING,
  // och det är just skillnaden mellan behållna och förlorade rader vi är ute
  // efter. Samma skäl som i `leaseNextLeads`.
  const rows = await db.$queryRawUnsafe<{ id: string }[]>(
    `UPDATE "Lead"
        SET "leasedUntil" = ?
      WHERE "id" IN (${ids.map(() => "?").join(",")})
        AND "leasedById" = ?
      RETURNING "id"`,
    leaseIso,
    ...ids,
    user.id
  );

  const held = new Set(rows.map((r) => r.id));
  const lostIds = ids.filter((id) => !held.has(id));
  if (lostIds.length === 0) return { held: Array.from(held), lost: [] as LostLease[] };

  // Namnet på den som tog över hämtas bara när något faktiskt gått förlorat.
  // `leasedById` är en naken kolumn utan relation, så användaren slås upp
  // separat — samma väg som `leaseSpecificLead` går.
  const takenRows = await db.lead.findMany({
    where: { id: { in: lostIds } },
    select: { id: true, leasedById: true },
  });
  const holderIds = Array.from(
    new Set(takenRows.map((r) => r.leasedById).filter(Boolean))
  ) as string[];
  const holders = holderIds.length
    ? await db.user.findMany({ where: { id: { in: holderIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map<string, string>(holders.map((h) => [h.id, h.name] as const));
  const holderByLead = new Map<string, string | null>(
    takenRows.map((r) => [r.id, r.leasedById] as const)
  );

  await logLeaseLosses(user.id, lostIds, holderByLead, nameById);

  return {
    held: Array.from(held),
    // `holder = null` betyder EXAKT en sak: ingen annan håller bolaget, alltså
    // var det mitt eget lås som släppts (av `recordAttempt`, av att säljaren
    // passerade bolaget, eller av att leasen gick ut utan att någon tog över).
    // Klienten skiljer på de två fallen och yankar bara riktiga krockar, så
    // namnuppslagningen får inte kunna göra en krock innehavarlös — därav
    // fallbacken i stället för `?? null`.
    lost: lostIds.map((id) => {
      const holderId = holderByLead.get(id);
      return { id, holder: holderId ? nameById.get(holderId) ?? "En kollega" : null };
    }),
  };
}

// ── Öppna ett utpekat bolag i cockpiten ────────────────────────────────────

/** En sak säljaren bör veta innan hen slår numret. */
export type OpenWarning = { tone: "warn" | "danger"; text: string };

/**
 * Reserverar EXAKT det bolag någon pekat ut — vägen in från sökningen.
 *
 * `leaseNextLeads` svarar på "vilket bolag står på tur". Den här gör tvärtom:
 * den tar bolaget säljaren skrev namnet på och struntar i däckets filter. Det
 * är avsiktligt. Filtren finns för att avgöra vad rotationen ska servera — en
 * fråga ingen ställde när någon sökte upp ett namn och tryckte "Öppna i
 * dialer". Att då svara "nej, det ligger utanför däcket" vore att låtsas att
 * rotationen vet bättre än personen som redan har kunden på tråden.
 *
 * Ett enda undantag: det korta arbetslåset. Ligger bolaget i en kollegas
 * leasade block just nu sitter hen sannolikt i samtalet, och två säljare på
 * samma nummer är precis vad låset finns för. Då öppnas det inte.
 *
 * Allt annat — spärrat, aktiv affär, öppen återkomst, spärrlista, maxade
 * försök — släpps igenom med en varning i stället. Notera särskilt återkomsten:
 * den ligger utanför däcket och ska ringas via notisklockan, men den som
 * medvetet söker upp bolaget får se löftet och vem som gav det, inte en stängd
 * dörr utan förklaring.
 */
export async function leaseSpecificLead(leadId: string) {
  const user = await requireLeadAccess(leadId);

  const info = await db.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      companyName: true,
      retired: true,
      retiredReason: true,
      orgNumber: true,
      hasActiveDeal: true,
      attemptCount: true,
      claimedAt: true,
      ownerId: true,
      leasedById: true,
      leasedUntil: true,
      lastOutcome: true,
      lastNoReason: true,
      lastAttemptAt: true,
      nextActionAt: true,
      owner: { select: { name: true } },
      lists: { select: { list: { select: { id: true, name: true } } } },
      callbacks: {
        where: { status: "PENDING" },
        orderBy: { scheduledAt: "asc" },
        take: 1,
        select: { scheduledAt: true, sellerId: true, seller: { select: { name: true } } },
      },
      dnc: { select: { expiresAt: true, reason: true } },
      _count: { select: { contacts: true } },
    },
  });

  if (!info) {
    return { ok: false as const, reason: "notFound" as const, message: "Bolaget finns inte längre." };
  }

  const now = new Date();
  const cfg = await getDialerConfig();

  // Kollegans arbetslås. `leasedUntil` i dåtid är ett utlöpt lås, inte ett lås.
  if (info.leasedById && info.leasedById !== user.id && info.leasedUntil && info.leasedUntil > now) {
    const holder = await db.user.findUnique({
      where: { id: info.leasedById },
      select: { name: true },
    });
    return {
      ok: false as const,
      reason: "leased" as const,
      message: `${holder?.name ?? "En kollega"} har ${info.companyName} reserverat till ${formatTime(info.leasedUntil)}.`,
    };
  }

  // Samma dubbelkoll som i däckets sats: det yttre villkoret upprepar det vi
  // just läste, så en kollega som hinner emellan vinner i stället för att bli
  // överskriven.
  const taken = await db.$queryRawUnsafe<{ id: string }[]>(
    `UPDATE "Lead"
        SET "leasedById" = ?, "leasedUntil" = ?
      WHERE "id" = ?
        AND ("leasedUntil" IS NULL OR "leasedUntil" < ? OR "leasedById" = ?)
      RETURNING "id"`,
    user.id,
    new Date(now.getTime() + cfg.leaseMinutes * 60_000).toISOString(),
    leadId,
    now.toISOString(),
    user.id
  );
  if (taken.length === 0) {
    return {
      ok: false as const,
      reason: "leased" as const,
      message: `En kollega hann före och har ${info.companyName} uppe just nu.`,
    };
  }

  const warnings: OpenWarning[] = [];

  if (info.retired) {
    warnings.push({
      tone: "danger",
      text: info.retiredReason ? `Spärrat: ${info.retiredReason}` : "Bolaget är spärrat",
    });
  }
  // Relationen träffar bara spärrar nycklade på det HÄR leadet. En spärr som
  // satts före en omimport pekar på ett id som inte finns längre och hittas
  // bara via org-numret — samma andra led som däckets filter har.
  const blocked =
    info.dnc && (info.dnc.expiresAt === null || info.dnc.expiresAt > now)
      ? info.dnc
      : info.orgNumber
        ? await db.doNotCall.findFirst({
            where: {
              orgNumber: info.orgNumber,
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            select: { reason: true },
          })
        : null;
  if (blocked) {
    warnings.push({
      tone: "danger",
      text: blocked.reason ? `Spärrlista: ${blocked.reason}` : "Står på spärrlistan",
    });
  }
  if (info._count.contacts === 0) {
    warnings.push({ tone: "danger", text: "Bolaget har ingen kontakt med telefonnummer" });
  }
  const promise = info.callbacks[0];
  if (promise) {
    // Vägen hit går numera ofta genom notisklockan, alltså genom sitt eget
    // löfte. "Zen lovade återkomma" om sig själv läser man som en varning om
    // någon annan; första person säger samma sak utan att låta som ett fel.
    warnings.push({
      tone: "warn",
      text:
        promise.sellerId === user.id
          ? `Du lovade återkomma ${formatWhen(promise.scheduledAt, now)}`
          : `${promise.seller.name} lovade återkomma ${formatWhen(promise.scheduledAt, now)}`,
    });
  }
  if (info.hasActiveDeal) {
    warnings.push({ tone: "warn", text: "Bolaget är redan kund — det finns en aktiv affär" });
  }
  if (info.attemptCount >= cfg.maxAttempts) {
    warnings.push({
      tone: "warn",
      text: `${info.attemptCount} försök gjorda — taket är ${cfg.maxAttempts}`,
    });
  }
  if (info.claimedAt && info.claimedAt > claimCutoff(now) && info.ownerId !== user.id) {
    warnings.push({ tone: "warn", text: `${info.owner.name} jobbar bolaget` });
  }
  // Bolaget har tackat nej och vilar fortfarande.
  //
  // Rotationen delar aldrig ut ett sådant bolag — men den här funktionen
  // struntar med flit i däckets filter, så ⌘K, sökträffen på Ringlistor och
  // knappen på `/leads/[id]` går rakt förbi 60-dagarsvilan. Utan raden nedan
  // är det den enda kvarvarande vägen till samtalet golvet klagade på: kunden
  // som sa nej och blev uppringd igen. Den ska vara öppen — ibland finns ett
  // skäl — men den ska aldrig vara omärkt.
  //
  // `danger`, inte `warn`: ett nej är ett besked från kunden, inte ett
  // administrativt tillstånd som "taket är nått".
  if (
    info.lastOutcome === "DM_NO" &&
    info.nextActionAt &&
    info.nextActionAt > now &&
    info.lastAttemptAt
  ) {
    const reason = info.lastNoReason
      ? REASON_OPTIONS.find((r) => r.value === info.lastNoReason)?.label ?? null
      : null;
    warnings.push({
      tone: "danger",
      text: `Sa nej ${formatWhen(info.lastAttemptAt, now)}${reason ? ` — ${reason}` : ""}. Vilar till ${formatDate(info.nextActionAt)}`,
    });
  }

  // Cockpiten körs i en mapps kontext. Ligger bolaget i flera tas den första
  // säljaren faktiskt kommer åt — en mapp hen saknar behörighet till hade
  // fått påfyllningen att kasta direkt efter första samtalet.
  //
  // Måste avgöras FÖRE hydreringen: mappen bestämmer vilket manus som gäller,
  // och ett bolag som öppnas i en mapp med eget manus ska få det manuset — inte
  // det allmänna bara för att vägen in var ⌘K i stället för däcket.
  let list: { id: string; name: string } | null = null;
  for (const entry of info.lists) {
    if (await canAccessList(user, entry.list.id)) {
      list = entry.list;
      break;
    }
  }

  const [lead] = await hydrateLeads([leadId], user, list?.id ?? null);
  if (!lead) {
    return { ok: false as const, reason: "notFound" as const, message: "Bolaget finns inte längre." };
  }

  return {
    ok: true as const,
    lead,
    listId: list?.id ?? null,
    listName: list?.name ?? null,
    warnings,
  };
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
      select: {
        attemptCount: true,
        noAnswerStreak: true,
        triedSlotsJson: true,
        orgNumber: true,
      },
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
      // Svensk väggklocka, inte serverns. Vercel kör i UTC, och fram till
      // 2026-08-15 skrevs båda kolumnerna med getHours()/getDay() — alla 1 106
      // rader som fanns då bär UTC-timmen och är två timmar fel sommartid.
      // Rättade i efterhand ur startedAt av backfill-hour-weekday.mjs.
      hourOfDay: hourOfDay(now),
      weekday: weekdayOf(now),
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
        // Utfallet speglas hit av samma skäl som resultatet: nej-vilan måste
        // gå att räkna om utan att gå till CallAttempt-historiken, och
        // cockpiten måste kunna varna för ett tidigare nej utan en join.
        lastOutcome: input.outcome ?? null,
        lastNoReason: input.noReason ?? null,
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
    const resultLabel = RESULT_LABELS[input.result] ?? input.result;
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
  // Fyra regler i stället:
  //
  //   1. **Mitt samtal stänger mina förfallna löften — men bara om någon
  //      svarade.** Se regel 4.
  //   2. **Bokar jag en ny stänger den mina övriga på bolaget**, oavsett tid.
  //      Två öppna löften på samma bolag är alltid ett fel.
  //   3. **Ett terminalt utfall stänger allas.** Sålt, fel nummer eller
  //      ogiltigt nummer — det finns inget kvar att ringa om, och en rad som
  //      låg kvar hade skickat en säljare till ett bolag som är ur spel.
  //   4. **Svarade ingen är löftet inte infriat.** Det flyttas fram i stället
  //      för att stängas.
  //
  // Kvar står: en kollegas samtal rör inte mitt löfte, och ett samtal före
  // utsatt tid rör inte ett löfte som fortfarande ligger i framtiden.
  //
  // ## Regel 4 — varför den fanns inte, och vad det kostade (rättat 2026-09-01)
  //
  // Regel 1 stod tidigare utan förbehåll: "tiden var inne och jag ringde —
  // det är exakt vad raden bad om." Men *ringde* är inte *nådde fram*. Ett
  // `NO_ANSWER` på en förfallen återkomst stängde löftet som COMPLETED, och
  // därifrån föll bolaget rakt ut i golvet:
  //
  //   - Raden blev COMPLETED och försvann ur klockan — och ur chefsvyn.
  //     Löftesgivaren hade ingenting kvar som påminde om att ringa igen.
  //   - `claimsLead(null)` är falsk, så `claimedAt` nollades i samma skrivning.
  //     Låset som skyddade det personliga löftet försvann med löftet.
  //   - Däckets återkomstvillkor (`NOT EXISTS … status='PENDING'`) släppte
  //     bolaget fritt, och `nextActionAt` sattes till `retryHoursNoAnswer` —
  //     tjugo timmar.
  //
  // Nettot: en kund som bett en namngiven säljare ringa tillbaka låg dagen
  // efter i hela golvets däck, utan lås, utan löfte och utan spår i
  // återkomstlistan. Precis det golvet rapporterade: *"en säljare har tryckt
  // in ring igen och sen har en annan säljare fått upp det, och jag hittar
  // inte kunden på golvets återkomster."*
  //
  // Mätt i produktionsdatan 2026-09-01: av 196 stängda återkomster stängdes
  // **36 av ett samtal där ingen svarade** — 35 `NO_ANSWER` och en som fastnade
  // i växeln. Alla 36 låg med `claimedAt = NULL` och en `nextActionAt` ett
  // dygn senare, alltså tillbaka i den gemensamma rotationen.
  //
  // Löftet flyttas nu fram till `nextActionAt` i stället: samma tidpunkt som
  // leadet ändå skulle ringts, men raden förblir PENDING och bunden till den
  // som lovade. Bolaget stannar utanför däcket, ligger kvar i klockan, och
  // `emailSentAt`/`seenAt` nollställs så att påminnelsen gäller den nya tiden
  // — samma nollställning som `rescheduleCallback` gör.
  //
  // Ett löfte lämnar alltså fortfarande klockan på exakt två sätt: det ringdes
  // *och någon svarade*, eller det avbokades. Ett signal i luren är ingen av
  // dem.
  //
  // Ordningen är avgörande: stäng gamla FÖRE den nya skapas, annars stänger
  // satsen omedelbart den återkomst som just bokades.
  //
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

  /** Löftena det här samtalet svarar på — de som ska stängas eller flyttas. */
  const touchedPromises: Prisma.CallbackWhereInput = decision.retired
    ? { leadId: input.leadId, status: "PENDING" }
    : {
        leadId: input.leadId,
        status: "PENDING",
        OR: [
          // Den utpekade raden.
          ...(answeredId ? [{ id: answeredId }] : []),
          // Mina egna som förfallit. Ringer jag bolaget efter att tiden gått
          // ut är det mitt löfte jag svarar på, även om jag kom in via däcket.
          {
            sellerId: user.id,
            ...(decision.callbackAt ? {} : { scheduledAt: { lte: now } }),
          },
        ],
      };

  /**
   * Står löftet kvar efter det här samtalet?
   *
   * Bara när ingen svarade OCH ingen ny tid bokats OCH leadet inte
   * pensionerats. Bokas en ny tid ersätter den den gamla (regel 2); ett
   * terminalt utfall stänger allt (regel 3); svarade någon är löftet infriat
   * (regel 1).
   */
  const keepPromise =
    !decision.retired && !decision.callbackAt && !isConnected(input.result);

  if (keepPromise) {
    // Ingen svarade. Samma rader som annars hade stängts flyttas fram till den
    // tid leadet ändå ska ringas — löftet är inte infriat, bara oringt.
    //
    // `nextActionAt` är null bara för terminala utfall och de är undantagna
    // ovan, men fallbacken står kvar: hellre en timme fram än en rad som
    // ligger kvar förfallen för alltid om beslutet någon gång ändras.
    const pushTo =
      decision.nextActionAt ?? new Date(now.getTime() + 3600_000);
    writes.push(
      db.callback.updateMany({
        where: touchedPromises,
        data: {
          scheduledAt: pushTo,
          // Ny tid, ny påminnelse och ny kvittering — annars kommer mejlet
          // aldrig för den framflyttade tiden och raden ser redan sedd ut.
          emailSentAt: null,
          seenAt: null,
        },
      })
    );
  } else {
    writes.push(
      db.callback.updateMany({
        where: touchedPromises,
        data: {
          status: "COMPLETED",
          completedAt: now,
          completedOnAttemptId: attempt.id,
        },
      })
    );
  }

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

  // Bortfall: bolaget ur registret för gott.
  //
  // Efter transaktionen och inte i den. `terminalReason` har redan pensionerat
  // leadet i samma skrivning som samtalet, så bolaget är ute ur rotationen
  // oavsett hur det går här — spärrlistan är skyddet som gäller EFTER en
  // omimport, inte det som stoppar nästa samtal idag. Att fälla ett registrerat
  // samtal på att en spärrad rad inte gick att skriva vore fel prioritering.
  if (input.result === "BORTFALL") {
    await blockLead({
      leadId: input.leadId,
      userId: user.id,
      reason: input.note?.trim() || "Bortfall — bolaget vill inte bli kontaktat",
      dialedE164: input.dialedE164,
      orgNumber: lead.orgNumber,
    });
  }

  // `Lead.callbackAt` är ett eko av den öppna raden, inte sanningen. Sedan
  // samtalet slutade stänga andras löften kan det finnas en öppen återkomst
  // kvar som dispositionen inte kände till — kollegans, eller min egen som
  // ligger i framtiden. Skrev vi då `callbackAt = null` skulle bolaget serveras
  // enligt rotationen i stället för på den lovade tiden, och löftet vore kvar
  // i klockan men borta ur däcket.
  //
  // Låset följer med löftet, åt båda hållen. `claimedAt` nollställdes i
  // transaktionen ovan eftersom `claimsLead` bara känner till utfallet — den
  // vet inte att en öppen återkomst finns kvar. Står ett löfte kvar ska
  // bolaget vara låst till den som gav det, oavsett vad det här samtalet
  // slutade i och oavsett vem som ringde det.
  //
  // Det är samma regel som `syncLeadFromCallbacks` i callbacks.ts tillämpar
  // åt andra hållet: försvinner sista löftet försvinner låset. Utan den här
  // halvan gällde den bara vid avbokning, och ett framflyttat löfte (regel 4
  // ovan) hade legat kvar utan lås — skyddat av däckets återkomstvillkor, men
  // osynligt som "någons bolag" i mappvyn, på lead-sidan och i varningen från
  // `leaseSpecificLead`.
  if (!decision.callbackAt && !decision.retired) {
    const remaining = await db.callback.findFirst({
      where: { leadId: input.leadId, status: "PENDING" },
      orderBy: { scheduledAt: "asc" },
      select: { scheduledAt: true, sellerId: true },
    });
    if (remaining) {
      await db.lead.update({
        where: { id: input.leadId },
        data: {
          callbackAt: remaining.scheduledAt,
          nextActionAt: remaining.scheduledAt,
          // Löftesgivaren, inte den som råkade ringa. Ringde en kollega in i
          // bolaget via sökningen ska det fortfarande vara löftesgivarens.
          ownerId: remaining.sellerId,
          claimedAt: now,
        },
      });
    }
  }

  if (input.gatekeeper) {
    await upsertGatekeeper(input.leadId, input.gatekeeper);
  }

  // ── Växelsamtalet som väntar på sitt utfall ──────────────────────────────
  //
  // Lynes rapporterar när luren läggs på, säljaren dispositionerar sekunderna
  // efter. Webhooken kommer alltså nästan alltid FÖRST och hittar då ingen
  // registrering att koppla till — 368 av 471 samtal den 14 augusti låg kvar
  // okopplade av precis det skälet.
  //
  // Här stängs cirkeln från andra hållet. Efter transaktionen med flit: en
  // koppling som fallerar får kosta en samtalslängd, aldrig ett samtal.
  const match = await findPendingCall({
    sellerId: user.id,
    leadId: input.leadId,
    dialedE164: input.dialedE164 ?? null,
    at: now,
  });
  if (match) {
    await linkAttemptToCall({
      attemptId: attempt.id,
      attemptDurationSec: Math.max(0, Math.trunc(input.durationSec ?? 0)),
      match,
    });
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
