/**
 * Avdubblering: ett bolag = en lead-rad = en mapp.
 *
 *   node --import ./scripts/ts-resolve.mjs --experimental-strip-types scripts/avdubbla.ts
 *   node --import ./scripts/ts-resolve.mjs --experimental-strip-types scripts/avdubbla.ts --skarpt
 *
 * **Torrkörning är förval.** Utan `--skarpt` skrivs ingenting; skriptet räknar
 * och skriver en säkerhetskopia, inget annat. Det är med flit: steg 1 nedan är
 * oåterkalleligt.
 *
 * ## Varför
 *
 * `leaseNextLeads` vilar per BOLAG, inte per mapp. Ett bolag som ligger i tre
 * mappar kommer alltså tillbaka i vilken av de tre säljaren än sitter i när
 * vilan gått ut — och för säljaren ser det ut som att den nya listan är full
 * av bolag hen redan ringt. Mätt i produktionen 2026-09-18:
 *
 *     1 421  bolag låg i fler än en mapp (1 888 överflödiga LeadOnList-rader)
 *       161  bolag hade ringts av SAMMA säljare i fler än en mapp
 *     11–43  sådana omtagningar per dag, hela september, oavbrutet
 *
 * ## De två stegen
 *
 * **1. Samma bolag på flera LEAD-RADER slås ihop.** Identiteten är exakt den
 * importen använder — `orgNyckel`, annars `namnOrtNyckel` — importerad från
 * `lib/lead-identitet` och inte omskriven här. En andra tolkning av vad "samma
 * bolag" betyder är precis den fällan arbetsloggen varnar för.
 *
 * **2. Samma bolag i flera MAPPAR städas till en.** Mappen bolaget först
 * laddades upp i behåller det: lägsta `LeadOnList.addedAt`, med mappens
 * `createdAt` som avgörare vid lika.
 *
 * Ordningen är inte valfri. Steg 1 flyttar mapptillhörigheter till det
 * överlevande leadet och kan därmed SKAPA nya flermappsbolag; steg 2 måste
 * därför köras efter.
 *
 * ## Vad som inte görs
 *
 * `CallAttempt.listId` skrivs aldrig om. Den betyder "var säljaren satt när
 * hen ringde" och är sann som sådan — se arbetsloggen 2026-09-15. Följden är
 * att ett samtal kan vara bokfört på en mapp där bolaget inte längre ligger.
 * Mappvyerna joinar ändå via `LeadOnList` och visar rätt.
 */

import { createClient, type Client, type InStatement } from "@libsql/client";
import { config } from "dotenv";
import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { orgNyckel, namnOrtNyckel } from "../src/lib/lead-identitet.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env.local") });

const SKARPT = process.argv.includes("--skarpt");
const BACKUP = join(__dirname, `../backups/avdubbla-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}.json`);

if (!process.env.TURSO_DATABASE_URL) {
  console.error("TURSO_DATABASE_URL saknas — kolla .env.local");
  process.exit(1);
}

const db: Client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

type Rad = Record<string, string | number | null>;
const q = async (sql: string, args: unknown[] = []): Promise<Rad[]> =>
  (await db.execute({ sql, args: args as never })).rows as unknown as Rad[];

const s = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

/**
 * Tabeller som pekar rakt på `Lead.id` och bara ska byta leadId. Inget unikt
 * villkor kan krocka, så en enda UPDATE räcker.
 */
const FLYTTAS = [
  "Contact",
  "Callback",
  "Deal",
  "Activity",
  "CallAttempt",
  "GatekeeperContact",
  "CallFrameworkProgress",
  "TelephonyCall",
] as const;

/**
 * Tabeller med ett unikt villkor per (leadId, X). Bara det överlevaren saknar
 * flyttas; resten är samma uppgift två gånger och stryks.
 */
const UNIKA = [
  { tabell: "LeadOnList", kolumn: "listId" },
  { tabell: "TagOnLead", kolumn: "tagId" },
] as const;

