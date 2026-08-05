import { NextResponse } from "next/server";
import { enrichBatch } from "@/lib/enrichment/orchestrator";

export const runtime = "nodejs";
// Anrikningen är I/O-bunden mot främmande servrar. PageSpeed tar 10–30 s per
// sajt, så nivå 1 körs i små satser — hellre flera körningar än en som slår i
// taket och tappar allt.
export const maxDuration = 300;

/**
 * Nattlig anrikning.
 *
 * Kallas av Vercel Cron med CRON_SECRET som bearer. Routen är undantagen från
 * middleware (den har ingen sessionskaka) och gör därför sin egen kontroll —
 * exakt det som gjorde att mötespåminnelsen aldrig fungerade tidigare.
 *
 *   ?tier=0  gratis HTTP-kontroller, alla leads
 *   ?tier=1  som ovan plus PageSpeed, bara leads som snart ska ringas
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tier = searchParams.get("tier") === "1" ? 1 : 0;
  const limit = Number(searchParams.get("limit") ?? (tier === 1 ? 40 : 150));

  const started = Date.now();
  const results = await enrichBatch({ tier, limit: Number.isFinite(limit) ? limit : 50 });

  return NextResponse.json({
    tier,
    processed: results.length,
    claims: results.reduce((n, r) => n + r.claims, 0),
    weaknesses: results.reduce((n, r) => n + r.weaknesses, 0),
    failedProviders: results.flatMap((r) => r.failed),
    seconds: Math.round((Date.now() - started) / 1000),
  });
}
