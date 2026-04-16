"use server";

import { prisma } from "@/lib/prisma";
import { generateScenario, evaluateResponse, type TechniqueContext } from "@/lib/gemini";
import { buildKnowledgeBase } from "@/lib/knowledge-base";
import {
  scoreToQuality,
  calculateNextReview,
  getNextReviewDate,
  calculateLevel,
  getXpReward,
} from "@/lib/spaced-repetition";

// ============================================================
// START PRACTICE SESSION
// ============================================================
export async function startPracticeSession(
  userId: string,
  sessionType: string = "mixed"
) {
  const session = await prisma.practiceSession.create({
    data: {
      userId,
      sessionType,
      date: new Date(),
    },
  });

  return { id: session.id, sessionId: session.id };
}

// ============================================================
// GENERATE SCENARIO CARD
// ============================================================
export async function generateScenarioCard(
  userId: string,
  techniqueId?: string,
  difficulty: string = "medium"
) {
  let technique;

  if (techniqueId) {
    technique = await prisma.technique.findUnique({
      where: { id: techniqueId },
      include: { ifThenPatterns: true },
    });
  } else {
    // Auto-pick: weakest technique or random if no progress
    const techniques = await prisma.technique.findMany({
      where: { module: { userId } },
      include: { skillProgress: true, ifThenPatterns: true },
    });
    if (techniques.length === 0) throw new Error("No techniques found");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    techniques.sort((a: any, b: any) => {
      const aReps = a.skillProgress?.totalReps || 0;
      const bReps = b.skillProgress?.totalReps || 0;
      if (aReps === 0 && bReps > 0) return -1;
      if (bReps === 0 && aReps > 0) return 1;
      return (a.skillProgress?.avgScore || 0) - (b.skillProgress?.avgScore || 0);
    });

    technique = techniques[0];
  }

  if (!technique) throw new Error("Technique not found");

  const knowledgeBase = await buildKnowledgeBase(userId);

  const techContext: TechniqueContext = {
    name: technique.name,
    description: technique.description,
    whenToUse: technique.whenToUse,
    howToUse: technique.howToUse,
  };

  const scenario = await generateScenario(techContext, difficulty, knowledgeBase);

  return { scenario, techniqueId: technique.id, techniqueName: technique.name };
}

// ============================================================
// SUBMIT SCENARIO ANSWER
// ============================================================
export async function submitScenarioAnswer(
  userId: string,
  sessionId: string,
  techniqueId: string,
  scenario: string,
  userResponse: string,
  difficulty: string
) {
  const technique = await prisma.technique.findUnique({
    where: { id: techniqueId },
  });

  if (!technique) throw new Error("Technique not found");

  const knowledgeBase = await buildKnowledgeBase(userId);

  const techContext: TechniqueContext = {
    name: technique.name,
    description: technique.description,
    whenToUse: technique.whenToUse,
    howToUse: technique.howToUse,
  };

  // Evaluate with AI
  const evaluation = await evaluateResponse(
    scenario,
    userResponse,
    techContext,
    knowledgeBase,
    difficulty
  );

  const xp = getXpReward("scenario_card", evaluation.score);

  // Save exercise attempt
  await prisma.exerciseAttempt.create({
    data: {
      sessionId,
      techniqueId,
      exerciseType: "scenario_card",
      difficulty,
      prompt: scenario,
      userResponse,
      aiEvaluation: JSON.stringify(evaluation),
      score: evaluation.score,
      xpEarned: xp,
    },
  });

  // Update skill progress
  await updateSkillProgress(techniqueId, evaluation.score, difficulty, xp);

  // Update repetition card
  await updateRepetitionCard(techniqueId, evaluation.score, userId);

  // Update session XP
  await prisma.practiceSession.update({
    where: { id: sessionId },
    data: { totalXp: { increment: xp } },
  });

  // Update daily streak
  await updateDailyStreak(userId, xp);

  return { evaluation, score: evaluation.score, xpEarned: xp };
}

