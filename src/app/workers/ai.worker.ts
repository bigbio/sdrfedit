/// <reference lib="webworker" />

/**
 * AI Web Worker
 *
 * Handles LLM API calls in a separate thread to prevent blocking the UI.
 * Supports streaming responses back to the main thread.
 */

// ============ Types ============

export type LlmProviderType = 'openai' | 'anthropic' | 'gemini' | 'ollama';
export type LlmMessageRole = 'system' | 'user' | 'assistant';

export interface LlmMessage {
  role: LlmMessageRole;
  content: string;
}

export interface LlmProviderConfig {
  provider: LlmProviderType;
  apiKey?: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
}

export interface AiWorkerRequest {
  id: string;
  type: 'stream' | 'complete' | 'abort';
  provider: LlmProviderType;
  config: LlmProviderConfig;
  messages: LlmMessage[];
}

export interface AiWorkerResponse {
  id: string;
  type: 'chunk' | 'complete' | 'error' | 'aborted';
  content?: string;
  error?: string;
}

// ============ Default Configs ============

const DEFAULT_CONFIGS: Record<LlmProviderType, Partial<LlmProviderConfig>> = {
  openai: {
    model: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
    timeoutMs: 60000,
    maxTokens: 4096,
    temperature: 0.3,
  },
  anthropic: {
    model: 'claude-sonnet-4-20250514',
    baseUrl: 'https://api.anthropic.com/v1',
    timeoutMs: 60000,
    maxTokens: 4096,
    temperature: 0.3,
  },
  gemini: {
    model: 'gemini-2.0-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    timeoutMs: 60000,
    maxTokens: 4096,
    temperature: 0.3,
  },
  ollama: {
    model: 'qwen3',
    baseUrl: 'http://localhost:11434',
    timeoutMs: 120000,
    maxTokens: 4096,
    temperature: 0.3,
  },
};

// ============ Request Tracking ============

const abortControllers = new Map<string, AbortController>();

// ============ Streaming Implementations ============

/**
 * Stream from OpenAI API
 */
