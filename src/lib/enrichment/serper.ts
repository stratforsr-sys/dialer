/**
 * Serper — rank, Google-profil och kategori.
 *
 * Ersätter DataForSEO-stubben som låg i rank.ts. Trovärdighetsresonemanget
 * därifrån gäller fortfarande och är själva anledningen till hur den här filen
 * är byggd: en säljare som säger "ni ligger på plats 14" och har fel är sämre
 * än en säljare som inte säger något alls. Det är inte en teknisk risk utan en
 * trovärdighetsrisk, och den styr tre val nedan.
 *
 *   1. Djup i flera sidor, inte en. Med tio träffar går det bara att säga "vi
 *      hittade er inte", vilket prospektet med rätta hör som svammel. Med
 *      fem sidor går det att säga "plats 47" — ett tal hen kan kontrollera,
 *      vilket är hela skillnaden mellan ett påstående och en pitch. Och det
 *      djup vi faktiskt nådde är det enda som får stå i meningen: `num: 100`
 *      ger tio träffar hos Serper, så den som litar på parametern påstår
 *      hundra och har kollat tio.
 *   2. Ett anrop per bransch+ort, inte per företag. Alla rörmokare i Malmö
 *      konkurrerar om samma sökning; SERP:en är gemensam och positionen läses
 *      ur den per domän. Ett anrop bär därför hela segmentet, och 2 500 gratis
 *      krediter räcker till ett bestånd som annars hade kostat tusentals.
 *   3. Ingenting påstås om det vi inte mätt. Ett bolag som inte syns i
 *      Maps-rutan får ingen recensionsuppgift alls — det betyder inte att de
 *      saknar Google-profil, och den skillnaden får aldrig suddas ut.
 *
 * Sökordet är det svåra, inte API-anropet. Utan bransch och ort på leadet
 * finns inget sökord, och då hämtas ingenting: hellre en tom ruta än
 * "ni syns inte på X" följt av "ingen söker på X".
 */

import { db } from "@/lib/db";
import type { Signal } from "./types";

const SEARCH_ENDPOINT = "https://google.serper.dev/search";
const PLACES_ENDPOINT = "https://google.serper.dev/places";

/** Hur länge en rankmätning räknas som färsk. Google rör sig, men inte dagligen. */
export const SERPER_TTL_DAYS = 21;

/**
 * Djupet hämtas SIDVIS, inte med `num`.
 *
 * Uppmätt mot Serper 2026-08-07: `num: 100` returnerar tio träffar och drar en
 * kredit. Parametern ignoreras. Det är exakt fällan som gjorde att leadmotorns
 * egen export skrev ">20" på tio kontrollerade träffar — ett förbehåll som
 * låter dubbelt så grundligt som mätningen var.
 *
 * `page` fungerar däremot, en kredit per sida om tio. Positionen börjar om på
 * 1 varje sida, så den absoluta placeringen är (sida-1)*10 + position.
 */
const RESULTS_PER_PAGE = 10;

/**
 * Absolut placering ur sidnummer och placering på sidan.
 *
 * Serper räknar om från 1 på varje sida: en träff på sida 2 rapporterar
 * position 4 när den i själva verket är plats 14. Missas det här blir varje
 * bolag på sida två till fyra plötsligt topp tio, vilket är en pitch som
 * spricker i samma sekund som prospektet googlar sig själv.
 */
export function absolutePosition(page: number, positionOnPage: number): number {
  return (page - 1) * RESULTS_PER_PAGE + positionOnPage;
}

/**
 * Tak på antal sidor per sökord. Fem sidor är femtio träffar och fem krediter
 * i värsta fall — men bara i värsta fall: hämtningen slutar så fort alla
 * bolag i segmentet är hittade, eller så fort Google tar slut. "Rörmokare
 * Malmö" har 27 organiska träffar totalt, alltså tre sidor, och det är
 * typiskt för en lokal sökning.
 */
function maxPages(): number {
  const raw = Number(process.env.SERPER_MAX_PAGES);
  return Number.isFinite(raw) && raw >= 1 && raw <= 10 ? Math.floor(raw) : 5;
}

