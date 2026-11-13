/**
 * Möten — ren logik, inget UI och ingen databas.
 *
 * Allt som avgör vad ett möte ÄR och vad som händer med bolaget när mötet
 * avgörs bor här, så att det går att prova utan en server
 * (`scripts/test-moten.ts`). Server actions och vyer anropar härifrån; de
 * fattar inga egna beslut om livscykeln.
 *
 * ## Livscykeln
 *
 *     BOOKED ──┬── HELD (SALD | NEJ | UPPFOLJNING)
 *              ├── NO_SHOW
 *              └── CANCELLED
 *
 * "Utfall saknas" är inget lagrat status. Det är `BOOKED` med en sluttid som
 * passerat (`needsOutcome`) — samma princip som en missad återkomst, och av
 * samma skäl: ett lagrat värde hade krävt ett jobb som vänder rader vid rätt
 * minut, och den minuten hade blivit fel varje gång jobbet inte kördes.
 *
 * ## Ett möte lämnar listan av ett beslut, aldrig av en klocka
 *
 * Det är regeln återkomsterna lärde oss den dyra vägen (migration 016, 024).
 * Ett passerat möte står kvar överst på /meetings tills någon säger hur det
 * gick, och bolaget står kvar utanför däcket så länge. Varje utgång ur
 * `BOOKED` är ett utfall som säger vad som händer med bolaget — se
 * `leadEffect`. "Släpp" finns som en ärlig utväg, av samma skäl som
 * `FELBOKAD` finns bland återkomstens skäl: utan den väljer säljaren ett
 * falskt utfall för att komma vidare.
 */

import { toDatetimeLocalValue, weekdayOf, TZ } from "./time";

export type MeetingKindLike = "DIGITALT" | "FYSISKT" | "TELEFON";
export type MeetingStatusLike = "BOOKED" | "HELD" | "NO_SHOW" | "CANCELLED";
export type MeetingOutcomeLike = "SALD" | "NEJ" | "UPPFOLJNING";
export type NoReasonLike =
  | "PRIS"
  | "TIMING"
  | "HAR_BYRA"
  | "HAR_INHOUSE"
  | "INGET_BEHOV"
  | "NOJD_MED_ANNAN"
  | "NEJ_INNAN_PITCH"
  | "VILL_EJ_PRATA_SALJARE";

// ── Etiketter ──────────────────────────────────────────────────────────────

export const KIND_OPTIONS: Array<{
  value: MeetingKindLike;
  label: string;
  /** Vad platsfältet frågar efter för just den här sorten. */
  locationLabel: string;
  locationPlaceholder: string;
}> = [
  {
    value: "DIGITALT",
    label: "Teams / video",
    locationLabel: "Länk",
    locationPlaceholder: "Teams-länk — kan läggas till senare",
  },
  {
    value: "FYSISKT",
    label: "Fysiskt",
    locationLabel: "Adress",
    locationPlaceholder: "Gatuadress, ort",
  },
  {
    value: "TELEFON",
    label: "Telefon",
    locationLabel: "Nummer",
    locationPlaceholder: "Numret vi ringer på",
  },
];

export const KIND_LABELS: Record<MeetingKindLike, string> = {
  DIGITALT: "Teams / video",
  FYSISKT: "Fysiskt",
  TELEFON: "Telefon",
};

export const OUTCOME_LABELS: Record<MeetingOutcomeLike, string> = {
  SALD: "Såld",
  NEJ: "Sa nej",
  UPPFOLJNING: "Uppföljning",
};

export const NO_REASON_LABELS: Record<NoReasonLike, string> = {
  PRIS: "Pris",
  TIMING: "Timing",
  HAR_BYRA: "Har byrå",
  HAR_INHOUSE: "Har inhouse",
  INGET_BEHOV: "Inget behov",
  NOJD_MED_ANNAN: "Nöjd med annan",
  NEJ_INNAN_PITCH: "Sa nej innan pitch",
  VILL_EJ_PRATA_SALJARE: "Vill inte prata med säljare",
};

