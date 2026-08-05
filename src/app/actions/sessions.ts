"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { requireSessionOwner } from "@/lib/guard";

export async function startSession() {
  const user = await requireAuth();
  return db.callSession.create({
    data: { userId: user.id },
  });
}

/**
 * Räknarna kommer från klienten och är därför inte att lita på — men sessionen
 * måste åtminstone vara säljarens egen. `updateMany` med userId i WHERE gör
 * ägarkontrollen till en del av skrivningen istället för ett separat anrop.
 */
export async function endSession(
  sessionId: string,
  totalCalls: number,
  totalIdle: number
) {
  const user = await requireAuth();
  return db.callSession.updateMany({
    where: { id: sessionId, userId: user.id },
    data: {
      endedAt: new Date(),
      totalCalls: Math.max(0, Math.trunc(totalCalls)),
      totalIdle: Math.max(0, Math.trunc(totalIdle)),
    },
  });
}

export async function logCallEvent(sessionId: string, idleBefore: number) {
  await requireSessionOwner(sessionId);
  return db.callEvent.create({
    data: {
      sessionId,
      callStartedAt: new Date(),
      idleBefore: Math.max(0, Math.trunc(idleBefore)),
    },
  });
}
