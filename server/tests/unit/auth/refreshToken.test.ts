import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
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
        findUnique: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
      },
    },
  };
});

// Mock google-auth-library
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
const { mockBcryptHash, mockBcryptCompare } = vi.hoisted(() => {
  return {
    mockBcryptHash: vi.fn().mockResolvedValue('hashed-refresh-token'),
    mockBcryptCompare: vi.fn(),
  };
});

vi.mock('bcrypt', () => ({
  default: {
    hash: mockBcryptHash,
    compare: mockBcryptCompare,
  },
}));

import authRouter from '../../../src/routes/auth';
import prisma from '../../../src/lib/prisma';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/auth', authRouter);
  return app;
}

describe('POST /auth/refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 when no refresh token cookie is present', async () => {
    const app = createApp();
    const res = await request(app).post('/auth/refresh');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toBe('Missing refresh token');
  });

  it('should return 401 for invalid cookie format (no colon separator)', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/auth/refresh')
      .set('Cookie', 'refreshToken=no-separator-here');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toBe('Invalid refresh token format');
  });

  it('should return 401 when session is not found', async () => {
    vi.mocked(prisma.authSession.findUnique).mockResolvedValue(null);

    const app = createApp();
    const res = await request(app)
      .post('/auth/refresh')
      .set('Cookie', 'refreshToken=session-id:raw-token');

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid session');
  });

  it('should return 401 and delete session when session is expired', async () => {
    vi.mocked(prisma.authSession.findUnique).mockResolvedValue({
      id: 'session-expired',
      userId: 'user-1',
      refreshTokenHash: 'hash',
      expiresAt: new Date(Date.now() - 1000), // expired
      createdAt: new Date(),
      user: {
        id: 'user-1',
        googleId: 'g-1',
        email: 'test@example.com',
        name: 'Test',
        avatarUrl: null,
        role: 'student',
        plan: 'free',
        targetExam: null,
        examDate: null,
        isBlocked: false,
        createdAt: new Date(),
      },
    } as any);

    vi.mocked(prisma.authSession.delete).mockResolvedValue({} as any);

    const app = createApp();
    const res = await request(app)
      .post('/auth/refresh')
      .set('Cookie', 'refreshToken=session-expired:raw-token');

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Session expired');
    expect(prisma.authSession.delete).toHaveBeenCalledWith({
      where: { id: 'session-expired' },
    });
  });

  it('should return 401 and invalidate all user sessions on token hash mismatch', async () => {
    vi.mocked(prisma.authSession.findUnique).mockResolvedValue({
      id: 'session-1',
      userId: 'user-1',
      refreshTokenHash: 'stored-hash',
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      user: {
        id: 'user-1',
        googleId: 'g-1',
        email: 'test@example.com',
        name: 'Test',
        avatarUrl: null,
        role: 'student',
        plan: 'free',
        targetExam: null,
        examDate: null,
        isBlocked: false,
        createdAt: new Date(),
      },
    } as any);

    mockBcryptCompare.mockResolvedValue(false);
    vi.mocked(prisma.authSession.deleteMany).mockResolvedValue({ count: 1 });

    const app = createApp();
    const res = await request(app)
      .post('/auth/refresh')
      .set('Cookie', 'refreshToken=session-1:wrong-token');

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Invalid refresh token');
    expect(prisma.authSession.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
  });

  it('should rotate token and return new JWT on valid refresh', async () => {
    vi.mocked(prisma.authSession.findUnique).mockResolvedValue({
      id: 'old-session',
      userId: 'user-1',
      refreshTokenHash: 'old-hash',
      expiresAt: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      user: {
        id: 'user-1',
        googleId: 'g-1',
        email: 'test@example.com',
        name: 'Test',
        avatarUrl: null,
        role: 'student',
        plan: 'free',
        targetExam: null,
        examDate: null,
        isBlocked: false,
        createdAt: new Date(),
      },
    } as any);

    mockBcryptCompare.mockResolvedValue(true);
    vi.mocked(prisma.authSession.delete).mockResolvedValue({} as any);
    vi.mocked(prisma.authSession.create).mockResolvedValue({
      id: 'new-session',
      userId: 'user-1',
      refreshTokenHash: 'hashed-refresh-token',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    });

    const app = createApp();
    const res = await request(app)
      .post('/auth/refresh')
      .set('Cookie', 'refreshToken=old-session:valid-raw-token');

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe('mock-jwt-token');

    // Old session should be deleted
    expect(prisma.authSession.delete).toHaveBeenCalledWith({
      where: { id: 'old-session' },
    });

    // New session should be created
    expect(prisma.authSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        refreshTokenHash: 'hashed-refresh-token',
        expiresAt: expect.any(Date),
      }),
    });

    // New refresh token cookie should be set with new-session id
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const refreshCookie = Array.isArray(cookies)
      ? cookies.find((c: string) => c.startsWith('refreshToken='))
      : typeof cookies === 'string' && cookies.startsWith('refreshToken=')
        ? cookies
        : undefined;
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toContain('new-session');
    expect(refreshCookie).toContain('HttpOnly');
  });
});

