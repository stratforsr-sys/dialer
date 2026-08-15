// Räknar om CallAttempt.hourOfDay och .weekday till svensk väggklocka.
//   node prisma/backfill-hour-weekday.mjs --dry-run
//   node prisma/backfill-hour-weekday.mjs
//
// Fram till 2026-08-15 skrevs båda kolumnerna med `now.getHours()` och
// `now.getDay()` i recordAttempt. Vercel kör i UTC, så varje rad bär UTC-tiden:
// ett samtal klockan 09:30 svensk sommartid står som timme 7. Alla 1 106 rader
// som fanns vid rättelsen hade hourOfDay exakt lika med UTC-timmen — det var
// så buggen bekräftades.
//
// Kolumnerna läses ännu inte av någon vy. Det är just därför rättelsen görs nu:
// blandas två betydelser i samma kolumn går den aldrig att lita på igen, och
// felet upptäcks först den dag någon bygger "bästa tid att ringa" ovanpå den.
//
// Sanningen räknas ur `startedAt`, som är en riktig tidsstämpel och därmed
// entydig. Idempotent: skriver bara rader där värdet faktiskt skiljer sig, så
// den kan köras om utan att ställa till något.

import { createClient } from "@libsql/client";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env.local") });

const dryRun = process.argv.includes("--dry-run");
const TZ = "Europe/Stockholm";

// Samma logik som hourOfDay/weekdayOf i src/lib/time.ts. Duplicerad medvetet:
// scriptet ska kunna köras fristående utan att bygga TypeScript.
function wallClock(at) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  }).formatToParts(at);
  const p = {};
  for (const { type, value } of parts) p[type] = value;
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour };
}

function swedish(at) {
  const w = wallClock(at);
  const day = new Date(Date.UTC(w.y, w.m - 1, w.d)).getUTCDay();
  return { hour: w.hh, weekday: day === 0 ? 7 : day };
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const { rows } = await db.execute(
  "SELECT id, startedAt, hourOfDay, weekday FROM CallAttempt ORDER BY startedAt"
);

console.log(`registreringar: ${rows.length}`);

const changes = [];
let unparsable = 0;

for (const r of rows) {
  const at = new Date(r.startedAt);
  if (Number.isNaN(at.getTime())) {
    unparsable++;
    continue;
  }
  const { hour, weekday } = swedish(at);
  if (hour !== r.hourOfDay || weekday !== r.weekday) {
    changes.push({ id: r.id, hour, weekday, was: r.hourOfDay, wasDay: r.weekday });
  }
}

console.log(`behöver rättas: ${changes.length}`);
if (unparsable) console.log(`otolkbar startedAt: ${unparsable}`);

// Förskjutningens storlek. Två timmar är väntat under sommartid, en timme
// under vintertid — något annat betyder att antagandet om buggen är fel.
const shifts = {};
for (const c of changes) {
  const d = ((c.hour - c.was + 24) % 24);
  shifts[`+${d} h`] = (shifts[`+${d} h`] ?? 0) + 1;
}
console.log("förskjutning:", shifts);

const dayChanges = changes.filter((c) => c.weekday !== c.wasDay).length;
console.log(`byter dessutom veckodag: ${dayChanges}`);

if (dryRun) {
  console.log("\n--dry-run: inget skrivet.");
  for (const c of changes.slice(0, 5)) {
    console.log(`  ${c.id}  timme ${c.was} → ${c.hour}, dag ${c.wasDay} → ${c.weekday}`);
  }
  process.exit(0);
}

// Batchat: 1 100 enskilda round-trips mot Turso tar minuter, en batch tar
// sekunder. Storleken håller varje batch under libsql:s gräns för antal
// satser per anrop.
const BATCH = 100;
let written = 0;

for (let i = 0; i < changes.length; i += BATCH) {
  const slice = changes.slice(i, i + BATCH);
  await db.batch(
    slice.map((c) => ({
      sql: "UPDATE CallAttempt SET hourOfDay = ?, weekday = ? WHERE id = ?",
      args: [c.hour, c.weekday, c.id],
    })),
    "write"
  );
  written += slice.length;
}

console.log(`\nrättade: ${written}`);
