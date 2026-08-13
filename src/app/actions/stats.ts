"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/**
 * Vems siffror frågan gäller. Returnerar ett användar-id, eller null för
 * "hela golvet".
 *
 * En SÄLJARE får alltid sina egna, oavsett vad klienten skickar — parametern
 * ignoreras helt för dem. Att den ignoreras i stället för att ge ett fel är
 * medvetet: en manipulerad länk ska inte avslöja att någon annan finns.
 *
 * Regeln ligger här och inte utspridd i varje funktion, så att en ny
 * statistikfunktion inte kan läcka allas siffror genom att glömma villkoret.
 */
function statsScope(user: { id: string; role: string }, sellerId?: string): string | null {
  if (user.role !== "ADMIN") return user.id;
  return sellerId && sellerId !== "all" ? sellerId : null;
}

/**
 * Dagsstatistik ur CallAttempt, inte ur aktivitetsloggen.
 *
 * Aktivitetsloggen är en människoläsbar tidslinje med JSON i en textkolumn;
 * CallAttempt är typad och indexerad. Räkning ska ske mot faktatabellen.
 */
export async function getDailyStats(days = 30, sellerId?: string) {
  const user = await requireAuth();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const who = statsScope(user, sellerId);
  const sellerFilter = who ? { sellerId: who } : {};

  const attempts = await db.callAttempt.findMany({
    where: { startedAt: { gte: since }, ...sellerFilter },
    select: { startedAt: true, result: true, outcome: true },
    orderBy: { startedAt: "asc" },
  });

  const byDay = new Map<string, { calls: number; connected: number; sold: number }>();

  for (const a of attempts) {
    const day = new Date(a.startedAt).toISOString().slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, { calls: 0, connected: 0, sold: 0 });
    const d = byDay.get(day)!;
    d.calls++;
    if (a.result === "CONNECTED_DM" || a.result === "CONNECTED_GATEKEEPER") d.connected++;
    if (a.outcome === "SOLD") d.sold++;
  }

  const result: { date: string; calls: number; connected: number; sold: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, ...(byDay.get(key) ?? { calls: 0, connected: 0, sold: 0 }) });
  }

  return result;
}

/**
 * Nyckeltalen för one call close.
 *
 * Svarsfrekvensen räknas mot samtal där någon faktiskt svarade — röstbrevlåda
 * räknas inte som ett svar. Det är hela anledningen till att result och
 * outcome är två fält: med ett enda hopslaget fält går den här nämnaren inte
 * att bilda.
 */
export async function getConversionRates(sellerId?: string) {
  const user = await requireAuth();
  const who = statsScope(user, sellerId);
  const sellerFilter = who ? { sellerId: who } : {};

  const [totalCalls, connected, reachedDm, totalSold, callbacks] = await Promise.all([
    db.callAttempt.count({ where: sellerFilter }),
    db.callAttempt.count({
      where: { ...sellerFilter, result: { in: ["CONNECTED_DM", "CONNECTED_GATEKEEPER"] } },
    }),
    db.callAttempt.count({ where: { ...sellerFilter, result: "CONNECTED_DM" } }),
    db.callAttempt.count({ where: { ...sellerFilter, outcome: "SOLD" } }),
    db.callAttempt.count({ where: { ...sellerFilter, outcome: "CALLBACK_BOOKED" } }),
  ]);

  const pct = (a: number, b: number) => (b > 0 ? ((a / b) * 100).toFixed(1) : "0");

  return {
    totalCalls,
    connected,
    reachedDm,
    totalSold,
    callbacks,
    connectRate: pct(connected, totalCalls),
    dmRate: pct(reachedDm, totalCalls),
    closeRate: pct(totalSold, totalCalls),
    dmToClose: pct(totalSold, reachedDm),
  };
}

export async function getFluffStats(days = 7, sellerId?: string) {
  const user = await requireAuth();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const who = statsScope(user, sellerId);

  const sessions = await db.callSession.findMany({
    where: {
      startedAt: { gte: since },
      ...(who ? { userId: who } : {}),
    },
    include: {
      user: { select: { name: true } },
    },
    orderBy: { startedAt: "desc" },
  });

  const totalCalls = sessions.reduce((s, sess) => s + sess.totalCalls, 0);
  const totalIdle = sessions.reduce((s, sess) => s + sess.totalIdle, 0);
  const avgIdlePerCall = totalCalls > 0 ? Math.round(totalIdle / totalCalls) : 0;

  return {
    sessions: sessions.length,
    totalCalls,
    totalIdleSeconds: totalIdle,
    avgIdlePerCall,
  };
}

/**
 * Den inloggades egen statistik, oavsett roll.
 *
 * Skiljer sig från getDailyStats på att den ALLTID filtrerar på den egna
 * sellerId — även för admin. På inställningssidan är det den egna insatsen
 * som är frågan; hela golvets siffror hör hemma under Statistik.
 */
