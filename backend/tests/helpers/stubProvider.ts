import type {
  AiProvider,
  CompletionRequest,
  CompletionResponse,
} from '../../src/services/ai/provider.types';
import { AiProviderError } from '../../src/services/ai/provider.types';

/**
 * Scripted stand-in for Mistral.
 *
 * Because the application depends on the `AiProvider` interface rather than on
 * Mistral directly, the whole conversation pipeline — prompt rendering,
 * parsing, validation, draft merging, promotion — can be exercised
 * deterministically and without a network call or an API key.
 */
export class StubProvider implements AiProvider {
  readonly name = 'stub';
  readonly model = 'stub-model';
  readonly isConfigured = true;

  /** Prompts the service sent, for asserting on context injection. */
  readonly calls: CompletionRequest[] = [];

  constructor(private readonly responses: Array<string | Error>) {}

  complete(request: CompletionRequest): Promise<CompletionResponse> {
    this.calls.push(request);

    const next = this.responses.shift();
    if (next === undefined) {
      throw new Error('StubProvider ran out of scripted responses');
    }
    if (next instanceof Error) {
      return Promise.reject(next);
    }

    return Promise.resolve({
      content: next,
      model: this.model,
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 40 },
    });
  }
}

export function unavailableProvider(): StubProvider {
  return new StubProvider([new AiProviderError('Mistral API error (503)', { status: 503 })]);
}

interface ExtractionShape {
  intent?: string;
  reply?: string;
  appointmentType?: string | null;
  date?: string | null;
  startTime?: string | null;
  durationMinutes?: number | null;
  notes?: string | null;
  missingFields?: string[];
  needsClarification?: boolean;
}

/** Builds a well-formed model response. */
export function extraction(shape: ExtractionShape): string {
  return JSON.stringify({
    intent: shape.intent ?? 'book_appointment',
    reply: shape.reply ?? 'Sure — what time works for you?',
    appointment: {
      appointmentType: shape.appointmentType ?? null,
      date: shape.date ?? null,
      startTime: shape.startTime ?? null,
      durationMinutes: shape.durationMinutes ?? null,
      notes: shape.notes ?? null,
    },
    missingFields: shape.missingFields ?? [],
    needsClarification: shape.needsClarification ?? false,
  });
}
