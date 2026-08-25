import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { authLimiter } from '../middleware/rateLimit';
import { asyncHandler } from '../utils/http';
import { loginSchema, registerSchema } from '../schemas/auth.schema';

export const authRoutes = Router();

authRoutes.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  asyncHandler(authController.register),
);

authRoutes.post('/login', authLimiter, validate(loginSchema), asyncHandler(authController.login));

authRoutes.get('/me', requireAuth, asyncHandler(authController.me));

authRoutes.post('/logout', asyncHandler(authController.logout));
