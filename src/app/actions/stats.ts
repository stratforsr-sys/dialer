"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

/**
 * Dagsstatistik ur CallAttempt, inte ur aktivitetsloggen.
 *
 * Aktivitetsloggen är en människoläsbar tidslinje med JSON i en textkolumn;
 * CallAttempt är typad och indexerad. Räkning ska ske mot faktatabellen.
 */
export async function getDailyStats(days = 30) {
  const user = await requireAuth();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const sellerFilter = user.role === "SELLER" ? { sellerId: user.id } : {};

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
export async function getConversionRates() {
  const user = await requireAuth();
  const sellerFilter = user.role === "SELLER" ? { sellerId: user.id } : {};

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

export async function getFluffStats(days = 7) {
  const user = await requireAuth();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const sessions = await db.callSession.findMany({
    where: {
      startedAt: { gte: since },
      ...(user.role === "SELLER" ? { userId: user.id } : {}),
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

export async function getPipelineOverview() {
  const user = await requireAuth();
  const ownerFilter = user.role === "SELLER" ? { ownerId: user.id } : {};

  const dealOwnerFilter = user.role === "SELLER" ? { lead: { ownerId: user.id } } : {};

  const stages = await db.pipelineStage.findMany({
    orderBy: { order: "asc" },
    include: {
      _count: { select: { deals: true } },
      deals: {
        where: { status: "OPEN", ...dealOwnerFilter },
        select: { oneTimeValue: true, arrValue: true, valueType: true, probability: true },
      },
    },
  });

  return stages.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    leadCount: s._count.deals,
    totalValue: s.deals.reduce((sum, d) => {
      const v = d.valueType === "ARR" ? (d.arrValue ?? 0) : (d.oneTimeValue ?? 0);
      return sum + v * (d.probability / 100);
    }, 0),
  }));
}
