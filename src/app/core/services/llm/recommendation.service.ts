/**
 * Recommendation Service
 *
 * Main service for generating LLM-based recommendations for SDRF files.
 * Orchestrates context building, prompt generation, and response parsing.
 */

import {
  LlmProviderType,
  LlmMessage,
  SdrfRecommendation,
  RecommendationResult,
  RecommendationType,
  RecommendationConfidence,
  AnalysisFocusArea,
  LlmError,
  createEmptyRecommendationResult,
  createRecommendationSummary,
  generateRecommendationId,
} from '../../models/llm';
import { SdrfTable } from '../../models/sdrf-table';
import { ILlmProvider } from './providers/base-provider';
import { OpenAIProvider } from './providers/openai-provider';
import { ContextBuilderService, YamlTemplate } from './context-builder.service';
import { PromptService, QualityIssueForPrompt } from './prompt.service';
import { LlmSettingsService, llmSettingsService } from './settings.service';
import { ColumnQualityService, TableQualityResult, ColumnQuality } from '../column-quality.service';

/**
 * Cache entry for recommendations.
 */
interface CacheEntry {
  result: RecommendationResult;
  timestamp: number;
  tableHash: string;
}

/**
 * Configuration for the recommendation service.
 */
export interface RecommendationServiceConfig {
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTtlMs?: number;

  /** Enable caching (default: true) */
  enableCache?: boolean;

  /** Maximum recommendations per analysis (default: 50) */
  maxRecommendations?: number;
}

const DEFAULT_CONFIG: RecommendationServiceConfig = {
  cacheTtlMs: 5 * 60 * 1000,
  enableCache: true,
  maxRecommendations: 50,
};

/**
 * Enhanced result including quality analysis.
 */
export interface EnhancedRecommendationResult extends RecommendationResult {
  /** Quality analysis of all columns */
  qualityAnalysis?: TableQualityResult;
}

/**
 * Recommendation Service
 *
 * Generates AI-powered recommendations for improving SDRF files.
 * Now integrates with ColumnQualityService for enhanced prompts.
 */
export class RecommendationService {
  private config: RecommendationServiceConfig;
  private providers: Map<LlmProviderType, ILlmProvider> = new Map();
  private cache: Map<string, CacheEntry> = new Map();
  private contextBuilder: ContextBuilderService;
  private promptService: PromptService;
  private settingsService: LlmSettingsService;
  private qualityService: ColumnQualityService;

  constructor(
    config: RecommendationServiceConfig = {},
    settingsService?: LlmSettingsService
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.contextBuilder = new ContextBuilderService();
    this.promptService = new PromptService(this.contextBuilder);
    this.settingsService = settingsService || llmSettingsService;
    this.qualityService = new ColumnQualityService();
  }

  // ============ Public API ============

  /**
   * Analyzes an SDRF table and generates recommendations.
   * Now includes quality analysis for enhanced prompts.
   */
  async analyze(
    table: SdrfTable,
    focusAreas: AnalysisFocusArea[] = ['all'],
    template?: YamlTemplate,
    includeQualityAnalysis: boolean = true
  ): Promise<EnhancedRecommendationResult> {
    const provider = await this.getActiveProvider();
    const config = this.settingsService.getActiveProviderConfig();

    if (!config) {
      throw new LlmError(
        'No LLM provider configured',
        'NOT_CONFIGURED'
      );
    }

    // Check cache
    const cacheKey = this.getCacheKey(table, focusAreas);
    if (this.config.enableCache) {
      const cached = this.getFromCache(cacheKey, table);
      if (cached) {
        return cached;
      }
    }

    // Perform quality analysis to enhance prompts
    let qualityAnalysis: TableQualityResult | undefined;
    let qualityIssues: QualityIssueForPrompt[] = [];

    if (includeQualityAnalysis) {
      qualityAnalysis = this.qualityService.analyzeTable(table);
      qualityIssues = this.promptService.convertQualityToPromptIssues(qualityAnalysis.columns);
    }

    // Build context
    const context = this.contextBuilder.buildContext(table, focusAreas, template);

    // If no issues found and no quality issues, return empty result
    if (context.issues.length === 0 && qualityIssues.length === 0) {
      const emptyResult = createEmptyRecommendationResult(config.provider, config.model);
      return { ...emptyResult, qualityAnalysis };
    }

    // Build messages with quality issues for enhanced prompts
    const messages = this.promptService.buildAnalysisMessages(context, undefined, qualityIssues);

    // Call LLM
    const response = await provider.complete(messages);

    // Parse recommendations
    const recommendations = this.parseRecommendations(response.content, table);

    // Build result
    const result: EnhancedRecommendationResult = {
      recommendations: recommendations.slice(0, this.config.maxRecommendations),
      summary: createRecommendationSummary(recommendations),
      rawResponse: response.content,
      timestamp: new Date(),
      provider: config.provider,
      model: config.model,
      qualityAnalysis,
    };

    // Cache result
    if (this.config.enableCache) {
      this.addToCache(cacheKey, result, table);
    }

    return result;
  }

