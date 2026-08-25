import rateLimit, { type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { isTest } from '../config/env';
import { ErrorCode } from '../utils/apiError';

/**
 * Rate limiting.
 *
 * Limits are deliberately tiered: authentication is the credential-stuffing
 * target, AI turns are the expensive ones, and general reads are cheap.
 * Disabled under NODE_ENV=test except where a test opts in explicitly.
 */
function buildLimiter(options: Partial<Options> & { max: number; windowMs: number }) {
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Authenticated callers are limited per account so users behind a shared
    // NAT or corporate proxy do not consume each other's budget.
    keyGenerator: (req: Request) => req.user?.id ?? req.ip ?? 'unknown',
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many requests. Please wait a moment and try again.',
        },
      });
    },
    skip: () => isTest,
    ...options,
  });
}

/** Login/register: tight, to blunt credential stuffing. */
export const authLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
});

/** Every AI turn costs a paid upstream call, so it gets its own budget. */
export const aiLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 15,
});

/** Writes that touch the database. */
export const writeLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 40,
});

/** Broad backstop for everything else. */
export const globalLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: 300,
});
