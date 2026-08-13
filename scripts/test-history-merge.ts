/**
 * Verifiering av sammanslagningen mellan anteckningar och samtal.
 *   node --experimental-strip-types scripts/test-history-merge.ts
 *
 * Det som måste hålla: en anteckning säljaren skrivit ned får ALDRIG
 * försvinna, och den får aldrig hamna under fel samtal. Båda felen är tysta —
 * ingen får ett felmeddelande, texten står bara på fel ställe eller inte alls.
 */

import { mergeCockpitNotes, type MergeAttempt, type MergeActivity } from "../src/lib/history-merge.ts";

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${detail}`); }
}

const t = (hhmm: string, day = "13") => new Date(`2026-08-${day}T${hhmm}:00Z`);

/** Anteckning skriven i cockpiten med Enter. */
const cockpit = (id: string, sessionId: string, at: Date): MergeActivity => ({
  id, at, who: "Anna",
  metadata: JSON.stringify({ note: id, source: "cockpit", sessionId }),
});

/** Anteckning skriven på lead-sidan. */
const leadPage = (id: string, at: Date): MergeActivity => ({
  id, at, who: "Anna", metadata: JSON.stringify({ note: id }),
});

const call = (id: string, sessionId: string | null, at: Date, note: string | null = null): MergeAttempt =>
  ({ id, sessionId, at, note });

// ── 1. Två Enter-anteckningar följt av ett utfall ────────────────────────
{
  const r = mergeCockpitNotes(
    [call("X", "S1", t("10:02"))],
    [cockpit("A", "S1", t("10:00")), cockpit("B", "S1", t("10:01"))]
  );
  console.log("\nTvå anteckningar, sedan ett utfall");
  check("båda hamnar under utfallet", r.noteForAttempt.get("X") === "A\n\nB", `fick ${JSON.stringify(r.noteForAttempt.get("X"))}`);
  check("ingen lös rad blir kvar", r.standalone.length === 0);
}

// ── 2. Anteckning utan utfall ────────────────────────────────────────────
{
  const r = mergeCockpitNotes([], [cockpit("A", "S1", t("10:00"))]);
  console.log("\nAnteckning utan utfall");
  check("ligger kvar som egen rad", r.standalone.length === 1 && r.standalone[0].note === "A");
}

// ── 3. Lead-sidans anteckning ────────────────────────────────────────────
{
  const r = mergeCockpitNotes(
    [call("X", "S1", t("10:02"))],
    [leadPage("Från lead-sidan", t("10:00"))]
  );
  console.log("\nAnteckning från lead-sidan");
  check("sugs aldrig in i ett samtal", r.noteForAttempt.get("X") === null);
  check("står kvar för sig själv", r.standalone.length === 1);
}

// ── 4. Två samtal i samma ringpass ───────────────────────────────────────
{
  const r = mergeCockpitNotes(
    [call("X", "S1", t("10:01")), call("Y", "S1", t("10:06"))],
    [cockpit("A", "S1", t("10:00")), cockpit("B", "S1", t("10:05"))]
  );
  console.log("\nTvå samtal i samma pass");
  check("första anteckningen till första samtalet", r.noteForAttempt.get("X") === "A");
  check("andra anteckningen till andra samtalet", r.noteForAttempt.get("Y") === "B");
  check("inget blir liggande", r.standalone.length === 0);
}

// ── 5. Olika ringpass ────────────────────────────────────────────────────
{
  const r = mergeCockpitNotes(
    [call("X", "S2", t("09:00", "14"))],
    [cockpit("A", "S1", t("10:00"))]
  );
  console.log("\nAnteckning i ett pass, samtal i ett annat");
  check("slås INTE ihop", r.noteForAttempt.get("X") === null);
  check("anteckningen ligger kvar", r.standalone.length === 1);
}

// ── 6. Dispositionens egen anteckning + en Enter-anteckning ──────────────
{
  const r = mergeCockpitNotes(
    [call("X", "S1", t("10:02"), "Skrev i rutan")],
    [cockpit("Enter-anteckning", "S1", t("10:00"))]
  );
  console.log("\nBåda sorternas anteckning på samma samtal");
  check("båda syns, i skrivordning", r.noteForAttempt.get("X") === "Skrev i rutan\n\nEnter-anteckning");
}

// ── 7. Anteckning skriven EFTER samtalet ─────────────────────────────────
{
  const r = mergeCockpitNotes(
    [call("X", "S1", t("10:00"))],
    [cockpit("A", "S1", t("10:05"))]
  );
  console.log("\nAnteckning skriven efter samtalet");
  check("hör inte till det som redan dispositionerats", r.noteForAttempt.get("X") === null);
  check("står som egen rad", r.standalone.length === 1);
}

// ── 8. Gamla rader utan sessionId ────────────────────────────────────────
{
  const r = mergeCockpitNotes(
    [call("X", null, t("10:02"))],
    [cockpit("A", "S1", t("10:00"))]
  );
  console.log("\nSamtal utan sessionId (rader äldre än funktionen)");
  check("sväljer aldrig en anteckning", r.noteForAttempt.get("X") === null);
  check("anteckningen bevaras", r.standalone.length === 1);
}

// ── 9. Trasig metadata ───────────────────────────────────────────────────
{
  const r = mergeCockpitNotes(
    [call("X", "S1", t("10:02"))],
    [{ id: "trasig", at: t("10:00"), metadata: "{inte json", who: "Anna" }]
  );
  console.log("\nTrasig JSON i metadata");
  check("fäller inte cockpiten", r.standalone.length === 0 && r.noteForAttempt.get("X") === null);
}

console.log(`\n${pass} godkända, ${fail} underkända`);
if (fail > 0) process.exit(1);
