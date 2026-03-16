import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock prisma
vi.mock('../../../src/lib/prisma', () => ({
  default: {
    bookmark: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

// Mock auth middleware to inject user
vi.mock('../../../src/middleware/auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { userId: 'user-1', role: 'student' };
    next();
  },
}));

import prisma from '../../../src/lib/prisma';
import bookmarksRouter from '../../../src/routes/bookmarks';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/bookmarks', bookmarksRouter);
  return app;
}

describe('Bookmarks Router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /bookmarks', () => {
    it('creates a bookmark and returns 201', async () => {
      const mockBookmark = {
        id: 'bm-1',
        userId: 'user-1',
        questionId: 'q-1',
        createdAt: new Date().toISOString(),
      };
      vi.mocked(prisma.bookmark.create).mockResolvedValue(mockBookmark as any);

      const app = createApp();
      const res = await request(app)
        .post('/bookmarks')
        .send({ questionId: '550e8400-e29b-41d4-a716-446655440000' });

      expect(res.status).toBe(201);
      expect(res.body.bookmark).toBeDefined();
      expect(prisma.bookmark.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', questionId: '550e8400-e29b-41d4-a716-446655440000' },
      });
    });

    it('returns 409 for duplicate bookmark', async () => {
      const prismaError = new Error('Unique constraint failed') as any;
      prismaError.code = 'P2002';
      vi.mocked(prisma.bookmark.create).mockRejectedValue(prismaError);

      const app = createApp();
      const res = await request(app)
        .post('/bookmarks')
        .send({ questionId: '550e8400-e29b-41d4-a716-446655440000' });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('returns 400 for invalid questionId', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/bookmarks')
        .send({ questionId: 'not-a-uuid' });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /bookmarks/:id', () => {
    it('removes a bookmark and returns 204', async () => {
      vi.mocked(prisma.bookmark.findUnique).mockResolvedValue({
        id: 'bm-1',
        userId: 'user-1',
        questionId: 'q-1',
        createdAt: new Date(),
      } as any);
      vi.mocked(prisma.bookmark.delete).mockResolvedValue({} as any);

      const app = createApp();
      const res = await request(app).delete(
        '/bookmarks/550e8400-e29b-41d4-a716-446655440000'
      );

      expect(res.status).toBe(204);
      expect(prisma.bookmark.delete).toHaveBeenCalledWith({
        where: { id: '550e8400-e29b-41d4-a716-446655440000' },
      });
    });

    it('returns 404 for non-owned bookmark', async () => {
      vi.mocked(prisma.bookmark.findUnique).mockResolvedValue({
        id: 'bm-1',
        userId: 'other-user',
        questionId: 'q-1',
        createdAt: new Date(),
      } as any);

      const app = createApp();
      const res = await request(app).delete(
        '/bookmarks/550e8400-e29b-41d4-a716-446655440000'
      );

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(prisma.bookmark.delete).not.toHaveBeenCalled();
    });

    it('returns 404 when bookmark does not exist', async () => {
      vi.mocked(prisma.bookmark.findUnique).mockResolvedValue(null);

      const app = createApp();
      const res = await request(app).delete(
        '/bookmarks/550e8400-e29b-41d4-a716-446655440000'
      );

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 400 for invalid UUID param', async () => {
      const app = createApp();
      const res = await request(app).delete('/bookmarks/not-a-uuid');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /bookmarks', () => {
    it('returns paginated bookmarks with question details', async () => {
      const mockBookmarks = [
        {
          id: 'bm-1',
          userId: 'user-1',
          questionId: 'q-1',
          createdAt: new Date().toISOString(),
          question: {
            id: 'q-1',
            body: 'What is the diagnosis?',
            category: { id: 'cat-1', name: 'Cardiology' },
          },
        },
      ];
      vi.mocked(prisma.bookmark.findMany).mockResolvedValue(mockBookmarks as any);
      vi.mocked(prisma.bookmark.count).mockResolvedValue(1);

      const app = createApp();
      const res = await request(app).get('/bookmarks');

      expect(res.status).toBe(200);
      expect(res.body.bookmarks).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.bookmarks[0].question.category.name).toBe('Cardiology');
    });

    it('respects pagination parameters', async () => {
      vi.mocked(prisma.bookmark.findMany).mockResolvedValue([]);
      vi.mocked(prisma.bookmark.count).mockResolvedValue(0);

      const app = createApp();
      const res = await request(app).get('/bookmarks?page=2&limit=5');

      expect(res.status).toBe(200);
      expect(prisma.bookmark.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 })
      );
    });

    it('uses default pagination when no params provided', async () => {
      vi.mocked(prisma.bookmark.findMany).mockResolvedValue([]);
      vi.mocked(prisma.bookmark.count).mockResolvedValue(0);

      const app = createApp();
      const res = await request(app).get('/bookmarks');

      expect(res.status).toBe(200);
      expect(prisma.bookmark.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 20 })
      );
    });
  });
});