// ============================================================
// SUBMIT RECALL TEST
// ============================================================
export async function submitRecallTest(
  userId: string,
  sessionId: string,
  techniqueId: string,
  prompt: string,
  userResponse: string,
  selfRating: "easy" | "medium" | "hard"
) {
  const qualityMap = { easy: 5, medium: 3, hard: 1 } as const;
  const quality = qualityMap[selfRating];
  const score = selfRating === "easy" ? 90 : selfRating === "medium" ? 60 : 30;

  const xp = getXpReward("recall_test", score);

  // Save attempt
  await prisma.exerciseAttempt.create({
    data: {
      sessionId,
      techniqueId,
      exerciseType: "recall_test",
      difficulty: "recall",
      prompt,
      userResponse,
      aiEvaluation: JSON.stringify({ selfRating, quality }),
      score,
      xpEarned: xp,
    },
  });

  // Update repetition card with self-rating
  const card = await prisma.repetitionCard.findUnique({
    where: { techniqueId },
  });

  if (card) {
    const nextState = calculateNextReview(
      { interval: card.interval, easeFactor: card.easeFactor, repetitions: card.repetitions },
      { quality: quality as 0 | 1 | 2 | 3 | 4 | 5 }
    );

    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    const frequency = (settings?.repetitionFrequency || "daily") as "daily" | "everyOtherDay" | "custom";
    const customDays = settings?.customSchedule ? JSON.parse(settings.customSchedule) : undefined;

    const nextReview = getNextReviewDate(nextState.interval, frequency, customDays);

    await prisma.repetitionCard.update({
      where: { id: card.id },
      data: {
        interval: nextState.interval,
        easeFactor: nextState.easeFactor,
        repetitions: nextState.repetitions,
        nextReviewAt: nextReview,
        lastReviewedAt: new Date(),
      },
    });
  }

  // Update session XP
  await prisma.practiceSession.update({
    where: { id: sessionId },
    data: { totalXp: { increment: xp } },
  });

  await updateDailyStreak(userId, xp);

  return { xpEarned: xp, score };
}

// ============================================================
// COMPLETE SESSION
// ============================================================
export async function completeSession(sessionId: string, durationSeconds: number) {
  return prisma.practiceSession.update({
    where: { id: sessionId },
    data: { duration: durationSeconds },
  });
}

// ============================================================
// HELPERS
// ============================================================
async function updateSkillProgress(
  techniqueId: string,
  score: number,
  difficulty: string,
  xp: number
) {
  const progress = await prisma.skillProgress.findUnique({
    where: { techniqueId },
  });

  if (!progress) return;

  const newTotalReps = progress.totalReps + 1;
  const newAvgScore =
    (progress.avgScore * progress.totalReps + score) / newTotalReps;
  const newBestScore = Math.max(progress.bestScore, score);
  const newConsecutive = score >= 76 ? progress.consecutiveHighScores + 1 : 0;

  const newLevel = calculateLevel(newAvgScore, newConsecutive, difficulty);

  const leveledUp = newLevel !== progress.level;
  const levelXp = leveledUp ? getXpReward("level_up") : 0;

  await prisma.skillProgress.update({
    where: { techniqueId },
    data: {
      totalReps: newTotalReps,
      avgScore: Math.round(newAvgScore * 10) / 10,
      bestScore: newBestScore,
      lastScore: score,
      consecutiveHighScores: newConsecutive,
      level: newLevel,
      totalXp: { increment: xp + levelXp },
      lastPracticedAt: new Date(),
    },
  });

  return { leveledUp, newLevel };
}

async function updateRepetitionCard(
  techniqueId: string,
  score: number,
  userId: string
) {
  const card = await prisma.repetitionCard.findUnique({
    where: { techniqueId },
  });

  if (!card) return;

  const quality = scoreToQuality(score);
  const nextState = calculateNextReview(
    { interval: card.interval, easeFactor: card.easeFactor, repetitions: card.repetitions },
    { quality }
  );

  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const frequency = (settings?.repetitionFrequency || "daily") as "daily" | "everyOtherDay" | "custom";
  const customDays = settings?.customSchedule ? JSON.parse(settings.customSchedule) : undefined;

  const nextReview = getNextReviewDate(nextState.interval, frequency, customDays);

  await prisma.repetitionCard.update({
    where: { id: card.id },
    data: {
      interval: nextState.interval,
      easeFactor: nextState.easeFactor,
      repetitions: nextState.repetitions,
      nextReviewAt: nextReview,
      lastReviewedAt: new Date(),
    },
  });
}

async function updateDailyStreak(userId: string, xpEarned: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.dailyStreak.upsert({
    where: { userId_date: { userId, date: today } },
    update: {
      xpEarned: { increment: xpEarned },
    },
    create: {
      userId,
      date: today,
      xpEarned,
    },
  });
}
