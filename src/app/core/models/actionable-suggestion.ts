/**
 * Actionable Suggestion Models
 *
 * Unified suggestion model that combines LLM recommendations with OLS validation
 * and provides clear, actionable operations for users.
 */

import { OntologySuggestion } from './ontology';
import { RecommendationConfidence } from './llm';

/**
 * Types of actionable suggestions.
 */
export type ActionableSuggestionType =
  | 'fill_value'        // Fill empty or "not available" cells
  | 'correct_value'     // Correct invalid or wrong values
  | 'ontology_mapping'  // Map free text to ontology term
  | 'consistency_fix'   // Fix case/format consistency issues
  | 'add_column'        // Add a missing required column
  | 'remove_redundant'  // Remove duplicate/constant columns
  | 'relationship_fix'; // Fix cross-column consistency issues

/**
 * Source of the suggestion.
 */
export type SuggestionSource = 'analysis' | 'chat' | 'ols' | 'quality';

/**
 * Status of a suggestion.
 */
export type SuggestionStatus = 'pending' | 'applied' | 'dismissed' | 'stale';

/**
 * Types of actions available on a suggestion.
 */
export type SuggestionActionType =
  | 'apply'         // Apply the suggestion to the table
  | 'apply_ols'     // Apply with OLS-verified term
  | 'explain'       // Get AI explanation in chat
  | 'alternatives'  // Show OLS alternatives
  | 'preview'       // Preview changes before applying
  | 'dismiss'       // Dismiss/ignore this suggestion
  | 'chat';         // Send to chat for discussion

/**
 * An action that can be performed on a suggestion.
 */
export interface SuggestionAction {
  /** Type of action */
  type: SuggestionActionType;

  /** Display label for the action button */
  label: string;

  /** Icon name (Material Icons) */
  icon: string;

  /** Whether this action is currently enabled */
  enabled: boolean;

  /** Tooltip/description for the action */
  tooltip?: string;

  /** Priority for display order (lower = higher priority) */
  priority: number;

  /** Whether this is a primary (highlighted) action */
  isPrimary?: boolean;
}

/**
 * OLS validation result for a suggestion.
 */
export interface SuggestionValidation {
  /** Whether OLS validation was performed */
  olsValidated: boolean;

  /** Exact match found in OLS */
  olsMatch?: OntologySuggestion;

  /** Alternative suggestions from OLS (if no exact match) */
  olsAlternatives?: OntologySuggestion[];

  /** Hash of table state when suggestion was created */
  tableStateHash: string;

  /** Whether the suggestion is stale (table changed since creation) */
  isStale: boolean;

  /** Timestamp of validation */
  validatedAt?: Date;

  /** Error message if validation failed */
  validationError?: string;
}

/**
 * A fully enriched, actionable suggestion.
 */
export interface ActionableSuggestion {
  // === Identity ===

  /** Unique identifier */
  id: string;

  /** When the suggestion was created */
  timestamp: Date;

  /** Source of this suggestion */
  source: SuggestionSource;

  // === What to change ===

  /** Type of suggestion */
  type: ActionableSuggestionType;

  /** Target column name */
  column: string;

  /** Target column index (0-based) */
  columnIndex: number;

  /** Affected sample indices (1-based) */
  affectedSamples: number[];

  /** Current values for affected samples */
  currentValues: Map<number, string>;

  /** Suggested new value */
  suggestedValue: string;

  /** Ontology ID if applicable (e.g., "EFO:0000305") */
  ontologyId?: string;

  /** Ontology term label if applicable */
  ontologyLabel?: string;

  // === Validation ===

  /** OLS validation status and results */
  validation: SuggestionValidation;

  // === User context ===

  /** AI reasoning for this suggestion */
  reasoning: string;

  /** Confidence level */
  confidence: RecommendationConfidence;

  /** Human-readable impact description */
  impactDescription: string;

  // === Actions ===

  /** Available actions for this suggestion */
  availableActions: SuggestionAction[];

  // === State ===

  /** Current status */
  status: SuggestionStatus;

