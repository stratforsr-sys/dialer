"use server";

import { db } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import {
  claimCutoff,
  claimedByWhere,
  freeLeadWhere,
  isAdminUser,
  visibleLeadWhere,
} from "@/lib/lists";
import { SYSTEM_USER_EMAIL } from "@/lib/system-user";
import { utfallAv, UTFALL_ORDNING, UTFALL, type UtfallKey } from "@/lib/utfall";
import type { CallResult, ConversationOutcome } from "@/generated/prisma/client";

export type ListSummary = Awaited<ReturnType<typeof getLists>>[number];
export type ListDetail = NonNullable<Awaited<ReturnType<typeof getList>>>;

// ── Queries ────────────────────────────────────────────────────────────────

/**
 * Alla mappar användaren har tillgång till, med räknare för framsteg.
 *
 * ## Framsteg är RINGDA, inte låsta (rättat 2026-09-15)
 *
 * Fram till dess räknades `workedLeads` och `freeLeads` på `Lead.claimedAt`,
 * och stapeln i `ListsBoard` ritades som `(total − free) / total`. Men
 * `claimedAt` är inte "bearbetad" — det är ett ÄGARLÅS, och `recordAttempt`
 * nollar det på varje disposition utom två:
 *
 *     claimedAt: decision.claimsLead ? now : null   // CALLBACK_BOOKED | SOLD
 *
 * Ett "svarar ej", ett "sa nej", ett "fel nummer" släpper alltså låset. Taket
 * för stapeln var därmed andelen öppna återkomster plus kunder, oavsett hur
 * mycket som ringts. Mätt i produktionen 2026-09-15:
 *
 *   6 242  leads har ringts minst en gång
 *     440  av dem bar ett lås — resten räknades som "lediga"
 *     384  öppna återkomster + 10 kunder ≈ hela låsbeståndet
 *
 *   Clicknet Lista 1        5 666 leads:  visade 3 %,  faktiskt ringda 47 %
 *   hantverkare_5000_alla   3 749 leads:  visade 4 %,  faktiskt ringda 61 %
 *   Endast Städföretag      1 151 leads:  visade 7 %,  faktiskt ringda 80 %
 *   leads_bygg_hantverk       599 leads:  visade 8 %,  faktiskt ringda 100 %
 *
 * Nyckeln är `lastAttemptAt IS NOT NULL` och inte `attemptCount > 0`: taket i
 * `computeNext` nollställer `attemptCount` när ett varv är slut, så den
 * kolumnen glömmer arbete som faktiskt gjorts. Skillnaden var 133 leads i
 * Clicknet Lista 1 samma dag. `lastAttemptAt` nollställs aldrig.
 *
 * Låsräkningen finns kvar som `claimedLeads` — den svarar på "hur många håller
 * någon just nu", vilket är en riktig fråga. Den får bara inte vara stapeln.
 *
 * ## En fråga, inte tre
 *
 * Aggregaten körs som EN rå sats i stället för tre `groupBy`. Turso läser
 * ~3 400 rader/sekund kall och `LeadOnList` är 22 000 rader — tre svep är tre
 * gånger notan för samma svar. Alla tre villkoren är kolumner på `Lead`, så
 * ett svep räcker.
 *
 * ## Utfallen räknas i TS, inte i SQL
 *
 * Satsen grupperar på RÅVÄRDENA (`lastOutcome`, `lastResult`, ringd ja/nej) och
 * låter `utfallAv` i `lib/utfall.ts` göra hinkindelningen efteråt. Det ser ut
 * som en omväg — ett `SUM(CASE WHEN ...)` per hink hade gett svaret direkt —
 * men då hade regeln för vad som är "sa nej" funnits på två ställen, i SQL här
 * och i TS i mappvyn, och de hade glidit isär. Det är exakt felet
 * `deck-state.ts` finns för att inte upprepa.
 *
 * Kardinaliteten är ofarlig: gruppnyckeln är (mapp × 8 outcome × 9 result ×
 * ringd × ur rotation × låst), men bara kombinationer som finns i datan blir
 * rader — i produktionen ~25 rader per mapp.
 */