/**
 * Kreditgolvet i torrkörningen — VÄRSTA fallet, alla sidor plus platsanropet.
 * Den faktiska förbrukningen är nästan alltid lägre tack vare det tidiga
 * stoppet, och läses ur svarets `credits`-fält. Gissa aldrig i efterhand det
 * som går att mäta.
 */
const ESTIMATED_CREDITS_PER_PLACES = 1;
function estimatedCreditsPerSegment(): number {
  return maxPages() + ESTIMATED_CREDITS_PER_PLACES;
}

/**
 * Tak per körning. Gratisnivån ger 2 500 krediter totalt, inte per månad, och
 * det finns ingen väg tillbaka när de är slut. Default är därför lågt: hellre
 * tio körningar du styr över än en som tömmer kontot medan du sover.
 */
const DEFAULT_CREDIT_BUDGET = 200;

export function serperEnabled(): boolean {
  return Boolean(process.env.SERPER_KEY);
}

function creditBudget(): number {
  const raw = Number(process.env.SERPER_CREDIT_BUDGET);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CREDIT_BUDGET;
}

// ─── Namn- och domänjämförelse ───────────────────────────────────────────────

const LEGAL_FORM =
  /\b(aktiebolag|ab|hb|kb|handelsbolag|kommanditbolag|ekonomisk förening|ek för|publ|i likvidation)\b/gi;

/**
 * Normaliserar ett företagsnamn så två stavningar kan jämföras.
 *
 * "Nordic Bygg AB", "NORDIC BYGG" och "Nordic Bygg Aktiebolag" är samma bolag.
 * Bolagsformen bär ingen identitet och tas bort; å/ä/ö fälls ned eftersom
 * Google skriver dem olika i olika fält.
 */
export function normalizeCompany(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .replace(LEGAL_FORM, " ")
    .replace(/[åä]/g, "a")
    .replace(/ö/g, "o")
    .replace(/[éè]/g, "e")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hostOf(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    // Skiftlägesokänsligt schema: "HTTPS://…" är en giltig adress, och matchas
    // den bara mot gemener byggs den på till "https://HTTPS://…" — som URL
    // tolkar utan att klaga och ger fel värdnamn för.
    const url = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    // Ett värdnamn utan punkt är inte en domän. Utan den kontrollen blir "—"
    // och "saknas" till värdnamn som sedan jämförs mot riktiga domäner.
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

/**
 * Sökordet. Bransch + ort, exakt så som en kund skulle skriva det.
 *
 * Returnerar null så fort någon del saknas. Det är avsiktligt strängt — ett
 * sökord byggt på en gissad bransch ger en rankuppgift som ser exakt lika
 * trovärdig ut som en riktig, och det är precis det som inte får hända.
 */
export function deriveKeyword(
  industry: string | null,
  city: string | null
): string | null {
  const i = industry?.trim();
  const c = city?.trim();
  if (!i || !c) return null;
  // Branschetiketterna är säljvinklar med "&" i sig ("Ekonomi & redovisning").
  // Ingen googlar så — första ledet är det folk faktiskt söker på.
  const head = i.split(/\s*[&/]\s*/)[0].trim();
  if (!head) return null;
  return `${head.toLowerCase()} ${c.toLowerCase()}`;
}

// ─── Anropen ─────────────────────────────────────────────────────────────────

type OrganicHit = { link?: string; title?: string; position?: number };
type PlaceHit = {
  title?: string;
  address?: string;
  website?: string;
  rating?: number;
  ratingCount?: number;
  category?: string;
  position?: number;
};

type SearchResult = {
  /** Träffarna från alla hämtade sidor, med ABSOLUT position ifylld. */
  organic: OrganicHit[];
  /**
   * Hur djupt vi faktiskt tittade. Det här talet, och inget annat, får stå i
   * meningen "utanför topp N" — annars påstår vi en grundlighet vi inte hade.
   */
  depthChecked: number;
  /** True när Google tog slut innan taket, dvs. vi såg HELA resultatlistan. */
  exhausted: boolean;
  credits: number | null;
};

type PlacesResult = {
  places: PlaceHit[];
  credits: number | null;
};

async function post<T>(
  endpoint: string,
  body: object
): Promise<{ data: T; credits: number | null } | null> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.SERPER_KEY as string,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });

  // 403 = fel nyckel, 429 = krediterna slut. Båda ska stoppa hela körningen,
  // inte bara det här segmentet — annars bränner en trasig nyckel igenom
  // hundra segment och loggar hundra identiska fel.
  if (res.status === 403) throw new SerperFatal("Serper nekade nyckeln (403)");
  if (res.status === 429) throw new SerperFatal("Serpers krediter är slut (429)");
  if (!res.ok) return null;

  const data = (await res.json()) as T & { credits?: number };
  const credits = typeof data.credits === "number" ? data.credits : null;
  return { data, credits };
}

