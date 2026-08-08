/**
 * Uppslag per bolag — vägen till rank på HELA beståndet.
 *
 * Segmentspåret i serper.ts är billigt men förutsätter att leadet redan har en
 * bransch. Mätt mot beståndet 2026-08-07 hade 913 av 3 426 leads det, och bara
 * 18 hade bransch + ort + hemsida. Rank på alla leads går alltså inte att nå
 * den vägen, oavsett hur många krediter man lägger på den.
 *
 * Här vänds ordningen. I stället för att gissa bolagets bransch och söka på
 * den, FRÅGAR vi Google vad bolaget är:
 *
 *   Steg 1  /places med "bolagsnamn + ort" → Googles egen kategori för just
 *           det bolaget ("VVS-entreprenör"), plus betyg, recensionsantal,
 *           telefonnummer, hemsida och adress. En kredit per bolag.
 *   Steg 2  kategorin + orten blir sökordet, och rankmätningen grupperas som
 *           vanligt — alla VVS-entreprenörer i Malmö delar en SERP.
 *
 * Kategorin är auktoritativ på ett sätt ingen klassificering kan bli: den är
 * bolagets egen. Ingen AI, ingen kvot, ingen gissning ur ett bolagsnamn.
 *
 * Bieffekten är att importfilen kan bli mycket tunnare. Namn och telefonnummer
 * räcker — resten hämtar steg 1. Två förbehåll gäller ändå:
 *
 *   • Org-numret kommer INTE från Google, och importen deduplicerar på det.
 *     Utan org-nummer i filen blir samma bolag två leads vid nästa uppladdning.
 *   • Bolag utan Google-profil får ingenting. De finns — särskilt renodlade
 *     B2B-bolag utan besöksadress — och för dem är tomt rätt svar.
 */

import { db } from "@/lib/db";
import type { Signal } from "./types";
import { normalizeCompany, hostOf, writeClaims, SERPER_TTL_DAYS } from "./serper";
import { tradeFromText, cityFromAddress } from "./trade";

const PLACES_ENDPOINT = "https://google.serper.dev/places";

/** En kredit per bolag. Ingen paginering — vi vill ha ETT bolag, inte en lista. */
const CREDITS_PER_LOOKUP = 1;

type PlaceHit = {
  title?: string;
  address?: string;
  website?: string;
  phoneNumber?: string;
  rating?: number;
  ratingCount?: number;
  category?: string;
  cid?: string;
  position?: number;
};

export type LeadLookupRun = {
  considered: number;
  matched: number;
  unmatched: number;
  claimsWritten: number;
  /** Fält vi kunde fylla i på själva leadet, inte bara i dossiern. */
  filledWebsite: number;
  filledCity: number;
  creditsReported: number | null;
  creditsSpent: number;
  stoppedBecause: string | null;
};

function creditBudget(): number {
  const raw = Number(process.env.SERPER_LEAD_BUDGET);
  // Lågt default med flit. Ett uppslag per bolag skalar linjärt med beståndet,
  // och gratisnivåns 2 500 krediter är ENGÅNGS — ett slarvigt anrop utan tak
  // tömmer kontot på ett bestånd av den här storleken.
  return Number.isFinite(raw) && raw > 0 ? raw : 300;
}

/**
 * Väljer rätt plats ur svaret.
 *
 * Google svarar med en lista även på en namnsökning, och den första träffen är
 * inte alltid rätt bolag — söker man "Nordic Bygg Malmö" kan en större
 * konkurrent ligga överst. Domänen avgör när vi har en, annars normaliserat
 * namn. Utan träff returneras null och ingenting skrivs: fel bolags
 * recensioner på fel lead är värre än inga recensioner alls.
 */
function pickPlace(
  hits: PlaceHit[],
  companyName: string,
  website: string | null
): { place: PlaceHit; confidence: number } | null {
  const host = hostOf(website);
  if (host) {
    const byDomain = hits.find((h) => hostOf(h.website) === host);
    if (byDomain) return { place: byDomain, confidence: 95 };
  }

  const wanted = normalizeCompany(companyName);
  if (!wanted) return null;

  const exact = hits.find((h) => normalizeCompany(h.title) === wanted);
  if (exact) return { place: exact, confidence: 88 };

  // Delmängdsmatchning för de fall Google skriver ut mer än filen:
  // "Kulladals Snickeri" i filen, "Kulladals Snickeri AB" hos Google.
  // Kräver att filens namn är minst tre tecken för att inte matcha allt.
  if (wanted.length >= 3) {
    const partial = hits.find((h) => {
      const t = normalizeCompany(h.title);
      return t && (t.startsWith(wanted) || wanted.startsWith(t));
    });
    // Lägre säkerhet: den här matchningen kan slå fel på kedjor där varje
    // kontor heter nästan samma sak.
    if (partial) return { place: partial, confidence: 70 };
  }

  return null;
}