export async function getLists() {
  const user = await requireAuth();

  // Åtkomstfiltret som villkor i stället för en separat id-hämtning: sparar
  // en round-trip, och databasen är ändå snabbare på joinen än vi är på att
  // skicka en lista med id:n fram och tillbaka.
  const lists = await db.callList.findMany({
    where: {
      archived: false,
      ...(isAdminUser(user) ? {} : { access: { some: { userId: user.id } } }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true } },
      access: { include: { user: { select: { id: true, name: true, email: true } } } },
      _count: { select: { leads: true } },
    },
  });

  if (lists.length === 0) return [];

  const listIds = lists.map((l) => l.id);

  // Placeholders i stället för interpolerade id:n — `$queryRawUnsafe` utan
  // bindning hade varit en injektionsväg även om id:na kommer från vår egen
  // fråga ovan.
  const placeholders = listIds.map(() => "?").join(",");

  // `retired` och `hasActiveDeal` är de två tillstånd som betyder "ur
  // rotationen för gott" och är kolumner på `Lead` — inga subfrågor, ett svep.
  // Spärrlistan räknas INTE in här: den matchar på org-nummer också och kräver
  // en korrelerad subfråga per rad. Mappvyn (`getList` + `deckState`) är
  // fortfarande den som svarar exakt; brädet svarar snabbt.
  const stats = await db.$queryRawUnsafe<
    {
      listId: string;
      ringd: number | bigint;
      lastResult: CallResult | null;
      lastOutcome: ConversationOutcome | null;
      retired: number | bigint;
      claimed: number | bigint;
      n: number | bigint;
    }[]
  >(
    `SELECT lol."listId" AS "listId",
            CASE WHEN l."lastAttemptAt" IS NOT NULL THEN 1 ELSE 0 END AS "ringd",
            l."lastResult"  AS "lastResult",
            l."lastOutcome" AS "lastOutcome",
            CASE WHEN l."retired" = 1 OR l."hasActiveDeal" = 1 THEN 1 ELSE 0 END AS "retired",
            CASE WHEN l."claimedAt" IS NOT NULL AND l."claimedAt" >= ? THEN 1 ELSE 0 END AS "claimed",
            COUNT(*) AS "n"
     FROM "LeadOnList" lol
     JOIN "Lead" l ON l."id" = lol."leadId"
     WHERE lol."listId" IN (${placeholders})
     GROUP BY lol."listId", "ringd", l."lastResult", l."lastOutcome", "retired", "claimed"`,
    claimCutoff().toISOString(),
    ...listIds
  );

  /** Ihopräknat per mapp. Hinkarna fylls av `utfallAv` — se kommentaren ovan. */
  type Aggregat = {
    called: number;
    retired: number;
    claimed: number;
    utfall: Map<UtfallKey, number>;
  };
  const byList = new Map<string, Aggregat>();

  for (const r of stats) {
    let a = byList.get(r.listId);
    if (!a) {
      a = { called: 0, retired: 0, claimed: 0, utfall: new Map() };
      byList.set(r.listId, a);
    }
    const n = Number(r.n);

    // `lastAttemptAt` bärs bara som ja/nej hit — `utfallAv` bryr sig om att den
    // FINNS, inte om när. Ett datum i gruppnyckeln hade gett en rad per lead.
    const def = utfallAv({
      lastAttemptAt: Number(r.ringd) === 1 ? new Date(0) : null,
      lastResult: r.lastResult,
      lastOutcome: r.lastOutcome,
    });

    a.utfall.set(def.key, (a.utfall.get(def.key) ?? 0) + n);
    if (def.called) a.called += n;
    if (Number(r.retired) === 1) a.retired += n;
    if (Number(r.claimed) === 1) a.claimed += n;
  }

  return lists.map((l) => {
    const a = byList.get(l.id);
    const total = l._count.leads;
    const calledLeads = a?.called ?? 0;
    return {
      id: l.id,
      name: l.name,
      description: l.description,
      sourceFile: l.sourceFile,
      isSystem: l.isSystem,
      createdAt: l.createdAt,
      createdBy: l.createdBy,
      totalLeads: total,
      /** Ringda minst en gång. Stapeln. */
      calledLeads,
      /** Aldrig ringda — arbetet som står kvar orört i mappen. */
      untouchedLeads: Math.max(0, total - calledLeads),
      /** Pensionerade eller kunder: kommer aldrig tillbaka i rotationen. */
      retiredLeads: a?.retired ?? 0,
      /** Håller någon just nu (öppet löfte eller kund). Inte framsteg. */
      claimedLeads: a?.claimed ?? 0,
      /**
       * Vad som HÄNDE med mappens bolag, inte bara hur många som rörts.
       *
       * Räknat på bolagets senaste utfall, som följer bolaget mellan mappar —
       * inte på `CallAttempt.listId`, som pekar på mappen säljaren råkade ringa
       * ifrån. 604 av 2 389 ringda bolag i `hantverkare_5000_alla` hade sina
       * samtal bokförda på en annan mapp den 15 september 2026; på den nyckeln
       * hade stapeln varit lika fel som claim-låset var före den dagen.
       *
       * Bara hinkar som förekommer, i `UTFALL_ORDNING`.
       */
      utfall: UTFALL_ORDNING.flatMap((key) => {
        const n = a?.utfall.get(key) ?? 0;
        return n === 0 ? [] : [{ key, label: UTFALL[key].label, color: UTFALL[key].color, n }];
      }),
      members: l.access.map((a) => a.user),
    };
  });
}

