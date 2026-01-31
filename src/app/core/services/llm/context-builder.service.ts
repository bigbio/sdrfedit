/**
 * Context Builder Service
 *
 * Builds context information from SDRF tables and YAML templates
 * for sending to the LLM for analysis and recommendations.
 */

import {
  SdrfAnalysisContext,
  ColumnContext,
  AnalysisIssue,
  AnalysisFocusArea,
} from '../../models/llm';
import { SdrfTable, getTableDataMatrix } from '../../models/sdrf-table';
import { SdrfColumn, getValueForSample } from '../../models/sdrf-column';

/**
 * Reserved SDRF values that indicate missing or special data.
 */
const RESERVED_VALUES = ['not available', 'not applicable', 'anonymized', 'pooled'];

/**
 * Configuration for context building.
 */
export interface ContextBuilderConfig {
  /** Maximum number of samples to include in context */
  maxSampleRows?: number;

  /** Maximum unique values to include per column */
  maxUniqueValues?: number;

  /** Whether to include sample data in context */
  includeSampleData?: boolean;

  /** Maximum characters for the entire context */
  maxContextLength?: number;
}

const DEFAULT_CONFIG: ContextBuilderConfig = {
  maxSampleRows: 10,
  maxUniqueValues: 20,
  includeSampleData: true,
  maxContextLength: 8000,
};

/**
 * YAML template column definition (simplified).
 */
export interface YamlColumnDef {
  name: string;
  description?: string;
  requirement?: 'required' | 'recommended' | 'optional';
  allow_not_available?: boolean;
  allow_not_applicable?: boolean;
  validators?: Array<{
    validator_name: string;
    params?: {
      ontologies?: string[];
      pattern?: string;
      values?: string[];
      examples?: string[];
      description?: string;
    };
  }>;
}

/**
 * YAML template structure (simplified).
 */
export interface YamlTemplate {
  name: string;
  description?: string;
  columns: YamlColumnDef[];
}

/**
 * Context Builder Service
 *
 * Analyzes SDRF tables and builds context for LLM analysis.
 */
export class ContextBuilderService {
  private config: ContextBuilderConfig;