export class SerperFatal extends Error {}

/**
 * Hämtar sökresultatet sida för sida.
 *
 * Slutar så fort ett av tre är sant:
 *   1. Alla bolag i segmentet är hittade. Att betala för sida fyra när ingen
 *      av de sju rörmokarna vi frågar om finns där är rena krediter i sjön.
 *   2. Google tog slut (färre än tio träffar på sidan). Då har vi hela listan,
 *      och "syns inte alls" är ett starkare och sannare påstående än ett tal.
 *   3. Taket nås.
 */
async function searchDeep(
  keyword: string,
  wantedHosts: Set<string>
): Promise<SearchResult | null> {
  const organic: OrganicHit[] = [];
  const found = new Set<string>();
  let credits = 0;
  let sawCredits = false;
  let exhausted = false;
  // Har inget bolag i segmentet en hemsida finns ingen domän att leta efter,
  // och djupet kan inte ge någon placering åt någon. Då räcker sida ett: den
  // bär konkurrenten och topplistan, som är segmentgemensamma. Utan den här
  // raden slår det tidiga stoppet aldrig till och vi betalar fem krediter för
  // fyra sidor ingen kan använda.
  const pages = wantedHosts.size === 0 ? 1 : maxPages();

  for (let page = 1; page <= pages; page++) {
    const r = await post<{ organic?: OrganicHit[] }>(SEARCH_ENDPOINT, {
      q: keyword,
      gl: "se",
      hl: "sv",
      location: "Sweden",
      ...(page > 1 ? { page } : {}),
    });
    // Första sidan måste lyckas, annars har vi ingenting att påstå. Ett fel på
    // en senare sida är inte lika illa — då har vi ett grundare men ärligt
    // djup, och depthChecked speglar det.
    if (!r) return page === 1 ? null : { organic, depthChecked: organic.length, exhausted, credits: sawCredits ? credits : null };

    if (r.credits != null) {
      credits += r.credits;
      sawCredits = true;
    }

    const hits = r.data.organic ?? [];
    hits.forEach((hit, i) => {
      const absolute = absolutePosition(page, hit.position ?? i + 1);
      organic.push({ ...hit, position: absolute });
      const h = hostOf(hit.link);
      if (h && wantedHosts.has(h)) found.add(h);
    });

    if (hits.length < RESULTS_PER_PAGE) {
      exhausted = true;
      break;
    }
    if (wantedHosts.size > 0 && found.size === wantedHosts.size) break;
  }

  return {
    organic,
    depthChecked: organic.length,
    exhausted,
    credits: sawCredits ? credits : null,
  };
}

async function places(keyword: string): Promise<PlacesResult | null> {
  const r = await post<{ places?: PlaceHit[] }>(PLACES_ENDPOINT, {
    q: keyword,
    gl: "se",
    hl: "sv",
    location: "Sweden",
  });
  if (!r) return null;
  return { places: r.data.places ?? [], credits: r.credits };
}

// ─── Tolkning ────────────────────────────────────────────────────────────────

type SegmentLead = {
  id: string;
  companyName: string;
  website: string | null;
};

/**
 * Läser ut ett leads uppgifter ur segmentets gemensamma svar.
 *
 * Positionen matchas på domän, inte på namn: två bolag kan heta lika, men två
 * bolag delar aldrig domän. Maps-rutan matchas på domän när den finns och på
 * normaliserat namn annars, med lägre säkerhet på namnträffen — den kan slå
 * fel på kedjor där varje kontor heter samma sak.
 */
