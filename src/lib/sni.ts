/**
 * SNI-koder → läsbar bransch.
 *
 * Företagsregisterexporter levererar bransch som SNI-kod ("62.010"), ibland
 * med en officiell klartext bredvid ("Datakonsultverksamhet"). Ingen av dem
 * duger rakt av på en cockpit-skärm: koden säger ingenting, och den officiella
 * texten är skriven för statistik, inte för någon som har fyra sekunder på sig
 * att förstå vem hen ringer.
 *
 * Därför mappas huvudgruppen — de två första siffrorna, SNI 2007:s
 * avdelningsnivå — till en kort säljbar etikett. Två siffror och inte fem är
 * ett medvetet val: femsiffrig precision ger hundratals etiketter som ingen
 * hinner läsa, och skillnaden mellan 62.010 och 62.020 spelar ingen roll för
 * den som ska öppna ett samtal.
 */

const DIVISIONS: Record<string, string> = {
  "01": "Jordbruk", "02": "Skogsbruk", "03": "Fiske och vattenbruk",
  "05": "Kolutvinning", "06": "Olja och naturgas", "07": "Metallmalmer",
  "08": "Mineralutvinning", "09": "Service till utvinning",
  "10": "Livsmedel", "11": "Dryckestillverkning", "12": "Tobak",
  "13": "Textil", "14": "Kläder", "15": "Läder och skor",
  "16": "Trävaror", "17": "Papper och massa", "18": "Grafisk produktion",
  "19": "Petroleumraffinering", "20": "Kemikalier", "21": "Läkemedel",
  "22": "Gummi och plast", "23": "Byggmaterial", "24": "Stål och metall",
  "25": "Metallvaror", "26": "Datorer och elektronik", "27": "Elapparatur",
  "28": "Maskintillverkning", "29": "Motorfordon", "30": "Transportmedel",
  "31": "Möbler", "32": "Annan tillverkning", "33": "Maskinreparation",
  "35": "El, gas och värme", "36": "Vattenförsörjning", "37": "Avloppsrening",
  "38": "Avfall och återvinning", "39": "Sanering",
  "41": "Husbyggnad", "42": "Anläggning", "43": "Bygghantverk",
  "45": "Bilhandel och verkstad", "46": "Partihandel", "47": "Detaljhandel",
  "49": "Landtransport", "50": "Sjöfart", "51": "Flyg",
  "52": "Lager och logistik", "53": "Post och bud",
  "55": "Hotell", "56": "Restaurang och catering",
  "58": "Förlag", "59": "Film och tv-produktion", "60": "Radio och tv",
  "61": "Telekom", "62": "IT och datakonsult", "63": "Informationstjänster",
  "64": "Bank och finans", "65": "Försäkring", "66": "Finansiella stödtjänster",
  "68": "Fastighet", "69": "Juridik och redovisning",
  "70": "Företagsrådgivning", "71": "Arkitekt och teknikkonsult",
  "72": "Forskning och utveckling", "73": "Reklam och marknadsföring",
  "74": "Övrig konsultverksamhet", "75": "Veterinär",
  "77": "Uthyrning och leasing", "78": "Bemanning och rekrytering",
  "79": "Resebyrå", "80": "Säkerhet och bevakning",
  "81": "Fastighetsservice och städ", "82": "Kontors- och företagstjänster",
  "84": "Offentlig förvaltning", "85": "Utbildning",
  "86": "Hälso- och sjukvård", "87": "Vård och omsorg med boende",
  "88": "Sociala insatser",
  "90": "Kultur och underhållning", "91": "Bibliotek och museer",
  "92": "Spel och vadhållning", "93": "Sport och fritid",
  "94": "Intresseorganisationer", "95": "Reparation av hushållsvaror",
  "96": "Andra konsumenttjänster", "97": "Hushåll som arbetsgivare",
  "98": "Hushållens egenproduktion", "99": "Internationella organisationer",
};

/**
 * Etiketten för en SNI-kod, eller null när koden inte går att tolka.
 *
 * Tar "62010", "62.010", "62.01", "62" — allt som börjar med två siffror.
 * Returnerar hellre null än en gissning: en felaktig bransch på skärmen är
 * värre än ingen, eftersom säljaren agerar på den.
 */
export function sniLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  const digits = String(code).replace(/\D/g, "");
  if (digits.length < 2) return null;
  return DIVISIONS[digits.slice(0, 2)] ?? null;
}

/**
 * Branschen att visa, given vad importfilen råkade innehålla.
 *
 * En fritextkolumn vinner över koden när den finns — den är vad filen faktiskt
 * påstår om bolaget, och är ofta mer specifik än huvudgruppen. Saknas den
 * härleds etiketten ur koden.
 */
export function resolveIndustry(
  rawIndustry: string | null | undefined,
  rawCode: string | null | undefined
): string | null {
  const text = rawIndustry?.trim();
  if (text) return text;
  return sniLabel(rawCode);
}