// `LeadDossier`, `LeadClaim` och `DoNotCall` har var sitt undantag och
// hanteras för hand längre ned — se kommentarerna där.

// ── Steg 1: samma bolag på flera lead-rader ────────────────────────────────

const leads = await q(`
  SELECT id, orgNumber, companyName, city, createdAt, ownerId,
         website, address, industry, industryCode, industrySource, industryConfidence,
         employees, revenue, registeredAt,
         claimedAt, nextActionAt, nextSlotId, attemptCount, roundCount, noAnswerStreak,
         triedSlotsJson, lastAttemptAt, lastResult, lastOutcome, lastNoReason, callbackAt,
         leasedById, leasedUntil, retired, retiredReason, hasActiveDeal
  FROM "Lead"
`);
console.log(`Leads i registret: ${leads.length}`);

/** Grupper av lead-rader som är samma bolag. */
const grupper: Rad[][] = [];
/** Namn+ort-grupper som INTE slås ihop, med skälet. */
const avvisade: { nyckel: string; skal: string; leads: string[] }[] = [];

const perOrg = new Map<string, Rad[]>();
const utanOrg: Rad[] = [];
for (const l of leads) {
  const k = orgNyckel(s(l.orgNumber));
  if (k) {
    if (!perOrg.has(k)) perOrg.set(k, []);
    perOrg.get(k)!.push(l);
  } else {
    utanOrg.push(l);
  }
}
for (const [, rs] of perOrg) if (rs.length > 1) grupper.push(rs);

/**
 * Reservnyckeln. Ett lead med giltigt org-nummer får delta — annars missas de
 * 94 tomma kopiorna av redan ringda bolag, som är hela poängen med steget —
 * men bär gruppen MER ÄN ETT org-nummer är det två olika bolag som råkar heta
 * likadant på samma ort, och då slås ingenting ihop.
 *
 * Samma asymmetri som i importen: en felmatchning slår ihop två bolags
 * samtalshistorik permanent, en utebliven matchning ger en dubblett som går
 * att städa. Vid tvekan, rör ingenting.
 */
const redanIGrupp = new Set(grupper.flat().map((l) => String(l.id)));
const perNamnOrt = new Map<string, Rad[]>();
for (const l of [...utanOrg, ...leads.filter((l) => redanIGrupp.has(String(l.id)))]) {
  const k = namnOrtNyckel(s(l.companyName), s(l.city));
  if (!k) continue;
  if (!perNamnOrt.has(k)) perNamnOrt.set(k, []);
  perNamnOrt.get(k)!.push(l);
}
for (const [nyckel, rs] of perNamnOrt) {
  if (rs.length < 2) continue;
  const orgNycklar = new Set(rs.map((l) => orgNyckel(s(l.orgNumber))).filter(Boolean));
  if (orgNycklar.size > 1) {
    avvisade.push({ nyckel, skal: `${orgNycklar.size} olika org-nummer`, leads: rs.map((l) => String(l.id)) });
    continue;
  }
  // Redan sammanslagna via org-numret i samma grupp? Då finns inget kvar att göra.
  const grupperade = rs.filter((l) => redanIGrupp.has(String(l.id)));
  if (grupperade.length === rs.length) {
    const orgK = orgNyckel(s(grupperade[0].orgNumber));
    if (orgK && rs.every((l) => orgNyckel(s(l.orgNumber)) === orgK)) continue;
  }
  grupper.push(rs);
}

/** Grupper som delar lead slås ihop till en — annars flyttas samma rad två gånger. */
const slutgiltiga: Rad[][] = [];
const tillGrupp = new Map<string, Rad[]>();
for (const g of grupper) {
  const befintlig = g.map((l) => tillGrupp.get(String(l.id))).find(Boolean);
  if (befintlig) {
    for (const l of g) {
      if (!befintlig.some((x) => x.id === l.id)) befintlig.push(l);
      tillGrupp.set(String(l.id), befintlig);
    }
  } else {
    const ny = [...g];
    slutgiltiga.push(ny);
    for (const l of ny) tillGrupp.set(String(l.id), ny);
  }
}

