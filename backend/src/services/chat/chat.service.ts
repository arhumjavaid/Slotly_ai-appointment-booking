import type { ChatMessage } from '@prisma/client';
import { env } from '../../config/env';
import { ApiError, ErrorCode } from '../../utils/apiError';
import { chatRepository } from '../../repositories/chat.repository';
import {
  emptyDraft,
  storedDraftSchema,
  type AiExtraction,
  type StoredDraft,
} from '../../schemas/ai.schema';
import { createAppointmentSchema } from '../../schemas/appointment.schema';
import { AiService, aiService as defaultAiService } from '../ai/ai.service';
import type { ChatTurn } from '../ai/provider.types';
import { appointmentService, type AppointmentView } from '../appointments/appointment.service';

const DEFAULT_DURATION_MINUTES = 30;
const HISTORY_LIMIT = 24;
/** After this many assistant turns without a complete draft, offer the form. */
const STALLED_TURN_THRESHOLD = 6;

/**
 * Fields the user must actually supply. Duration is intentionally not here:
 * a sensible default is applied at promotion time so the assistant does not
 * interrogate the user about something they rarely care about.
 */
const REQUIRED_FIELDS = ['appointmentType', 'date', 'startTime'] as const;

export interface ChatMessageView {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string;
  structured: unknown;
}

export interface DraftView {
  appointmentType: string | null;
  date: string | null;
  startTime: string | null;
  durationMinutes: number | null;
  notes: string | null;
  timezone: string;
}

export interface ChatTurnResult {
  message: ChatMessageView;
  draft: DraftView;
  missingFields: string[];
  readyToConfirm: boolean;
  suggestManual: boolean;
  aiAvailable: boolean;
  appointment: AppointmentView | null;
  sessionStatus: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
}

function toMessageView(message: ChatMessage): ChatMessageView {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    structured: message.structured ?? null,
  };
}

function toDraftView(draft: StoredDraft, fallbackTimezone: string): DraftView {
  return {
    appointmentType: draft.appointmentType,
    date: draft.date,
    startTime: draft.startTime,
    durationMinutes: draft.durationMinutes,
    notes: draft.notes,
    timezone: draft.timezone ?? fallbackTimezone,
  };
}

/** Reads the persisted draft defensively — stored JSON is still validated. */
function readDraft(raw: unknown, timezone: string): StoredDraft {
  const parsed = storedDraftSchema.safeParse(raw);
  return parsed.success ? parsed.data : emptyDraft(timezone);
}

function missingFieldsOf(draft: StoredDraft): string[] {
  return REQUIRED_FIELDS.filter((field) => draft[field] === null || draft[field] === undefined);
}

/**
 * Merges the model's proposal into the server-held draft.
 *
 * Only non-null values overwrite, so a turn where the model "forgets" an
 * earlier detail cannot erase it. This is the reason the draft lives on the
 * server: the conversation state is ours, not the model's.
 */
function mergeDraft(current: StoredDraft, proposal: AiExtraction['appointment']): StoredDraft {
  return {
    appointmentType: proposal.appointmentType ?? current.appointmentType,
    date: proposal.date ?? current.date,
    startTime: proposal.startTime ?? current.startTime,
    durationMinutes: proposal.durationMinutes ?? current.durationMinutes,
    notes: proposal.notes ?? current.notes,
    timezone: current.timezone,
  };
}

export class ChatService {
  constructor(private readonly ai: AiService = defaultAiService) {}

  async createSession(userId: string, timezone?: string) {
    const tz = timezone ?? env.DEFAULT_TIMEZONE;
    const session = await chatRepository.createSession(userId, emptyDraft(tz) as never);

    const greeting = this.ai.isAvailable
      ? "Hi — what would you like to book? Tell me the kind of appointment and when suits you."
      : this.ai.fallbackMessage('ai_unavailable');

    const message = await chatRepository.addMessage(session.id, 'ASSISTANT', greeting);
    const draft = readDraft(session.draft, tz);

    return {
      id: session.id,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      messages: [toMessageView(message)],
      draft: toDraftView(draft, tz),
      missingFields: missingFieldsOf(draft),
      readyToConfirm: false,
      aiAvailable: this.ai.isAvailable,
    };
  }

