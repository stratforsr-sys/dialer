/**
 * Tjänsteextraktion — vad bolaget faktiskt säljer.
 *
 * Google-kategorin från Serper (`gmb.category`) svarar på vad bolaget ÄR:
 * "Rörmokare", "Advokatbyrå". Den är alltid rätt, eftersom den är bolagets
 * egen. Men den säger ingenting om vad de säljer, och det är där samtalet
 * finns: "stambyte, badrumsrenovering, jour" är något att prata om,
 * "Rörmokare" är det inte.
 *
 * Därför läser den här modulen sajten och plockar ut tjänsterna. Två regler
 * ärvda från branschklassificeringen, av samma skäl:
 *
 *   1. Bara det som står på sidan. Modellen får inte fylla i vad en rörmokare
 *      "brukar" erbjuda — en påhittad tjänst i säljarens mun är värre än ingen
 *      tjänst alls, för prospektet hör direkt att det är fel.
 *   2. Ingen sajt, ingen extraktion. Namnet duger till att gissa en bransch,
 *      aldrig till att gissa en tjänstelista.
 *
 * Kvotläget: Gemini-nyckeln ligger på gratisnivån med ett DYGNSTAK per modell.
 * Extraktionen är därför byggd men förväntas ligga vilande — se ARBETSLOGG.
 * `gmb.category` fyller fältet under tiden, och när kvoten höjs börjar den här
 * fylla på ovanpå utan att något behöver ändras.
 */

import { getGeminiClient, GEMINI_MODEL } from "@/lib/research/gemini-client";
import { fetchSiteText } from "./industry";

/** Högst så många tjänster sparas. Fler läser ingen medan telefonen ringer. */
const MAX_SERVICES = 6;

/** Under detta sparas ingenting. Tomt är ett giltigt svar. */
const MIN_CONFIDENCE = 70;

export type ServicesOutcome =
  | { ok: true; services: string[]; confidence: number }
  | { ok: false; reason: FailReason; detail?: string };

export type FailReason =
  | "no_website"
  | "no_text"
  | "api_error"
  | "rate_limited"
  | "bad_json"
  | "nothing_found"
  | "low_confidence";

const SYSTEM_PROMPT = `Du läser text från ett svenskt företags hemsida och listar
vilka TJÄNSTER eller PRODUKTER de säljer.

REGLER:
- Lista bara sådant som faktiskt nämns i texten. Hitta ALDRIG på något som ett
  företag i branschen "brukar" erbjuda.
- Högst ${MAX_SERVICES} stycken, de viktigaste först.
- Skriv varje tjänst som 1-3 ord på svenska, gemener, som en kund skulle säga
  det: "stambyte", "badrumsrenovering", "akut jour", "bokslut", "takläggning".
- Inga meningar, ingen marknadsföringstext, inga slogans.
- Är texten en cookie-ruta, en parkerad domän eller ett bygg-under-meddelande:
  svara med tom lista och konfidens 0.
- Konfidens 0-100: hur säker du är på att listan speglar vad de säljer.

Svara ENDAST med JSON:
{"services": ["...", "..."], "confidence": <0-100>}`;

/**
 * Samma backoff som branschklassificeringen. Geminis kvot mäts per minut, och
 * utan paus blir en sats till lika många avvisade anrop på några sekunder —
 * vilket ser ut som att modellen inte hittade något, fast den aldrig frågades.
 */
async function generateWithRetry(userMessage: string, attempts = 3): Promise<string> {
  const model = getGeminiClient().getGenerativeModel({
    // Egen env-variabel, men faller tillbaka på branschklassificerarens.
    // Dygnstaket sitter per modell — går de på samma modell delar de tak, och
    // då ska det gå att flytta en av dem utan deploy.
    model:
      process.env.GEMINI_SERVICES_MODEL ||
      process.env.GEMINI_INDUSTRY_MODEL ||
      GEMINI_MODEL,
    systemInstruction: SYSTEM_PROMPT,
  });

  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const result = await model.generateContent(userMessage);
      return result.response.text();
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err);
      if (!/429|quota|rate|RESOURCE_EXHAUSTED|503|overloaded/i.test(message)) throw err;
      await new Promise((r) => setTimeout(r, 2000 * 3 ** i + Math.random() * 800));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function extractServices(lead: {
  companyName: string;
  website: string | null;
}): Promise<ServicesOutcome> {
  if (!lead.website) return { ok: false, reason: "no_website" };

  const siteText = await fetchSiteText(lead.website);
  if (!siteText) return { ok: false, reason: "no_text" };

  let text: string;
  try {
    text = await generateWithRetry(
      `Bolagsnamn: ${lead.companyName}\n\nText från hemsidan:\n${siteText}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const limited = /429|quota|rate|RESOURCE_EXHAUSTED/i.test(message);
    return {
      ok: false,
      reason: limited ? "rate_limited" : "api_error",
      detail: message.slice(0, 160),
    };
  }

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { ok: false, reason: "bad_json", detail: text.slice(0, 120) };

  let parsed: { services?: unknown; confidence?: unknown };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return { ok: false, reason: "bad_json", detail: match[0].slice(0, 120) };
  }

  const services = Array.isArray(parsed.services)
    ? parsed.services
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 1 && s.length <= 40)
        .slice(0, MAX_SERVICES)
    : [];

  if (services.length === 0) return { ok: false, reason: "nothing_found" };

  let confidence = Math.round(Number(parsed.confidence));
  if (!Number.isFinite(confidence)) {
    return { ok: false, reason: "bad_json", detail: "confidence saknas" };
  }
  confidence = Math.max(0, Math.min(100, confidence));
  if (confidence < MIN_CONFIDENCE) {
    return { ok: false, reason: "low_confidence", detail: `${services.join(", ")} @ ${confidence}` };
  }

  return { ok: true, services, confidence };
}
