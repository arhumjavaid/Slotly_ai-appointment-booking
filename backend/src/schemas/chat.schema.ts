import { z } from 'zod';
import { timezoneSchema } from './common.schema';

export const createSessionSchema = z.object({
  timezone: timezoneSchema.optional(),
});

export const sendMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(2000, 'Message must be at most 2000 characters'),
  timezone: timezoneSchema.optional(),
});

export const confirmDraftSchema = z.object({
  timezone: timezoneSchema.optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
