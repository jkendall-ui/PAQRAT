import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock prisma
vi.mock('../../../src/lib/prisma', () => ({
  default: {
    questionMedia: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Mock auth middleware — default: student user
vi.mock('../../../src/middleware/auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', role: req.headers['x-test-role'] || 'student' };
    next();
  },
}));

// Mock roleCheck middleware — check the role set by auth mock
vi.mock('../../../src/middleware/roleCheck', () => ({
  requireAdmin: (req: any, res: any, next: any) => {
    if (!req.user || req.user.role !== 'admin') {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Admin access required' },
      });
      return;
    }
    next();
  },
}));

import prisma from '../../../src/lib/prisma';
import mediaRouter from '../../../src/routes/media';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(mediaRouter);
  return app;
}

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_QUESTION_ID = '660e8400-e29b-41d4-a716-446655440001';

describe('Media Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /media/:id/url', () => {
    it('returns URL with 15-minute expiry for existing media', async () => {
      const mockMedia = {
        id: VALID_UUID,
        url: 'https://blob.vercel-storage.com/ecg-image.png',
        type: 'image',
        altText: 'ECG strip',
        attribution: 'CC BY 4.0',
        questionId: VALID_QUESTION_ID,
      };
      vi.mocked(prisma.questionMedia.findUnique).mockResolvedValue(mockMedia as any);

      const app = createApp();
      const before = Date.now();
      const res = await request(app).get(`/media/${VALID_UUID}/url`);
      const after = Date.now();

      expect(res.status).toBe(200);
      expect(res.body.url).toBe('https://blob.vercel-storage.com/ecg-image.png');
      expect(res.body.expiresAt).toBeDefined();

      // Verify expiry is ~15 minutes from now
      const expiresAt = new Date(res.body.expiresAt).getTime();
      const fifteenMinMs = 15 * 60 * 1000;
      expect(expiresAt).toBeGreaterThanOrEqual(before + fifteenMinMs - 1000);
      expect(expiresAt).toBeLessThanOrEqual(after + fifteenMinMs + 1000);
    });

    it('returns 404 for non-existent media', async () => {
      vi.mocked(prisma.questionMedia.findUnique).mockResolvedValue(null);

      const app = createApp();
      const res = await request(app).get(`/media/${VALID_UUID}/url`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 for invalid UUID param', async () => {
      const app = createApp();
      const res = await request(app).get('/media/not-a-uuid/url');

      expect(res.status).toBe(400);
    });
  });

  describe('POST /admin/media', () => {
    const validBody = {
      type: 'image',
      url: 'https://blob.vercel-storage.com/ecg.png',
      altText: '12-lead ECG showing ST elevation',
      attribution: 'CC BY 4.0 - LITFL',
      questionId: VALID_QUESTION_ID,
    };

    it('creates media record with valid data and returns 201', async () => {
      const mockMedia = { id: 'media-1', ...validBody, caption: null };
      vi.mocked(prisma.questionMedia.create).mockResolvedValue(mockMedia as any);

      const app = createApp();
      const res = await request(app)
        .post('/admin/media')
        .set('x-test-role', 'admin')
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.media).toBeDefined();
      expect(prisma.questionMedia.create).toHaveBeenCalledWith({
        data: {
          type: 'image',
          url: 'https://blob.vercel-storage.com/ecg.png',
          altText: '12-lead ECG showing ST elevation',
          attribution: 'CC BY 4.0 - LITFL',
          questionId: VALID_QUESTION_ID,
          caption: null,
        },
      });
    });

    it('creates media record with optional caption', async () => {
      const bodyWithCaption = { ...validBody, caption: 'Figure 1: Inferior STEMI' };
      const mockMedia = { id: 'media-1', ...bodyWithCaption };
      vi.mocked(prisma.questionMedia.create).mockResolvedValue(mockMedia as any);

      const app = createApp();
      const res = await request(app)
        .post('/admin/media')
        .set('x-test-role', 'admin')
        .send(bodyWithCaption);

      expect(res.status).toBe(201);
      expect(prisma.questionMedia.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ caption: 'Figure 1: Inferior STEMI' }),
      });
    });

    it('returns 400 for empty altText', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/admin/media')
        .set('x-test-role', 'admin')
        .send({ ...validBody, altText: '' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for empty attribution', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/admin/media')
        .set('x-test-role', 'admin')
        .send({ ...validBody, attribution: '' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for missing altText', async () => {
      const { altText, ...bodyWithoutAlt } = validBody;
      const app = createApp();
      const res = await request(app)
        .post('/admin/media')
        .set('x-test-role', 'admin')
        .send(bodyWithoutAlt);

      expect(res.status).toBe(400);
    });

    it('returns 400 for missing attribution', async () => {
      const { attribution, ...bodyWithoutAttr } = validBody;
      const app = createApp();
      const res = await request(app)
        .post('/admin/media')
        .set('x-test-role', 'admin')
        .send(bodyWithoutAttr);

      expect(res.status).toBe(400);
    });

    it('returns 403 for non-admin user', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/admin/media')
        .set('x-test-role', 'student')
        .send(validBody);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /admin/media/upload-url', () => {
    it('returns upload URL and blob URL for valid request', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/admin/media/upload-url')
        .set('x-test-role', 'admin')
        .send({ filename: 'ecg-strip.png', contentType: 'image/png' });

      expect(res.status).toBe(200);
      expect(res.body.uploadUrl).toBeDefined();
      expect(res.body.blobUrl).toBeDefined();
      expect(typeof res.body.uploadUrl).toBe('string');
      expect(typeof res.body.blobUrl).toBe('string');
    });

    it('returns 400 for empty filename', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/admin/media/upload-url')
        .set('x-test-role', 'admin')
        .send({ filename: '', contentType: 'image/png' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for empty contentType', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/admin/media/upload-url')
        .set('x-test-role', 'admin')
        .send({ filename: 'ecg.png', contentType: '' });

      expect(res.status).toBe(400);
    });

    it('returns 403 for non-admin user', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/admin/media/upload-url')
        .set('x-test-role', 'student')
        .send({ filename: 'ecg.png', contentType: 'image/png' });

      expect(res.status).toBe(403);
    });
  });
});
