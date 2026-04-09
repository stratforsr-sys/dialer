"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function createCallback(
  leadId: string,
  scheduledAt: Date,
  notes?: string
) {
  const user = await requireAuth();

  const callback = await db.callback.create({
    data: {
      leadId,
      scheduledAt,
      notes: notes || null,
      userId: user.id,
    },
  });

  await db.activity.create({
    data: {
      type: "CALLBACK_SET",
      actorId: user.id,
      leadId,
      metadata: JSON.stringify({
        scheduledAt: scheduledAt.toISOString(),
        notes,
      }),
    },
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  return callback;
}

export async function completeCallback(callbackId: string) {
  const user = await requireAuth();

  const callback = await db.callback.update({
    where: { id: callbackId },
    data: { completedAt: new Date() },
    select: { leadId: true },
  });

  await db.activity.create({
    data: {
      type: "CALLBACK_COMPLETED",
      actorId: user.id,
      leadId: callback.leadId,
      metadata: JSON.stringify({ callbackId }),
    },
  });

  revalidatePath(`/leads/${callback.leadId}`);
  revalidatePath("/leads");
}

export async function deleteCallback(callbackId: string) {
  const user = await requireAuth();
  await requireAuth(); // ensure authenticated

  await db.callback.delete({
    where: { id: callbackId, userId: user.id },
  });
}

export async function getUpcomingCallbacks() {
  const user = await requireAuth();

  return db.callback.findMany({
    where: {
      completedAt: null,
      scheduledAt: { gte: new Date() },
      ...(user.role === "SELLER" ? { userId: user.id } : {}),
    },
    include: {
      lead: { select: { id: true, companyName: true } },
      user: { select: { id: true, name: true } },
    },
    orderBy: { scheduledAt: "asc" },
    take: 50,
  });
}

// Returns callbacks due soon (within the next 35 minutes, not yet completed)
// Used by the toast manager to show reminders
export async function getDueCallbacks() {
  const user = await requireAuth();

  const now = new Date();
  const in35min = new Date(now.getTime() + 35 * 60 * 1000);

  return db.callback.findMany({
    where: {
      completedAt: null,
      scheduledAt: { gte: now, lte: in35min },
      userId: user.id,
    },
    include: {
      lead: { select: { id: true, companyName: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });
}

// For admin: all sellers' callbacks
export async function getAllCallbacks() {
  const user = await requireAuth();
  if (user.role !== "ADMIN") throw new Error("Unauthorized");

  return db.callback.findMany({
    where: {
      completedAt: null,
      scheduledAt: { gte: new Date() },
    },
    include: {
      lead: { select: { id: true, companyName: true } },
      user: { select: { id: true, name: true } },
    },
    orderBy: { scheduledAt: "asc" },
    take: 200,
  });
}

// Count pending callbacks for badge
export async function getCallbackCount() {
  const user = await requireAuth();

  return db.callback.count({
    where: {
      completedAt: null,
      scheduledAt: { gte: new Date() },
      userId: user.id,
    },
  });
}
