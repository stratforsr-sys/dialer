// Kör appens RÅA SQL-frågor mot Neon, i samma form koden bygger dem.
//
//   node scripts/neon-prova-raa-fragor.mjs
//
// Prisma översätter sina egna frågor mellan dialekter. De sju `$queryRawUnsafe`
// vi skriver själva översätter den inte — och det är där ett dialektfel skulle
// sitta. Det här provet kör dem mot riktig data i Neon innan cutovern, så att
// ett `rowid` eller ett `= 1` inte upptäcks av en säljare.
//
// Frågorna är kopierade ur `actions/dialer.ts` och `actions/lists.ts` i den
// form `bind()` lämnar dem. Ändras frågorna där ska de ändras här — provet är
// en spegel, inte en sanning, och en spegel som slutat likna är värre än ingen.

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { Client } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env.local") });

// Samma funktion som src/lib/sql.ts, med Postgres påslaget.
function bind(sql) {
  let n = 0;
  return sql.replace(/\?/g, () => `$${++n}`);
}

const pg = new Client({ connectionString: process.env.DIRECT_URL });
await pg.connect();

let fel = 0;
async function prov(namn, sql, args, forvantat) {
  try {
    const r = await pg.query(bind(sql), args);
    const ok = forvantat ? forvantat(r) : true;
    if (!ok) fel++;
    console.log(`  ${ok ? "✓" : "✗"} ${namn.padEnd(44)} ${r.rowCount} rader`);
  } catch (e) {
    fel++;
    console.log(`  ✗ ${namn.padEnd(44)} ${e.message.split("\n")[0]}`);
  }
}

const nu = new Date().toISOString();
const användare = (await pg.query(`select id from "User" where role='SELLER' limit 1`)).rows[0]?.id;
const mapp = (await pg.query(`select "listId" from "LeadOnList" group by "listId" order by count(*) desc limit 1`)).rows[0]?.listId;

console.log("\nRåa frågor mot Neon\n");

// ── getLists: rollupen ─────────────────────────────────────────────────────
await prov(
  "getLists — rollup per mapp",
  `SELECT lol."listId" AS "listId",
          CASE WHEN l."lastAttemptAt" IS NOT NULL THEN 1 ELSE 0 END AS "ringd",
          l."lastResult"  AS "lastResult",
          l."lastOutcome" AS "lastOutcome",
          CASE WHEN l."retired" = true OR l."hasActiveDeal" = true THEN 1 ELSE 0 END AS "retired",
          CASE WHEN l."claimedAt" IS NOT NULL AND l."claimedAt" >= ? THEN 1 ELSE 0 END AS "claimed",
          COUNT(*) AS "n"
   FROM "LeadOnList" lol
   JOIN "Lead" l ON l."id" = lol."leadId"
   WHERE lol."listId" IN (?)
   GROUP BY 1, 2, 3, 4, 5, 6`,
  [nu, mapp],
  (r) => r.rowCount > 0
);

// ── getList: ärvda utfall ──────────────────────────────────────────────────
await prov(
  "getList — ärvda utfall",
  `SELECT COUNT(*) AS "n" FROM "LeadOnList" lol
   WHERE lol."listId" = ?
     AND EXISTS (SELECT 1 FROM "CallAttempt" ca
                 WHERE ca."leadId" = lol."leadId"
                   AND (ca."listId" IS NULL OR ca."listId" <> lol."listId"))`,
  [mapp]
);

// ── getList: kontaktantalet (ersätter Prismas _count) ──────────────────────
await prov(
  "getList — kontaktantal per bolag",
  `SELECT lol."leadId" AS "leadId", COUNT(c."id") AS "n"
   FROM "LeadOnList" lol
   LEFT JOIN "Contact" c ON c."leadId" = lol."leadId"
   WHERE lol."listId" = ?
   GROUP BY lol."leadId"
   HAVING COUNT(c."id") > 0`,
  [mapp],
  (r) => r.rowCount > 0
);

// ── leaseNextLeads: däckets utdelning ──────────────────────────────────────
//
// `rowid` fanns här i SQLite-versionen och finns INTE i Postgres. Primärnyckeln
// `id` gör samma sak. Frågan körs i en transaktion som rullas tillbaka — den
// SKRIVER, och det här provet får inte dela ut bolag på riktigt.
await pg.query("BEGIN");
await prov(
  "leaseNextLeads — utdelning (id i stället för rowid)",
  `UPDATE "Lead"
      SET "leasedById" = ?, "leasedUntil" = ?
    WHERE "id" IN (
      SELECT l."id" FROM "Lead" l
      WHERE l."retired" = false
        AND l."hasActiveDeal" = false
        AND (l."nextActionAt" IS NULL OR l."nextActionAt" <= ?)
        AND (l."ownerId" = ? OR EXISTS (
              SELECT 1 FROM "LeadOnList" lol2
              JOIN "ListAccess" la ON la."listId" = lol2."listId"
              WHERE lol2."leadId" = l."id" AND la."userId" = ?))
      ORDER BY
        CASE WHEN l."callbackAt" IS NOT NULL AND l."callbackAt" <= ? THEN 0 ELSE 1 END,
        CASE WHEN EXISTS (
          SELECT 1 FROM "Contact" c
          WHERE c."leadId" = l."id"
            AND (c."directPhoneE164" IS NOT NULL OR c."switchboardE164" IS NOT NULL
                 OR c."directPhone" IS NOT NULL OR c."switchboard" IS NOT NULL)
        ) THEN 0 ELSE 1 END,
        l."nextActionAt" ASC,
        l."attemptCount" ASC,
        l."updatedAt" ASC
      LIMIT ?
    )
    AND ("leasedUntil" IS NULL OR "leasedUntil" < ?)
    RETURNING "id"`,
  [användare, nu, nu, användare, användare, nu, 5, nu],
  (r) => r.rowCount > 0
);

// ── renewLeases ────────────────────────────────────────────────────────────
await prov(
  "renewLeases — förnyar hållna lås",
  `UPDATE "Lead"
      SET "leasedUntil" = ?
    WHERE "id" IN (?)
      AND "leasedById" = ?
    RETURNING "id"`,
  [nu, (await pg.query(`select id from "Lead" limit 1`)).rows[0].id, användare]
);
await pg.query("ROLLBACK");
console.log("  (skrivande prov rullades tillbaka)");

console.log(fel === 0 ? "\n✓ Alla råa frågor kör mot Postgres.\n" : `\n✗ ${fel} frågor fallerade.\n`);
await pg.end();
process.exit(fel === 0 ? 0 : 1);