  /** ID of related chat message (if from chat or explained) */
  linkedChatMessageId?: string;

  /** ID of parent suggestion (if this is a derived alternative) */
  parentSuggestionId?: string;
}

/**
 * Raw suggestion from LLM before enrichment.
 */
export interface RawLlmSuggestion {
  type: string;
  column: string;
  columnIndex?: number;
  sampleIndices?: number[];
  currentValue?: string;
  suggestedValue: string;
  confidence?: string;
  reasoning?: string;
  ontologyId?: string;
  ontologyLabel?: string;
}

/**
 * Progress update during suggestion enrichment.
 */
export interface EnrichmentProgress {
  type: 'progress';
  message: string;
  current: number;
  total: number;
}

/**
 * Result of suggestion enrichment.
 */
export interface EnrichmentResult {
  type: 'complete';
  suggestions: ActionableSuggestion[];
  enrichedCount: number;
  validatedCount: number;
  failedCount: number;
}

/**
 * Event emitted when a suggestion action is triggered.
 */
export interface SuggestionActionEvent {
  /** The suggestion being acted upon */
  suggestion: ActionableSuggestion;

  /** The action being performed */
  action: SuggestionAction;

  /** Selected OLS alternative (for 'apply_ols' action) */
  selectedAlternative?: OntologySuggestion;
}

/**
 * Summary of suggestions by various dimensions.
 */
export interface SuggestionSummary {
  total: number;
  byStatus: Record<SuggestionStatus, number>;
  byType: Partial<Record<ActionableSuggestionType, number>>;
  byConfidence: Record<RecommendationConfidence, number>;
  bySource: Partial<Record<SuggestionSource, number>>;
  olsValidated: number;
  olsMatched: number;
  stale: number;
}

// === Utility Functions ===

/**
 * Generates a unique suggestion ID.
 */
