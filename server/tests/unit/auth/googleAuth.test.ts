import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock prisma
vi.mock('../../../src/lib/prisma', () => {
  return {
    default: {
      user: {
        upsert: vi.fn(),
      },
      authSession: {
        create: vi.fn(),
      },
    },
  };
});

// Mock google-auth-library — use vi.hoisted to avoid TDZ issues
const { mockVerifyIdToken } = vi.hoisted(() => {
  const mockVerifyIdToken = vi.fn();
  return { mockVerifyIdToken };
});

vi.mock('google-auth-library', () => {
  return {
    OAuth2Client: class {
      verifyIdToken = mockVerifyIdToken;
    },
  };
});

// Mock jsonwebtoken
vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn().mockReturnValue('mock-jwt-token'),
  },
}));

// Mock bcrypt
vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed-refresh-token'),
  },
}));

import authRouter from '../../../src/routes/auth';
import prisma from '../../../src/lib/prisma';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  return app;
}

describe('POST /auth/google', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 for invalid Google ID token', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));

    const app = createApp();
    const res = await request(app)
      .post('/auth/google')
      .send({ idToken: 'invalid-token' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toBe('Invalid Google ID token');
  });

  it('should return 401 when payload is missing sub or email', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ sub: null, email: null }),
    });

    const app = createApp();
    const res = await request(app)
      .post('/auth/google')
      .send({ idToken: 'token-with-bad-payload' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('should return 403 for blocked users', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-123',
        email: 'blocked@example.com',
        name: 'Blocked User',
        picture: 'https://example.com/avatar.jpg',
      }),
    });

    vi.mocked(prisma.user.upsert).mockResolvedValue({
      id: 'user-1',
      googleId: 'google-123',
      email: 'blocked@example.com',
      name: 'Blocked User',
      avatarUrl: 'https://example.com/avatar.jpg',
      role: 'student',
      plan: 'free',
      targetExam: null,
      examDate: null,
      isBlocked: true,
      createdAt: new Date(),
    });

    const app = createApp();
    const res = await request(app)
      .post('/auth/google')
      .send({ idToken: 'valid-token' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toBe('Your account has been suspended.');
  });

  it('should return 200 with accessToken and user for valid token', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-456',
        email: 'student@example.com',
        name: 'Test Student',
        picture: 'https://example.com/pic.jpg',
      }),
    });

    vi.mocked(prisma.user.upsert).mockResolvedValue({
      id: 'user-2',
      googleId: 'google-456',
      email: 'student@example.com',
      name: 'Test Student',
      avatarUrl: 'https://example.com/pic.jpg',
      role: 'student',
      plan: 'free',
      targetExam: null,
      examDate: null,
      isBlocked: false,
      createdAt: new Date(),
    });

    vi.mocked(prisma.authSession.create).mockResolvedValue({
      id: 'session-1',
      userId: 'user-2',
      refreshTokenHash: 'hashed-refresh-token',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    });

    const app = createApp();
    const res = await request(app)
      .post('/auth/google')
      .send({ idToken: 'valid-token' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe('mock-jwt-token');
    expect(res.body.user).toEqual({
      id: 'user-2',
      email: 'student@example.com',
      name: 'Test Student',
      avatarUrl: 'https://example.com/pic.jpg',
      role: 'student',
      plan: 'free',
    });

    // Verify refresh token cookie is set
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const refreshCookie = Array.isArray(cookies)
      ? cookies.find((c: string) => c.startsWith('refreshToken='))
      : typeof cookies === 'string' && cookies.startsWith('refreshToken=')
        ? cookies
        : undefined;
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('HttpOnly');
    expect(refreshCookie).toContain('SameSite=Lax');
  });

  it('should create user with role=student and plan=free for new users', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-new',
        email: 'new@example.com',
        name: 'New User',
        picture: null,
      }),
    });

    vi.mocked(prisma.user.upsert).mockResolvedValue({
      id: 'user-new',
      googleId: 'google-new',
      email: 'new@example.com',
      name: 'New User',
      avatarUrl: null,
      role: 'student',
      plan: 'free',
      targetExam: null,
      examDate: null,
      isBlocked: false,
      createdAt: new Date(),
    });

    vi.mocked(prisma.authSession.create).mockResolvedValue({
      id: 'session-new',
      userId: 'user-new',
      refreshTokenHash: 'hashed-refresh-token',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    });

    const app = createApp();
    await request(app)
      .post('/auth/google')
      .send({ idToken: 'valid-token' });

    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          role: 'student',
          plan: 'free',
        }),
      })
    );
  });

  it('should store hashed refresh token in AuthSession', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-789',
        email: 'session@example.com',
        name: 'Session User',
        picture: null,
      }),
    });

    vi.mocked(prisma.user.upsert).mockResolvedValue({
      id: 'user-session',
      googleId: 'google-789',
      email: 'session@example.com',
      name: 'Session User',
      avatarUrl: null,
      role: 'student',
      plan: 'free',
      targetExam: null,
      examDate: null,
      isBlocked: false,
      createdAt: new Date(),
    });

    vi.mocked(prisma.authSession.create).mockResolvedValue({
      id: 'session-x',
      userId: 'user-session',
      refreshTokenHash: 'hashed-refresh-token',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    });

    const app = createApp();
    await request(app)
      .post('/auth/google')
      .send({ idToken: 'valid-token' });

    expect(prisma.authSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-session',
        refreshTokenHash: 'hashed-refresh-token',
        expiresAt: expect.any(Date),
      }),
    });
  });
});
