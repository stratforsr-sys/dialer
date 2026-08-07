import { NextResponse } from "next/server";
import { dryRun, runSerper, serperEnabled } from "@/lib/enrichment/serper";

export const runtime = "nodejs";
// Ett segment är två anrop mot Serper plus en skrivning per lead i segmentet.
// De stora segmenten bär hundratals leads, så en körning tar minuter.
export const maxDuration = 300;

/**
 * Rank, Google-profil och kategori.
 *
 * Ligger avsiktligt INTE i det nattliga cron-schemat. Krediterna är ändliga —
 * gratisnivån ger 2 500 totalt, inte per månad — och en anrikning som tömmer
 * kontot medan ingen tittar är värre än ingen anrikning alls. Routen anropas
 * därför för hand, och `?dry=1` visar exakt vad körningen kommer att kosta
 * innan ett enda anrop görs.
 *
 *   ?dry=1              räkna, hämta ingenting
 *   ?limit=N            högst N segment (sökord), inte N leads
 *   ?listId=…           bara leads i en viss ringlista
 *   ?all=1              ta med segment som redan har färsk mätning
 *
 * Kör:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://dialer-five.vercel.app/api/cron/seo?dry=1"
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const listId = searchParams.get("listId");
  const rawLimit = Number(searchParams.get("limit"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : null;
  // Standard är att bara röra segment utan färsk mätning. ?all=1 tvingar om
  // allt och kostar därefter — den ska man välja, inte råka ut för.
  const onlyStale = searchParams.get("all") !== "1";

  if (searchParams.get("dry") === "1") {
    const plan = await dryRun({ listId, limit, onlyStale });
    return NextResponse.json({
      dry: true,
      keyConfigured: serperEnabled(),
      ...plan,
      note:
        "estimatedCredits är en försiktig uppskattning. Faktisk förbrukning " +
        "läses ur Serpers svar och rapporteras som creditsReported vid skarp körning.",
    });
  }

  if (!serperEnabled()) {
    return NextResponse.json(
      { error: "SERPER_KEY saknas — sätt den i Vercel och deploya om." },
      { status: 412 }
    );
  }

  const started = Date.now();
  const result = await runSerper({ listId, limit, onlyStale });

  return NextResponse.json({
    ...result,
    seconds: Math.round((Date.now() - started) / 1000),
  });
}
