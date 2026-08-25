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

/**
 * Bolaget gick inte att få tag på ett nummer till.
 *
 * Ligger bland resultaten i gränssnittet men är **inget samtalsresultat** —
 * inget samtal ringdes. Värdet finns därför inte i `CallResult` och skrivs
 * aldrig till `CallAttempt`: statistiken räknar rader i den tabellen som
 * samtal, och en uppslagning som gick i stäv hade blivit ett samtal i varje
 * mätvärde vi har, från dagsmålet till svarsfrekvensens nämnare.
 * `markNoPhoneFound` i `actions/dialer.ts` tar hand om det i stället.
 */
// `as const` är inte kosmetik: utan den blir typen `string`, `ResultChoice`
// kollapsar till `string` och kompilatorn slutar hålla isär ett samtalsresultat
// från pseudot — vilket är hela poängen med att det ligger utanför enumet.
export const NO_PHONE_FOUND = "NO_PHONE_FOUND" as const;

/** Det säljaren kan trycka på i resultatsteget — samtalsresultat plus pseudot ovan. */
export type ResultChoice = CallResult | typeof NO_PHONE_FOUND;

/**
 * Resultatknapparna.
 *
 * "Upptaget" och "Röstbrevlåda" togs bort 2026-08-25 på beställning: de
 * användes inte, och varje knapp i det här steget är ett val säljaren måste
 * göra 150 gånger om dagen. Enumvärdena `BUSY`, `VOICEMAIL_LEFT` och
 * `VOICEMAIL_NO_MESSAGE` står kvar i schemat och i `RESULT_LABELS` — gamla
 * samtal ska fortsätta gå att läsa i historiken, loggen är oföränderlig.
 */
export const RESULT_OPTIONS: FlowOption<ResultChoice>[] = [
  { key: "1", label: "Svarar ej", value: "NO_ANSWER", color: "#6B7280" },
  { key: "2", label: "Fel nummer", value: "WRONG_NUMBER", color: "#EF4444", hint: "Spärrar leadet" },
  { key: "3", label: "Kom till växeln", value: "CONNECTED_GATEKEEPER", color: "#3B82F6", hint: "Vem svarade?" },
  { key: "4", label: "Nådde beslutsfattaren", value: "CONNECTED_DM", color: "#10B981", hint: "Vad hände?" },
  { key: "5", label: "Inget telefonnummer", value: NO_PHONE_FOUND, color: "#8B5CF6", hint: "Tar bort ur kön" },
];

/**
 * Etiketter för ALLA samtalsresultat, även de som inte längre går att välja.
 * `RESULT_OPTIONS` säger vad som erbjuds i dag; den här säger vad som står i
 * historiken. Utan skillnaden hade ett samtal från i juni renderats som
 * "VOICEMAIL_NO_MESSAGE" så fort knappen togs bort.
 */
export const RESULT_LABELS: Record<CallResult, string> = {
  NO_ANSWER: "Svarar ej",
  BUSY: "Upptaget",
  VOICEMAIL_LEFT: "Röstbrevlåda — meddelande",
  VOICEMAIL_NO_MESSAGE: "Röstbrevlåda",
  WRONG_NUMBER: "Fel nummer",
  INVALID_NUMBER: "Ogiltigt nummer",
  CONNECTED_GATEKEEPER: "Kom till växeln",
  CONNECTED_DM: "Nådde beslutsfattaren",
};

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
  { key: "3", label: "Såld", value: "SOLD", color: "#22C55E" },
  // Inte ett nej — erbjudandet nådde aldrig rätt person. Leadet går tillbaka
  // i rotationen i stället för att räknas som avfärdat.
  { key: "4", label: "Fel beslutsfattare", value: "WRONG_DM", color: "#F59E0B", hint: "Ringer igen" },
];

// ── Steg 3: varför nej ────────────────────────────────────────────────────

export const REASON_OPTIONS: FlowOption<NoReason>[] = [
  { key: "1", label: "Pris", value: "PRIS", color: "#F59E0B" },
  { key: "2", label: "Timing", value: "TIMING", color: "#3B82F6" },
  { key: "3", label: "Har byrå", value: "HAR_BYRA", color: "#8B5CF6" },
  { key: "4", label: "Har inhouse", value: "HAR_INHOUSE", color: "#6366F1" },
  { key: "5", label: "Inget behov", value: "INGET_BEHOV", color: "#6B7280" },
  { key: "6", label: "Nöjd med annan", value: "NOJD_MED_ANNAN", color: "#EC4899" },
  // Sist och inte först, trots att det är det tidigaste nejet: siffrorna 1–6
  // sitter i fingrarna på säljarna, och att flytta dem hade gett felregistrerat
  // utfall i veckor. Mäter öppningen, inte erbjudandet.
  { key: "7", label: "Sa nej innan pitch", value: "NEJ_INNAN_PITCH", color: "#94A3B8" },
  // Hållning, inte tidpunkt: ett bättre intro ändrar den inte. Håll isär från
  // 7 — annars går det inte att se skillnad på ett intro som misslyckas och en
  // mottagare som aldrig tar kalla samtal.
  { key: "8", label: "Vill inte prata med säljare", value: "VILL_EJ_PRATA_SALJARE", color: "#78716C" },
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
  // Sålt: ingen coachningsfråga behövs, samtalet gick ju hela vägen.
  if (outcome === "SOLD") return null;
  if (outcome === "CALLBACK_BOOKED") return null;
  // Fel beslutsfattare: ingen följdfråga. "Varför nej?" har inget svar när
  // erbjudandet aldrig nådde fram, och att fråga ändå lär säljaren att klicka
  // bort rutan. Ett tryck, sen nästa samtal.
  if (outcome === "WRONG_DM") return null;
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
  // Bara på DM_NO. Fel beslutsfattare säger ingenting om hur långt säljaren
  // kom i ramverket — samtalet dog på att personen var fel, inte på pitchen.
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