  constructor(config: ContextBuilderConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Builds analysis context from an SDRF table.
   */
  buildContext(
    table: SdrfTable,
    focusAreas: AnalysisFocusArea[] = ['all'],
    template?: YamlTemplate
  ): SdrfAnalysisContext {
    // Build column contexts
    const columns = this.buildColumnContexts(table, template);

    // Identify issues based on focus areas
    const issues = this.identifyIssues(table, columns, focusAreas);

    // Build sample data if configured
    const sampleData = this.config.includeSampleData
      ? this.buildSampleData(table, issues)
      : undefined;

    // Expand 'all' focus area
    const expandedFocusAreas: AnalysisFocusArea[] = focusAreas.includes('all')
      ? ['fill_missing', 'validate_ontology', 'check_consistency']
      : focusAreas;

    return {
      metadata: {
        sampleCount: table.sampleCount,
        columnCount: table.columns.length,
        columnNames: table.columns.map((c) => c.name),
      },
      columns,
      issues,
      sampleData,
      focusAreas: expandedFocusAreas,
    };
  }

  /**
   * Converts context to a concise string for the LLM prompt.
   */
  contextToString(context: SdrfAnalysisContext): string {
    const parts: string[] = [];

    // Metadata
    parts.push('## Table Overview');
    parts.push(`- Samples: ${context.metadata.sampleCount}`);
    parts.push(`- Columns: ${context.metadata.columnCount}`);
    parts.push('');

    // Focus areas
    parts.push('## Analysis Focus');
    parts.push(context.focusAreas.map((f) => `- ${this.formatFocusArea(f)}`).join('\n'));
    parts.push('');

    // Column definitions with issues
    parts.push('## Columns with Issues');
    const columnsWithIssues = context.columns.filter(
      (col) =>
        col.notAvailableCount > 0 ||
        col.emptyCount > 0 ||
        context.issues.some((i) => i.columnIndex === col.index)
    );

    for (const col of columnsWithIssues) {
      parts.push(`### ${col.name}`);
      parts.push(`- Type: ${col.type}`);
      parts.push(`- Required: ${col.isRequired ? 'Yes' : 'No'}`);

      if (col.ontologies && col.ontologies.length > 0) {
        parts.push(`- Ontologies: ${col.ontologies.join(', ')}`);
      }

      if (col.examples && col.examples.length > 0) {
        parts.push(`- Examples: ${col.examples.slice(0, 5).join(', ')}`);
      }

      if (col.notAvailableCount > 0) {
        parts.push(`- "not available" values: ${col.notAvailableCount}`);
      }

      if (col.emptyCount > 0) {
        parts.push(`- Empty values: ${col.emptyCount}`);
      }

      if (col.uniqueValues.length > 0) {
        const displayValues = col.uniqueValues.slice(0, 10);
        parts.push(`- Current values: ${displayValues.join(', ')}${col.uniqueValues.length > 10 ? '...' : ''}`);
      }

      parts.push('');
    }

    // Issues summary
    if (context.issues.length > 0) {
      parts.push('## Identified Issues');
      for (const issue of context.issues.slice(0, 20)) {
        parts.push(
          `- [${issue.type}] ${issue.column}: ${issue.details || ''} (${issue.sampleIndices.length} samples)`
        );
      }
      if (context.issues.length > 20) {
        parts.push(`... and ${context.issues.length - 20} more issues`);
      }
      parts.push('');
    }

    // Sample data
    if (context.sampleData && context.sampleData.length > 0) {
      parts.push('## Sample Data (affected rows)');
      parts.push('```');
      parts.push(context.metadata.columnNames.join('\t'));
      for (const row of context.sampleData) {
        parts.push(row.join('\t'));
      }
      parts.push('```');
    }

    let result = parts.join('\n');

    // Truncate if too long
    if (this.config.maxContextLength && result.length > this.config.maxContextLength) {
      result = result.substring(0, this.config.maxContextLength) + '\n... (truncated)';
    }

    return result;
  }

  // ============ Private Methods ============

  /**
   * Builds column context from the table and optional template.
   */
  private buildColumnContexts(
    table: SdrfTable,
    template?: YamlTemplate
  ): ColumnContext[] {
    return table.columns.map((column, index) => {
      // Find matching template column
      const templateCol = template?.columns.find(
        (tc) => tc.name.toLowerCase() === column.name.toLowerCase()
      );

      // Calculate value statistics
      const { uniqueValues, notAvailableCount, emptyCount } = this.analyzeColumnValues(
        column,
        table.sampleCount
      );

      // Extract ontology validators
      const ontologyValidator = templateCol?.validators?.find(
        (v) => v.validator_name === 'ontology'
      );

      // Extract pattern validator
      const patternValidator = templateCol?.validators?.find(
        (v) => v.validator_name === 'pattern'
      );

      return {
        name: column.name,
        index,
        type: this.detectColumnType(column.name),
        isRequired: templateCol?.requirement === 'required' || column.isRequired || false,
        ontologies: ontologyValidator?.params?.ontologies,
        pattern: patternValidator?.params?.pattern,
        examples: ontologyValidator?.params?.examples || patternValidator?.params?.examples,
        allowNotAvailable: templateCol?.allow_not_available ?? true,
        allowNotApplicable: templateCol?.allow_not_applicable ?? true,
        uniqueValues: uniqueValues.slice(0, this.config.maxUniqueValues!),
        notAvailableCount,
        emptyCount,
      };
    });
  }

  /**
   * Analyzes values in a column.
   */
  private analyzeColumnValues(
    column: SdrfColumn,
    sampleCount: number
  ): { uniqueValues: string[]; notAvailableCount: number; emptyCount: number } {
    const valueSet = new Set<string>();
    let notAvailableCount = 0;
    let emptyCount = 0;

    for (let i = 1; i <= sampleCount; i++) {
      const value = getValueForSample(column, i);
      const lower = value.toLowerCase().trim();

      if (!value || value.trim() === '') {
        emptyCount++;
      } else if (lower === 'not available') {
        notAvailableCount++;
      } else if (!RESERVED_VALUES.includes(lower)) {
        valueSet.add(value);
      }
    }

    return {
      uniqueValues: Array.from(valueSet).sort(),
      notAvailableCount,
      emptyCount,
    };
  }

  /**
   * Identifies issues in the table based on focus areas.
   */
  private identifyIssues(
    table: SdrfTable,
    columns: ColumnContext[],
    focusAreas: AnalysisFocusArea[]
  ): AnalysisIssue[] {
    const issues: AnalysisIssue[] = [];
    const shouldFillMissing = focusAreas.includes('all') || focusAreas.includes('fill_missing');
    const shouldValidateOntology = focusAreas.includes('all') || focusAreas.includes('validate_ontology');
    const shouldCheckConsistency = focusAreas.includes('all') || focusAreas.includes('check_consistency');

    for (const colContext of columns) {
      const column = table.columns[colContext.index];

      // Check for missing values
      if (shouldFillMissing) {
        const missingSamples: number[] = [];

        for (let i = 1; i <= table.sampleCount; i++) {
          const value = getValueForSample(column, i);
          const lower = value.toLowerCase().trim();

          if (!value || value.trim() === '' || lower === 'not available') {
            missingSamples.push(i);
          }
        }

        if (missingSamples.length > 0 && missingSamples.length < table.sampleCount) {
          issues.push({
            type: 'missing_value',
            column: colContext.name,
            columnIndex: colContext.index,
            sampleIndices: missingSamples,
            currentValue: 'not available',
            details: `${missingSamples.length} samples have missing or "not available" values`,
          });
        }
      }

      // Check for ontology validation needs
      if (shouldValidateOntology && colContext.ontologies && colContext.ontologies.length > 0) {
        // Find values that might need ontology validation
        const valuesToCheck = colContext.uniqueValues.filter((v) => {
          // Skip values that look like proper ontology terms (contain colon or brackets)
          return !v.includes(':') && !v.match(/\[\w+:\d+\]/);
        });

        if (valuesToCheck.length > 0) {
          const sampleIndicesForValidation: number[] = [];

          for (let i = 1; i <= table.sampleCount; i++) {
            const value = getValueForSample(column, i);
            if (valuesToCheck.includes(value)) {
              sampleIndicesForValidation.push(i);
            }
          }

          if (sampleIndicesForValidation.length > 0) {
            issues.push({
              type: 'invalid_ontology',
              column: colContext.name,
              columnIndex: colContext.index,
              sampleIndices: sampleIndicesForValidation.slice(0, 100), // Limit
              details: `Values may need ontology validation: ${valuesToCheck.slice(0, 5).join(', ')}`,
            });
          }
        }
      }

      // Check for consistency issues
      if (shouldCheckConsistency && colContext.uniqueValues.length > 1) {
        // Look for similar values that might be inconsistent
        const similarGroups = this.findSimilarValues(colContext.uniqueValues);

        for (const group of similarGroups) {
          if (group.length > 1) {
            const sampleIndicesForConsistency: number[] = [];

            for (let i = 1; i <= table.sampleCount; i++) {
              const value = getValueForSample(column, i);
              if (group.includes(value)) {
                sampleIndicesForConsistency.push(i);
              }
            }

            issues.push({
              type: 'inconsistency',
              column: colContext.name,
              columnIndex: colContext.index,
              sampleIndices: sampleIndicesForConsistency,
              details: `Similar values found: ${group.join(', ')}`,
            });
          }
        }
      }
    }

    return issues;
  }

  /**
   * Finds groups of similar values that might be inconsistent.
   */
  private findSimilarValues(values: string[]): string[][] {
    const groups: string[][] = [];
    const used = new Set<string>();

    for (const value of values) {
      if (used.has(value)) continue;

      const similar = values.filter((v) => {
        if (v === value || used.has(v)) return false;
        return this.areSimilar(value, v);
      });

      if (similar.length > 0) {
        groups.push([value, ...similar]);
        used.add(value);
        for (const s of similar) {
          used.add(s);
        }
      }
    }

    return groups;
  }

  /**
   * Checks if two values are similar (potential inconsistency).
   */
  private areSimilar(a: string, b: string): boolean {
    const la = a.toLowerCase().trim();
    const lb = b.toLowerCase().trim();

    // Same when normalized
    if (la === lb) return true;

    // One is substring of other
    if (la.includes(lb) || lb.includes(la)) return true;

    // Levenshtein distance check for short strings
    if (la.length < 20 && lb.length < 20) {
      const distance = this.levenshteinDistance(la, lb);
      const maxLen = Math.max(la.length, lb.length);
      return distance / maxLen < 0.3; // Less than 30% different
    }

    return false;
  }

  /**
   * Calculates Levenshtein distance between two strings.
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Builds sample data for affected rows.
   */
  private buildSampleData(table: SdrfTable, issues: AnalysisIssue[]): string[][] {
    // Get unique sample indices from issues
    const sampleIndices = new Set<number>();
    for (const issue of issues) {
      for (const idx of issue.sampleIndices.slice(0, 5)) {
        // Limit per issue
        sampleIndices.add(idx);
      }
    }

    // Limit total samples
    const indices = Array.from(sampleIndices).slice(0, this.config.maxSampleRows!);

    // Build data matrix for these samples
    const data: string[][] = [];
    for (const idx of indices) {
      const row: string[] = [];
      for (const column of table.columns) {
        row.push(getValueForSample(column, idx));
      }
      data.push(row);
    }

    return data;
  }

  /**
   * Detects column type from name.
   */
  private detectColumnType(name: string): string {
    const lower = name.toLowerCase();

    if (lower === 'source name') return 'identifier';
    if (lower === 'assay name') return 'identifier';
    if (lower.startsWith('characteristics[')) return 'characteristic';
    if (lower.startsWith('factor value[')) return 'factor';
    if (lower.startsWith('comment[')) return 'comment';
    if (lower === 'technology type') return 'controlled_vocabulary';

    return 'general';
  }

  /**
   * Formats focus area for display.
   */
  private formatFocusArea(area: AnalysisFocusArea): string {
    const labels: Record<AnalysisFocusArea, string> = {
      fill_missing: 'Fill missing and "not available" values',
      validate_ontology: 'Validate and suggest ontology terms',
      check_consistency: 'Check data consistency',
      all: 'Comprehensive analysis',
    };
    return labels[area];
  }
}

// Export singleton instance
export const contextBuilderService = new ContextBuilderService();
