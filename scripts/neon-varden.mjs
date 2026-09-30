// Stickprov på VÄRDENA, inte bara radantalen.
//
//   node scripts/neon-varden.mjs
//
// Radantal säger att lika många rader kom fram. Det säger ingenting om att de
// bär samma värden. Två konverteringar kunde gått fel tyst:
//
//   Boolean   SQLite 0/1 -> Postgres boolean. Blir allt `true` eller allt
//             `false` stämmer radantalet fortfarande perfekt.
//   DateTime  ISO-text -> timestamp. En tidszonsförskjutning på två timmar
//             syns inte i någon räkning, men flyttar varje återkomst.

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createClient } from "@libsql/client";
import { Client } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env.local") });

const SQLITE = process.env.SQLITE_DB || join(process.env.HOME, "dialer-failover/sqld-data/dbs/default/data");
const lite = createClient({ url: `file:${SQLITE}` });
const pg = new Client({ connectionString: process.env.DIRECT_URL });
await pg.connect();

let fel = 0;
const kolla = (namn, a, b) => {
  const ok = String(a) === String(b);
  if (!ok) fel++;
  console.log(`  ${ok ? "✓" : "✗"} ${namn.padEnd(46)} SQLite ${String(a).padStart(9)}   Neon ${String(b).padStart(9)}`);
};

const sl = async (sql) => Object.values((await lite.execute(sql)).rows[0])[0];
const pl = async (sql) => Object.values((await pg.query(sql)).rows[0])[0];

console.log("\nBooleaner — fördelningen måste vara densamma\n");
// Summan och inte de två talen var för sig: pensioneringar sker medan
// produktionen lever, men sant + falskt måste alltid bli alla rader.
kolla("Lead: sant + falskt = alla rader", await sl(`select count(*) from "Lead"`), await pl(`select (select count(*) from "Lead" where retired = true) + (select count(*) from "Lead" where retired = false)`));
kolla("Lead.hasActiveDeal = falskt", await sl(`select count(*) from "Lead" where hasActiveDeal = 0`), await pl(`select count(*)::int from "Lead" where "hasActiveDeal" = false`));
kolla("Lead.hasActiveDeal = sant",  await sl(`select count(*) from "Lead" where hasActiveDeal = 1`),  await pl(`select count(*)::int from "Lead" where "hasActiveDeal" = true`));
kolla("LeadOnList.createdByImport = sant", await sl(`select count(*) from "LeadOnList" where createdByImport = 1`), await pl(`select count(*)::int from "LeadOnList" where "createdByImport" = true`));

console.log("\nDatum — samma yttervärden, ingen tidszonsförskjutning\n");
// Millisekunder med, annars faller jämförelsen på formatet i stället för på
// innehållet. `at time zone 'UTC'` speglar att SQLite lagrar UTC-text — en
// förskjutning här vore det allvarligaste felet en sådan här flytt kan ge.
const FMT = `'YYYY-MM-DD"T"HH24:MI:SS.MS'`;
kolla("max(Activity.timestamp)",    (await sl(`select max(timestamp) from "Activity"`)).slice(0, 23),    await pl(`select to_char(max("timestamp") at time zone 'UTC',${FMT}) from "Activity"`));
kolla("max(CallAttempt.startedAt)", (await sl(`select max(startedAt) from "CallAttempt"`)).slice(0, 23), await pl(`select to_char(max("startedAt") at time zone 'UTC',${FMT}) from "CallAttempt"`));
// Ett datum långt bak i tiden rörs inte av pågående arbete och isolerar
// därför konverteringen från driften.
kolla("min(CallAttempt.startedAt)", (await sl(`select min(startedAt) from "CallAttempt"`)).slice(0, 23), await pl(`select to_char(min("startedAt") at time zone 'UTC',${FMT}) from "CallAttempt"`));
kolla("öppna återkomster",          await sl(`select count(*) from "Callback" where status = 'PENDING'`), await pl(`select count(*)::int from "Callback" where status = 'PENDING'`));

console.log("\nNULL ska förbli NULL\n");
kolla("Lead.callbackAt är NULL",    await sl(`select count(*) from "Lead" where callbackAt is null`),  await pl(`select count(*)::int from "Lead" where "callbackAt" is null`));
kolla("Lead.orgNumber är NULL",     await sl(`select count(*) from "Lead" where orgNumber is null`),   await pl(`select count(*)::int from "Lead" where "orgNumber" is null`));

console.log("\nText med specialtecken\n");
kolla("bolagsnamn med apostrof",    await sl(`select count(*) from "Lead" where companyName like '%''%'`), await pl(`select count(*)::int from "Lead" where "companyName" like '%''%'`));
kolla("anteckningar med radbrytning", await sl(`select count(*) from "CallAttempt" where note like '%' || char(10) || '%'`), await pl(`select count(*)::int from "CallAttempt" where note like '%' || chr(10) || '%'`));

console.log(fel === 0 ? "\n✓ Värdena stämmer.\n" : `\n✗ ${fel} avvikelser.\n`);
await pg.end();
process.exit(fel === 0 ? 0 : 1);
