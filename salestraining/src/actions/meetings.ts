"use server";

import { prisma } from "@/lib/prisma";
import { analyzeMeetingTranscript } from "@/lib/gemini";
import { buildKnowledgeBase } from "@/lib/knowledge-base";
import { getXpReward } from "@/lib/spaced-repetition";

// ============================================================
// ANALYZE REAL MEETING TRANSCRIPT
// ============================================================
export async function analyzeRealMeeting(
  userId: string,
  meetingType: string,
  transcript: string,
  date?: Date
) {
  const knowledgeBase = await buildKnowledgeBase(userId);

  // Analyze with Gemini
  const analysis = await analyzeMeetingTranscript(transcript, meetingType, knowledgeBase);

  // Save meeting analysis
  const meeting = await prisma.realMeetingAnalysis.create({
    data: {
      userId,
      meetingType,
      transcript,
      date: date || new Date(),
      summary: analysis.summary,
      talkRatio: analysis.talkRatio,
      questionsAsked: analysis.questionsAsked,
      longestMonologue: parseInt(analysis.longestMonologue) || null,
      techniqueHits: JSON.stringify(analysis.techniqueHits),
      techniqueMisses: JSON.stringify(analysis.techniqueMisses),
    },
  });

  // Save timestamped feedback items
  for (const hit of analysis.techniqueHits) {
    await prisma.meetingFeedbackItem.create({
      data: {
        meetingId: meeting.id,
        timestamp: hit.timestamp,
        type: "technique_used",
        techniqueName: hit.techniqueName,
        whatHappened: hit.comment,
        quote: hit.quote,
      },
    });
  }

  for (const miss of analysis.techniqueMisses) {
    await prisma.meetingFeedbackItem.create({
      data: {
        meetingId: meeting.id,
        timestamp: miss.timestamp,
        type: "missed_opportunity",
        techniqueName: miss.techniqueName,
        whatHappened: miss.whatHappened,
        suggestion: miss.suggestion,
        quote: miss.idealResponse,
      },
    });
  }

  // Generate exercises from missed opportunities
  for (const exercise of analysis.generatedExercises) {
    await prisma.generatedExercise.create({
      data: {
        meetingId: meeting.id,
        exerciseType: exercise.type,
        prompt: exercise.prompt,
        techniqueName: exercise.techniqueName,
      },
    });
  }

  // XP for analyzing a meeting
  const xp = getXpReward("meeting_analysis");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.dailyStreak.upsert({
    where: { userId_date: { userId, date: today } },
    update: { xpEarned: { increment: xp } },
    create: { userId, date: today, xpEarned: xp },
  });

  return {
    id: meeting.id,
    meetingId: meeting.id,
    summary: analysis.summary,
    talkRatio: analysis.talkRatio,
    questionsAsked: analysis.questionsAsked,
    techniqueHits: analysis.techniqueHits.length,
    techniqueMisses: analysis.techniqueMisses.length,
    exercisesGenerated: analysis.generatedExercises.length,
    bbbtuuiccCoverage: analysis.bbbtuuiccCoverage,
    xpEarned: xp,
  };
}

// ============================================================
// GET MEETING ANALYSIS WITH ALL DETAILS
// ============================================================
export async function getMeetingAnalysis(meetingId: string) {
  return prisma.realMeetingAnalysis.findUnique({
    where: { id: meetingId },
    include: {
      feedbackItems: { orderBy: { timestamp: "asc" } },
      generatedExercises: true,
      reflection: true,
    },
  });
}

// ============================================================
// GET ALL MEETINGS
// ============================================================
export async function getUserMeetings(userId: string) {
  return prisma.realMeetingAnalysis.findMany({
    where: { userId },
    include: {
      _count: {
        select: {
          feedbackItems: true,
          generatedExercises: true,
        },
      },
    },
    orderBy: { date: "desc" },
  });
}
