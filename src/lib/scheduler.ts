/**
 * Uppföljningsmotorn — när ska ett lead ringas igen, och i vilket pass?
 *
 * Rena funktioner utan databasberoenden. Hela beslutet fattas här och skrivs
 * sedan ner som kolumnvärden på leadet, så att "nästa lead att ringa" blir ett
 * indexerat villkor i stället för en beräkning per rad.
 *
 * Två saker som skiljer sig från den ursprungliga specen, båda medvetna:
 *
 * 1. Passrotationen är en MJUK preferens, inte en hård regel. "Aldrig samma
 *    tid igen" tvingar sena försök in i kända dåliga fönster för att uppfylla
 *    något ingen mätt. Motorn föredrar oprövade pass men accepterar ett prövat
 *    hellre än att skjuta upp samtalet i onödan.
 *
 * 2. Taket och vilotiden ligger i DialerConfig, inte i koden. Med 2169 leads
 *    och 5–10 säljare är taket det som avgör hur många dagar databasen räcker,
 *    och den siffran ska gå att ändra utan en deploy.
 */

export type CallResultLike =
  | "NO_ANSWER"
  | "BUSY"
  | "VOICEMAIL_LEFT"
  | "VOICEMAIL_NO_MESSAGE"
  | "WRONG_NUMBER"
  | "INVALID_NUMBER"
  | "CONNECTED_GATEKEEPER"
  | "CONNECTED_DM";

export type OutcomeLike =
  | "GATEKEEPER_BLOCKED"
  | "GATEKEEPER_TRANSFERRED"
  | "GATEKEEPER_GAVE_DM_DETAILS"
  | "DM_NO"
  | "CALLBACK_BOOKED"
  | "SOLD"
  | null;

export interface SchedulerConfig {
  maxAttempts: number;
  cooldownDays: number;
  retryHoursNoAnswer: number;
  retryHoursBusy: number;
  retryHoursVoicemail: number;
  retryHoursGatekeeper: number;
  blockedDates: string[]; // "YYYY-MM-DD"
}

export interface Slot {
  id: string;
  name: string;
  startMinute: number;
  endMinute: number;
  order: number;
}

export interface LeadSchedulingState {
  attemptCount: number;
  noAnswerStreak: number;
  triedSlotIds: string[];
}

export interface SchedulerDecision {
  nextActionAt: Date | null;
  nextSlotId: string | null;
  attemptCount: number;
  noAnswerStreak: number;
  triedSlotIds: string[];
  retired: boolean;
  retiredReason: string | null;
  callbackAt: Date | null;
}

/** Vilket pass en tidpunkt faller inom, om något. */
export function slotAt(slots: Slot[], at: Date): Slot | null {
  const minute = at.getHours() * 60 + at.getMinutes();
  return (
    slots.find((s) => minute >= s.startMinute && minute < s.endMinute) ?? null
  );
}

/** Nästa pass att prova: oprövade först, annars det som ligger närmast i tid. */
export function pickNextSlot(
  slots: Slot[],
  triedSlotIds: string[],
  after: Date
): Slot | null {
  if (slots.length === 0) return null;

  const untried = slots.filter((s) => !triedSlotIds.includes(s.id));
  const pool = untried.length > 0 ? untried : slots;

  // Det första passet som börjar efter tidpunkten; annars dagens första pass
  // imorgon. Sorteringen på startMinute gör valet deterministiskt.
  const minute = after.getHours() * 60 + after.getMinutes();
  const sorted = [...pool].sort((a, b) => a.startMinute - b.startMinute);
  return sorted.find((s) => s.startMinute > minute) ?? sorted[0];
}

/**
 * Flyttar en tidpunkt till nästa tillfälle som ligger inom passet, på en
 * vardag som inte är spärrad.
 *
 * Semester, klämdagar och mellandagarna hanteras genom blockedDates i
 * konfigurationen. Utan den landar en 30-dagars vila glatt på midsommarafton.
 */
