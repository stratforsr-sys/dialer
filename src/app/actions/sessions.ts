"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function startSession() {
  const user = await requireAuth();
  return db.callSession.create({
    data: { userId: user.id },
  });
}

export async function endSession(sessionId: string, totalCalls: number, totalIdle: number) {
  await requireAuth();
  return db.callSession.update({
    where: { id: sessionId },
    data: { endedAt: new Date(), totalCalls, totalIdle },
  });
}

export async function logCallEvent(
  sessionId: string,
  idleBefore: number
) {
  return db.callEvent.create({
    data: {
      sessionId,
      callStartedAt: new Date(),
      idleBefore,
    },
  });
}
