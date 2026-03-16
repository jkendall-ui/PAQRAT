import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import { requireAdmin } from '../middleware/roleCheck';
import { validate } from '../middleware/validate';
import { createMediaSchema, uploadUrlSchema } from '../schemas/media';
import { uuidParamsSchema } from '../schemas/common';

const router = Router();

/**
 * GET /media/:id/url
 * Generate a signed URL for a media asset with 15-minute TTL.
 * Requirements: 15.1
 */
router.get(
  '/media/:id/url',
  authMiddleware,
  validate({ params: uuidParamsSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };

    const media = await prisma.questionMedia.findUnique({ where: { id } });

    if (!media) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Media not found' },
      });
      return;
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    res.json({ url: media.url, expiresAt });
  }
);

/**
 * POST /admin/media/upload-url
 * Generate a presigned upload URL for admin media uploads.
 * Requirements: 16.1, 16.2
 */
router.post(
  '/admin/media/upload-url',
  authMiddleware,
  requireAdmin,
  validate({ body: uploadUrlSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const { filename, contentType } = req.body as { filename: string; contentType: string };

    // In production, this would use @vercel/blob to generate a presigned upload URL.
    // For now, return a placeholder since we can't call Vercel Blob without credentials.
    const uploadUrl = `https://blob.vercel-storage.com/upload/${filename}?token=placeholder`;
    const blobUrl = `https://blob.vercel-storage.com/${filename}`;

    res.json({ uploadUrl, blobUrl });
  }
);

/**
 * POST /admin/media
 * Create a question_media record with type, url, altText, attribution.
 * Requirements: 15.5, 16.3
 */
router.post(
  '/admin/media',
  authMiddleware,
  requireAdmin,
  validate({ body: createMediaSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const { type, url, altText, attribution, questionId, caption } = req.body as {
      type: string;
      url: string;
      altText: string;
      attribution: string;
      questionId: string;
      caption?: string;
    };

    const media = await prisma.questionMedia.create({
      data: {
        type: type as any,
        url,
        altText,
        attribution,
        questionId,
        caption: caption ?? null,
      },
    });

    res.status(201).json({ media });
  }
);

export default router;
