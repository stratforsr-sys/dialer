/**
 * Verifiering av platshållaröversättningen inför flytten till Postgres.
 *   node --experimental-strip-types scripts/test-sql-bind.ts
 *
 * Det som måste hålla: numret på varje `$n` följer ordningen argumenten
 * skickas i. Ett fel här kraschar inte — frågan kör vidare och binder fel
 * värde till fel villkor, vilket i `leaseNextLeads` betyder att fel bolag
 * delas ut till fel säljare. Det är en tyst felklass, och därför den som
 * behöver ett prov mest.
 *
 * `DATABASE_URL` sätts före importen: `arPostgres` läses en gång när modulen
 * laddas, och utan variabeln är `bind` en genomsläpp som alltid ser rätt ut.
 */

process.env.DATABASE_URL = "postgresql://prov";

const { bind, arPostgres } = await import("../src/lib/sql.ts");

let pass = 0,
  fail = 0;
function check(name: string, given: string, expected: string) {
  const got = bind(given);
  if (got === expected) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}\n      fick:       ${got}\n      förväntat:  ${expected}`);
  }
}

console.log("\nbind() — SQLite `?` till Postgres `$n`\n");

check("arPostgres är på i provet", String(arPostgres), "true");

check("enkel bindning", "WHERE a = ? AND b = ?", "WHERE a = $1 AND b = $2");

check(
  "oförändrad utan frågetecken",
  'SELECT COUNT(*) FROM "Lead"',
  'SELECT COUNT(*) FROM "Lead"'
);

// `getLists` bygger sin IN-lista av lika många `?` som det finns mappar, och
// skickar `claimCutoff()` FÖRE listan. Numreringen måste följa den ordningen.
check(
  "IN-lista efter ett tidigare argument",
  `WHERE "claimedAt" >= ? AND "listId" IN (${["?", "?", "?"].join(",")})`,
  'WHERE "claimedAt" >= $1 AND "listId" IN ($2,$3,$4)',
);

// Ordningen går efter textens läsordning, inte efter rader eller nästling.
check(
  "nästlad subfråga räknas i textordning",
  'UPDATE "Lead" SET "leasedById" = ?, "leasedUntil" = ?\n' +
    ' WHERE "id" IN (SELECT l."id" FROM "Lead" l WHERE l."nextActionAt" <= ? LIMIT ?)\n' +
    '   AND ("leasedUntil" IS NULL OR "leasedUntil" < ?)',
  'UPDATE "Lead" SET "leasedById" = $1, "leasedUntil" = $2\n' +
    ' WHERE "id" IN (SELECT l."id" FROM "Lead" l WHERE l."nextActionAt" <= $3 LIMIT $4)\n' +
    '   AND ("leasedUntil" IS NULL OR "leasedUntil" < $5)',
);

// Däckets sats byggs villkorligt: `conds` växer med mapp och roll, och `args`
// pushas i takt. Provet speglar den formen eftersom det är just den som gör
// handskrivna nummer omöjliga.
const conds = ['l."retired" = false', 'l."nextActionAt" <= ?', 'l."ownerId" = ?'];
check(
  "villkorligt byggd WHERE-sats",
  `SELECT l."id" FROM "Lead" l WHERE ${conds.join(" AND ")} LIMIT ?`,
  'SELECT l."id" FROM "Lead" l WHERE l."retired" = false AND l."nextActionAt" <= $1 AND l."ownerId" = $2 LIMIT $3',
);

// Booleanerna skrivs `= true`/`= false` och ska INTE röras av översättningen.
// De fungerar i båda dialekterna och är därför inte bindningar.
check(
  "boolean-literaler lämnas i fred",
  'WHERE l."retired" = false AND l."hasActiveDeal" = true AND x = ?',
  'WHERE l."retired" = false AND l."hasActiveDeal" = true AND x = $1',
);

console.log(`\n${pass} godkända, ${fail} underkända\n`);
if (fail > 0) process.exit(1);
