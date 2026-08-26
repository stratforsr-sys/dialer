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

export type NoReasonLike =
  | "PRIS"
  | "TIMING"
  | "HAR_BYRA"
  | "HAR_INHOUSE"
  | "INGET_BEHOV"
  | "NOJD_MED_ANNAN"
  | "NEJ_INNAN_PITCH"
  | "VILL_EJ_PRATA_SALJARE"
  | null;

export type OutcomeLike =
  | "GATEKEEPER_BLOCKED"
  | "GATEKEEPER_TRANSFERRED"
  | "GATEKEEPER_GAVE_DM_DETAILS"
  | "WRONG_DM"
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
  /** Vila i dagar efter "vill inte prata med säljare". */
  retryDaysNoSalespeople: number;
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
  /** Ska leadet låsas till säljaren som ringde? Se `claimsLead`. */
  claimsLead: boolean;
}

/**
 * Låser samtalet leadet till säljaren?
 *
 * Låset är `Lead.claimedAt` — så länge det är satt ser ingen annan bolaget i
 * sitt däck (`claimCutoff` i lease-frågan). Tidigare sattes det vid VARJE
 * disposition, vilket i praktiken betyder att den som råkade ringa först ägde
 * bolaget i en månad, oavsett vad som hände i samtalet. Ett "svarar ej" band
 * alltså upp ett bolag lika hårt som ett avslut.
 *
 * Regeln är i stället: **lås bara när det finns en relation att skydda.**
 *
 *   - `CALLBACK_BOOKED` — kunden sa "ring mig på torsdag". Löftet är personligt;
 *     en kollega som ringer istället bränner det.
 *   - `SOLD` — kunden är någons kund.
 *
 * Allt annat låser inte. Ett nej är ingen relation, och ett obesvarat samtal är
 * inte ens en kontakt. Väljer säljaren "ej intresserad" eller "svarar ej"
 * släpps ett lås som satts tidigare — det är den SENASTE dispositionen som
 * avgör, annars låser ett bokat samtal bolaget kvar i en månad efter att
 * samma säljare fått ett nej på det.
 *
 * Att bolaget är osynligt för andra medan återkomsten är öppen sköts inte
 * härifrån utan av återkomstfiltret i `leaseNextLeads` — det gäller alla,
 * även löftesgivaren själv.
 */