function signalsForLead(
  lead: SegmentLead,
  keyword: string,
  organic: OrganicHit[],
  placeHits: PlaceHit[],
  depthChecked: number,
  exhausted: boolean
): Signal[] {
  const out: Signal[] = [];
  const host = hostOf(lead.website);

  out.push({
    key: "seo.keyword",
    valueStr: keyword,
    confidence: 90,
    strength: 2,
    source: "serper",
  });

  // Första förekomsten per domän. Google listar samma sajt flera gånger med
  // undersidor, och det är den bästa placeringen som är sanningen om dem.
  const rankByHost = new Map<string, number>();
  organic.forEach((hit, index) => {
    const h = hostOf(hit.link);
    if (!h) return;
    if (!rankByHost.has(h)) rankByHost.set(h, hit.position ?? index + 1);
  });

  out.push({
    key: "seo.rivals",
    valueNum: rankByHost.size,
    unit: "st",
    confidence: 90,
    strength: 1,
    source: "serper",
  });

  if (host) {
    const rank = rankByHost.get(host);
    if (rank != null) {
      out.push({
        key: "seo.rank",
        valueNum: rank,
        unit: "position",
        confidence: 90,
        strength: rank > 10 ? 5 : rank > 5 ? 4 : 2,
        // Topp fem är inget att sälja på. Där är kunden redan nöjd, och att
        // kalla det en brist gör säljaren till någon som letar fel.
        weakness: rank > 5,
        source: "serper",
        sourceUrl: `https://www.google.se/search?q=${encodeURIComponent(keyword)}`,
      });
    } else {
      out.push({
        key: "seo.rank",
        // Formulerat som det vi FAKTISKT kollade, aldrig som taket vi siktade
        // på. Tog Google slut har vi sett hela listan och kan säga det rakt
        // ut — det är ett starkare påstående än vilket tal som helst, och det
        // enda som håller när prospektet googlar sig själv under samtalet.
        valueStr: exhausted
          ? "syns inte alls i sökresultatet"
          : `utanför topp ${depthChecked}`,
        confidence: exhausted ? 90 : 85,
        strength: 5,
        weakness: true,
        source: "serper",
        sourceUrl: `https://www.google.se/search?q=${encodeURIComponent(keyword)}`,
      });
    }
  }

  // Konkurrenten är den verkliga behållningen och kommer i samma svar, till
  // samma pris. "Plats 47" är en abstraktion; "Smile Center ligger tvåa" är
  // ett slag i magen.
  const leader = organic.find((hit) => {
    const h = hostOf(hit.link);
    return h && h !== host;
  });
  if (leader?.title) {
    out.push({
      key: "seo.competitor",
      valueStr: String(leader.title).split(/[|–—-]/)[0].trim().slice(0, 60),
      confidence: 85,
      strength: 5,
      weakness: true,
      source: "serper",
      sourceUrl: leader.link ?? null,
    });
  }

  // Array.from och inte spread — tsconfig siktar på ES5 och kan inte iterera
  // en Map direkt. Samma sak som i import-stream.
  const top3 = Array.from(rankByHost.keys()).filter((h) => h !== host).slice(0, 3);
  if (top3.length > 0) {
    out.push({
      key: "seo.top3",
      valueStr: top3.join(" > "),
      confidence: 85,
      strength: 3,
      source: "serper",
    });
  }

  // ── Maps-rutan ────────────────────────────────────────────────────────────
  const normalized = normalizeCompany(lead.companyName);
  let match: PlaceHit | undefined;
  let matchConfidence = 0;

  if (host) {
    match = placeHits.find((p) => hostOf(p.website) === host);
    if (match) matchConfidence = 92;
  }
  if (!match && normalized) {
    match = placeHits.find((p) => normalizeCompany(p.title) === normalized);
    if (match) matchConfidence = 70;
  }

  if (match) {
    if (typeof match.rating === "number") {
      out.push({
        key: "gmb.rating",
        valueNum: match.rating,
        unit: "score",
        confidence: matchConfidence,
        strength: 3,
        weakness: match.rating < 4,
        source: "serper",
      });
    }
    if (typeof match.ratingCount === "number") {
      out.push({
        key: "gmb.reviewCount",
        valueNum: match.ratingCount,
        unit: "st",
        confidence: matchConfidence,
        strength: match.ratingCount < 5 ? 5 : 3,
        weakness: match.ratingCount < 10,
        source: "serper",
      });
    }
    if (match.category) {
      out.push({
        key: "gmb.category",
        valueStr: match.category.slice(0, 60),
        confidence: matchConfidence,
        strength: 2,
        source: "serper",
      });
    }
    if (typeof match.position === "number") {
      out.push({
        key: "gmb.localRank",
        valueNum: match.position,
        unit: "position",
        confidence: matchConfidence,
        strength: match.position > 3 ? 4 : 2,
        weakness: match.position > 3,
        source: "serper",
      });
    }
  }

  const localLeader = placeHits.find(
    (p) => !match || normalizeCompany(p.title) !== normalizeCompany(match.title)
  );
  if (localLeader?.title) {
    out.push({
      key: "gmb.localLeader",
      valueStr: localLeader.title.slice(0, 60),
      confidence: 85,
      strength: 3,
      source: "serper",
    });
  }

  return out;
}

