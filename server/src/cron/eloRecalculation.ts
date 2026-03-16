import prisma from '../lib/prisma';
import { calculateNewScore, difficultyToElo } from '../services/eloCalculator';

/**
 * Nightly Elo recalculation job.
 *
 * Replays all attempts for every topic_score record to recalculate
 * the Elo score from the initial value of 1000.
 */
export async function runEloRecalculation(): Promise<number> {
  console.log('[cron] Elo recalculation started');

  const topicScores = await prisma.topicScore.findMany();
  let updatedCount = 0;

  for (const ts of topicScores) {
    const attempts = await prisma.attempt.findMany({
      where: {
        userId: ts.userId,
        question: { categoryId: ts.categoryId },
      },
      include: { question: true },
      orderBy: { createdAt: 'asc' },
    });

    let elo = 1000;
    let correctCount = 0;

    for (const attempt of attempts) {
      const questionElo = difficultyToElo(attempt.question.difficulty);
      elo = calculateNewScore(elo, questionElo, attempt.isCorrect);
      if (attempt.isCorrect) correctCount++;
    }

    await prisma.topicScore.update({
      where: { id: ts.id },
      data: {
        eloScore: elo,
        attemptCount: attempts.length,
        correctCount,
      },
    });

    updatedCount++;
  }

  console.log(`[cron] Elo recalculation complete — ${updatedCount} topic scores updated`);
  return updatedCount;
}