export function claimsLead(outcome: OutcomeLike): boolean {
  return outcome === "CALLBACK_BOOKED" || outcome === "SOLD";
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

/**
 * DialerConfig-raden till schemaläggarens konfiguration.
 *
 * Bor här och inte i `actions/dialer.ts`: den filen är `"use server"`, och ett
 * sådant modul får bara exportera async-funktioner. En synkron hjälpare där
 * går inte att dela med andra server actions — och `callbacks.ts` behöver
 * exakt samma tolkning av vilodagar och vilotider som cockpiten använder.
 */
export function toSchedulerConfig(cfg: {
  maxAttempts: number;
  cooldownDays: number;
  retryHoursNoAnswer: number;
  retryHoursBusy: number;
  retryHoursVoicemail: number;
  retryHoursGatekeeper: number;
  retryDaysNoSalespeople: number;
  blockedDatesJson: string;
}): SchedulerConfig {
  let blockedDates: string[] = [];
  try {
    const parsed = JSON.parse(cfg.blockedDatesJson);
    if (Array.isArray(parsed)) blockedDates = parsed.filter((d) => typeof d === "string");
  } catch {
    // Trasig JSON ska inte stoppa ringandet — spärrade datum är en guardrail,
    // inte en förutsättning.
  }
  return {
    maxAttempts: cfg.maxAttempts,
    cooldownDays: cfg.cooldownDays,
    retryHoursNoAnswer: cfg.retryHoursNoAnswer,
    retryHoursBusy: cfg.retryHoursBusy,
    retryHoursVoicemail: cfg.retryHoursVoicemail,
    retryHoursGatekeeper: cfg.retryHoursGatekeeper,
    retryDaysNoSalespeople: cfg.retryDaysNoSalespeople,
    blockedDates,
  };
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
 * När är leadets egen tur i rotationen, räknat från det SENAST ringda samtalet?
 *
 * Svarar på en fråga `computeNext` inte kan svara på: vad gäller när en bokad
 * återkomst försvinner utan att ett samtal ringts? `computeNext` räknar upp
 * `attemptCount` och förutsätter att någon precis lagt på luren. Här har
 * ingenting hänt med bolaget — det enda som ändrats är att löftet inte finns
 * längre, och då ska leadet falla tillbaka på den vila det redan hade tjänat
 * ihop.
 *
 * `null` betyder "ringbart nu" och är rätt svar för ett lead som aldrig ringts:
 * det är ett obearbetat lead, inte ett som väntar.
 *
 * Att i stället skriva `null` på ett lead SOM ringts är det som gick fel fram
 * till 2026-08-26: `nextActionAt = NULL` sorterar först i `ORDER BY … ASC`, så
 * ett bolag som fick ett nej i morse hamnade allra överst i däcket i samma
 * sekund som någon avbokade dess återkomst — före alla bolag som faktiskt
 * väntat ut sin vila.
 */
export function rotationResumeAt(params: {
  lastAttemptAt: Date | null;
  lastResult: CallResultLike | null;
  slots: Slot[];
  config: SchedulerConfig;
}): Date | null {
  const { lastAttemptAt, lastResult, slots, config } = params;
  if (!lastAttemptAt) return null;

  // Okänt resultat behandlas som "svarar ej" — den kortaste vilan av dem som
  // finns, alltså den försiktiga gissningen: hellre ringa lite för tidigt än
  // att låsa in ett bolag på ett resultat vi inte kan läsa.
  const wait = new Date(
    lastAttemptAt.getTime() + retryHours(lastResult ?? "NO_ANSWER", config) * 3600_000
  );
  const slot = pickNextSlot(slots, [], wait);
  return alignToSlot(wait, slot, config.blockedDates);
}

/**
 * Beslutet. Anropas efter varje registrerat samtal; returvärdet skrivs rakt
 * ner på leadet.
 */
export function computeNext(params: {
  lead: LeadSchedulingState;
  result: CallResultLike;
  outcome: OutcomeLike;
  /** Andra nivån på ett nej. Styr vilan vid "vill inte prata med säljare". */
  noReason?: NoReasonLike;
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
    noReason = null,
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
  const claims = claimsLead(outcome);

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
      claimsLead: claims,
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
      claimsLead: claims,
    };
  }

  // 3. Växeln sa när beslutsfattaren är tillbaka. Gratis schemaläggning —
  //    bättre information än någon rotationsregel kan producera.
  //
  //    Ligger tiden INOM ett pass används det passet, inte nästa. `pickNextSlot`
  //    letar efter ett pass som BÖRJAR efter tidpunkten, och kastade därmed bort
  //    passet som faktiskt innehöll den: "han är tillbaka nio" blev inbokat
  //    till tretton, eftersom förmiddagspasset börjar 08:00 och alltså inte är
  //    "efter 09:00". Hela poängen med grenen är att växelns besked väger tyngre
  //    än rotationen — då får rotationen inte flytta beskedet fyra timmar.
  if (dmAvailableAt && dmAvailableAt > now) {
    const slot = slotAt(slots, dmAvailableAt) ?? pickNextSlot(slots, [], dmAvailableAt);
    return {
      nextActionAt: alignToSlot(dmAvailableAt, slot, config.blockedDates),
      nextSlotId: slot?.id ?? null,
      attemptCount,
      noAnswerStreak,
      triedSlotIds,
      retired: false,
      retiredReason: null,
      callbackAt: null,
      claimsLead: claims,
    };
  }

  // 4. "Vill inte prata med säljare" — en hållning, inte en invändning.
  //    Ligger före taket eftersom den är mer specifik: den säger något om
  //    mottagaren, inte om hur många gånger vi råkat ringa. Leadet spärras
  //    inte — bolaget kan ha bytt person, och en permanent spärr på en åsikt
  //    någon uttryckte en gång kostar mer än den skyddar.
  if (noReason === "VILL_EJ_PRATA_SALJARE") {
    const rest = new Date(now);
    rest.setDate(rest.getDate() + config.retryDaysNoSalespeople);
    const slot = pickNextSlot(slots, [], rest);
    return {
      nextActionAt: alignToSlot(rest, slot, config.blockedDates),
      nextSlotId: slot?.id ?? null,
      // Nollställs som efter vilan vid taket: efter en månad är det ett nytt
      // varv, och leadet ska inte falla direkt i taket på gamla försök.
      attemptCount: 0,
      noAnswerStreak: 0,
      triedSlotIds: [],
      retired: false,
      retiredReason: null,
      callbackAt: null,
      claimsLead: claims,
    };
  }

  // 5. Taket nått → vila. Leadet är inte förbrukat, bara pausat.
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
      claimsLead: claims,
    };
  }

  // 6. Normalfallet: vänta enligt resultatet, prova ett annat pass.
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
    claimsLead: claims,
  };
}