// ─── Segmentering ────────────────────────────────────────────────────────────

export type Segment = {
  keyword: string;
  industry: string;
  city: string;
  leads: SegmentLead[];
  /** Färskaste rankmätningen i segmentet, eller null om ingen finns. */
  freshestAt: Date | null;
};

/**
 * Bygger segmenten och sorterar dem så att den första kredit som spenderas
 * täcker flest leads. Samma prioritering som torrkörningen visar, så att det
 * du godkänner är det som körs.
 */
export async function buildSegments(opts: {
  listId?: string | null;
  onlyStale?: boolean;
}): Promise<{ segments: Segment[]; withoutKeyword: number }> {
  // Leads UTAN hemsida tas med med flit. De kan inte få en rankposition —
  // det finns ingen domän att matcha mot — men de kan få betyg, recensioner
  // och kategori ur Maps-rutan via namnmatchning, och /places-anropet är redan
  // betalt för segmentet. Att utesluta dem hade kostat noll och gett noll,
  // samtidigt som det är precis de bolagen samtalet är enklast att öppna med.
  const leads = await db.lead.findMany({
    where: {
      retired: false,
      ...(opts.listId ? { lists: { some: { listId: opts.listId } } } : {}),
    },
    select: {
      id: true,
      companyName: true,
      website: true,
      industry: true,
      city: true,
      nextActionAt: true,
    },
    orderBy: [{ nextActionAt: "asc" }],
  });

  // Yrkestermen slår branschen när den finns. Den kommer från Googles egen
  // kategori för bolaget (serper-lead.ts) eller ur bolagsnamnet, och är i båda
  // fallen ett bättre SÖKORD än taxonomietiketten: "snickare malmö" är vad en
  // kund skriver, "bygg malmö" är vad ett register kallar det.
  const trades = await db.leadClaim.findMany({
    where: { key: "seo.trade", leadId: { in: leads.map((l) => l.id) } },
    select: { leadId: true, valueStr: true },
  });
  const tradeById = new Map(trades.map((t) => [t.leadId, t.valueStr]));

  const grouped = new Map<string, Segment>();
  let withoutKeyword = 0;

  for (const lead of leads) {
    const keyword =
      deriveKeyword(tradeById.get(lead.id) ?? null, lead.city) ??
      deriveKeyword(lead.industry, lead.city);
    if (!keyword) {
      withoutKeyword++;
      continue;
    }
    const existing = grouped.get(keyword);
    const entry: SegmentLead = {
      id: lead.id,
      companyName: lead.companyName,
      website: lead.website,
    };
    if (existing) {
      existing.leads.push(entry);
    } else {
      grouped.set(keyword, {
        keyword,
        industry: tradeById.get(lead.id) ?? (lead.industry as string),
        city: lead.city as string,
        leads: [entry],
        freshestAt: null,
      });
    }
  }

  let segments: Segment[] = Array.from(grouped.values());

  if (opts.onlyStale && segments.length > 0) {
    const cutoff = new Date(Date.now() - SERPER_TTL_DAYS * 86_400_000);
    const fresh = await db.leadClaim.findMany({
      where: {
        // Färskheten mäts på sökordet, inte på placeringen. Ett lead utan
        // hemsida får aldrig någon seo.rank, och hade mätningen hängt på den
        // hade de bolagen sett eviga ut och hämtats om vid varje körning —
        // samma kredit betald om och om igen för ett svar vi redan har.
        key: "seo.keyword",
        source: "serper",
        fetchedAt: { gt: cutoff },
        leadId: { in: segments.flatMap((s) => s.leads.map((l) => l.id)) },
      },
      select: { leadId: true, fetchedAt: true },
    });
    const freshById = new Map(fresh.map((f) => [f.leadId, f.fetchedAt]));
    for (const seg of segments) {
      const stamps = seg.leads
        .map((l) => freshById.get(l.id))
        .filter((d): d is Date => d != null);
      // Segmentet räknas som färskt bara när VARJE lead i det har en färsk
      // mätning. Ett nyimporterat bolag i ett gammalt segment ska dra med sig
      // en ny sökning — den kostar ändå bara en kredit för hela gruppen.
      seg.freshestAt = stamps.length === seg.leads.length && stamps.length > 0
        ? new Date(Math.max(...stamps.map((d) => d.getTime())))
        : null;
    }
    segments = segments.filter((s) => s.freshestAt === null);
  }

  // Flest leads per kredit först.
  segments.sort((a, b) => b.leads.length - a.leads.length);

  return { segments, withoutKeyword };
}

