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
  computeNext, slotAt, pickNextSlot, alignToSlot,
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
  cooldownDays: 30,
  retryHoursNoAnswer: 20,
  retryHoursBusy: 2,
  retryHoursVoicemail: 44,
  retryHoursGatekeeper: 68,
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
const base = { attemptCount: 0, noAnswerStreak: 0, triedSlotIds: [] as string[] };
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
  const nearCap = { attemptCount: 7, noAnswerStreak: 7, triedSlotIds: ["tidigt", "fm", "em", "sen"] };
  const d = computeNext({ lead: nearCap, result: "NO_ANSWER", outcome: null, slots: SLOTS, config: CFG, now });
  check("taket nått → räknaren nollställs för nytt varv", d.attemptCount === 0);
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
    state = { attemptCount: d.attemptCount, noAnswerStreak: d.noAnswerStreak, triedSlotIds: d.triedSlotIds };
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

console.log(`\n${pass} godkända, ${fail} misslyckade\n`);
process.exit(fail > 0 ? 1 : 0);
