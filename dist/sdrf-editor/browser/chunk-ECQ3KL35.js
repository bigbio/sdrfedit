import {
  BaseLlmProvider
} from "./chunk-YZ33SA7Q.js";
import {
  __async,
  __asyncGenerator,
  __await,
  __forAwait,
  __spreadProps,
  __spreadValues
} from "./chunk-G42SKTPL.js";

// src/app/core/services/llm/providers/anthropic-provider.ts
var AnthropicProvider = class _AnthropicProvider extends BaseLlmProvider {
  name = "anthropic";
  supportsStreaming = true;
  static API_VERSION = "2023-06-01";
  constructor(config = {}) {
    super(config);
  }
  getProviderType() {
    return "anthropic";
  }
  /**
   * Sends a completion request to Anthropic.
   */
  complete(messages) {
    return __async(this, null, function* () {
      this.validateConfiguration();
      const url = `${this.config.baseUrl}/messages`;
      const { system, convertedMessages } = this.convertMessages(messages);
      const body = {
        model: this.config.model,
        messages: convertedMessages,
        max_tokens: this.config.maxTokens || 4096,
        temperature: this.config.temperature,
        stream: false
      };
      if (system) {
        body.system = system;
      }
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
   * Streams a completion from Anthropic.
   */
  stream(messages) {
    return __asyncGenerator(this, null, function* () {
      this.validateConfiguration();
      const url = `${this.config.baseUrl}/messages`;
      const { system, convertedMessages } = this.convertMessages(messages);
      const body = {
        model: this.config.model,
        messages: convertedMessages,
        max_tokens: this.config.maxTokens || 4096,
        temperature: this.config.temperature,
        stream: true
      };
      if (system) {
        body.system = system;
      }
      const reader = yield new __await(this.fetchStream(url, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(body)
      }));
      try {
        for (var iter = __forAwait(this.parseSSEStream(reader)), more, temp, error; more = !(temp = yield new __await(iter.next())).done; more = false) {
          const data = temp.value;
          try {
            const event = JSON.parse(data);
            if (event.type === "content_block_delta" && event.delta) {
              const delta = event.delta;
              if (delta.type === "text_delta") {
                yield {
                  content: delta.text,
                  done: false
                };
              }
            } else if (event.type === "message_delta" && event.delta) {
              const delta = event.delta;
              if (delta.stop_reason) {
                yield {
                  content: "",
                  done: true,
                  finishReason: delta.stop_reason
                };
              }
            } else if (event.type === "message_stop") {
              yield {
                content: "",
                done: true
              };
            }
          } catch (e) {
            console.warn("Failed to parse Anthropic stream event:", data, e);
          }
        }
      } catch (temp) {
        error = [temp];
      } finally {
        try {
          more && (temp = iter.return) && (yield new __await(temp.call(iter)));
        } finally {
          if (error)
            throw error[0];
        }
      }
    });
  }
  // ============ Private Methods ============
  /**
   * Gets request headers including authorization.
   */
  getHeaders() {
    return __spreadProps(__spreadValues({}, this.getCommonHeaders()), {
      "x-api-key": this.config.apiKey || "",
      "anthropic-version": _AnthropicProvider.API_VERSION
    });
  }
  /**
   * Converts our message format to Anthropic format.
   * Extracts system message separately as Anthropic uses a different format.
   */
  convertMessages(messages) {
    let system;
    const convertedMessages = [];
    for (const msg of messages) {
      if (msg.role === "system") {
        system = system ? `${system}

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
    return { system, convertedMessages };
  }
  /**
   * Converts Anthropic response to our format.
   */
  convertResponse(data) {
    const textContent = data.content.filter((c) => c.type === "text").map((c) => c.text).join("");
    const usage = data.usage ? {
      promptTokens: data.usage.input_tokens,
      completionTokens: data.usage.output_tokens,
      totalTokens: data.usage.input_tokens + data.usage.output_tokens
    } : void 0;
    return {
      content: textContent,
      finishReason: this.mapFinishReason(data.stop_reason),
      usage,
      raw: data
    };
  }
  /**
   * Maps Anthropic stop reasons to our standard format.
   */
  mapFinishReason(reason) {
    switch (reason) {
      case "end_turn":
      case "stop_sequence":
        return "stop";
      case "max_tokens":
        return "length";
      default:
        return void 0;
    }
  }
};
function createAnthropicProvider(config) {
  return new AnthropicProvider(config);
}
export {
  AnthropicProvider,
  createAnthropicProvider
};
//# sourceMappingURL=chunk-ECQ3KL35.js.map
