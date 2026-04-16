"use server";

import { prisma } from "@/lib/prisma";
import { getXpReward } from "@/lib/spaced-repetition";

// ============================================================
// SUBMIT REFLECTION
// ============================================================
export async function submitReflection(
  userId: string,
  data: {
    sessionId?: string;
    meetingId?: string;
    question1: string; // Vilken teknik anvande du medvetet?
    question2: string; // Beskriv svaraste ogonblicket
    question3: string; // Vilken teknik borde du ha anvant?
    question4: string; // Vilka 3 delar kan du forbattra?
    question5: string; // OM [situation], DA gor jag [handling]
  }
) {
  const reflection = await prisma.reflectionEntry.create({
    data: {
      userId,
      sessionId: data.sessionId || null,
      meetingId: data.meetingId || null,
      question1: data.question1,
      question2: data.question2,
      question3: data.question3,
      question4: data.question4,
      question5: data.question5,
    },
  });

  // XP for reflection
  const xp = getXpReward("reflection");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.dailyStreak.upsert({
    where: { userId_date: { userId, date: today } },
    update: { xpEarned: { increment: xp } },
    create: { userId, date: today, xpEarned: xp },
  });

  return { reflectionId: reflection.id, xpEarned: xp };
}

// ============================================================
// GET REFLECTIONS
// ============================================================
export async function getUserReflections(userId: string, limit = 20) {
  return prisma.reflectionEntry.findMany({
    where: { userId },
    include: {
      session: { select: { sessionType: true, date: true } },
      meeting: { select: { meetingType: true, date: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
