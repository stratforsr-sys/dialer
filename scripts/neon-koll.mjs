// Kollar uppkopplingen mot Neon och mäter vad en fråga faktiskt kostar.
//
//   node scripts/neon-koll.mjs
//
// Två saker den svarar på, båda sådana som annars upptäcks för sent:
//
//   1. Fungerar BÅDA strängarna? Prisma använder `DATABASE_URL` (poolern) för
//      appen och `DIRECT_URL` (direkt till computen) för schemaoperationer.
//      Poolern klarar inte allt schemaarbete, och en direktsträng som saknas
//      märks först när en migration ska köras.
//
//   2. Vad kostar en tur och retur? Det är den siffran som avgör hur appen
//      känns, och den beror på avståndet mellan Vercels region och Neons.
//      Mätt 2026-09-29 från Sverige: us-east-1 ~100 ms, eu-central-1 ~32 ms.
//      Vercel kör i `dub1` (Dublin) enligt vercel.json — flyttas appen till
//      `fra1` hamnar den i samma region som databasen.

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { Client } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env.local") });

const strangar = [
  ["pooler  (DATABASE_URL)", process.env.DATABASE_URL],
  ["direkt  (DIRECT_URL)", process.env.DIRECT_URL],
];

let fel = 0;

for (const [namn, url] of strangar) {
  if (!url) {
    console.log(`✗ ${namn}: saknas i .env.local`);
    fel++;
    continue;
  }

  const c = new Client({ connectionString: url });
  try {
    const t0 = Date.now();
    await c.connect();
    const uppkoppling = Date.now() - t0;

    const info = await c.query("select version(), current_database(), current_user");

    // Fem korta frågor på en redan öppen anslutning. `select 1` gör inget
    // arbete, så det som mäts är nätverkets tur och retur — inte databasen.
    const t1 = Date.now();
    for (let i = 0; i < 5; i++) await c.query("select 1");
    const rtt = (Date.now() - t1) / 5;

    const v = info.rows[0];
    console.log(`✓ ${namn}`);
    console.log(`    uppkoppling ${uppkoppling} ms   tur-och-retur ${rtt.toFixed(1)} ms`);
    console.log(`    ${v.version.split(" ").slice(0, 2).join(" ")}  db=${v.current_database}  user=${v.current_user}`);

    // Vad som ligger i databasen. Räknas bara på direktanslutningen — samma
    // svar två gånger säger inget nytt.
    if (namn.startsWith("direkt")) {
      const en = async (sql) => (await c.query(sql)).rows[0].n;
      const tabeller = await en(`select count(*)::int n from information_schema.tables
                                 where table_schema='public' and table_type='BASE TABLE'`);
      const enums = await en(`select count(distinct t.typname)::int n from pg_type t
                              join pg_enum e on e.enumtypid = t.oid`);
      const index = await en(`select count(*)::int n from pg_indexes where schemaname='public'`);
      const fk = await en(`select count(*)::int n from information_schema.table_constraints
                           where constraint_schema='public' and constraint_type='FOREIGN KEY'`);
      console.log(`\n  schema: ${tabeller} tabeller, ${enums} enum-typer, ${index} index, ${fk} främmande nycklar`);

      // Radantal per tabell — noll överallt före inläsningen, och efteråt det
      // som ska stämma mot SQLite-sidan.
      const rader = await c.query(`
        select relname as tabell, n_live_tup::int as rader
        from pg_stat_user_tables where n_live_tup > 0
        order by n_live_tup desc limit 12
      `);
      console.log(rader.rows.length === 0
        ? "  data:   tom"
        : "  data:   " + rader.rows.map((r) => `${r.tabell}=${r.rader}`).join("  "));
    }

    await c.end();
  } catch (e) {
    console.log(`✗ ${namn}: ${e.message}`);
    fel++;
    try { await c.end(); } catch {}
  }
}

process.exit(fel === 0 ? 0 : 1);