export function alignToSlot(
  from: Date,
  slot: Slot | null,
  blockedDates: string[],
  maxLookaheadDays = 21
): Date {
  const at = new Date(from);

  if (slot) {
    const minute = at.getHours() * 60 + at.getMinutes();
    if (minute < slot.startMinute) {
      at.setHours(0, slot.startMinute, 0, 0);
    } else if (minute >= slot.endMinute) {
      // Passet har redan varit idag — ta det imorgon.
      at.setDate(at.getDate() + 1);
      at.setHours(0, slot.startMinute, 0, 0);
    }
  }

  for (let i = 0; i < maxLookaheadDays; i++) {
    const day = at.getDay(); // 0 = söndag, 6 = lördag
    const iso = toISODate(at);
    if (day !== 0 && day !== 6 && !blockedDates.includes(iso)) return at;
    at.setDate(at.getDate() + 1);
    if (slot) at.setHours(0, slot.startMinute, 0, 0);
  }
  return at;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Hur många timmar innan nästa försök, givet vad som hände. */
function retryHours(result: CallResultLike, cfg: SchedulerConfig): number {
  switch (result) {
    case "BUSY":
      return cfg.retryHoursBusy;
    case "VOICEMAIL_LEFT":
    case "VOICEMAIL_NO_MESSAGE":
      return cfg.retryHoursVoicemail;
    case "CONNECTED_GATEKEEPER":
      return cfg.retryHoursGatekeeper;
    default:
      return cfg.retryHoursNoAnswer;
  }
}

/**
 * Utfall som avslutar bearbetningen av leadet, oavsett hur många försök som
 * återstår. Ett sålt lead ska inte ringas igen av misstag, och ett felaktigt
 * nummer blir inte rätt av att ringas en femte gång.
 */
function terminalReason(
  result: CallResultLike,
  outcome: OutcomeLike
): string | null {
  if (result === "WRONG_NUMBER") return "fel_nummer";
  if (result === "INVALID_NUMBER") return "ogiltigt_nummer";
  if (outcome === "SOLD") return "sald";
  return null;
}

/**
 * Beslutet. Anropas efter varje registrerat samtal; returvärdet skrivs rakt
 * ner på leadet.
 */
export function computeNext(params: {
  lead: LeadSchedulingState;
  result: CallResultLike;
  outcome: OutcomeLike;
  /** Bokad återuppringning — vinner alltid över rotationen. */
  callbackAt?: Date | null;
  /** Tid växeln uppgav att beslutsfattaren är tillbaka. */
  dmAvailableAt?: Date | null;
  slots: Slot[];
  config: SchedulerConfig;
  now?: Date;
}): SchedulerDecision {
  const {
    lead,
    result,
    outcome,
    callbackAt = null,
    dmAvailableAt = null,
    slots,
    config,
    now = new Date(),
  } = params;

  const attemptCount = lead.attemptCount + 1;
  const answered =
    result === "CONNECTED_DM" || result === "CONNECTED_GATEKEEPER";
  const noAnswerStreak = answered ? 0 : lead.noAnswerStreak + 1;

  const currentSlot = slotAt(slots, now);
  const triedSlotIds = currentSlot
    ? Array.from(new Set([...lead.triedSlotIds, currentSlot.id]))
    : lead.triedSlotIds;

  // 1. Terminala utfall — ingen mer bearbetning.
  const terminal = terminalReason(result, outcome);
  if (terminal) {
    return {
      nextActionAt: null,
      nextSlotId: null,
      attemptCount,
      noAnswerStreak,
      triedSlotIds,
      retired: true,
      retiredReason: terminal,
      callbackAt: null,
    };
  }

  // 2. Bokad återuppringning slår allt annat. Det är det varmaste samtalet i
  //    hela listan och får aldrig hamna bakom rotationslogiken.
  if (callbackAt) {
    return {
      nextActionAt: callbackAt,
      nextSlotId: slotAt(slots, callbackAt)?.id ?? null,
      attemptCount,
      noAnswerStreak,
      triedSlotIds,
      retired: false,
      retiredReason: null,
      callbackAt,
    };
  }

  // 3. Växeln sa när beslutsfattaren är tillbaka. Gratis schemaläggning —
  //    bättre information än någon rotationsregel kan producera.
  if (dmAvailableAt && dmAvailableAt > now) {
    const slot = pickNextSlot(slots, [], dmAvailableAt);
    return {
      nextActionAt: alignToSlot(dmAvailableAt, slot, config.blockedDates),
      nextSlotId: slot?.id ?? null,
      attemptCount,
      noAnswerStreak,
      triedSlotIds,
      retired: false,
      retiredReason: null,
      callbackAt: null,
    };
  }

  // 4. Taket nått → vila. Leadet är inte förbrukat, bara pausat.
  if (attemptCount >= config.maxAttempts) {
    const rest = new Date(now);
    rest.setDate(rest.getDate() + config.cooldownDays);
    const slot = pickNextSlot(slots, [], rest);
    return {
      nextActionAt: alignToSlot(rest, slot, config.blockedDates),
      nextSlotId: slot?.id ?? null,
      attemptCount: 0, // nytt varv efter vilan
      noAnswerStreak: 0,
      triedSlotIds: [], // rotationen börjar om
      retired: false,
      retiredReason: null,
      callbackAt: null,
    };
  }

  // 5. Normalfallet: vänta enligt resultatet, prova ett annat pass.
  const wait = new Date(now.getTime() + retryHours(result, config) * 3600_000);
  const slot = pickNextSlot(slots, triedSlotIds, wait);

  return {
    nextActionAt: alignToSlot(wait, slot, config.blockedDates),
    nextSlotId: slot?.id ?? null,
    attemptCount,
    noAnswerStreak,
    triedSlotIds,
    retired: false,
    retiredReason: null,
    callbackAt: null,
  };
}
