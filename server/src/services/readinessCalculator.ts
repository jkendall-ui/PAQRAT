/**
 * Readiness Score Calculator for PA Exam Prep.
 *
 * Calculates a 0–100 readiness score from a weighted average of
 * Elo scores across NCCPA categories, optionally adjusted by
 * exam proximity factor.
 *
 * Elo range mapping: 400 (min) → 0, 1400 (max) → 100
 * Formula: ((eloScore - 400) / (1400 - 400)) * 100, clamped to 0–100
 *
 * Exam proximity factors:
 *   - More than 90 days away: 1.0 (no adjustment)
 *   - 30–90 days away: 0.95 (slight penalty)
 *   - Less than 30 days away: 0.9 (stronger penalty)
 */

const ELO_MIN = 400;
const ELO_MAX = 1400;
const ELO_RANGE = ELO_MAX - ELO_MIN;

export interface TopicScoreInput {
  categoryId: string;
  eloScore: number;
}

/**
 * Map an Elo score to the 0–100 readiness scale, clamped.
 */
function eloToReadiness(eloScore: number): number {
  const raw = ((eloScore - ELO_MIN) / ELO_RANGE) * 100;
  return Math.max(0, Math.min(100, raw));
}

/**
 * Get the exam proximity factor based on days until exam.
 *
 * @param examDate - The target exam date
 * @returns A multiplier between 0.9 and 1.0
 */
function getExamProximityFactor(examDate: Date): number {
  const now = new Date();
  const diffMs = examDate.getTime() - now.getTime();
  const daysUntilExam = diffMs / (1000 * 60 * 60 * 24);

  if (daysUntilExam >= 90) return 1.0;
  if (daysUntilExam >= 30) return 0.95;
  return 0.9;
}

/**
 * Calculate the 0–100 readiness score.
 *
 * Computes a weighted average of Elo scores mapped to 0–100,
 * using NCCPA blueprint category weights. If weights don't cover
 * all categories, unweighted categories share equal weight from
 * the remaining weight budget.
 *
 * @param topicScores - Array of topic scores with categoryId and eloScore
 * @param categoryWeights - Record mapping categoryId to weight (should sum to ~1.0)
 * @param examDate - Optional target exam date for proximity adjustment
 * @returns Readiness score clamped to 0–100
 */
export function calculateReadiness(
  topicScores: TopicScoreInput[],
  categoryWeights: Record<string, number>,
  examDate?: Date
): number {
  if (topicScores.length === 0) return 0;

  // Separate scores into weighted and unweighted categories
  const weighted: TopicScoreInput[] = [];
  const unweighted: TopicScoreInput[] = [];

  for (const ts of topicScores) {
    if (categoryWeights[ts.categoryId] !== undefined) {
      weighted.push(ts);
    } else {
      unweighted.push(ts);
    }
  }

  // Calculate total assigned weight
  let totalAssignedWeight = 0;
  for (const ts of weighted) {
    totalAssignedWeight += categoryWeights[ts.categoryId];
  }

  // Remaining weight is distributed equally among unweighted categories
  const remainingWeight = Math.max(0, 1 - totalAssignedWeight);
  const equalWeight =
    unweighted.length > 0 ? remainingWeight / unweighted.length : 0;

  // Compute weighted sum
  let weightedSum = 0;
  let totalWeight = 0;

  for (const ts of weighted) {
    const w = categoryWeights[ts.categoryId];
    weightedSum += eloToReadiness(ts.eloScore) * w;
    totalWeight += w;
  }

  for (const ts of unweighted) {
    weightedSum += eloToReadiness(ts.eloScore) * equalWeight;
    totalWeight += equalWeight;
  }

  // Avoid division by zero
  if (totalWeight === 0) return 0;

  let readiness = weightedSum / totalWeight;

  // Apply exam proximity factor if exam date is provided
  if (examDate) {
    readiness *= getExamProximityFactor(examDate);
  }

  // Clamp to 0–100
  return Math.max(0, Math.min(100, readiness));
}
