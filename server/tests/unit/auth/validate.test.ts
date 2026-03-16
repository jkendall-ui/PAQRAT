import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../../../src/middleware/validate';

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    query: {},
    params: {},
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

describe('validate middleware', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it('should call next() when no schemas are provided', () => {
    const req = createMockReq();
    const res = createMockRes();

    validate({})(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should call next() when body passes validation', () => {
    const schema = z.object({ email: z.string().email() });
    const req = createMockReq({ body: { email: 'test@example.com' } });
    const res = createMockRes();

    validate({ body: schema })(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 400 when body fails validation', () => {
    const schema = z.object({ email: z.string().email() });
    const req = createMockReq({ body: { email: 'not-an-email' } });
    const res = createMockRes();

    validate({ body: schema })(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            path: 'body.email',
            message: expect.any(String),
          }),
        ]),
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 400 when query fails validation', () => {
    const schema = z.object({ page: z.coerce.number().min(1) });
    const req = createMockReq({ query: { page: '0' } as any });
    const res = createMockRes();

    validate({ query: schema })(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringContaining('query.'),
          }),
        ]),
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return 400 when params fail validation', () => {
    const schema = z.object({ id: z.string().uuid() });
    const req = createMockReq({ params: { id: 'not-a-uuid' } as any });
    const res = createMockRes();

    validate({ params: schema })(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: expect.arrayContaining([
          expect.objectContaining({
            path: 'params.id',
          }),
        ]),
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should aggregate errors from body, query, and params', () => {
    const bodySchema = z.object({ name: z.string().min(1) });
    const querySchema = z.object({ page: z.coerce.number().min(1) });
    const paramsSchema = z.object({ id: z.string().uuid() });

    const req = createMockReq({
      body: { name: '' },
      query: { page: '-1' } as any,
      params: { id: 'bad' } as any,
    });
    const res = createMockRes();

    validate({ body: bodySchema, query: querySchema, params: paramsSchema })(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const jsonCall = vi.mocked(res.json).mock.calls[0][0] as any;
    expect(jsonCall.error.details.length).toBeGreaterThanOrEqual(3);
    expect(next).not.toHaveBeenCalled();
  });

  it('should replace req.body with parsed data on success', () => {
    const schema = z.object({ count: z.coerce.number() });
    const req = createMockReq({ body: { count: '5' } });
    const res = createMockRes();

    validate({ body: schema })(req, res, next);

    expect(req.body).toEqual({ count: 5 });
    expect(next).toHaveBeenCalled();
  });

  it('should strip unknown fields when schema uses strict or default behavior', () => {
    const schema = z.object({ name: z.string() });
    const req = createMockReq({ body: { name: 'Alice', extra: 'field' } });
    const res = createMockRes();

    validate({ body: schema })(req, res, next);

    expect(req.body).toEqual({ name: 'Alice' });
    expect(next).toHaveBeenCalled();
  });
});
