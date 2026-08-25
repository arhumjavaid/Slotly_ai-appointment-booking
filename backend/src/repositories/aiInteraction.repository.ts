import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { logger } from '../config/logger';

export interface AiInteractionRecord {
  sessionId?: string | null;
  userId?: string | null;
  model: string;
  requestMeta?: Prisma.InputJsonValue;
  responseMeta?: Prisma.InputJsonValue;
  latencyMs: number;
  success: boolean;
  errorCode?: string | null;
}

export const aiInteractionRepository = {
  /**
   * Analytics/debugging trail for model calls. Deliberately fire-and-forget:
   * failing to record telemetry must never fail a user's booking.
   */
  async record(record: AiInteractionRecord): Promise<void> {
    try {
      await prisma.aiInteraction.create({
        data: {
          sessionId: record.sessionId ?? null,
          userId: record.userId ?? null,
          model: record.model,
          requestMeta: record.requestMeta,
          responseMeta: record.responseMeta,
          latencyMs: record.latencyMs,
          success: record.success,
          errorCode: record.errorCode ?? null,
        },
      });
    } catch (error) {
      logger.warn({ err: error }, 'Failed to record AI interaction');
    }
  },
};