  /**
   * Performs quality analysis only (without LLM).
   * Useful for quick column quality checks.
   */
  analyzeQuality(table: SdrfTable): TableQualityResult {
    return this.qualityService.analyzeTable(table);
  }

  /**
   * Gets the quality service for direct access.
   */
  getQualityService(): ColumnQualityService {
    return this.qualityService;
  }

  /**
   * Analyzes with streaming response.
   * Yields partial content as it arrives, then returns final result.
   * Now includes quality analysis for enhanced prompts.
   */
  async *analyzeStreaming(
    table: SdrfTable,
    focusAreas: AnalysisFocusArea[] = ['all'],
    template?: YamlTemplate,
    includeQualityAnalysis: boolean = true
  ): AsyncGenerator<string, EnhancedRecommendationResult, unknown> {
    const provider = await this.getActiveProvider();
    const config = this.settingsService.getActiveProviderConfig();

    if (!config) {
      throw new LlmError('No LLM provider configured', 'NOT_CONFIGURED');
    }

    if (!provider.supportsStreaming) {
      // Fall back to non-streaming
      const result = await this.analyze(table, focusAreas, template, includeQualityAnalysis);
      yield result.rawResponse || '';
      return result;
    }

    // Perform quality analysis
    let qualityAnalysis: TableQualityResult | undefined;
    let qualityIssues: QualityIssueForPrompt[] = [];

    if (includeQualityAnalysis) {
      qualityAnalysis = this.qualityService.analyzeTable(table);
      qualityIssues = this.promptService.convertQualityToPromptIssues(qualityAnalysis.columns);
    }

    // Build context and messages with quality issues
    const context = this.contextBuilder.buildContext(table, focusAreas, template);
    const messages = this.promptService.buildAnalysisMessages(context, undefined, qualityIssues);

    // Stream response
    let fullContent = '';
    for await (const chunk of provider.stream(messages)) {
      fullContent += chunk.content;
      yield chunk.content;
    }

    // Parse final response
    const recommendations = this.parseRecommendations(fullContent, table);

    const result: EnhancedRecommendationResult = {
      recommendations: recommendations.slice(0, this.config.maxRecommendations),
      summary: createRecommendationSummary(recommendations),
      rawResponse: fullContent,
      timestamp: new Date(),
      provider: config.provider,
      model: config.model,
      qualityAnalysis,
    };

    // Cache result
    const cacheKey = this.getCacheKey(table, focusAreas);
    if (this.config.enableCache) {
      this.addToCache(cacheKey, result, table);
    }

    return result;
  }

  /**
   * Analyzes a specific column.
   */
  async analyzeColumn(
    table: SdrfTable,
    columnName: string,
    template?: YamlTemplate
  ): Promise<RecommendationResult> {
    const provider = await this.getActiveProvider();
    const config = this.settingsService.getActiveProviderConfig();

    if (!config) {
      throw new LlmError('No LLM provider configured', 'NOT_CONFIGURED');
    }

    // Build context focused on this column
    const context = this.contextBuilder.buildContext(table, ['all'], template);
    const messages = this.promptService.buildColumnFocusedPrompt(context, columnName);

    // Call LLM
    const response = await provider.complete(messages);

    // Parse recommendations
    const recommendations = this.parseRecommendations(response.content, table);

    return {
      recommendations,
      summary: createRecommendationSummary(recommendations),
      rawResponse: response.content,
      timestamp: new Date(),
      provider: config.provider,
      model: config.model,
    };
  }

