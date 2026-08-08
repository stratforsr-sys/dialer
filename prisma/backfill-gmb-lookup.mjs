// Kvitto på Google-uppslag som gjordes innan kvittot fanns.
//   node prisma/backfill-gmb-lookup.mjs --dry-run
//   node prisma/backfill-gmb-lookup.mjs
//
// Bakgrund: `lookupLeads` valde först leads som saknade `gmb.category`. Ett
// bolag utan Google-profil får aldrig någon kategori och låg därför kvar i kön
// för alltid — samma misslyckade uppslag betalt om och om igen. Kön står nu på
// `gmb.lookup`, som skrivs oavsett utfall.
//
// Ändringen nollställde dock kön för allt som slagits upp INNAN den: leads som
// fick en kategori har ingen `gmb.lookup` och skulle frågas om en gång till
// utan att ge något nytt.
//
// Kriteriet här är ett BEVIS, inte en gissning: en `gmb.category` kan bara
// finnas om uppslaget gjordes och träffade. Leads UTAN kategori rörs inte —
// för dem går det inte att veta om de frågats om och missats eller aldrig
// frågats om alls, och då är det rätt att betala för ett uppslag hellre än att
// tyst hoppa över bolaget.
//
// Idempotent: kan köras om: NOT EXISTS-villkoret gör andra körningen till en
// nollrunda.

import { createClient } from "@libsql/client";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env.local") });

const dryRun = process.argv.includes("--dry-run");

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const SELECT_MISSING = `
  SELECT COUNT(*) AS n
  FROM LeadClaim c
  WHERE c.key = 'gmb.category'
    AND NOT EXISTS (
      SELECT 1 FROM LeadClaim r WHERE r.leadId = c.leadId AND r.key = 'gmb.lookup'
    )`;

const counts = await db.execute(`
  SELECT
    (SELECT COUNT(*) FROM LeadClaim WHERE key='gmb.category') AS medKategori,
    (SELECT COUNT(*) FROM LeadClaim WHERE key='gmb.lookup')   AS medKvitto`);

const missing = (await db.execute(SELECT_MISSING)).rows[0].n;

console.log(`leads med gmb.category:   ${counts.rows[0].medKategori}`);
console.log(`leads med gmb.lookup:     ${counts.rows[0].medKvitto}`);
console.log(`saknar kvitto:            ${missing}`);

if (dryRun) {
  console.log("\n--dry-run: ingenting skrevs.");
  process.exit(0);
}

if (Number(missing) === 0) {
  console.log("\nInget att göra.");
  process.exit(0);
}

// INSERT ... SELECT i EN sats. Tidsstämpeln kopieras rakt av från kategorin i
// stället för att skrivas på nytt: kvittot ska åldras i takt med uppgiften det
// kvitterar, och en tidsstämpel som aldrig lämnar databasen kan inte råka
// serialiseras i ett annat format än det Prisma läser.
const res = await db.execute(`
  INSERT INTO LeadClaim (id, leadId, key, valueBool, confidence, strength, weakness, source, fetchedAt)
  SELECT lower(hex(randomblob(16))), c.leadId, 'gmb.lookup', 1, 90, 1, 0, 'serper', c.fetchedAt
  FROM LeadClaim c
  WHERE c.key = 'gmb.category'
    AND NOT EXISTS (
      SELECT 1 FROM LeadClaim r WHERE r.leadId = c.leadId AND r.key = 'gmb.lookup'
    )`);

console.log(`\nKlart. ${res.rowsAffected} kvitton skrivna.`);
