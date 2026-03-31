import Anthropic from "@anthropic-ai/sdk";
import type { BattleCard, ResearchRequest } from "@/types/research";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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
  Bra: "Ni gick från 8 till 23 säljare i år — hur har er dokumentationsprocess skalat?"
  Dålig: "Hur hanterar ni dokumentation idag?"

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
  "stripped": {
    "one_sentence": "...",
    "one_number": "... (VERIFIED/INFERRED/ESTIMATED)",
    "one_question": "..."
  },
  "hook": "...",
  "gap": "...",
  "math": "... reps × ... h/vecka × SEK .../h = SEK ... läckage/vecka",
  "killers": [
    { "feature": "auto-doc|pattern-recognition|just-ask", "label": "...", "reason": "...", "confidence": "VERIFIED|INFERRED|ESTIMATED" }
  ],
  "bullets": ["...", "...", "...", "...", "..."],
  "objection_prep": [
    { "objection": "...", "response": "..." }
  ],
  "data_freshness": "fresh",
  "confidence_summary": { "verified_count": 0, "inferred_count": 0, "estimated_count": 0 }
}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  // Extract JSON from response (strip any markdown fences if present)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Sonnet returned no valid JSON");
  }

  return JSON.parse(jsonMatch[0]) as BattleCard;
}
