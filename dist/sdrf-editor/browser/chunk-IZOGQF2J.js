import {
  BaseLlmProvider,
  LlmError
} from "./chunk-YZ33SA7Q.js";
import {
  __async,
  __asyncGenerator,
  __await
} from "./chunk-G42SKTPL.js";

// src/app/core/services/llm/providers/ollama-provider.ts
var OllamaProvider = class extends BaseLlmProvider {
  name = "ollama";
  supportsStreaming = true;
  constructor(config = {}) {
    super(config);
  }
  getProviderType() {
    return "ollama";
  }
  /**
   * Ollama doesn't require an API key.
   */
  isConfigured() {
    return true;
  }
  /**
   * Sends a completion request to Ollama.
   */
  complete(messages) {
    return __async(this, null, function* () {
      const url = `${this.config.baseUrl}/api/chat`;
      const body = {
        model: this.config.model,
        messages: this.convertMessages(messages),
        stream: false,
        options: {
          temperature: this.config.temperature,
          num_predict: this.config.maxTokens
        }
      };
      try {
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
      } catch (error) {
        if (error instanceof TypeError && error.message.includes("fetch")) {
          throw new LlmError("Cannot connect to Ollama. Make sure Ollama is running on " + this.config.baseUrl, "NETWORK_ERROR", "ollama");
        }
        throw error;
      }
    });
  }
  /**
   * Streams a completion from Ollama.
   * Note: Ollama can be slow on first request while loading the model.
   */
  stream(messages) {
    return __asyncGenerator(this, null, function* () {
      const url = `${this.config.baseUrl}/api/chat`;
      const body = {
        model: this.config.model,
        messages: this.convertMessages(messages),
        stream: true,
        options: {
          temperature: this.config.temperature,
          num_predict: this.config.maxTokens
        }
      };
      this.abortController = new AbortController();
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
            if (!trimmed)
              continue;
            try {
              const chunk = JSON.parse(trimmed);
              yield {
                content: chunk.message?.content || "",
                done: chunk.done,
                finishReason: chunk.done ? "stop" : void 0
              };
            } catch (e) {
              console.warn("Failed to parse Ollama stream chunk:", trimmed, e);
            }
          }
        }
        if (buffer.trim()) {
          try {
            const chunk = JSON.parse(buffer.trim());
            yield {
              content: chunk.message?.content || "",
              done: true,
              finishReason: "stop"
            };
          } catch {
          }
        }
      } catch (error) {
        if (error instanceof TypeError && error.message.includes("fetch")) {
          throw new LlmError("Cannot connect to Ollama. Make sure Ollama is running.", "NETWORK_ERROR", "ollama");
        }
        if (error instanceof Error && error.name === "AbortError") {
          throw new LlmError("Request was cancelled", "ABORTED", "ollama");
        }
        throw error;
      }
    });
  }
  /**
   * Lists available models from Ollama.
   */
  listModels() {
    return __async(this, null, function* () {
      try {
        const response = yield fetch(`${this.config.baseUrl}/api/tags`, {
          headers: this.getHeaders()
        });
        if (!response.ok) {
          return [];
        }
        const data = yield response.json();
        return (data.models || []).map((m) => m.name);
      } catch {
        return [];
      }
    });
  }
  /**
   * Checks if Ollama is running and accessible.
   */
  isRunning() {
    return __async(this, null, function* () {
      try {
        const response = yield fetch(`${this.config.baseUrl}/api/tags`, {
          signal: AbortSignal.timeout(5e3)
        });
        return response.ok;
      } catch {
        return false;
      }
    });
  }
  /**
   * Pulls a model if not already available.
   */
  pullModel(modelName) {
    return __async(this, null, function* () {
      const response = yield fetch(`${this.config.baseUrl}/api/pull`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({ name: modelName, stream: false })
      });
      if (!response.ok) {
        const error = yield response.text();
        throw new LlmError(`Failed to pull model ${modelName}: ${error}`, "PROVIDER_ERROR", "ollama");
      }
    });
  }
  // ============ Private Methods ============
  /**
   * Gets request headers.
   */
  getHeaders() {
    return {
      "Content-Type": "application/json"
    };
  }
  /**
   * Converts our message format to Ollama format.
   */
  convertMessages(messages) {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content
    }));
  }
  /**
   * Converts Ollama response to our format.
   */
  convertResponse(data) {
    const usage = data.prompt_eval_count !== void 0 || data.eval_count !== void 0 ? {
      promptTokens: data.prompt_eval_count || 0,
      completionTokens: data.eval_count || 0,
      totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
    } : void 0;
    return {
      content: data.message?.content || "",
      finishReason: data.done ? "stop" : void 0,
      usage,
      raw: data
    };
  }
};
function createOllamaProvider(config) {
  return new OllamaProvider(config);
}
export {
  OllamaProvider,
  createOllamaProvider
};
//# sourceMappingURL=chunk-IZOGQF2J.js.map
