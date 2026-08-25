import { env } from '../../config/env';
import { logger } from '../../config/logger';
import {
  AiProviderError,
  type AiProvider,
  type CompletionRequest,
  type CompletionResponse,
} from './provider.types';

interface MistralChoice {
  message?: { content?: unknown };
  finish_reason?: string;
}

interface MistralResponse {
  model?: string;
  choices?: MistralChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Mistral chat-completions client.
 *
 * Implemented directly against the HTTP API rather than through an SDK: the
 * surface we need is one POST, and this keeps the dependency list — and the
 * blast radius of an SDK breaking change — smaller. The API key is read from
 * the server environment and never crosses the network to the browser.
 */
export class MistralProvider implements AiProvider {
  readonly name = 'mistral';
  readonly model = env.MISTRAL_MODEL;

  get isConfigured(): boolean {
    return Boolean(env.MISTRAL_API_KEY);
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    if (!env.MISTRAL_API_KEY) {
      throw new AiProviderError('Mistral API key is not configured');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.MISTRAL_TIMEOUT_MS);

    try {
      const response = await fetch(`${env.MISTRAL_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${env.MISTRAL_API_KEY}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: request.messages,
          temperature: request.temperature ?? 0.2,
          max_tokens: request.maxTokens ?? 700,
          ...(request.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // Read the body for our own logs, but never surface it to the client:
        // upstream error payloads can echo request content.
        const body = await response.text().catch(() => '');
        logger.error(
          { status: response.status, body: body.slice(0, 500) },
          'Mistral API returned an error',
        );
        throw new AiProviderError(`Mistral API error (${response.status})`, {
          status: response.status,
        });
      }

      const payload = (await response.json()) as MistralResponse;
      const content = payload.choices?.[0]?.message?.content;

      if (typeof content !== 'string' || content.trim().length === 0) {
        throw new AiProviderError('Mistral API returned an empty completion');
      }

      return {
        content,
        model: payload.model ?? this.model,
        finishReason: payload.choices?.[0]?.finish_reason,
        usage: {
          promptTokens: payload.usage?.prompt_tokens,
          completionTokens: payload.usage?.completion_tokens,
        },
      };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AiProviderError(`Mistral API timed out after ${env.MISTRAL_TIMEOUT_MS}ms`, {
          cause: error,
        });
      }
      throw new AiProviderError('Failed to reach the Mistral API', { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }
}
