/**
 * Verifiering av däckets tillstånd — särskilt grenen "bearbetat utan nummer".
 *   node --experimental-strip-types scripts/test-deck-state.ts
 *
 * Det som måste hålla: **ett OBEARBETAT bolag utan nummer är ringbart.**
 *
 * Grenen är tvådelad med flit, och halva den är lätt att tappa vid en
 * omskrivning. Tappas `lastAttemptAt`-ledet försvinner 13 500 obearbetade
 * bolag ur rotationen över en natt — precis det felet som filtret på
 * kontaktrad orsakade fram till 2026-08-25, då 986 av 1 000 bolag i
 * `leads_bygg_hantverk` var osynliga för däcket. Uppslagningen ÄR arbetet;
 * det är först när den är gjord och kortet ändå är tomt som en ny utdelning
 * bara är samma sökning en gång till.
 *
 * `deckState` speglar WHERE-satsen i `leaseNextLeads`. Provet bevisar bara den
 * här sidan — går de isär säger mappen och däcket olika saker om samma bolag,
 * och det är inget en typkontroll fångar.
 */

import { deckState, deckStateLabel, isOutOfRotation } from "../src/lib/deck-state.ts";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${detail}`); }
}

const NU = new Date("2026-09-16T09:00:00Z");
const RINGT = new Date("2026-09-15T10:00:00Z");
const MAX = 8;

/** Ett bolag som inte träffar någon annan gren: ringbart om inget annat säger emot. */
const bas = {
  retired: false,
  retiredReason: null,
  hasActiveDeal: false,
  attemptCount: 1,
  callbackAt: null,
  nextActionAt: null,
};

console.log("\nBearbetat utan nummer");

check(
  "ringt + inget nummer  →  ur rotationen",
  deckState({ ...bas, lastAttemptAt: RINGT, hasPhone: false }, MAX, NU).state ===
    "worked_no_phone"
);

check(
  "ALDRIG ringt + inget nummer  →  ringbart (uppslagningen är arbetet)",
  deckState(
    { ...bas, attemptCount: 0, lastAttemptAt: null, hasPhone: false },
    MAX,
    NU
  ).state === "callable"
);

check(
  "ringt + har nummer  →  ringbart",
  deckState({ ...bas, lastAttemptAt: RINGT, hasPhone: true }, MAX, NU).state === "callable"
);

check(
  "hasPhone okänt  →  grenen hoppas över, ingen gissning",
  deckState({ ...bas, lastAttemptAt: RINGT }, MAX, NU).state === "callable"
);

console.log("\nPrioritet mot de grenar som svarar på 'när kommer det tillbaka'");

check(
  "vilan får inte vinna — bolaget kommer inte tillbaka av en klocka",
  deckState(
    {
      ...bas,
      lastAttemptAt: RINGT,
      hasPhone: false,
      nextActionAt: new Date("2026-09-20T09:00:00Z"),
    },
    MAX,
    NU
  ).state === "worked_no_phone"
);

check(
  "taket får inte vinna — samma skäl",
  deckState({ ...bas, attemptCount: 99, lastAttemptAt: RINGT, hasPhone: false }, MAX, NU)
    .state === "worked_no_phone"
);

check(
  "en öppen återkomst vinner — löftet är ett beslut, tomt kort eller ej",
  deckState({ ...bas, lastAttemptAt: RINGT, hasPhone: false, callbackAt: RINGT }, MAX, NU)
    .state === "callback"
);

check(
  "spärrlistan vinner — kundens besked står över vår datalucka",
  deckState(
    { ...bas, lastAttemptAt: RINGT, hasPhone: false, dnc: { expiresAt: null } },
    MAX,
    NU
  ).state === "dnc"
);

check(
  "pensionering vinner",
  deckState(
    { ...bas, retired: true, retiredReason: "bortfall", lastAttemptAt: RINGT, hasPhone: false },
    MAX,
    NU
  ).state === "retired"
);

console.log("\nEtikett och filter");

check(
  "raden får en text att läsa",
  deckStateLabel({ state: "worked_no_phone" }) === "Bearbetat — inget nummer sparat"
);

check(
  "räknas som ur rotationen — det är listan en omimport skulle lyfta",
  isOutOfRotation({ state: "worked_no_phone" })
);

check(
  "ett vilande bolag räknas INTE som ur rotationen",
  !isOutOfRotation({ state: "resting", until: NU, saidNo: false })
);

console.log(`\n${pass} godkända, ${fail} underkända`);
if (fail > 0) process.exit(1);