/** Längdvalen. Få, för att de ska gå att välja medan kunden är kvar i luren. */
export const DURATION_OPTIONS = [15, 30, 45, 60, 90] as const;
export const DEFAULT_DURATION_MIN = 30;
export const MIN_DURATION_MIN = 5;
export const MAX_DURATION_MIN = 480;

// ── Formuläret ─────────────────────────────────────────────────────────────

/**
 * Det mötesrutan håller medan säljaren fyller i. `at` är råvärdet från
 * `datetime-local` — lokal väggklocka utan zon, tolkad i webbläsarens zon
 * (säljarens), precis som återkomstens fält.
 */
export interface MeetingDraft {
  at: string;
  durationMin: number;
  kind: MeetingKindLike;
  location: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  holderId: string;
  note: string;
}

export function emptyMeetingDraft(init: Partial<MeetingDraft> = {}): MeetingDraft {
  return {
    at: "",
    durationMin: DEFAULT_DURATION_MIN,
    kind: "DIGITALT",
    location: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    holderId: "",
    note: "",
    ...init,
  };
}

export type DraftField = "at" | "durationMin" | "contactName" | "contactEmail" | "holderId";

/** Längsta framförhållning. Längre fram än så är nästan alltid ett skrivfel i året. */
export const MAX_DAYS_AHEAD = 366;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(s: string): boolean {
  return EMAIL_RE.test(s.trim());
}

/**
 * Går utkastet att spara? Returnerar ett fel per fält, tomt objekt = ok.
 *
 * Strängare än servern med flit (se `acceptableMeetingTime`): rutan ska
 * stoppa ett skrivfel medan kunden fortfarande är kvar i luren, servern ska
 * aldrig kasta ett möte som säljaren redan sett sparas.
 */
export function validateMeetingDraft(
  d: MeetingDraft,
  now: Date = new Date()
): Partial<Record<DraftField, string>> {
  const errors: Partial<Record<DraftField, string>> = {};

  const at = d.at ? new Date(d.at) : null;
  if (!at || Number.isNaN(at.getTime())) {
    errors.at = "Välj dag och tid";
  } else if (at.getTime() <= now.getTime()) {
    errors.at = "Tiden har redan passerat";
  } else if (at.getTime() > now.getTime() + MAX_DAYS_AHEAD * 86_400_000) {
    errors.at = "Mer än ett år fram — stämmer året?";
  }

  if (
    !Number.isInteger(d.durationMin) ||
    d.durationMin < MIN_DURATION_MIN ||
    d.durationMin > MAX_DURATION_MIN
  ) {
    errors.durationMin = `Mellan ${MIN_DURATION_MIN} och ${MAX_DURATION_MIN} minuter`;
  }

  if (!d.contactName.trim()) errors.contactName = "Vem är mötet med?";
  if (d.contactEmail.trim() && !isValidEmail(d.contactEmail)) {
    errors.contactEmail = "Ser inte ut som en e-postadress";
  }
  if (!d.holderId) errors.holderId = "Vem håller mötet?";

  return errors;
}

/**
 * Serverns tolerans för en mötestid som kommer genom skrivkön.
 *
 * Kön skickar om en post som fallerat på nätet, och ett avbrott kan vara
 * långt. Ett möte bokat "om en timme" som når servern två timmar senare är
 * fortfarande ett möte som bokades — och det ska sparas och dyka upp som
 * "utfall saknas", inte kastas tyst som "tiden har passerat". Servern
 * avvisar därför bara det som inte kan vara ett möte alls.
 */
export function acceptableMeetingTime(at: Date, now: Date = new Date()): boolean {
  if (Number.isNaN(at.getTime())) return false;
  const DAY = 86_400_000;
  return at.getTime() > now.getTime() - 30 * DAY && at.getTime() < now.getTime() + 2 * 366 * DAY;
}

/** Längden som servern sparar: heltal, inom databasens villkor. */
export function clampDuration(min: unknown): number {
  const n = typeof min === "number" ? Math.round(min) : Number.NaN;
  if (!Number.isFinite(n)) return DEFAULT_DURATION_MIN;
  return Math.min(MAX_DURATION_MIN, Math.max(MIN_DURATION_MIN, n));
}

