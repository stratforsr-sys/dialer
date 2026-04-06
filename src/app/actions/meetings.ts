"use server";

import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function bookMeeting(
  leadId: string,
  scheduledAt: Date,
  title?: string,
  notes?: string
) {
  const user = await requireAuth();

  const meeting = await db.meeting.create({
    data: {
      leadId,
      scheduledAt,
      title: title || null,
      notes: notes || null,
      bookedById: user.id,
    },
  });

  await db.activity.create({
    data: {
      type: "MEETING_BOOKED",
      actorId: user.id,
      leadId,
      metadata: JSON.stringify({
        scheduledAt: scheduledAt.toISOString(),
        title,
      }),
    },
  });

  revalidatePath(`/leads/${leadId}`);
  return meeting;
}

export async function updateMeetingOutcome(
  meetingId: string,
  outcome: "SHOW" | "NO_SHOW" | "CANCELLED" | "RESCHEDULED"
) {
  const user = await requireAuth();

  const meeting = await db.meeting.update({
    where: { id: meetingId },
    data: { outcome },
    include: { lead: true },
  });

  const activityType =
    outcome === "SHOW" ? "MEETING_COMPLETED" : "MEETING_NO_SHOW";

  if (outcome === "SHOW" || outcome === "NO_SHOW") {
    await db.activity.create({
      data: {
        type: activityType,
        actorId: user.id,
        leadId: meeting.leadId,
        metadata: JSON.stringify({ meetingId, outcome }),
      },
    });
  }

  revalidatePath(`/leads/${meeting.leadId}`);
  return meeting;
}

export async function getYesterdaysMeetings(userId?: string) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const endOfYesterday = new Date(yesterday);
  endOfYesterday.setHours(23, 59, 59, 999);

  return db.meeting.findMany({
    where: {
      scheduledAt: { gte: yesterday, lte: endOfYesterday },
      outcome: "PENDING",
      ...(userId ? { bookedById: userId } : {}),
    },
    include: {
      lead: { select: { id: true, companyName: true } },
      bookedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });
}

export async function getUpcomingMeetings(leadId?: string) {
  const user = await requireAuth();
  return db.meeting.findMany({
    where: {
      scheduledAt: { gte: new Date() },
      outcome: "PENDING",
      ...(leadId ? { leadId } : {}),
      ...(user.role === "SELLER" ? { bookedById: user.id } : {}),
    },
    include: {
      lead: { select: { id: true, companyName: true } },
      bookedBy: { select: { id: true, name: true } },
    },
    orderBy: { scheduledAt: "asc" },
    take: 20,
  });
}