// ─── Torrkörning ─────────────────────────────────────────────────────────────

export type DryRun = {
  segments: number;
  leadsCovered: number;
  leadsWithoutKeyword: number;
  estimatedCredits: number;
  budget: number;
  segmentsWithinBudget: number;
  leadsWithinBudget: number;
  top: { keyword: string; leads: number }[];
};

export async function dryRun(opts: {
  listId?: string | null;
  onlyStale?: boolean;
  limit?: number | null;
}): Promise<DryRun> {
  const { segments, withoutKeyword } = await buildSegments(opts);
  const capped = opts.limit ? segments.slice(0, opts.limit) : segments;

  const budget = creditBudget();
  const perSegment = estimatedCreditsPerSegment();
  const affordable = Math.floor(budget / perSegment);
  const withinBudget = capped.slice(0, affordable);

  return {
    segments: capped.length,
    leadsCovered: capped.reduce((n, s) => n + s.leads.length, 0),
    leadsWithoutKeyword: withoutKeyword,
    estimatedCredits: capped.length * perSegment,
    budget,
    segmentsWithinBudget: withinBudget.length,
    leadsWithinBudget: withinBudget.reduce((n, s) => n + s.leads.length, 0),
    top: capped.slice(0, 10).map((s) => ({ keyword: s.keyword, leads: s.leads.length })),
  };
}

// ─── Körning ─────────────────────────────────────────────────────────────────

export type SerperRun = {
  segmentsDone: number;
  leadsUpdated: number;
  claimsWritten: number;
  creditsReported: number | null;
  creditsEstimated: number;
  stoppedBecause: string | null;
  failedKeywords: string[];
};