export async function getOwnSummary(days = 30) {
  const user = await requireAuth();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const [attempts, sessions] = await Promise.all([
    db.callAttempt.findMany({
      where: { sellerId: user.id, startedAt: { gte: since } },
      select: { result: true, outcome: true },
    }),
    db.callSession.findMany({
      where: { userId: user.id, startedAt: { gte: since } },
      select: { totalCalls: true, totalIdle: true },
    }),
  ]);

  const calls = attempts.length;
  const connected = attempts.filter(
    (a) => a.result === "CONNECTED_DM" || a.result === "CONNECTED_GATEKEEPER"
  ).length;
  const sold = attempts.filter((a) => a.outcome === "SOLD").length;

  const idleSecs = sessions.reduce((s, x) => s + x.totalIdle, 0);
  const sessionCalls = sessions.reduce((s, x) => s + x.totalCalls, 0);

  return {
    days,
    calls,
    connected,
    sold,
    // Andelar räknas bara när nämnaren finns. Ett nollsamtalspass ska visa
    // ett streck, inte 0 % — de betyder inte samma sak.
    connectRate: calls > 0 ? ((connected / calls) * 100).toFixed(1) : null,
    convRate: calls > 0 ? ((sold / calls) * 100).toFixed(1) : null,
    avgIdlePerCall: sessionCalls > 0 ? Math.round(idleSecs / sessionCalls) : null,
    callsPerDay: Math.round(calls / Math.max(days, 1)),
  };
}

export async function getSellerStats(days = 30) {
  const user = await requireAuth();
  if (user.role !== "ADMIN") return [];

  const since = new Date();
  since.setDate(since.getDate() - days);

  const sellers = await db.user.findMany({
    where: { role: "SELLER" },
    select: { id: true, name: true },
  });

  const results = await Promise.all(
    sellers.map(async (seller) => {
      const [callCount, soldCount, sessions] = await Promise.all([
        db.callAttempt.count({ where: { sellerId: seller.id, startedAt: { gte: since } } }),
        db.callAttempt.count({
          where: { sellerId: seller.id, outcome: "SOLD", startedAt: { gte: since } },
        }),
        db.callSession.findMany({
          where: { userId: seller.id, startedAt: { gte: since } },
          select: { totalCalls: true, totalIdle: true },
        }),
      ]);

      const totalIdleSecs = sessions.reduce((s, sess) => s + sess.totalIdle, 0);
      const sessionCalls = sessions.reduce((s, sess) => s + sess.totalCalls, 0);
      const avgIdlePerCall = sessionCalls > 0 ? Math.round(totalIdleSecs / sessionCalls) : 0;
      const convRate = callCount > 0 ? ((soldCount / callCount) * 100).toFixed(1) : "0";

      return {
        id: seller.id,
        name: seller.name,
        calls: callCount,
        sold: soldCount,
        convRate,
        avgIdlePerCall,
        totalIdleMins: Math.round(totalIdleSecs / 60),
        callsPerDay: Math.round(callCount / Math.max(days, 1)),
      };
    })
  );

  return results.sort((a, b) => b.calls - a.calls);
}

/**
 * Vad som faktiskt sålts.
 *
 * Ersätter den viktade pipelineöversikten. Det fanns ingen prognos att räkna:
 * en affär i det här systemet är redan gjord när raden skapas, och att
 * multiplicera ett stängt avslut med en sannolikhet gav ett tal som inte
 * betydde någonting.
 *
 * Engångsbelopp och månadsbelopp summeras var för sig och slås aldrig ihop.
 * 50 000 kr i engångsintäkt och 50 000 kr i månadsintäkt är inte samma sak,
 * och en enda totalsumma hade dolt vilket av dem som växte.
 */
export async function getDealsOverview(sellerId?: string, days = 90) {
  const user = await requireAuth();
  const who = statsScope(user, sellerId);

  const since = new Date();
  since.setDate(since.getDate() - days);

  // Vem som gjorde affären, inte vem som råkar äga leadet just nu —
  // `Lead.ownerId` byter hand vid varje disposition.
  const deals = await db.deal.findMany({
    where: {
      closedAt: { gte: since },
      ...(who ? { createdById: who } : {}),
    },
    orderBy: { closedAt: "desc" },
    select: {
      id: true,
      title: true,
      value: true,
      valueType: true,
      status: true,
      closedAt: true,
      contactName: true,
      lead: { select: { id: true, companyName: true } },
      createdBy: { select: { name: true } },
    },
  });

  const won = deals.filter((d) => d.status === "WON");

  return {
    days,
    count: won.length,
    cancelled: deals.length - won.length,
    oneTimeTotal: won.filter((d) => d.valueType === "ONE_TIME").reduce((s, d) => s + (d.value ?? 0), 0),
    monthlyTotal: won.filter((d) => d.valueType === "MONTHLY").reduce((s, d) => s + (d.value ?? 0), 0),
    recent: deals.slice(0, 10).map((d) => ({
      id: d.id,
      leadId: d.lead.id,
      companyName: d.lead.companyName,
      contactName: d.contactName,
      value: d.value,
      valueType: d.valueType,
      status: d.status,
      closedAt: d.closedAt,
      seller: d.createdBy.name,
    })),
  };
}

export type DealsOverview = Awaited<ReturnType<typeof getDealsOverview>>;