  async getSession(userId: string, sessionId: string) {
    const session = await chatRepository.findOwnedSessionWithMessages(sessionId, userId);
    if (!session) throw ApiError.notFound('Chat session not found');

    const draft = readDraft(session.draft, env.DEFAULT_TIMEZONE);
    const missingFields = missingFieldsOf(draft);

    return {
      id: session.id,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      messages: session.messages.map(toMessageView),
      draft: toDraftView(draft, env.DEFAULT_TIMEZONE),
      missingFields,
      readyToConfirm: missingFields.length === 0 && session.status === 'ACTIVE',
      aiAvailable: this.ai.isAvailable,
    };
  }

  async listSessions(userId: string) {
    const sessions = await chatRepository.listSessions(userId);
    return sessions.map((session) => ({
      id: session.id,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    }));
  }

  /**
   * Processes one user turn.
   *
   * The model's only influence is on the *draft* and the reply text. Whether an
   * appointment actually gets created is decided here, from the server-held
   * draft, and executed by the appointment service after full re-validation.
   */
  async sendMessage(
    userId: string,
    sessionId: string,
    content: string,
    timezone?: string,
  ): Promise<ChatTurnResult> {
    const session = await chatRepository.findOwnedSession(sessionId, userId);
    if (!session) throw ApiError.notFound('Chat session not found');
    if (session.status !== 'ACTIVE') {
      throw ApiError.conflict(ErrorCode.CONFLICT, 'This conversation has already been completed');
    }

    const tz = timezone ?? env.DEFAULT_TIMEZONE;
    let draft = readDraft(session.draft, tz);
    draft = { ...draft, timezone: draft.timezone ?? tz };

    await chatRepository.addMessage(sessionId, 'USER', content);

    const history = await chatRepository.recentMessages(sessionId, HISTORY_LIMIT);
    const priorTurns: ChatTurn[] = history
      .slice(0, -1)
      .map((message) => ({
        role: message.role === 'USER' ? ('user' as const) : ('assistant' as const),
        content: message.content,
      }));

    const missingBefore = missingFieldsOf(draft);

    let extraction: AiExtraction;
    try {
      extraction = await this.ai.extractBooking({
        userName: 'the user',
        userMessage: content,
        history: priorTurns,
        draft,
        missingFields: missingBefore,
        readyToConfirm: missingBefore.length === 0,
        timezone: draft.timezone ?? tz,
        sessionId,
        userId,
      });
    } catch (error) {
      // The AI must not be a single point of failure for booking: record a
      // helpful assistant turn and point the user at the manual form.
      return this.degrade(error, sessionId, draft, tz);
    }

    draft = mergeDraft(draft, extraction.appointment);
    const missingAfter = missingFieldsOf(draft);
    const readyToConfirm = missingAfter.length === 0;

    let appointment: AppointmentView | null = null;
    let replyText = extraction.reply;

    if (extraction.intent === 'confirm_appointment' && readyToConfirm) {
      appointment = await this.promoteDraft(userId, sessionId, draft);
      replyText = `Booked — your ${appointment.appointmentType} appointment is confirmed for ${appointment.date} at ${appointment.startTime}.`;
    } else if (extraction.intent === 'confirm_appointment' && !readyToConfirm) {
      // The model believed the user confirmed, but the server-side draft is
      // still incomplete. The server's view wins.
      replyText = this.ai.fallbackMessage('missing_info', missingAfter);
    }

    const assistantMessage = await chatRepository.addMessage(
      sessionId,
      'ASSISTANT',
      replyText,
      {
        intent: extraction.intent,
        draft: draft as never,
        missingFields: missingAfter,
        readyToConfirm,
        appointmentId: appointment?.id ?? null,
      } as never,
    );

    if (!appointment) {
      await chatRepository.updateDraft(sessionId, draft as never);
    }

    const assistantTurns = history.filter((m) => m.role === 'ASSISTANT').length + 1;

    return {
      message: toMessageView(assistantMessage),
      draft: toDraftView(draft, tz),
      missingFields: missingAfter,
      readyToConfirm: readyToConfirm && !appointment,
      suggestManual:
        !appointment &&
        (extraction.intent === 'unclear' || assistantTurns >= STALLED_TURN_THRESHOLD) &&
        missingAfter.length > 0,
      aiAvailable: true,
      appointment,
      sessionStatus: appointment ? 'COMPLETED' : 'ACTIVE',
    };
  }

