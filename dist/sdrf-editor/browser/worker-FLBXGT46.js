// src/app/workers/ai.worker.ts
var DEFAULT_CONFIGS = {
  openai: {
    model: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
    timeoutMs: 6e4,
    maxTokens: 4096,
    temperature: 0.3
  },
  anthropic: {
    model: "claude-sonnet-4-20250514",
    baseUrl: "https://api.anthropic.com/v1",
    timeoutMs: 6e4,
    maxTokens: 4096,
    temperature: 0.3
  },
  gemini: {
    model: "gemini-2.0-flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    timeoutMs: 6e4,
    maxTokens: 4096,
    temperature: 0.3
  },
  ollama: {
    model: "qwen3",
    baseUrl: "http://localhost:11434",
    timeoutMs: 12e4,
    maxTokens: 4096,
    temperature: 0.3
  }
};
var abortControllers = /* @__PURE__ */ new Map();
async function* streamOpenAI(config, messages, signal) {
  const url = `${config.baseUrl}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      stream: true
    }),
    signal
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${error}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (trimmed.startsWith("data: ")) {
          const data = trimmed.slice(6);
          if (data === "[DONE]") return;
          try {
            const chunk = JSON.parse(data);
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch {
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
async function* streamAnthropic(config, messages, signal) {
  const url = `${config.baseUrl}/messages`;
  let systemPrompt;
  const convertedMessages = [];
  for (const msg of messages) {
    if (msg.role === "system") {
      systemPrompt = systemPrompt ? `${systemPrompt}

${msg.content}` : msg.content;
    } else {
      convertedMessages.push({
        role: msg.role,
        content: msg.content
      });
    }
  }
  if (convertedMessages.length > 0 && convertedMessages[0].role !== "user") {
    convertedMessages.unshift({
      role: "user",
      content: "Please proceed with your analysis."
    });
  }
  const body = {
    model: config.model,
    messages: convertedMessages,
    max_tokens: config.maxTokens || 4096,
    temperature: config.temperature,
    stream: true
  };
  if (systemPrompt) {
    body.system = systemPrompt;
  }
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey || "",
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body),
    signal
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${error}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (trimmed.startsWith("data: ")) {
          const data = trimmed.slice(6);
          try {
            const event = JSON.parse(data);
            if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
              yield event.delta.text;
            }
          } catch {
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
async function* streamGemini(config, messages, signal) {
  let systemInstruction;
  const contents = [];
  for (const msg of messages) {
    if (msg.role === "system") {
      systemInstruction = systemInstruction ? `${systemInstruction}

${msg.content}` : msg.content;
    } else {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }]
      });
    }
  }
  if (contents.length > 0 && contents[0].role !== "user") {
    contents.unshift({
      role: "user",
      parts: [{ text: "Please proceed with your analysis." }]
    });
  }
  const body = {
    contents,
    generationConfig: {
      temperature: config.temperature,
      maxOutputTokens: config.maxTokens
    }
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  const url = `${config.baseUrl}/models/${config.model}:streamGenerateContent?key=${config.apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${error}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        let jsonStr = line.trim();
        if (!jsonStr || jsonStr === "[" || jsonStr === "]" || jsonStr === ",") continue;
        if (jsonStr.startsWith("[")) jsonStr = jsonStr.slice(1);
        if (jsonStr.endsWith("]")) jsonStr = jsonStr.slice(0, -1);
        if (jsonStr.endsWith(",")) jsonStr = jsonStr.slice(0, -1);
        if (!jsonStr.trim()) continue;
        try {
          const chunk = JSON.parse(jsonStr);
          const text = chunk.candidates?.[0]?.content?.parts?.filter((p) => p.text).map((p) => p.text).join("");
          if (text) yield text;
        } catch {
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
async function* streamOllama(config, messages, signal) {
  const url = `${config.baseUrl}/api/chat`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      options: {
        temperature: config.temperature,
        num_predict: config.maxTokens
      }
    }),
    signal
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama API error (${response.status}): ${error}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const chunk = JSON.parse(trimmed);
          if (chunk.message?.content) {
            yield chunk.message.content;
          }
        } catch {
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
async function* streamFromProvider(request, signal) {
  const config = {
    ...DEFAULT_CONFIGS[request.provider],
    ...request.config
  };
  switch (request.provider) {
    case "openai":
      yield* streamOpenAI(config, request.messages, signal);
      break;
    case "anthropic":
      yield* streamAnthropic(config, request.messages, signal);
      break;
    case "gemini":
      yield* streamGemini(config, request.messages, signal);
      break;
    case "ollama":
      yield* streamOllama(config, request.messages, signal);
      break;
    default:
      throw new Error(`Unknown provider: ${request.provider}`);
  }
}
async function completeFromProvider(request, signal) {
  let content = "";
  for await (const chunk of streamFromProvider(request, signal)) {
    content += chunk;
  }
  return content;
}
addEventListener("message", async (event) => {
  const request = event.data;
  if (request.type === "abort") {
    const controller = abortControllers.get(request.id);
    if (controller) {
      controller.abort();
      abortControllers.delete(request.id);
    }
    return;
  }
  const abortController = new AbortController();
  abortControllers.set(request.id, abortController);
  const timeoutMs = request.config.timeoutMs || DEFAULT_CONFIGS[request.provider].timeoutMs || 6e4;
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);
  try {
    if (request.type === "stream") {
      let fullContent = "";
      for await (const chunk of streamFromProvider(request, abortController.signal)) {
        fullContent += chunk;
        postMessage({
          id: request.id,
          type: "chunk",
          content: chunk
        });
      }
      postMessage({
        id: request.id,
        type: "complete",
        content: fullContent
      });
    } else {
      const content = await completeFromProvider(request, abortController.signal);
      postMessage({
        id: request.id,
        type: "complete",
        content
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("abort") || error instanceof Error && error.name === "AbortError") {
      postMessage({
        id: request.id,
        type: "aborted",
        error: "Request was aborted"
      });
    } else {
      postMessage({
        id: request.id,
        type: "error",
        error: errorMessage
      });
    }
  } finally {
    clearTimeout(timeoutId);
    abortControllers.delete(request.id);
  }
});
postMessage({ id: "init", type: "complete", content: "AI Worker loaded" });
//# sourceMappingURL=worker-FLBXGT46.js.map
