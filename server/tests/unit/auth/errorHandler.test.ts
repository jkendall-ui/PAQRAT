import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodIssueCode } from 'zod';
import { Prisma } from '@prisma/client';
import { errorHandler } from '../../../src/middleware/errorHandler';

function createMockReq(): Request {
  return {} as Request;
}

function createMockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

const next: NextFunction = vi.fn();

describe('errorHandler', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('should return 400 for ZodError with field-level details', () => {
    const zodError = new ZodError([
      {
        code: ZodIssueCode.invalid_type,
        expected: 'string',
        received: 'number',
        path: ['email'],
        message: 'Expected string, received number',
      },
    ]);

    const req = createMockReq();
    const res = createMockRes();

    errorHandler(zodError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: [
          { path: 'email', message: 'Expected string, received number' },
        ],
      },
    });
  });

  it('should return 409 for Prisma P2002 unique constraint violation', () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '6.1.0', meta: { target: ['email'] } }
    );

    const req = createMockReq();
    const res = createMockRes();

    errorHandler(prismaError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'CONFLICT',
        message: 'A record with this email already exists',
      },
    });
  });

  it('should return 404 for Prisma P2025 record not found', () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Record not found',
      { code: 'P2025', clientVersion: '6.1.0' }
    );

    const req = createMockReq();
    const res = createMockRes();

    errorHandler(prismaError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'NOT_FOUND',
        message: 'The requested record was not found',
      },
    });
  });

  it('should return 500 for other Prisma errors', () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Some other error',
      { code: 'P2003', clientVersion: '6.1.0' }
    );

    const req = createMockReq();
    const res = createMockRes();

    errorHandler(prismaError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: expect.any(String),
      },
    });
  });

  it('should return 500 for generic errors with message in non-production', () => {
    process.env.NODE_ENV = 'development';
    const error = new Error('Something broke');

    const req = createMockReq();
    const res = createMockRes();

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Something broke',
      },
    });
  });

  it('should hide error message in production', () => {
    process.env.NODE_ENV = 'production';
    const error = new Error('Secret internal details');

    const req = createMockReq();
    const res = createMockRes();

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  });

  it('should handle ZodError with nested paths', () => {
    const zodError = new ZodError([
      {
        code: ZodIssueCode.too_small,
        minimum: 1,
        type: 'string',
        inclusive: true,
        exact: false,
        path: ['options', 0, 'body'],
        message: 'String must contain at least 1 character(s)',
      },
    ]);

    const req = createMockReq();
    const res = createMockRes();

    errorHandler(zodError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const jsonCall = vi.mocked(res.json).mock.calls[0][0] as any;
    expect(jsonCall.error.details[0].path).toBe('options.0.body');
  });

  it('should handle P2002 with multiple target fields', () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '6.1.0', meta: { target: ['userId', 'questionId'] } }
    );

    const req = createMockReq();
    const res = createMockRes();

    errorHandler(prismaError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    const jsonCall = vi.mocked(res.json).mock.calls[0][0] as any;
    expect(jsonCall.error.message).toContain('userId, questionId');
  });
});
