/**
 * LLM Models and Types
 *
 * Types and interfaces for the LLM-based recommendation system.
 * Supports multiple providers: OpenAI, Anthropic, Gemini, and Ollama.
 */

// ============ Provider Types ============

/**
 * Supported LLM providers.
 */
export type LlmProviderType = 'openai' | 'anthropic' | 'gemini' | 'ollama';

/**
 * LLM provider configuration.
 */
export interface LlmProviderConfig {
  /** Provider type */
  provider: LlmProviderType;

  /** API key (not needed for Ollama) */
  apiKey?: string;

  /** Model name/ID */
  model: string;

  /** Base URL (for Ollama or custom endpoints) */
  baseUrl?: string;

  /** Request timeout in milliseconds */
  timeoutMs?: number;

  /** Maximum tokens to generate */
  maxTokens?: number;

  /** Temperature for response generation (0-1) */
  temperature?: number;
}

/**
 * Default configurations per provider.
 */
export const DEFAULT_PROVIDER_CONFIGS: Record<LlmProviderType, Partial<LlmProviderConfig>> = {
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

/**
 * Available models per provider.
 */
export const AVAILABLE_MODELS: Record<LlmProviderType, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  anthropic: ['claude-sonnet-4-20250514', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  gemini: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  ollama: ['qwen3', 'llama3.2', 'llama3.1', 'mistral', 'mixtral', 'codellama', 'phi3'],
};

// ============ Message Types ============

/**
 * Message role in a conversation.
 */
export type LlmMessageRole = 'system' | 'user' | 'assistant';

/**
 * A message in the LLM conversation.
 */
export interface LlmMessage {
  role: LlmMessageRole;
  content: string;
}

/**
 * Response from an LLM completion.
 */
export interface LlmResponse {
  /** The generated content */
  content: string;

  /** Finish reason */
  finishReason?: 'stop' | 'length' | 'content_filter' | 'error';

  /** Usage statistics */
  usage?: LlmUsage;

  /** Raw response for debugging */
  raw?: unknown;
}

/**
 * Token usage statistics.
 */
export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Streaming chunk from LLM.
 */
export interface LlmStreamChunk {
  /** Delta content */
  content: string;

  /** Whether this is the final chunk */
  done: boolean;

  /** Finish reason (only on final chunk) */
  finishReason?: string;
}

// ============ Recommendation Types ============

/**
 * Types of SDRF recommendations.
 */
export type RecommendationType =
  | 'fill_value'        // Fill "not available" or empty values
  | 'correct_value'     // Correct invalid or inconsistent values
  | 'ontology_suggestion' // Suggest proper ontology terms
  | 'consistency_fix'   // Fix consistency issues across samples
  | 'add_column';       // Add a missing column

/**
 * Confidence level for a recommendation.
 */
export type RecommendationConfidence = 'high' | 'medium' | 'low';

/**
 * A recommendation from the LLM for improving an SDRF file.
 */
export interface SdrfRecommendation {
  /** Unique identifier */
  id: string;

  /** Type of recommendation */
  type: RecommendationType;

  /** Column name this recommendation applies to */
  column: string;

  /** Column index in the table */
  columnIndex: number;

  /** Sample indices this recommendation applies to (1-based) */
  sampleIndices: number[];

  /** Current value(s) in the cells */
  currentValue?: string;

  /** Suggested new value */
  suggestedValue: string;

  /** Confidence level */
  confidence: RecommendationConfidence;

  /** Human-readable explanation */
  reasoning: string;

  /** Whether this recommendation has been applied */
  applied?: boolean;

  /** Ontology ID if this is an ontology suggestion */
  ontologyId?: string;

  /** Ontology term label */
  ontologyLabel?: string;
}

/**
 * Result from the recommendation analysis.
 */
export interface RecommendationResult {
  /** List of recommendations */
  recommendations: SdrfRecommendation[];

  /** Summary statistics */
  summary: RecommendationSummary;

  /** Raw LLM response for debugging */
  rawResponse?: string;

  /** Timestamp of analysis */
  timestamp: Date;

  /** Provider used for analysis */
  provider: LlmProviderType;

  /** Model used for analysis */
  model: string;
}

/**
 * Summary of recommendations by type.
 */
export interface RecommendationSummary {
  total: number;
  byType: Record<RecommendationType, number>;
  byConfidence: Record<RecommendationConfidence, number>;
  affectedColumns: string[];
  affectedSamples: number;
}

// ============ Analysis Context Types ============

/**
 * Context information sent to the LLM for analysis.
 */
export interface SdrfAnalysisContext {
  /** Table metadata */
  metadata: {
    sampleCount: number;
    columnCount: number;
    columnNames: string[];
  };

  /** Column definitions with validation rules */
  columns: ColumnContext[];

  /** Issues identified for analysis */
  issues: AnalysisIssue[];

  /** Sample data (subset for context) */
  sampleData?: string[][];

  /** Focus areas for analysis */
  focusAreas: AnalysisFocusArea[];
}

/**
 * Context for a single column.
 */
export interface ColumnContext {
  name: string;
  index: number;
  type: string;
  isRequired: boolean;
  ontologies?: string[];
  pattern?: string;
  examples?: string[];
  allowNotAvailable: boolean;
  allowNotApplicable: boolean;
  uniqueValues: string[];
  notAvailableCount: number;
  emptyCount: number;
}

/**
 * An issue identified for LLM analysis.
 */
export interface AnalysisIssue {
  type: 'missing_value' | 'invalid_ontology' | 'pattern_mismatch' | 'inconsistency';
  column: string;
  columnIndex: number;
  sampleIndices: number[];
  currentValue?: string;
  details?: string;
}

/**
 * Focus area for analysis.
 */
export type AnalysisFocusArea =
  | 'fill_missing'      // Fill "not available" and empty values
  | 'validate_ontology' // Validate and suggest ontology terms
  | 'check_consistency' // Check data consistency
  | 'all';              // All of the above

// ============ Settings Types ============

/**
 * LLM settings stored in localStorage.
 */
export interface LlmSettings {
  /** Currently selected provider */
  activeProvider: LlmProviderType;

  /** Provider-specific configurations */
  providers: Partial<Record<LlmProviderType, LlmProviderConfig>>;

  /** Whether user has consented to API key storage */
  storageConsent: boolean;

  /** Storage mode for API keys */
  storageMode: 'persistent' | 'session';

  /** Last used timestamp */
  lastUsed?: number;
}

/**
 * Default LLM settings.
 */
export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  activeProvider: 'openai',
  providers: {},
  storageConsent: false,
  storageMode: 'session',
};

