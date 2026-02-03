import {
  __async,
  __asyncGenerator,
  __await,
  __spreadProps,
  __spreadValues
} from "./chunk-G42SKTPL.js";

// src/app/core/models/llm.ts
var DEFAULT_PROVIDER_CONFIGS = {
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
var AVAILABLE_MODELS = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  anthropic: ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
  gemini: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  ollama: ["qwen3", "llama3.2", "llama3.1", "mistral", "mixtral", "codellama", "phi3"]
};
var DEFAULT_LLM_SETTINGS = {
  activeProvider: "openai",
  providers: {},
  storageConsent: false,
  storageMode: "session"
};
var LlmError = class extends Error {
  code;
  provider;
  details;
  constructor(message, code, provider, details) {
    super(message);
    this.code = code;
    this.provider = provider;
    this.details = details;
    this.name = "LlmError";
  }
};
function createEmptyRecommendationResult(provider, model) {
  return {
    recommendations: [],
    summary: {
      total: 0,
      byType: {
        fill_value: 0,
        correct_value: 0,
        ontology_suggestion: 0,
        consistency_fix: 0,
        add_column: 0
      },
      byConfidence: {
        high: 0,
        medium: 0,
        low: 0
      },
      affectedColumns: [],
      affectedSamples: 0
    },
    timestamp: /* @__PURE__ */ new Date(),
    provider,
    model
  };
}
function generateRecommendationId() {
  return `rec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
function getProviderDisplayName(provider) {
  const names = {
    openai: "OpenAI",
    anthropic: "Claude",
    gemini: "Google Gemini",
    ollama: "Ollama (Local)"
  };
  return names[provider];
}
function providerRequiresApiKey(provider) {
  return provider !== "ollama";
}
function isProviderConfigured(config) {
  if (!config)
    return false;
  if (config.provider === "ollama")
    return true;
  return !!config.apiKey && config.apiKey.length > 0;
}
function generateSuggestionId() {
  return `sug_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
function createRecommendationSummary(recommendations) {
  const byType = {
    fill_value: 0,
    correct_value: 0,
    ontology_suggestion: 0,
    consistency_fix: 0,
    add_column: 0
  };
  const byConfidence = {
    high: 0,
    medium: 0,
    low: 0
  };
  const affectedColumns = /* @__PURE__ */ new Set();
  const affectedSamples = /* @__PURE__ */ new Set();
  for (const rec of recommendations) {
    byType[rec.type]++;
    byConfidence[rec.confidence]++;
    affectedColumns.add(rec.column);
    for (const idx of rec.sampleIndices) {
      affectedSamples.add(idx);
    }
  }
  return {
    total: recommendations.length,
    byType,
    byConfidence,
    affectedColumns: Array.from(affectedColumns),
    affectedSamples: affectedSamples.size
  };
}

// src/app/core/services/llm/providers/base-provider.ts
var BaseLlmProvider = class {
  config;
  abortController = null;
  constructor(config = {}) {
    const providerType = this.getProviderType();
    const defaults = DEFAULT_PROVIDER_CONFIGS[providerType];
    this.config = __spreadValues(__spreadValues({
      provider: providerType
    }, defaults), config);
  }
  /**
   * Checks if the provider is configured with required credentials.
   */
  isConfigured() {
    if (this.config.provider === "ollama") {
      return true;
    }
    return !!this.config.apiKey && this.config.apiKey.length > 0;
  }
  /**
   * Gets the current configuration.
   */
  getConfig() {
    return __spreadValues({}, this.config);
  }
  /**
   * Updates the configuration.
   */
  setConfig(config) {
    this.config = __spreadValues(__spreadValues({}, this.config), config);
  }
  /**
   * Aborts any in-progress requests.
   */
  abort() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
  // ============ Protected Helper Methods ============
  /**
   * Makes a fetch request with timeout and abort handling.
   */
  fetchWithTimeout(url, options) {
    return __async(this, null, function* () {
      this.abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        this.abortController?.abort();
      }, this.config.timeoutMs || 6e4);
      try {
        const response = yield fetch(url, __spreadProps(__spreadValues({}, options), {
          signal: this.abortController.signal
        }));
        return response;
      } catch (error) {
        if (error instanceof Error) {
          if (error.name === "AbortError") {
            throw new LlmError("Request was aborted or timed out", "TIMEOUT", this.config.provider);
          }
          throw new LlmError(`Network error: ${error.message}`, "NETWORK_ERROR", this.config.provider, error);
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    });
  }
  /**
   * Makes a streaming fetch request.
   */
  fetchStream(url, options) {
    return __async(this, null, function* () {
      const response = yield this.fetchWithTimeout(url, options);
      if (!response.ok) {
        const errorBody = yield response.text().catch(() => "Unknown error");
        throw this.createErrorFromResponse(response.status, errorBody);
      }
      if (!response.body) {
        throw new LlmError("Response body is empty", "PROVIDER_ERROR", this.config.provider);
      }
      return response.body.getReader();
    });
  }
  /**
   * Parses Server-Sent Events (SSE) from a stream.
   */
  parseSSEStream(reader) {
    return __asyncGenerator(this, null, function* () {
      const decoder = new TextDecoder();
      let buffer = "";
      try {
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
            if (!trimmed || trimmed.startsWith(":")) {
              continue;
            }
            if (trimmed.startsWith("data: ")) {
              const data = trimmed.slice(6);
              if (data === "[DONE]") {
                return;
              }
              yield data;
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    });
  }
  /**
   * Creates an appropriate error from an HTTP response.
   */
  createErrorFromResponse(status, body) {
    let code = "PROVIDER_ERROR";
    let message = `API error (${status})`;
    try {
      const parsed = JSON.parse(body);
      message = parsed.error?.message || parsed.message || message;
    } catch {
      if (body.length < 200) {
        message = body || message;
      }
    }
    switch (status) {
      case 401:
        code = "INVALID_API_KEY";
        message = "Invalid API key. Please check your configuration.";
        break;
      case 429:
        code = "RATE_LIMITED";
        message = "Rate limit exceeded. Please wait before trying again.";
        break;
      case 408:
      case 504:
        code = "TIMEOUT";
        break;
    }
    return new LlmError(message, code, this.config.provider, { status, body });
  }
  /**
   * Validates that the provider is configured before making requests.
   */
  validateConfiguration() {
    if (!this.isConfigured()) {
      throw new LlmError(`${this.name} provider is not configured. Please provide an API key.`, "NOT_CONFIGURED", this.config.provider);
    }
  }
  /**
   * Gets headers common to all requests.
   */
  getCommonHeaders() {
    return {
      "Content-Type": "application/json"
    };
  }
};

export {
  DEFAULT_PROVIDER_CONFIGS,
  AVAILABLE_MODELS,
  DEFAULT_LLM_SETTINGS,
  LlmError,
  createEmptyRecommendationResult,
  generateRecommendationId,
  getProviderDisplayName,
  providerRequiresApiKey,
  isProviderConfigured,
  generateSuggestionId,
  createRecommendationSummary,
  BaseLlmProvider
};
//# sourceMappingURL=chunk-YZ33SA7Q.js.map
