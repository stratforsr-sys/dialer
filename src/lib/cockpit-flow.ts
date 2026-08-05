/**
 * Dispositionsflödet — ren logik, inget UI.
 *
 * Två fält i stället för ett är hela poängen med Modul 4. `result` säger vad
 * som hände med SAMTALET, `outcome` vad som hände i det. Slås de ihop går
 * svarsfrekvensen inte att räkna, och "ej intresserad" blir återigen
 * soptunnan som döljer allt man behöver veta.
 *
 * Flödet är därför trappstegat: säljaren trycker en siffra för resultatet,
 * och bara om någon faktiskt svarade dyker nästa steg upp. De vanligaste
 * utfallen — svarar ej, upptaget — är alltså fortfarande EN tangenttryckning.
 * Det är viktigt: en power-dialer som kräver tre klick per samtal blir en
 * power-dialer ingen använder.
 */

import type {
  CallResult,
  ConversationOutcome,
  NoReason,
  FrameworkStep,
} from "@/generated/prisma/client";

export type FlowStage = "result" | "gatekeeper" | "outcome" | "reason" | "framework";

export interface FlowOption<T> {
  key: string;
  label: string;
  value: T;
  color: string;
  /** Kort förklaring som visas under knappen första gångerna. */
  hint?: string;
}

// ── Steg 1: vad hände med samtalet ────────────────────────────────────────

export const RESULT_OPTIONS: FlowOption<CallResult>[] = [
  { key: "1", label: "Svarar ej", value: "NO_ANSWER", color: "#6B7280" },
  { key: "2", label: "Upptaget", value: "BUSY", color: "#F59E0B" },
  { key: "3", label: "Röstbrevlåda", value: "VOICEMAIL_NO_MESSAGE", color: "#8B5CF6" },
  { key: "4", label: "Fel nummer", value: "WRONG_NUMBER", color: "#EF4444", hint: "Spärrar leadet" },
  { key: "5", label: "Kom till växeln", value: "CONNECTED_GATEKEEPER", color: "#3B82F6", hint: "Vem svarade?" },
  { key: "6", label: "Nådde beslutsfattaren", value: "CONNECTED_DM", color: "#10B981", hint: "Vad hände?" },
];

/** Svarade någon? Avgör om nästa steg ska visas — och nämnaren i svarsfrekvensen. */
export function isConnected(result: CallResult): boolean {
  return result === "CONNECTED_DM" || result === "CONNECTED_GATEKEEPER";
}

// ── Steg 2a: växeln ───────────────────────────────────────────────────────

export const GATEKEEPER_OPTIONS: FlowOption<ConversationOutcome>[] = [
  { key: "1", label: "Blockad", value: "GATEKEEPER_BLOCKED", color: "#EF4444" },
  { key: "2", label: "Kopplad vidare", value: "GATEKEEPER_TRANSFERRED", color: "#10B981" },
  { key: "3", label: "Fick direktnummer", value: "GATEKEEPER_GAVE_DM_DETAILS", color: "#3B82F6", hint: "Guld — spara det" },
];

/** Taktiker att välja bland. Kort lista: fler än så och ingen fyller i den. */
export const GATEKEEPER_TACTICS = [
  { key: "namedrop", label: "Nämnde namn" },
  { key: "kort_arende", label: "Kort ärende" },
  { key: "tillbakaring", label: "Bad återkomma" },
  { key: "fraga_direktnummer", label: "Bad om direktnummer" },
] as const;

// ── Steg 2b: beslutsfattaren ──────────────────────────────────────────────

export const OUTCOME_OPTIONS: FlowOption<ConversationOutcome>[] = [
  { key: "1", label: "Sa nej", value: "DM_NO", color: "#EF4444", hint: "Varför?" },
  { key: "2", label: "Ring igen", value: "CALLBACK_BOOKED", color: "#3B82F6", hint: "När?" },
  { key: "3", label: "Möte bokat", value: "MEETING_BOOKED", color: "#10B981" },
  { key: "4", label: "Såld", value: "SOLD", color: "#22C55E" },
];

// ── Steg 3: varför nej ────────────────────────────────────────────────────

