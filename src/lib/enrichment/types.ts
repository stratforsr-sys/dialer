/**
 * Pitch-motorns signallager.
 *
 * Varje uppgift står för sig själv, med egen källa, egen färskhet och egen
 * säkerhet. Saknad uppgift betyder OKÄNT — vilket är något helt annat än
 * värdet noll. Ett dossier med två säkra påståenden slår ett med tre där det
 * tredje är fel: en säljare som har fel en gång slutar lita på verktyget för
 * alltid.
 *
 * Providers är utbytbara bakom det här gränssnittet. Gratisspåret är
 * implementerat; rankprovidern ligger bakom en flagga och kan slås på med en
 * miljövariabel den dagen budgeten finns, utan att något annat skrivs om.
 */

export interface Signal {
  /** "tech.hasSSL", "pagespeed.mobileLcp", "seo.rank" … */
  key: string;
  valueNum?: number | null;
  valueStr?: string | null;
  valueBool?: boolean | null;
  unit?: string | null;
  /** 0–100. Under variantens tröskel renderas påståendet aldrig. */
  confidence: number;
  source: string;
  sourceUrl?: string | null;
  /** True när uppgiften är en säljbar SVAGHET, inte bara ett faktum. */
  weakness?: boolean;
  /**
   * Säljstyrka 1–5 — en annan sak än säkerhet.
   *
   * Att sakna schema.org-markup är nästan alltid sant (hög säkerhet) och
   * nästan aldrig intressant för en rörmokare (låg styrka). Att sajten säger
   * "Hem" i webbläsarfliken är både sant och omedelbart begripligt.
   *
   * Utan den här skillnaden sorteras panelen på förekomst, och då hamnar de
   * tre tråkigaste punkterna överst på varje samtal.
   */
  strength?: number;
  rawJson?: string | null;
}

export interface SignalContext {
  leadId: string;
  companyName: string;
  website: string | null;
  orgNumber: string | null;
  address: string | null;
}

export interface SignalProvider {
  name: string;
  /** Hur länge uppgifterna är giltiga innan de behöver hämtas om. */
  ttlDays: number;
  /** False när provider saknar nyckel eller är avstängd. */
  enabled(): boolean;
  collect(ctx: SignalContext): Promise<Signal[]>;
}

/** Normaliserar en webbadress från fritext till något fetch kan använda. */
export function normalizeUrl(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "-") return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}