  /**
   * Aborts any in-progress analysis.
   */
  abort(): void {
    for (const provider of this.providers.values()) {
      provider.abort();
    }
  }

  /**
   * Clears the recommendation cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Gets the active provider, initializing it if necessary.
   */
  async getActiveProvider(): Promise<ILlmProvider> {
    const providerType = this.settingsService.getActiveProvider();
    const config = this.settingsService.getActiveProviderConfig();

    if (!config) {
      throw new LlmError(
        `Provider ${providerType} is not configured`,
        'NOT_CONFIGURED',
        providerType
      );
    }

    // Get or create provider instance
    let provider = this.providers.get(providerType);

    if (!provider) {
      provider = await this.createProvider(providerType, config);
      this.providers.set(providerType, provider);
    } else {
      // Update config if changed
      provider.setConfig(config);
    }

    return provider;
  }

  /**
   * Tests the connection to the active provider.
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const provider = await this.getActiveProvider();

      // Send a simple test message
      const messages: LlmMessage[] = [
        { role: 'user', content: 'Say "OK" if you can read this.' },
      ];

      const response = await provider.complete(messages);

      if (response.content && response.content.length > 0) {
        return { success: true };
      }

      return { success: false, error: 'Empty response from provider' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  // ============ Private Methods ============

  /**
   * Creates a provider instance.
   */
  private async createProvider(
    type: LlmProviderType,
    config: any
  ): Promise<ILlmProvider> {
    // Ensure API key is loaded
    const apiKey = await this.settingsService.getApiKey(type);
    const fullConfig = { ...config, apiKey };

    switch (type) {
      case 'openai':
        return new OpenAIProvider(fullConfig);

      case 'anthropic':
        // Dynamically import to avoid loading unused providers
        const { AnthropicProvider } = await import('./providers/anthropic-provider');
        return new AnthropicProvider(fullConfig);

      case 'gemini':
        const { GeminiProvider } = await import('./providers/gemini-provider');
        return new GeminiProvider(fullConfig);

      case 'ollama':
        const { OllamaProvider } = await import('./providers/ollama-provider');
        return new OllamaProvider(fullConfig);

      default:
        throw new LlmError(
          `Unknown provider type: ${type}`,
          'PROVIDER_ERROR',
          type
        );
    }
  }