/** Trimmat, kapat, och tomt blir null. Databasens kolumner är TEXT utan gräns. */
export function cleanText(s: unknown, max = 500): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t ? t.slice(0, max) : null;
}

// ── Dagvalet i rutan ───────────────────────────────────────────────────────

/**
 * Nästa vardagar att välja bland, i svensk tid. "Tisdag klockan tio?" ska
 * vara ett klick och fyra siffror medan kunden väntar — inte en kalender.
 *
 * Stegar i hela dygn från lunchtid och inte från midnatt: ett dygn är 23 eller
 * 25 timmar de två helgerna om året då klockan ställs om, och från midnatt
 * hade ett steg kunnat landa på samma datum två gånger.
 */
export function nextWorkdays(
  now: Date,
  count: number,
  tz: string = TZ
): Array<{ date: string; label: string }> {
  const out: Array<{ date: string; label: string }> = [];
  const today = toDatetimeLocalValue(now, tz).slice(0, 10);
  const noon = new Date(`${today}T12:00:00Z`);
  const short = new Intl.DateTimeFormat("sv-SE", { timeZone: tz, weekday: "short", day: "numeric" });
  for (let i = 0; out.length < count && i < count * 3; i++) {
    const d = new Date(noon.getTime() + i * 86_400_000);
    if (weekdayOf(d, tz) >= 6) continue;
    const date = toDatetimeLocalValue(d, tz).slice(0, 10);
    const label = i === 0 ? "I dag" : i === 1 ? "I morgon" : short.format(d);
    out.push({ date, label });
  }
  return out;
}

/** "2026-11-17" + "10:15" → "2026-11-17T10:15". Tomt om någon del saknas. */
export function joinDateTime(date: string, time: string): string {
  return date && time ? `${date}T${time}` : "";
}

/** Motsatsen till `joinDateTime`. */
export function splitDateTime(at: string): { date: string; time: string } {
  const [date = "", time = ""] = at.split("T");
  return { date, time: time.slice(0, 5) };
}

// ── Tid ────────────────────────────────────────────────────────────────────

export interface TimedMeeting {
  scheduledAt: Date;
  durationMin: number;
}

export function meetingEnd(m: TimedMeeting): Date {
  return new Date(m.scheduledAt.getTime() + m.durationMin * 60_000);
}

/** Bokat, och sluttiden har passerat: någon måste säga hur det gick. */
export function needsOutcome(
  m: TimedMeeting & { status: MeetingStatusLike },
  now: Date = new Date()
): boolean {
  return m.status === "BOOKED" && meetingEnd(m).getTime() <= now.getTime();
}

/** Pågår mötet just nu? */
export function isOngoing(
  m: TimedMeeting & { status: MeetingStatusLike },
  now: Date = new Date()
): boolean {
  return (
    m.status === "BOOKED" &&
    m.scheduledAt.getTime() <= now.getTime() &&
    meetingEnd(m).getTime() > now.getTime()
  );
}

/**
 * Överlappar två möten? Halvöppna intervall: ett möte som slutar 10:30 och
 * ett som börjar 10:30 krockar inte — det är så en kalender ser ut.
 */
export function overlaps(a: TimedMeeting, b: TimedMeeting): boolean {
  return (
    a.scheduledAt.getTime() < meetingEnd(b).getTime() &&
    b.scheduledAt.getTime() < meetingEnd(a).getTime()
  );
}

/**
 * Öppna möten hos samma hållare som krockar med ett föreslaget.
 *
 * En varning, aldrig ett stopp. Två möten samma tid kan vara rätt (en kollega
 * tar det ena), och en bokning som stoppas medan kunden väntar i luren är
 * värre än en dubbelbokning som syns.
 */
export function conflictsFor<T extends TimedMeeting & { id: string; status: MeetingStatusLike }>(
  candidate: TimedMeeting & { id?: string | null },
  others: T[]
): T[] {
  return others.filter(
    (o) => o.status === "BOOKED" && o.id !== candidate.id && overlaps(candidate, o)
  );
}

// ── Avgörandet ─────────────────────────────────────────────────────────────

