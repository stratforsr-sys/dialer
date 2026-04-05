"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function getDailyStats(days = 30) {
  const user = await requireAuth();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const actorFilter = user.role === "SELLER" ? { actorId: user.id } : {};

  const activities = await db.activity.findMany({
    where: {
      timestamp: { gte: since },
      type: { in: ["CALL", "CALL_NO_ANSWER", "MEETING_BOOKED", "STAGE_CHANGE"] },
      ...actorFilter,
    },
    select: { type: true, timestamp: true },
    orderBy: { timestamp: "asc" },
  });

  // Aggregate by day
  const byDay = new Map<string, { calls: number; meetings: number; stageChanges: number }>();

  for (const a of activities) {
    const day = new Date(a.timestamp).toISOString().slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, { calls: 0, meetings: 0, stageChanges: 0 });
    const d = byDay.get(day)!;
    if (a.type === "CALL" || a.type === "CALL_NO_ANSWER") d.calls++;
    if (a.type === "MEETING_BOOKED") d.meetings++;
    if (a.type === "STAGE_CHANGE") d.stageChanges++;
  }

  // Fill in missing days
  const result: { date: string; calls: number; meetings: number; stageChanges: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, ...(byDay.get(key) ?? { calls: 0, meetings: 0, stageChanges: 0 }) });
  }

  return result;
}

export async function getConversionRates() {
  const user = await requireAuth();
  const actorFilter = user.role === "SELLER" ? { actorId: user.id } : {};

  const [totalCalls, totalMeetings, totalWon, totalLost] = await Promise.all([
    db.activity.count({ where: { ...actorFilter, type: { in: ["CALL", "CALL_NO_ANSWER"] } } }),
    db.activity.count({ where: { ...actorFilter, type: "MEETING_BOOKED" } }),
    db.lead.count({ where: { ...(user.role === "SELLER" ? { ownerId: user.id } : {}), stage: { isWon: true } } }),
    db.lead.count({ where: { ...(user.role === "SELLER" ? { ownerId: user.id } : {}), stage: { isLost: true } } }),
  ]);

  return {
    totalCalls,
    totalMeetings,
    totalWon,
    totalLost,
    callToMeeting: totalCalls > 0 ? ((totalMeetings / totalCalls) * 100).toFixed(1) : "0",
    meetingToWon: totalMeetings > 0 ? ((totalWon / totalMeetings) * 100).toFixed(1) : "0",
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
      const [callCount, meetingCount, sessions] = await Promise.all([
        db.activity.count({
          where: { actorId: seller.id, type: { in: ["CALL", "CALL_NO_ANSWER"] }, timestamp: { gte: since } },
        }),
        db.activity.count({
          where: { actorId: seller.id, type: "MEETING_BOOKED", timestamp: { gte: since } },
        }),
        db.callSession.findMany({
          where: { userId: seller.id, startedAt: { gte: since } },
          select: { totalCalls: true, totalIdle: true },
        }),
      ]);

      const totalIdleSecs = sessions.reduce((s, sess) => s + sess.totalIdle, 0);
      const sessionCalls = sessions.reduce((s, sess) => s + sess.totalCalls, 0);
      const avgIdlePerCall = sessionCalls > 0 ? Math.round(totalIdleSecs / sessionCalls) : 0;
      const convRate = callCount > 0 ? ((meetingCount / callCount) * 100).toFixed(1) : "0";

      return {
        id: seller.id,
        name: seller.name,
        calls: callCount,
        meetings: meetingCount,
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

  const stages = await db.pipelineStage.findMany({
    orderBy: { order: "asc" },
    include: {
      _count: { select: { leads: true } },
      leads: {
        where: ownerFilter,
        select: {
          deals: { where: { status: "WON" }, select: { value: true } },
        },
      },
    },
  });

  return stages.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    leadCount: s._count.leads,
    totalValue: s.leads.reduce(
      (sum, l) => sum + l.deals.reduce((ds, d) => ds + (d.value ?? 0), 0),
      0
    ),
  }));
}
