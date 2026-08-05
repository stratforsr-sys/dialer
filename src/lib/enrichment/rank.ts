import type { Signal, SignalContext, SignalProvider } from "./types";

/**
 * Rankprovidern — avstängd tills någon sätter en nyckel.
 *
 * Rankposition och konkurrentnamn finns inte gratis. Att skrapa google.se
 * själva från Vercel betyder datacenter-IP, CAPTCHA inom minuter, brott mot
 * Googles villkor och — värst — en siffra som ibland är fel. En säljare som
 * säger "ni ligger på plats 14" och har fel är sämre än en säljare som inte
 * säger något alls. Det är inte en teknisk risk utan en trovärdighetsrisk.
 *
 * Därför är det här en tom implementation bakom en flagga. Sätts
 * DATAFORSEO_LOGIN och DATAFORSEO_PASSWORD slås spåret på; resten av systemet
 * behöver inte ändras, eftersom manusvarianterna redan gallrar på om
 * uppgiften finns eller inte.
 *
 * Kostnadsbild om det blir aktuellt: cirka 0,024 SEK per lead för rank,
 * konkurrent och Google-profil tillsammans. Vid 2000 leads är det ungefär
 * 70 kronor för hela databasen.
 */

const DFS_ENDPOINT = "https://api.dataforseo.com/v3/serp/google/organic/live/advanced";

export const rankProvider: SignalProvider = {
  name: "rank",
  ttlDays: 21,

  enabled: () =>
    Boolean(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD),

  async collect(ctx: SignalContext): Promise<Signal[]> {
    if (!rankProvider.enabled()) return [];

    // Sökordet är det svåra, inte API-anropet. Utan en tillförlitlig
    // härledning blir påståendet "ni syns inte på X" värdelöst så fort
    // prospektet svarar "ingen söker på X".
    const keyword = deriveKeyword(ctx);
    if (!keyword) return [];

    const auth = Buffer.from(
      `${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`
    ).toString("base64");

    try {
      const res = await fetch(DFS_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          {
            keyword,
            language_code: "sv",
            location_name: "Sweden",
            device: "mobile",
            depth: 20,
          },
        ]),
      });
      if (!res.ok) return [];

      const data = await res.json();
      const items = data?.tasks?.[0]?.result?.[0]?.items ?? [];
      const host = hostOf(ctx.website);
      if (!host) return [];

      const out: Signal[] = [];

      const own = items.find(
        (i: { domain?: string; rank_absolute?: number }) =>
          i.domain && host.includes(i.domain.replace(/^www\./, ""))
      );

      out.push({
        key: "seo.keyword",
        valueStr: keyword,
        confidence: 70,
        source: "dataforseo",
      });

      if (own?.rank_absolute) {
        out.push({
          key: "seo.rank",
          valueNum: own.rank_absolute,
          unit: "position",
          confidence: 88,
          source: "dataforseo",
          weakness: own.rank_absolute > 5,
        });
      } else {
        out.push({
          key: "seo.rank",
          valueStr: "utanför topp 20",
          confidence: 85,
          source: "dataforseo",
          weakness: true,
        });
      }

      // Konkurrentnamnet är den verkliga behållningen och kommer i samma svar,
      // till samma pris. "Plats 14" är en abstraktion; "Smile Center ligger
      // tvåa" är ett slag i magen.
      const competitor = items.find(
        (i: { rank_absolute?: number; domain?: string; title?: string }) =>
          i.rank_absolute != null &&
          i.rank_absolute <= 3 &&
          i.domain &&
          !host.includes(i.domain.replace(/^www\./, ""))
      );
      if (competitor?.title) {
        out.push({
          key: "seo.competitor",
          valueStr: String(competitor.title).split(/[|–—-]/)[0].trim().slice(0, 60),
          confidence: 80,
          source: "dataforseo",
          weakness: true,
        });
      }

      return out;
    } catch {
      return [];
    }
  },
};

function hostOf(website: string | null): string | null {
  if (!website) return null;
  try {
    return new URL(website.startsWith("http") ? website : `https://${website}`).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Sökordshärledning. Medvetet konservativ: hellre inget påstående än ett
 * sökord ingen använder.
 *
 * När rankspåret aktiveras bör det här ersättas av bolagets egen
 * Google-kategori, som kommer på svenska i samma leverantörs API och är
 * betydligt träffsäkrare än något vi kan gissa oss till.
 */
function deriveKeyword(ctx: SignalContext): string | null {
  const city = ctx.address?.split(",").pop()?.replace(/\d{3}\s?\d{2}/, "").trim();
  if (!city) return null;
  return null; // ingen tillförlitlig bransch ännu — se kommentaren ovan
}
