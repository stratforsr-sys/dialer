/**
 * Vad som hände med ett bolag, sett utifrån — ren logik, inget UI.
 *
 * ## Varför filen finns
 *
 * Utfallet av ett samtal bor på tre ställen som inte säger samma sak:
 *
 *   `CallAttempt`      varje enskilt samtal, oföränderligt, med `listId` som
 *                      säger vilken MAPP säljaren ringde ifrån
 *   `Lead.lastResult`  senaste samtalets resultat, speglat på bolaget
 *   `Activity`         en människoläsbar rad — men bara när någon skrev en
 *                      anteckning
 *
 * Mappvyn läste fram till 2026-09-15 den TREDJE. Den skrivs bara när säljaren
 * skrivit något (se `recordAttempt` — en rad per samtal hade lagt 150 rader
 * per säljare och dag i en logg vars enda syfte är att gå att läsa), och
 * resultatet blev att kolumnen "Senaste samtal" var tom för nästan allt:
 *
 *     6 445  leads hade ringts
 *       121  av dem hade en CALL-aktivitet      ← kolumnen visade 1,9 %
 *     7 894  samtal fanns i CallAttempt
 *
 * Utfallet visades inte alls, trots att `lastResult`, `lastOutcome` och
 * `lastNoReason` speglas på leadet vid VARJE disposition och redan låg i
 * payloaden vyn fick. Den här filen är vägen från de fälten till något en
 * människa kan läsa i en tabellrad.
 *
 * ## Utfallet hör till BOLAGET, inte till mappen det ringdes ifrån
 *
 * Det är hela poängen. `CallAttempt.listId` är provenance — "härifrån ringde
 * säljaren" — och den skrivs aldrig om; historiken är oföränderlig i det här
 * systemet. Men ett bolag ligger i flera mappar samtidigt (`LeadOnList`), och
 * en import som hittar bolaget på org-numret länkar bara in det i en mapp till.
 * Samtalen följer då med bolaget, inte mappen de en gång ringdes ifrån.
 *
 * Mätt i produktionen 2026-09-15, innan fixen:
 *
 *     mapp                          leads   ringda   utfall bokförda på ANNAN mapp
 *     hantverkare_5000_alla         3 749    2 389   604
 *     test_stad_fastighetsservice     502      350   348      ← 69 % av mappen
 *     Endast Städföretag (kanske)   1 151      994   201
 *
 *     300 samtal pekade på en mapp där leadet inte längre låg
 *   1 556 samtal låg på bolag som finns i flera mappar samtidigt
 *
 * Därför läser mappens vyer och statistik `Lead`-kolumnerna eller joinar via
 * `LeadOnList` — aldrig `CallAttempt.listId`. Den senare svarar på en annan
 * fråga ("vad gjorde säljaren i det här passet") och är fortfarande rätt för
 * säljar- och sessionsstatistik.
 */

import type { CallResult, ConversationOutcome, NoReason } from "@/generated/prisma/client";
import { RESULT_LABELS, OUTCOME_OPTIONS, GATEKEEPER_OPTIONS, REASON_OPTIONS } from "./cockpit-flow";

/**
 * Hinkarna. Grövre än `ConversationOutcome` med flit: en fördelning som säljaren
 * och chefen ska kunna läsa av på en tiondels sekund tål inte tolv staplar, och
 * de tre växelutfallen svarar på samma fråga i mappens perspektiv ("kom aldrig
 * fram till rätt person").
 *
 * Ordningen är den de renderas i, och den är vald: det som är värt något först
 * (sålt, lovat), det som är avgjort sedan, det obearbetade sist. Sorteras de på
 * antal i stället hoppar staplarna mellan två mappar och går inte att jämföra.
 */
export type UtfallKey =
  | "sald"
  | "aterkomst"
  | "nej"
  | "fel_beslutsfattare"
  | "vaxel"
  | "natt_dm"
  | "svarar_ej"
  | "fel_nummer"
  | "bortfall"
  | "oringd";

export interface UtfallDef {
  key: UtfallKey;
  label: string;
  /** Färgen är hämtad ur dispositionsknapparna där en sådan finns, så att ett
   *  utfall har SAMMA färg i cockpiten och i mappen. Säljaren lär sig en karta,
   *  inte två. */
  color: string;
  /** Räknas som "ringt"? `oringd` är den enda som inte gör det, och den
   *  skillnaden är vad framstegsmätaren bygger på. */
  called: boolean;
}

export const UTFALL: Record<UtfallKey, UtfallDef> = {
  sald: { key: "sald", label: "Såld", color: "#22C55E", called: true },
  aterkomst: { key: "aterkomst", label: "Återkomst bokad", color: "#3B82F6", called: true },
  nej: { key: "nej", label: "Sa nej", color: "#EF4444", called: true },
  fel_beslutsfattare: { key: "fel_beslutsfattare", label: "Fel beslutsfattare", color: "#F59E0B", called: true },
  vaxel: { key: "vaxel", label: "Kom till växeln", color: "#3B82F6", called: true },
  natt_dm: { key: "natt_dm", label: "Nådde beslutsfattaren", color: "#10B981", called: true },
  svarar_ej: { key: "svarar_ej", label: "Svarar ej", color: "#6B7280", called: true },
  fel_nummer: { key: "fel_nummer", label: "Fel nummer", color: "#EF4444", called: true },
  bortfall: { key: "bortfall", label: "Bortfall", color: "#B91C1C", called: true },
  oringd: { key: "oringd", label: "Aldrig ringt", color: "#94A3B8", called: false },
};

