import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: { path: string; message: string }[];
  };
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Zod validation errors → 400
  if (err instanceof ZodError) {
    const response: ErrorResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    };
    res.status(400).json(response);
    return;
  }

  // Prisma known request errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[])?.join(', ') || 'unknown field';
      const response: ErrorResponse = {
        error: {
          code: 'CONFLICT',
          message: `A record with this ${target} already exists`,
        },
      };
      res.status(409).json(response);
      return;
    }

    if (err.code === 'P2025') {
      const response: ErrorResponse = {
        error: {
          code: 'NOT_FOUND',
          message: 'The requested record was not found',
        },
      };
      res.status(404).json(response);
      return;
    }
  }

  // All other errors → 500
  const isProduction = process.env.NODE_ENV === 'production';
  const response: ErrorResponse = {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: isProduction ? 'An unexpected error occurred' : err.message || 'An unexpected error occurred',
    },
  };
  res.status(500).json(response);
}
