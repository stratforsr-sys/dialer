/**
 * SM-2 Spaced Repetition Algorithm (modified)
 */

export interface RepetitionState {
  interval: number;
  easeFactor: number;
  repetitions: number;
}

export interface ReviewResult {
  quality: 0 | 1 | 2 | 3 | 4 | 5;
}

export function scoreToQuality(score: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 60) return 3;
  if (score >= 40) return 2;
  if (score >= 20) return 1;
  return 0;
}

export function calculateNextReview(
  current: RepetitionState,
  review: ReviewResult
): RepetitionState {
  const { quality } = review;
  let { interval, easeFactor, repetitions } = current;

  if (quality >= 3) {
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 3;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
  } else {
    repetitions = 0;
    interval = 1;
  }

  easeFactor =
    easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

  if (easeFactor < 1.3) easeFactor = 1.3;

  return { interval, easeFactor, repetitions };
}

export function getNextReviewDate(
  interval: number,
  frequency: "daily" | "everyOtherDay" | "custom",
  customDays?: string[]
): Date {
  const now = new Date();

  if (frequency === "daily") {
    const days = Math.max(1, interval);
    const next = new Date(now);
    next.setDate(next.getDate() + days);
    return next;
  }

  if (frequency === "everyOtherDay") {
    const days = Math.max(2, interval);
    const next = new Date(now);
    next.setDate(next.getDate() + days);
    return next;
  }

  if (frequency === "custom" && customDays && customDays.length > 0) {
    const dayMap: Record<string, number> = {
      sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
    };
    const allowedDays = customDays.map(d => dayMap[d.toLowerCase()]).filter(d => d !== undefined);

    const minDate = new Date(now);
    minDate.setDate(minDate.getDate() + Math.max(1, interval));

    for (let i = 0; i < 14; i++) {
      const candidate = new Date(minDate);
      candidate.setDate(candidate.getDate() + i);
      if (allowedDays.includes(candidate.getDay())) {
        return candidate;
      }
    }

    return minDate;
  }

  const next = new Date(now);
  next.setDate(next.getDate() + Math.max(1, interval));
  return next;
}

export function calculateLevel(
  avgScore: number,
  consecutiveHighScores: number,
  maxDifficulty: string,
  lastRecallWeeks?: number
): string {
  if (
    avgScore >= 86 &&
    maxDifficulty === "expert" &&
    consecutiveHighScores >= 3 &&
    lastRecallWeeks !== undefined &&
    lastRecallWeeks >= 3
  ) {
    return "expert";
  }

  if (
    avgScore >= 76 &&
    (maxDifficulty === "hard" || maxDifficulty === "expert") &&
    consecutiveHighScores >= 3
  ) {
    return "skilled";
  }

  if (
    avgScore >= 61 &&
    (maxDifficulty === "medium" || maxDifficulty === "hard" || maxDifficulty === "expert")
  ) {
    return "competent";
  }

  if (avgScore >= 41) {
    return "advanced";
  }

  return "beginner";
}

export function getXpReward(activityType: string, score?: number): number {
  const baseXp: Record<string, number> = {
    scenario_card: 10,
    recall_test: 5,
    roleplay: 30,
    simulation: 50,
    reflection: 20,
    meeting_analysis: 40,
    level_up: 100,
    streak_bonus: 25,
  };

  const base = baseXp[activityType] || 0;

  if (score !== undefined && score >= 80) {
    return Math.round(base * 1.5);
  }

  return base;
}