/** Bygger uppgifterna ur en träffad Google-plats. */
function signalsFromPlace(place: PlaceHit, confidence: number): Signal[] {
  const out: Signal[] = [];

  if (place.category) {
    const category = place.category.slice(0, 60);
    out.push({
      key: "gmb.category",
      valueStr: category,
      confidence,
      strength: 2,
      source: "serper",
    });
    // Kategorin ÄR sökordet i steg 2. Sparas separat under seo.trade så att
    // rankmätningen kan läsa den utan att bry sig om varifrån den kom —
    // Google, bolagsnamnet eller sajttiteln.
    out.push({
      key: "seo.trade",
      valueStr: category.toLowerCase(),
      confidence,
      strength: 1,
      source: "serper",
    });
  }

  if (typeof place.rating === "number") {
    out.push({
      key: "gmb.rating",
      valueNum: place.rating,
      unit: "score",
      confidence,
      strength: 3,
      weakness: place.rating < 4,
      source: "serper",
    });
  }

  // Noll recensioner är en uppgift, inte en saknad uppgift — och den starkaste
  // i hela listan för den som säljer synlighet.
  if (typeof place.ratingCount === "number") {
    out.push({
      key: "gmb.reviewCount",
      valueNum: place.ratingCount,
      unit: "st",
      confidence,
      strength: place.ratingCount < 5 ? 5 : 3,
      weakness: place.ratingCount < 10,
      source: "serper",
    });
  }

  if (place.phoneNumber) {
    out.push({
      key: "gmb.phone",
      valueStr: place.phoneNumber.slice(0, 32),
      confidence,
      strength: 2,
      source: "serper",
    });
  }

  return out;
}

/**
 * Slår upp bolag ett i taget.
 *
 * Kön är leads utan färsk kategori. Leads som redan har en rörs inte, så
 * jobbet är idempotent och kan köras om utan att betala för samma svar igen.
 */
export async function lookupLeads(opts: {
  listId?: string | null;
  limit?: number | null;
  /** Kör om även dem som redan har en kategori. */
  redo?: boolean;
}): Promise<LeadLookupRun> {
  const run: LeadLookupRun = {
    considered: 0,
    matched: 0,
    unmatched: 0,
    claimsWritten: 0,
    filledWebsite: 0,
    filledCity: 0,
    creditsReported: null,
    creditsSpent: 0,
    stoppedBecause: null,
  };

  if (!process.env.SERPER_KEY) {
    run.stoppedBecause = "SERPER_KEY saknas";
    return run;
  }

  const budget = creditBudget();
  const cutoff = new Date(Date.now() - SERPER_TTL_DAYS * 86_400_000);

  const leads = await db.lead.findMany({
    where: {
      retired: false,
      ...(opts.listId ? { lists: { some: { listId: opts.listId } } } : {}),
      ...(opts.redo
        ? {}
        : {
            OR: [
              { dossier: null },
              { dossier: { is: { claims: { none: { key: "gmb.category" } } } } },
              {
                dossier: {
                  is: {
                    claims: {
                      some: { key: "gmb.category", fetchedAt: { lte: cutoff } },
                    },
                  },
                },
              },
            ],
          }),
    },
    select: { id: true, companyName: true, city: true, address: true, website: true },
    // De som snart ska ringas först. Att slå upp ett bolag ingen kommer att
    // ringa är att betala för ett svar som hinner bli gammalt före samtalet.
    orderBy: [{ nextActionAt: "asc" }, { attemptCount: "asc" }],
    take: Math.min(opts.limit ?? 100, 1000),
  });

  run.considered = leads.length;
  let reported = 0;
  let sawReported = false;

  /**
   * Tidsspärr.
   *
   * Uppslagen görs ett i taget mot ett främmande API och tar drygt en sekund
   * styck. Vercels tak är 300 sekunder, och en körning som slår i det blir
   * dödad mitt i: skrivningarna som hunnits med finns kvar, men svaret
   * försvinner och anroparen får ingen aning om hur långt det gick. Att stanna
   * själv med 40 sekunders marginal ger i stället en rapport att fortsätta
   * från — och jobbet är idempotent, så nästa anrop tar vid där det slutade.
   */
  const deadline = Date.now() + 260_000;

  for (const lead of leads) {
    if (run.creditsSpent + CREDITS_PER_LOOKUP > budget) {
      run.stoppedBecause = `kreditspärren nådd (${budget})`;
      break;
    }
    if (Date.now() > deadline) {
      run.stoppedBecause = "tidsspärren nådd — kör igen för resten";
      break;
    }

    // Orten skärper sökningen rejält — "Nordic Bygg" finns i varje stad.
    // Saknas den på leadet plockas den ur adressen; finns ingen av delarna
    // söker vi ändå, men med lägre träffsäkerhet.
    const city = lead.city ?? cityFromAddress(lead.address);
    const query = city ? `${lead.companyName} ${city}` : lead.companyName;

    let hits: PlaceHit[] = [];
    try {
      const res = await fetch(PLACES_ENDPOINT, {
        method: "POST",
        headers: {
          "X-API-KEY": process.env.SERPER_KEY as string,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query, gl: "se", hl: "sv", location: "Sweden" }),
        signal: AbortSignal.timeout(45_000),
      });
      if (res.status === 403) {
        run.stoppedBecause = "Serper nekade nyckeln (403)";
        break;
      }
      if (res.status === 429) {
        run.stoppedBecause = "Serpers krediter är slut (429)";
        break;
      }
      run.creditsSpent += CREDITS_PER_LOOKUP;
      if (!res.ok) {
        run.unmatched++;
        continue;
      }
      const data = (await res.json()) as { places?: PlaceHit[]; credits?: number };
      if (typeof data.credits === "number") {
        reported += data.credits;
        sawReported = true;
      }
      hits = data.places ?? [];
    } catch {
      run.unmatched++;
      continue;
    }

    const picked = pickPlace(hits, lead.companyName, lead.website);
    if (!picked) {
      run.unmatched++;
      // Ingen Google-profil betyder inte att bolaget saknar bransch. Faller
      // tillbaka på namnet — gratis, och bättre än ingenting alls.
      const fallback = tradeFromText(lead.companyName);
      if (fallback) {
        await writeClaims(lead.id, [
          {
            key: "seo.trade",
            valueStr: fallback,
            // Lägre än Googles egen kategori, med flit. Härlett ur ett namn
            // är en svagare uppgift och ska se ut som en.
            confidence: 60,
            strength: 1,
            source: "name",
          },
        ]);
        run.claimsWritten++;
      }
      continue;
    }

    const signals = signalsFromPlace(picked.place, picked.confidence);
    if (signals.length > 0) {
      await writeClaims(lead.id, signals);
      run.claimsWritten += signals.length;
    }
    run.matched++;

    // Fyll TOMMA fält på själva leadet. Aldrig skriva över: det som står i
    // systemet kan vara handrättat, och Google kan ha fel adress.
    const patch: { website?: string; city?: string } = {};
    if (!lead.website && picked.place.website) patch.website = picked.place.website;
    if (!lead.city) {
      const fromGoogle = city ?? cityFromAddress(picked.place.address);
      if (fromGoogle) patch.city = fromGoogle;
    }
    if (Object.keys(patch).length > 0) {
      await db.lead.update({ where: { id: lead.id }, data: patch });
      if (patch.website) run.filledWebsite++;
      if (patch.city) run.filledCity++;
    }
  }

  run.creditsReported = sawReported ? reported : null;
  return run;
}

