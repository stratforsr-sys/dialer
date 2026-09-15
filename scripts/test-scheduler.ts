/**
 * Verifiering av uppföljningsmotorn.
 *   node --experimental-strip-types scripts/test-scheduler.ts
 *
 * Ingen testrunner — motorn är rena funktioner, och det här är den snabbaste
 * vägen till svar på frågan "gör den vad den ska". Datumaritmetik och
 * passrotation är precis den sortens logik som ser rätt ut i koden och blir
 * fel i produktion.
 */

import {
  computeNext, slotAt, pickNextSlot, alignToSlot, rotationResumeAt,
  type Slot, type SchedulerConfig,
} from "../src/lib/scheduler.ts";

const SLOTS: Slot[] = [
  { id: "tidigt", name: "Tidigt", startMinute: 465, endMinute: 525, order: 1 },
  { id: "fm", name: "Förmiddag", startMinute: 555, endMinute: 675, order: 2 },
  { id: "em", name: "Eftermiddag", startMinute: 795, endMinute: 885, order: 3 },
  { id: "sen", name: "Sen", startMinute: 930, endMinute: 1005, order: 4 },
];

const CFG: SchedulerConfig = {
  maxAttempts: 8,
  // Två varv innan bolaget pensioneras som uttömt. Produktionens värde.
  maxRounds: 2,
  cooldownDays: 30,
  retryDaysNoSalespeople: 30,
  retryHoursNoAnswer: 20,
  // Trappan: varje obesvarat samtal i rad dubblar vilan, upp till taket.
  retryBackoffFactor: 2,
  retryHoursMax: 336, // 14 dygn
  retryHoursBusy: 2,
  retryHoursVoicemail: 44,
  retryHoursGatekeeper: 68,
  // Saknades i fixturen fram till 2026-09-15, och eftersom `scripts/` är
  // undantaget från tsc fångades det aldrig av typen. `noRestDays` räknade
  // `Math.max(undefined, 30)` = NaN, så fyra prov om nej-vilan var röda på
  // main sedan migration 022 utan att någon läste dem.
  retryDaysNo: 60,
  blockedDates: ["2026-08-14"], // klämdag
};

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${detail}`); }
}

function fmt(d: Date | null) {
  if (!d) return "null";
  return `${d.toLocaleDateString("sv-SE")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ── slotAt ────────────────────────────────────────────────────────────────
console.log("\nslotAt");
check("08:00 → tidigt", slotAt(SLOTS, new Date(2026, 7, 5, 8, 0))?.id === "tidigt");
check("12:00 → inget pass (lunch)", slotAt(SLOTS, new Date(2026, 7, 5, 12, 0)) === null);
check("16:00 → sen", slotAt(SLOTS, new Date(2026, 7, 5, 16, 0))?.id === "sen");

// ── pickNextSlot ──────────────────────────────────────────────────────────
console.log("\npickNextSlot");
check(
  "oprövade föredras",
  pickNextSlot(SLOTS, ["tidigt", "fm"], new Date(2026, 7, 5, 6, 0))?.id === "em"
);
check(
  "alla prövade → tillåter återanvändning i stället för att fastna",
  pickNextSlot(SLOTS, ["tidigt", "fm", "em", "sen"], new Date(2026, 7, 5, 6, 0)) !== null
);

// ── alignToSlot ───────────────────────────────────────────────────────────
console.log("\nalignToSlot");
{
  // Onsdag 2026-08-05 kl 12:00, mål: förmiddagspasset → ska bli imorgon 09:15
  const r = alignToSlot(new Date(2026, 7, 5, 12, 0), SLOTS[1], CFG.blockedDates);
  check("efter passets slut → nästa dag i passet", r.getHours() === 9 && r.getMinutes() === 15, fmt(r));
}
{
  // Lördag → ska hoppa till måndag
  const r = alignToSlot(new Date(2026, 7, 8, 8, 0), SLOTS[0], CFG.blockedDates);
  check("helg hoppas över", r.getDay() === 1, `blev ${fmt(r)} (dag ${r.getDay()})`);
}
{
  // Spärrat datum 2026-08-14 (fredag) → ska hoppa till måndag 17:e
  const r = alignToSlot(new Date(2026, 7, 14, 8, 0), SLOTS[0], CFG.blockedDates);
  check("spärrat datum hoppas över", r.getDate() === 17, `blev ${fmt(r)}`);
}

// ── computeNext ───────────────────────────────────────────────────────────
console.log("\ncomputeNext");
const base = { attemptCount: 0, roundCount: 0, noAnswerStreak: 0, triedSlotIds: [] as string[] };
const now = new Date(2026, 7, 5, 8, 30); // onsdag, tidiga passet

{
  const d = computeNext({ lead: base, result: "NO_ANSWER", outcome: null, slots: SLOTS, config: CFG, now });
  check("svarar ej → ökar räknaren", d.attemptCount === 1);
  check("svarar ej → ökar streak", d.noAnswerStreak === 1);
  check("svarar ej → passet bokförs som prövat", d.triedSlotIds.includes("tidigt"));
  check("svarar ej → nästa pass är inte samma", d.nextSlotId !== "tidigt", `blev ${d.nextSlotId}`);
  check("svarar ej → inte vilande", !d.retired);
}
{
  const d = computeNext({ lead: base, result: "CONNECTED_DM", outcome: "DM_NO", slots: SLOTS, config: CFG, now });
  check("svar → streak nollställs", d.noAnswerStreak === 0);
  check("nej från DM → inte vilande (får ringas igen senare)", !d.retired);
}
{
  const d = computeNext({
    lead: base, result: "CONNECTED_DM", outcome: "DM_NO",
    noReason: "VILL_EJ_PRATA_SALJARE", slots: SLOTS, config: CFG, now,
  });
  const days = d.nextActionAt
    ? Math.round((d.nextActionAt.getTime() - now.getTime()) / 86_400_000)
    : -1;
  check("vill ej prata med säljare → inte spärrat", !d.retired);
  // Påståendena nedan beskrev världen FÖRE migration 022, då bara den här
  // grenen av ett nej hade en egen vila (30 dagar) och den nollställde
  // räknaren. Sedan 022 gäller `retryDaysNo` (60) som golv för varje nej, och
  // `VILL_EJ_PRATA_SALJARE` kan bara FÖRLÄNGA det — aldrig korta. Räknaren
  // nollställs inte längre: två nej i rad ska föra bolaget närmare taket, inte
  // tillbaka till ruta ett.
  check(
    "vill ej prata med säljare → minst nej-vilan, aldrig kortare",
    days >= CFG.retryDaysNo,
    `blev ${days} dagar, golv ${CFG.retryDaysNo}`
  );
  check("vill ej prata med säljare → räknaren står kvar", d.attemptCount === 1);
  check("vill ej prata med säljare → passet bokförs som prövat", d.triedSlotIds.includes("tidigt"));
}
{
  // Ett vanligt nej får SAMMA vila som det hårdaste. Utfallet bestämmer,
  // anledningen är statistik — se `noRestDays` och migration 022. Fram till
  // 2026-08-28 föll den här grenen igenom till `retryHoursNoAnswer`, alltså
  // 20 timmar, och 636 bolag låg ringbara direkt efter ett nej.
  const d = computeNext({
    lead: base, result: "CONNECTED_DM", outcome: "DM_NO",
    noReason: "PRIS", slots: SLOTS, config: CFG, now,
  });
  const days = d.nextActionAt
    ? (d.nextActionAt.getTime() - now.getTime()) / 86_400_000
    : -1;
  check(
    "nej på pris → samma långa vila som varje annat nej",
    days >= CFG.retryDaysNo,
    `blev ${days.toFixed(1)} dagar, golv ${CFG.retryDaysNo}`
  );
}
{
  const d = computeNext({ lead: base, result: "WRONG_NUMBER", outcome: null, slots: SLOTS, config: CFG, now });
  check("fel nummer → vilande direkt", d.retired && d.retiredReason === "fel_nummer");
  check("fel nummer → ingen nästa tid", d.nextActionAt === null);
}
{
  const d = computeNext({ lead: base, result: "CONNECTED_DM", outcome: "SOLD", slots: SLOTS, config: CFG, now });
  check("såld → vilande", d.retired && d.retiredReason === "sald");
}
{
  const cb = new Date(2026, 7, 12, 14, 0);
  const d = computeNext({ lead: base, result: "CONNECTED_DM", outcome: "CALLBACK_BOOKED", callbackAt: cb, slots: SLOTS, config: CFG, now });
  check("återuppringning vinner över rotationen", d.callbackAt?.getTime() === cb.getTime());
  check("återuppringning sätter nextActionAt exakt", d.nextActionAt?.getTime() === cb.getTime(), fmt(d.nextActionAt));
}
{
  const dm = new Date(2026, 7, 13, 9, 0); // torsdag
  const d = computeNext({ lead: base, result: "CONNECTED_GATEKEEPER", outcome: "GATEKEEPER_BLOCKED", dmAvailableAt: dm, slots: SLOTS, config: CFG, now });
  check("växelns tips styr nästa ringtid", d.nextActionAt !== null && d.nextActionAt >= dm, fmt(d.nextActionAt));
}
{
  const nearCap = { attemptCount: 7, roundCount: 0, noAnswerStreak: 7, triedSlotIds: ["tidigt", "fm", "em", "sen"] };
  const d = computeNext({ lead: nearCap, result: "NO_ANSWER", outcome: null, slots: SLOTS, config: CFG, now });
  check("taket nått → räknaren nollställs för nytt varv", d.attemptCount === 0);
  check("taket nått → varvet räknas upp", d.roundCount === 1);
  check("taket nått → rotationen börjar om", d.triedSlotIds.length === 0);
  check("taket nått → INTE retired, bara vilande", !d.retired);
  const days = d.nextActionAt ? Math.round((d.nextActionAt.getTime() - now.getTime()) / 86_400_000) : 0;
  check("taket nått → vila ~30 dagar", days >= 29 && days <= 33, `blev ${days} dagar (${fmt(d.nextActionAt)})`);
}
{
  // Hela rotationen: fyra försök i rad ska ringas i fyra OLIKA pass.
  // Mät passet samtalet faktiskt gjordes i — nextSlotId är passet som står
  // på tur, vilket är något annat.
  let state = { ...base };
  const calledIn: (string | null)[] = [];
  let t = new Date(2026, 7, 5, 8, 0);
  for (let i = 0; i < 4; i++) {
    calledIn.push(slotAt(SLOTS, t)?.id ?? null);
    const d = computeNext({ lead: state, result: "NO_ANSWER", outcome: null, slots: SLOTS, config: CFG, now: t });
    state = { attemptCount: d.attemptCount, roundCount: d.roundCount, noAnswerStreak: d.noAnswerStreak, triedSlotIds: d.triedSlotIds };
    t = d.nextActionAt ?? t;
  }
  check("fyra försök ringda i fyra olika pass", new Set(calledIn).size === 4, `blev ${calledIn.join(", ")}`);

  // Femte försöket måste få återanvända ett pass — annars fastnar leadet.
  // Det är den mjuka preferensen: rotera hellre, men blockera aldrig.
  const fifth = computeNext({ lead: state, result: "NO_ANSWER", outcome: null, slots: SLOTS, config: CFG, now: t });
  check("femte försöket blockeras inte av uttömd rotation", fifth.nextActionAt !== null && fifth.nextSlotId !== null);
}
{
  const d = computeNext({ lead: base, result: "BUSY", outcome: null, slots: SLOTS, config: CFG, now });
  const hours = d.nextActionAt ? (d.nextActionAt.getTime() - now.getTime()) / 3_600_000 : 0;
  check("upptaget → ringer om samma dag", hours < 24, `blev ${hours.toFixed(1)}h (${fmt(d.nextActionAt)})`);
}

// ── Trappan: vilan växer när ingen svarar ─────────────────────────────────
//
// Regressionsskydd för felet 2026-09-15. `retryHoursNoAnswer` var en fast
// vila, och 20 timmar betyder i praktiken "i morgon bitti" — `alignToSlot`
// flyttar ändå in tiden i nästa pass. Ett bolag som aldrig svarade ringdes
// åtta arbetsdagar i rad. Mätt på tre veckors produktionsdata: 450
// omtagningar inom ett dygn, 296 inom två (148 av dem av en annan säljare).
console.log("\ncomputeNext — trappad vila");
{
  // Sex obesvarade i rad. Mät faktisk kalendertid mellan samtalen, inte
  // råa timmar: det är den kunden upplever, och `alignToSlot` kan bara
  // skjuta den framåt.
  const gaps: number[] = [];
  let state = { ...base };
  let t = new Date(2026, 7, 5, 8, 0); // onsdag, tidiga passet
  for (let i = 0; i < 6; i++) {
    const d = computeNext({ lead: state, result: "NO_ANSWER", outcome: null, slots: SLOTS, config: CFG, now: t });
    if (!d.nextActionAt) break;
    gaps.push((d.nextActionAt.getTime() - t.getTime()) / 86_400_000);
    state = {
      attemptCount: d.attemptCount,
      roundCount: d.roundCount,
      noAnswerStreak: d.noAnswerStreak,
      triedSlotIds: d.triedSlotIds,
    };
    t = d.nextActionAt;
  }

  check("sex obesvarade ger sex vilor", gaps.length === 6, `blev ${gaps.length}`);
  // Mätt i KALENDERTID, inte i råa timmar, eftersom det är kalendertid kunden
  // upplever. Den är därför inte strikt växande: `alignToSlot` hoppar över
  // helger och spärrade datum, så en vila som landar på en fredag skjuts tre
  // dygn och en som landar på en måndag inte alls. Steg tre och fyra kan då
  // byta plats med några timmar utan att något är fel.
  //
  // Jämförelsen går därför två steg tillbaka. Trappan dubblar, och två
  // dubblingar kan ingen helgförskjutning äta upp — så det här påståendet är
  // sant om och endast om trappan verkligen trappar.
  check(
    "vilan växer — varje steg är längre än det två steg bakåt",
    gaps.every((g, i) => i < 2 || g > gaps[i - 2]),
    gaps.map((g) => g.toFixed(1)).join(" → ")
  );
  check(
    "första vilan är kortare än två dygn",
    gaps[0] < 2,
    `${gaps[0].toFixed(2)} dygn`
  );
  check(
    "femte vilan är minst en vecka",
    gaps[4] >= 7,
    `${gaps[4].toFixed(1)} dygn`
  );

  const total = gaps.reduce((a, b) => a + b, 0);
  check(
    "sex försök sprids över mer än en månad, inte en vecka",
    total > 30,
    `${total.toFixed(1)} dygn totalt: ${gaps.map((g) => g.toFixed(1)).join(", ")}`
  );
}
{
  // Ett besvarat samtal nollställer trappan. Utan den regeln hade ett bolag
  // vi PRATAT med behandlats som ett som aldrig svarar.
  const efterSvar = { attemptCount: 5, roundCount: 0, noAnswerStreak: 0, triedSlotIds: [] as string[] };
  const d = computeNext({ lead: efterSvar, result: "CONNECTED_DM", outcome: "WRONG_DM", slots: SLOTS, config: CFG, now });
  const hours = d.nextActionAt ? (d.nextActionAt.getTime() - now.getTime()) / 3_600_000 : 0;
  check("fel person → grundvilan, inte trappans topp", hours < 48, `blev ${hours.toFixed(1)}h`);
  check("fel person → streak förblir noll", d.noAnswerStreak === 0);
}
{
  // Taket. Utan det växer dubblingen till månader.
  const djupt = { attemptCount: 1, roundCount: 0, noAnswerStreak: 20, triedSlotIds: [] as string[] };
  const d = computeNext({ lead: djupt, result: "NO_ANSWER", outcome: null, slots: SLOTS, config: CFG, now });
  const days = d.nextActionAt ? (d.nextActionAt.getTime() - now.getTime()) / 86_400_000 : 0;
  check(
    "trappan bryts av taket",
    days <= CFG.retryHoursMax / 24 + 4,
    `blev ${days.toFixed(1)} dygn, tak ${(CFG.retryHoursMax / 24).toFixed(0)} + helgförskjutning`
  );
}

// ── Varvet tar slut ───────────────────────────────────────────────────────
//
// Regressionsskydd för felet 2026-09-15. Taket nollställde `attemptCount` och
// ingen räknare överlevde nollställningen: åtta försök, trettio dagars vila,
// åtta försök till — i evighet. Ingen ringlista kunde bli färdig.
console.log("\ncomputeNext — varvgränsen");
{
  const sistaVarvet = { attemptCount: 7, roundCount: 1, noAnswerStreak: 7, triedSlotIds: [] as string[] };
  const d = computeNext({ lead: sistaVarvet, result: "NO_ANSWER", outcome: null, slots: SLOTS, config: CFG, now });
  check("sista varvets tak → pensionerat", d.retired);
  check("sista varvets tak → skälet är uttomd", d.retiredReason === "uttomd", `blev ${d.retiredReason}`);
  check("uttömt → ingen ny ringtid", d.nextActionAt === null, fmt(d.nextActionAt));
  check("uttömt → försöken nollställs inte", d.attemptCount === 8, `blev ${d.attemptCount}`);
}
{
  // Hela livscykeln: ett bolag som aldrig svarar ska till slut lämna
  // rotationen av sig självt, utan att en människa trycker på något.
  let state = { ...base };
  let t = new Date(2026, 7, 5, 8, 0);
  let samtal = 0;
  let d = computeNext({ lead: state, result: "NO_ANSWER", outcome: null, slots: SLOTS, config: CFG, now: t });
  while (!d.retired && samtal < 100) {
    samtal++;
    state = {
      attemptCount: d.attemptCount,
      roundCount: d.roundCount,
      noAnswerStreak: d.noAnswerStreak,
      triedSlotIds: d.triedSlotIds,
    };
    t = d.nextActionAt ?? new Date(t.getTime() + 86_400_000);
    d = computeNext({ lead: state, result: "NO_ANSWER", outcome: null, slots: SLOTS, config: CFG, now: t });
  }
  check("ett bolag som aldrig svarar pensioneras till slut", d.retired, `efter ${samtal} samtal`);
  check(
    "och det tar maxAttempts × maxRounds samtal, inte fler",
    samtal + 1 === CFG.maxAttempts * CFG.maxRounds,
    `blev ${samtal + 1}, väntat ${CFG.maxAttempts * CFG.maxRounds}`
  );
}
{
  // Ett nej pensionerar inte — det vilar. Gränsen mellan "uttömd" och
  // "sa nej" får inte suddas: den ena är vår tystnad, den andra kundens ord.
  const sistaVarvet = { attemptCount: 7, roundCount: 1, noAnswerStreak: 0, triedSlotIds: [] as string[] };
  const d = computeNext({ lead: sistaVarvet, result: "CONNECTED_DM", outcome: "DM_NO", noReason: "PRIS", slots: SLOTS, config: CFG, now });
  check("nej på sista varvets sista försök → vilar, pensioneras inte", !d.retired);
}


// ── rotationResumeAt — vad gäller när en återkomst avbokas ────────────────
//
// Regressionsskydd för buggen 2026-08-26: `nextActionAt = NULL` gjorde bolaget
// inte bara ringbart direkt utan sorterade det FÖRST i däcket, före allt som
// faktiskt väntat ut sin vila. 74 leads låg så i produktionen, alla med en
// avbokad återkomst bakom sig.
{
  const d = rotationResumeAt({ lastAttemptAt: null, lastResult: null, slots: SLOTS, config: CFG });
  check("aldrig ringt → ringbart nu (null)", d === null);
}
{
  const ringt = new Date(2026, 7, 5, 9, 0);
  const d = rotationResumeAt({ lastAttemptAt: ringt, lastResult: "NO_ANSWER", slots: SLOTS, config: CFG });
  check("avbokad återkomst → aldrig null när bolaget ringts", d !== null);
  const hours = d ? (d.getTime() - ringt.getTime()) / 3_600_000 : 0;
  check("svarar ej → vilan räknas från senaste samtalet", hours >= CFG.retryHoursNoAnswer, `blev ${hours.toFixed(1)}h`);
}
{
  const ringt = new Date(2026, 7, 5, 9, 0);
  const dNo = rotationResumeAt({ lastAttemptAt: ringt, lastResult: "NO_ANSWER", slots: SLOTS, config: CFG });
  const dGk = rotationResumeAt({ lastAttemptAt: ringt, lastResult: "CONNECTED_GATEKEEPER", slots: SLOTS, config: CFG });
  check(
    "växeln ger längre vila än svarar ej",
    dNo !== null && dGk !== null && dGk.getTime() > dNo.getTime(),
    `${fmt(dNo)} vs ${fmt(dGk)}`
  );
}
{
  // Ett gammalt samtal ska ge en tid som redan passerat — bolaget ÄR i tur.
  // Poängen är att tiden finns, inte att den ligger i framtiden: NULL och
  // "förfallen" är ringbara på samma sätt, men bara den ena sorterar överst.
  const gammalt = new Date(2026, 6, 1, 9, 0);
  const d = rotationResumeAt({ lastAttemptAt: gammalt, lastResult: "NO_ANSWER", slots: SLOTS, config: CFG });
  check("gammalt samtal → förfallen tid, inte null", d !== null && d < new Date(2026, 7, 5));
}

console.log(`\n${pass} godkända, ${fail} misslyckade\n`);
process.exit(fail > 0 ? 1 : 0);