/** Nästa steg efter ett möte som inte blev ett avslut eller ett nej. */
export type FollowUp =
  | { type: "meeting"; at: Date; durationMin: number }
  | { type: "callback"; at: Date }
  | { type: "release" };

export type Resolution =
  | { status: "HELD"; outcome: "SALD"; dealId: string }
  | { status: "HELD"; outcome: "NEJ"; noReason: NoReasonLike }
  | { status: "HELD"; outcome: "UPPFOLJNING"; followUp: FollowUp }
  | { status: "NO_SHOW"; followUp: FollowUp }
  | { status: "CANCELLED"; followUp: FollowUp };

/**
 * Är avgörandet komplett? Returnerar ett felmeddelande, eller null.
 *
 * Felen är formulerade för en människa — de visas i rutan om klienten
 * någonsin skickar något den inte borde.
 */
export function validateResolution(r: Resolution, now: Date = new Date()): string | null {
  if (r.status === "HELD" && r.outcome === "SALD") {
    return r.dealId ? null : "Affären måste registreras först";
  }
  if (r.status === "HELD" && r.outcome === "NEJ") {
    return r.noReason ? null : "Välj varför kunden sa nej";
  }
  const f = r.followUp;
  if (!f) return "Välj nästa steg";
  // En uppföljning utan nästa steg är ingen uppföljning. Vill man släppa
  // bolaget efter ett genomfört möte är det ett nej, inte en uppföljning.
  if (r.status === "HELD" && f.type === "release") {
    return "En uppföljning behöver ett nytt möte eller en återkomst";
  }
  if (f.type === "meeting" || f.type === "callback") {
    if (Number.isNaN(f.at.getTime())) return "Ogiltig tidpunkt";
    if (f.at.getTime() <= now.getTime()) return "Tiden har redan passerat";
  }
  if (f.type === "meeting") {
    if (
      !Number.isInteger(f.durationMin) ||
      f.durationMin < MIN_DURATION_MIN ||
      f.durationMin > MAX_DURATION_MIN
    ) {
      return `Längden ska vara ${MIN_DURATION_MIN}–${MAX_DURATION_MIN} minuter`;
    }
  }
  return null;
}

/**
 * Vem nästa steg tillhör.
 *
 * - **Uteblev / avbokat → den som bokade.** Att ringa upp och boka om är
 *   bokarens jobb — det är hen som har relationen från samtalet, och det är
 *   så mötesbokning fungerar hos alla som gör det i stor skala.
 * - **Uppföljning efter ett genomfört möte → den som höll mötet.** Det var
 *   hen som satt i rummet och vet vad som ska följas upp.
 */
export function followUpOwnerId(
  r: Resolution,
  m: { bookedById: string; holderId: string }
): string {
  return r.status === "HELD" ? m.holderId : m.bookedById;
}

/**
 * Vad avgörandet gör med bolaget. Samma tillstånd som motsvarande utfall i
 * dispositionen ger — annars blir avgörandet en andra, tystare väg förbi
 * rotationens regler (samma resonemang som `cancelCallback`).
 *
 * | Avgörande               | Bolaget                                       |
 * |-------------------------|-----------------------------------------------|
 * | Såld                    | Pensionerat `sald`, låst — som `SOLD`         |
 * | Sa nej                  | Vilar `retryDaysNo` från NU, olåst — `DM_NO`  |
 * | Nytt möte               | Låst till hållaren, utanför däcket            |
 * | Återkomst               | Låst till uppföljaren, utanför däcket         |
 * | Släpp                   | Olåst, tillbaka i rotationen på tjänad vila   |
 *
 * `nextActionAt` räknas inte här — vilan kräver konfigurationen och passen,
 * och det gör servern med samma funktioner som cockpiten (`noRestDays`,
 * `rotationResumeAt`). Här bestäms bara VILKEN regel som gäller.
 */
export type LeadEffect =
  | { kind: "sold" }
  | { kind: "said_no"; noReason: NoReasonLike }
  | { kind: "new_meeting"; ownerId: string; at: Date }
  | { kind: "callback"; ownerId: string; at: Date }
  | { kind: "release" };

