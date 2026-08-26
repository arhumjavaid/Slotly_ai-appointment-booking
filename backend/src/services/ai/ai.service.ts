import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { ApiError, ErrorCode } from '../../utils/apiError';
import { describeNow } from '../../utils/time';
import { aiInteractionRepository } from '../../repositories/aiInteraction.repository';
import {
  aiExtractionSchema,
  normaliseAiOutput,
  type AiExtraction,
  type StoredDraft,
} from '../../schemas/ai.schema';
import { MistralProvider } from './mistral.provider';
import { renderPrompt } from './promptRenderer';
import { AiProviderError, type AiProvider, type ChatTurn } from './provider.types';

const PRODUCT_NAME = 'Slotly';
const DEFAULT_DURATION_MINUTES = 30;
/** Turns of history sent to the model. Enough for context, bounded for cost. */
const HISTORY_TURNS = 12;

export interface ExtractionContext {
  userName: string;
  userMessage: string;
  history: ChatTurn[];
  draft: StoredDraft;
  missingFields: string[];
  readyToConfirm: boolean;
  timezone: string;
  /** The account's default appointment length; falls back to the app default. */
  defaultDurationMinutes?: number;
  /**
   * Pre-rendered catalogue of services and opening hours, injected as fact.
   * Supplied by the caller so this service stays free of database access.
   */
  servicesText?: string;
  sessionId?: string;
  userId?: string;
}

/**
 * Strips the wrappers models habitually add around JSON (code fences, a
 * sentence of preamble) and returns the outermost object.
 */
function extractJsonObject(raw: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const candidate = (fenced?.[1] ?? raw).trim();

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new SyntaxError('No JSON object found in model output');
  }

  return JSON.parse(candidate.slice(start, end + 1));
}

/**
 * AI orchestration.
 *
 * Owns everything Mistral-specific: prompt assembly, the call, and turning a
 * raw completion into validated structured data. Callers get either a
 * `AiExtraction` that has passed Zod validation, or an ApiError — they never
 * see a provider type, a prompt, or a raw model string.
 */
export class AiService {
  constructor(private readonly provider: AiProvider = new MistralProvider()) {}

  get isAvailable(): boolean {
    return this.provider.isConfigured;
  }

  /** Deterministic, model-free copy for when the AI cannot be used. */
  fallbackMessage(reason: 'ai_unavailable' | 'invalid_output' | 'too_many_attempts' | 'missing_info', missingFields: string[] = []): string {
    return renderPrompt('clarification.jinja', { reason, missing_fields: missingFields });
  }

  private buildMessages(context: ExtractionContext, repairHint?: string): ChatTurn[] {
    const now = describeNow(context.timezone);
    const defaultDuration = context.defaultDurationMinutes ?? DEFAULT_DURATION_MINUTES;

    const systemPrompt = renderPrompt('system_prompt.jinja', {
      product_name: PRODUCT_NAME,
      user_name: context.userName,
      default_duration: defaultDuration,
      now,
      draft: context.draft,
      services_text: context.servicesText ?? '',
    });

    const reminder = renderPrompt('appointment_extraction.jinja', {
      now,
      default_duration: defaultDuration,
      missing_fields: context.missingFields,
      ready_to_confirm: context.readyToConfirm,
    });

    const messages: ChatTurn[] = [
      { role: 'system', content: systemPrompt },
      ...context.history.slice(-HISTORY_TURNS),
      { role: 'user', content: `${context.userMessage}\n\n---\n${reminder}` },
    ];

    if (repairHint) {
      messages.push({ role: 'user', content: repairHint });
    }

    return messages;
  }

  /**
   * Runs one conversational turn and returns validated structured output.
   *
   * On a malformed response the model gets exactly one corrective retry; a
   * second failure is surfaced as AI_INVALID_OUTPUT so the caller can route the
   * user to the manual form instead of retrying indefinitely.
   */
  async extractBooking(context: ExtractionContext): Promise<AiExtraction> {
    if (!this.provider.isConfigured) {
      throw ApiError.aiUnavailable();
    }

    const startedAt = Date.now();
    let attempt = 0;
    let repairHint: string | undefined;
    let lastFailure = 'unknown';

    while (attempt < 2) {
      attempt += 1;
      const messages = this.buildMessages(context, repairHint);

      let completion;
      try {
        // Temperature 0: this is structured extraction, not open-ended writing.
        // Sampling variety here shows up as the same sentence resolving to a
        // different date between attempts, which is a correctness bug.
        completion = await this.provider.complete({ messages, jsonMode: true, temperature: 0 });
      } catch (error) {
        const providerError = error instanceof AiProviderError ? error : undefined;
        logger.error(
          { err: error, provider: this.provider.name, status: providerError?.status },
          'AI provider call failed',
        );
        await this.record(context, startedAt, false, ErrorCode.AI_UNAVAILABLE, messages.length);
        throw ApiError.aiUnavailable();
      }

      try {
        const parsed = aiExtractionSchema.parse(normaliseAiOutput(extractJsonObject(completion.content)));

        await this.record(context, startedAt, true, null, messages.length, {
          model: completion.model,
          finishReason: completion.finishReason,
          intent: parsed.intent,
          attempts: attempt,
          promptTokens: completion.usage?.promptTokens,
          completionTokens: completion.usage?.completionTokens,
        });

        return parsed;
      } catch (error) {
        lastFailure = error instanceof Error ? error.name : 'unknown';
        // Log that validation failed and why, but not the model's raw text —
        // it echoes user content and belongs in neither logs nor responses.
        logger.warn({ attempt, failure: lastFailure }, 'AI output failed validation');
        repairHint =
          'Your previous response was not valid. Reply with ONLY the JSON object ' +
          'described in the system message: keys intent, reply, appointment ' +
          '(appointmentType, date, startTime, durationMinutes, notes), missingFields, ' +
          'needsClarification. No markdown, no code fences, no extra text.';
      }
    }

    await this.record(context, startedAt, false, ErrorCode.AI_INVALID_OUTPUT, 0, {
      failure: lastFailure,
    });
    throw new ApiError(
      502,
      ErrorCode.AI_INVALID_OUTPUT,
      'The assistant could not produce a usable response',
    );
  }

  private record(
    context: ExtractionContext,
    startedAt: number,
    success: boolean,
    errorCode: string | null,
    turnCount: number,
    responseMeta: Record<string, unknown> = {},
  ): Promise<void> {
    // Only non-sensitive metadata is persisted: no prompts, no message bodies.
    return aiInteractionRepository.record({
      sessionId: context.sessionId ?? null,
      userId: context.userId ?? null,
      model: this.provider.model,
      requestMeta: {
        provider: this.provider.name,
        turnCount,
        historyTurns: Math.min(context.history.length, HISTORY_TURNS),
        template: 'system_prompt.jinja',
      },
      responseMeta: responseMeta as never,
      latencyMs: Date.now() - startedAt,
      success,
      errorCode,
    });
  }
}

export const aiService = new AiService();
export const DEFAULTS = { DEFAULT_DURATION_MINUTES, PRODUCT_NAME, DEFAULT_TIMEZONE: env.DEFAULT_TIMEZONE };
