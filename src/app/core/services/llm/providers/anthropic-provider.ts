/**
 * Anthropic LLM Provider
 *
 * Implements the Anthropic Messages API with streaming support.
 * https://docs.anthropic.com/en/api/messages
 */

import {
  LlmProviderType,
  LlmProviderConfig,
  LlmMessage,
  LlmResponse,
  LlmStreamChunk,
  LlmUsage,
} from '../../../models/llm';
import { BaseLlmProvider } from './base-provider';

/**
 * Anthropic message format.
 */
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Anthropic Messages API request body.
 */
interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  system?: string;
  max_tokens: number;
  temperature?: number;
  stream?: boolean;
}

/**
 * Anthropic Messages API response.
 */
interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Anthropic streaming event types.
 */
interface AnthropicStreamEvent {
  type: 'message_start' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_delta' | 'message_stop';
  message?: Partial<AnthropicResponse>;
  index?: number;
  content_block?: { type: 'text'; text: string };
  delta?: {
    type: 'text_delta';
    text: string;
  } | {
    stop_reason: string;
    stop_sequence: string | null;
  };
  usage?: {
    output_tokens: number;
  };
}

/**
 * Anthropic LLM Provider implementation.
 */
export class AnthropicProvider extends BaseLlmProvider {
  readonly name: LlmProviderType = 'anthropic';
  readonly supportsStreaming = true;

  private static readonly API_VERSION = '2023-06-01';

  constructor(config: Partial<LlmProviderConfig> = {}) {
    super(config);
  }

  protected getProviderType(): LlmProviderType {
    return 'anthropic';
  }

  /**
   * Sends a completion request to Anthropic.
   */
  async complete(messages: LlmMessage[]): Promise<LlmResponse> {
    this.validateConfiguration();

    const url = `${this.config.baseUrl}/messages`;
    const { system, convertedMessages } = this.convertMessages(messages);

    const body: AnthropicRequest = {
      model: this.config.model,
      messages: convertedMessages,
      max_tokens: this.config.maxTokens || 4096,
      temperature: this.config.temperature,
      stream: false,
    };

    if (system) {
      body.system = system;
    }

    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw this.createErrorFromResponse(response.status, errorBody);
    }

    const data: AnthropicResponse = await response.json();
    return this.convertResponse(data);
  }

  /**
   * Streams a completion from Anthropic.
   */
  async *stream(messages: LlmMessage[]): AsyncGenerator<LlmStreamChunk, void, unknown> {
    this.validateConfiguration();

    const url = `${this.config.baseUrl}/messages`;
    const { system, convertedMessages } = this.convertMessages(messages);

    const body: AnthropicRequest = {
      model: this.config.model,
      messages: convertedMessages,
      max_tokens: this.config.maxTokens || 4096,
      temperature: this.config.temperature,
      stream: true,
    };

    if (system) {
      body.system = system;
    }

    const reader = await this.fetchStream(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    for await (const data of this.parseSSEStream(reader)) {
      try {
        const event: AnthropicStreamEvent = JSON.parse(data);

        if (event.type === 'content_block_delta' && event.delta) {
          const delta = event.delta as { type: 'text_delta'; text: string };
          if (delta.type === 'text_delta') {
            yield {
              content: delta.text,
              done: false,
            };
          }
        } else if (event.type === 'message_delta' && event.delta) {
          const delta = event.delta as { stop_reason: string };
          if (delta.stop_reason) {
            yield {
              content: '',
              done: true,
              finishReason: delta.stop_reason,
            };
          }
        } else if (event.type === 'message_stop') {
          yield {
            content: '',
            done: true,
          };
        }
      } catch (e) {
        // Skip malformed events
        console.warn('Failed to parse Anthropic stream event:', data, e);
      }
    }
  }

  // ============ Private Methods ============

  /**
   * Gets request headers including authorization.
   */
  private getHeaders(): Record<string, string> {
    return {
      ...this.getCommonHeaders(),
      'x-api-key': this.config.apiKey || '',
      'anthropic-version': AnthropicProvider.API_VERSION,
    };
  }

  /**
   * Converts our message format to Anthropic format.
   * Extracts system message separately as Anthropic uses a different format.
   */
  private convertMessages(messages: LlmMessage[]): {
    system: string | undefined;
    convertedMessages: AnthropicMessage[];
  } {
    let system: string | undefined;
    const convertedMessages: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        // Anthropic uses a separate system parameter
        system = system ? `${system}\n\n${msg.content}` : msg.content;
      } else {
        convertedMessages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    // Ensure conversation starts with user message
    if (convertedMessages.length > 0 && convertedMessages[0].role !== 'user') {
      convertedMessages.unshift({
        role: 'user',
        content: 'Please proceed with your analysis.',
      });
    }

    return { system, convertedMessages };
  }

  /**
   * Converts Anthropic response to our format.
   */
  private convertResponse(data: AnthropicResponse): LlmResponse {
    // Extract text content
    const textContent = data.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('');

    const usage: LlmUsage | undefined = data.usage
      ? {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
        }
      : undefined;

    return {
      content: textContent,
      finishReason: this.mapFinishReason(data.stop_reason),
      usage,
      raw: data,
    };
  }

  /**
   * Maps Anthropic stop reasons to our standard format.
   */
  private mapFinishReason(
    reason: string | null
  ): 'stop' | 'length' | 'content_filter' | 'error' | undefined {
    switch (reason) {
      case 'end_turn':
      case 'stop_sequence':
        return 'stop';
      case 'max_tokens':
        return 'length';
      default:
        return undefined;
    }
  }
}

/**
 * Factory function to create an Anthropic provider.
 */
export function createAnthropicProvider(
  config?: Partial<LlmProviderConfig>
): AnthropicProvider {
  return new AnthropicProvider(config);
}
