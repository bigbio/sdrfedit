import {
  BaseLlmProvider
} from "./chunk-YZ33SA7Q.js";
import {
  __async,
  __asyncGenerator,
  __await
} from "./chunk-G42SKTPL.js";

// src/app/core/services/llm/providers/gemini-provider.ts
var GeminiProvider = class extends BaseLlmProvider {
  name = "gemini";
  supportsStreaming = true;
  constructor(config = {}) {
    super(config);
  }
  getProviderType() {
    return "gemini";
  }
  /**
   * Sends a completion request to Gemini.
   */
  complete(messages) {
    return __async(this, null, function* () {
      this.validateConfiguration();
      const url = this.buildUrl("generateContent");
      const body = this.buildRequestBody(messages);
      const response = yield this.fetchWithTimeout(url, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const errorBody = yield response.text();
        throw this.createErrorFromResponse(response.status, errorBody);
      }
      const data = yield response.json();
      return this.convertResponse(data);
    });
  }
  /**
   * Streams a completion from Gemini.
   */
  stream(messages) {
    return __asyncGenerator(this, null, function* () {
      this.validateConfiguration();
      const url = this.buildUrl("streamGenerateContent");
      const body = this.buildRequestBody(messages);
      this.abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        this.abortController?.abort();
      }, this.config.timeoutMs || 6e4);
      try {
        const response = yield new __await(fetch(url, {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(body),
          signal: this.abortController.signal
        }));
        if (!response.ok) {
          const errorBody = yield new __await(response.text());
          throw this.createErrorFromResponse(response.status, errorBody);
        }
        if (!response.body) {
          throw new Error("Response body is empty");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = yield new __await(reader.read());
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === "[" || trimmed === "]" || trimmed === ",") {
              continue;
            }
            let jsonStr = trimmed;
            if (jsonStr.startsWith("["))
              jsonStr = jsonStr.slice(1);
            if (jsonStr.endsWith("]"))
              jsonStr = jsonStr.slice(0, -1);
            if (jsonStr.endsWith(","))
              jsonStr = jsonStr.slice(0, -1);
            if (!jsonStr.trim())
              continue;
            try {
              const chunk = JSON.parse(jsonStr);
              const candidate = chunk.candidates?.[0];
              if (candidate?.content?.parts) {
                const text = candidate.content.parts.filter((p) => p.text).map((p) => p.text).join("");
                yield {
                  content: text,
                  done: !!candidate.finishReason,
                  finishReason: candidate.finishReason || void 0
                };
              }
            } catch (e) {
              console.warn("Failed to parse Gemini stream chunk:", jsonStr, e);
            }
          }
        }
        if (buffer.trim()) {
          try {
            let jsonStr = buffer.trim();
            if (jsonStr.endsWith("]"))
              jsonStr = jsonStr.slice(0, -1);
            if (jsonStr.endsWith(","))
              jsonStr = jsonStr.slice(0, -1);
            if (jsonStr) {
              const chunk = JSON.parse(jsonStr);
              const candidate = chunk.candidates?.[0];
              if (candidate?.content?.parts) {
                const text = candidate.content.parts.filter((p) => p.text).map((p) => p.text).join("");
                yield {
                  content: text,
                  done: true,
                  finishReason: candidate.finishReason || "STOP"
                };
              }
            }
          } catch {
          }
        }
      } finally {
        clearTimeout(timeoutId);
      }
    });
  }
  // ============ Private Methods ============
  /**
   * Builds the API URL.
   */
  buildUrl(action) {
    const model = this.config.model;
    const apiKey = this.config.apiKey;
    return `${this.config.baseUrl}/models/${model}:${action}?key=${apiKey}`;
  }
  /**
   * Gets request headers.
   */
  getHeaders() {
    return {
      "Content-Type": "application/json"
    };
  }
  /**
   * Builds the request body.
   */
  buildRequestBody(messages) {
    const { system, contents } = this.convertMessages(messages);
    const body = {
      contents,
      generationConfig: {
        temperature: this.config.temperature,
        maxOutputTokens: this.config.maxTokens
      }
    };
    if (system) {
      body.systemInstruction = {
        parts: [{ text: system }]
      };
    }
    return body;
  }
  /**
   * Converts our message format to Gemini format.
   */
  convertMessages(messages) {
    let system;
    const contents = [];
    for (const msg of messages) {
      if (msg.role === "system") {
        system = system ? `${system}

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
    return { system, contents };
  }
  /**
   * Converts Gemini response to our format.
   */
  convertResponse(data) {
    const candidate = data.candidates?.[0];
    const content = candidate?.content?.parts?.filter((p) => p.text).map((p) => p.text).join("") || "";
    const usage = data.usageMetadata ? {
      promptTokens: data.usageMetadata.promptTokenCount,
      completionTokens: data.usageMetadata.candidatesTokenCount,
      totalTokens: data.usageMetadata.totalTokenCount
    } : void 0;
    return {
      content,
      finishReason: this.mapFinishReason(candidate?.finishReason),
      usage,
      raw: data
    };
  }
  /**
   * Maps Gemini finish reasons to our standard format.
   */
  mapFinishReason(reason) {
    switch (reason) {
      case "STOP":
        return "stop";
      case "MAX_TOKENS":
        return "length";
      case "SAFETY":
      case "RECITATION":
        return "content_filter";
      default:
        return void 0;
    }
  }
};
function createGeminiProvider(config) {
  return new GeminiProvider(config);
}
export {
  GeminiProvider,
  createGeminiProvider
};
//# sourceMappingURL=chunk-GMGQ5T62.js.map
