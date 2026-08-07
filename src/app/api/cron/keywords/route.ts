import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tradeFromText, cityFromAddress } from "@/lib/enrichment/trade";
import { writeClaims } from "@/lib/enrichment/serper";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Sökordsunderlag — helt gratis.
 *
 * Gör två saker, inget av dem rör ett externt API:
 *
 *   1. Fyller `Lead.city` ur adressen. Registerexporter skriver
 *      "Gata 1, 112 57 Stockholm" och orten står där, den har bara aldrig
 *      plockats ut. 606 leads i beståndet saknar ort trots att den finns i
 *      fältet bredvid, och utan ort finns inget sökord.
 *   2. Härleder en yrkesterm ur bolagsnamnet och sajttiteln, och sparar den
 *      som `seo.trade`. Mätt: 47 % av bolagsnamnen avslöjar yrket.
 *
 * Kör den här FÖRE varje betald körning. Varje lead den löser är ett lead som
 * inte behöver ett Serper-uppslag.
 *
 *   ?limit=2000       hur många leads som behandlas
 *   ?redo=1           skriv om även dem som redan har en yrkesterm
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://dialer-five.vercel.app/api/cron/keywords"
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = Number(searchParams.get("limit") ?? 2000);
  const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 5000) : 2000;
  const redo = searchParams.get("redo") === "1";
  const started = Date.now();

  // ── 1. Ort ur adressen ────────────────────────────────────────────────────
  const missingCity = await db.lead.findMany({
    where: { retired: false, city: null, address: { not: null } },
    select: { id: true, address: true },
    take: limit,
  });

  let citiesFilled = 0;
  const cityPatches: { id: string; city: string }[] = [];
  for (const lead of missingCity) {
    const city = cityFromAddress(lead.address);
    if (city) cityPatches.push({ id: lead.id, city });
  }
  // Uppdateringarna satsvis. Turso håller skrivlåset över nätverket och
  // hundratals parallella transaktioner slåss om det tills de får timeout.
  for (let i = 0; i < cityPatches.length; i += 50) {
    await Promise.all(
      cityPatches.slice(i, i + 50).map((p) =>
        db.lead.update({ where: { id: p.id }, data: { city: p.city } })
      )
    );
    citiesFilled += cityPatches.slice(i, i + 50).length;
  }

  // ── 2. Yrkesterm ur namn och sajttitel ────────────────────────────────────
  const candidates = await db.lead.findMany({
    where: {
      retired: false,
      ...(redo
        ? {}
        : {
            OR: [
              { dossier: null },
              { dossier: { is: { claims: { none: { key: "seo.trade" } } } } },
            ],
          }),
    },
    select: {
      id: true,
      companyName: true,
      dossier: {
        select: { claims: { where: { key: "tech.title" }, select: { valueStr: true } } },
      },
    },
    orderBy: [{ nextActionAt: "asc" }],
    take: limit,
  });

  let fromName = 0;
  let fromTitle = 0;

  for (const lead of candidates) {
    // Namnet först: det är kortare och mindre brusigt än en sajttitel, som
    // ofta är en slogan ("Vi gör din vardag enklare — sedan 1998").
    let trade = tradeFromText(lead.companyName);
    let source = "name";
    if (!trade) {
      const title = lead.dossier?.claims[0]?.valueStr ?? null;
      trade = tradeFromText(title);
      source = "website";
    }
    if (!trade) continue;

    await writeClaims(lead.id, [
      {
        key: "seo.trade",
        valueStr: trade,
        // Härlett, inte hämtat. Googles egen kategori skriver över det här med
        // sin högre säkerhet så fort ett uppslag görs.
        confidence: source === "name" ? 60 : 65,
        strength: 1,
        source,
      },
    ]);
    if (source === "name") fromName++;
    else fromTitle++;
  }

  const rankable = await db.lead.count({
    where: {
      retired: false,
      website: { not: null },
      city: { not: null },
      dossier: { is: { claims: { some: { key: "seo.trade" } } } },
    },
  });

  return NextResponse.json({
    citiesFilled,
    tradesFromName: fromName,
    tradesFromTitle: fromTitle,
    rankableNow: rankable,
    note: "Gratis. Kör före varje betald körning — varje löst lead är ett uppslag du slipper betala.",
    seconds: Math.round((Date.now() - started) / 1000),
  });
}
