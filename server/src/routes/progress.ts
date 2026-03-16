import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import { calculateReadiness, TopicScoreInput } from '../services/readinessCalculator';
import { detectGaps } from '../services/gapDetector';

const router = Router();

/**
 * GET /progress/scores
 * Return all topic scores + calculated readiness score.
 * Requirements: 10.1, 10.2, 10.3
 */
router.get(
  '/scores',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;

    const topicScores = await prisma.topicScore.findMany({
      where: { userId },
      include: { category: { select: { name: true } } },
    });

    // Build equal weights for all categories
    const numCategories = topicScores.length;
    const categoryWeights: Record<string, number> = {};
    if (numCategories > 0) {
      const equalWeight = 1 / numCategories;
      for (const ts of topicScores) {
        categoryWeights[ts.categoryId] = equalWeight;
      }
    }

    // Get user's exam date for proximity adjustment
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { examDate: true },
    });

    const scoreInputs: TopicScoreInput[] = topicScores.map((ts) => ({
      categoryId: ts.categoryId,
      eloScore: ts.eloScore,
    }));

    const readinessScore = calculateReadiness(
      scoreInputs,
      categoryWeights,
      user?.examDate ?? undefined
    );

    res.json({ topicScores, readinessScore });
  }
);


/**
 * GET /progress/heatmap
 * Return categories with mastery levels (color-coded data).
 * Requirements: 12.1
 */
router.get(
  '/heatmap',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;

    const topicScores = await prisma.topicScore.findMany({
      where: { userId },
      include: { category: { select: { name: true } } },
    });

    const categories = topicScores.map((ts) => ({
      categoryId: ts.categoryId,
      categoryName: ts.category.name,
      eloScore: ts.eloScore,
      masteryLevel: getMasteryLevel(ts.eloScore),
      attemptCount: ts.attemptCount,
      correctCount: ts.correctCount,
    }));

    res.json({ categories });
  }
);

/**
 * Map an Elo score to a mastery level.
 */
function getMasteryLevel(eloScore: number): string {
  if (eloScore < 600) return 'novice';
  if (eloScore < 800) return 'developing';
  if (eloScore < 1000) return 'competent';
  if (eloScore < 1200) return 'proficient';
  return 'expert';
}

/**
 * GET /progress/gaps
 * Return current gap categories with details.
 * Requirements: 5.3
 */
router.get(
  '/gaps',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;

    const gapCategoryIds = await detectGaps(userId);

    // Fetch details for each gap category
    const gaps = await Promise.all(
      gapCategoryIds.map(async (categoryId) => {
        const category = await prisma.category.findUnique({
          where: { id: categoryId },
          select: { name: true },
        });

        const topicScore = await prisma.topicScore.findUnique({
          where: { userId_categoryId: { userId, categoryId } },
          select: { eloScore: true },
        });

        // Calculate error rate from last 10 attempts
        const recentAttempts = await prisma.attempt.findMany({
          where: { userId, question: { categoryId } },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { isCorrect: true },
        });

        const incorrectCount = recentAttempts.filter((a) => !a.isCorrect).length;
        const errorRate = recentAttempts.length > 0
          ? incorrectCount / recentAttempts.length
          : 0;

        return {
          categoryId,
          categoryName: category?.name ?? 'Unknown',
          eloScore: topicScore?.eloScore ?? 1000,
          errorRate,
        };
      })
    );

    res.json({ gaps });
  }
);


/**
 * GET /progress/streak
 * Calculate study streak with grace day logic.
 * Requirements: 11.1, 11.3, 11.4
 */
router.get(
  '/streak',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;

    const sessions = await prisma.studySession.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true },
    });

    const sessionDates = sessions.map((s) => s.startedAt);
    const { currentStreak, longestStreak } = calculateStreak(sessionDates);

    const lastStudyDate = sessionDates.length > 0
      ? sessionDates[0].toISOString().split('T')[0]
      : null;

    res.json({ currentStreak, longestStreak, lastStudyDate });
  }
);

/**
 * Calculate study streak from session dates.
 * Grace day logic: a single-day gap doesn't break the streak.
 */
export function calculateStreak(sessionDates: Date[]): {
  currentStreak: number;
  longestStreak: number;
} {
  if (sessionDates.length === 0) return { currentStreak: 0, longestStreak: 0 };

  // Get unique study dates (just the date part, no time)
  const uniqueDates = [
    ...new Set(sessionDates.map((d) => d.toISOString().split('T')[0])),
  ]
    .sort()
    .reverse();

  // Check if the most recent study date is today or yesterday (otherwise streak is 0)
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 1;

  // Start counting from most recent date
  if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) {
    // Streak is broken
    currentStreak = 0;
  } else {
    currentStreak = 1;
  }

  for (let i = 0; i < uniqueDates.length - 1; i++) {
    const current = new Date(uniqueDates[i]);
    const next = new Date(uniqueDates[i + 1]);
    const diffDays = Math.round(
      (current.getTime() - next.getTime()) / 86400000
    );

    if (diffDays <= 2) {
      // 1 day = consecutive, 2 days = grace day gap
      tempStreak++;
      if (currentStreak > 0) {
        currentStreak = tempStreak;
      }
    } else {
      longestStreak = Math.max(longestStreak, tempStreak);
      tempStreak = 1;
      // Current streak is broken at this point — keep what we had
    }
  }
  longestStreak = Math.max(longestStreak, tempStreak);
  if (currentStreak > 0) currentStreak = Math.max(currentStreak, tempStreak);

  return { currentStreak, longestStreak };
}

export { getMasteryLevel };
export default router;