export function leadEffect(
  r: Resolution,
  m: { bookedById: string; holderId: string }
): LeadEffect {
  if (r.status === "HELD" && r.outcome === "SALD") return { kind: "sold" };
  if (r.status === "HELD" && r.outcome === "NEJ") return { kind: "said_no", noReason: r.noReason };
  const f = r.followUp;
  const ownerId = followUpOwnerId(r, m);
  if (f.type === "meeting") return { kind: "new_meeting", ownerId, at: f.at };
  if (f.type === "callback") return { kind: "callback", ownerId, at: f.at };
  return { kind: "release" };
}

/** Raden i aktivitetsloggen. Samma ord som knapparna. */
export function resolutionLabel(r: Resolution): string {
  const next = (f: FollowUp) =>
    f.type === "meeting" ? "nytt möte bokat" : f.type === "callback" ? "återkomst bokad" : "släppt till ringlistan";
  if (r.status === "HELD") {
    if (r.outcome === "SALD") return "Möte genomfört — såld";
    if (r.outcome === "NEJ") return `Möte genomfört — sa nej: ${NO_REASON_LABELS[r.noReason]}`;
    return `Möte genomfört — uppföljning, ${next(r.followUp)}`;
  }
  if (r.status === "NO_SHOW") return `Kunden kom inte till mötet — ${next(r.followUp)}`;
  return `Mötet avbokades — ${next(r.followUp)}`;
}

/** Kort status för en rad. */
export function statusLabel(
  m: TimedMeeting & { status: MeetingStatusLike; outcome?: MeetingOutcomeLike | null },
  now: Date = new Date()
): string {
  switch (m.status) {
    case "BOOKED":
      if (needsOutcome(m, now)) return "Utfall saknas";
      if (isOngoing(m, now)) return "Pågår";
      return "Bokat";
    case "HELD":
      return m.outcome ? `Genomfört — ${OUTCOME_LABELS[m.outcome].toLowerCase()}` : "Genomfört";
    case "NO_SHOW":
      return "Kom inte";
    case "CANCELLED":
      return "Avbokat";
  }
}

// ── Statistik ──────────────────────────────────────────────────────────────

export interface MeetingStats {
  /** Alla möten i urvalet, oavsett status. */
  booked: number;
  held: number;
  noShow: number;
  cancelled: number;
  /** Bokade vars tid inte kommit än (eller pågår). */
  upcoming: number;
  /** Bokade vars sluttid passerat utan utfall. */
  awaiting: number;
  /** Genomförda som blev en affär. */
  sold: number;
  /**
   * Genomförda / (genomförda + uteblivna). `null` när inget möte avgjorts än:
   * en procentsats på noll möten är inte 0 % och inte 100 %, den är okänd.
   *
   * Avbokade räknas inte i nämnaren. Ett möte kunden flyttar eller avbokar i
   * förväg är inte samma sak som ett möte kunden struntar i, och det är det
   * senare show rate ska mäta.
   */
  showRate: number | null;
  /** Sålda / genomförda. `null` utan genomförda möten. */
  closeRate: number | null;
}

export function meetingStats(
  rows: Array<TimedMeeting & { status: MeetingStatusLike; outcome?: MeetingOutcomeLike | null }>,
  now: Date = new Date()
): MeetingStats {
  let held = 0, noShow = 0, cancelled = 0, upcoming = 0, awaiting = 0, sold = 0;
  for (const m of rows) {
    if (m.status === "HELD") {
      held++;
      if (m.outcome === "SALD") sold++;
    } else if (m.status === "NO_SHOW") noShow++;
    else if (m.status === "CANCELLED") cancelled++;
    else if (needsOutcome(m, now)) awaiting++;
    else upcoming++;
  }
  const decided = held + noShow;
  return {
    booked: rows.length,
    held,
    noShow,
    cancelled,
    upcoming,
    awaiting,
    sold,
    showRate: decided > 0 ? held / decided : null,
    closeRate: held > 0 ? sold / held : null,
  };
}

/** Procent utan decimaler, eller ett streck när talet inte finns. */
export function pct(x: number | null): string {
  return x === null ? "–" : `${Math.round(x * 100)} %`;
}
