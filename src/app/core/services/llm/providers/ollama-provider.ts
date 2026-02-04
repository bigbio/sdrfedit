/**
 * Ollama LLM Provider
 *
 * Implements the Ollama API for local LLM inference.
 * https://github.com/ollama/ollama/blob/main/docs/api.md
 */

import {
  LlmProviderType,
  LlmProviderConfig,
  LlmMessage,
  LlmResponse,
  LlmStreamChunk,
  LlmUsage,
  LlmError,
} from '../../../models/llm';
import { BaseLlmProvider } from './base-provider';

/**
 * Ollama message format.
 */
interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Ollama chat request body.
 */
interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

/**
 * Ollama chat response.
 */
interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

/**
 * Ollama streaming response chunk.
 */
interface OllamaStreamChunk {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

/**
 * Ollama LLM Provider implementation.
 */
export class OllamaProvider extends BaseLlmProvider {
  readonly name: LlmProviderType = 'ollama';
  readonly supportsStreaming = true;

  constructor(config: Partial<LlmProviderConfig> = {}) {
    super(config);
  }

  protected getProviderType(): LlmProviderType {
    return 'ollama';
  }

  /**
   * Ollama doesn't require an API key.
   */
  override isConfigured(): boolean {
    return true;
  }

  /**
   * Sends a completion request to Ollama.
   */
  async complete(messages: LlmMessage[]): Promise<LlmResponse> {
    const url = `${this.config.baseUrl}/api/chat`;
    const body: OllamaChatRequest = {
      model: this.config.model,
      messages: this.convertMessages(messages),
      stream: false,
      options: {
        temperature: this.config.temperature,
        num_predict: this.config.maxTokens,
      },
    };

    try {
      const response = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw this.createErrorFromResponse(response.status, errorBody);
      }

      const data: OllamaChatResponse = await response.json();
      return this.convertResponse(data);
    } catch (error) {
      // Check if this is a connection/CORS error
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const isRemoteHost = typeof window !== 'undefined' &&
          !window.location.hostname.includes('localhost') &&
          !window.location.hostname.includes('127.0.0.1');

        if (isRemoteHost) {
          throw new LlmError(
            `Cannot connect to Ollama at ${this.config.baseUrl}. ` +
            `This is likely a CORS issue - Ollama running on localhost cannot be accessed from this remote site. ` +
            `Either: (1) Run the editor locally, (2) Configure Ollama with OLLAMA_ORIGINS=${window.location.origin}, ` +
            `or (3) Use a cloud AI provider like OpenAI or Anthropic.`,
            'NETWORK_ERROR',
            'ollama'
          );
        }

        throw new LlmError(
          'Cannot connect to Ollama. Make sure Ollama is running on ' + this.config.baseUrl,
          'NETWORK_ERROR',
          'ollama'
        );
      }
      throw error;
    }
  }

  /**
   * Streams a completion from Ollama.
   * Note: Ollama can be slow on first request while loading the model.
   */
  async *stream(messages: LlmMessage[]): AsyncGenerator<LlmStreamChunk, void, unknown> {
    const url = `${this.config.baseUrl}/api/chat`;
    const body: OllamaChatRequest = {
      model: this.config.model,
      messages: this.convertMessages(messages),
      stream: true,
      options: {
        temperature: this.config.temperature,
        num_predict: this.config.maxTokens,
      },
    };

    // Create new abort controller for this request
    this.abortController = new AbortController();

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw this.createErrorFromResponse(response.status, errorBody);
      }

      if (!response.body) {
        throw new Error('Response body is empty');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Ollama returns newline-delimited JSON
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const chunk: OllamaStreamChunk = JSON.parse(trimmed);

            yield {
              content: chunk.message?.content || '',
              done: chunk.done,
              finishReason: chunk.done ? 'stop' : undefined,
            };
          } catch (e) {
            console.warn('Failed to parse Ollama stream chunk:', trimmed, e);
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const chunk: OllamaStreamChunk = JSON.parse(buffer.trim());
          yield {
            content: chunk.message?.content || '',
            done: true,
            finishReason: 'stop',
          };
        } catch {
          // Ignore final buffer parse errors
        }
      }
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const isRemoteHost = typeof window !== 'undefined' &&
          !window.location.hostname.includes('localhost') &&
          !window.location.hostname.includes('127.0.0.1');

        if (isRemoteHost) {
          throw new LlmError(
            `Cannot connect to Ollama at ${this.config.baseUrl}. ` +
            `This is likely a CORS issue - Ollama running on localhost cannot be accessed from this remote site. ` +
            `Either: (1) Run the editor locally, (2) Configure Ollama with OLLAMA_ORIGINS=${window.location.origin}, ` +
            `or (3) Use a cloud AI provider like OpenAI or Anthropic.`,
            'NETWORK_ERROR',
            'ollama'
          );
        }

        throw new LlmError(
          'Cannot connect to Ollama. Make sure Ollama is running.',
          'NETWORK_ERROR',
          'ollama'
        );
      }
      // Handle abort errors gracefully
      if (error instanceof Error && error.name === 'AbortError') {
        throw new LlmError(
          'Request was cancelled',
          'ABORTED',
          'ollama'
        );
      }
      throw error;
    }
  }

  /**
   * Lists available models from Ollama.
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return (data.models || []).map((m: any) => m.name);
    } catch {
      return [];
    }
  }

  /**
   * Checks if Ollama is running and accessible.
   */
  async isRunning(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Pulls a model if not already available.
   */
  async pullModel(modelName: string): Promise<void> {
    const response = await fetch(`${this.config.baseUrl}/api/pull`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ name: modelName, stream: false }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new LlmError(
        `Failed to pull model ${modelName}: ${error}`,
        'PROVIDER_ERROR',
        'ollama'
      );
    }
  }

  // ============ Private Methods ============

  /**
   * Gets request headers.
   */
  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
    };
  }

  /**
   * Converts our message format to Ollama format.
   */
  private convertMessages(messages: LlmMessage[]): OllamaMessage[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Converts Ollama response to our format.
   */
  private convertResponse(data: OllamaChatResponse): LlmResponse {
    const usage: LlmUsage | undefined =
      data.prompt_eval_count !== undefined || data.eval_count !== undefined
        ? {
            promptTokens: data.prompt_eval_count || 0,
            completionTokens: data.eval_count || 0,
            totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
          }
        : undefined;

    return {
      content: data.message?.content || '',
      finishReason: data.done ? 'stop' : undefined,
      usage,
      raw: data,
    };
  }
}

/**
 * Factory function to create an Ollama provider.
 */
export function createOllamaProvider(
  config?: Partial<LlmProviderConfig>
): OllamaProvider {
  return new OllamaProvider(config);
}
