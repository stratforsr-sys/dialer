import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { classifyIndustry } from "@/lib/enrichment/industry";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Samtidiga klassificeringar. Håller Gemini-kvoten och sajthämtningen i schack. */
const CONCURRENCY = 3;

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
  const reasons: Record<string, number> = {};
  const samples: string[] = [];

  // Gratisnivån har ett DYGNSTAK, inte bara ett minuttak. Är det slaget hjälper
  // ingen backoff — då är varje ytterligare anrop bortkastad tid, och en
  // körning som maler vidare äter hela cron-fönstret för noll resultat.
  let consecutiveRateLimited = 0;
  let stoppedEarly = false;

  for (let i = 0; i < leads.length; i += CONCURRENCY) {
    if (consecutiveRateLimited >= 2 * CONCURRENCY) {
      stoppedEarly = true;
      break;
    }
    const batch = leads.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (lead) => ({ lead, out: await classifyIndustry(lead) }))
    );

    for (const { lead, out } of results) {
      if (!out.ok) {
        reasons[out.reason] = (reasons[out.reason] ?? 0) + 1;
        consecutiveRateLimited = out.reason === "rate_limited" ? consecutiveRateLimited + 1 : 0;
        if (samples.length < 8 && out.detail) {
          samples.push(`${lead.companyName}: ${out.reason} — ${out.detail}`);
        }
        continue;
      }
      consecutiveRateLimited = 0;
      await db.lead.update({
        where: { id: lead.id },
        data: {
          industry: out.value.industry,
          industrySource: out.value.source,
          industryConfidence: out.value.confidence,
        },
      });
      classified++;
      if (out.value.source === "website") fromWebsite++;
      else fromName++;
    }

    // Kvottaket mäts per minut. En kort paus mellan satserna kostar några
    // sekunder på ett nattjobb och är skillnaden mot att bli avvisad.
    if (i + CONCURRENCY < leads.length) {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  return NextResponse.json({
    considered: leads.length,
    classified,
    fromWebsite,
    fromName,
    unresolved: leads.length - classified,
    reasons,
    samples,
    stoppedEarly,
    ...(stoppedEarly
      ? { note: "Dygnskvoten mot Gemini är slut. Resten av kön ligger kvar till nästa körning." }
      : {}),
    seconds: Math.round((Date.now() - started) / 1000),
  });
}
