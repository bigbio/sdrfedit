/**
 * AI Worker Service
 *
 * Service to communicate with the AI Web Worker for non-blocking LLM API calls.
 * Supports streaming responses back to the main thread.
 */

import { Injectable, OnDestroy } from '@angular/core';
import {
  LlmProviderType,
  LlmProviderConfig,
  LlmMessage,
  LlmResponse,
} from '../models/llm';

/**
 * Request sent to the AI Worker.
 */
interface AiWorkerRequest {
  id: string;
  type: 'stream' | 'complete' | 'abort';
  provider: LlmProviderType;
  config: LlmProviderConfig;
  messages: LlmMessage[];
}

/**
 * Response received from the AI Worker.
 */
interface AiWorkerResponse {
  id: string;
  type: 'chunk' | 'complete' | 'error' | 'aborted';
  content?: string;
  error?: string;
}

/**
 * Callbacks for a pending request.
 */
interface PendingRequest {
  onChunk: (chunk: string) => void;
  onComplete: (content: string) => void;
  onError: (error: string) => void;
}

@Injectable({
  providedIn: 'root',
})
export class AiWorkerService implements OnDestroy {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private isInitialized = false;

  constructor() {
    this.initWorker();
  }

  ngOnDestroy(): void {
    this.terminate();
  }

  /**
   * Initialize the AI Worker.
   */
  private initWorker(): void {
    if (typeof Worker === 'undefined') {
      console.warn('Web Workers are not supported in this browser');
      return;
    }

    try {
      this.worker = new Worker(
        new URL('../../workers/ai.worker', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (event: MessageEvent<AiWorkerResponse>) => {
        this.handleWorkerMessage(event.data);
      };

      this.worker.onerror = (error) => {
        console.error('AI Worker error:', error);
        // Reject all pending requests
        for (const [id, callbacks] of this.pendingRequests) {
          callbacks.onError(`Worker error: ${error.message}`);
          this.pendingRequests.delete(id);
        }
      };

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize AI Worker:', error);
    }
  }

  /**
   * Handle messages from the worker.
   */
  private handleWorkerMessage(response: AiWorkerResponse): void {
    // Skip init message
    if (response.id === 'init') {
      return;
    }

    const callbacks = this.pendingRequests.get(response.id);
    if (!callbacks) {
      return;
    }

    switch (response.type) {
      case 'chunk':
        if (response.content) {
          callbacks.onChunk(response.content);
        }
        break;

      case 'complete':
        callbacks.onComplete(response.content || '');
        this.pendingRequests.delete(response.id);
        break;

      case 'error':
        callbacks.onError(response.error || 'Unknown error');
        this.pendingRequests.delete(response.id);
        break;

      case 'aborted':
        callbacks.onError('Request was aborted');
        this.pendingRequests.delete(response.id);
        break;
    }
  }

  /**
   * Check if the worker is available.
   */
  isAvailable(): boolean {
    return this.isInitialized && this.worker !== null;
  }

  /**
   * Stream a completion from an LLM provider.
   *
   * @param provider The provider to use
   * @param config Provider configuration
   * @param messages Messages to send
   * @param onChunk Callback for each chunk received
   * @returns Promise that resolves with the full content
   */
  stream(
    provider: LlmProviderType,
    config: LlmProviderConfig,
    messages: LlmMessage[],
    onChunk: (chunk: string) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.isAvailable()) {
        reject(new Error('AI Worker is not available'));
        return;
      }

      const id = crypto.randomUUID();

      this.pendingRequests.set(id, {
        onChunk,
        onComplete: resolve,
        onError: reject,
      });

      const request: AiWorkerRequest = {
        id,
        type: 'stream',
        provider,
        config,
        messages,
      };

      this.worker!.postMessage(request);
    });
  }

  /**
   * Get a complete response from an LLM provider (non-streaming).
   *
   * @param provider The provider to use
   * @param config Provider configuration
   * @param messages Messages to send
   * @returns Promise that resolves with the response
   */
  complete(
    provider: LlmProviderType,
    config: LlmProviderConfig,
    messages: LlmMessage[]
  ): Promise<LlmResponse> {
    return new Promise((resolve, reject) => {
      if (!this.isAvailable()) {
        reject(new Error('AI Worker is not available'));
        return;
      }

      const id = crypto.randomUUID();

      this.pendingRequests.set(id, {
        onChunk: () => {}, // Ignore chunks for complete
        onComplete: (content) => {
          resolve({
            content,
            finishReason: 'stop',
          });
        },
        onError: reject,
      });

      const request: AiWorkerRequest = {
        id,
        type: 'complete',
        provider,
        config,
        messages,
      };

      this.worker!.postMessage(request);
    });
  }

  /**
   * Stream a completion and return an async generator.
   *
   * This allows using for-await-of syntax:
   * ```typescript
   * for await (const chunk of aiWorker.streamGenerator(provider, config, messages)) {
   *   console.log(chunk);
   * }
   * ```
   */
  async *streamGenerator(
    provider: LlmProviderType,
    config: LlmProviderConfig,
    messages: LlmMessage[]
  ): AsyncGenerator<string, string, unknown> {
    if (!this.isAvailable()) {
      throw new Error('AI Worker is not available');
    }

    const id = crypto.randomUUID();
    const chunks: string[] = [];
    let resolveChunk: ((value: string | null) => void) | null = null;
    let rejectChunk: ((error: Error) => void) | null = null;
    let done = false;
    let fullContent = '';

    this.pendingRequests.set(id, {
      onChunk: (chunk) => {
        chunks.push(chunk);
        if (resolveChunk) {
          resolveChunk(chunks.shift()!);
          resolveChunk = null;
        }
      },
      onComplete: (content) => {
        done = true;
        fullContent = content;
        if (resolveChunk) {
          resolveChunk(null);
          resolveChunk = null;
        }
      },
      onError: (error) => {
        done = true;
        if (rejectChunk) {
          rejectChunk(new Error(error));
          rejectChunk = null;
        }
      },
    });

    const request: AiWorkerRequest = {
      id,
      type: 'stream',
      provider,
      config,
      messages,
    };

    this.worker!.postMessage(request);

    try {
      while (!done || chunks.length > 0) {
        if (chunks.length > 0) {
          yield chunks.shift()!;
        } else if (!done) {
          const chunk = await new Promise<string | null>((resolve, reject) => {
            resolveChunk = resolve;
            rejectChunk = reject;
          });

          if (chunk !== null) {
            yield chunk;
          }
        }
      }

      return fullContent;
    } finally {
      this.pendingRequests.delete(id);
    }
  }

  /**
   * Abort a pending request.
   */
  abort(requestId: string): void {
    if (!this.worker) return;

    const request: AiWorkerRequest = {
      id: requestId,
      type: 'abort',
      provider: 'openai', // Ignored for abort
      config: {} as LlmProviderConfig,
      messages: [],
    };

    this.worker.postMessage(request);
    this.pendingRequests.delete(requestId);
  }

  /**
   * Abort all pending requests.
   */
  abortAll(): void {
    for (const id of this.pendingRequests.keys()) {
      this.abort(id);
    }
  }

  /**
   * Terminate the worker.
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
      this.pendingRequests.clear();
    }
  }

  /**
   * Restart the worker.
   */
  restart(): void {
    this.terminate();
    this.initWorker();
  }
}
