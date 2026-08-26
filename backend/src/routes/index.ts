import { Router } from 'express';
import { prisma } from '../db/prisma';
import { sendSuccess } from '../utils/http';
import { asyncHandler } from '../utils/http';
import { aiService } from '../services/ai/ai.service';
import { authRoutes } from './auth.routes';
import { appointmentRoutes } from './appointment.routes';
import { chatRoutes } from './chat.routes';
import { availabilityRoutes } from './availability.routes';

export const apiRouter = Router();

apiRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    // Reports dependency reachability without exposing connection details.
    let database = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = true;
    } catch {
      database = false;
    }

    return sendSuccess(
      res,
      {
        status: database ? 'ok' : 'degraded',
        database,
        ai: aiService.isAvailable ? 'configured' : 'not_configured',
        uptimeSeconds: Math.round(process.uptime()),
      },
      database ? 200 : 503,
    );
  }),
);

apiRouter.use('/auth', authRoutes);
apiRouter.use('/appointments', appointmentRoutes);
apiRouter.use('/chat', chatRoutes);
apiRouter.use('/availability', availabilityRoutes);