const hopslagningar = slutgiltiga.filter((g) => g.length > 1);
const forlorare = hopslagningar.reduce((a, g) => a + g.length - 1, 0);
console.log(`\nSTEG 1 — samma bolag på flera lead-rader`);
console.log(`  grupper att slå ihop:     ${hopslagningar.length}`);
console.log(`  lead-rader som raderas:   ${forlorare}`);
console.log(`  grupper som AVVISAS:      ${avvisade.length}  (olika org-nummer bakom samma namn+ort)`);

// ── Vad överlevaren ska bära ───────────────────────────────────────────────

const aldst = (a: Rad, b: Rad) => (String(a.createdAt) <= String(b.createdAt) ? a : b);
const maxDatum = (...v: (string | null)[]) => v.filter(Boolean).sort().pop() ?? null;
const minDatum = (...v: (string | null)[]) => v.filter(Boolean).sort().shift() ?? null;

/**
 * Pensioneringen är ett beslut om BOLAGET och följer med. Med ett undantag:
 * `inget_nummer` betyder "jag hittade inget nummer den dagen", och har en
 * annan rad på samma bolag ett nummer är påståendet motbevisat. Samma gräns
 * som importen drar när den häver just den pensioneringen och ingen annan.
 */
const pensionering = (rader: Rad[]) => {
  const beslut = rader.find((l) => n(l.retired) === 1 && s(l.retiredReason) !== "inget_nummer");
  if (beslut) return { retired: 1, retiredReason: s(beslut.retiredReason) };
  if (rader.every((l) => n(l.retired) === 1)) {
    return { retired: 1, retiredReason: s(rader.find((l) => s(l.retiredReason))?.retiredReason ?? null) };
  }
  return { retired: 0, retiredReason: null };
};

type Plan = { overlevare: Rad; forlorare: Rad[]; satt: Record<string, string | number | null> };
const planer: Plan[] = [];

