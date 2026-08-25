/**
 * Provider-agnostic interface for the chat model.
 *
 * The rest of the application depends only on this contract, so swapping
 * Mistral for another provider (or a deterministic stub in tests) is a one-line
 * change in the AI service and touches nothing else.
 */

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  messages: ChatTurn[];
  /** Ask the provider for strict JSON where it supports doing so. */
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface CompletionUsage {
  promptTokens?: number;
  completionTokens?: number;
}

export interface CompletionResponse {
  content: string;
  model: string;
  finishReason?: string;
  usage?: CompletionUsage;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  readonly isConfigured: boolean;
  complete(request: CompletionRequest): Promise<CompletionResponse>;
}

/** Raised when the provider is unreachable, times out, or errors. */
export class AiProviderError extends Error {
  override readonly cause?: unknown;
  readonly status?: number;

  constructor(message: string, options: { status?: number; cause?: unknown } = {}) {
    super(message);
    this.name = 'AiProviderError';
    this.status = options.status;
    this.cause = options.cause;
  }
}
