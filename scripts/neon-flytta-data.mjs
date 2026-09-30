// Flyttar all data från SQLite-databasen till Neon.
//
//   node scripts/neon-flytta-data.mjs --torrkor     — visar plan, skriver inget
//   node scripts/neon-flytta-data.mjs               — läser in
//   node scripts/neon-flytta-data.mjs --bara Lead   — en tabell (felsökning)
//
// Verifiera ALLTID efteråt med `node scripts/neon-jamfor.mjs`. Att skriptet
// gick igenom utan att kasta betyder att inga satser fallerade — inte att alla
// rader kom fram.
//
// ## Ordningen
//
// Tabellerna läses in i beroendeordning, uträknad ur SQLites egna
// `PRAGMA foreign_key_list` och inte ur schema.prisma: det är databasens bild
// av vad som måste finnas först som gäller. Kontrollerat 2026-09-29 — 31
// tabeller, inga cykler, inga självreferenser, så en enkel topologisk
// sortering räcker och ingen tvåstegsladdning behövs.
//
// ## Typerna
//
// Två skillnader betyder något:
//
//   Boolean   SQLite lagrar 0/1, Postgres har en riktig boolean-typ.
//   DateTime  SQLite lagrar ISO-text. Postgres tar emot samma text, men NULL
//             måste förbli NULL och inte bli strängen "null".
//
// Enum-värdena är kontrollerade separat: alla 22 enum-kolumner bär bara värden
// som finns i schemat, så Postgres avvisar inget. Skulle det ändra sig är det
// den kontrollen som ska köras om, inte det här skriptet som ska gissa.
//
// ## Varför inte COPY
//
// `COPY FROM` hade varit snabbare, men kräver att varje värde serialiseras till
// text med rätt escaping — och det är precis där en flytt tappar data tyst.
// Parametriserade INSERT låter drivrutinen hantera citattecken, radbrytningar
// och NULL. 229 000 rader tar minuter, inte timmar, och det är billigt nog.

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createClient } from "@libsql/client";
import { Client } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env.local") });

const torrkor = process.argv.includes("--torrkor") || process.argv.includes("--dry-run");
const baraIdx = process.argv.indexOf("--bara");
const baraTabell = baraIdx === -1 ? null : process.argv[baraIdx + 1];

const SQLITE =
  process.env.SQLITE_DB ||
  join(process.env.HOME, "dialer-failover/sqld-data/dbs/default/data");

if (!process.env.DIRECT_URL) {
  console.error("DIRECT_URL saknas i .env.local");
  process.exit(1);
}

// Direktanslutningen, inte poolern: en inläsning är en lång serie stora satser
// och hör inte hemma i en pool avsedd för korta webbförfrågningar.
const pg = new Client({ connectionString: process.env.DIRECT_URL });
const lite = createClient({ url: `file:${SQLITE}` });

await pg.connect();
console.log(`SQLite: ${SQLITE}`);
console.log(`Neon:   ${new URL(process.env.DIRECT_URL).host}\n`);

// ── Ordningen ──────────────────────────────────────────────────────────────

const UTANFOR = new Set(["_migrations", "sqlite_stat1"]);

const tabeller = (
  await lite.execute(
    `select name from sqlite_master where type='table' and name not like 'sqlite_%'`
  )
).rows
  .map((r) => String(r.name))
  .filter((t) => !UTANFOR.has(t));

const beror = new Map(tabeller.map((t) => [t, new Set()]));
for (const t of tabeller) {
  const fk = await lite.execute(`pragma foreign_key_list("${t}")`);
  for (const r of fk.rows) {
    const mal = String(r.table);
    if (mal !== t && beror.has(mal)) beror.get(t).add(mal);
  }
}

const ordning = [];
const klar = new Set();
let varv = 0;
while (ordning.length < tabeller.length && varv++ < 100) {
  for (const t of tabeller) {
    if (klar.has(t)) continue;
    if ([...beror.get(t)].every((d) => klar.has(d))) {
      ordning.push(t);
      klar.add(t);
    }
  }
}
if (ordning.length !== tabeller.length) {
  console.error(`Cykel i beroendena — kan inte ordna: ${tabeller.filter((t) => !klar.has(t)).join(", ")}`);
  process.exit(1);
}