for (const g of hopslagningar) {
  const overlevare = g.reduce(aldst);
  const ovriga = g.filter((l) => l.id !== overlevare.id);
  const senaste = [...g].sort((a, b) => String(a.lastAttemptAt ?? "").localeCompare(String(b.lastAttemptAt ?? ""))).pop()!;
  const p = pensionering(g);

  const nästa = maxDatum(...g.map((l) => s(l.nextActionAt)));
  const harRingts = g.some((l) => l.lastAttemptAt);

  const satt: Record<string, string | number | null> = {
    // Tomma fält fylls ur de andra raderna. Ifyllt skrivs aldrig över: den
    // äldsta raden är den som någon kan ha rättat för hand.
    orgNumber: s(overlevare.orgNumber) ?? s(g.find((l) => l.orgNumber)?.orgNumber ?? null),
    companyName: s(overlevare.companyName),
    website: s(overlevare.website) ?? s(g.find((l) => l.website)?.website ?? null),
    address: s(overlevare.address) ?? s(g.find((l) => l.address)?.address ?? null),
    city: s(overlevare.city) ?? s(g.find((l) => l.city)?.city ?? null),
    industry: s(overlevare.industry) ?? s(g.find((l) => l.industry)?.industry ?? null),
    industryCode: s(overlevare.industryCode) ?? s(g.find((l) => l.industryCode)?.industryCode ?? null),
    industrySource: s(overlevare.industry) ? s(overlevare.industrySource) : s(g.find((l) => l.industry)?.industrySource ?? null),
    industryConfidence: overlevare.industry ? overlevare.industryConfidence : (g.find((l) => l.industry)?.industryConfidence ?? null),
    employees: overlevare.employees ?? (g.find((l) => l.employees)?.employees ?? null),
    revenue: overlevare.revenue ?? (g.find((l) => l.revenue)?.revenue ?? null),
    registeredAt: s(overlevare.registeredAt) ?? s(g.find((l) => l.registeredAt)?.registeredAt ?? null),

    // ── Uppföljningsmotorn ────────────────────────────────────────────────
    // Det farliga fallet: den äldsta raden är oringd och den andra ringdes i
    // går. Ärvs inte samtalshistoriken hamnar bolaget överst i däcket som ett
    // obearbetat bolag och rings i dag igen.
    lastAttemptAt: maxDatum(...g.map((l) => s(l.lastAttemptAt))),
    lastResult: s(senaste.lastResult),
    lastOutcome: s(senaste.lastOutcome),
    lastNoReason: s(senaste.lastNoReason),
    // Den LÄNGSTA vilan vinner. Att ta den kortaste hade gjort en hopslagning
    // till en genväg förbi en vila som någon annan rad redan hade tjänat in.
    //
    // `NULL` betyder "aldrig ringd" och sorterar först i däcket (se
    // CLAUDE.md). Ett hopslaget bolag som HAR ringts får därför aldrig behålla
    // NULL — saknas en vila på samtliga rader sätts den till nu: ringbart,
    // men inte längst fram i kön som ett orört bolag.
    nextActionAt: nästa ?? (harRingts && p.retired === 0 ? new Date().toISOString() : null),
    nextSlotId: s(overlevare.nextSlotId) ?? s(g.find((l) => l.nextSlotId)?.nextSlotId ?? null),
    // MAX och inte summan. Summan är sannare om hur många gånger bolaget
    // faktiskt ringts, men skulle slå flera bolag i taket (`maxAttempts`) i
    // samma sekund som de slås ihop — och ett lead över taket serveras aldrig
    // mer. Ett städjobb får inte pensionera bolag i tysthet.
    attemptCount: Math.max(...g.map((l) => n(l.attemptCount))),
    roundCount: Math.max(...g.map((l) => n(l.roundCount))),
    noAnswerStreak: Math.max(...g.map((l) => n(l.noAnswerStreak))),
    // Det tidigaste löftet vinner — ett utlovat samtal får aldrig skjutas fram
    // av ett städjobb.
    callbackAt: minDatum(...g.map((l) => s(l.callbackAt))),
    claimedAt: minDatum(...g.map((l) => s(l.claimedAt))),
    ownerId: s(g.find((l) => l.claimedAt)?.ownerId ?? overlevare.ownerId),
    hasActiveDeal: g.some((l) => n(l.hasActiveDeal) === 1) ? 1 : 0,
    ...p,
    // Arbetslåset släpps. Det är minuter långt, och att ärva någon annans lås
    // skulle göra bolaget osynligt tills det löper ut.
    leasedById: null,
    leasedUntil: null,
  };

  planer.push({ overlevare, forlorare: ovriga, satt });
}

// ── Uppslag som skrivningen behöver ────────────────────────────────────────

const berorda = new Set(planer.flatMap((p) => [String(p.overlevare.id), ...p.forlorare.map((f) => String(f.id))]));
const inList = (ids: string[]) => ids.map(() => "?").join(",");
const idLista = [...berorda];

const dossierer = new Set(
  idLista.length === 0 ? [] :
  (await q(`SELECT "leadId" FROM "LeadDossier" WHERE "leadId" IN (${inList(idLista)})`, idLista)).map((r) => String(r.leadId))
);
const dnc = new Set(
  idLista.length === 0 ? [] :
  (await q(`SELECT "leadId" FROM "DoNotCall" WHERE "leadId" IN (${inList(idLista)})`, idLista)).map((r) => String(r.leadId))
);

/**
 * Två öppna återkomster på samma bolag efter en hopslagning.
 *
 * Städningen skapar inte problemet — två säljare hade redan lovat samma bolag
 * ett samtal, på var sin lead-rad. Hopslagningen gör det bara synligt, och det
 * är rätt: båda löftena är sanna och båda står kvar.
 *
 * Skriptet avbokar INTE det ena. En avbokning kräver ett skäl och är ett
 * beslut om bolaget — `cancelCallback` finns för det, och en admin kan släppa
 * vems rad som helst. Ett städjobb får inte ta ett löfte som en människa gav.
 */
