import { NextRequest } from "next/server";
import { getGeminiClient, GEMINI_MODEL } from "@/lib/research/gemini-client";
import { getPresetById } from "@/lib/research/prompts";
import { scrapeAllabolag } from "@/lib/research/scrapers/allabolag";
import { scrapeNews } from "@/lib/research/scrapers/news";
import { scrapeWebsite } from "@/lib/research/scrapers/website";

export const runtime = "nodejs";

export interface ChatMessage {
  role: "user" | "model";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  presetId: string;
  companyName?: string;
  orgNumber?: string;
  website?: string;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ChatRequest;
  const { messages, presetId, companyName, orgNumber, website } = body;

  const preset = getPresetById(presetId);

  // Build context: scrape data for first user message if company provided
  let scrapedContext = "";
  const isFirstMessage = messages.length === 1;

  if (isFirstMessage && companyName) {
    const [allabolagData, newsData, websiteData] = await Promise.allSettled([
      scrapeAllabolag(companyName, orgNumber),
      scrapeNews(companyName),
      scrapeWebsite(companyName, website),
    ]);

    const parts = [
      allabolagData.status === "fulfilled" && allabolagData.value
        ? `=== ALLABOLAG ===\n${allabolagData.value}`
        : null,
      newsData.status === "fulfilled" && newsData.value
        ? `=== NYHETER ===\n${newsData.value}`
        : null,
      websiteData.status === "fulfilled" && websiteData.value
        ? `=== HEMSIDA ===\n${websiteData.value}`
        : null,
    ].filter(Boolean);

    if (parts.length > 0) {
      scrapedContext = `\n\n[LIVE DATA FRÅN WEB SCRAPING — använd detta som grund för din analys]\n\n${parts.join("\n\n")}`;
    }
  }

  // Build history for Gemini (exclude last user message — sent as prompt)
  const history = messages.slice(0, -1).map((m) => ({
    role: m.role,
    parts: [{ text: m.content }],
  }));

  const lastUserMessage = messages[messages.length - 1];
  const userPrompt = lastUserMessage.content + scrapedContext;

  // Stream response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const genAI = getGeminiClient();
        const model = genAI.getGenerativeModel({
          model: GEMINI_MODEL,
          systemInstruction: preset.system,
        });

        const chat = model.startChat({ history });
        const result = await chat.sendMessageStream(userPrompt);

        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Okänt fel";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
