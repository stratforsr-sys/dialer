import { NextResponse } from "next/server";
import { lookupLeads, lookupDryRun } from "@/lib/enrichment/serper-lead";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Uppslag per bolag hos Google.
 *
 * Det här är vägen till rank på HELA beståndet, och den enda som inte
 * förutsätter att leadet redan har en bransch. En kredit per bolag ger
 * Googles egen kategori, betyg, recensionsantal, telefonnummer, hemsida och
 * adress — och kategorin blir sedan sökordet som `/api/cron/seo` mäter rank på.
 *
 * Kostnaden skalar LINJÄRT med beståndet, till skillnad från segmentspåret.
 * Torrkör alltid först:
 *
 *   ?dry=1            räkna kön och kostnaden, hämta ingenting
 *   ?limit=N          högst N bolag
 *   ?listId=…         bara en viss ringlista — det billigaste sättet att börja
 *   ?redo=1           slå upp även dem som redan har en färsk kategori
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://dialer-five.vercel.app/api/cron/seo-leads?dry=1"
 *
 * Ordningen som ger mest för pengarna:
 *   1. /api/cron/keywords     gratis, löser ~47 % ur bolagsnamnen
 *   2. /api/cron/seo-leads    betalt, en kredit per återstående bolag
 *   3. /api/cron/seo          rankmätningen, delad per kategori och ort
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
  const redo = searchParams.get("redo") === "1";

  if (searchParams.get("dry") === "1") {
    const plan = await lookupDryRun({ listId, limit, redo });
    return NextResponse.json({
      dry: true,
      keyConfigured: Boolean(process.env.SERPER_KEY),
      ...plan,
      note:
        "En kredit per bolag. Kör /api/cron/keywords först — den är gratis och " +
        "minskar inte kön, men ger yrkestermer åt dem Google inte känner till.",
    });
  }

  if (!process.env.SERPER_KEY) {
    return NextResponse.json(
      { error: "SERPER_KEY saknas — sätt den i Vercel och deploya om." },
      { status: 412 }
    );
  }

  const started = Date.now();
  const result = await lookupLeads({ listId, limit, redo });

  return NextResponse.json({
    ...result,
    seconds: Math.round((Date.now() - started) / 1000),
  });
}
