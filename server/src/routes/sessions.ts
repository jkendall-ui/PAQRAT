import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createSessionSchema, endSessionSchema, getSessionsQuerySchema } from '../schemas/sessions';
import { uuidParamsSchema } from '../schemas/common';
import { generateDiagnosticQuestions, canStartAdvancedSession, initializeTopicScores } from '../services/diagnosticService';
import { planAdaptiveSession } from '../services/aiSessionPlanner';

const router = Router();

/**
 * POST /sessions
 * Create a new study session. Handles diagnostic, adaptive, exam_simulation, and weak_spot_sprint modes.
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */
router.post(
  '/',
  authMiddleware,
  validate({ body: createSessionSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const { mode, categoryId } = req.body;
    const userId = req.user!.userId;

    // Gate adaptive and exam_simulation behind diagnostic completion
    if (mode === 'adaptive' || mode === 'exam_simulation') {
      const canStart = await canStartAdvancedSession(userId);
      if (!canStart) {
        res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'Complete the diagnostic assessment first' },
        });
        return;
      }
    }

    let questionIds: string[] = [];
    let aiPlan: Record<string, unknown> | null = null;
    let sessionMode: 'adaptive' | 'exam_simulation' | 'weak_spot_sprint' | 'ecg_interpretation' = 'adaptive';

    if (mode === 'diagnostic') {
      questionIds = await generateDiagnosticQuestions(userId);
      aiPlan = { diagnostic: true };
      sessionMode = 'adaptive';
    } else if (mode === 'adaptive') {
      questionIds = await planAdaptiveSession(userId, 20);
      sessionMode = 'adaptive';
    } else if (mode === 'exam_simulation') {
      const questions = await prisma.question.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      const shuffled = questions.sort(() => Math.random() - 0.5);
      questionIds = shuffled.slice(0, 120).map((q) => q.id);
      sessionMode = 'exam_simulation';
    } else if (mode === 'weak_spot_sprint') {
      const questions = await prisma.question.findMany({
        where: { isActive: true, categoryId },
        select: { id: true },
      });
      const shuffled = questions.sort(() => Math.random() - 0.5);
      questionIds = shuffled.slice(0, 10).map((q) => q.id);
      sessionMode = 'weak_spot_sprint';
    } else if (mode === 'ecg_interpretation') {
      // Pick random case-based questions that have media
      const questions = await prisma.question.findMany({
        where: {
          isActive: true,
          type: 'case_based',
          media: { some: {} },
        },
        select: { id: true },
      });
      const shuffled = questions.sort(() => Math.random() - 0.5);
      questionIds = shuffled.slice(0, 10).map((q) => q.id);
      sessionMode = 'ecg_interpretation';
    }

    const session = await prisma.studySession.create({
      data: {
        userId,
        mode: sessionMode,
        aiPlan: { ...(aiPlan ?? {}), questionIds } as any,
      },
    });

    res.status(201).json({ session, questionIds });
  }
);

/**
 * PATCH /sessions/:id
 * End a study session by setting endedAt timestamp.
 * If diagnostic session, initialize topic scores.
 * Requirements: 8.6
 */
router.patch(
  '/:id',
  authMiddleware,
  validate({ params: uuidParamsSchema, body: endSessionSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const userId = req.user!.userId;
    const { endedAt } = req.body;

    const session = await prisma.studySession.findUnique({ where: { id } });

    if (!session || session.userId !== userId) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Session not found' },
      });
      return;
    }

    const updated = await prisma.studySession.update({
      where: { id },
      data: { endedAt },
    });

    // If this was a diagnostic session, initialize topic scores
    const plan = updated.aiPlan as Record<string, unknown> | null;
    if (plan && plan.diagnostic === true) {
      await initializeTopicScores(userId);
    }

    res.json({ session: updated });
  }
);

/**
 * GET /sessions
 * Paginated session history for the authenticated user.
 * Requirements: 8.3
 */
router.get(
  '/',
  authMiddleware,
  validate({ query: getSessionsQuerySchema }),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { page, limit } = req.query as unknown as { page: number; limit: number };
    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
      prisma.studySession.findMany({
        where: { userId },
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.studySession.count({ where: { userId } }),
    ]);

    res.json({ sessions, total });
  }
);

/**
 * GET /sessions/:id
 * Session detail with attempts.
 * Requirements: 8.4
 */
router.get(
  '/:id',
  authMiddleware,
  validate({ params: uuidParamsSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const userId = req.user!.userId;

    const session = await prisma.studySession.findUnique({
      where: { id },
      include: { attempts: true },
    });

    if (!session || session.userId !== userId) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Session not found' },
      });
      return;
    }

    // Load questions from the stored questionIds in aiPlan
    const plan = session.aiPlan as Record<string, unknown> | null;
    const questionIds = (plan?.questionIds as string[]) ?? [];

    const questions = questionIds.length > 0
      ? await prisma.question.findMany({
          where: { id: { in: questionIds } },
          include: {
            options: { select: { id: true, body: true } },
            media: { select: { id: true, url: true, altText: true, attribution: true, type: true, timing: true } },
          },
        })
      : [];

    // Preserve the original order from questionIds
    const questionMap = new Map(questions.map((q) => [q.id, q]));
    const orderedQuestions = questionIds
      .map((qid) => questionMap.get(qid))
      .filter(Boolean)
      .map((q) => ({
        id: q!.id,
        stem: q!.body,
        type: q!.type,
        options: q!.options.map((o) => ({ id: o.id, label: o.body })),
        media: q!.media.map((m) => ({
          id: m.id,
          url: m.url,
          altText: m.altText,
          attribution: m.attribution,
          type: m.type,
          timing: m.timing ?? undefined,
        })),
      }));

    res.json({
      id: session.id,
      mode: session.mode,
      questions: orderedQuestions,
      totalQuestions: orderedQuestions.length,
      attempts: (session as any).attempts,
    });
  }
);

export default router;
