/**
 * Elo Score Calculator for PA Exam Prep adaptive scoring.
 *
 * Uses a standard Elo rating system with K-factor 32 to adjust
 * student scores based on question difficulty and correctness.
 */

const K_FACTOR = 32;

/** Map integer difficulty (1–5) to an Elo-equivalent rating. */
const DIFFICULTY_ELO_MAP: Record<number, number> = {
  1: 600,
  2: 800,
  3: 1000,
  4: 1200,
  5: 1400,
};

/**
 * Calculate the expected score (probability of answering correctly)
 * given the player's Elo and the question's difficulty Elo.
 */
function expectedScore(playerElo: number, questionDifficultyElo: number): number {
  return 1 / (1 + Math.pow(10, (questionDifficultyElo - playerElo) / 400));
}

/**
 * Calculate a new Elo score after an attempt.
 *
 * @param currentElo - The student's current Elo rating for the category
 * @param questionDifficultyElo - The Elo-equivalent rating of the question
 * @param isCorrect - Whether the student answered correctly
 * @returns The updated Elo score (rounded to nearest integer)
 */
export function calculateNewScore(
  currentElo: number,
  questionDifficultyElo: number,
  isCorrect: boolean
): number {
  const expected = expectedScore(currentElo, questionDifficultyElo);
  const actual = isCorrect ? 1 : 0;
  return Math.round(currentElo + K_FACTOR * (actual - expected));
}

/**
 * Map a question difficulty level (1–5) to an Elo-equivalent rating.
 *
 * @param difficulty - Integer difficulty from 1 (easiest) to 5 (hardest)
 * @returns The Elo-equivalent rating for the difficulty level
 * @throws Error if difficulty is not in the range 1–5
 */
export function difficultyToElo(difficulty: number): number {
  const elo = DIFFICULTY_ELO_MAP[difficulty];
  if (elo === undefined) {
    throw new Error(`Invalid difficulty level: ${difficulty}. Must be 1–5.`);
  }
  return elo;
}
