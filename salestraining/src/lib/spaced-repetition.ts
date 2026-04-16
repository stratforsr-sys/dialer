/**
 * SM-2 Spaced Repetition Algorithm (modified)
 *
 * Based on the SuperMemo SM-2 algorithm by Piotr Wozniak.
 * Modified to support configurable frequency (daily, every other day, custom).
 *
 * Quality ratings:
 *   0 - Complete blackout, no recall
 *   1 - Incorrect, but recognized the answer
 *   2 - Incorrect, but answer was easy to recall once shown
 *   3 - Correct, but with significant difficulty
 *   4 - Correct, after some hesitation
 *   5 - Correct, with perfect recall
 */

export interface RepetitionState {
  interval: number; // Days until next review
  easeFactor: number; // Ease factor (minimum 1.3)
  repetitions: number; // Number of successful consecutive repetitions
}

export interface ReviewResult {
  quality: 0 | 1 | 2 | 3 | 4 | 5;
}

/**
 * Map a score (0-100) to SM-2 quality (0-5)
 */
export function scoreToQuality(score: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 60) return 3;
  if (score >= 40) return 2;
  if (score >= 20) return 1;
  return 0;
}

/**
 * Calculate next review state based on SM-2 algorithm
 */
export function calculateNextReview(
  current: RepetitionState,
  review: ReviewResult
): RepetitionState {
  const { quality } = review;
  let { interval, easeFactor, repetitions } = current;

  if (quality >= 3) {
    // Correct response
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 3;
    } else {
      interval = Math.round(interval * easeFactor);
    }
    repetitions += 1;
  } else {
    // Incorrect response — reset
    repetitions = 0;
    interval = 1;
  }

  // Update ease factor
  easeFactor =
    easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

  // Ease factor minimum
  if (easeFactor < 1.3) easeFactor = 1.3;

  return { interval, easeFactor, repetitions };
}

/**
 * Get the next review date based on interval and user's frequency preference
 */
export function getNextReviewDate(
  interval: number,
  frequency: "daily" | "everyOtherDay" | "custom",
  customDays?: string[] // e.g. ["mon", "wed", "fri"]
): Date {
  const now = new Date();

  if (frequency === "daily") {
    // Minimum 1 day, use SM-2 interval
    const days = Math.max(1, interval);
    const next = new Date(now);
    next.setDate(next.getDate() + days);
    return next;
  }

  if (frequency === "everyOtherDay") {
    // Minimum 2 days between reviews
    const days = Math.max(2, interval);
    const next = new Date(now);
    next.setDate(next.getDate() + days);
    return next;
  }

  if (frequency === "custom" && customDays && customDays.length > 0) {
    // Find the next date that falls on one of the custom days
    const dayMap: Record<string, number> = {
      sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
    };
    const allowedDays = customDays.map(d => dayMap[d.toLowerCase()]).filter(d => d !== undefined);

    const minDate = new Date(now);
    minDate.setDate(minDate.getDate() + Math.max(1, interval));

    // Find the next allowed day from minDate
    for (let i = 0; i < 14; i++) {
      const candidate = new Date(minDate);
      candidate.setDate(candidate.getDate() + i);
      if (allowedDays.includes(candidate.getDay())) {
        return candidate;
      }
    }

    // Fallback: just use interval
    return minDate;
  }

  // Fallback
  const next = new Date(now);
  next.setDate(next.getDate() + Math.max(1, interval));
  return next;
}

/**
 * Determine skill level based on performance history
 */
export function calculateLevel(
  avgScore: number,
  consecutiveHighScores: number,
  maxDifficulty: string,
  lastRecallWeeks?: number // Weeks since last successful recall
): string {
  // Expert / REFLEX: 86+ on Expert difficulty + recall after 3 weeks
  if (
    avgScore >= 86 &&
    maxDifficulty === "expert" &&
    consecutiveHighScores >= 3 &&
    lastRecallWeeks !== undefined &&
    lastRecallWeeks >= 3
  ) {
    return "expert";
  }

  // Skilled: 76-85 on Hard difficulty consistently
  if (
    avgScore >= 76 &&
    (maxDifficulty === "hard" || maxDifficulty === "expert") &&
    consecutiveHighScores >= 3
  ) {
    return "skilled";
  }

  // Competent: 61-75 on Medium+
  if (
    avgScore >= 61 &&
    (maxDifficulty === "medium" || maxDifficulty === "hard" || maxDifficulty === "expert")
  ) {
    return "competent";
  }

  // Advanced: 41-60
  if (avgScore >= 41) {
    return "advanced";
  }

  // Beginner: 0-40
  return "beginner";
}

/**
 * Get XP for an activity
 */
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

  // Bonus for high scores
  if (score !== undefined && score >= 80) {
    return Math.round(base * 1.5);
  }

  return base;
}