async function* streamOpenAI(
  config: LlmProviderConfig,
  messages: LlmMessage[],
  signal: AbortSignal
): AsyncGenerator<string> {
  const url = `${config.baseUrl}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${error}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          if (data === '[DONE]') return;

          try {
            const chunk = JSON.parse(data);
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch {
            // Skip malformed chunks
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Stream from Anthropic API
 */
async function* streamAnthropic(
  config: LlmProviderConfig,
  messages: LlmMessage[],
  signal: AbortSignal
): AsyncGenerator<string> {
  const url = `${config.baseUrl}/messages`;

  // Separate system message
  let systemPrompt: string | undefined;
  const convertedMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemPrompt = systemPrompt ? `${systemPrompt}\n\n${msg.content}` : msg.content;
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

  const body: Record<string, unknown> = {
    model: config.model,
    messages: convertedMessages,
    max_tokens: config.maxTokens || 4096,
    temperature: config.temperature,
    stream: true,
  };

  if (systemPrompt) {
    body.system = systemPrompt;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${error}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          try {
            const event = JSON.parse(data);
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              yield event.delta.text;
            }
          } catch {
            // Skip malformed events
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Stream from Google Gemini API
 */
async function* streamGemini(
  config: LlmProviderConfig,
  messages: LlmMessage[],
  signal: AbortSignal
): AsyncGenerator<string> {
  // Separate system message and convert to Gemini format
  let systemInstruction: string | undefined;
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction = systemInstruction ? `${systemInstruction}\n\n${msg.content}` : msg.content;
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

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: config.temperature,
      maxOutputTokens: config.maxTokens,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const url = `${config.baseUrl}/models/${config.model}:streamGenerateContent?key=${config.apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${error}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        let jsonStr = line.trim();
        if (!jsonStr || jsonStr === '[' || jsonStr === ']' || jsonStr === ',') continue;

        // Remove array brackets and commas
        if (jsonStr.startsWith('[')) jsonStr = jsonStr.slice(1);
        if (jsonStr.endsWith(']')) jsonStr = jsonStr.slice(0, -1);
        if (jsonStr.endsWith(',')) jsonStr = jsonStr.slice(0, -1);
        if (!jsonStr.trim()) continue;

        try {
          const chunk = JSON.parse(jsonStr);
          const text = chunk.candidates?.[0]?.content?.parts
            ?.filter((p: { text?: string }) => p.text)
            .map((p: { text: string }) => p.text)
            .join('');
          if (text) yield text;
        } catch {
          // Skip malformed chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Stream from Ollama API
 */
async function* streamOllama(
  config: LlmProviderConfig,
  messages: LlmMessage[],
  signal: AbortSignal
): AsyncGenerator<string> {
  const url = `${config.baseUrl}/api/chat`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      stream: true,
      options: {
        temperature: config.temperature,
        num_predict: config.maxTokens,
      },
    }),
    signal,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama API error (${response.status}): ${error}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const chunk = JSON.parse(trimmed);
          if (chunk.message?.content) {
            yield chunk.message.content;
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ============ Main Stream Function ============

async function* streamFromProvider(
  request: AiWorkerRequest,
  signal: AbortSignal
): AsyncGenerator<string> {
  const config: LlmProviderConfig = {
    ...DEFAULT_CONFIGS[request.provider],
    ...request.config,
  };

  switch (request.provider) {
    case 'openai':
      yield* streamOpenAI(config, request.messages, signal);
      break;
    case 'anthropic':
      yield* streamAnthropic(config, request.messages, signal);
      break;
    case 'gemini':
      yield* streamGemini(config, request.messages, signal);
      break;
    case 'ollama':
      yield* streamOllama(config, request.messages, signal);
      break;
    default:
      throw new Error(`Unknown provider: ${request.provider}`);
  }
}

// ============ Non-Streaming Implementations ============

async function completeFromProvider(
  request: AiWorkerRequest,
  signal: AbortSignal
): Promise<string> {
  // For simplicity, use streaming and accumulate
  let content = '';
  for await (const chunk of streamFromProvider(request, signal)) {
    content += chunk;
  }
  return content;
}

// ============ Message Handler ============

addEventListener('message', async (event: MessageEvent<AiWorkerRequest>) => {
  const request = event.data;

  // Handle abort request
  if (request.type === 'abort') {
    const controller = abortControllers.get(request.id);
    if (controller) {
      controller.abort();
      abortControllers.delete(request.id);
    }
    return;
  }

  // Create abort controller for this request
  const abortController = new AbortController();
  abortControllers.set(request.id, abortController);

  // Set up timeout
  const timeoutMs = request.config.timeoutMs || DEFAULT_CONFIGS[request.provider].timeoutMs || 60000;
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);

  try {
    if (request.type === 'stream') {
      let fullContent = '';

      for await (const chunk of streamFromProvider(request, abortController.signal)) {
        fullContent += chunk;
        postMessage({
          id: request.id,
          type: 'chunk',
          content: chunk,
        } as AiWorkerResponse);
      }

      postMessage({
        id: request.id,
        type: 'complete',
        content: fullContent,
      } as AiWorkerResponse);
    } else {
      const content = await completeFromProvider(request, abortController.signal);
      postMessage({
        id: request.id,
        type: 'complete',
        content,
      } as AiWorkerResponse);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes('abort') || (error instanceof Error && error.name === 'AbortError')) {
      postMessage({
        id: request.id,
        type: 'aborted',
        error: 'Request was aborted',
      } as AiWorkerResponse);
    } else {
      postMessage({
        id: request.id,
        type: 'error',
        error: errorMessage,
      } as AiWorkerResponse);
    }
  } finally {
    clearTimeout(timeoutId);
    abortControllers.delete(request.id);
  }
});

// Signal that worker is loaded
postMessage({ id: 'init', type: 'complete', content: 'AI Worker loaded' } as AiWorkerResponse);
