// Kör en migrationsfil mot Turso, en gång, atomiskt och spårat:
//   node prisma/apply-sql.mjs 005_dialer_foundation.sql
//   node prisma/apply-sql.mjs 005_dialer_foundation.sql --dry-run
//
// Skillnad mot den tidigare versionen:
//   1. Ingen split på ";". Den gamla varianten delade filen på semikolon, vilket
//      går sönder på semikolon inuti stränglitteraler, triggerkroppar och
//      radkommentarer — en trasig migration kunde köras halvvägs.
//      executeMultiple() låter SQLite själv tolka satsgränserna.
//   2. Ledger. _migrations håller reda på vad som körts, med checksumma, så en
//      fil aldrig körs två gånger och en ändrad fil upptäcks.
//   3. Den gamla varianten svalde "already exists" tyst, vilket dolde att en
//      migration bara delvis gått igenom.

import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { createHash } from "crypto";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env.local") });

const file = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!file) {
  console.error("Användning: node prisma/apply-sql.mjs <fil i prisma/migrations> [--dry-run]");
  process.exit(1);
}
if (!process.env.TURSO_DATABASE_URL) {
  console.error("TURSO_DATABASE_URL saknas — kolla .env.local");
  process.exit(1);
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const sql = readFileSync(join(__dirname, "migrations", file), "utf-8");
const checksum = createHash("sha256").update(sql).digest("hex").slice(0, 16);

await client.execute(`
  CREATE TABLE IF NOT EXISTS "_migrations" (
    "name"      TEXT PRIMARY KEY,
    "checksum"  TEXT NOT NULL,
    "appliedAt" TEXT NOT NULL
  )
`);

const prior = await client.execute({
  sql: `SELECT "checksum", "appliedAt" FROM "_migrations" WHERE "name" = ?`,
  args: [file],
});

if (prior.rows.length > 0) {
  const row = prior.rows[0];
  if (row.checksum === checksum) {
    console.log(`✓ ${file} är redan applicerad (${row.appliedAt}). Inget att göra.`);
    client.close();
    process.exit(0);
  }
  console.error(`✗ ${file} applicerades ${row.appliedAt}, men filen har ändrats sedan dess.`);
  console.error(`  Applicerad checksumma: ${row.checksum}`);
  console.error(`  Filens checksumma:     ${checksum}`);
  console.error("  Skriv en ny migrationsfil i stället för att ändra en applicerad.");
  client.close();
  process.exit(1);
}

console.log(`${file}  (checksumma ${checksum})`);
console.log(`Mål: ${process.env.TURSO_DATABASE_URL}\n`);

if (dryRun) {
  console.log("--dry-run: kör ingenting. Filens innehåll:\n");
  console.log(sql);
  client.close();
  process.exit(0);
}

try {
  // Hela filen i ett svep — SQLite tolkar satsgränserna själv.
  await client.executeMultiple(sql);
  await client.execute({
    sql: `INSERT INTO "_migrations" ("name","checksum","appliedAt") VALUES (?,?,?)`,
    args: [file, checksum, new Date().toISOString()],
  });
  console.log("✅ Migrationen är applicerad och bokförd i _migrations.");
} catch (err) {
  console.error("✗ MISSLYCKADES:", err.message);
  console.error("\nIngenting är bokfört i _migrations. Kontrollera databasens");
  console.error("tillstånd innan du kör om — executeMultiple avbryter mitt i om");
  console.error("en sats fallerar, och SQLite rullar inte tillbaka DDL åt dig.");
  client.close();
  process.exit(1);
}

client.close();
