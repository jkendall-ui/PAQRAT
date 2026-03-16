import prisma from '../lib/prisma';

const DIAGNOSTIC_QUESTION_COUNT = 20;
const INITIAL_ELO_SCORE = 1000;

/**
 * Check if a user has completed the diagnostic baseline assessment.
 * A completed diagnostic is a study session with mode 'adaptive' (the first session),
 * that has a non-null endedAt, and whose aiPlan contains { diagnostic: true }.
 */
export async function hasDiagnosticCompleted(userId: string): Promise<boolean> {
  const diagnosticSession = await prisma.studySession.findFirst({
    where: {
      userId,
      endedAt: { not: null },
      aiPlan: {
        path: ['diagnostic'],
        equals: true,
      },
    },
  });
  return diagnosticSession !== null;
}

/**
 * Generate a 20-question diagnostic spanning all NCCPA categories.
 * Selects at least 1 question per category (if available), then fills
 * remaining slots with random active questions for difficulty mix.
 * Returns question IDs.
 */
export async function generateDiagnosticQuestions(userId: string): Promise<string[]> {
  // Get all NCCPA categories
  const categories = await prisma.category.findMany({
    where: { parentId: null },
  });

  const selectedQuestionIds: string[] = [];

  // Step 1: Pick 1 random active question per category
  for (const category of categories) {
    const questions = await prisma.question.findMany({
      where: {
        categoryId: category.id,
        isActive: true,
      },
      select: { id: true },
    });

    if (questions.length > 0) {
      const randomIndex = Math.floor(Math.random() * questions.length);
      selectedQuestionIds.push(questions[randomIndex].id);
    }
  }

  // Step 2: Fill remaining slots to reach 20 questions
  const remaining = DIAGNOSTIC_QUESTION_COUNT - selectedQuestionIds.length;
  if (remaining > 0) {
    const fillerQuestions = await prisma.question.findMany({
      where: {
        isActive: true,
        id: { notIn: selectedQuestionIds },
      },
      select: { id: true },
    });

    // Shuffle and take what we need
    const shuffled = fillerQuestions.sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(remaining, shuffled.length); i++) {
      selectedQuestionIds.push(shuffled[i].id);
    }
  }

  return selectedQuestionIds;
}

/**
 * Initialize TopicScore records for every NCCPA category with Elo 1000.
 * Skips categories that already have a TopicScore for this user.
 */
export async function initializeTopicScores(userId: string): Promise<void> {
  const categories = await prisma.category.findMany({
    where: { parentId: null },
  });

  for (const category of categories) {
    await prisma.topicScore.upsert({
      where: {
        userId_categoryId: {
          userId,
          categoryId: category.id,
        },
      },
      update: {},
      create: {
        userId,
        categoryId: category.id,
        eloScore: INITIAL_ELO_SCORE,
        attemptCount: 0,
        correctCount: 0,
        decayFactor: 1.0,
      },
    });
  }
}

/**
 * Check if a user can start an adaptive or exam_simulation session.
 * Returns true if diagnostic is completed, false otherwise.
 */
export async function canStartAdvancedSession(userId: string): Promise<boolean> {
  return hasDiagnosticCompleted(userId);
}
