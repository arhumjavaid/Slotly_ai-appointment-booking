import type { ChatMessage, ChatRole, ChatSession, Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';

export type ChatSessionWithMessages = ChatSession & { messages: ChatMessage[] };

export const chatRepository = {
  createSession(userId: string, draft: Prisma.InputJsonValue): Promise<ChatSession> {
    return prisma.chatSession.create({ data: { userId, draft } });
  },

  findOwnedSession(id: string, userId: string): Promise<ChatSession | null> {
    return prisma.chatSession.findFirst({ where: { id, userId } });
  },

  findOwnedSessionWithMessages(
    id: string,
    userId: string,
    messageLimit = 100,
  ): Promise<ChatSessionWithMessages | null> {
    return prisma.chatSession.findFirst({
      where: { id, userId },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: messageLimit } },
    });
  },

  listSessions(userId: string, limit = 20) {
    return prisma.chatSession.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
  },

  /** Most recent turns, returned oldest-first, for building model context. */
  async recentMessages(sessionId: string, limit: number): Promise<ChatMessage[]> {
    const rows = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.reverse();
  },

  addMessage(
    sessionId: string,
    role: ChatRole,
    content: string,
    structured?: Prisma.InputJsonValue,
  ): Promise<ChatMessage> {
    return prisma.chatMessage.create({
      data: { sessionId, role, content, ...(structured === undefined ? {} : { structured }) },
    });
  },

  updateDraft(sessionId: string, draft: Prisma.InputJsonValue): Promise<ChatSession> {
    return prisma.chatSession.update({ where: { id: sessionId }, data: { draft } });
  },

  completeSession(sessionId: string, draft: Prisma.InputJsonValue): Promise<ChatSession> {
    return prisma.chatSession.update({
      where: { id: sessionId },
      data: { status: 'COMPLETED', draft },
    });
  },
};