export async function runSerper(opts: {
  listId?: string | null;
  limit?: number | null;
  onlyStale?: boolean;
}): Promise<SerperRun> {
  const run: SerperRun = {
    segmentsDone: 0,
    leadsUpdated: 0,
    claimsWritten: 0,
    creditsReported: null,
    creditsEstimated: 0,
    stoppedBecause: null,
    failedKeywords: [],
  };

  if (!serperEnabled()) {
    run.stoppedBecause = "SERPER_KEY saknas";
    return run;
  }

  const { segments } = await buildSegments(opts);
  const capped = opts.limit ? segments.slice(0, opts.limit) : segments;
  const budget = creditBudget();

  let reported = 0;
  let sawReported = false;

  for (const segment of capped) {
    if (run.creditsEstimated + estimatedCreditsPerSegment() > budget) {
      run.stoppedBecause = `kreditspärren nådd (${budget})`;
      break;
    }

    // Hämta brett …
    let organic: OrganicHit[] = [];
    let placeHits: PlaceHit[] = [];
    let depthChecked = 0;
    let exhausted = false;
    try {
      // Domänerna vi letar efter skickas med så att hämtningen kan sluta så
      // fort alla är hittade i stället för att betala för fem sidor varje gång.
      const wanted = new Set(
        segment.leads.map((l) => hostOf(l.website)).filter((h): h is string => h !== null)
      );
      const [s, p] = await Promise.all([
        searchDeep(segment.keyword, wanted),
        places(segment.keyword),
      ]);
      run.creditsEstimated += estimatedCreditsPerSegment();
      if (s?.credits != null) {
        reported += s.credits;
        sawReported = true;
      }
      if (p?.credits != null) {
        reported += p.credits;
        sawReported = true;
      }
      organic = s?.organic ?? [];
      depthChecked = s?.depthChecked ?? 0;
      exhausted = s?.exhausted ?? false;
      placeHits = p?.places ?? [];
      if (!s) {
        run.failedKeywords.push(segment.keyword);
        continue;
      }
    } catch (err) {
      if (err instanceof SerperFatal) {
        run.stoppedBecause = err.message;
        break;
      }
      run.failedKeywords.push(segment.keyword);
      continue;
    }

    // … skriv smalt. Turso håller skrivlåset över nätverket och SQLite har en
    // enda skrivare; parallella transaktioner här ger P2028 och tappar satsen.
    for (const lead of segment.leads) {
      const signals = signalsForLead(
        lead, segment.keyword, organic, placeHits, depthChecked, exhausted
      );
      if (signals.length === 0) continue;
      await writeClaims(lead.id, signals);
      run.leadsUpdated++;
      run.claimsWritten += signals.length;
    }

    run.segmentsDone++;
  }

  run.creditsReported = sawReported ? reported : null;
  return run;
}

/**
 * Skriver uppgifterna för ett lead.
 *
 * Uppdaterar per nyckel i stället för att tömma och skriva om: en Serper-körning
 * ska aldrig radera det sajtkontrollen hämtat, och tvärtom. Dossiersiffrorna
 * räknas om från ALLA leadets uppgifter, inte bara de nyss skrivna — annars
 * skulle varje delkörning skriva över en helhet med sin egen del.
 */
export async function writeClaims(leadId: string, signals: Signal[]): Promise<void> {
  const now = new Date();
  const staleAfter = new Date(now.getTime() + SERPER_TTL_DAYS * 86_400_000);

  await db.leadDossier.upsert({
    where: { leadId },
    create: { leadId, status: "OK", fetchedAt: now, staleAfter },
    update: { status: "OK", fetchedAt: now, staleAfter },
  });

  await db.$transaction(
    signals.map((s) =>
      db.leadClaim.upsert({
        where: { leadId_key: { leadId, key: s.key } },
        create: {
          leadId,
          key: s.key,
          valueNum: s.valueNum ?? null,
          valueStr: s.valueStr ?? null,
          valueBool: s.valueBool ?? null,
          unit: s.unit ?? null,
          confidence: s.confidence,
          strength: s.strength ?? 3,
          weakness: s.weakness ?? false,
          source: s.source,
          sourceUrl: s.sourceUrl ?? null,
          rawJson: s.rawJson ?? null,
          fetchedAt: now,
        },
        update: {
          valueNum: s.valueNum ?? null,
          valueStr: s.valueStr ?? null,
          valueBool: s.valueBool ?? null,
          unit: s.unit ?? null,
          confidence: s.confidence,
          strength: s.strength ?? 3,
          weakness: s.weakness ?? false,
          source: s.source,
          sourceUrl: s.sourceUrl ?? null,
          rawJson: s.rawJson ?? null,
          fetchedAt: now,
        },
      })
    )
  );

  const all = await db.leadClaim.findMany({
    where: { leadId },
    select: { weakness: true, confidence: true },
  });
  await db.leadDossier.update({
    where: { leadId },
    data: {
      weaknessCount: all.filter((c) => c.weakness).length,
      overallConfidence: all.length
        ? Math.round(all.reduce((n, c) => n + c.confidence, 0) / all.length)
        : 0,
    },
  });
}
