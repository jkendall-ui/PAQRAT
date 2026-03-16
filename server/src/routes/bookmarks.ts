import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createBookmarkSchema, getBookmarksQuerySchema } from '../schemas/bookmarks';
import { uuidParamsSchema } from '../schemas/common';

const router = Router();

/**
 * POST /bookmarks
 * Create a bookmark (unique per user+question).
 * Requirements: 9.8, 14.3
 */
router.post(
  '/',
  authMiddleware,
  validate({ body: createBookmarkSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { questionId } = req.body as { questionId: string };

    try {
      const bookmark = await prisma.bookmark.create({
        data: { userId, questionId },
      });
      res.status(201).json({ bookmark });
    } catch (error: any) {
      // Prisma unique constraint violation code
      if (error?.code === 'P2002') {
        res.status(409).json({
          error: { code: 'CONFLICT', message: 'Bookmark already exists for this question' },
        });
        return;
      }
      throw error;
    }
  }
);

/**
 * DELETE /bookmarks/:id
 * Remove a bookmark. Only the owner can delete.
 * Requirements: 9.8, 14.3
 */
router.delete(
  '/:id',
  authMiddleware,
  validate({ params: uuidParamsSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { id } = req.params as { id: string };

    const bookmark = await prisma.bookmark.findUnique({ where: { id } });

    if (!bookmark || bookmark.userId !== userId) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Bookmark not found' },
      });
      return;
    }

    await prisma.bookmark.delete({ where: { id } });
    res.status(204).send();
  }
);

/**
 * GET /bookmarks
 * List authenticated user's bookmarks with pagination.
 * Requirements: 9.8, 14.3
 */
router.get(
  '/',
  authMiddleware,
  validate({ query: getBookmarksQuerySchema }),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const { page, limit } = req.query as unknown as { page: number; limit: number };
    const skip = (page - 1) * limit;

    const [bookmarks, total] = await Promise.all([
      prisma.bookmark.findMany({
        where: { userId },
        include: {
          question: {
            include: { category: { select: { id: true, name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.bookmark.count({ where: { userId } }),
    ]);

    res.json({ bookmarks, total });
  }
);

export default router;
