import { db } from "@/lib/db";
import type { Signal, SignalContext, SignalProvider } from "./types";
import { websiteProvider } from "./website";
import { pagespeedProvider } from "./pagespeed";
import { rankProvider } from "./rank";

/**
 * Anrikningen.
 *
 * Två nivåer med olika kostnad och olika hastighet:
 *
 *   Nivå 0 — HTTP-kontrollerna. Gratis, snabba, körs på alla leads.
 *   Nivå 1 — PageSpeed. Gratis men långsam (10–30 s per sajt), körs bara på
 *            leads som faktiskt står på tur att ringas.
 *
 * Varje uppgift skrivs som en egen rad med egen källa, egen säkerhet och egen
 * tidsstämpel. En provider som fallerar tar aldrig med sig de andra: hellre
 * ett dossier med två påståenden än inget alls.
 */

export const PROVIDERS: SignalProvider[] = [websiteProvider, pagespeedProvider, rankProvider];

export const TIER0: SignalProvider[] = [websiteProvider];
export const TIER1: SignalProvider[] = [pagespeedProvider, rankProvider];

export interface EnrichResult {
  leadId: string;
  companyName: string;
  claims: number;
  weaknesses: number;
  providers: string[];
  failed: string[];
}

interface Collected {
  ctx: SignalContext;
  signals: Signal[];
  ok: string[];
  failed: string[];
  ttlDays: number;
}

/**
 * Hämtningsfasen. Rör ALDRIG databasen.
 *
 * Separationen är inte kosmetisk: SQLite har en enda skrivare, och Turso
 * håller skrivlåset över nätverket. Kör man hämtning och skrivning i samma
 * parallella loop slåss åtta transaktioner om samma lås tills de får
 * "P2028 Unable to start a transaction in the given time". Hämta brett,
 * skriv smalt.
 */
async function collectSignals(
  lead: { id: string; companyName: string; website: string | null; orgNumber: string | null; address: string | null },
  providers: SignalProvider[]
): Promise<Collected> {
  const ctx: SignalContext = {
    leadId: lead.id,
    companyName: lead.companyName,
    website: lead.website,
    orgNumber: lead.orgNumber,
    address: lead.address,
  };

  const active = providers.filter((p) => p.enabled());
  const settled = await Promise.allSettled(active.map((p) => p.collect(ctx)));

  const signals: Signal[] = [];
  const ok: string[] = [];
  const failed: string[] = [];

  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      signals.push(...r.value);
      ok.push(active[i].name);
    } else {
      failed.push(active[i].name);
    }
  });

  // Kortaste TTL bland de providers som faktiskt kördes styr när dossiern
  // räknas som gammal — annars ser en färsk sajtkontroll ut att göra en
  // månadsgammal rankuppgift aktuell.
  const ttlDays = active.length > 0 ? Math.min(...active.map((p) => p.ttlDays)) : 30;

  return { ctx, signals, ok, failed, ttlDays };
}

export async function enrichLead(
  leadId: string,
  providers: SignalProvider[] = TIER0
): Promise<EnrichResult | null> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { id: true, companyName: true, website: true, orgNumber: true, address: true },
  });
  if (!lead) return null;

  const collected = await collectSignals(lead, providers);
  return persistSignals(lead.companyName, collected);
}

/** Skrivfasen. Anropas alltid i tur och ordning, aldrig parallellt. */
async function persistSignals(
  companyName: string,
  { ctx, signals, ok, failed, ttlDays }: Collected
): Promise<EnrichResult> {
  const leadId = ctx.leadId;

  if (signals.length === 0) {
    await db.leadDossier.upsert({
      where: { leadId },
      create: {
        leadId,
        status: "FAILED",
        fetchedAt: new Date(),
        errorMessage: failed.length ? `Inga svar från: ${failed.join(", ")}` : "Inga signaler",
      },
      update: {
        status: "FAILED",
        fetchedAt: new Date(),
        errorMessage: failed.length ? `Inga svar från: ${failed.join(", ")}` : "Inga signaler",
      },
    });
    return { leadId, companyName, claims: 0, weaknesses: 0, providers: ok, failed };
  }

  const weaknesses = signals.filter((s) => s.weakness).length;
  const avgConfidence = Math.round(
    signals.reduce((n, s) => n + s.confidence, 0) / signals.length
  );

  const now = new Date();
  const staleAfter = new Date(now.getTime() + ttlDays * 86_400_000);

  await db.leadDossier.upsert({
    where: { leadId },
    create: {
      leadId,
      status: failed.length > 0 ? "PARTIAL" : "OK",
      weaknessCount: weaknesses,
      overallConfidence: avgConfidence,
      fetchedAt: now,
      staleAfter,
      errorMessage: failed.length ? `Utan svar: ${failed.join(", ")}` : null,
    },
    update: {
      status: failed.length > 0 ? "PARTIAL" : "OK",
      weaknessCount: weaknesses,
      overallConfidence: avgConfidence,
      fetchedAt: now,
      staleAfter,
      errorMessage: failed.length ? `Utan svar: ${failed.join(", ")}` : null,
    },
  });

  // Uppdatera per nyckel i stället för att tömma och skriva om: en delvis
  // körning ska aldrig radera uppgifter som en annan provider hämtat tidigare.
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

  return { leadId, companyName, claims: signals.length, weaknesses, providers: ok, failed };
}

/**
 * Kör en omgång. Prioriterar leads som snart ska ringas — det är där färsk
 * data är värd något. Att anrika ett lead ingen kommer att ringa är slöseri
 * även när det är gratis, eftersom det kostar tid i fönstret.
 */
export async function enrichBatch(opts: {
  limit?: number;
  tier?: 0 | 1;
  listId?: string | null;
  concurrency?: number;
}): Promise<EnrichResult[]> {
  const limit = Math.min(opts.limit ?? 50, 500);
  const providers = opts.tier === 1 ? [...TIER0, ...TIER1] : TIER0;
  const now = new Date();

  const leads = await db.lead.findMany({
    where: {
      retired: false,
      hasActiveDeal: false,
      ...(opts.listId ? { lists: { some: { listId: opts.listId } } } : {}),
      OR: [
        { dossier: null },
        { dossier: { staleAfter: { lte: now } } },
        { dossier: { status: "PENDING" } },
      ],
    },
    // Leads som står på tur att ringas först.
    orderBy: [{ nextActionAt: "asc" }, { attemptCount: "asc" }],
    take: limit,
    select: { id: true, companyName: true, website: true, orgNumber: true, address: true },
  });

  const results: EnrichResult[] = [];

  // Måttlig parallellitet i HÄMTNINGEN: vi hämtar från främmande servrar och
  // ska inte se ut som en attack. PageSpeed har dessutom en egen kvot.
  const concurrency = Math.min(opts.concurrency ?? (opts.tier === 1 ? 3 : 8), 10);

  for (let i = 0; i < leads.length; i += concurrency) {
    const chunk = leads.slice(i, i + concurrency);

    // Hämta brett …
    const collected = await Promise.all(chunk.map((l) => collectSignals(l, providers)));

    // … skriv smalt. En transaktion i taget mot en databas med en enda
    // skrivare. Parallella skrivningar här ger P2028 och tappar hela satsen.
    for (let j = 0; j < collected.length; j++) {
      results.push(await persistSignals(chunk[j].companyName, collected[j]));
    }
  }

  return results;
}
