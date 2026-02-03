/**
 * OpenAI LLM Provider
 *
 * Implements the OpenAI Chat Completions API with streaming support.
 * https://platform.openai.com/docs/api-reference/chat/create
 */

import {
  LlmProviderType,
  LlmProviderConfig,
  LlmMessage,
  LlmResponse,
  LlmStreamChunk,
  LlmError,
  LlmUsage,
} from '../../../models/llm';
import { BaseLlmProvider } from './base-provider';

/**
 * OpenAI-specific message format.
 */
interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * OpenAI Chat Completion request body.
 */
interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

/**
 * OpenAI Chat Completion response.
 */
interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI streaming chunk.
 */
interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }>;
}

/**
 * OpenAI LLM Provider implementation.
 */
export class OpenAIProvider extends BaseLlmProvider {
  readonly name: LlmProviderType = 'openai';
  readonly supportsStreaming = true;

  constructor(config: Partial<LlmProviderConfig> = {}) {
    super(config);
  }

  protected getProviderType(): LlmProviderType {
    return 'openai';
  }

  /**
   * Sends a completion request to OpenAI.
   */
  async complete(messages: LlmMessage[]): Promise<LlmResponse> {
    this.validateConfiguration();

    const url = `${this.config.baseUrl}/chat/completions`;
    const body: OpenAIChatRequest = {
      model: this.config.model,
      messages: this.convertMessages(messages),
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream: false,
    };

    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw this.createErrorFromResponse(response.status, errorBody);
    }

    const data: OpenAIChatResponse = await response.json();
    return this.convertResponse(data);
  }

  /**
   * Streams a completion from OpenAI.
   */
  async *stream(messages: LlmMessage[]): AsyncGenerator<LlmStreamChunk, void, unknown> {
    this.validateConfiguration();

    const url = `${this.config.baseUrl}/chat/completions`;
    const body: OpenAIChatRequest = {
      model: this.config.model,
      messages: this.convertMessages(messages),
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream: true,
    };

    const reader = await this.fetchStream(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    for await (const data of this.parseSSEStream(reader)) {
      try {
        const chunk: OpenAIStreamChunk = JSON.parse(data);
        const choice = chunk.choices[0];

        if (choice) {
          yield {
            content: choice.delta.content || '',
            done: choice.finish_reason !== null,
            finishReason: choice.finish_reason || undefined,
          };
        }
      } catch (e) {
        // Skip malformed chunks
        console.warn('Failed to parse OpenAI stream chunk:', data, e);
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
      'Authorization': `Bearer ${this.config.apiKey}`,
    };
  }

  /**
   * Converts our message format to OpenAI format.
   */
  private convertMessages(messages: LlmMessage[]): OpenAIMessage[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Converts OpenAI response to our format.
   */
  private convertResponse(data: OpenAIChatResponse): LlmResponse {
    const choice = data.choices[0];

    const usage: LlmUsage | undefined = data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined;

    return {
      content: choice?.message?.content || '',
      finishReason: this.mapFinishReason(choice?.finish_reason),
      usage,
      raw: data,
    };
  }

  /**
   * Maps OpenAI finish reasons to our standard format.
   */
  private mapFinishReason(
    reason: string | undefined
  ): 'stop' | 'length' | 'content_filter' | 'error' | undefined {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      default:
        return undefined;
    }
  }
}

/**
 * Factory function to create an OpenAI provider.
 */
export function createOpenAIProvider(config?: Partial<LlmProviderConfig>): OpenAIProvider {
  return new OpenAIProvider(config);
}
