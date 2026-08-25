import type { Request, Response } from 'express';
import { currentUser } from '../middleware/auth';
import { sendSuccess } from '../utils/http';
import { chatService } from '../services/chat/chat.service';
import type { CreateSessionInput, SendMessageInput } from '../schemas/chat.schema';

export const chatController = {
  async createSession(req: Request, res: Response) {
    const { timezone } = req.body as CreateSessionInput;
    const session = await chatService.createSession(currentUser(req).id, timezone);
    return sendSuccess(res, { session }, 201);
  },

  async listSessions(req: Request, res: Response) {
    const sessions = await chatService.listSessions(currentUser(req).id);
    return sendSuccess(res, { sessions });
  },

  async getSession(req: Request, res: Response) {
    const session = await chatService.getSession(currentUser(req).id, req.params.id!);
    return sendSuccess(res, { session });
  },

  async sendMessage(req: Request, res: Response) {
    const { content, timezone } = req.body as SendMessageInput;
    const result = await chatService.sendMessage(
      currentUser(req).id,
      req.params.id!,
      content,
      timezone,
    );
    return sendSuccess(res, result, 201);
  },

  async confirm(req: Request, res: Response) {
    const appointment = await chatService.confirmDraft(currentUser(req).id, req.params.id!);
    return sendSuccess(res, { appointment }, 201);
  },
};
