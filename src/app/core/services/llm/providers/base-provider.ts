/**
 * Base LLM Provider
 *
 * Abstract base class for LLM providers implementing common functionality:
 * - Fetch with timeout and abort controller
 * - Error handling and retry logic
 * - Streaming support infrastructure
 */

import {
  LlmProviderType,
  LlmProviderConfig,
  LlmMessage,
  LlmResponse,
  LlmStreamChunk,
  LlmError,
  LlmErrorCode,
  DEFAULT_PROVIDER_CONFIGS,
} from '../../../models/llm';

/**
 * Interface that all LLM providers must implement.
 */
export interface ILlmProvider {
  /** Provider type identifier */
  readonly name: LlmProviderType;

  /** Whether this provider supports streaming */
  readonly supportsStreaming: boolean;

  /** Check if the provider is properly configured */
  isConfigured(): boolean;

  /** Get the current configuration */
  getConfig(): LlmProviderConfig;

  /** Update the configuration */
  setConfig(config: Partial<LlmProviderConfig>): void;

  /** Send messages and get a complete response */
  complete(messages: LlmMessage[]): Promise<LlmResponse>;

  /** Send messages and stream the response */
  stream(messages: LlmMessage[]): AsyncGenerator<LlmStreamChunk, void, unknown>;

  /** Abort any in-progress requests */
  abort(): void;
}

/**
 * Abstract base class for LLM providers.
 */
export abstract class BaseLlmProvider implements ILlmProvider {
  abstract readonly name: LlmProviderType;
  abstract readonly supportsStreaming: boolean;

  protected config: LlmProviderConfig;
  protected abortController: AbortController | null = null;

  constructor(config: Partial<LlmProviderConfig> = {}) {
    // Get defaults for this provider type
    const providerType = this.getProviderType();
    const defaults = DEFAULT_PROVIDER_CONFIGS[providerType];

    this.config = {
      provider: providerType,
      ...defaults,
      ...config,
    } as LlmProviderConfig;
  }

  /**
   * Gets the provider type for this class.
   * Subclasses should override this if needed during construction.
   */
  protected abstract getProviderType(): LlmProviderType;

  /**
   * Checks if the provider is configured with required credentials.
   */
  isConfigured(): boolean {
    // Ollama doesn't require an API key
    if (this.config.provider === 'ollama') {
      return true;
    }
    return !!this.config.apiKey && this.config.apiKey.length > 0;
  }

  /**
   * Gets the current configuration.
   */
  getConfig(): LlmProviderConfig {
    return { ...this.config };
  }

  /**
   * Updates the configuration.
   */
  setConfig(config: Partial<LlmProviderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Aborts any in-progress requests.
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Abstract method for sending a completion request.
   */
  abstract complete(messages: LlmMessage[]): Promise<LlmResponse>;

  /**
   * Abstract method for streaming a response.
   */
  abstract stream(messages: LlmMessage[]): AsyncGenerator<LlmStreamChunk, void, unknown>;

  // ============ Protected Helper Methods ============

  /**
   * Makes a fetch request with timeout and abort handling.
   */
  protected async fetchWithTimeout(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    // Create new abort controller for this request
    this.abortController = new AbortController();

    const timeoutId = setTimeout(() => {
      this.abortController?.abort();
    }, this.config.timeoutMs || 60000);

    try {
      const response = await fetch(url, {
        ...options,
        signal: this.abortController.signal,
      });

      return response;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new LlmError(
            'Request was aborted or timed out',
            'TIMEOUT',
            this.config.provider
          );
        }
        throw new LlmError(
          `Network error: ${error.message}`,
          'NETWORK_ERROR',
          this.config.provider,
          error
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Makes a streaming fetch request.
   */
  protected async fetchStream(
    url: string,
    options: RequestInit
  ): Promise<ReadableStreamDefaultReader<Uint8Array>> {
    const response = await this.fetchWithTimeout(url, options);

    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Unknown error');
      throw this.createErrorFromResponse(response.status, errorBody);
    }

    if (!response.body) {
      throw new LlmError(
        'Response body is empty',
        'PROVIDER_ERROR',
        this.config.provider
      );
    }

    return response.body.getReader();
  }

  /**
   * Parses Server-Sent Events (SSE) from a stream.
   */
  protected async *parseSSEStream(
    reader: ReadableStreamDefaultReader<Uint8Array>
  ): AsyncGenerator<string, void, unknown> {
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();

          // Skip empty lines and comments
          if (!trimmed || trimmed.startsWith(':')) {
            continue;
          }

          // Parse data lines
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);

            // Skip [DONE] marker
            if (data === '[DONE]') {
              return;
            }

            yield data;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Creates an appropriate error from an HTTP response.
   */
  protected createErrorFromResponse(status: number, body: string): LlmError {
    let code: LlmErrorCode = 'PROVIDER_ERROR';
    let message = `API error (${status})`;

    // Try to parse error details
    try {
      const parsed = JSON.parse(body);
      message = parsed.error?.message || parsed.message || message;
    } catch {
      // Use raw body if not JSON
      if (body.length < 200) {
        message = body || message;
      }
    }

    // Map status codes to error codes
    switch (status) {
      case 401:
        code = 'INVALID_API_KEY';
        message = 'Invalid API key. Please check your configuration.';
        break;
      case 429:
        code = 'RATE_LIMITED';
        message = 'Rate limit exceeded. Please wait before trying again.';
        break;
      case 408:
      case 504:
        code = 'TIMEOUT';
        break;
    }

    return new LlmError(message, code, this.config.provider, { status, body });
  }

  /**
   * Validates that the provider is configured before making requests.
   */
  protected validateConfiguration(): void {
    if (!this.isConfigured()) {
      throw new LlmError(
        `${this.name} provider is not configured. Please provide an API key.`,
        'NOT_CONFIGURED',
        this.config.provider
      );
    }
  }

  /**
   * Gets headers common to all requests.
   */
  protected getCommonHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
    };
  }
}

/**
 * Utility to create a provider instance by type.
 */
export type ProviderFactory = (config?: Partial<LlmProviderConfig>) => ILlmProvider;
