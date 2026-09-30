// Bygger om `_migrations` från filerna i prisma/migrations/.
//
//   node scripts/aterstall-migrationsledger.mjs --till 031 --torrkor
//   node scripts/aterstall-migrationsledger.mjs --till 031
//
// `--till <nummer>` är obligatoriskt och är hela poängen: skriptet kan inte
// veta hur långt databasen är migrerad, så det måste få veta. Filer med högre
// nummer lämnas obokförda så att `apply-sql.mjs` kör dem som vanligt. Utan
// gränsen hade skriptet bokfört även en migration som aldrig körts — och då
// vägrar runnern köra den, i tron att den redan är gjord. Det är ett värre
// läge än ingen ledger alls.
//
// Varför den finns
// ----------------
// Räddningen ut ur den lässpärrade Turso-databasen 2026-09-28 tog 31 tabeller.
// `_migrations` var inte en av dem — den är ingen datatabell och stod inte på
// listan. Reservdatabasen har därför ingen ledger alls.
//
// Följden är inte akut: `apply-sql.mjs` slår upp EN fil i taget, så en ny
// migration skapar tabellen på nytt och bokförs korrekt. Det som är borta är
// skyddet. Runnern vägrar köra om en applicerad fil och vägrar köra en fil som
// ändrats sedan den kördes — båda vägrandena bygger på att raden finns. Utan
// ledger kan en session köra om `031_ett_bolag_en_mapp.sql` mot en databas som
// redan har indexet, och eftersom SQLite inte rullar tillbaka DDL lämnar en
// fil som fallerar mitt i databasen halvmigrerad.
//
// Vad den INTE gör
// ----------------
// Den kör ingen SQL ur migrationsfilerna. Den skriver bara påståendet "den här
// filen är redan applicerad", och det påståendet är bara sant om databasen
// verkligen är migrerad. Kör den därför enbart mot en databas som är i takt med
// filerna — reservdatabasen är det, eftersom den är en trogen kopia av
// `sales-hub-eu` som var det.
//
// `appliedAt` sätts till filens mtime, inte till nu. Ett påhittat "kördes just
// nu" hade varit sämre än ett ungefärligt datum: det påstår en precision som
// inte finns.

import { Client } from "pg";
import { readFileSync, readdirSync, statSync } from "fs";
import { createHash } from "crypto";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migDir = join(__dirname, "../prisma/migrations");
config({ path: join(__dirname, "../.env.local") });

const torrkor = process.argv.includes("--torrkor") || process.argv.includes("--dry-run");

const tillIdx = process.argv.indexOf("--till");
const till = tillIdx === -1 ? null : process.argv[tillIdx + 1];
if (!till || !/^\d{3}$/.test(till)) {
  console.error("Användning: node scripts/aterstall-migrationsledger.mjs --till <nnn> [--torrkor]");
  console.error("  --till är det HÖGSTA migrationsnummer databasen faktiskt har fått.");
  console.error("  Skriptet kan inte veta det. Gissa inte — kolla vad som körts.");
  process.exit(1);
}

if (!process.env.DIRECT_URL) {
  console.error("DIRECT_URL saknas — kolla .env.local");
  process.exit(1);
}

// Vilken databas det här faktiskt går mot. Klonens `.env.local` pekade på
// Turso i flera timmar efter att Vercel bytt till reservdatabasen 2026-09-28,
// och ett skript som tyst kör mot fel databas är svårare att upptäcka än ett
// som fallerar. Skriv ut den, alltid.
console.log(`databas: ${new URL(process.env.DIRECT_URL).host}`);

// `init.sql` är inte en migration utan utgångsläget, och bokförs inte av
// `apply-sql.mjs`. Bara de numrerade filerna hör i ledgern.
const filer = readdirSync(migDir)
  .filter((f) => /^\d{3}_.*\.sql$/.test(f))
  .filter((f) => f.slice(0, 3) <= till)
  .sort();

if (filer.length === 0) {
  console.error(`Inga numrerade migrationsfiler i ${migDir}`);
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DIRECT_URL });
await client.connect();

const SKAPA_LEDGER = `
  CREATE TABLE IF NOT EXISTS "_migrations" (
    "name"      text PRIMARY KEY,
    "checksum"  text NOT NULL,
    "appliedAt" text NOT NULL
  )
`;

// Tabellen skapas INTE här, utan först när något faktiskt ska skrivas.
//
// Första versionen av det här skriptet körde `CREATE TABLE IF NOT EXISTS` före
// torrkörningskontrollen. Följden blev att `--torrkor` skapade en tom
// `_migrations` i produktionsdatabasen 2026-09-29 — tomt och ofarligt, men en
// torrkörning som ändrar schemat är ingen torrkörning, och nästa gång hade det
// lika gärna kunnat vara något som betydde något.
//
// Saknas tabellen är svaret tomt. Felet sväljs med flit: `SELECT` mot en tabell
// som inte finns är exakt det förväntade läget första gången.
let fanns = new Set();
try {
  const r = await client.query(`SELECT "name" FROM "_migrations"`);
  fanns = new Set(r.rows.map((rad) => String(rad.name)));
} catch {
  // ledgern finns inte än
}

const attSkriva = [];
for (const f of filer) {
  if (fanns.has(f)) continue;
  const sql = readFileSync(join(migDir, f), "utf-8");
  attSkriva.push({
    name: f,
    // Samma beräkning som apply-sql.mjs, annars matchar checksumman aldrig och
    // runnern skulle rapportera varje fil som "ändrad sedan den kördes".
    checksum: createHash("sha256").update(sql).digest("hex").slice(0, 16),
    appliedAt: statSync(join(migDir, f)).mtime.toISOString(),
  });
}

console.log(`${filer.length} numrerade filer, ${fanns.size} redan bokförda.`);

if (attSkriva.length === 0) {
  console.log("✓ Ledgern är komplett. Inget att göra.");
  await client.end();
  process.exit(0);
}

for (const m of attSkriva) {
  console.log(`  ${torrkor ? "skulle bokföra" : "bokför"}  ${m.name}  ${m.checksum}  ${m.appliedAt.slice(0, 10)}`);
}

if (torrkor) {
  console.log(`\n--torrkor: ingenting skrevs. ${attSkriva.length} rader väntar.`);
  await client.end();
  process.exit(0);
}

// Tabellen och raderna i samma transaktion. En halvskriven ledger är värre än
// ingen: `apply-sql.mjs` vägrar köra en fil som står bokförd, så en avbruten
// körning hade kunnat låsa ute en migration som aldrig kördes.
try {
  await client.query("BEGIN");
  await client.query(SKAPA_LEDGER);
  for (const m of attSkriva) {
    await client.query(`INSERT INTO "_migrations" ("name","checksum","appliedAt") VALUES ($1,$2,$3)`, [
      m.name,
      m.checksum,
      m.appliedAt,
    ]);
  }
  await client.query("COMMIT");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("✗ MISSLYCKADES:", err.message);
  console.error("Transaktionen är återrullad: ledgern är orörd.");
  await client.end();
  process.exit(1);
}

console.log(`\n✓ ${attSkriva.length} rader bokförda i _migrations.`);
await client.end();
