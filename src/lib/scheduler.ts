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
  | "CONNECTED_DM"
  | "BORTFALL";

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
  /**
   * Vila i dagar efter ett nej (`DM_NO`), oavsett anledning.
   *
   * Fram till 2026-08-28 fanns den inte, och det är hela buggen: ett nej föll
   * igenom till `retryHoursNoAnswer` och behandlades alltså exakt som ett
   * obesvarat samtal. Se `computeNext` steg 4.
   */
  retryDaysNo: number;
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
  retryDaysNo: number;
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
    retryDaysNo: cfg.retryDaysNo,
    blockedDates,
  };
}

/**
 * Vila i dagar efter ett nej.
 *
 * `retryDaysNo` är golvet och gäller varje nej oavsett anledning — det är
 * utfallet "Sa nej" som bestämmer, inte den andra frågan säljaren svarar på
 * efteråt. "Vill inte prata med säljare" får förlänga vilan men aldrig korta
 * den: den knappen betyder en hårdare hållning än ett vanligt nej, så den kan
 * omöjligt förtjäna ett snabbare återbesök.
 *
 * Exporterad för att `cancelCallback` behöver exakt samma tal: ett nej som kom
 * fram när en återkomst släpptes ska vila lika länge som ett nej i cockpiten.
 * Två uträkningar av samma sak blir förr eller senare två olika tal.
 */
export function noRestDays(noReason: NoReasonLike, cfg: SchedulerConfig): number {
  if (noReason === "VILL_EJ_PRATA_SALJARE") {
    return Math.max(cfg.retryDaysNo, cfg.retryDaysNoSalespeople);
  }
  return cfg.retryDaysNo;
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
  // Skiljer sig från de andra terminala utfallen på att den inte bara
  // pensionerar RADEN: `recordAttempt` skriver också en permanent rad i
  // `DoNotCall`, nycklad på org-numret, så spärren överlever en omimport.
  // Pensioneringen ensam gör det inte — ett nytt lead-id är ett nytt bolag
  // för allt utom spärrlistan.
  if (result === "BORTFALL") return "bortfall";
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
  /**
   * Utfallet på samma samtal. Utan det gick nej-vilan förlorad här: ett bolag
   * som sagt nej och SEDAN fått en återkomst inbokad föll tillbaka på
   * `retryHoursNoAnswer` när återkomsten avbokades, alltså 20 timmar i stället
   * för 60 dagar. Avbokningen är just den väg som redan en gång lyfte bolag
   * tillbaka in i däcket i förtid (2026-08-26), och den fick inte bli det
   * hålet i nej-regeln också.
   */
  lastOutcome?: OutcomeLike;
  lastNoReason?: NoReasonLike;
  slots: Slot[];
  config: SchedulerConfig;
}): Date | null {
  const {
    lastAttemptAt,
    lastResult,
    lastOutcome = null,
    lastNoReason = null,
    slots,
    config,
  } = params;
  if (!lastAttemptAt) return null;

  const wait = new Date(lastAttemptAt);
  if (lastOutcome === "DM_NO") {
    wait.setDate(wait.getDate() + noRestDays(lastNoReason, config));
  } else {
    // Okänt resultat behandlas som "svarar ej" — den kortaste vilan av dem som
    // finns, alltså den försiktiga gissningen: hellre ringa lite för tidigt än
    // att låsa in ett bolag på ett resultat vi inte kan läsa.
    wait.setTime(
      lastAttemptAt.getTime() +
        retryHours(lastResult ?? "NO_ANSWER", config) * 3600_000
    );
  }
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

  // 4. Kunden sa NEJ. Vila i `retryDaysNo` dagar — 60 som standard.
  //
  //    ## Vad som gick fel innan (rättat 2026-08-28)
  //
  //    Det här steget fanns inte. Bara den smalaste grenen av ett nej,
  //    "vill inte prata med säljare", hade en egen vila. Varje ANNAT nej —
  //    "inget behov", "har byrå", "nöjd med annan", "pris", "timing" — föll
  //    rakt igenom till steg 6, och där räknas vilan ur `result`. Resultatet
  //    på ett nej är `CONNECTED_DM`, som saknar egen gren i `retryHours()`
  //    och alltså landar i `default:` — `retryHoursNoAnswer`.
  //
  //    Nettot: **ett nej vilade exakt lika länge som ett obesvarat samtal.**
  //    Med produktionens 20 timmar innebar det att en kund som sagt nej på
  //    tisdagen låg tillbaka i hela golvets däck på onsdagen, utan lås och
  //    utan markering. Mätt i produktionsdatan 2026-08-28: 636 bolag vars
  //    senaste samtal var ett nej låg ringbara i samma sekund, och 66 samtal
  //    hade redan ringts av en ANNAN säljare efter ett nej — 51 av dem inom
  //    ett dygn. Från kundens stol är det samma företag som ringer igen dagen
  //    efter att de tackat nej.
  //
  //    ## Varför utfallet och inte anledningen bestämmer
  //
  //    Vilan hänger på `DM_NO`, inte på `noReason`. Anledningen är statistik —
  //    den säger varför vi förlorade, inte hur snart kunden vill höra från oss
  //    igen. Svaret på den frågan är detsamma för alla åtta: inte på ett bra
  //    tag. En gren per anledning hade blivit åtta tal att hålla i huvudet och
  //    åtta sätt för samma bugg att komma tillbaka.
  //
  //    ## Varför före taket
  //
  //    Steg 5 ger 30 dagars vila vid taket. Låg det här steget efter hade ett
  //    nej på åttonde försöket fått den kortare vilan, och löftet "aldrig
  //    tidigare än 60 dagar" hade haft ett hål precis där bolaget ringts som
  //    mest. Nejet är alltid det starkaste beskedet vi har.
  //
  //    Leadet spärras inte, och `attemptCount` nollställs inte. Bolaget kan ha
  //    bytt person på två månader, så en permanent spärr på en åsikt någon
  //    uttryckte en gång kostar mer än den skyddar — men ett nej är ett
  //    försök som räknas, och två nej i rad ska föra bolaget närmare taket,
  //    inte tillbaka till ruta ett.
  if (outcome === "DM_NO") {
    const rest = new Date(now);
    rest.setDate(rest.getDate() + noRestDays(noReason, config));
    const slot = pickNextSlot(slots, [], rest);
    return {
      nextActionAt: alignToSlot(rest, slot, config.blockedDates),
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
