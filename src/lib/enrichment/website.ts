import type { Signal, SignalContext, SignalProvider } from "./types";
import { normalizeUrl } from "./types";

/**
 * Gratisspåret: allt vi kan se med en enda HTTP-hämtning av prospektets
 * startsida. Ingen betald API, ingen rörlig kostnad, och signalerna är starka
 * nog att bära ett samtal på egen hand.
 *
 * Vi uppträder som en anständig besökare: en hämtning per bolag, identifierbar
 * User-Agent med kontaktväg, kort timeout, och ingen crawl av undersidor.
 * Det här är samma trafik som en potentiell kund skulle generera.
 */

const UA =
  "Mozilla/5.0 (compatible; ClicknetBot/1.0; +https://clicknet.se/bot) AppleWebKit/537.36";
const TIMEOUT_MS = 12_000;
const MAX_BYTES = 1_500_000;

interface Fetched {
  finalUrl: string;
  status: number;
  html: string;
  headers: Headers;
  ttfbMs: number;
  bytes: number;
  usedHttps: boolean;
  tlsError: boolean;
}

async function fetchSite(url: string): Promise<Fetched | null> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    });
    const ttfbMs = Date.now() - started;

    // Läs högst MAX_BYTES — en enda sida med inbäddad video ska inte kunna
    // spränga minnet i en serverless-funktion.
    const reader = res.body?.getReader();
    let html = "";
    let bytes = 0;
    if (reader) {
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes <= MAX_BYTES) html += decoder.decode(value, { stream: true });
        else { void reader.cancel(); break; }
      }
    }

    return {
      finalUrl: res.url || url,
      status: res.status,
      html,
      headers: res.headers,
      ttfbMs,
      bytes,
      usedHttps: (res.url || url).startsWith("https://"),
      tlsError: false,
    };
  } catch (err) {
    // Ett certifikatfel ser ut som ett nätverksfel här. Vi skiljer dem åt genom
    // att prova http: går den vägen fram är sajten uppe men har trasigt TLS.
    const message = err instanceof Error ? err.message.toLowerCase() : "";
    const tlsish =
      message.includes("certificate") || message.includes("ssl") || message.includes("tls");
    if (tlsish && url.startsWith("https://")) {
      const plain = await fetchSite(url.replace(/^https:/, "http:"));
      if (plain) return { ...plain, tlsError: true, usedHttps: false };
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function textBetween(html: string, tag: string): string | null {
  const m = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null;
}

function metaContent(html: string, name: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']`,
    "i"
  );
  const alt = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`,
    "i"
  );
  return (html.match(re)?.[1] ?? html.match(alt)?.[1] ?? null)?.trim() || null;
}

export const websiteProvider: SignalProvider = {
  name: "website",
  ttlDays: 30,
  enabled: () => true,

  async collect(ctx: SignalContext): Promise<Signal[]> {
    const url = normalizeUrl(ctx.website);
    const out: Signal[] = [];

    // Ingen sajt alls är den starkaste signalen i hela databasen för ett bolag
    // som säljer hemsidor.
    if (!url) {
      out.push({
        key: "tech.hasWebsite",
        valueBool: false,
        confidence: 95,
        source: "website",
        weakness: true,
        strength: 5, // starkaste leadet i hela databasen för den som säljer hemsidor
      });
      return out;
    }

    const res = await fetchSite(url);

    if (!res || res.status >= 400) {
      out.push({
        key: "tech.siteReachable",
        valueBool: false,
        valueStr: res ? `HTTP ${res.status}` : "svarar inte",
        confidence: res ? 90 : 70, // nätverksfel kan vara tillfälligt
        source: "website",
        sourceUrl: url,
        weakness: true,
        strength: 5,
      });
      return out;
    }

    const html = res.html;
    const lower = html.toLowerCase();

    out.push({
      key: "tech.siteReachable",
      valueBool: true,
      confidence: 95,
      source: "website",
      sourceUrl: res.finalUrl,
    });

    // ── HTTPS ────────────────────────────────────────────────────────────
    // Den mest visceralt begripliga bristen som finns: Chrome skriver ut
    // "Inte säker" bredvid adressen, och prospektet kan verifiera på två
    // sekunder.
    const secure = res.usedHttps && !res.tlsError;
    out.push({
      key: "tech.hasSSL",
      valueBool: secure,
      confidence: 95,
      source: "website",
      sourceUrl: res.finalUrl,
      weakness: !secure,
      strength: 5, // Chrome skriver "Inte säker" — verifierbart på två sekunder
    });

    // ── Mobilanpassning ──────────────────────────────────────────────────
    const viewport = metaContent(html, "viewport");
    const mobileFriendly = !!viewport && /width\s*=\s*device-width/i.test(viewport);
    out.push({
      key: "tech.mobileFriendly",
      valueBool: mobileFriendly,
      // Vissa ramverk injicerar viewport via JS, så frånvaro i rå HTML är inte
      // ett bevis. Lägre säkerhet på det negativa utfallet.
      confidence: mobileFriendly ? 92 : 72,
      source: "website",
      sourceUrl: res.finalUrl,
      weakness: !mobileFriendly,
      strength: 5,
    });

    // ── Titel ────────────────────────────────────────────────────────────
    const title = textBetween(html, "title");
    if (title) {
      const clean = title.trim();
      // "Hem" och "Startsida" är den starka träffen: rubriken Google visar
      // säger ingenting om vad bolaget gör. Kort titel är en svagare signal —
      // ett etablerat varumärke klarar sig på sitt namn, ett litet lokalt
      // bolag gör det inte. Därför lägre tröskel och lägre säkerhet.
      const junk = /^(hem|startsida|home|untitled|index|välkommen|ny sida|forsida|förstasida)$/i.test(clean);
      const tooShort = clean.length < 10;
      out.push({
        key: "tech.title",
        valueStr: clean.slice(0, 120),
        confidence: junk ? 95 : tooShort ? 70 : 90,
        source: "website",
        sourceUrl: res.finalUrl,
        weakness: junk || tooShort,
        strength: junk ? 5 : 3,
      });
    } else {
      out.push({
        key: "tech.title",
        valueStr: null,
        valueBool: false,
        confidence: 90,
        source: "website",
        sourceUrl: res.finalUrl,
        weakness: true,
        strength: 4,
      });
    }

    // ── Metabeskrivning ──────────────────────────────────────────────────
    const desc = metaContent(html, "description");
    out.push({
      key: "tech.hasMetaDescription",
      valueBool: !!desc && desc.length >= 50,
      confidence: 90,
      source: "website",
      sourceUrl: res.finalUrl,
      weakness: !desc || desc.length < 50,
      strength: 3,
    });

    // ── Strukturerad data ────────────────────────────────────────────────
    const hasSchema =
      lower.includes("application/ld+json") ||
      lower.includes("itemtype=\"https://schema.org") ||
      lower.includes("itemtype='https://schema.org");
    const hasLocalBusiness = /"@type"\s*:\s*"(localbusiness|dentist|restaurant|store|professionalservice|homeandconstructionbusiness|healthandbeautybusiness)"/i.test(html);
    out.push({
      key: "tech.hasLocalBusinessSchema",
      valueBool: hasLocalBusiness,
      // Stödjande punkt, aldrig öppningsreplik: sant men abstrakt för en kund.
      confidence: hasSchema ? 85 : 75,
      source: "website",
      sourceUrl: res.finalUrl,
      weakness: !hasLocalBusiness,
      strength: 1, // sant men abstrakt — aldrig öppningsreplik
    });

    // ── Mätning ──────────────────────────────────────────────────────────
    // Consent-lösningar laddar ofta taggen först efter samtycke, så frånvaro
    // i rå HTML är svagt bevis. Låg säkerhet — påståendet får inte fällas
    // ut på ett samtal utan att stämma.
    const hasAnalytics =
      lower.includes("googletagmanager.com") ||
      lower.includes("gtag(") ||
      lower.includes("google-analytics.com") ||
      lower.includes("plausible.io") ||
      lower.includes("matomo");
    out.push({
      key: "tech.hasAnalytics",
      valueBool: hasAnalytics,
      confidence: hasAnalytics ? 90 : 55,
      source: "website",
      sourceUrl: res.finalUrl,
      weakness: !hasAnalytics,
      strength: 2, // stark OM sann, men laddas ofta först efter samtycke
    });

    // ── Sidfotens årtal ──────────────────────────────────────────────────
    const years = Array.from(html.matchAll(/(?:©|&copy;|copyright)[^0-9]{0,20}(\d{4})/gi))
      .map((m) => Number(m[1]))
      .filter((y) => y >= 2000 && y <= new Date().getFullYear() + 1);
    if (years.length > 0) {
      const newest = Math.max(...years);
      const stale = newest <= new Date().getFullYear() - 2;
      out.push({
        key: "tech.copyrightYear",
        valueNum: newest,
        // Färgstark detalj, inte huvudargument: gott om välskötta sajter har
        // ett hårdkodat årtal i sidfoten.
        confidence: stale ? 70 : 85,
        source: "website",
        sourceUrl: res.finalUrl,
        weakness: stale,
        strength: 2, // färgstark detalj, inte huvudargument
      });
    }

    // ── WordPress-version ────────────────────────────────────────────────
    const wp = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']WordPress\s+([\d.]+)/i);
    if (wp) {
      out.push({
        key: "tech.wordpressVersion",
        valueStr: wp[1],
        // Många webbhotell patchar utan att uppdatera generator-strängen.
        // Formuleras som risk, aldrig som "ni kommer bli hackade".
        confidence: 65,
        source: "website",
        sourceUrl: res.finalUrl,
        weakness: true,
        strength: 3, // formuleras som risk, aldrig som "ni kommer bli hackade"
      });
    }

    // ── Sidvikt och svarstid ─────────────────────────────────────────────
    out.push({
      key: "tech.ttfbMs",
      valueNum: res.ttfbMs,
      unit: "ms",
      // En mätning från en serverhall är inte vad en kund upplever. Låg
      // säkerhet — PageSpeed är källan vi citerar högt.
      confidence: 60,
      source: "website",
      sourceUrl: res.finalUrl,
      weakness: res.ttfbMs > 1500,
      strength: 1, // mätt från serverhall — PageSpeed är siffran vi citerar
    });
    out.push({
      key: "tech.pageBytes",
      valueNum: res.bytes,
      unit: "bytes",
      confidence: 80,
      source: "website",
      sourceUrl: res.finalUrl,
      weakness: res.bytes > 3_000_000,
      strength: 2,
    });

    return out;
  },
};