const oppna = idLista.length === 0 ? [] : await q(
  `SELECT cb."leadId", u."name" AS saljare, cb."scheduledAt"
   FROM "Callback" cb JOIN "User" u ON u."id" = cb."sellerId"
   WHERE cb."status" = 'PENDING' AND cb."leadId" IN (${inList(idLista)})`, idLista
);
const oppnaPerLead = new Map<string, Rad[]>();
for (const r of oppna) {
  const k = String(r.leadId);
  if (!oppnaPerLead.has(k)) oppnaPerLead.set(k, []);
  oppnaPerLead.get(k)!.push(r);
}
const dubblaLoften = planer
  .map((p) => ({
    bolag: String(p.overlevare.companyName),
    loften: [String(p.overlevare.id), ...p.forlorare.map((f) => String(f.id))]
      .flatMap((id) => oppnaPerLead.get(id) ?? []),
  }))
  .filter((x) => x.loften.length > 1);

if (dubblaLoften.length > 0) {
  console.log(`\nVARNING — ${dubblaLoften.length} bolag får TVÅ öppna återkomster efter hopslagningen.`);
  console.log(`  Båda löftena står kvar. Avboka det ena för hand i klockan, med skäl.`);
  for (const x of dubblaLoften) {
    console.log(`  ${x.bolag}:`);
    for (const l of x.loften) console.log(`      ${l.saljare} — ${String(l.scheduledAt).slice(0, 16).replace("T", " ")}`);
  }
}

// ── Steg 2: samma bolag i flera mappar ─────────────────────────────────────

const listor = await q(`SELECT id, name, createdAt FROM "CallList"`);
const listNamn = new Map(listor.map((l) => [String(l.id), String(l.name)]));
const listSkapad = new Map(listor.map((l) => [String(l.id), String(l.createdAt)]));

const lolRader = await q(`SELECT listId, leadId, addedAt, createdByImport FROM "LeadOnList"`);
console.log(`\nLeadOnList-rader: ${lolRader.length}`);

/** Efter steg 1 pekar förlorarnas mapprader på överlevaren. */
const tillOverlevare = new Map<string, string>();
for (const p of planer) for (const f of p.forlorare) tillOverlevare.set(String(f.id), String(p.overlevare.id));

const perLead = new Map<string, Rad[]>();
for (const r of lolRader) {
  const leadId = tillOverlevare.get(String(r.leadId)) ?? String(r.leadId);
  if (!perLead.has(leadId)) perLead.set(leadId, []);
  const rs = perLead.get(leadId)!;
  const dubblett = rs.find((x) => x.listId === r.listId);
  // Samma mapp via två lead-rader: den äldsta anslutningen är den sanna.
  if (dubblett) {
    if (String(r.addedAt) < String(dubblett.addedAt)) dubblett.addedAt = r.addedAt;
    continue;
  }
  rs.push({ ...r, leadId });
}

/**
 * Mappen bolaget FÖRST laddades upp i behåller det.
 *
 * `addedAt` är den direkta frågan. Mappens `createdAt` är avgöraren när två
 * rader bär samma tidsstämpel — en import som träffar två mappar i samma
 * sekund finns, och utan en andra nyckel hade valet blivit slumpen.
 * `createdByImport` sist: den mapp som SKAPADE leadet är rimligare hem än den
 * som bara länkade in det.
 */
const rang = (r: Rad): string[] => [
  String(r.addedAt ?? "9999"),
  listSkapad.get(String(r.listId)) ?? "9999",
  n(r.createdByImport) === 1 ? "0" : "1",
  String(r.listId),
];
const jmf = (a: Rad, b: Rad) => {
  const ra = rang(a), rb = rang(b);
  for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] < rb[i] ? -1 : 1;
  return 0;
};

const attStryka: { listId: string; leadId: string }[] = [];
const perMapp = new Map<string, { behaller: number; tappar: number }>();
for (const l of listor) perMapp.set(String(l.id), { behaller: 0, tappar: 0 });