// ============ Error Types ============

/**
 * LLM-specific error.
 */
export class LlmError extends Error {
  constructor(
    message: string,
    public readonly code: LlmErrorCode,
    public readonly provider?: LlmProviderType,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

/**
 * Error codes for LLM operations.
 */
export type LlmErrorCode =
  | 'NOT_CONFIGURED'
  | 'INVALID_API_KEY'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR'
  | 'PROVIDER_ERROR'
  | 'ABORTED';

// ============ Utility Functions ============

/**
 * Creates an empty recommendation result.
 */
export function createEmptyRecommendationResult(
  provider: LlmProviderType,
  model: string
): RecommendationResult {
  return {
    recommendations: [],
    summary: {
      total: 0,
      byType: {
        fill_value: 0,
        correct_value: 0,
        ontology_suggestion: 0,
        consistency_fix: 0,
        add_column: 0,
      },
      byConfidence: {
        high: 0,
        medium: 0,
        low: 0,
      },
      affectedColumns: [],
      affectedSamples: 0,
    },
    timestamp: new Date(),
    provider,
    model,
  };
}

/**
 * Generates a unique recommendation ID.
 */
export function generateRecommendationId(): string {
  return `rec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Gets display name for a provider.
 */
export function getProviderDisplayName(provider: LlmProviderType): string {
  const names: Record<LlmProviderType, string> = {
    openai: 'OpenAI',
    anthropic: 'Claude',
    gemini: 'Google Gemini',
    ollama: 'Ollama (Local)',
  };
  return names[provider];
}

/**
 * Checks if a provider requires an API key.
 */
export function providerRequiresApiKey(provider: LlmProviderType): boolean {
  return provider !== 'ollama';
}

/**
 * Validates provider configuration.
 */
export function isProviderConfigured(config: LlmProviderConfig | undefined): boolean {
  if (!config) return false;
  if (config.provider === 'ollama') return true;
  return !!config.apiKey && config.apiKey.length > 0;
}

// ============ Chat Suggestion Types ============

/**
 * Types of chat suggestions (actionable recommendations from chat).
 */
export type ChatSuggestionType =
  | 'set_value'      // Set a value in one or more cells
  | 'remove_column'  // Remove a column
  | 'rename_column'  // Rename a column
  | 'add_column';    // Add a new column

/**
 * A suggestion from chat that can be applied to the table.
 */
export interface ChatSuggestion {
  /** Unique identifier */
  id: string;

  /** Type of suggestion */
  type: ChatSuggestionType;

  /** Column name this suggestion applies to */
  column: string;

  /** Sample indices for set_value type (1-based) */
  sampleIndices?: number[];

  /** Current value (for display) */
  currentValue?: string;

  /** Suggested value */
  suggestedValue?: string;

  /** New column name (for rename_column) */
  newColumnName?: string;

  /** Human-readable description */
  description: string;

  /** Confidence level */
  confidence: RecommendationConfidence;

  /** Whether this suggestion has been applied */
  applied?: boolean;

  /** Whether this suggestion has been dismissed */
  dismissed?: boolean;
}

/**
 * A chat message with optional suggestions.
 */
export interface ChatMessage {
  /** Message role */
  role: 'user' | 'assistant';

  /** Text content */
  content: string;

  /** Actionable suggestions (assistant messages only) */
  suggestions?: ChatSuggestion[];

  /** Timestamp */
  timestamp?: Date;
}

/**
 * Parsed chat response from LLM.
 */
export interface ParsedChatResponse {
  /** Text explanation */
  text: string;

  /** Actionable suggestions */
  suggestions: ChatSuggestion[];
}

/**
 * Generates a unique suggestion ID.
 */
export function generateSuggestionId(): string {
  return `sug_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Creates a summary from recommendations.
 */
export function createRecommendationSummary(
  recommendations: SdrfRecommendation[]
): RecommendationSummary {
  const byType: Record<RecommendationType, number> = {
    fill_value: 0,
    correct_value: 0,
    ontology_suggestion: 0,
    consistency_fix: 0,
    add_column: 0,
  };

  const byConfidence: Record<RecommendationConfidence, number> = {
    high: 0,
    medium: 0,
    low: 0,
  };

  const affectedColumns = new Set<string>();
  const affectedSamples = new Set<number>();

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
    affectedSamples: affectedSamples.size,
  };
}
