import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractServices } from "@/lib/enrichment/services";
import { writeClaims } from "@/lib/enrichment/serper";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Samtidiga extraktioner. Håller Gemini-kvoten och sajthämtningen i schack. */
const CONCURRENCY = 3;

/**
 * Tjänsteextraktion i sats.
 *
 * Kön är leads med hemsida som ännu inte har någon tjänstelista. Leads som
 * redan har en rörs aldrig — jobbet är idempotent och kan köras hur ofta som
 * helst utan att skriva om något.
 *
 *   ?limit=100        hur många leads som behandlas
 *   ?redo=1           kör om även de som redan har en lista
 *
 * Ligger utanför cron-schemat i vercel.json med flit: på gratisnivån är
 * dygnstaket 20 anrop, och ett nattjobb som varje natt bränner dem på
 * godtyckliga leads är sämre än att du kör den när du vet vilka som ska ringas.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://dialer-five.vercel.app/api/cron/services?limit=20"
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
  const parsedLimit = Number(searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 300) : 50;
  const redo = searchParams.get("redo") === "1";

  const started = Date.now();

  const leads = await db.lead.findMany({
    where: {
      retired: false,
      website: { not: null },
      ...(redo
        ? {}
        : { dossier: { is: { claims: { none: { key: "seo.services" } } } } }),
    },
    select: { id: true, companyName: true, website: true },
    // Leads som snart ska ringas först. Att extrahera tjänster för ett lead
    // ingen kommer att ringa är slöseri även när det vore gratis — och på 20
    // anrop per dygn är det inte gratis, det är hela dagens kvot.
    orderBy: [{ nextActionAt: "asc" }, { attemptCount: "asc" }],
    take: limit,
  });

  let extracted = 0;
  const reasons: Record<string, number> = {};
  const samples: string[] = [];

  // Dygnstaket går inte att backa sig ur. Är det slaget är varje ytterligare
  // anrop bortkastad tid och äter hela fönstret för noll resultat.
  let consecutiveRateLimited = 0;
  let stoppedEarly = false;

  for (let i = 0; i < leads.length; i += CONCURRENCY) {
    if (consecutiveRateLimited >= 2 * CONCURRENCY) {
      stoppedEarly = true;
      break;
    }
    const batch = leads.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (lead) => ({ lead, out: await extractServices(lead) }))
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
      await writeClaims(lead.id, [
        {
          key: "seo.services",
          valueStr: out.services.join(", "),
          confidence: out.confidence,
          strength: 3,
          source: "gemini",
          sourceUrl: lead.website,
        },
      ]);
      extracted++;
    }

    if (i + CONCURRENCY < leads.length) {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  return NextResponse.json({
    considered: leads.length,
    extracted,
    unresolved: leads.length - extracted,
    reasons,
    samples,
    stoppedEarly,
    ...(stoppedEarly
      ? { note: "Dygnskvoten mot Gemini är slut. Resten av kön ligger kvar till nästa körning." }
      : {}),
    seconds: Math.round((Date.now() - started) / 1000),
  });
}