for (const [, rs] of perLead) {
  const sorterade = [...rs].sort(jmf);
  perMapp.get(String(sorterade[0].listId))!.behaller++;
  for (const r of sorterade.slice(1)) {
    perMapp.get(String(r.listId))!.tappar++;
    attStryka.push({ listId: String(r.listId), leadId: String(r.leadId) });
  }
}

// Förlorarnas rader raderas ändå av steg 1 (ON DELETE CASCADE) — bara de som
// pekar på ett lead som blir kvar behöver en egen DELETE.
const kvarvarandeStryk = attStryka.filter((r) => !tillOverlevare.has(r.leadId));

console.log(`\nSTEG 2 — samma bolag i flera mappar`);
console.log(`  mapprader som stryks:     ${attStryka.length}`);
console.table(
  listor
    .map((l) => ({ mapp: String(l.name), behaller: perMapp.get(String(l.id))!.behaller, tappar: perMapp.get(String(l.id))!.tappar }))
    .filter((r) => r.tappar > 0 || r.behaller > 0)
    .sort((a, b) => b.tappar - a.tappar)
);

// ── Säkerhetskopia ─────────────────────────────────────────────────────────

const kopia = {
  kord: new Date().toISOString(),
  skarpt: SKARPT,
  steg1: planer.map((p) => ({
    overlevare: p.overlevare,
    forlorare: p.forlorare,
    satt: p.satt,
  })),
  steg1_avvisade: avvisade,
  steg2_strukna: attStryka.map((r) => ({ ...r, mapp: listNamn.get(r.listId) })),
};
writeFileSync(BACKUP, JSON.stringify(kopia, null, 2));
console.log(`\nSäkerhetskopia: ${BACKUP}`);

if (!SKARPT) {
  console.log("\nTORRKÖRNING — ingenting skrevs. Kör om med --skarpt för att genomföra.");
  process.exit(0);
}

// ── Skrivning ──────────────────────────────────────────────────────────────

console.log("\nSkriver…");

