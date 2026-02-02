/**
 * Suggestion Enrichment Service
 *
 * Validates LLM suggestions against OLS (Ontology Lookup Service) and
 * computes available actions for each suggestion.
 */

import { Injectable } from '@angular/core';
import {
  ActionableSuggestion,
  ActionableSuggestionType,
  SuggestionAction,
  SuggestionValidation,
  RawLlmSuggestion,
  EnrichmentProgress,
  EnrichmentResult,
  generateActionableSuggestionId,
  normalizeType,
  requiresOntologyValidation,
  getOntologiesForColumn,
  computeImpactDescription,
  SuggestionSource,
  SuggestionStatus,
} from '../../models/actionable-suggestion';
import { OntologySuggestion } from '../../models/ontology';
import { RecommendationConfidence, SdrfRecommendation } from '../../models/llm';
import { SdrfTable } from '../../models/sdrf-table';
import { SdrfColumn, getValueForSample } from '../../models/sdrf-column';
import { DirectOlsService, olsService } from '../ols.service';
import { TableStateService, tableStateService } from '../table-state.service';

/**
 * Configuration for the enrichment service.
 */
export interface EnrichmentConfig {
  /** Whether to validate against OLS (default: true) */
  validateOls: boolean;

  /** Maximum alternatives to fetch from OLS (default: 5) */
  maxAlternatives: number;

  /** Timeout for OLS requests in ms (default: 5000) */
  olsTimeoutMs: number;

  /** Whether to skip validation for low confidence suggestions */
  skipLowConfidenceValidation: boolean;
}

const DEFAULT_CONFIG: EnrichmentConfig = {
  validateOls: true,
  maxAlternatives: 5,
  olsTimeoutMs: 5000,
  skipLowConfidenceValidation: false,
};

/**
 * Injectable service for enriching suggestions with OLS validation.
 */
