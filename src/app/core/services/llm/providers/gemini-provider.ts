/**
 * Google Gemini LLM Provider
 *
 * Implements the Google AI Generative Language API with streaming support.
 * https://ai.google.dev/api/generate-content
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
 * Gemini content part.
 */
interface GeminiPart {
  text: string;
}

/**
 * Gemini content (message).
 */
interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

/**
 * Gemini generation config.
 */
interface GeminiGenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
}

/**
 * Gemini API request body.
 */
interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: {
    parts: GeminiPart[];
  };
  generationConfig?: GeminiGenerationConfig;
}

/**
 * Gemini API response.
 */
interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: GeminiPart[];
      role: string;
    };
    finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

/**
 * Gemini streaming response chunk.
 */
interface GeminiStreamChunk {
  candidates?: Array<{
    content?: {
      parts?: GeminiPart[];
      role?: string;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

/**
 * Google Gemini LLM Provider implementation.
 */
export class GeminiProvider extends BaseLlmProvider {
  readonly name: LlmProviderType = 'gemini';
  readonly supportsStreaming = true;

  constructor(config: Partial<LlmProviderConfig> = {}) {
    super(config);
  }

  protected getProviderType(): LlmProviderType {
    return 'gemini';
  }

  /**
   * Sends a completion request to Gemini.
   */
  async complete(messages: LlmMessage[]): Promise<LlmResponse> {
    this.validateConfiguration();

    const url = this.buildUrl('generateContent');
    const body = this.buildRequestBody(messages);

    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw this.createErrorFromResponse(response.status, errorBody);
    }

    const data: GeminiResponse = await response.json();
    return this.convertResponse(data);
  }

  /**
   * Streams a completion from Gemini.
   */
  async *stream(messages: LlmMessage[]): AsyncGenerator<LlmStreamChunk, void, unknown> {
    this.validateConfiguration();

    const url = this.buildUrl('streamGenerateContent');
    const body = this.buildRequestBody(messages);

    // Gemini uses a different streaming format (not SSE)
    this.abortController = new AbortController();

    const timeoutId = setTimeout(() => {
      this.abortController?.abort();
    }, this.config.timeoutMs || 60000);

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

        // Gemini returns newline-delimited JSON
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === '[' || trimmed === ']' || trimmed === ',') {
            continue;
          }

          // Remove leading/trailing brackets or commas
          let jsonStr = trimmed;
          if (jsonStr.startsWith('[')) jsonStr = jsonStr.slice(1);
          if (jsonStr.endsWith(']')) jsonStr = jsonStr.slice(0, -1);
          if (jsonStr.endsWith(',')) jsonStr = jsonStr.slice(0, -1);

          if (!jsonStr.trim()) continue;

          try {
            const chunk: GeminiStreamChunk = JSON.parse(jsonStr);
            const candidate = chunk.candidates?.[0];

            if (candidate?.content?.parts) {
              const text = candidate.content.parts
                .filter((p) => p.text)
                .map((p) => p.text)
                .join('');

              yield {
                content: text,
                done: !!candidate.finishReason,
                finishReason: candidate.finishReason || undefined,
              };
            }
          } catch (e) {
            // Skip malformed chunks
            console.warn('Failed to parse Gemini stream chunk:', jsonStr, e);
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          let jsonStr = buffer.trim();
          if (jsonStr.endsWith(']')) jsonStr = jsonStr.slice(0, -1);
          if (jsonStr.endsWith(',')) jsonStr = jsonStr.slice(0, -1);

          if (jsonStr) {
            const chunk: GeminiStreamChunk = JSON.parse(jsonStr);
            const candidate = chunk.candidates?.[0];

            if (candidate?.content?.parts) {
              const text = candidate.content.parts
                .filter((p) => p.text)
                .map((p) => p.text)
                .join('');

              yield {
                content: text,
                done: true,
                finishReason: candidate.finishReason || 'STOP',
              };
            }
          }
        } catch {
          // Ignore final buffer parse errors
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ============ Private Methods ============

  /**
   * Builds the API URL.
   */
  private buildUrl(action: string): string {
    const model = this.config.model;
    const apiKey = this.config.apiKey;
    return `${this.config.baseUrl}/models/${model}:${action}?key=${apiKey}`;
  }

  /**
   * Gets request headers.
   */
  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
    };
  }

  /**
   * Builds the request body.
   */
  private buildRequestBody(messages: LlmMessage[]): GeminiRequest {
    const { system, contents } = this.convertMessages(messages);

    const body: GeminiRequest = {
      contents,
      generationConfig: {
        temperature: this.config.temperature,
        maxOutputTokens: this.config.maxTokens,
      },
    };

    if (system) {
      body.systemInstruction = {
        parts: [{ text: system }],
      };
    }

    return body;
  }

  /**
   * Converts our message format to Gemini format.
   */
  private convertMessages(messages: LlmMessage[]): {
    system: string | undefined;
    contents: GeminiContent[];
  } {
    let system: string | undefined;
    const contents: GeminiContent[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        system = system ? `${system}\n\n${msg.content}` : msg.content;
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    // Ensure conversation starts with user
    if (contents.length > 0 && contents[0].role !== 'user') {
      contents.unshift({
        role: 'user',
        parts: [{ text: 'Please proceed with your analysis.' }],
      });
    }

    return { system, contents };
  }

  /**
   * Converts Gemini response to our format.
   */
  private convertResponse(data: GeminiResponse): LlmResponse {
    const candidate = data.candidates?.[0];

    // Extract text content
    const content = candidate?.content?.parts
      ?.filter((p) => p.text)
      .map((p) => p.text)
      .join('') || '';

    const usage: LlmUsage | undefined = data.usageMetadata
      ? {
          promptTokens: data.usageMetadata.promptTokenCount,
          completionTokens: data.usageMetadata.candidatesTokenCount,
          totalTokens: data.usageMetadata.totalTokenCount,
        }
      : undefined;

    return {
      content,
      finishReason: this.mapFinishReason(candidate?.finishReason),
      usage,
      raw: data,
    };
  }

  /**
   * Maps Gemini finish reasons to our standard format.
   */
  private mapFinishReason(
    reason: string | undefined
  ): 'stop' | 'length' | 'content_filter' | 'error' | undefined {
    switch (reason) {
      case 'STOP':
        return 'stop';
      case 'MAX_TOKENS':
        return 'length';
      case 'SAFETY':
      case 'RECITATION':
        return 'content_filter';
      default:
        return undefined;
    }
  }
}

/**
 * Factory function to create a Gemini provider.
 */
export function createGeminiProvider(
  config?: Partial<LlmProviderConfig>
): GeminiProvider {
  return new GeminiProvider(config);
}
