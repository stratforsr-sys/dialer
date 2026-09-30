// Jämför SQLite-sidan med Neon-sidan, tabell för tabell.
//
//   node scripts/neon-jamfor.mjs              — jämför schema och radantal
//
// Körs både FÖRE inläsningen (ska visa alla tabeller tomma på Neon-sidan) och
// EFTER (ska visa exakt samma radantal på båda sidor). Det är den enda
// kontrollen som säger att flytten är komplett — "inga fel under inläsningen"
// säger bara att inget kastade.
//
// SQLite-sidan läses ur reservdatabasen, som är produktionen fram till
// cutovern. Sökvägen kan pekas om med SQLITE_DB.

import { config } from "dotenv";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { Client } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env.local") });

const SQLITE =
  process.env.SQLITE_DB ||
  join(process.env.HOME, "dialer-failover/sqld-data/dbs/default/data");

const sq = (sql) => execFileSync("sqlite3", [SQLITE, sql], { encoding: "utf8" }).trim();

// `_migrations` är bokföring för migrationskörningen och ingen Prisma-modell.
// Den ska inte finnas på Neon-sidan och räknas därför inte som en avvikelse.
const UTANFOR = new Set(["_migrations", "sqlite_stat1"]);

const sqliteTabeller = sq(
  `select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name`
)
  .split("\n")
  .filter((t) => t && !UTANFOR.has(t));

const c = new Client({ connectionString: process.env.DIRECT_URL });
await c.connect();

const pgTabeller = (
  await c.query(
    `select table_name from information_schema.tables
     where table_schema='public' and table_type='BASE TABLE' order by 1`
  )
).rows.map((r) => r.table_name);

const pgSet = new Set(pgTabeller);
const sqSet = new Set(sqliteTabeller);

const saknasIPg = sqliteTabeller.filter((t) => !pgSet.has(t));
const extraIPg = pgTabeller.filter((t) => !sqSet.has(t));

console.log(`SQLite: ${sqliteTabeller.length} tabeller   Neon: ${pgTabeller.length} tabeller\n`);

if (saknasIPg.length) console.log(`✗ saknas i Neon: ${saknasIPg.join(", ")}`);
if (extraIPg.length) console.log(`  extra i Neon (ej från schemat): ${extraIPg.join(", ")}`);

// Radantal per tabell. `count(*)` och inte `n_live_tup`: den senare är en
// uppskattning ur statistiken och kan ligga efter en nyss avslutad inläsning.
let avvikande = 0;
let sqliteTotalt = 0;
let pgTotalt = 0;
const rader = [];

for (const t of sqliteTabeller) {
  if (!pgSet.has(t)) continue;
  const a = Number(sq(`select count(*) from "${t}"`));
  const b = Number((await c.query(`select count(*)::int as n from "${t}"`)).rows[0].n);
  sqliteTotalt += a;
  pgTotalt += b;
  if (a !== b) {
    avvikande++;
    rader.push(`  ✗ ${t.padEnd(24)} SQLite ${String(a).padStart(7)}   Neon ${String(b).padStart(7)}`);
  } else if (a > 0) {
    rader.push(`  ✓ ${t.padEnd(24)} ${String(a).padStart(7)}`);
  }
}

console.log(rader.join("\n") || "  (inga rader på någon sida)");
console.log(`\nSQLite ${sqliteTotalt} rader   Neon ${pgTotalt} rader`);

await c.end();

if (saknasIPg.length || avvikande) {
  console.log(`\n✗ ${saknasIPg.length} saknade tabeller, ${avvikande} med olika radantal.`);
  process.exit(1);
}
console.log("\n✓ Tabelluppsättning och radantal stämmer.");