@Injectable({
  providedIn: 'root'
})
export class SuggestionEnrichmentService {
  private config: EnrichmentConfig;
  private olsService: DirectOlsService;
  private tableStateService: TableStateService;

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.olsService = olsService;
    this.tableStateService = tableStateService;
  }

  /**
   * Sets the configuration.
   */
  setConfig(config: Partial<EnrichmentConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Enriches a single raw LLM suggestion with OLS validation and actions.
   */
  async enrichSuggestion(
    raw: RawLlmSuggestion,
    table: SdrfTable,
    source: SuggestionSource = 'analysis'
  ): Promise<ActionableSuggestion> {
    const tableHash = this.tableStateService.computeTableHash(table);
    const type = normalizeType(raw.type);
    const columnIndex = this.resolveColumnIndex(raw, table);
    const affectedSamples = this.resolveAffectedSamples(raw, table, columnIndex);
    const currentValues = this.getCurrentValues(table, columnIndex, affectedSamples);

    // Create base suggestion
    const suggestion: ActionableSuggestion = {
      id: generateActionableSuggestionId(),
      timestamp: new Date(),
      source,
      type,
      column: raw.column,
      columnIndex,
      affectedSamples,
      currentValues,
      suggestedValue: raw.suggestedValue,
      ontologyId: raw.ontologyId,
      ontologyLabel: raw.ontologyLabel,
      validation: {
        olsValidated: false,
        tableStateHash: tableHash,
        isStale: false,
      },
      reasoning: raw.reasoning || 'No explanation provided',
      confidence: this.normalizeConfidence(raw.confidence),
      impactDescription: '',
      availableActions: [],
      status: 'pending',
    };

    // Compute impact description
    suggestion.impactDescription = computeImpactDescription(suggestion, table.sampleCount);

    // Perform OLS validation if needed
    if (this.config.validateOls && this.shouldValidateWithOls(suggestion)) {
      suggestion.validation = await this.validateWithOls(suggestion);
    }

    // Compute available actions
    suggestion.availableActions = this.computeActions(suggestion);

    return suggestion;
  }

  /**
   * Enriches multiple raw suggestions with streaming progress.
   */
  async *enrichSuggestionsStreaming(
    rawSuggestions: RawLlmSuggestion[],
    table: SdrfTable,
    source: SuggestionSource = 'analysis'
  ): AsyncGenerator<EnrichmentProgress | EnrichmentResult> {
    const total = rawSuggestions.length;
    const enriched: ActionableSuggestion[] = [];
    let validatedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < rawSuggestions.length; i++) {
      const raw = rawSuggestions[i];

      // Yield progress
      yield {
        type: 'progress',
        message: `Enriching suggestion ${i + 1}/${total}: ${raw.column}`,
        current: i + 1,
        total,
      };

      try {
        const suggestion = await this.enrichSuggestion(raw, table, source);
        enriched.push(suggestion);

        if (suggestion.validation.olsValidated) {
          validatedCount++;
        }
      } catch (error) {
        console.error(`Failed to enrich suggestion for ${raw.column}:`, error);
        failedCount++;

        // Create a basic suggestion without validation
        const fallback = this.createFallbackSuggestion(raw, table, source);
        enriched.push(fallback);
      }
    }

    // Yield final result
    yield {
      type: 'complete',
      suggestions: enriched,
      enrichedCount: enriched.length,
      validatedCount,
      failedCount,
    };
  }

  /**
   * Enriches existing SdrfRecommendation objects (for backward compatibility).
   */
  async enrichRecommendations(
    recommendations: SdrfRecommendation[],
    table: SdrfTable
  ): Promise<ActionableSuggestion[]> {
    const enriched: ActionableSuggestion[] = [];

    for (const rec of recommendations) {
      const raw: RawLlmSuggestion = {
        type: rec.type,
        column: rec.column,
        columnIndex: rec.columnIndex,
        sampleIndices: rec.sampleIndices,
        currentValue: rec.currentValue,
        suggestedValue: rec.suggestedValue,
        confidence: rec.confidence,
        reasoning: rec.reasoning,
        ontologyId: rec.ontologyId,
        ontologyLabel: rec.ontologyLabel,
      };

      const suggestion = await this.enrichSuggestion(raw, table, 'analysis');
      enriched.push(suggestion);
    }

    return enriched;
  }

  /**
   * Validates a suggestion against OLS.
   */
  async validateWithOls(
    suggestion: ActionableSuggestion
  ): Promise<SuggestionValidation> {
    const validation: SuggestionValidation = {
      olsValidated: false,
      tableStateHash: suggestion.validation.tableStateHash,
      isStale: suggestion.validation.isStale,
    };

    try {
      const ontologies = getOntologiesForColumn(suggestion.column);
      const searchValue = suggestion.suggestedValue;

      // Search for the suggested value in relevant ontologies
      const response = await this.olsService.search({
        query: searchValue,
        ontology: ontologies,
        rows: this.config.maxAlternatives + 1,
      });

      validation.olsValidated = true;
      validation.validatedAt = new Date();

      if (response.suggestions.length > 0) {
        // Check for exact match
        const exactMatch = response.suggestions.find(s =>
          this.isExactMatch(s, searchValue)
        );

        if (exactMatch) {
          validation.olsMatch = exactMatch;
          // Remaining suggestions are alternatives
          validation.olsAlternatives = response.suggestions
            .filter(s => s.id !== exactMatch.id)
            .slice(0, this.config.maxAlternatives);
        } else {
          // No exact match - all are alternatives
          validation.olsAlternatives = response.suggestions
            .slice(0, this.config.maxAlternatives);
        }
      }
    } catch (error) {
      console.error('OLS validation failed:', error);
      validation.validationError = error instanceof Error ? error.message : 'Unknown error';
    }

    return validation;
  }

  /**
   * Searches OLS for alternatives to a suggestion.
   */
  async findAlternatives(
    suggestion: ActionableSuggestion,
    limit: number = 5
  ): Promise<OntologySuggestion[]> {
    const ontologies = getOntologiesForColumn(suggestion.column);

    const response = await this.olsService.search({
      query: suggestion.suggestedValue,
      ontology: ontologies,
      rows: limit,
    });

    return response.suggestions;
  }

  /**
   * Computes available actions for a suggestion.
   */
  computeActions(suggestion: ActionableSuggestion): SuggestionAction[] {
    const actions: SuggestionAction[] = [];

    const isStale = suggestion.validation.isStale;
    const hasOlsMatch = suggestion.validation.olsMatch !== undefined;
    const hasAlternatives = (suggestion.validation.olsAlternatives?.length || 0) > 0;

    // Primary action: Apply
    if (hasOlsMatch) {
      actions.push({
        type: 'apply_ols',
        label: 'Apply (OLS Verified)',
        icon: 'verified',
        enabled: !isStale,
        tooltip: `Apply ${suggestion.validation.olsMatch!.label} (${suggestion.validation.olsMatch!.id})`,
        priority: 1,
        isPrimary: true,
      });
    } else {
      actions.push({
        type: 'apply',
        label: 'Apply',
        icon: 'check',
        enabled: !isStale,
        tooltip: hasAlternatives
          ? 'Apply (term not found in OLS)'
          : 'Apply this suggestion',
        priority: 1,
        isPrimary: true,
      });
    }

    // Show alternatives if available
    if (hasAlternatives) {
      const count = suggestion.validation.olsAlternatives!.length;
      actions.push({
        type: 'alternatives',
        label: `${count} Alternative${count > 1 ? 's' : ''}`,
        icon: 'list',
        enabled: true,
        tooltip: 'Show OLS alternatives',
        priority: 2,
      });
    }

    // Preview action
    actions.push({
      type: 'preview',
      label: 'Preview',
      icon: 'visibility',
      enabled: !isStale,
      tooltip: `Preview changes to ${suggestion.affectedSamples.length} sample(s)`,
      priority: 3,
    });

    // Explain in chat
    actions.push({
      type: 'chat',
      label: 'Explain',
      icon: 'chat',
      enabled: true,
      tooltip: 'Ask AI to explain this suggestion',
      priority: 4,
    });

    // Dismiss
    actions.push({
      type: 'dismiss',
      label: 'Dismiss',
      icon: 'close',
      enabled: true,
      tooltip: 'Dismiss this suggestion',
      priority: 5,
    });

    // Sort by priority
    return actions.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Builds a chat prompt for explaining a suggestion.
   */
  buildExplanationPrompt(suggestion: ActionableSuggestion): string {
    const parts: string[] = [
      'The user wants to understand this AI suggestion:',
      '',
      `**Suggestion Type**: ${suggestion.type}`,
      `**Column**: "${suggestion.column}"`,
      `**Current Value**: "${this.getFirstCurrentValue(suggestion)}"`,
      `**Suggested Value**: "${suggestion.suggestedValue}"`,
      `**Affected Samples**: ${suggestion.affectedSamples.length}`,
      `**Confidence**: ${suggestion.confidence}`,
      `**Original Reasoning**: ${suggestion.reasoning}`,
    ];

    if (suggestion.validation.olsMatch) {
      parts.push('');
      parts.push('**OLS Match Found**:');
      parts.push(`- Label: ${suggestion.validation.olsMatch.label}`);
      parts.push(`- ID: ${suggestion.validation.olsMatch.id}`);
      if (suggestion.validation.olsMatch.description) {
        parts.push(`- Description: ${suggestion.validation.olsMatch.description}`);
      }
    } else if (suggestion.validation.olsAlternatives?.length) {
      parts.push('');
      parts.push('**Note**: The suggested term was not found in OLS. Alternatives:');
      for (const alt of suggestion.validation.olsAlternatives.slice(0, 3)) {
        parts.push(`- ${alt.label} (${alt.id})`);
      }
    }

    parts.push('');
    parts.push('Please explain:');
    parts.push('1. Why this change is recommended');
    parts.push('2. What the suggested value means in the context of proteomics/SDRF');
    parts.push('3. Whether you recommend applying it');
    parts.push('4. Any alternatives the user should consider');

    return parts.join('\n');
  }

  // === Private Helper Methods ===

  private shouldValidateWithOls(suggestion: ActionableSuggestion): boolean {
    // Skip validation for certain types
    if (suggestion.type === 'add_column' || suggestion.type === 'remove_redundant') {
      return false;
    }

    // Skip low confidence if configured
    if (this.config.skipLowConfidenceValidation && suggestion.confidence === 'low') {
      return false;
    }

    // Check if column requires ontology validation
    return requiresOntologyValidation(suggestion.column, suggestion.type);
  }

  private resolveColumnIndex(raw: RawLlmSuggestion, table: SdrfTable): number {
    // Always find by name first to ensure accuracy
    const indexByName = table.columns.findIndex(
      c => c.name.toLowerCase() === raw.column.toLowerCase()
    );

    // If we found a column by name, use that index
    if (indexByName >= 0) {
      // If LLM provided a different index, log a warning but use the name-based one
      if (typeof raw.columnIndex === 'number' && raw.columnIndex !== indexByName) {
        console.warn(
          `Column index mismatch: LLM said ${raw.columnIndex} for "${raw.column}", ` +
          `but found at index ${indexByName}. Using name-based lookup.`
        );
      }
      return indexByName;
    }

    // If name lookup failed but LLM provided an index, use it as fallback
    if (typeof raw.columnIndex === 'number' && raw.columnIndex >= 0 && raw.columnIndex < table.columns.length) {
      console.warn(
        `Column "${raw.column}" not found by name, using LLM-provided index ${raw.columnIndex}`
      );
      return raw.columnIndex;
    }

    return -1;
  }

  private resolveAffectedSamples(
    raw: RawLlmSuggestion,
    table: SdrfTable,
    columnIndex: number
  ): number[] {
    // If sample indices are provided, validate them
    if (raw.sampleIndices && raw.sampleIndices.length > 0) {
      return raw.sampleIndices.filter(i => i >= 1 && i <= table.sampleCount);
    }

    // If current value is provided, find samples with that value
    if (raw.currentValue && columnIndex >= 0) {
      const column = table.columns[columnIndex];
      const samples: number[] = [];

      for (let i = 1; i <= table.sampleCount; i++) {
        const value = getValueForSample(column, i);
        if (value.toLowerCase() === raw.currentValue.toLowerCase()) {
          samples.push(i);
        }
      }

      if (samples.length > 0) {
        return samples;
      }
    }

    // Default to all samples
    return Array.from({ length: table.sampleCount }, (_, i) => i + 1);
  }

  private getCurrentValues(
    table: SdrfTable,
    columnIndex: number,
    sampleIndices: number[]
  ): Map<number, string> {
    const values = new Map<number, string>();

    if (columnIndex < 0 || columnIndex >= table.columns.length) {
      return values;
    }

    const column = table.columns[columnIndex];

    for (const sampleIndex of sampleIndices) {
      const value = getValueForSample(column, sampleIndex);
      values.set(sampleIndex, value);
    }

    return values;
  }

  private normalizeConfidence(confidence?: string): RecommendationConfidence {
    if (!confidence) return 'medium';

    const normalized = confidence.toLowerCase();
    if (normalized === 'high') return 'high';
    if (normalized === 'low') return 'low';
    return 'medium';
  }

  private isExactMatch(suggestion: OntologySuggestion, searchValue: string): boolean {
    const normalizedSearch = searchValue.toLowerCase().trim();
    const normalizedLabel = suggestion.label.toLowerCase().trim();

    // Check label match
    if (normalizedLabel === normalizedSearch) {
      return true;
    }

    // Check ID match
    if (suggestion.id.toLowerCase() === normalizedSearch) {
      return true;
    }

    // Check synonyms
    if (suggestion.synonyms?.some(s => s.toLowerCase().trim() === normalizedSearch)) {
      return true;
    }

    return false;
  }

  private getFirstCurrentValue(suggestion: ActionableSuggestion): string {
    const iterator = suggestion.currentValues.values();
    const first = iterator.next();
    return first.done ? 'N/A' : first.value;
  }

  private createFallbackSuggestion(
    raw: RawLlmSuggestion,
    table: SdrfTable,
    source: SuggestionSource
  ): ActionableSuggestion {
    const tableHash = this.tableStateService.computeTableHash(table);
    const type = normalizeType(raw.type);
    const columnIndex = this.resolveColumnIndex(raw, table);
    const affectedSamples = this.resolveAffectedSamples(raw, table, columnIndex);
    const currentValues = this.getCurrentValues(table, columnIndex, affectedSamples);

    const suggestion: ActionableSuggestion = {
      id: generateActionableSuggestionId(),
      timestamp: new Date(),
      source,
      type,
      column: raw.column,
      columnIndex,
      affectedSamples,
      currentValues,
      suggestedValue: raw.suggestedValue,
      ontologyId: raw.ontologyId,
      ontologyLabel: raw.ontologyLabel,
      validation: {
        olsValidated: false,
        tableStateHash: tableHash,
        isStale: false,
        validationError: 'Validation skipped due to error',
      },
      reasoning: raw.reasoning || 'No explanation provided',
      confidence: this.normalizeConfidence(raw.confidence),
      impactDescription: computeImpactDescription(
        { type, column: raw.column, affectedSamples },
        table.sampleCount
      ),
      availableActions: [],
      status: 'pending',
    };

    suggestion.availableActions = this.computeActions(suggestion);
    return suggestion;
  }
}

/**
 * Singleton instance for convenience in non-DI contexts.
 */
export const suggestionEnrichmentService = new SuggestionEnrichmentService();
