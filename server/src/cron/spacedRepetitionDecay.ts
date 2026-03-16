import prisma from '../lib/prisma';
import { applyDecay } from '../services/decayCalculator';

/**
 * Nightly spaced-repetition decay job.
 *
 * Applies the decay factor to every topic score that has a
 * lastReviewedAt timestamp, based on days since last review.
 * Does NOT update lastReviewedAt — that only changes on new attempts.
 */
export async function runSpacedRepetitionDecay(): Promise<number> {
  console.log('[cron] Spaced repetition decay started');

  const topicScores = await prisma.topicScore.findMany({
    where: { lastReviewedAt: { not: null } },
  });

  const now = new Date();
  let updatedCount = 0;

  for (const ts of topicScores) {
    const daysSinceReview =
      (now.getTime() - ts.lastReviewedAt!.getTime()) / (1000 * 60 * 60 * 24);

    const decayedScore = applyDecay(ts.eloScore, daysSinceReview);

    await prisma.topicScore.update({
      where: { id: ts.id },
      data: { eloScore: decayedScore },
    });

    updatedCount++;
  }

  console.log(`[cron] Spaced repetition decay complete — ${updatedCount} topic scores decayed`);
  return updatedCount;
}