/**
 * Torrkörning. Räknar kön och kostnaden utan att röra Serper.
 */
export async function lookupDryRun(opts: {
  listId?: string | null;
  limit?: number | null;
  redo?: boolean;
}): Promise<{
  queued: number;
  estimatedCredits: number;
  budget: number;
  withinBudget: number;
  alreadyHaveCategory: number;
  freeFromName: number;
}> {
  const cutoff = new Date(Date.now() - SERPER_TTL_DAYS * 86_400_000);

  const [total, withCategory] = await Promise.all([
    db.lead.count({
      where: {
        retired: false,
        ...(opts.listId ? { lists: { some: { listId: opts.listId } } } : {}),
      },
    }),
    db.lead.count({
      where: {
        retired: false,
        ...(opts.listId ? { lists: { some: { listId: opts.listId } } } : {}),
        dossier: {
          is: { claims: { some: { key: "gmb.category", fetchedAt: { gt: cutoff } } } },
        },
      },
    }),
  ]);

  const queued = opts.redo ? total : total - withCategory;
  const capped = opts.limit ? Math.min(queued, opts.limit) : queued;
  const budget = creditBudget();

  // Hur många som skulle klara sig utan uppslag alls, tack vare att namnet
  // avslöjar yrket. Rent upplysande — de slås ändå upp, eftersom Googles
  // kategori också bär betyg och recensioner som namnet inte kan ge.
  const names = await db.lead.findMany({
    where: {
      retired: false,
      ...(opts.listId ? { lists: { some: { listId: opts.listId } } } : {}),
    },
    select: { companyName: true },
    take: 5000,
  });
  const freeFromName = names.filter((l) => tradeFromText(l.companyName) !== null).length;

  return {
    queued: capped,
    estimatedCredits: capped * CREDITS_PER_LOOKUP,
    budget,
    withinBudget: Math.min(capped, Math.floor(budget / CREDITS_PER_LOOKUP)),
    alreadyHaveCategory: withCategory,
    freeFromName,
  };
}