  /**
   * Parses recommendations from LLM response.
   */
  private parseRecommendations(
    content: string,
    table: SdrfTable
  ): SdrfRecommendation[] {
    try {
      // Multiple strategies to extract JSON from the response
      let parsed: any = null;

      // Strategy 1: Extract from markdown code block
      const jsonCodeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonCodeBlockMatch) {
        try {
          parsed = JSON.parse(jsonCodeBlockMatch[1].trim());
        } catch {
          // Continue to next strategy
        }
      }

      // Strategy 2: Try parsing the entire content as JSON
      if (!parsed) {
        try {
          parsed = JSON.parse(content.trim());
        } catch {
          // Continue to next strategy
        }
      }

      // Strategy 3: Find JSON object containing "recommendations" array
      if (!parsed) {
        const objectMatch = content.match(/\{[\s\S]*?"recommendations"\s*:\s*\[[\s\S]*?\][\s\S]*?\}/);
        if (objectMatch) {
          try {
            parsed = JSON.parse(objectMatch[0]);
          } catch {
            // Continue to next strategy
          }
        }
      }

      // Strategy 4: Find any JSON array (might be the recommendations directly)
      if (!parsed) {
        const arrayMatch = content.match(/\[[\s\S]*?\{[\s\S]*?"column"[\s\S]*?\}[\s\S]*?\]/);
        if (arrayMatch) {
          try {
            parsed = JSON.parse(arrayMatch[0]);
          } catch {
            // Continue to next strategy
          }
        }
      }

      // Strategy 5: Try to find and fix common JSON issues (trailing commas, etc)
      if (!parsed) {
        try {
          // Remove any text before first { or [
          let cleaned = content.replace(/^[^{[]*/, '');
          // Remove any text after last } or ]
          cleaned = cleaned.replace(/[^}\]]*$/, '');
          // Remove trailing commas before ] or }
          cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');
          parsed = JSON.parse(cleaned);
        } catch {
          console.warn('Failed to parse recommendations JSON after all strategies');
          return [];
        }
      }

      // Extract recommendations array
      let rawRecs: any[];
      if (Array.isArray(parsed)) {
        rawRecs = parsed;
      } else if (parsed && Array.isArray(parsed.recommendations)) {
        rawRecs = parsed.recommendations;
      } else {
        console.warn('Could not find recommendations array in response');
        return [];
      }

      // Convert and validate recommendations
      const recommendations: SdrfRecommendation[] = [];

      for (const raw of rawRecs) {
        const rec = this.validateAndConvertRecommendation(raw, table);
        if (rec) {
          recommendations.push(rec);
        }
      }

      console.log(`Parsed ${recommendations.length} recommendations from LLM response`);
      return recommendations;
    } catch (error) {
      console.error('Failed to parse recommendations:', error);
      return [];
    }
  }

  /**
   * Validates and converts a raw recommendation object.
   */
  private validateAndConvertRecommendation(
    raw: any,
    table: SdrfTable
  ): SdrfRecommendation | null {
    // Required fields
    if (!raw.column || !raw.suggestedValue) {
      return null;
    }

    // Find column index
    let columnIndex = raw.columnIndex;
    if (typeof columnIndex !== 'number') {
      columnIndex = table.columns.findIndex(
        (c) => c.name.toLowerCase() === raw.column.toLowerCase()
      );
    }

    if (columnIndex < 0 || columnIndex >= table.columns.length) {
      return null;
    }

    // Validate sample indices
    let sampleIndices = raw.sampleIndices || [];
    if (!Array.isArray(sampleIndices)) {
      sampleIndices = [sampleIndices];
    }
    sampleIndices = sampleIndices
      .filter((i: any) => typeof i === 'number' && i >= 1 && i <= table.sampleCount);

    if (sampleIndices.length === 0) {
      return null;
    }

    // Validate type
    const validTypes: RecommendationType[] = [
      'fill_value',
      'correct_value',
      'ontology_suggestion',
      'consistency_fix',
      'add_column',
    ];
    const type = validTypes.includes(raw.type) ? raw.type : 'fill_value';

    // Validate confidence
    const validConfidences: RecommendationConfidence[] = ['high', 'medium', 'low'];
    const confidence = validConfidences.includes(raw.confidence)
      ? raw.confidence
      : 'medium';

    return {
      id: generateRecommendationId(),
      type,
      column: raw.column,
      columnIndex,
      sampleIndices,
      currentValue: raw.currentValue || undefined,
      suggestedValue: String(raw.suggestedValue),
      confidence,
      reasoning: raw.reasoning || 'No explanation provided',
      applied: false,
      ontologyId: raw.ontologyId,
      ontologyLabel: raw.ontologyLabel,
    };
  }

  /**
   * Generates a cache key for a table and focus areas.
   */
  private getCacheKey(table: SdrfTable, focusAreas: AnalysisFocusArea[]): string {
    return JSON.stringify({
      sampleCount: table.sampleCount,
      columnCount: table.columns.length,
      focusAreas: focusAreas.sort(),
    });
  }

  /**
   * Generates a simple hash of the table content for cache validation.
   */
  private getTableHash(table: SdrfTable): string {
    // Simple hash based on first few values
    const samples: string[] = [];
    for (let i = 0; i < Math.min(5, table.columns.length); i++) {
      const col = table.columns[i];
      samples.push(`${col.name}:${col.value}`);
    }
    return samples.join('|');
  }

  /**
   * Gets a cached result if valid.
   */
  private getFromCache(key: string, table: SdrfTable): RecommendationResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.config.cacheTtlMs!) {
      this.cache.delete(key);
      return null;
    }

    // Check table hash
    if (entry.tableHash !== this.getTableHash(table)) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  /**
   * Adds a result to the cache.
   */
  private addToCache(
    key: string,
    result: RecommendationResult,
    table: SdrfTable
  ): void {
    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      tableHash: this.getTableHash(table),
    });

    // Limit cache size
    if (this.cache.size > 20) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
  }
}

// Export singleton instance
export const recommendationService = new RecommendationService();
