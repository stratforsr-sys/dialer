// Normaliserar Contact.directPhone / switchboard till E.164.
//   node prisma/backfill-e164.mjs --dry-run
//   node prisma/backfill-e164.mjs
//
// Idempotent: kan köras om utan att ställa till något. Rör bara rader där
// E164-kolumnen är tom eller skiljer sig från det normaliserade värdet.

import { createClient } from "@libsql/client";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env.local") });

const dryRun = process.argv.includes("--dry-run");

// Samma logik som src/lib/phone.ts. Duplicerad medvetet: scriptet ska kunna
// köras fristående utan att bygga TypeScript.
function toE164(raw, defaultCountry = "46") {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  const validate = (e164) => {
    const d = e164.slice(1);
    if (d.length < 8 || d.length > 15) return null;
    if (/^0+$/.test(d)) return null;
    return e164;
  };

  if (!hasPlus && digits.startsWith("00")) return validate(`+${digits.slice(2)}`);
  if (hasPlus) return validate(`+${digits}`);
  if (digits.startsWith(defaultCountry) && digits.length >= 9 && digits.length <= 11)
    return validate(`+${digits}`);
  if (digits.startsWith("0")) return validate(`+${defaultCountry}${digits.slice(1)}`);
  return null;
}

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const res = await client.execute(`
  SELECT "id", "directPhone", "switchboard", "directPhoneE164", "switchboardE164"
  FROM "Contact"
`);

let updates = 0;
let unparsableDirect = 0;
let unparsableSwitch = 0;
const samples = [];
const batch = [];

for (const row of res.rows) {
  const d = toE164(row.directPhone);
  const s = toE164(row.switchboard);

  if (row.directPhone && !d) unparsableDirect++;
  if (row.switchboard && !s) unparsableSwitch++;

  if (d === row.directPhoneE164 && s === row.switchboardE164) continue;

  if (samples.length < 8) {
    samples.push(`${String(row.directPhone ?? "").padEnd(18)} → ${d ?? "(kunde ej tolkas)"}`);
  }

  batch.push({
    sql: `UPDATE "Contact" SET "directPhoneE164" = ?, "switchboardE164" = ? WHERE "id" = ?`,
    args: [d, s, row.id],
  });
  updates++;
}

console.log(`Kontakter totalt:        ${res.rows.length}`);
console.log(`Rader att uppdatera:     ${updates}`);
console.log(`Direktnr ej tolkbara:    ${unparsableDirect}`);
console.log(`Växelnr ej tolkbara:     ${unparsableSwitch}`);
if (samples.length) {
  console.log("\nExempel:");
  samples.forEach((s) => console.log("  " + s));
}

if (dryRun) {
  console.log("\n--dry-run: ingenting skrivet.");
  client.close();
  process.exit(0);
}

// Batchat i klumpar — en enda batch med tusentals satser blir för stor payload.
const CHUNK = 200;
for (let i = 0; i < batch.length; i += CHUNK) {
  await client.batch(batch.slice(i, i + CHUNK), "write");
  process.stdout.write(`\rSkriver... ${Math.min(i + CHUNK, batch.length)}/${batch.length}`);
}

console.log(`\n✅ ${updates} kontakter normaliserade.`);
client.close();
