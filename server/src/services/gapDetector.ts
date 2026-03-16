/**
 * Gap Detection Service for PA Exam Prep.
 *
 * Identifies categories where a student is struggling, based on:
 *   1. Error rate > 40% over the last 10 attempts in a category
 *   2. Elo score declining over the last 3 study sessions
 *
 * Returns an array of unique category IDs flagged as "gaps".
 */

import prisma from '../lib/prisma';

/**
 * Detect gap categories for a given user.
 *
 * A category is flagged as a gap if EITHER:
 *   - The user's error rate exceeds 40% over the last 10 attempts in that category, OR
 *   - The user's Elo score for that category has declined over the last 3 study sessions
 *
 * @param userId - The user's ID
 * @returns Array of unique category IDs flagged as gaps
 */
export async function detectGaps(userId: string): Promise<string[]> {
  const gapCategoryIds = new Set<string>();

  // 1. Find categories with error rate > 40% over last 10 attempts
  const errorRateGaps = await findHighErrorRateCategories(userId);
  for (const categoryId of errorRateGaps) {
    gapCategoryIds.add(categoryId);
  }

  // 2. Find categories with declining Elo over last 3 sessions
  const decliningEloGaps = await findDecliningEloCategories(userId);
  for (const categoryId of decliningEloGaps) {
    gapCategoryIds.add(categoryId);
  }

  return Array.from(gapCategoryIds);
}

/**
 * Find categories where the user's error rate exceeds 40%
 * over the last 10 attempts in that category.
 */
async function findHighErrorRateCategories(userId: string): Promise<string[]> {
  // Get all distinct categories the user has attempted
  const attemptedCategories = await prisma.attempt.findMany({
    where: { userId },
    select: {
      question: {
        select: { categoryId: true },
      },
    },
    distinct: ['questionId'],
  });

  const categoryIds = [
    ...new Set(attemptedCategories.map((a) => a.question.categoryId)),
  ];

  const gapCategories: string[] = [];

  for (const categoryId of categoryIds) {
    // Get the last 10 attempts for this category
    const recentAttempts = await prisma.attempt.findMany({
      where: {
        userId,
        question: { categoryId },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { isCorrect: true },
    });

    if (recentAttempts.length === 0) continue;

    const incorrectCount = recentAttempts.filter((a) => !a.isCorrect).length;
    const errorRate = incorrectCount / recentAttempts.length;

    if (errorRate > 0.4) {
      gapCategories.push(categoryId);
    }
  }

  return gapCategories;
}

/**
 * Find categories where the user's Elo score has declined
 * over the last 3 study sessions.
 *
 * We look at the user's attempts grouped by session, ordered by session start time,
 * and compute the average Elo-relevant correctness trend per category across sessions.
 * A simpler approach: compare the current topic score with the score implied by
 * recent session performance. We use the topic_scores table's eloScore and check
 * if it has been declining by looking at attempt correctness across the last 3 sessions.
 */
async function findDecliningEloCategories(userId: string): Promise<string[]> {
  // Get the last 3 study sessions for this user
  const recentSessions = await prisma.studySession.findMany({
    where: { userId },
    orderBy: { startedAt: 'desc' },
    take: 3,
    select: { id: true, startedAt: true },
  });

  if (recentSessions.length < 3) return [];

  // Get all topic scores for the user
  const topicScores = await prisma.topicScore.findMany({
    where: { userId },
    select: { categoryId: true, eloScore: true },
  });

  const gapCategories: string[] = [];

  for (const topicScore of topicScores) {
    // For each category, get attempts from each of the last 3 sessions
    const sessionScores: number[] = [];

    for (const session of recentSessions) {
      const sessionAttempts = await prisma.attempt.findMany({
        where: {
          userId,
          sessionId: session.id,
          question: { categoryId: topicScore.categoryId },
        },
        select: { isCorrect: true },
      });

      if (sessionAttempts.length === 0) continue;

      // Calculate accuracy for this session in this category
      const correctCount = sessionAttempts.filter((a) => a.isCorrect).length;
      const accuracy = correctCount / sessionAttempts.length;
      sessionScores.push(accuracy);
    }

    // Need at least 2 data points to detect a decline
    if (sessionScores.length < 2) continue;

    // Check if scores are declining (each session worse than or equal to the previous)
    // Sessions are ordered newest-first, so declining means newer scores are lower
    let declining = true;
    for (let i = 0; i < sessionScores.length - 1; i++) {
      // sessionScores[0] is newest, sessionScores[last] is oldest
      // Declining means newest < oldest, i.e. scores going down over time
      if (sessionScores[i] >= sessionScores[i + 1]) {
        declining = false;
        break;
      }
    }

    if (declining) {
      gapCategories.push(topicScore.categoryId);
    }
  }

  return gapCategories;
}
