import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { ApiError } from '../utils/apiError';
import { verifyAuthToken } from '../utils/security';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; email: string };
    }
  }
}

/**
 * Populates `req.user` from the HttpOnly cookie, or the Authorization header as
 * a convenience for API clients and tests. Every protected route mounts this,
 * so no controller ever has to trust a client-supplied user id.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.[env.COOKIE_NAME];
  const header = req.headers.authorization;
  const bearerToken = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  const token = cookieToken ?? bearerToken;

  if (!token) {
    next(ApiError.unauthorized());
    return;
  }

  try {
    const payload = verifyAuthToken(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    // Expired and tampered tokens are indistinguishable to the client on purpose.
    next(ApiError.unauthorized('Your session has expired. Please sign in again.'));
  }
}

/** Narrows `req.user` for handlers mounted behind `requireAuth`. */
export function currentUser(req: Request): { id: string; email: string } {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}