/** En mapp med sina leads. Returnerar null om användaren saknar åtkomst. */
export async function getList(listId: string) {
  const user = await requireAuth();

  // Åtkomstkollen bakas in i mappfrågan (en round-trip i stället för två),
  // och leadsen hämtas samtidigt. Saknar användaren åtkomst blir list null
  // och vi kastar leadsen — de har ändå aldrig lämnat servern.
  const [list, rows, cfg, arvda] = await Promise.all([
    db.callList.findFirst({
      where: {
        id: listId,
        ...(isAdminUser(user) ? {} : { access: { some: { userId: user.id } } }),
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        access: { include: { user: { select: { id: true, name: true, email: true } } } },
        // Mappens egna manus. Bara de aktiva och publicerade räknas — ett
        // utkast syns aldrig för säljaren, och en rad som påstår att mappen
        // har ett eget manus när ingen får se det är värre än ingen rad.
        scripts: {
          where: {
            active: true,
            archived: false,
            versions: { some: { publishedAt: { not: null } } },
          },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: { id: true, step: true, name: true },
        },
      },
    }),
    db.leadOnList.findMany({
      where: { listId },
      orderBy: { addedAt: "asc" },
      include: {
        lead: {
          include: {
            owner: { select: { id: true, name: true } },
            contacts: { orderBy: { createdAt: "asc" }, take: 1 },
            _count: { select: { contacts: true } },
            // Spärrlistan. Resten av det `deckState` behöver — retired,
            // hasActiveDeal, attemptCount, callbackAt, nextActionAt,
            // lastOutcome — är skalärer och följer redan med `include`.
            dnc: { select: { expiresAt: true } },
            // Aktivitetsloggen hämtas INTE längre hit.
            //
            // Kolumnen "Senaste samtal" läste fram till 2026-09-15 en `Activity`
            // av typ CALL. Den skrivs bara när säljaren lämnat en anteckning
            // (`recordAttempt` — en rad per samtal hade lagt 150 rader per
            // säljare och dag i en logg vars enda syfte är att gå att läsa), och
            // kolumnen var därför tom för 6 324 av 6 445 ringda leads.
            //
            // `lastAttemptAt`, `lastResult`, `lastOutcome` och `lastNoReason` är
            // skalärer på `Lead` och följer redan med `include` ovan. De speglas
            // vid varje disposition och är fullständiga. Se `lib/utfall.ts`.
          },
        },
      },
    }),
    // Taket bor i DialerConfig och kan ändras utan deploy. Mappvyn måste läsa
    // det ur samma ställe som däcket, annars ritar den "taket nått" på en
    // gräns som inte längre gäller.
    db.dialerConfig.findUnique({
      where: { id: "singleton" },
      select: { maxAttempts: true },
    }),
    /**
     * Hur många av mappens bolag som bär utfall från ett samtal som ringdes
     * någon annanstans ifrån.
     *
     * Raden finns för att svaret annars ser ut som ett fel. En nyimporterad mapp
     * kan säga "994 ringda" i samma andetag som den skapades, eftersom bolagen
     * redan fanns i dialern och importen bara länkade in dem (`linkToList(…,
     * false)`). Utan den här siffran går det inte att skilja "mappen är
     * bearbetad" från "bolagen var bearbetade innan mappen fanns" — och det var
     * precis den frågan som gjorde att utfallen upplevdes som borttappade.
     *
     * `listId IS NULL OR <> ?` och inte en join mot `LeadOnList`: frågan gäller
     * var säljaren SATT, inte var bolaget ligger nu.
     */
    db.$queryRawUnsafe<{ n: number | bigint }[]>(
      `SELECT COUNT(*) AS "n" FROM "LeadOnList" lol
       WHERE lol."listId" = ?
         AND EXISTS (SELECT 1 FROM "CallAttempt" ca
                     WHERE ca."leadId" = lol."leadId"
                       AND (ca."listId" IS NULL OR ca."listId" <> lol."listId"))`,
      listId
    ),
  ]);

  if (!list) return null;

  // Spärrar som inte hänger på det här leadet.
  //
  // `dnc`-relationen matchar bara på `leadId`, men däcket filtrerar på
  // org-nummer också — en spärr satt före en omimport pekar på ett id som
  // inte finns längre. Utan den här uppslagningen hade mappen visat bolaget
  // som ringbart medan däcket vägrade servera det, och de två vyerna hade
  // sagt olika saker om samma bolag. Se regeln i CLAUDE.md.
  const orgNumbers = rows
    .filter((r) => !r.lead.dnc && r.lead.orgNumber)
    .map((r) => r.lead.orgNumber as string);

  const blockedOrgNumbers = new Set<string>();
  if (orgNumbers.length > 0) {
    const hits = await db.doNotCall.findMany({
      where: {
        orgNumber: { in: orgNumbers },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { orgNumber: true },
    });
    for (const h of hits) if (h.orgNumber) blockedOrgNumbers.add(h.orgNumber);
  }

  return {
    id: list.id,
    name: list.name,
    description: list.description,
    sourceFile: list.sourceFile,
    isSystem: list.isSystem,
    createdAt: list.createdAt,
    createdBy: list.createdBy,
    members: list.access.map((a) => a.user),
    scripts: list.scripts,
    /** Däckets tak — driver `deckState` i mappvyn. */
    maxAttempts: cfg?.maxAttempts ?? 8,
    /** Bolag vars utfall kommer från samtal ringda ur en annan mapp. Se frågan. */
    arvdaUtfall: Number(arvda[0]?.n ?? 0),
    // En spärr på org-numret syntetiseras in i `dnc` så att `deckState` inte
    // behöver veta att den finns — den ser en spärr, oavsett vilken nyckel
    // den hittades på, precis som däcket gör.
    leads: rows.map((r) =>
      !r.lead.dnc && r.lead.orgNumber && blockedOrgNumbers.has(r.lead.orgNumber)
        ? { ...r.lead, dnc: { expiresAt: null } }
        : r.lead
    ),
  };
}

/** Säljare att välja bland när admin delar ut en mapp. Gravstenskontot för
 *  raderade användare är inte en av dem — det finns bara för att bära
 *  historik och kan inte logga in. */
export async function getAssignableUsers() {
  await requireAdmin();
  return db.user.findMany({
    where: { email: { not: SYSTEM_USER_EMAIL } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true },
  });
}

// ── Mutations: mappar ──────────────────────────────────────────────────────

export async function createList(input: {
  name: string;
  description?: string;
  sourceFile?: string;
  userIds?: string[];
}) {
  const admin = await requireAdmin();
  const name = input.name.trim();
  if (!name) throw new Error("Mappen måste ha ett namn");

  const list = await db.callList.create({
    data: {
      name,
      description: input.description?.trim() || null,
      sourceFile: input.sourceFile?.trim() || null,
      createdById: admin.id,
      access: {
        create: Array.from(new Set(input.userIds ?? [])).map((userId) => ({ userId })),
      },
    },
  });

  revalidatePath("/lists");
  return list;
}

export async function renameList(listId: string, name: string) {
  await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Mappen måste ha ett namn");
  await db.callList.update({ where: { id: listId }, data: { name: trimmed } });
  revalidatePath("/lists");
  revalidatePath(`/lists/${listId}`);
}

/** SQLite har ett tak för antal parametrar i en IN-lista. */
function chunk<T>(items: T[], size = 400): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type DeleteListResult = {
  /** Leads som importen skapade och som nu är borta. */
  deletedLeads: number;
  /** Dubbletter — fanns i dialern redan innan importen, och ligger kvar. */
  keptDuplicates: number;
  /** Skapade här, men ligger även i en annan mapp och sparades därför. */
  keptInOtherLists: number;
};

/**
 * Tar bort mappen OCH de leads mappen själv skapade.
 *
 * Delningen går på LeadOnList.createdByImport, satt när importen kördes:
 *
 *   createdByImport = true   importen hittade inget bolag på org-numret och
 *                            skapade leadet → det försvinner med mappen
 *   createdByImport = false  leadet fanns redan i dialern och länkades bara in
 *                            (dubbletten) → det ligger kvar
 *
 * Undantag: ett lead som den här importen skapade men som sedan hamnat i en
 * ANNAN mapp raderas inte. Annars tömmer den här borttagningen någon annans
 * ringlista på leads de står och ringer.
 *
 * Att radera ett lead kaskaderar bort dess kontakter, aktiviteter, affärer och
 * CallAttempt-rader. Statistiken för de samtalen försvinner alltså också — det
 * är priset för att en felimporterad lista ska gå att ångra helt.
 */
export async function deleteList(listId: string): Promise<DeleteListResult> {
  await requireAdmin();
  const list = await db.callList.findUnique({
    where: { id: listId },
    select: { isSystem: true },
  });
  if (!list) throw new Error("Mappen finns inte");
  if (list.isSystem) throw new Error("Systemmappar kan inte tas bort");

  // Måste läsas FÖRE borttagningen: CallList kaskaderar bort LeadOnList-raderna,
  // och då är kopplingen som säger vad mappen skapade redan borta.
  const links = await db.leadOnList.findMany({
    where: { listId },
    select: { leadId: true, createdByImport: true },
  });

  const createdHere = links.filter((l) => l.createdByImport).map((l) => l.leadId);
  const keptDuplicates = links.length - createdHere.length;

  const shared = new Set<string>();
  for (const batch of chunk(createdHere)) {
    const elsewhere = await db.leadOnList.findMany({
      where: { leadId: { in: batch }, listId: { not: listId } },
      select: { leadId: true },
    });
    for (const l of elsewhere) shared.add(l.leadId);
  }

  const toDelete = createdHere.filter((id) => !shared.has(id));

  // Mappens egna manus arkiveras FÖRE borttagningen. Texten får inte
  // kaskadera bort — publicerade versioner ligger på CallAttempt-rader och bär
  // statistikens koppling till vad som faktiskt sades. Men de får inte heller
  // bli kvar aktiva: FK:n nollar `listId` när mappen försvinner, och ett aktivt
  // manus utan mapp gäller alla mappar. Ett kampanjmanus hade alltså plötsligt
  // mött hela golvet i det ögonblick kampanjmappen raderades.
  //
  // Arkiverade och inte bara avstängda: de hamnar mappfria i listan "Alla
  // mappar" med ett namn som pekar på en mapp som inte finns, och tre sådana
  // låg och skräpade i produktion utan att någon kunde avgöra om de skulle
  // slås på igen. I arkivet är de läsbara och går att ta fram med en knapp.
  await db.scriptTemplate.updateMany({
    where: { listId },
    data: { active: false, archived: true },
  });

  await db.callList.delete({ where: { id: listId } });
  for (const batch of chunk(toDelete)) {
    await db.lead.deleteMany({ where: { id: { in: batch } } });
  }

  revalidatePath("/lists");
  revalidatePath("/leads");
  revalidatePath("/deals");

  return { deletedLeads: toDelete.length, keptDuplicates, keptInOtherLists: shared.size };
}

// ── Mutations: åtkomst ─────────────────────────────────────────────────────

/** Sätter exakt vilka användare som har tillgång till mappen. */
export async function setListAccess(listId: string, userIds: string[]) {
  await requireAdmin();
  const unique = Array.from(new Set(userIds));

  await db.$transaction([
    db.listAccess.deleteMany({ where: { listId, userId: { notIn: unique } } }),
    ...unique.map((userId) =>
      db.listAccess.upsert({
        where: { listId_userId: { listId, userId } },
        create: { listId, userId },
        update: {},
      })
    ),
  ]);

  revalidatePath("/lists");
  revalidatePath(`/lists/${listId}`);
}

export async function grantAccess(listId: string, userId: string) {
  await requireAdmin();
  await db.listAccess.upsert({
    where: { listId_userId: { listId, userId } },
    create: { listId, userId },
    update: {},
  });
  revalidatePath(`/lists/${listId}`);
}

export async function revokeAccess(listId: string, userId: string) {
  await requireAdmin();
  await db.listAccess.deleteMany({ where: { listId, userId } });
  revalidatePath(`/lists/${listId}`);
}

// ── Mutations: claim-lås ───────────────────────────────────────────────────

export type ClaimResult =
  | { ok: true }
  | { ok: false; reason: "taken"; by: string }
  | { ok: false; reason: "forbidden" };

/**
 * Låser leadet till den som ringer. Först till kvarn — men bara om leadet är
 * ledigt (aldrig claimat, eller lås äldre än CLAIM_TTL_DAYS).
 *
 * Skrivningen är villkorad i WHERE-satsen, så två samtidiga claims kan inte
 * båda lyckas: den andra matchar noll rader.
 */
export async function claimLead(leadId: string): Promise<ClaimResult> {
  const user = await requireAuth();
  const now = new Date();

  // Detta är dialerns varmaste väg — den körs på varje loggat samtal. Därför
  // går vi rakt på den villkorade skrivningen i stället för att läsa först:
  // WHERE-satsen släpper bara igenom leads som är synliga för användaren OCH
  // lediga (eller redan hens). Lyckas den är vi klara på en round-trip.
  const claimed = await db.lead.updateMany({
    where: {
      AND: [
        { id: leadId },
        visibleLeadWhere(user),
        { OR: [freeLeadWhere(now), claimedByWhere(user.id, now)] },
      ],
    },
    data: { ownerId: user.id, claimedAt: now },
  });

  if (claimed.count > 0) {
    // Loggen behöver inte blockera svaret — säljaren ska vidare till nästa samtal
    void db.activity
      .create({
        data: {
          type: "LEAD_CLAIMED",
          actorId: user.id,
          leadId,
          metadata: JSON.stringify({ claimedAt: now.toISOString() }),
        },
      })
      .catch(() => {});

    revalidatePath("/lists");
    revalidatePath("/leads");
    return { ok: true };
  }

  // Skrivningen tog inte — ta reda på varför först nu, i det ovanliga fallet
  const lead = await db.lead.findFirst({
    where: { AND: [{ id: leadId }, visibleLeadWhere(user)] },
    select: { ownerId: true, claimedAt: true, owner: { select: { name: true } } },
  });

  if (!lead) return { ok: false, reason: "forbidden" };
  return { ok: false, reason: "taken", by: lead.owner?.name ?? "annan säljare" };
}

/** Släpper ett lead tillbaka till poolen. Ägaren själv eller admin. */
export async function releaseLead(leadId: string) {
  const user = await requireAuth();

  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { ownerId: true, hasActiveDeal: true },
  });
  if (!lead) throw new Error("Leadet finns inte");

  if (!isAdminUser(user) && lead.ownerId !== user.id) {
    throw new Error("Du kan bara släppa dina egna leads");
  }
  if (lead.hasActiveDeal) {
    throw new Error("Leadet har en öppen affär och kan inte släppas");
  }

  await db.lead.update({ where: { id: leadId }, data: { claimedAt: null } });

  await db.activity.create({
    data: {
      type: "LEAD_RELEASED",
      actorId: user.id,
      leadId,
      metadata: JSON.stringify({ releasedBy: user.id }),
    },
  });

  revalidatePath("/lists");
  revalidatePath("/leads");
}

/** Admin frigör alla utgångna lås i en mapp på en gång. */
export async function releaseExpiredInList(listId: string) {
  await requireAdmin();
  const cutoff = claimCutoff();

  const rows = await db.leadOnList.findMany({
    where: {
      listId,
      lead: { claimedAt: { lt: cutoff }, hasActiveDeal: false },
    },
    select: { leadId: true },
  });

  if (rows.length > 0) {
    await db.lead.updateMany({
      where: { id: { in: rows.map((r) => r.leadId) } },
      data: { claimedAt: null },
    });
  }

  revalidatePath(`/lists/${listId}`);
  return rows.length;
}
