/**
 * Hur importen vet att två rader är samma bolag — ren logik, inget I/O.
 *
 * Ligger i lib och inte i `/api/import-stream` av två skäl. Next typkontrollerar
 * exporterna ur en `route.ts` och släpper bara handlarna igenom, så funktionerna
 * hade inte gått att prova därifrån. Och de MÅSTE gå att prova: en felmatchning
 * slår ihop två bolags historik och går inte att ångra.
 */

// ── Identiteten: hur importen vet att två rader är samma bolag ──────────────
//
// Fram till 2026-09-15 fanns bara en nyckel: `Lead.orgNumber`, jämförd som
// RÅTEXT. Två saker föll igenom, och båda gjorde att utfallen tappades — det
// gamla leadet blev kvar med samtalen, det nya kom in i mappen tomt.
//
//   1. Samma bolag, olika skrivsätt. `5595230201` och `559523-0201` är samma
//      org-nummer men olika strängar. 83 dubblettgrupper i produktionen, 46 av
//      dem med ett ringt och ett oringt lead — alltså 46 bolag vars historik
//      låg på en rad ingen tittade på. 345 leads bär dessutom tolvsiffriga
//      nummer med sekelprefix (`192901040689`), samma bolag som `2901040689`.
//
//   2. Bolag helt utan org-nummer. 8 729 av 21 131 leads — 41 % — saknar det.
//      De kunde ALDRIG matchas: varje omimport av samma fil skapade ett nytt
//      lead. 94 tomma kopior av bolag som redan ringts fanns i datan.
//
// Nycklarna är därför två, i fallande tillförlitlighet, och den första som ger
// träff vinner.

/**
 * Org-numret som jämförbar nyckel: bara siffror, utan sekelprefix.
 *
 * Kortare än tio siffror ger `null` och inte en nyckel. Det är inte
 * pedanteri — fyra ringlistor importerades med fel kolumnmappning, och
 * `orgNumber` fick värden som `9` och `10`. En tvåsiffrig nyckel hade slagit
 * ihop alla bolag som råkat få samma skräpvärde till ett enda lead.
 */
export function orgNyckel(v: string | null | undefined): string | null {
  if (!v) return null;
  let siffror = v.replace(/\D/g, "");
  // Tolv siffror = sekelprefix + tio. `192901040689` är samma fysiska person
  // som `2901040689`; prefixet säger bara vilket århundrade.
  if (siffror.length === 12) siffror = siffror.slice(2);
  return siffror.length === 10 ? siffror : null;
}

/**
 * Reservnyckeln: bolagsnamn + ort.
 *
 * Vald framför telefonnummer efter mätning. Farhågan var att "AB Bygg" i
 * Göteborg kan vara två bolag — i den här datan är den ogrundad: av 12 402
 * leads med org-nummer fanns bara 15 namn+ort-par som pekade på mer än ett
 * org-nummer, och **alla femton var samma bolag skrivet på två sätt** (fall 1
 * ovan). Bara 9 leads av 21 131 saknar ort.
 *
 * Skyddet mot resten ligger i `flertydiga` nedan: matchar nyckeln mer än ett
 * befintligt lead görs ingen sammanslagning alls. En felmatchning slår ihop två
 * bolags historik och går inte att ångra; en utebliven matchning ger en
 * dubblett som går att städa. Asymmetrin avgör.
 *
 * Bolagsformen tas bort före jämförelsen — leadverktygen skriver "Firma AB",
 * "Firma A.B." och "Firma Aktiebolag" om vartannat.
 */
export function namnOrtNyckel(
  companyName: string | null | undefined,
  city: string | null | undefined
): string | null {
  if (!companyName || !city) return null;
  const namn = companyName
    .toLowerCase()
    .replace(/[.,]/g, " ")
    // Ingen `u`-flagga: tsconfig siktar på ES5 och tar inte unicode-läget.
    // Den behövs inte heller — alternativen är rena ASCII-ord.
    .replace(/\b(aktiebolag|a\s?b|handelsbolag|hb|kommanditbolag|kb)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  const ort = city.toLowerCase().replace(/\s+/g, " ").trim();
  if (!namn || !ort) return null;
  return `${namn}|${ort}`;
}

