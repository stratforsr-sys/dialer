/**
 * Varför skulle däcket INTE dela ut det här bolaget?
 *
 * Ren logik utan databasberoenden, så att listvyn kan svara på samma fråga som
 * `leaseNextLeads` utan att köra dess SQL.
 *
 * ## Varför den finns
 *
 * Mappvyn visste ingenting om rotationens regler. Ett spärrat bolag, en kund,
 * ett bolag med öppen återkomst och ett bolag som vilar såg exakt likadana ut
 * som ett obearbetat lead — samma rad, samma färg, samma "Öppna i dialer".
 * Mätt i produktionen 2026-08-26 gällde det **831 av 5 668** bolag i
 * `Clicknet Lista 1`: 192 spärrade, 2 kunder, 175 med öppet löfte och 462
 * vilande. Däcket delade aldrig ut dem — men mappen visade dem, och därifrån
 * gick de att öppna rakt in i dialern (`leaseSpecificLead` struntar med flit i
 * däckets filter). Det var så bolag "dök upp igen" efter att ha behandlats:
 * inte genom rotationen, utan genom listan bredvid den.
 *
 * ## Håll den i takt med SQL:en
 *
 * Villkoren nedan speglar WHERE-satsen i `leaseNextLeads` i `actions/dialer.ts`.
 * De två är avsiktligt separata — däcket måste filtrera i databasen, mappen
 * måste förklara för en människa — men de får aldrig säga olika saker.
 * **Ändras det ena villkoret ska det andra ändras i samma commit.**
 *
 * Arbetslåset (`leasedUntil`) är med flit INTE med: det är en reservation på
 * minuter som säger vem som sitter i bolaget just nu, inte om bolaget hör
 * hemma i rotationen. Mappvyn har redan `claimState` för ägarskapsfrågan.
 */

export type DeckState =
  | { state: "callable" }
  | { state: "retired"; reason: string | null }
  | { state: "customer" }
  | { state: "dnc" }
  | { state: "callback"; at: Date }
  | { state: "capped"; attempts: number }
  | { state: "resting"; until: Date };

export interface DeckStateLead {
  retired: boolean;
  retiredReason: string | null;
  hasActiveDeal: boolean;
  attemptCount: number;
  /** Ekot av den öppna återkomsten. Null när ingen är öppen. */
  callbackAt: Date | string | null;
  nextActionAt: Date | string | null;
  /** Spärrlistan. `expiresAt: null` = permanent. */
  dnc?: { expiresAt: Date | string | null } | null;
}

function asDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  return v instanceof Date ? v : new Date(v);
}

/** Läsbar text för `Lead.retiredReason`. Koden lagras, människan läser. */
export const RETIRED_LABELS: Record<string, string> = {
  fel_nummer: "Fel nummer",
  ogiltigt_nummer: "Ogiltigt nummer",
  sald: "Såld",
  inget_nummer: "Inget nummer att hitta",
};

/**
 * Ordningen är prioriterad, inte godtycklig: den svarar på "vad ska stå på
 * raden" när flera skäl gäller samtidigt. Ett spärrat bolag som också vilar är
 * spärrat — vilan är då ointressant.
 */
export function deckState(
  lead: DeckStateLead,
  maxAttempts: number,
  now: Date = new Date()
): DeckState {
  if (lead.retired) return { state: "retired", reason: lead.retiredReason };
  if (lead.hasActiveDeal) return { state: "customer" };

  const dncExpires = lead.dnc ? asDate(lead.dnc.expiresAt) : undefined;
  // Raden finns och har antingen inget slutdatum eller ett som inte passerat.
  if (lead.dnc && (dncExpires === null || (dncExpires && dncExpires > now))) {
    return { state: "dnc" };
  }

  const callbackAt = asDate(lead.callbackAt);
  if (callbackAt) return { state: "callback", at: callbackAt };

  // Taket har ett undantag i däcket för lovade bolag, men ett lovat bolag är
  // redan fångat av grenen ovanför — här återstår bara det raka taket.
  if (lead.attemptCount >= maxAttempts) {
    return { state: "capped", attempts: lead.attemptCount };
  }

  const nextActionAt = asDate(lead.nextActionAt);
  if (nextActionAt && nextActionAt > now) return { state: "resting", until: nextActionAt };

  return { state: "callable" };
}

/** Kort etikett för raden. `null` när bolaget är ringbart och inte behöver någon. */
export function deckStateLabel(s: DeckState): string | null {
  switch (s.state) {
    case "callable":
      return null;
    case "retired":
      return s.reason ? RETIRED_LABELS[s.reason] ?? s.reason : "Ur rotationen";
    case "customer":
      return "Kund";
    case "dnc":
      return "Spärrlista";
    case "callback":
      return "Lovad återkomst";
    case "capped":
      return `${s.attempts} försök — taket nått`;
    case "resting":
      return "Vilar";
  }
}

/** Skiljer det som är permanent ur rotationen från det som bara väntar. */
export function isOutOfRotation(s: DeckState): boolean {
  return s.state === "retired" || s.state === "customer" || s.state === "dnc";
}
