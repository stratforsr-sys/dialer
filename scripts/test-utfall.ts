/**
 * Verifiering av utfallshinkarna.
 *   node --experimental-strip-types scripts/test-utfall.ts
 *
 * Det som måste hålla: **`lastOutcome` vinner över `lastResult`.**
 *
 * Ett `CONNECTED_DM` som slutade i ett nej ska läsas som "sa nej", inte som
 * "nådde beslutsfattaren". Faller den regeln blir mappens fördelning en bild
 * av hur många som svarade i stället för av vad de svarade — och det var
 * precis den skillnaden som saknades i mappvyn.
 *
 * Reglerna går att få subtilt fel på ett sätt ingen upptäcker förrän en chef
 * räknar om för hand. Därför ett prov och inte bara ett svep i UI:t.
 */

import { utfallAv, utfallsfordelning, UTFALL_ORDNING } from "../src/lib/utfall.ts";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${detail}`); }
}

const RINGT = new Date("2026-09-01T10:00:00Z");

console.log("\nUtfallet vinner över resultatet");

check(
  "nådde DM + sa nej  →  sa nej",
  utfallAv({ lastAttemptAt: RINGT, lastResult: "CONNECTED_DM", lastOutcome: "DM_NO" }).key === "nej"
);
check(
  "nådde DM + såld  →  såld",
  utfallAv({ lastAttemptAt: RINGT, lastResult: "CONNECTED_DM", lastOutcome: "SOLD" }).key === "sald"
);
check(
  "nådde DM + bokad  →  återkomst",
  utfallAv({ lastAttemptAt: RINGT, lastResult: "CONNECTED_DM", lastOutcome: "CALLBACK_BOOKED" }).key === "aterkomst"
);
check(
  "nådde DM UTAN utfall  →  nådde DM (inte 'svarar ej')",
  utfallAv({ lastAttemptAt: RINGT, lastResult: "CONNECTED_DM", lastOutcome: null }).key === "natt_dm"
);

console.log("\nFel beslutsfattare är inget nej");

// Räknas de ihop ser ett lead med fel kontaktuppgift ut som ett lead som
// tackat nej, och bolaget dör i statistiken utan att någon frågat rätt person.
check(
  "WRONG_DM  →  egen hink",
  utfallAv({ lastAttemptAt: RINGT, lastResult: "CONNECTED_DM", lastOutcome: "WRONG_DM" }).key === "fel_beslutsfattare"
);

console.log("\nVäxelutfallen faller ihop till en hink");

for (const o of ["GATEKEEPER_BLOCKED", "GATEKEEPER_TRANSFERRED", "GATEKEEPER_GAVE_DM_DETAILS"] as const) {
  check(
    `${o}  →  växeln`,
    utfallAv({ lastAttemptAt: RINGT, lastResult: "CONNECTED_GATEKEEPER", lastOutcome: o }).key === "vaxel"
  );
}

console.log("\nObesvarade samtal");

for (const r of ["NO_ANSWER", "BUSY", "VOICEMAIL_LEFT", "VOICEMAIL_NO_MESSAGE"] as const) {
  check(`${r}  →  svarar ej`, utfallAv({ lastAttemptAt: RINGT, lastResult: r, lastOutcome: null }).key === "svarar_ej");
}
check(
  "WRONG_NUMBER  →  fel nummer",
  utfallAv({ lastAttemptAt: RINGT, lastResult: "WRONG_NUMBER", lastOutcome: null }).key === "fel_nummer"
);
check(
  "BORTFALL  →  eget, inte 'fel nummer'",
  utfallAv({ lastAttemptAt: RINGT, lastResult: "BORTFALL", lastOutcome: null }).key === "bortfall"
);

console.log("\nlastAttemptAt avgör om bolaget ringts");

check(
  "utan lastAttemptAt  →  aldrig ringt",
  utfallAv({ lastAttemptAt: null, lastResult: null, lastOutcome: null }).key === "oringd"
);
// Taket i computeNext nollställer attemptCount men aldrig lastAttemptAt. Ett
// lead som gått ett helt varv och nollställts är fortfarande ringt — 133 leads
// i Clicknet Lista 1 skilde på just det.
check(
  "lastAttemptAt utan resultat räknas ändå som ringt",
  utfallAv({ lastAttemptAt: RINGT, lastResult: null, lastOutcome: null }).called === true
);
check(
  "ett resultat UTAN lastAttemptAt räknas inte som ringt",
  utfallAv({ lastAttemptAt: null, lastResult: "NO_ANSWER", lastOutcome: null }).called === false
);

console.log("\nFördelningen");

const mapp = [
  { lastAttemptAt: RINGT, lastResult: "CONNECTED_DM" as const, lastOutcome: "SOLD" as const },
  { lastAttemptAt: RINGT, lastResult: "CONNECTED_DM" as const, lastOutcome: "DM_NO" as const },
  { lastAttemptAt: RINGT, lastResult: "CONNECTED_DM" as const, lastOutcome: "DM_NO" as const },
  { lastAttemptAt: RINGT, lastResult: "NO_ANSWER" as const, lastOutcome: null },
  { lastAttemptAt: null, lastResult: null, lastOutcome: null },
  { lastAttemptAt: null, lastResult: null, lastOutcome: null },
];
const f = utfallsfordelning(mapp);

check("ringda räknas rätt", f.ringda === 4, String(f.ringda));
check("total är hela mappen", f.total === 6, String(f.total));
check("bara hinkar som förekommer kommer med", f.rader.length === 4, String(f.rader.length));
check(
  "andelen räknas mot HELA mappen, inte mot de ringda",
  Math.abs((f.rader.find((r) => r.def.key === "nej")?.andel ?? 0) - 2 / 6) < 1e-9
);
check(
  "raderna kommer i UTFALL_ORDNING",
  f.rader.map((r) => r.def.key).join(",") ===
    UTFALL_ORDNING.filter((k) => f.rader.some((r) => r.def.key === k)).join(",")
);
check("summan av hinkarna är hela mappen", f.rader.reduce((s, r) => s + r.n, 0) === 6);

console.log("\nTom mapp");
const tom = utfallsfordelning([]);
check("inga rader", tom.rader.length === 0);
check("ingen division med noll", tom.ringda === 0 && tom.total === 0);

console.log(`\n${pass} godkända, ${fail} underkända\n`);
if (fail > 0) process.exit(1);
