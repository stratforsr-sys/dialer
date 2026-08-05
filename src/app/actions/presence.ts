"use server";

import { db } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth";
import type { PresenceStatus } from "@/generated/prisma/client";

/** "2026-08-05" i lokal tid — nyckeln som nollställer dagsräknarna. */
function today(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Säljarens hjärtslag. En rad per säljare, alltid upsert.
 *
 * Räknarna hålls här i stället för att aggregeras fram ur CallAttempt: chefsvyn
 * uppdateras var femtonde sekund och ska aldrig behöva scanna faktatabellen
 * för att rita en siffra. Med 5–10 säljare är det här tio rader totalt.
 */
export async function heartbeat(input: {
  status: PresenceStatus;
  leadId?: string | null;
  companyName?: string | null;
  listId?: string | null;
  listName?: string | null;
  sessionId?: string | null;
  callStartedAt?: Date | null;
  /** Antal samtal sedan förra hjärtslaget. */
  callsDelta?: number;
  soldDelta?: number;
  talkSecDelta?: number;
}) {
  const user = await requireAuth();
  const now = new Date();
  const date = today(now);

  const existing = await db.sellerPresence.findUnique({
    where: { userId: user.id },
    select: { countersDate: true },
  });

  // Nytt datum → räknarna börjar om. Inget nattligt cron-jobb behövs.
  const isNewDay = existing?.countersDate !== date;

  const calls = Math.max(0, Math.trunc(input.callsDelta ?? 0));
  const sold = Math.max(0, Math.trunc(input.soldDelta ?? 0));
  const talkSec = Math.max(0, Math.trunc(input.talkSecDelta ?? 0));

  return db.sellerPresence.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      status: input.status,
      currentLeadId: input.leadId ?? null,
      currentCompany: input.companyName ?? null,
      currentListId: input.listId ?? null,
      currentListName: input.listName ?? null,
      sessionId: input.sessionId ?? null,
      callStartedAt: input.callStartedAt ?? null,
      todayCalls: calls,
      todaySold: sold,
      todayTalkSec: talkSec,
      countersDate: date,
      lastHeartbeat: now,
    },
    update: {
      status: input.status,
      currentLeadId: input.leadId ?? null,
      currentCompany: input.companyName ?? null,
      currentListId: input.listId ?? null,
      currentListName: input.listName ?? null,
      sessionId: input.sessionId ?? null,
      callStartedAt: input.callStartedAt ?? null,
      lastHeartbeat: now,
      countersDate: date,
      todayCalls: isNewDay ? calls : { increment: calls },
      todaySold: isNewDay ? sold : { increment: sold },
      todayTalkSec: isNewDay ? talkSec : { increment: talkSec },
    },
  });
}

export async function goOffline() {
  const user = await requireAuth();
  await db.sellerPresence.updateMany({
    where: { userId: user.id },
    data: {
      status: "OFFLINE",
      currentLeadId: null,
      currentCompany: null,
      callStartedAt: null,
    },
  });
}

/**
 * Golvet. Endast admin.
 *
 * Returnerar insatssiffror — samtalstakt och tid sedan senaste samtal. INTE
 * "vem har inte sålt på tre timmar": vid ett bokat möte per 45–100 samtal är
 * det utfallet det vanligaste även för en bra säljare, alltså brus. Larm på
 * utfall har heller inget stöd i forskningen, medan larm på insats har det.
 */
export async function getFloor() {
  await requireAdmin();
  const now = new Date();
  const date = today(now);

  const [rows, cfg] = await Promise.all([
    db.sellerPresence.findMany({
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { lastHeartbeat: "desc" },
    }),
    db.dialerConfig.findUnique({ where: { id: "singleton" } }),
  ]);

  const targetPerHour = cfg?.targetCallsPerHour ?? 22;
  const idleAlertMin = cfg?.idleAlertMinutes ?? 25;

  return {
    targetPerHour,
    idleAlertMinutes: idleAlertMin,
    sellers: rows.map((r) => {
      // Ett hjärtslag äldre än två minuter betyder stängd flik, inte paus.
      const stale = now.getTime() - r.lastHeartbeat.getTime() > 120_000;
      const counters = r.countersDate === date;
      return {
        userId: r.userId,
        name: r.user.name,
        status: stale ? ("OFFLINE" as PresenceStatus) : r.status,
        currentCompany: stale ? null : r.currentCompany,
        currentListName: stale ? null : r.currentListName,
        callStartedAt: stale ? null : r.callStartedAt,
        todayCalls: counters ? r.todayCalls : 0,
        todaySold: counters ? r.todaySold : 0,
        todayTalkSec: counters ? r.todayTalkSec : 0,
        lastHeartbeat: r.lastHeartbeat,
        minutesSinceHeartbeat: Math.floor(
          (now.getTime() - r.lastHeartbeat.getTime()) / 60_000
        ),
      };
    }),
  };
}
