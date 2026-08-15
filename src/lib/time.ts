/**
 * Svensk väggklocka — rena funktioner, körbara både på servern och i
 * webbläsaren.
 *
 * Vercel kör i UTC. En återkomst klockan 14:00 lagras som 12:00Z på sommaren
 * och 13:00Z på vintern, och "dagens återkomster" är därför inte ett dygn i
 * UTC. Räknar man ändå i UTC hamnar allt mellan 22:00 och 24:00 på fel dag i
 * morgonmejlet — sällan, systematiskt, och alltid på kvällsbokningarna.
 *
 * Offseten läses ur Intl i stället för att hårdkodas till +1/+2: den ska vara
 * rätt även den sista helgen i mars utan att någon minns att fixa det.
 */

export const TZ = "Europe/Stockholm";

interface WallClock {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
  ss: number;
}

/** Väggklockan i tidszonen vid en given tidpunkt. */
function wallClock(at: Date, tz: string): WallClock {
  // hourCycle: "h23" och inte hour12: false — det senare ger "24" för midnatt
  // i vissa locales, och 24 som timme räknas fel i varje uttryck nedan.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const p: Record<string, string> = {};
  for (const { type, value } of parts) p[type] = value;

  return {
    y: Number(p.year),
    m: Number(p.month),
    d: Number(p.day),
    hh: Number(p.hour),
    mm: Number(p.minute),
    ss: Number(p.second),
  };
}

/** Tidszonens offset från UTC i millisekunder vid en given tidpunkt. */
export function offsetMs(at: Date, tz: string = TZ): number {
  const w = wallClock(at, tz);
  const asUTC = Date.UTC(w.y, w.m - 1, w.d, w.hh, w.mm, w.ss);
  // at.getTime() innehåller millisekunder som väggklockan inte har.
  return asUTC - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * Midnatt svensk tid, uttryckt som en riktig tidpunkt.
 *
 * Två varv: första gissningen använder offseten vid `at`, andra använder
 * offseten vid gissningen. Utan det andra varvet blir dygnsgränsen en timme
 * fel de två dygn per år då klockan flyttas.
 */
export function startOfDay(at: Date = new Date(), tz: string = TZ): Date {
  const w = wallClock(at, tz);
  const utcMidnight = Date.UTC(w.y, w.m - 1, w.d, 0, 0, 0);
  let t = utcMidnight - offsetMs(at, tz);
  t = utcMidnight - offsetMs(new Date(t), tz);
  return new Date(t);
}

/** Sista millisekunden på det svenska dygn som `at` ligger i. */
export function endOfDay(at: Date = new Date(), tz: string = TZ): Date {
  const start = startOfDay(at, tz);
  // 26 timmar fram och tillbaka till midnatt fångar båda skiftesdygnen, som
  // är 23 respektive 25 timmar långa.
  const nextDay = startOfDay(new Date(start.getTime() + 26 * 3600_000), tz);
  return new Date(nextDay.getTime() - 1);
}

/**
 * Timmen på den svenska väggklockan, 0–23.
 *
 * `Date.getHours()` duger inte: Vercel kör i UTC, och ett samtal klockan 08:30
 * svensk sommartid hade räknats som 06. En fördelning över arbetsdagen blir då
 * systematiskt två timmar förskjuten och ser ut som om golvet börjar ringa före
 * gryningen.
 */
export function hourOfDay(at: Date, tz: string = TZ): number {
  return wallClock(at, tz).hh;
}

/**
 * Veckodagen på den svenska kalendern. 1 = måndag, 7 = söndag.
 *
 * Samma fälla som `hourOfDay`, fast tystare: ett samtal klockan 00:30 natten
 * till måndag är söndag i UTC. Det slår sällan till i ett ringpass, men när
 * det gör det hamnar raden i fel vecka utan att något ser konstigt ut.
 *
 * Veckodagen räknas ur det svenska KALENDERDATUMET och inte ur tidpunkten:
 * `Date.UTC` av år/månad/dag ger en tidpunkt vars UTC-veckodag är den svenska
 * dagens, oavsett var i dygnet originalet låg.
 */
export function weekdayOf(at: Date, tz: string = TZ): number {
  const w = wallClock(at, tz);
  const day = new Date(Date.UTC(w.y, w.m - 1, w.d)).getUTCDay();
  // getUTCDay ger 0 för söndag; kolumnen är 1–7 med måndag = 1.
  return day === 0 ? 7 : day;
}

/** Samma svenska kalenderdag? */
export function isSameDay(a: Date, b: Date, tz: string = TZ): boolean {
  const wa = wallClock(a, tz);
  const wb = wallClock(b, tz);
  return wa.y === wb.y && wa.m === wb.m && wa.d === wb.d;
}

/** "14:30" */
export function formatTime(at: Date, tz: string = TZ): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
}

/** "tors 14 aug" */
export function formatDate(at: Date, tz: string = TZ): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(at);
}

/**
 * Tidpunkten så som en säljare läser den mitt i ett samtal: "14:30" om det är
 * idag, "imorgon 09:00" om det är imorgon, annars "tors 14 aug 14:30".
 * Dagens tider är de enda som räknas i minuter, och de ska vara kortast.
 */
export function formatWhen(at: Date, now: Date = new Date(), tz: string = TZ): string {
  if (isSameDay(at, now, tz)) return formatTime(at, tz);

  const tomorrow = new Date(startOfDay(now, tz).getTime() + 26 * 3600_000);
  if (isSameDay(at, tomorrow, tz)) return `imorgon ${formatTime(at, tz)}`;

  const yesterday = new Date(startOfDay(now, tz).getTime() - 2 * 3600_000);
  if (isSameDay(at, yesterday, tz)) return `igår ${formatTime(at, tz)}`;

  return `${formatDate(at, tz)} ${formatTime(at, tz)}`;
}

/**
 * Hur långt bort i klartext: "om 4 min", "om 2 tim", "3 dagar sen".
 * Avrundas nedåt med flit — "om 1 min" ska inte stå kvar när det är 40
 * sekunder kvar.
 */
export function formatRelative(at: Date, now: Date = new Date()): string {
  const diffMin = Math.round((at.getTime() - now.getTime()) / 60_000);
  const abs = Math.abs(diffMin);
  const past = diffMin < 0;

  let value: string;
  if (abs < 1) value = "nu";
  else if (abs < 60) value = `${abs} min`;
  else if (abs < 60 * 24) value = `${Math.floor(abs / 60)} tim`;
  else value = `${Math.floor(abs / (60 * 24))} d`;

  if (value === "nu") return "nu";
  return past ? `${value} sen` : `om ${value}`;
}

/**
 * En lokal datetime-sträng som `<input type="datetime-local">` accepterar,
 * i svensk tid: "2026-08-14T14:30".
 *
 * `toISOString().slice(0, 16)` ger UTC och skulle flytta varje förvalt
 * klockslag två timmar bakåt på sommaren.
 */
export function toDatetimeLocalValue(at: Date, tz: string = TZ): string {
  const w = wallClock(at, tz);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${w.y}-${p2(w.m)}-${p2(w.d)}T${p2(w.hh)}:${p2(w.mm)}`;
}
