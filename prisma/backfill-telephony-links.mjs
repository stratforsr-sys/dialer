// Kopplar ihop redan mottagna växelsamtal med säljarnas registreringar.
//   node prisma/backfill-telephony-links.mjs --dry-run
//   node prisma/backfill-telephony-links.mjs
//
// Bakgrund: kopplingen gjordes fram till nu bara när webhooken kom in, och
// Lynes rapporterar i samma ögonblick som luren läggs på — alltså innan
// säljaren hunnit dispositionera. Webhooken letade därför efter en rad som
// ännu inte fanns. 368 av 471 utgående samtal den 14 augusti 2026 låg kvar
// okopplade av det skälet.
//
// `src/lib/telephony/link.ts` stänger cirkeln framåt. Det här scriptet gör
// samma sak bakåt, på det som redan ligger i databasen.
//
// Idempotent: rör bara växelsamtal utan `callAttemptId` och registreringar
// utan `providerCallId`. Kan köras om.

import { createClient } from "@libsql/client";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env.local") });

const dryRun = process.argv.includes("--dry-run");

// Samma fönster som src/lib/telephony/link.ts, mätt från samtalets SLUT.
// Duplicerat medvetet: scriptet ska kunna köras utan att bygga TypeScript.
// Ändras det ena måste det andra ändras med.
const LINK_BEFORE_MS = 90 * 1000;
const LINK_AFTER_MS = 2 * 60 * 1000;

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const ms = (s) => (s ? Date.parse(s) : null);

const calls = await db.execute(`
  SELECT id, providerCallId, userId, leadId, otherPartyE164, endedAt,
         durationSec, recordingUrl
  FROM TelephonyCall
  WHERE callAttemptId IS NULL
    AND direction IS NOT 'INBOUND'
    AND userId IS NOT NULL
    AND endedAt IS NOT NULL
  ORDER BY endedAt
`);

const attempts = await db.execute(`
  SELECT id, sellerId, leadId, dialedE164, startedAt, durationSec
  FROM CallAttempt
  WHERE providerCallId IS NULL
`);

console.log(`okopplade växelsamtal:      ${calls.rows.length}`);
console.log(`okopplade registreringar:   ${attempts.rows.length}`);

// En registrering får kopplas till exakt ett samtal. Utan det tar två samtal
// till samma bolag inom fönstret samma registrering, och den ena
// samtalslängden skriver över den andra.
const taken = new Set();
const pairs = [];

for (const call of calls.rows) {
  const end = ms(call.endedAt);
  if (end === null) continue;

  let best = null;
  let bestDist = Infinity;

  for (const a of attempts.rows) {
    if (taken.has(a.id)) continue;
    if (a.sellerId !== call.userId) continue;

    const sameLead = a.leadId && call.leadId && a.leadId === call.leadId;
    const sameNumber =
      a.dialedE164 && call.otherPartyE164 && a.dialedE164 === call.otherPartyE164;
    if (!sameLead && !sameNumber) continue;

    const at = ms(a.startedAt);
    if (at === null) continue;
    // Registreringen skrivs efter samtalets slut; före-fönstret finns för att
    // sluttiden är härledd ur startTime + duration och kan ligga någon sekund
    // fel.
    if (at < end - LINK_AFTER_MS || at > end + LINK_BEFORE_MS) continue;

    const dist = Math.abs(at - end);
    if (dist < bestDist) {
      bestDist = dist;
      best = a;
    }
  }

  if (!best) continue;
  taken.add(best.id);
  pairs.push({ call, attempt: best, dist: Math.round(bestDist / 1000) });
}

console.log(`\nmatchade par:               ${pairs.length}`);
console.log(`växelsamtal utan match:     ${calls.rows.length - pairs.length}`);

const buckets = { "0-30 s": 0, "30-120 s": 0, "över 120 s": 0 };
for (const p of pairs) {
  const d = Math.abs(p.dist);
  if (d <= 30) buckets["0-30 s"]++;
  else if (d <= 120) buckets["30-120 s"]++;
  else buckets["över 120 s"]++;
}
console.log("avstånd samtalsslut → registrering:");
for (const [k, v] of Object.entries(buckets)) console.log(`  ${k.padEnd(12)} ${v}`);

if (dryRun) {
  console.log("\n--dry-run: inget skrivet.");
  for (const p of pairs.slice(0, 5)) {
    console.log(
      `  ${p.call.providerCallId} → ${p.attempt.id}  (+${p.dist}s, ${p.call.durationSec}s samtal)`
    );
  }
  process.exit(0);
}

let linked = 0;
let failed = 0;

for (const { call, attempt } of pairs) {
  const sets = ["providerCallId = ?"];
  const args = [call.providerCallId];

  // durationSec har DEFAULT 0 — noll betyder "aldrig satt". Cockpitens egen
  // mätning är tiden dispositionsrutan var öppen, inte samtalet.
  if (!attempt.durationSec && call.durationSec) {
    sets.push("durationSec = ?");
    args.push(call.durationSec);
  }
  if (call.recordingUrl) {
    sets.push("recordingUrl = ?");
    args.push(call.recordingUrl);
  }
  args.push(attempt.id);

  try {
    await db.batch(
      [
        { sql: `UPDATE CallAttempt SET ${sets.join(", ")} WHERE id = ?`, args },
        {
          sql: "UPDATE TelephonyCall SET callAttemptId = ? WHERE id = ?",
          args: [attempt.id, call.id],
        },
      ],
      "write"
    );
    linked++;
  } catch (err) {
    failed++;
    console.error(`  ${call.providerCallId}: ${err.message}`);
  }
}

console.log(`\nkopplade: ${linked}`);
if (failed) console.log(`misslyckade: ${failed}`);
