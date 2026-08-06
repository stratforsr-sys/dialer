/**
 * Branschklassificering.
 *
 * Modellen får ALDRIG slå upp ett org-nummer. Den har inget företagsregister,
 * och svenska organisationsnummer kodar juridisk form i första siffran — aldrig
 * verksamhet. En fråga om "vilken bransch har 556677-8899" besvaras därför med
 * en självsäker gissning, och en påhittad bransch är det värsta utfallet i hela
 * kedjan: säljaren öppnar samtalet med den.
 *
 * Här läser modellen i stället text som faktiskt finns — bolagets hemsida, och
 * i sista hand bolagsnamnet. Det är klassificering av bevis, inte framkallning
 * ur ingenting.
 *
 * Två skyddsräcken:
 *
 *   1. Fast lista. Modellen får bara välja bland etiketterna nedan, aldrig
 *      formulera egna. Utan det blir 2 500 leads till 2 000 olika stavningar
 *      och kolumnen går inte att gruppera på.
 *   2. Konfidenströskel. Under den sparas ingenting. Tomt är ett giltigt svar.
 */

import { getGeminiClient, GEMINI_MODEL } from "@/lib/research/gemini-client";

/** Fast taxonomi. Säljvinklar, inte SNI:s statistikindelning. */
export const INDUSTRIES = [
  "Bygg & anläggning",
  "Bygghandel & material",
  "Fastighet & förvaltning",
  "Städ & fastighetsservice",
  "IT & mjukvara",
  "Telekom & nätverk",
  "Industri & tillverkning",
  "Fordon & verkstad",
  "Transport & logistik",
  "Handel & e-handel",
  "Partihandel & grossist",
  "Restaurang & café",
  "Hotell & besöksnäring",
  "Hälsa & sjukvård",
  "Tandvård",
  "Veterinär & djur",
  "Skönhet & friskvård",
  "Utbildning",
  "Juridik",
  "Ekonomi & redovisning",
  "Bank, finans & försäkring",
  "Konsult & rådgivning",
  "Reklam & marknadsföring",
  "Rekrytering & bemanning",
  "Säkerhet & bevakning",
  "Energi & miljö",
  "Jordbruk & skog",
  "Media & underhållning",
  "Föreningar & organisationer",
  "Offentlig sektor",
] as const;

export type Industry = (typeof INDUSTRIES)[number];

/** Under detta sparas ingenting. Hellre tom bransch än fel. */
export const MIN_CONFIDENCE = 65;

/**
 * Namngissningar är systematiskt osäkrare än sajtläsningar — "Nordic Solutions
 * AB" säger ingenting alls. Taket hindrar dem från att se lika trovärdiga ut
 * som en klassificering som faktiskt läst vad bolaget skriver om sig själv.
 */
const NAME_ONLY_CEILING = 80;

export interface Classification {
  industry: Industry;
  confidence: number;
  source: "website" | "name";
}

const UA = "Mozilla/5.0 (compatible; SalesHubBot/1.0)";
const MAX_BYTES = 250_000;
const TIMEOUT_MS = 10_000;

/** Plockar ut läsbar text ur HTML. Grovt med flit — modellen behöver inte mer. */
function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3000);
}

async function fetchSiteText(website: string): Promise<string | null> {
  const url = website.startsWith("http") ? website : `https://${website}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    });
    if (!res.ok || !res.body) return null;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > MAX_BYTES) break;
      html += decoder.decode(value, { stream: true });
    }
    void reader.cancel();

    const text = extractText(html);
    // Under ~80 tecken är sidan en cookie-vägg, en parkerad domän eller ett
    // JS-skal. Att klassificera på det ger brus som ser ut som data.
    return text.length >= 80 ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const SYSTEM_PROMPT = `Du klassificerar svenska företag i EN bransch.

Du får ett bolagsnamn och ibland text från bolagets hemsida.

REGLER:
- Välj EXAKT en etikett ur listan. Hitta aldrig på en egen.
- Svara med konfidens 0-100: hur säker du är på att etiketten stämmer.
- Bygger svaret bara på bolagsnamnet och namnet är intetsägande
  ("Nordic Solutions AB", "JL Förvaltning AB", initialer, efternamn) — sätt
  konfidens under 50. Gissa inte för att fylla i något.
- Är hemsidetexten en parkerad domän, en cookie-ruta eller ett bygg-under-
  meddelande: behandla den som om den inte fanns.
- Beskriver bolaget flera verksamheter, välj den som störst del av texten
  handlar om.

Svara ENDAST med JSON:
{"industry": "<etikett ur listan>", "confidence": <0-100>}

Tillåtna etiketter:
${INDUSTRIES.join("\n")}`;

/**
 * Klassificerar ett bolag. Returnerar null när underlaget inte räcker — det är
 * ett giltigt och önskat utfall, inte ett fel.
 */
export async function classifyIndustry(lead: {
  companyName: string;
  website: string | null;
}): Promise<Classification | null> {
  const siteText = lead.website ? await fetchSiteText(lead.website) : null;
  const source: "website" | "name" = siteText ? "website" : "name";

  const userMessage = siteText
    ? `Bolagsnamn: ${lead.companyName}\n\nText från hemsidan:\n${siteText}`
    : `Bolagsnamn: ${lead.companyName}\n\n(Ingen hemsidetext tillgänglig — bedöm enbart på namnet.)`;

  let parsed: { industry?: string; confidence?: number };
  try {
    const model = getGeminiClient().getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: SYSTEM_PROMPT,
    });
    const result = await model.generateContent(userMessage);
    const match = result.response.text().match(/\{[\s\S]*\}/);
    if (!match) return null;
    parsed = JSON.parse(match[0]);
  } catch {
    // Kvotfel, timeout, trasig JSON — leadet lämnas oklassificerat och plockas
    // upp av nästa körning. Ett anrikningssteg får aldrig stoppa ringandet.
    return null;
  }

  const industry = INDUSTRIES.find((i) => i === parsed.industry);
  // Etiketter utanför listan kastas. Modellen instrueras att hålla sig till
  // den, men instruktioner är inte garantier — listan är garantin.
  if (!industry) return null;

  let confidence = Math.round(Number(parsed.confidence));
  if (!Number.isFinite(confidence)) return null;
  confidence = Math.max(0, Math.min(100, confidence));
  if (source === "name") confidence = Math.min(confidence, NAME_ONLY_CEILING);

  if (confidence < MIN_CONFIDENCE) return null;

  return { industry, confidence, source };
}