export function generateActionableSuggestionId(): string {
  return `asg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Converts a raw LLM suggestion type to ActionableSuggestionType.
 */
export function normalizeType(rawType: string): ActionableSuggestionType {
  const typeMap: Record<string, ActionableSuggestionType> = {
    'fill_value': 'fill_value',
    'correct_value': 'correct_value',
    'ontology_suggestion': 'ontology_mapping',
    'ontology_mapping': 'ontology_mapping',
    'consistency_fix': 'consistency_fix',
    'add_column': 'add_column',
    'remove_column': 'remove_redundant',
    'remove_redundant': 'remove_redundant',
    'relationship_fix': 'relationship_fix',
  };

  return typeMap[rawType] || 'fill_value';
}

/**
 * Creates a summary from a list of suggestions.
 */
export function createSuggestionSummary(suggestions: ActionableSuggestion[]): SuggestionSummary {
  const summary: SuggestionSummary = {
    total: suggestions.length,
    byStatus: { pending: 0, applied: 0, dismissed: 0, stale: 0 },
    byType: {},
    byConfidence: { high: 0, medium: 0, low: 0 },
    bySource: {},
    olsValidated: 0,
    olsMatched: 0,
    stale: 0,
  };

  for (const s of suggestions) {
    summary.byStatus[s.status]++;
    summary.byType[s.type] = (summary.byType[s.type] || 0) + 1;
    summary.byConfidence[s.confidence]++;
    summary.bySource[s.source] = (summary.bySource[s.source] || 0) + 1;

    if (s.validation.olsValidated) {
      summary.olsValidated++;
      if (s.validation.olsMatch) {
        summary.olsMatched++;
      }
    }

    if (s.validation.isStale) {
      summary.stale++;
    }
  }

  return summary;
}

/**
 * Gets display label for a suggestion type.
 */
export function getSuggestionTypeLabel(type: ActionableSuggestionType): string {
  const labels: Record<ActionableSuggestionType, string> = {
    'fill_value': 'Fill Value',
    'correct_value': 'Correct Value',
    'ontology_mapping': 'Ontology Mapping',
    'consistency_fix': 'Consistency Fix',
    'add_column': 'Add Column',
    'remove_redundant': 'Remove Redundant',
    'relationship_fix': 'Relationship Fix',
  };
  return labels[type] || type;
}

/**
 * Gets icon for a suggestion type.
 */
export function getSuggestionTypeIcon(type: ActionableSuggestionType): string {
  const icons: Record<ActionableSuggestionType, string> = {
    'fill_value': 'edit_note',
    'correct_value': 'auto_fix_high',
    'ontology_mapping': 'account_tree',
    'consistency_fix': 'format_color_text',
    'add_column': 'add_circle',
    'remove_redundant': 'delete',
    'relationship_fix': 'link',
  };
  return icons[type] || 'lightbulb';
}

/**
 * Gets CSS class for confidence level.
 */
export function getConfidenceClass(confidence: RecommendationConfidence): string {
  const classes: Record<RecommendationConfidence, string> = {
    'high': 'confidence-high',
    'medium': 'confidence-medium',
    'low': 'confidence-low',
  };
  return classes[confidence] || 'confidence-medium';
}

/**
 * Determines if a suggestion requires ontology validation.
 */
export function requiresOntologyValidation(
  columnName: string,
  suggestionType: ActionableSuggestionType
): boolean {
  // Types that typically involve ontology terms
  if (suggestionType === 'ontology_mapping') {
    return true;
  }

  // Column patterns that use ontologies
  const ontologyColumns = [
    'organism',
    'disease',
    'cell type',
    'cell_type',
    'tissue',
    'organ',
    'cell line',
    'cell_line',
    'instrument',
    'modification',
    'ancestry',
    'sex',
    'developmental stage',
  ];

  const normalizedColumn = columnName.toLowerCase();
  return ontologyColumns.some(col => normalizedColumn.includes(col));
}

/**
 * Maps column name patterns to relevant ontologies.
 */
export function getOntologiesForColumn(columnName: string): string[] {
  const normalizedColumn = columnName.toLowerCase();

  const mappings: Array<{ pattern: string | RegExp; ontologies: string[] }> = [
    { pattern: 'organism', ontologies: ['ncbitaxon'] },
    { pattern: 'disease', ontologies: ['efo', 'mondo', 'doid'] },
    { pattern: /cell.?type/, ontologies: ['cl', 'bto'] },
    { pattern: /cell.?line/, ontologies: ['clo', 'efo'] },
    { pattern: 'tissue', ontologies: ['uberon', 'bto'] },
    { pattern: 'organ', ontologies: ['uberon'] },
    { pattern: 'instrument', ontologies: ['ms'] },
    { pattern: 'modification', ontologies: ['unimod', 'ms'] },
    { pattern: 'ancestry', ontologies: ['hancestro'] },
    { pattern: 'sex', ontologies: ['pato'] },
    { pattern: 'developmental', ontologies: ['efo'] },
  ];

  for (const { pattern, ontologies } of mappings) {
    if (typeof pattern === 'string') {
      if (normalizedColumn.includes(pattern)) {
        return ontologies;
      }
    } else {
      if (pattern.test(normalizedColumn)) {
        return ontologies;
      }
    }
  }

  // Default to EFO for unknown columns
  return ['efo'];
}

/**
 * Computes impact description for a suggestion.
 */
export function computeImpactDescription(
  suggestion: Partial<ActionableSuggestion>,
  totalSamples: number
): string {
  const sampleCount = suggestion.affectedSamples?.length || 0;
  const percentage = totalSamples > 0
    ? Math.round((sampleCount / totalSamples) * 100)
    : 0;

  const typeLabel = suggestion.type
    ? getSuggestionTypeLabel(suggestion.type).toLowerCase()
    : 'change';

  if (sampleCount === 0) {
    return `Will ${typeLabel} column "${suggestion.column}"`;
  } else if (sampleCount === totalSamples) {
    return `Will ${typeLabel} all ${sampleCount} samples in column "${suggestion.column}"`;
  } else {
    return `Will ${typeLabel} ${sampleCount} samples (${percentage}%) in column "${suggestion.column}"`;
  }
}