/** Renderingsordning. Se kommentaren på `UtfallKey`. */
export const UTFALL_ORDNING: UtfallKey[] = [
  "sald",
  "aterkomst",
  "natt_dm",
  "nej",
  "fel_beslutsfattare",
  "vaxel",
  "svarar_ej",
  "fel_nummer",
  "bortfall",
  "oringd",
];

/** Det minsta ett bolag behöver bära för att dess utfall ska gå att avgöra.
 *  Alla fyra är kolumner på `Lead` och speglas vid varje disposition — ingen
 *  join, ingen subfråga, och de följer redan med `include` i `getList`. */
export interface UtfallLead {
  lastAttemptAt: Date | string | null;
  lastResult: CallResult | null;
  lastOutcome: ConversationOutcome | null;
  lastNoReason?: NoReason | null;
}

/**
 * Bolagets senaste utfall som en hink.
 *
 * `lastOutcome` går FÖRE `lastResult` där båda finns: resultatet säger bara
 * att någon svarade, utfallet säger vad de sa. Ett `CONNECTED_DM` som slutade
 * i ett nej ska läsas som "sa nej", inte som "nådde beslutsfattaren".
 *
 * `lastAttemptAt` och inte `attemptCount` avgör om bolaget ringts: taket i
 * `computeNext` nollställer räknaren när ett varv är slut och glömmer då arbete
 * som gjorts (133 leads skilde i `Clicknet Lista 1` den 15 september 2026).
 * `lastAttemptAt` nollställs aldrig.
 */
export function utfallAv(lead: UtfallLead): UtfallDef {
  if (!lead.lastAttemptAt) return UTFALL.oringd;

  switch (lead.lastOutcome) {
    case "SOLD":
      return UTFALL.sald;
    case "CALLBACK_BOOKED":
      return UTFALL.aterkomst;
    case "DM_NO":
      return UTFALL.nej;
    case "WRONG_DM":
      return UTFALL.fel_beslutsfattare;
    case "GATEKEEPER_BLOCKED":
    case "GATEKEEPER_TRANSFERRED":
    case "GATEKEEPER_GAVE_DM_DETAILS":
      return UTFALL.vaxel;
  }

  switch (lead.lastResult) {
    case "CONNECTED_DM":
      // Någon svarade men dispositionen stannade där. Sällsynt (2 rader av
      // 6 445 i produktionen) — men "svarar ej" vore direkt fel om det stod här.
      return UTFALL.natt_dm;
    case "CONNECTED_GATEKEEPER":
      return UTFALL.vaxel;
    case "WRONG_NUMBER":
    case "INVALID_NUMBER":
      return UTFALL.fel_nummer;
    case "BORTFALL":
      return UTFALL.bortfall;
    case "NO_ANSWER":
    case "BUSY":
    case "VOICEMAIL_LEFT":
    case "VOICEMAIL_NO_MESSAGE":
      return UTFALL.svarar_ej;
  }

  // Ringt, men utan resultat i kolumnerna. Går inte att uppstå via
  // `recordAttempt`; kan finnas i rader äldre än speglingen.
  return UTFALL.svarar_ej;
}

/**
 * Den långa etiketten — resultat, utfall och anledning i en mening.
 *
 * Används i radens tooltip och på lead-sidan, där det finns plats. Tabellen
 * visar bara hinken: "Sa nej · Pris" är två informationer i en kolumn som ska
 * gå att svepa med blicken.
 */
export function utfallText(lead: UtfallLead): string | null {
  if (!lead.lastAttemptAt || !lead.lastResult) return null;

  const delar = [RESULT_LABELS[lead.lastResult] ?? lead.lastResult];

  if (lead.lastOutcome) {
    const alla = [...OUTCOME_OPTIONS, ...GATEKEEPER_OPTIONS];
    const o = alla.find((x) => x.value === lead.lastOutcome);
    if (o) delar.push(o.label);
  }
  if (lead.lastNoReason) {
    const r = REASON_OPTIONS.find((x) => x.value === lead.lastNoReason);
    if (r) delar.push(r.label);
  }

  return delar.join(" · ");
}

export interface UtfallRad {
  def: UtfallDef;
  n: number;
  /** Andel av HELA mappen, inte av de ringda. En mapp där 40 % är orört ska
   *  säga det — annars läser tio procent sålda som tio procent av allt. */
  andel: number;
}

/**
 * Fördelningen över en mängd bolag.
 *
 * Returnerar bara hinkar som faktiskt förekommer: en rad som alltid syns med
 * en nolla i slutar läsas, och mappvyns huvud har ont om plats.
 */
export function utfallsfordelning(leads: UtfallLead[]): {
  rader: UtfallRad[];
  ringda: number;
  total: number;
} {
  const antal = new Map<UtfallKey, number>();
  let ringda = 0;

  for (const lead of leads) {
    const def = utfallAv(lead);
    antal.set(def.key, (antal.get(def.key) ?? 0) + 1);
    if (def.called) ringda++;
  }

  const total = leads.length;
  const rader: UtfallRad[] = [];
  for (const key of UTFALL_ORDNING) {
    const n = antal.get(key) ?? 0;
    if (n === 0) continue;
    rader.push({ def: UTFALL[key], n, andel: total > 0 ? n / total : 0 });
  }

  return { rader, ringda, total };
}
