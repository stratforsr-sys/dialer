"use server";

import { prisma } from "@/lib/prisma";

// ============================================================
// GET DASHBOARD STATS
// ============================================================
export async function getDashboardStats(userId: string) {
  // Total XP
  const streaks = await prisma.dailyStreak.findMany({
    where: { userId },
    orderBy: { date: "desc" },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const streakData = streaks as any[];
  const totalXp = streakData.reduce((sum: number, s: any) => sum + s.xpEarned, 0);

  // Current streak
  const currentStreak = calculateCurrentStreak(streakData.map((s: any) => s.date));

  // Techniques by level
  const techniques = await prisma.technique.findMany({
    where: { module: { userId } },
    include: { skillProgress: true },
  });

  const levelCounts: Record<string, number> = {
    beginner: 0,
    advanced: 0,
    competent: 0,
    skilled: 0,
    expert: 0,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of techniques as any[]) {
    const level = t.skillProgress?.level || "beginner";
    levelCounts[level] = (levelCounts[level] || 0) + 1;
  }

  // Total practice sessions
  const sessionCount = await prisma.practiceSession.count({
    where: { userId },
  });

  // Total practice time (minutes)
  const sessions = await prisma.practiceSession.findMany({
    where: { userId },
    select: { duration: true },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionsData = sessions as any[];
  const totalMinutes = Math.round(
    sessionsData.reduce((sum: number, s: any) => sum + s.duration, 0) / 60
  );

  // Modules count
  const moduleCount = await prisma.module.count({ where: { userId } });

  // Meetings analyzed
  const meetingCount = await prisma.realMeetingAnalysis.count({
    where: { userId },
  });

  return {
    totalXp,
    currentStreak,
    longestStreak: calculateLongestStreak(streakData.map((s: any) => s.date)),
    levelCounts,
    totalTechniques: techniques.length,
    sessionCount,
    totalMinutes,
    moduleCount,
    meetingCount,
  };
}

// ============================================================
// GET ACHIEVEMENTS
// ============================================================
export async function getUserAchievements(userId: string) {
  return prisma.achievement.findMany({
    where: { userId },
    orderBy: { unlockedAt: "desc" },
  });
}

// ============================================================
// CHECK AND UNLOCK ACHIEVEMENTS
// ============================================================
export async function checkAchievements(userId: string) {
  const stats = await getDashboardStats(userId);
  const existing = await prisma.achievement.findMany({
    where: { userId },
    select: { name: true },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingNames = new Set((existing as any[]).map((a: any) => a.name));
  const newAchievements: { name: string; description: string; icon: string }[] = [];

  // Streak achievements
  if (stats.currentStreak >= 7 && !existingNames.has("7-dagars streak")) {
    newAchievements.push({
      name: "7-dagars streak",
      description: "Tranat 7 dagar i rad!",
      icon: "flame",
    });
  }
  if (stats.currentStreak >= 30 && !existingNames.has("30-dagars streak")) {
    newAchievements.push({
      name: "30-dagars streak",
      description: "Tranat 30 dagar i rad! Otroligt!",
      icon: "fire",
    });
  }

  // Level achievements
  if (stats.levelCounts.competent >= 1 && !existingNames.has("Forsta Kompetent")) {
    newAchievements.push({
      name: "Forsta Kompetent",
      description: "Din forsta teknik pa Kompetent-niva!",
      icon: "star",
    });
  }
  if (stats.levelCounts.skilled >= 5 && !existingNames.has("5 Skickliga tekniker")) {
    newAchievements.push({
      name: "5 Skickliga tekniker",
      description: "5 tekniker pa Skicklig-niva!",
      icon: "trophy",
    });
  }
  if (stats.levelCounts.expert >= 1 && !existingNames.has("Forsta REFLEX")) {
    newAchievements.push({
      name: "Forsta REFLEX",
      description: "Din forsta teknik sitter som en reflex!",
      icon: "lightning",
    });
  }

  // Session achievements
  if (stats.sessionCount >= 10 && !existingNames.has("10 sessioner")) {
    newAchievements.push({
      name: "10 sessioner",
      description: "Genomfort 10 traningssessioner!",
      icon: "target",
    });
  }
  if (stats.sessionCount >= 50 && !existingNames.has("50 sessioner")) {
    newAchievements.push({
      name: "50 sessioner",
      description: "50 sessioner! Du ar pa vag mot mastery.",
      icon: "medal",
    });
  }

  // XP achievements
  if (stats.totalXp >= 1000 && !existingNames.has("1000 XP")) {
    newAchievements.push({
      name: "1000 XP",
      description: "Samlat 1000 XP!",
      icon: "gem",
    });
  }

  // Meeting analysis
  if (stats.meetingCount >= 1 && !existingNames.has("Forsta motesanalys")) {
    newAchievements.push({
      name: "Forsta motesanalys",
      description: "Analyserat ditt forsta riktiga mote!",
      icon: "magnifier",
    });
  }

  // Save new achievements
  for (const achievement of newAchievements) {
    await prisma.achievement.create({
      data: {
        userId,
        ...achievement,
      },
    });
  }

  return newAchievements;
}

// ============================================================
// HELPERS
// ============================================================
function calculateCurrentStreak(dates: Date[]): number {
  if (dates.length === 0) return 0;

  const sorted = dates
    .map(d => {
      const date = new Date(d);
      date.setHours(0, 0, 0, 0);
      return date.getTime();
    })
    .sort((a, b) => b - a); // Most recent first

  const unique = [...new Set(sorted)];

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayMs = yesterday.getTime();

  // Must have practiced today or yesterday
  if (unique[0] !== todayMs && unique[0] !== yesterdayMs) {
    return 0;
  }

  let streak = 1;
  for (let i = 1; i < unique.length; i++) {
    const diff = unique[i - 1] - unique[i];
    const oneDay = 24 * 60 * 60 * 1000;
    if (diff === oneDay) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

function calculateLongestStreak(dates: Date[]): number {
  if (dates.length === 0) return 0;

  const sorted = dates
    .map(d => {
      const date = new Date(d);
      date.setHours(0, 0, 0, 0);
      return date.getTime();
    })
    .sort((a, b) => a - b);

  const unique = [...new Set(sorted)];

  let longest = 1;
  let current = 1;

  for (let i = 1; i < unique.length; i++) {
    const diff = unique[i] - unique[i - 1];
    const oneDay = 24 * 60 * 60 * 1000;
    if (diff === oneDay) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  return longest;
}