// ── Kolumntyperna på Neon-sidan ────────────────────────────────────────────

const typer = new Map(); // tabell -> Map(kolumn -> datatyp)
for (const t of ordning) {
  const r = await pg.query(
    `select column_name, data_type from information_schema.columns
     where table_schema='public' and table_name=$1`,
    [t]
  );
  typer.set(t, new Map(r.rows.map((x) => [x.column_name, x.data_type])));
}

/** SQLite-värde till något Postgres tar emot för kolumnens typ. */
function konvertera(varde, datatyp) {
  if (varde === null || varde === undefined) return null;
  if (datatyp === "boolean") {
    // SQLite lagrar 0/1. Jämför mot 0 och inte mot 1: allt annat än noll är
    // sant, precis som SQLite själv tolkar det.
    if (typeof varde === "bigint") return varde !== 0n;
    if (typeof varde === "number") return varde !== 0;
    if (typeof varde === "string") return varde !== "0" && varde.toLowerCase() !== "false";
    return Boolean(varde);
  }
  // BigInt går inte att skicka till pg-drivrutinen som den är.
  if (typeof varde === "bigint") return Number(varde);
  return varde;
}

// ── Inläsningen ────────────────────────────────────────────────────────────

const valda = baraTabell ? ordning.filter((t) => t === baraTabell) : ordning;
if (baraTabell && valda.length === 0) {
  console.error(`Okänd tabell: ${baraTabell}`);
  process.exit(1);
}

let totalt = 0;
const t0 = Date.now();

for (const t of valda) {
  const kolumnTyper = typer.get(t);
  const antal = Number((await lite.execute(`select count(*) as n from "${t}"`)).rows[0].n);

  if (antal === 0) {
    console.log(`  ${t.padEnd(24)} tom`);
    continue;
  }

  // Kolumnerna tas från Neon-sidan: det är dit raderna ska, och en kolumn som
  // finns i SQLite men inte i schemat ska inte följa med.
  const kolumner = [...kolumnTyper.keys()];
  const citerade = kolumner.map((k) => `"${k}"`).join(", ");

  // Postgres tar max 65535 parametrar per sats. Marginal nedåt, och minst en
  // rad per omgång även för mycket breda tabeller.
  const perOmgang = Math.max(1, Math.floor(50000 / kolumner.length));

  if (torrkor) {
    console.log(`  ${t.padEnd(24)} ${String(antal).padStart(7)} rader, ${kolumner.length} kolumner, ${Math.ceil(antal / perOmgang)} omgångar`);
    totalt += antal;
    continue;
  }

  // Tömmer först: skriptet ska gå att köra om utan att duplicera. CASCADE
  // behövs inte eftersom ordningen redan följer beroendena, men en omkörning
  // av EN tabell mitt i skulle annars falla på barnens nycklar.
  await pg.query(`TRUNCATE TABLE "${t}" CASCADE`);

  let skrivna = 0;
  let offset = 0;
  while (offset < antal) {
    const res = await lite.execute({
      sql: `select ${citerade} from "${t}" limit ? offset ?`,
      args: [perOmgang, offset],
    });
    if (res.rows.length === 0) break;

    const args = [];
    const grupper = [];
    for (const rad of res.rows) {
      const platser = [];
      for (const k of kolumner) {
        args.push(konvertera(rad[k], kolumnTyper.get(k)));
        platser.push(`$${args.length}`);
      }
      grupper.push(`(${platser.join(",")})`);
    }

    await pg.query(`INSERT INTO "${t}" (${citerade}) VALUES ${grupper.join(",")}`, args);
    skrivna += res.rows.length;
    offset += perOmgang;
    if (antal > 20000) process.stdout.write(`\r  ${t.padEnd(24)} ${skrivna}/${antal}`);
  }

  console.log(`\r  ${t.padEnd(24)} ${String(skrivna).padStart(7)} rader ✓`);
  totalt += skrivna;
}

const sek = ((Date.now() - t0) / 1000).toFixed(1);
console.log(
  torrkor
    ? `\n--torrkor: ingenting skrevs. ${totalt} rader i ${valda.length} tabeller väntar.`
    : `\n✓ ${totalt} rader på ${sek}s. Verifiera med: node scripts/neon-jamfor.mjs`
);

await pg.end();
