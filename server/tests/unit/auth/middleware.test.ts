import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../../../src/middleware/auth';
import { requireAdmin } from '../../../src/middleware/roleCheck';

vi.mock('jsonwebtoken');

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    ...overrides,
  } as Request;
}

function createMockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe('authMiddleware', () => {
  const next: NextFunction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
  });

  it('should return 401 when Authorization header is missing', () => {
    const req = createMockReq();
    const res = createMockRes();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when Authorization header is not Bearer format', () => {
    const req = createMockReq({ headers: { authorization: 'Basic abc123' } as any });
    const res = createMockRes();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 401 when JWT is expired or invalid', () => {
    vi.mocked(jwt.verify).mockImplementation(() => {
      throw new Error('jwt expired');
    });

    const req = createMockReq({ headers: { authorization: 'Bearer expired-token' } as any });
    const res = createMockRes();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should attach req.user and call next() for a valid JWT', () => {
    vi.mocked(jwt.verify).mockReturnValue({ userId: 'user-1', role: 'student' } as any);

    const req = createMockReq({ headers: { authorization: 'Bearer valid-token' } as any });
    const res = createMockRes();

    authMiddleware(req, res, next);

    expect(req.user).toEqual({ userId: 'user-1', role: 'student' });
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should pass the token and JWT_SECRET to jwt.verify', () => {
    vi.mocked(jwt.verify).mockReturnValue({ userId: 'u', role: 'admin' } as any);

    const req = createMockReq({ headers: { authorization: 'Bearer my-token' } as any });
    const res = createMockRes();

    authMiddleware(req, res, next);

    expect(jwt.verify).toHaveBeenCalledWith('my-token', 'test-secret');
  });
});

describe('requireAdmin', () => {
  const next: NextFunction = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 403 when req.user is not set', () => {
    const req = createMockReq();
    const res = createMockRes();

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'FORBIDDEN', message: 'Admin access required' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 403 when req.user.role is student', () => {
    const req = createMockReq();
    req.user = { userId: 'user-1', role: 'student' };
    const res = createMockRes();

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'FORBIDDEN', message: 'Admin access required' },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() when req.user.role is admin', () => {
    const req = createMockReq();
    req.user = { userId: 'admin-1', role: 'admin' };
    const res = createMockRes();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
