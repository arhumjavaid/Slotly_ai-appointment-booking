import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Envelope returned by every successful endpoint. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export function sendSuccess<T>(res: Response, data: T, status = 200): Response {
  const body: ApiSuccess<T> = { success: true, data };
  return res.status(status).json(body);
}

/**
 * Wraps an async handler so rejected promises reach the global error handler
 * instead of hanging the request. Express 4 does not do this on its own.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
