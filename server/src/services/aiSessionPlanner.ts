import prisma from '../lib/prisma';
import { callClaudeWithRetry } from './claudeService';

const SESSION_PLANNER_SYSTEM_PROMPT = `You are an expert PA exam tutor. Given a student's performance profile, select the optimal next set of study questions.

Rules:
1. Prioritise weak categories (error rate > 40 %).
2. Include 1-2 questions from strong categories to maintain confidence.
3. Mix difficulty levels: 60 % at student's Elo ± 100, 30 % above, 10 % below.
4. Never repeat a question answered correctly in the last 7 days.
5. Return ONLY a JSON array of question IDs. No commentary.`;

/**
 * Plan an adaptive study session using Claude AI.
 * Falls back to random selection if Claude is unavailable or returns invalid data.
 */
export async function planAdaptiveSession(
  userId: string,
  targetCount: number
): Promise<string[]> {
  // 1. Get available active questions
  const availableQuestions = await prisma.question.findMany({
    where: { isActive: true },
    select: { id: true, categoryId: true, difficulty: true },
  });

  if (availableQuestions.length === 0) return [];

  try {
    // 2. Get user's topic scores with category names
    const topicScores = await prisma.topicScore.findMany({
      where: { userId },
      include: { category: { select: { name: true } } },
    });

    // 3. Calculate student's overall Elo (average of topic scores)
    const studentElo =
      topicScores.length > 0
        ? Math.round(topicScores.reduce((sum, ts) => sum + ts.eloScore, 0) / topicScores.length)
        : 1000;

    // 4. Build topic score profiles with error rates
    const topicProfiles = await Promise.all(
      topicScores.map(async (ts) => {
        const errorRate =
          ts.attemptCount > 0 ? 1 - ts.correctCount / ts.attemptCount : 0;
        return {
          categoryId: ts.categoryId,
          categoryName: ts.category.name,
          elo: ts.eloScore,
          errorRate: Math.round(errorRate * 100) / 100,
        };
      })
    );

    // 5. Get recent correct question IDs (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentCorrectAttempts = await prisma.attempt.findMany({
      where: {
        userId,
        isCorrect: true,
        createdAt: { gte: sevenDaysAgo },
      },
      select: { questionId: true },
      distinct: ['questionId'],
    });
    const recentCorrectQuestionIds = recentCorrectAttempts.map((a) => a.questionId);

    // 6. Build the payload for Claude
    const payload = {
      studentElo,
      topicScores: topicProfiles,
      recentCorrectQuestionIds,
      availableQuestions: availableQuestions.map((q) => ({
        id: q.id,
        categoryId: q.categoryId,
        difficulty: q.difficulty,
      })),
      targetCount,
    };

    // 7. Call Claude
    const response = await callClaudeWithRetry(
      SESSION_PLANNER_SYSTEM_PROMPT,
      [{ role: 'user', content: JSON.stringify(payload) }],
      { maxTokens: 512 }
    );

    // 8. Parse the JSON array response
    const parsed = JSON.parse(response);
    if (!Array.isArray(parsed)) {
      throw new Error('Claude response is not an array');
    }

    // 9. Validate that all returned IDs exist in the available pool
    const availableIds = new Set(availableQuestions.map((q) => q.id));
    const validIds = parsed.filter((id: unknown) => typeof id === 'string' && availableIds.has(id));

    if (validIds.length === 0) {
      throw new Error('No valid question IDs in Claude response');
    }

    return validIds.slice(0, targetCount);
  } catch {
    // 10. Fallback: random selection
    return fallbackRandomSelection(availableQuestions, targetCount);
  }
}

function fallbackRandomSelection(
  questions: { id: string }[],
  count: number
): string[] {
  const shuffled = [...questions].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((q) => q.id);
}
