import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { getQuestionsQuerySchema } from '../schemas/questions';
import { uuidParamsSchema } from '../schemas/common';

const router = Router();

/**
 * GET /questions
 * Paginated question browsing with optional filters.
 * Requirements: 14.1, 14.5, 18.4
 */
router.get(
  '/',
  authMiddleware,
  validate({ query: getQuestionsQuerySchema }),
  async (req: Request, res: Response): Promise<void> => {
    const { page, limit, categoryId, difficulty, search } = req.query as unknown as {
      page: number;
      limit: number;
      categoryId?: string;
      difficulty?: number;
      search?: string;
    };
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { isActive: true };
    if (categoryId) where.categoryId = categoryId;
    if (difficulty) where.difficulty = difficulty;
    if (search) {
      where.body = { contains: search, mode: 'insensitive' };
    }

    const [questions, total] = await Promise.all([
      prisma.question.findMany({
        where,
        include: { category: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.question.count({ where }),
    ]);

    res.json({ questions, total });
  }
);

/**
 * GET /questions/:id
 * Single question with options, media, and category.
 * Requirements: 14.1, 18.4
 */
router.get(
  '/:id',
  authMiddleware,
  validate({ params: uuidParamsSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;

    const question = await prisma.question.findUnique({
      where: { id, isActive: true },
      include: {
        options: true,
        media: true,
        category: { select: { id: true, name: true } },
      },
    });

    if (!question) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Question not found' },
      });
      return;
    }

    res.json({ question });
  }
);

export default router;
