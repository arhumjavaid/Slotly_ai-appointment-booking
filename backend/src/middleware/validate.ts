import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodSchema } from 'zod';
import { ApiError } from '../utils/apiError';

type Source = 'body' | 'query' | 'params';

/**
 * Replaces the raw request segment with the schema's parsed output.
 *
 * Downstream handlers therefore only ever see validated, coerced, stripped data
 * — unknown keys sent by a client cannot reach a service or Prisma.
 */
export function validate(schema: ZodSchema, source: Source = 'body'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      next(
        ApiError.badRequest(
          'The submitted data is invalid',
          result.error.issues.map((issue) => ({
            field: issue.path.join('.') || source,
            message: issue.message,
          })),
        ),
      );
      return;
    }

    if (source === 'query') {
      // Express 5 exposes `query` as a getter; assign the parsed value onto a
      // dedicated property instead of mutating it.
      Object.defineProperty(req, 'validatedQuery', { value: result.data, configurable: true });
    } else {
      req[source] = result.data;
    }

    next();
  };
}

/** Reads the parsed query produced by `validate(schema, 'query')`. */
export function validatedQuery<T>(req: Request): T {
  return (req as Request & { validatedQuery?: T }).validatedQuery ?? (req.query as T);
}
