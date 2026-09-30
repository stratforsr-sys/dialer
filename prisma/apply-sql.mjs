// Kör en migrationsfil mot Neon (Postgres), en gång, atomiskt och spårat:
//   node prisma/apply-sql.mjs 032_mappvyns_sorteringsindex.sql
//   node prisma/apply-sql.mjs 032_mappvyns_sorteringsindex.sql --dry-run
//
// Fram till cutovern 2026-09-30 talade den här runnern libSQL och körde mot
// TURSO_DATABASE_URL. Databasen är Postgres nu, och tre saker följer av det:
//
//   1. DIRECT_URL, inte DATABASE_URL. Schemaoperationer går inte genom Neons
//      pooler.
//   2. DDL rullas tillbaka. Det var den skarpaste kanten på SQLite-versionen:
//      en fil som fallerade mitt i lämnade databasen halvmigrerad, och
//      kommentaren i felutskriften bad läsaren kontrollera tillståndet för
//      hand. Postgres kör DDL transaktionellt, så filen och ledgerraden ligger
//      i samma BEGIN/COMMIT — antingen gick allt igenom eller ingenting.
//   3. Ingen executeMultiple(). pg:s enkla frågeprotokoll tar flera satser i
//      ett anrop och tolkar satsgränserna själv, vilket är samma egenskap som
//      motiverade executeMultiple: ingen split på ";" som går sönder på
//      semikolon inuti stränglitteraler och kommentarer.
//
// Ledgern (_migrations) håller reda på vad som körts, med checksumma, så en fil
// aldrig körs två gånger och en ändrad fil upptäcks.

import { Client } from "pg";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env.local") });

const file = process.argv[2];
const dryRun = process.argv.includes("--dry-run") || process.argv.includes("--torrkor");

if (!file) {
  console.error("Användning: node prisma/apply-sql.mjs <fil i prisma/migrations> [--dry-run]");
  process.exit(1);
}
if (!process.env.DIRECT_URL) {
  console.error("DIRECT_URL saknas — kolla .env.local");
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DIRECT_URL });
await client.connect();

const sql = readFileSync(join(__dirname, "migrations", file), "utf-8");
const checksum = createHash("sha256").update(sql).digest("hex").slice(0, 16);

await client.query(`
  CREATE TABLE IF NOT EXISTS "_migrations" (
    "name"      text PRIMARY KEY,
    "checksum"  text NOT NULL,
    "appliedAt" text NOT NULL
  )
`);

const prior = await client.query(`SELECT "checksum", "appliedAt" FROM "_migrations" WHERE "name" = $1`, [
  file,
]);

if (prior.rows.length > 0) {
  const row = prior.rows[0];
  if (row.checksum === checksum) {
    console.log(`✓ ${file} är redan applicerad (${row.appliedAt}). Inget att göra.`);
    await client.end();
    process.exit(0);
  }
  console.error(`✗ ${file} applicerades ${row.appliedAt}, men filen har ändrats sedan dess.`);
  console.error(`  Applicerad checksumma: ${row.checksum}`);
  console.error(`  Filens checksumma:     ${checksum}`);
  console.error("  Skriv en ny migrationsfil i stället för att ändra en applicerad.");
  await client.end();
  process.exit(1);
}

console.log(`${file}  (checksumma ${checksum})`);
console.log(`Mål: ${new URL(process.env.DIRECT_URL).host}\n`);

if (dryRun) {
  console.log("--dry-run: kör ingenting. Filens innehåll:\n");
  console.log(sql);
  await client.end();
  process.exit(0);
}

try {
  await client.query("BEGIN");
  // Hela filen i ett svep — pg tolkar satsgränserna själv.
  await client.query(sql);
  await client.query(`INSERT INTO "_migrations" ("name","checksum","appliedAt") VALUES ($1,$2,$3)`, [
    file,
    checksum,
    new Date().toISOString(),
  ]);
  await client.query("COMMIT");
  console.log("✅ Migrationen är applicerad och bokförd i _migrations.");
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("✗ MISSLYCKADES:", err.message);
  console.error("\nTransaktionen är återrullad: varken schemat eller ledgern är rörd.");
  await client.end();
  process.exit(1);
}

await client.end();
