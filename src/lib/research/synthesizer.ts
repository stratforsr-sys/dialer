import { getGeminiClient, GEMINI_MODEL } from "./gemini-client";
import type { BattleCard, ResearchRequest } from "@/types/research";

const SYSTEM_PROMPT = `Du är en senior B2B-sälj-strateg som skapar battle cards för säljare på Telink.ai.

Telink.ai säljer AI-driven säljdokumentation. Tre kärnvärden:
1. Auto-dokumentation — sparar 5–6h/vecka/rep på samtalsanteckningar
2. Mönsterigenkänning — AI-insikter från konversationsdata
3. Just Ask — sökbar intelligens, chefer slutar jaga reps för uppdateringar

Du får rådata skrapad från Allabolag, Merinfo, nyheter och deras hemsida.

REGLER:
- Basera ALLA påståenden på data i inmatningen
- Om data saknas för ett fält: skriv "Data saknas — fråga direkt: [relevant fråga]"
- Märk varje siffra med konfidensgrad: VERIFIED (officiell källa), INFERRED (härledd), ESTIMATED (branschsnitt)
- "math"-fältet MÅSTE visa kalkylen: [antal reps] × [timmar/vecka] × [timpris SEK] = SEK total
  Om antal anställda saknas, skriv "X anställda (bekräfta) × ..."
- "one_question" ska vara SPECIFIK för detta företag — aldrig generisk

RETURFORMAT: Returnera ENBART ett JSON-objekt som matchar BattleCard-schemat. Ingen förklarande text utanför JSON.`;

export async function synthesizeBattleCard(
  rawData: Record<string, string | null>,
  request: ResearchRequest,
  jobId: string
): Promise<BattleCard> {
  const dataBlock = Object.entries(rawData)
    .filter(([, v]) => v !== null)
    .map(([source, markdown]) => `=== ${source.toUpperCase()} ===\n${markdown}`)
    .join("\n\n");

  const userMessage = `Företag: ${request.company_name}
Org-nummer: ${request.org_number ?? "okänt"}
Kontakt: ${request.contact_name ?? "okänd"} (${request.contact_title ?? "okänd roll"})
Möte: ${request.meeting_at ?? "ej schemalagt"}

RAW DATA FRÅN SCRAPING:
${dataBlock || "Ingen data hittades. Alla fält ska markeras som 'Data saknas'."}

Returnera BattleCard JSON:
{
  "job_id": "${jobId}",
  "company_name": "${request.company_name}",
  "generated_at": "${new Date().toISOString()}",
  "meeting_at": "${request.meeting_at ?? ""}",
  "stripped": { "one_sentence": "...", "one_number": "...", "one_question": "..." },
  "hook": "...",
  "gap": "...",
  "math": "... reps × ... h/vecka × SEK .../h = SEK ... läckage/vecka",
  "killers": [{ "feature": "auto-doc", "label": "...", "reason": "...", "confidence": "ESTIMATED" }],
  "bullets": ["...", "...", "...", "...", "..."],
  "objection_prep": [{ "objection": "...", "response": "..." }],
  "data_freshness": "fresh",
  "confidence_summary": { "verified_count": 0, "inferred_count": 0, "estimated_count": 0 }
}`;

  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: SYSTEM_PROMPT,
  });

  const result = await model.generateContent(userMessage);
  const text = result.response.text();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Gemini returned no valid JSON");
  }

  return JSON.parse(jsonMatch[0]) as BattleCard;
}
