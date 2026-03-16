/**
 * Spaced Repetition Decay Calculator for PA Exam Prep.
 *
 * Applies a gentle daily decay to topic scores for categories
 * not recently reviewed, implementing spaced repetition.
 *
 * Decay rate: 0.995 per day
 * Minimum score floor: 400 (prevents scores from decaying to zero)
 */

const DECAY_RATE = 0.995;
const MINIMUM_SCORE_FLOOR = 400;

/**
 * Apply decay to a topic score based on days since last review.
 *
 * Formula: newScore = max(currentScore * (0.995 ^ daysSinceReview), 400)
 *
 * @param currentScore - The student's current Elo score for the category
 * @param daysSinceReview - Number of days since the category was last reviewed
 * @returns The decayed score, never below the minimum floor of 400
 */
export function applyDecay(currentScore: number, daysSinceReview: number): number {
  const decayed = currentScore * Math.pow(DECAY_RATE, daysSinceReview);
  return Math.max(decayed, MINIMUM_SCORE_FLOOR);
}
