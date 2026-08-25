import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { authLimiter } from '../middleware/rateLimit';
import { asyncHandler } from '../utils/http';
import {
  changePasswordSchema,
  deleteAccountSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from '../schemas/auth.schema';

export const authRoutes = Router();

authRoutes.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  asyncHandler(authController.register),
);

authRoutes.post('/login', authLimiter, validate(loginSchema), asyncHandler(authController.login));

authRoutes.get('/me', requireAuth, asyncHandler(authController.me));

authRoutes.patch(
  '/me',
  requireAuth,
  validate(updateProfileSchema),
  asyncHandler(authController.updateProfile),
);

// Both of these take a password in the body, so they sit behind the same
// rate limiter as sign-in rather than the general one.
authRoutes.post(
  '/change-password',
  requireAuth,
  authLimiter,
  validate(changePasswordSchema),
  asyncHandler(authController.changePassword),
);

authRoutes.delete(
  '/me',
  requireAuth,
  authLimiter,
  validate(deleteAccountSchema),
  asyncHandler(authController.deleteAccount),
);

authRoutes.post('/logout', asyncHandler(authController.logout));
