import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { classifyIndustry } from "@/lib/enrichment/industry";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Samtidiga klassificeringar. Håller Gemini-kvoten och sajthämtningen i schack. */
const CONCURRENCY = 5;

/**
 * Branschklassificering i sats.
 *
 * Kön är leads utan bransch. Leads MED bransch rörs aldrig — varken importens,
 * en tidigare körnings eller en handsatt. Jobbet är därmed idempotent och kan
 * köras hur ofta som helst utan att skriva om något som redan är bestämt.
 *
 *   ?limit=200        hur många leads som behandlas
 *   ?redoNames=1      kör om de som bara gissats ur bolagsnamnet — meningsfullt
 *                     när sajter tillkommit sedan sist
 *
 * Skrivningarna sker en och en efter hämtningen, av samma skäl som i
 * orchestrator: Turso har ett skrivlås över nätverket, och parallella
 * transaktioner slåss om det tills de får timeout.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY saknas" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const parsedLimit = Number(searchParams.get("limit") ?? 200);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 500) : 200;
  const redoNames = searchParams.get("redoNames") === "1";

  const started = Date.now();

  const leads = await db.lead.findMany({
    where: {
      retired: false,
      ...(redoNames
        ? { OR: [{ industry: null }, { industrySource: "name", website: { not: null } }] }
        : { industry: null }),
    },
    select: { id: true, companyName: true, website: true },
    // Leads med sajt först: de ger ett säkert svar, och hinner satsen ta slut
    // är det bättre att namngissningarna blir kvar i kön än tvärtom.
    orderBy: [{ website: "desc" }, { updatedAt: "asc" }],
    take: limit,
  });

  let classified = 0;
  let fromWebsite = 0;
  let fromName = 0;
  let unresolved = 0;

  for (let i = 0; i < leads.length; i += CONCURRENCY) {
    const batch = leads.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (lead) => ({ lead, res: await classifyIndustry(lead) }))
    );

    for (const { lead, res } of results) {
      if (!res) {
        unresolved++;
        continue;
      }
      await db.lead.update({
        where: { id: lead.id },
        data: {
          industry: res.industry,
          industrySource: res.source,
          industryConfidence: res.confidence,
        },
      });
      classified++;
      if (res.source === "website") fromWebsite++;
      else fromName++;
    }
  }

  return NextResponse.json({
    considered: leads.length,
    classified,
    fromWebsite,
    fromName,
    unresolved,
    seconds: Math.round((Date.now() - started) / 1000),
  });
}
