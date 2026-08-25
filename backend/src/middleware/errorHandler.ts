import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { isProduction } from '../config/env';
import { logger } from '../config/logger';
import { ApiError, ErrorCode } from '../utils/apiError';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`No route matches ${req.method} ${req.path}`));
}

/** Maps known error types onto the public error contract. */
function normalise(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof ZodError) {
    return ApiError.badRequest(
      'The submitted data is invalid',
      error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        message: issue.message,
      })),
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return ApiError.conflict(ErrorCode.CONFLICT, 'That value is already in use');
    }
    if (error.code === 'P2025') {
      return ApiError.notFound();
    }
  }

  if (error instanceof SyntaxError && 'body' in error) {
    return ApiError.badRequest('Request body is not valid JSON');
  }

  return ApiError.internal();
}

/**
 * Single exit point for every error in the application.
 *
 * Unexpected errors are logged in full server-side but reported to the client
 * as a bare 500: stack traces, Prisma messages and upstream API responses never
 * cross the wire in production.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  const apiError = normalise(error);
  const isUnexpected = apiError.status >= 500;

  if (isUnexpected) {
    logger.error(
      { err: error, method: req.method, path: req.path, requestId: req.id },
      'Unhandled application error',
    );
  } else {
    logger.debug(
      { code: apiError.code, method: req.method, path: req.path },
      'Request rejected',
    );
  }

  res.status(apiError.status).json({
    success: false,
    error: {
      code: apiError.code,
      message: isUnexpected && isProduction ? 'Something went wrong' : apiError.message,
      ...(apiError.details ? { details: apiError.details } : {}),
      // Stack traces are a development affordance only.
      ...(!isProduction && isUnexpected && error instanceof Error
        ? { stack: error.stack?.split('\n').slice(0, 5) }
        : {}),
    },
  });
}
