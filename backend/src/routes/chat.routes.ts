import { Router } from 'express';
import { chatController } from '../controllers/chat.controller';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { aiLimiter, writeLimiter } from '../middleware/rateLimit';
import { asyncHandler } from '../utils/http';
import { idParamSchema } from '../schemas/common.schema';
import { confirmDraftSchema, createSessionSchema, sendMessageSchema } from '../schemas/chat.schema';

export const chatRoutes = Router();

chatRoutes.use(requireAuth);

chatRoutes.post(
  '/sessions',
  writeLimiter,
  validate(createSessionSchema),
  asyncHandler(chatController.createSession),
);

chatRoutes.get('/sessions', asyncHandler(chatController.listSessions));

chatRoutes.get(
  '/sessions/:id',
  validate(idParamSchema, 'params'),
  asyncHandler(chatController.getSession),
);

// The AI limiter guards the only endpoint that spends money upstream.
chatRoutes.post(
  '/sessions/:id/messages',
  aiLimiter,
  validate(idParamSchema, 'params'),
  validate(sendMessageSchema),
  asyncHandler(chatController.sendMessage),
);

chatRoutes.post(
  '/sessions/:id/confirm',
  writeLimiter,
  validate(idParamSchema, 'params'),
  validate(confirmDraftSchema),
  asyncHandler(chatController.confirm),
);
