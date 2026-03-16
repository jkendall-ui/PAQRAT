import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import { calculateReadiness, TopicScoreInput } from '../services/readinessCalculator';
import { trendsQuerySchema } from '../schemas/analytics';

const router = Router();

/**
 * GET /analytics/trends
 * Daily accuracy trend over configurable time window.
 * Requirements: 13.1
 */
router.get(
  '/trends',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;

    const parsed = trendsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters', details: parsed.error.issues },
      });
      return;
    }

    const { days } = parsed.data;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const attempts = await prisma.attempt.findMany({
      where: {
        userId,
        createdAt: { gte: startDate },
      },
      select: {
        isCorrect: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date
    const dailyMap = new Map<string, { totalAttempts: number; correctAttempts: number }>();

    for (const attempt of attempts) {
      const dateKey = attempt.createdAt.toISOString().split('T')[0];
      const entry = dailyMap.get(dateKey) || { totalAttempts: 0, correctAttempts: 0 };
      entry.totalAttempts++;
      if (attempt.isCorrect) {
        entry.correctAttempts++;
      }
      dailyMap.set(dateKey, entry);
    }

    const trends = Array.from(dailyMap.entries()).map(([date, stats]) => ({
      date,
      totalAttempts: stats.totalAttempts,
      correctAttempts: stats.correctAttempts,
      accuracy: stats.totalAttempts > 0 ? stats.correctAttempts / stats.totalAttempts : 0,
    }));

    res.json({ trends, days });
  }
);

/**
 * GET /analytics/summary
 * Total attempts, accuracy rate, study time, predicted PANCE score band.
 * Requirements: 13.2, 13.3, 13.4
 */
router.get(
  '/summary',
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;

    const attempts = await prisma.attempt.findMany({
      where: { userId },
      select: {
        isCorrect: true,
        durationMs: true,
      },
    });

    const totalAttempts = attempts.length;
    const correctAttempts = attempts.filter((a) => a.isCorrect).length;
    const accuracyRate = totalAttempts > 0 ? correctAttempts / totalAttempts : 0;
    const totalStudyTimeMs = attempts.reduce((sum, a) => sum + a.durationMs, 0);

    // Calculate readiness score for predicted score band
    const topicScores = await prisma.topicScore.findMany({
      where: { userId },
    });

    const numCategories = topicScores.length;
    const categoryWeights: Record<string, number> = {};
    if (numCategories > 0) {
      const equalWeight = 1 / numCategories;
      for (const ts of topicScores) {
        categoryWeights[ts.categoryId] = equalWeight;
      }
    }

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

    const predictedScoreBand = getScoreBand(readinessScore);

    res.json({
      totalAttempts,
      correctAttempts,
      accuracyRate,
      totalStudyTimeMs,
      predictedScoreBand,
      readinessScore,
    });
  }
);

/**
 * Map readiness score to PANCE score band.
 */
export function getScoreBand(readinessScore: number): string {
  if (readinessScore >= 80) return 'Pass (high confidence)';
  if (readinessScore >= 60) return 'Pass (moderate confidence)';
  if (readinessScore >= 40) return 'Borderline';
  return 'Needs improvement';
}

export default router;