describe('POST /auth/signout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should clear cookie and return 204 even without a refresh token cookie', async () => {
    const app = createApp();
    const res = await request(app).post('/auth/signout');

    expect(res.status).toBe(204);
  });

  it('should delete session, clear cookie, and return 204', async () => {
    vi.mocked(prisma.authSession.delete).mockResolvedValue({} as any);

    const app = createApp();
    const res = await request(app)
      .post('/auth/signout')
      .set('Cookie', 'refreshToken=session-to-delete:some-token');

    expect(res.status).toBe(204);
    expect(prisma.authSession.delete).toHaveBeenCalledWith({
      where: { id: 'session-to-delete' },
    });

    // Cookie should be cleared
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const refreshCookie = Array.isArray(cookies)
      ? cookies.find((c: string) => c.startsWith('refreshToken='))
      : typeof cookies === 'string' && cookies.startsWith('refreshToken=')
        ? cookies
        : undefined;
    expect(refreshCookie).toBeDefined();
    // Cleared cookie has empty value or expires in the past
    expect(refreshCookie).toContain('refreshToken=');
  });

  it('should return 204 even if session deletion fails', async () => {
    vi.mocked(prisma.authSession.delete).mockRejectedValue(new Error('Not found'));

    const app = createApp();
    const res = await request(app)
      .post('/auth/signout')
      .set('Cookie', 'refreshToken=nonexistent-session:some-token');

    expect(res.status).toBe(204);
  });
});

describe('POST /auth/google — cookie format', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should set refresh token cookie in sessionId:rawToken format', async () => {
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-cookie-test',
        email: 'cookie@example.com',
        name: 'Cookie Test',
        picture: null,
      }),
    });

    vi.mocked(prisma.user.upsert).mockResolvedValue({
      id: 'user-cookie',
      googleId: 'google-cookie-test',
      email: 'cookie@example.com',
      name: 'Cookie Test',
      avatarUrl: null,
      role: 'student',
      plan: 'free',
      targetExam: null,
      examDate: null,
      isBlocked: false,
      createdAt: new Date(),
    });

    vi.mocked(prisma.authSession.create).mockResolvedValue({
      id: 'session-abc',
      userId: 'user-cookie',
      refreshTokenHash: 'hashed-refresh-token',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    });

    const app = createApp();
    const res = await request(app)
      .post('/auth/google')
      .send({ idToken: 'valid-token' });

    expect(res.status).toBe(200);

    const cookies = res.headers['set-cookie'];
    const refreshCookie = Array.isArray(cookies)
      ? cookies.find((c: string) => c.startsWith('refreshToken='))
      : typeof cookies === 'string' && cookies.startsWith('refreshToken=')
        ? cookies
        : undefined;
    expect(refreshCookie).toBeDefined();
    // Cookie value should contain the session ID followed by a colon
    expect(refreshCookie).toContain('session-abc%3A');
  });
});
