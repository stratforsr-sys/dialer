"use server";

import { prisma } from "@/lib/prisma";
import { getXpReward } from "@/lib/spaced-repetition";

export async function submitReflection(
  userId: string,
  data: {
    sessionId?: string;
    meetingId?: string;
    question1: string;
    question2: string;
    question3: string;
    question4: string;
    question5: string;
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
