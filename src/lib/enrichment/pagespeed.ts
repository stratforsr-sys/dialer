import type { Signal, SignalContext, SignalProvider } from "./types";
import { normalizeUrl } from "./types";

/**
 * PageSpeed Insights — gratis, och det enda hastighetsmått vi vågar säga högt.
 *
 * Poängen är retorisk lika mycket som teknisk: prospektet kan öppna
 * pagespeed.web.dev, klistra in sin egen adress och se samma siffra inom
 * trettio sekunder. Det är Googles omdöme, inte vårt.
 *
 * Två saker som skyddar säljaren från att ha fel:
 *
 * 1. Vi mäter två gånger och behåller det BÄSTA resultatet. Lighthouse varierar
 *    lätt ±15% mellan körningar; citerar vi det sämre och prospektet kör om
 *    testet ser det ut som att vi överdriver.
 * 2. Påståendet flaggas som svaghet först över 4,0 sekunder — Googles egen
 *    gräns för "dålig". Mellan 2,5 och 4 är det ett svagt argument som bara
 *    inbjuder till diskussion.
 *
 * Fältdata (CrUX) föredras när den finns: "riktiga besökare upplever" är
 * långt starkare än ett labbtest. För ett litet svenskt bolag saknas den
 * oftast — därför labbdata som norm och fältdata som bonus.
 */

const API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const POOR_LCP_MS = 4000;

interface PsiResult {
  lcpMs: number | null;
  performanceScore: number | null;
  fieldLcpMs: number | null;
}

async function runOnce(url: string): Promise<PsiResult | null> {
  const params = new URLSearchParams({
    url,
    strategy: "mobile",
    category: "performance",
  });
  // Nyckeln är valfri men höjer kvoten rejält. Utan den fungerar det ändå.
  if (process.env.PAGESPEED_API_KEY) params.set("key", process.env.PAGESPEED_API_KEY);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(`${API}?${params}`, { signal: controller.signal });

    // Kvotfel måste synas. Utan API-nyckel delas en liten anonym dygnskvot
    // med alla andra som anropar från samma nät, och den är i praktiken alltid
    // förbrukad — providern returnerade då tyst noll signaler och det såg ut
    // som att sajterna var snabba. Ett kastat fel bokförs som utebliven
    // provider i stället, vilket syns i dossierns status.
    if (res.status === 429) {
      throw new Error(
        "PageSpeed-kvoten är slut. Sätt PAGESPEED_API_KEY — nyckeln är gratis och kräver ingen betalningsuppgift."
      );
    }
    if (!res.ok) return null;
    const data = await res.json();

    const audits = data?.lighthouseResult?.audits ?? {};
    const lcpMs = audits["largest-contentful-paint"]?.numericValue ?? null;
    const score = data?.lighthouseResult?.categories?.performance?.score ?? null;

    // Fältdata finns bara för sajter med tillräcklig trafik.
    const fieldLcpMs =
      data?.loadingExperience?.metrics?.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null;

    return {
      lcpMs: typeof lcpMs === "number" ? Math.round(lcpMs) : null,
      performanceScore: typeof score === "number" ? Math.round(score * 100) : null,
      fieldLcpMs: typeof fieldLcpMs === "number" ? fieldLcpMs : null,
    };
  } catch (err) {
    // Kvotfelet ska bubbla upp; allt annat (timeout, nätverk) är per-sajt och
    // ska inte stoppa hela satsen.
    if (err instanceof Error && err.message.includes("PAGESPEED_API_KEY")) throw err;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const pagespeedProvider: SignalProvider = {
  name: "pagespeed",
  // Långt TTL med flit: småföretagssajter ändras sällan, och PageSpeed är
  // gratis — begränsningen är inte kostnad utan att siffran vandrar mellan
  // körningar. En siffra som ändras varje vecka slutar säljaren lita på.
  ttlDays: 90,

  // Utan nyckel är kvoten i praktiken alltid slut, och providern skulle bara
  // producera brus i felloggen. Bättre att den är avstängd och syns som
  // avstängd än att den ser ut att köra men aldrig levererar.
  enabled: () => Boolean(process.env.PAGESPEED_API_KEY),

  async collect(ctx: SignalContext): Promise<Signal[]> {
    const url = normalizeUrl(ctx.website);
    if (!url) return [];

    const first = await runOnce(url);
    if (!first) return [];

    const second = await runOnce(url);

    // Bästa av två — aldrig det sämsta.
    const lcpMs =
      second?.lcpMs != null && first.lcpMs != null
        ? Math.min(first.lcpMs, second.lcpMs)
        : first.lcpMs ?? second?.lcpMs ?? null;
    const score =
      second?.performanceScore != null && first.performanceScore != null
        ? Math.max(first.performanceScore, second.performanceScore)
        : first.performanceScore ?? second?.performanceScore ?? null;
    const fieldLcpMs = first.fieldLcpMs ?? second?.fieldLcpMs ?? null;

    const out: Signal[] = [];
    const evidenceUrl = `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(url)}&form_factor=mobile`;

    // Fältdatan är sanningen om vad besökare upplever. Labbtestet är en
    // simulering av en strypt mobil på dåligt nät och ligger regelmässigt
    // flera gånger högre. Uppmätt exempel: samma sajt gav 6 978 ms i labbet
    // och 1 740 ms för riktiga besökare — fyra gångers skillnad.
    //
    // Säger säljaren "er sajt tar sju sekunder" till någon vars egen Search
    // Console visar 1,7, är samtalet slut och förtroendet för verktyget med
    // det. Därför: finns fältdata är det den som gäller, och labbsiffran får
    // aldrig påstås vara en brist när verkligheten säger något annat.
    const fieldIsGood = fieldLcpMs != null && fieldLcpMs <= POOR_LCP_MS;

    if (fieldLcpMs != null) {
      out.push({
        key: "pagespeed.fieldLcp",
        valueNum: fieldLcpMs,
        unit: "ms",
        confidence: 95,
        source: "crux",
        sourceUrl: evidenceUrl,
        weakness: fieldLcpMs > POOR_LCP_MS,
        strength: 5, // vad riktiga besökare upplever — omöjligt att bortförklara
      });
    }

    if (lcpMs != null) {
      const sellable = lcpMs > POOR_LCP_MS && !fieldIsGood;
      out.push({
        key: "pagespeed.mobileLcp",
        valueNum: lcpMs,
        unit: "ms",
        // Motsäger fältdatan labbtestet vinner fältdatan, och labbsiffran
        // sjunker till en intern notering.
        confidence: fieldIsGood ? 30 : lcpMs > POOR_LCP_MS ? 85 : 45,
        source: "pagespeed",
        sourceUrl: evidenceUrl,
        weakness: sellable,
        // Fyra, inte fem: prospektet kan alltid svara "men det är ju bara ett
        // labbtest". Fältdata har inget sådant motargument.
        strength: 4,
      });
    }

    if (score != null) {
      out.push({
        key: "pagespeed.mobileScore",
        valueNum: score,
        unit: "score",
        confidence: fieldIsGood ? 35 : score < 50 ? 85 : 50,
        source: "pagespeed",
        sourceUrl: evidenceUrl,
        weakness: score < 50 && !fieldIsGood,
        strength: 3,
      });
    }

    return out;
  },
};