let slagnaIhop = 0;
for (const p of planer) {
  const kvar = String(p.overlevare.id);
  const bort = p.forlorare.map((f) => String(f.id));
  const satser: InStatement[] = [];

  const platshallare = bort.map(() => "?").join(",");

  for (const tabell of FLYTTAS) {
    satser.push({ sql: `UPDATE "${tabell}" SET "leadId" = ? WHERE "leadId" IN (${platshallare})`, args: [kvar, ...bort] });
  }

  for (const { tabell, kolumn } of UNIKA) {
    satser.push({
      sql: `DELETE FROM "${tabell}" WHERE "leadId" IN (${platshallare})
            AND "${kolumn}" IN (SELECT "${kolumn}" FROM "${tabell}" WHERE "leadId" = ?)`,
      args: [...bort, kvar],
    });
    satser.push({ sql: `UPDATE "${tabell}" SET "leadId" = ? WHERE "leadId" IN (${platshallare})`, args: [kvar, ...bort] });
  }

  // ── Dossiern före uppgifterna ────────────────────────────────────────────
  //
  // `LeadClaim.leadId` är en främmande nyckel mot **`LeadDossier.leadId`**,
  // inte mot `Lead.id` — och `PRAGMA foreign_keys` är PÅ i den här databasen.
  // Flyttas uppgifterna till en överlevare som saknar dossier faller satsen på
  // nyckeln mitt i transaktionen. Ordningen nedan är alltså inte kosmetisk:
  //
  //   1. saknar överlevaren dossier men en förlorare har en → flytta den
  //   2. först DÄREFTER får uppgifterna flyttas
  //   3. kvarvarande dossierer raderas sist, och kaskaden tar deras uppgifter
  //      (som vid det laget bara är dubbletter av nycklar överlevaren redan har)
  const harDossier = dossierer.has(kvar);
  const givare = bort.find((id) => dossierer.has(id));
  if (!harDossier && givare) {
    satser.push({ sql: `UPDATE "LeadDossier" SET "leadId" = ? WHERE "leadId" = ?`, args: [kvar, givare] });
    satser.push({ sql: `UPDATE "LeadClaim" SET "leadId" = ? WHERE "leadId" = ?`, args: [kvar, givare] });
  }
  if (harDossier || givare) {
    satser.push({
      sql: `DELETE FROM "LeadClaim" WHERE "leadId" IN (${platshallare})
            AND "key" IN (SELECT "key" FROM "LeadClaim" WHERE "leadId" = ?)`,
      args: [...bort, kvar],
    });
    satser.push({ sql: `UPDATE "LeadClaim" SET "leadId" = ? WHERE "leadId" IN (${platshallare})`, args: [kvar, ...bort] });
  }
  satser.push({ sql: `DELETE FROM "LeadDossier" WHERE "leadId" IN (${platshallare})`, args: bort });

  // ── Spärren raderas aldrig ───────────────────────────────────────────────
  //
  // `DoNotCall.leadId` är UNIQUE, så två spärrar kan inte peka på samma lead.
  // Men en spärr är ett besked från bolaget och får inte försvinna i ett
  // städjobb: har överlevaren redan en nollas den andras `leadId` i stället
  // för att raderas. Raden lever vidare på `orgNumber` och `phoneE164`, och
  // däckets spärrfilter matchar på org-numret just för att överleva att
  // leadId försvinner.
  if (dnc.has(kvar)) {
    satser.push({ sql: `UPDATE "DoNotCall" SET "leadId" = NULL WHERE "leadId" IN (${platshallare})`, args: bort });
  } else {
    const forsta = bort.find((id) => dnc.has(id));
    if (forsta) {
      satser.push({ sql: `UPDATE "DoNotCall" SET "leadId" = NULL WHERE "leadId" IN (${platshallare}) AND "leadId" <> ?`, args: [...bort, forsta] });
      satser.push({ sql: `UPDATE "DoNotCall" SET "leadId" = ? WHERE "leadId" = ?`, args: [kvar, forsta] });
    }
  }

  // Org-numret är UNIQUE. Förlorarna måste tömmas på sitt innan överlevaren
  // får det, annars faller satsen på indexet mitt i transaktionen.
  satser.push({ sql: `UPDATE "Lead" SET "orgNumber" = NULL WHERE "id" IN (${bort.map(() => "?").join(",")})`, args: bort });

  const kolumner = Object.keys(p.satt);
  satser.push({
    sql: `UPDATE "Lead" SET ${kolumner.map((k) => `"${k}" = ?`).join(", ")}, "updatedAt" = ? WHERE "id" = ?`,
    args: [...kolumner.map((k) => p.satt[k]), new Date().toISOString(), kvar],
  });

  satser.push({ sql: `DELETE FROM "Lead" WHERE "id" IN (${bort.map(() => "?").join(",")})`, args: bort });

  await db.batch(satser, "write");
  slagnaIhop++;
  if (slagnaIhop % 25 === 0) console.log(`  ${slagnaIhop}/${planer.length} hopslagna`);
}
console.log(`  ${slagnaIhop} grupper hopslagna, ${forlorare} lead-rader raderade`);

let strukna = 0;
for (let i = 0; i < kvarvarandeStryk.length; i += 200) {
  const del = kvarvarandeStryk.slice(i, i + 200);
  await db.batch(
    del.map((r) => ({ sql: `DELETE FROM "LeadOnList" WHERE "listId" = ? AND "leadId" = ?`, args: [r.listId, r.leadId] })),
    "write"
  );
  strukna += del.length;
  console.log(`  ${strukna}/${kvarvarandeStryk.length} mapprader strukna`);
}

const [kvarLeads] = await q(`SELECT count(*) AS n FROM "Lead"`);
const [kvarLol] = await q(`SELECT count(*) AS n FROM "LeadOnList"`);
const [flermapps] = await q(`SELECT count(*) AS n FROM (SELECT "leadId" FROM "LeadOnList" GROUP BY "leadId" HAVING count(*) > 1)`);
console.log(`\nEfteråt: ${kvarLeads.n} leads, ${kvarLol.n} mapprader, ${flermapps.n} bolag i fler än en mapp.`);
