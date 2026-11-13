/**
 * Mötet i säljarens kalender — ren logik, körbar i webbläsaren och i proven.
 *
 * Dialern skickar ALDRIG en inbjudan till kunden själv. Den bygger en färdig
 * händelse som säljaren öppnar i sin egen kalender, och det är där inbjudan
 * skickas — från säljarens adress, med säljarens signatur, och med Teams-länken
 * som Outlook skapar när man slår på "Teams-möte". Golvet gjorde redan så för
 * hand ("Möte 10:15, inbjudan skickad"); det som saknades var att slippa skriva
 * in allt två gånger.
 *
 * Tre vägar, för att golvet inte har en enda kalender:
 *
 *   - **Outlook** (webben, Microsoft 365) — öppnar ett ifyllt nytt möte med
 *     kunden som deltagare. Teams-knappen finns i samma ruta.
 *   - **Google Kalender** — samma sak, och Google frågar själv om inbjudan
 *     ska skickas när man sparar.
 *   - **.ics** — för Outlook på datorn, Apple Kalender och allt annat. Utan
 *     deltagare med flit: en `ATTENDEE`-rad utan `ORGANIZER` får Outlook att
 *     behandla filen som en inbjudan säljaren själv fått, och då går den inte
 *     att skicka vidare. Kundens adress står i beskrivningen i stället.
 */

export interface CalendarMeeting {
  /** Stabilt id, så att en importerad fil ersätter i stället för dubblerar. */
  id: string;
  start: Date;
  durationMin: number;
  companyName: string;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  kindLabel: string;
  location?: string | null;
  note?: string | null;
  holderName?: string | null;
}

export function meetingTitle(m: Pick<CalendarMeeting, "companyName" | "contactName">): string {
  return m.contactName ? `Möte: ${m.companyName} (${m.contactName})` : `Möte: ${m.companyName}`;
}

function end(m: CalendarMeeting): Date {
  return new Date(m.start.getTime() + m.durationMin * 60_000);
}

/** Beskrivningen som följer med till kalendern. Tomma rader utelämnas. */
export function meetingDescription(m: CalendarMeeting): string {
  return [
    m.note ? m.note : null,
    m.note ? "" : null,
    `Bolag: ${m.companyName}`,
    m.contactName ? `Kontakt: ${m.contactName}` : null,
    m.contactPhone ? `Telefon: ${m.contactPhone}` : null,
    m.contactEmail ? `E-post: ${m.contactEmail}` : null,
    `Typ: ${m.kindLabel}`,
    m.holderName ? `Håller mötet: ${m.holderName}` : null,
  ]
    .filter((x): x is string => x !== null)
    .join("\n");
}

// ── iCalendar (RFC 5545) ───────────────────────────────────────────────────

/** `20261114T090000Z` — UTC, så att filen betyder samma sak i varje kalender. */
export function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Textvärden: bakstreck, semikolon och komma skyddas, radbrytningar blir `\n`.
 * Ordningen är avgörande — bakstrecket först, annars dubbelskyddas de andra.
 */
export function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Viker en rad vid 75 oktetter, som standarden kräver. Räknar **byte**, inte
 * tecken — "Möte med Åsa" är längre i UTF-8 än i JavaScript — och delar aldrig
 * ett tecken mitt i, vilket hade gett ett trasigt "Ã" i kalendern.
 */
export function foldIcsLine(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let curBytes = 0;
  // Första raden får 75 oktetter; fortsättningsraderna börjar med ett
  // mellanslag och får därför 74 till.
  let limit = 75;
  for (const ch of Array.from(line)) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) {
      out.push(cur);
      cur = "";
      curBytes = 0;
      limit = 74;
    }
    cur += ch;
    curBytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(m: CalendarMeeting, now: Date = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Clicknet//Dialer//SV",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${m.id}@dialer.clicknet`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(m.start)}`,
    `DTEND:${icsDate(end(m))}`,
    `SUMMARY:${icsEscape(meetingTitle(m))}`,
    `DESCRIPTION:${icsEscape(meetingDescription(m))}`,
    ...(m.location ? [`LOCATION:${icsEscape(m.location)}`] : []),
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(meetingTitle(m))}`,
    "TRIGGER:-PT15M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  // CRLF mellan raderna och efter den sista — så står det i standarden, och
  // Outlook på Windows är den som läser den bokstavligt.
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

/** Filnamn utan tecken som Windows eller en mejlklient snubblar på. */
export function icsFileName(m: Pick<CalendarMeeting, "companyName" | "start">): string {
  const day = m.start.toISOString().slice(0, 10);
  const safe = m.companyName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `mote-${safe || "bolag"}-${day}.ics`;
}

// ── Länkar ─────────────────────────────────────────────────────────────────

/** Google: `dates` i kompakt UTC, `add` lägger kunden som gäst. */
export function googleCalendarUrl(m: CalendarMeeting): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: meetingTitle(m),
    dates: `${icsDate(m.start)}/${icsDate(end(m))}`,
    details: meetingDescription(m),
  });
  if (m.location) p.set("location", m.location);
  if (m.contactEmail) p.set("add", m.contactEmail);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/**
 * Outlook på webben (Microsoft 365). Tiderna som ISO med `Z`, så att mötet
 * hamnar rätt oavsett vilken tidszon kontot står på.
 */
export function outlookCalendarUrl(m: CalendarMeeting): string {
  const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
  const p = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: meetingTitle(m),
    startdt: iso(m.start),
    enddt: iso(end(m)),
    body: meetingDescription(m),
  });
  if (m.location) p.set("location", m.location);
  if (m.contactEmail) p.set("to", m.contactEmail);
  return `https://outlook.office.com/calendar/0/deeplink/compose?${p.toString()}`;
}

/** `data:`-URL för nedladdning direkt i klienten — ingen serverrundtur. */
export function icsDataUrl(m: CalendarMeeting, now: Date = new Date()): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(buildIcs(m, now))}`;
}