  /** Explicit confirmation from the summary card's button. */
  async confirmDraft(userId: string, sessionId: string): Promise<AppointmentView> {
    const session = await chatRepository.findOwnedSession(sessionId, userId);
    if (!session) throw ApiError.notFound('Chat session not found');
    if (session.status !== 'ACTIVE') {
      throw ApiError.conflict(ErrorCode.CONFLICT, 'This conversation has already been completed');
    }

    const draft = readDraft(session.draft, env.DEFAULT_TIMEZONE);
    const missing = missingFieldsOf(draft);
    if (missing.length > 0) {
      throw new ApiError(
        400,
        ErrorCode.DRAFT_INCOMPLETE,
        `The booking is still missing: ${missing.join(', ')}`,
      );
    }

    return this.promoteDraft(userId, sessionId, draft);
  }

  /**
   * Promotes a draft to a real appointment.
   *
   * The draft is re-validated with `createAppointmentSchema` — the exact schema
   * the manual form is validated against — before the appointment service is
   * called. AI-derived data therefore clears the same bar as typed input, and
   * the AI itself never touches Prisma.
   */
  private async promoteDraft(
    userId: string,
    sessionId: string,
    draft: StoredDraft,
  ): Promise<AppointmentView> {
    const candidate = {
      appointmentType: draft.appointmentType,
      date: draft.date,
      startTime: draft.startTime,
      durationMinutes: draft.durationMinutes ?? DEFAULT_DURATION_MINUTES,
      notes: draft.notes,
      timezone: draft.timezone ?? env.DEFAULT_TIMEZONE,
    };

    const parsed = createAppointmentSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new ApiError(
        400,
        ErrorCode.DRAFT_INCOMPLETE,
        'The collected appointment details are not valid',
        parsed.error.issues.map((issue) => ({
          field: String(issue.path[0] ?? 'draft'),
          message: issue.message,
        })),
      );
    }

    const appointment = await appointmentService.create(userId, parsed.data, { source: 'AI' });
    await chatRepository.completeSession(sessionId, draft as never);
    return appointment;
  }

  /** Turns an AI failure into a usable conversational turn. */
  private async degrade(
    error: unknown,
    sessionId: string,
    draft: StoredDraft,
    timezone: string,
  ): Promise<ChatTurnResult> {
    const code = error instanceof ApiError ? error.code : ErrorCode.AI_UNAVAILABLE;
    if (!(error instanceof ApiError)) throw error;
    if (code !== ErrorCode.AI_UNAVAILABLE && code !== ErrorCode.AI_INVALID_OUTPUT) throw error;

    const reason = code === ErrorCode.AI_UNAVAILABLE ? 'ai_unavailable' : 'invalid_output';
    const message = await chatRepository.addMessage(
      sessionId,
      'ASSISTANT',
      this.ai.fallbackMessage(reason),
    );

    const missing = missingFieldsOf(draft);
    return {
      message: toMessageView(message),
      draft: toDraftView(draft, timezone),
      missingFields: missing,
      readyToConfirm: false,
      suggestManual: true,
      aiAvailable: code !== ErrorCode.AI_UNAVAILABLE,
      appointment: null,
      sessionStatus: 'ACTIVE',
    };
  }
}

export const chatService = new ChatService();