export const REASON_OPTIONS: FlowOption<NoReason>[] = [
  { key: "1", label: "Pris", value: "PRIS", color: "#F59E0B" },
  { key: "2", label: "Timing", value: "TIMING", color: "#3B82F6" },
  { key: "3", label: "Har byrå", value: "HAR_BYRA", color: "#8B5CF6" },
  { key: "4", label: "Har inhouse", value: "HAR_INHOUSE", color: "#6366F1" },
  { key: "5", label: "Inget behov", value: "INGET_BEHOV", color: "#6B7280" },
  { key: "6", label: "Nöjd med annan", value: "NOJD_MED_ANNAN", color: "#EC4899" },
];

// ── Steg 4: hur långt kom samtalet ────────────────────────────────────────

export const FRAMEWORK_STEPS: Array<{ value: FrameworkStep; label: string; key: string }> = [
  { value: "VAXEL", label: "Växel", key: "1" },
  { value: "INTRO", label: "Intro", key: "2" },
  { value: "PRESENTATION", label: "Presentation", key: "3" },
  { value: "BEHOVSANALYS", label: "Behovsanalys", key: "4" },
  { value: "ROI", label: "ROI", key: "5" },
  { value: "COI", label: "COI", key: "6" },
  { value: "AVSLUT", label: "Avslut", key: "7" },
  { value: "INVANDNING", label: "Invändning", key: "8" },
];

/** Vanliga invändningar. Taggas efter samtalet, ett tryck. */
export const OBJECTION_TAGS = [
  { tag: "pris", label: "För dyrt" },
  { tag: "har_redan_leverantor", label: "Har redan någon" },
  { tag: "ingen_tid", label: "Ingen tid" },
  { tag: "skicka_mail", label: "Skicka mail" },
  { tag: "maste_fraga_kollega", label: "Måste fråga någon" },
  { tag: "inget_behov", label: "Inget behov" },
  { tag: "daligt_tajming", label: "Dålig tajming" },
] as const;

// ── Trappan ───────────────────────────────────────────────────────────────

export interface FlowState {
  stage: FlowStage;
  result: CallResult | null;
  outcome: ConversationOutcome | null;
  noReason: NoReason | null;
}

export const INITIAL_FLOW: FlowState = {
  stage: "result",
  result: null,
  outcome: null,
  noReason: null,
};

/**
 * Nästa steg efter att ett resultat valts. Returnerar null när dispositionen
 * är komplett och samtalet kan skrivas.
 */
export function stageAfterResult(result: CallResult): FlowStage | null {
  if (result === "CONNECTED_GATEKEEPER") return "gatekeeper";
  if (result === "CONNECTED_DM") return "outcome";
  return null; // svarar ej, upptaget, röstbrevlåda, fel nummer — klart direkt
}

export function stageAfterOutcome(outcome: ConversationOutcome): FlowStage | null {
  if (outcome === "DM_NO") return "reason";
  // Bokat eller sålt: ingen coachningsfråga behövs, samtalet gick ju hela vägen.
  if (outcome === "MEETING_BOOKED" || outcome === "SOLD") return null;
  if (outcome === "CALLBACK_BOOKED") return null;
  // Växelutfall är kompletta i sig.
  return null;
}

/**
 * Ska ramverksfrågan ställas? Bara när säljaren nådde beslutsfattaren och
 * INTE bokade — det är de samtalen där det är intressant var de dog.
 *
 * Att fråga efter varje samtal är hur man lär ett säljteam att klicka bort
 * rutan utan att läsa den.
 */
export function shouldAskFramework(
  result: CallResult,
  outcome: ConversationOutcome | null
): boolean {
  if (result !== "CONNECTED_DM") return false;
  return outcome === "DM_NO";
}

/** Slår upp ett alternativ på tangent, för det aktuella steget. */
export function optionForKey(
  stage: FlowStage,
  key: string
): FlowOption<string> | null {
  const table: Record<string, FlowOption<string>[]> = {
    result: RESULT_OPTIONS,
    gatekeeper: GATEKEEPER_OPTIONS,
    outcome: OUTCOME_OPTIONS,
    reason: REASON_OPTIONS,
  };
  return table[stage]?.find((o) => o.key === key) ?? null;
}

/** Rubriken över knapparna — säljaren ska aldrig behöva gissa vad som frågas. */
export function stagePrompt(stage: FlowStage): string {
  switch (stage) {
    case "result":
      return "Vad hände med samtalet?";
    case "gatekeeper":
      return "Vad hände i växeln?";
    case "outcome":
      return "Vad hände i samtalet?";
    case "reason":
      return "Varför nej?";
    case "framework":
      return "Hur långt kom du?";
  }
}
