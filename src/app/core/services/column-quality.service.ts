/**
 * Column Quality Service
 *
 * Analyzes SDRF columns for quality issues:
 * - Columns with 100% identical values (no information)
 * - Columns with 100% "not available" values
 * - Columns with inconsistent null representations
 * - Columns with case sensitivity issues
 */

import { SdrfTable } from '../models/sdrf-table';
import { SdrfColumn, getValueForSample } from '../models/sdrf-column';

/**
 * Quality analysis result for a single column.
 */
export interface ColumnQuality {
  /** Column name */
  name: string;

  /** Column index in the table */
  columnIndex: number;

  /** Total number of rows/samples */
  totalRows: number;

  // Information content metrics
  /** Number of unique values (1 = all identical) */
  uniqueValues: number;

  /** Shannon entropy (0 = no information) */
  entropy: number;

  // Missing data counts
  /** Number of empty cells */
  emptyCount: number;

  /** Number of "not available" values */
  notAvailableCount: number;

  /** Number of "not applicable" values */
  notApplicableCount: number;

  // Quality flags
  /** All values are identical (no information added) */
  isRedundant: boolean;

  /** Column is effectively empty (100% not available/empty) */
  isEffectivelyEmpty: boolean;

  /** Column has inconsistent case (e.g., "Male" vs "male") */
  hasInconsistentCase: boolean;

  /** Column has inconsistent null representations (NA vs N/A vs not available) */
  hasInconsistentNulls: boolean;

  /** Column has wrong reserved word usage (control vs normal) */
  hasWrongReservedWords: boolean;

  /** Column name has wrong case (Characteristics vs characteristics) */
  hasWrongColumnNameCase: boolean;

  // Recommendation
  /** Recommended action */
  action: 'keep' | 'review' | 'remove';

  /** Reason for recommendation */
  reason: string;

  /** Suggested fix if applicable */
  suggestedFix?: string;

  /** Whether this column is required by SDRF spec */
  isRequired: boolean;
}

/**
 * Overall quality analysis result for a table.
 */
export interface TableQualityResult {
  /** All column quality results */
  columns: ColumnQuality[];

  /** Columns recommended for removal */
  removeRecommendations: ColumnQuality[];

  /** Columns needing review */
  reviewRecommendations: ColumnQuality[];

  /** Summary statistics */
  summary: {
    totalColumns: number;
    redundantColumns: number;
    effectivelyEmptyColumns: number;
    columnsWithIssues: number;
  };
}

/**
 * Reserved null-like values in SDRF
 */
const NULL_VALUES = ['not available', 'not applicable', 'anonymized', 'pooled'];

/**
 * Non-standard null representations that should be standardized
 */
const NON_STANDARD_NULLS = [
  'na', 'n/a', 'n.a.', 'none', 'null', 'unknown', '-', '--', 'missing', ''
];

/**
 * Required columns in SDRF (base template)
 */
const REQUIRED_COLUMNS = [
  'source name',
  'characteristics[organism]',
  'characteristics[organism part]',
  'characteristics[biological replicate]',
  'assay name',
  'technology type',
  'comment[data file]',
  'comment[instrument]',
  'comment[label]',
  'comment[fraction identifier]',
];

/**
 * Required columns for human samples
 */
const HUMAN_REQUIRED_COLUMNS = [
  'characteristics[disease]',
  'characteristics[age]',
  'characteristics[sex]',
];

/**
 * Columns that are EXPECTED to have uniform values across all rows.
 * These should not be flagged as "redundant" even if all values are identical.
 */
const EXPECTED_UNIFORM_COLUMNS = [
  'comment[sdrf template]',
  'comment[sdrf-template]',
  'technology type',
  'comment[instrument]',
  'comment[label]',
  'comment[modification parameters]',
  'comment[cleavage agent details]',
  'comment[precursor mass tolerance]',
  'comment[fragment mass tolerance]',
  // Organism is often uniform in single-species studies
  'characteristics[organism]',
];

/**
 * Column Quality Service - analyzes SDRF columns for quality issues
 */
export class ColumnQualityService {

  /**
   * Analyzes all columns in the table for quality issues.
   */
  analyzeTable(table: SdrfTable): TableQualityResult {
    const isHuman = this.detectIfHuman(table);
    const requiredColumns = this.getRequiredColumns(isHuman);

    const columns: ColumnQuality[] = [];

    for (let i = 0; i < table.columns.length; i++) {
      const column = table.columns[i];
      const quality = this.analyzeColumn(column, table, requiredColumns);
      columns.push(quality);
    }

    const removeRecommendations = columns.filter(c => c.action === 'remove');
    const reviewRecommendations = columns.filter(c => c.action === 'review');

    return {
      columns,
      removeRecommendations,
      reviewRecommendations,
      summary: {
        totalColumns: columns.length,
        redundantColumns: columns.filter(c => c.isRedundant).length,
        effectivelyEmptyColumns: columns.filter(c => c.isEffectivelyEmpty).length,
        columnsWithIssues: columns.filter(c =>
          c.hasInconsistentCase || c.hasInconsistentNulls ||
          c.hasWrongReservedWords || c.hasWrongColumnNameCase
        ).length,
      },
    };
  }

  /**
   * Analyzes a single column for quality issues.
   * Optimized to work directly with column structure instead of iterating all samples.
   */
  analyzeColumn(
    column: SdrfColumn,
    table: SdrfTable,
    requiredColumns: string[]
  ): ColumnQuality {
    // Get value counts directly from column structure (O(modifiers) instead of O(samples))
    const valueCounts = this.getValueCountsFromColumn(column, table.sampleCount);

    // Get unique values and calculate metrics
    const uniqueValuesSet = new Set(valueCounts.keys());
    const uniqueValues = uniqueValuesSet.size;
    const entropy = this.calculateEntropyFromCounts(valueCounts, table.sampleCount);

    // Count null-like values
    let emptyCount = 0;
    let notAvailableCount = 0;
    let notApplicableCount = 0;

    for (const [value, count] of valueCounts) {
      const normalized = (value || '').toLowerCase().trim();
      if (normalized === '' || value === undefined || value === null) {
        emptyCount += count;
      } else if (normalized === 'not available') {
        notAvailableCount += count;
      } else if (normalized === 'not applicable') {
        notApplicableCount += count;
      }
    }

    // Get unique values array for quality checks (just the distinct values, not all samples)
    const uniqueValuesArray = Array.from(valueCounts.keys());

    // Check for issues
    const isRedundant = uniqueValues === 1;
    const isEffectivelyEmpty = this.isEffectivelyEmptyFromValues(uniqueValuesArray);
    const hasInconsistentCase = this.hasInconsistentCaseFromValues(uniqueValuesArray);
    const hasInconsistentNulls = this.hasInconsistentNullsFromValues(uniqueValuesArray);
    const hasWrongReservedWords = this.hasWrongReservedWordsFromValues(uniqueValuesArray, column.name);
    const hasWrongColumnNameCase = this.hasWrongColumnNameCase(column.name);

    // Check if required
    const isRequired = requiredColumns.some(
      req => req.toLowerCase() === column.name.toLowerCase()
    );

    // Determine action and reason
    const { action, reason, suggestedFix } = this.determineAction({
      column,
      values: uniqueValuesArray, // Pass unique values only
      isRedundant,
      isEffectivelyEmpty,
      hasInconsistentCase,
      hasInconsistentNulls,
      hasWrongReservedWords,
      hasWrongColumnNameCase,
      isRequired,
      uniqueValues,
      entropy,
    });

    return {
      name: column.name,
      columnIndex: column.columnPosition,
      totalRows: table.sampleCount,
      uniqueValues,
      entropy,
      emptyCount,
      notAvailableCount,
      notApplicableCount,
      isRedundant,
      isEffectivelyEmpty,
      hasInconsistentCase,
      hasInconsistentNulls,
      hasWrongReservedWords,
      hasWrongColumnNameCase,
      action,
      reason,
      suggestedFix,
      isRequired,
    };
  }

  /**
   * Gets value counts directly from column structure.
   * This is O(modifiers) instead of O(samples).
   */
  private getValueCountsFromColumn(column: SdrfColumn, totalSamples: number): Map<string, number> {
    const counts = new Map<string, number>();

    // Start with all samples having the default value
    let samplesWithModifiers = 0;

    // Count samples covered by modifiers
    for (const modifier of column.modifiers) {
      const sampleCount = this.countSamplesInRange(modifier.samples);
      samplesWithModifiers += sampleCount;
      counts.set(modifier.value, (counts.get(modifier.value) || 0) + sampleCount);
    }

    // Remaining samples have the default value
    const defaultCount = totalSamples - samplesWithModifiers;
    if (defaultCount > 0) {
      counts.set(column.value, (counts.get(column.value) || 0) + defaultCount);
    }

    return counts;
  }

  /**
   * Counts samples in a range string like "1-3,5,7-10".
   */
  private countSamplesInRange(rangeString: string): number {
    let count = 0;
    const parts = rangeString.split(',');

    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed.includes('-')) {
        const [start, end] = trimmed.split('-').map(Number);
        if (!isNaN(start) && !isNaN(end)) {
          count += end - start + 1;
        }
      } else {
        const num = Number(trimmed);
        if (!isNaN(num)) {
          count += 1;
        }
      }
    }

    return count;
  }

  /**
   * Calculates entropy from value counts (more efficient than from array).
   */
  private calculateEntropyFromCounts(counts: Map<string, number>, total: number): number {
    if (total === 0) return 0;

    let entropy = 0;
    for (const count of counts.values()) {
      const p = count / total;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    return entropy;
  }

  /**
   * Checks if column is effectively empty (all values are null-like).
   */
  private isEffectivelyEmptyFromValues(uniqueValues: string[]): boolean {
    return uniqueValues.every(v => {
      const normalized = (v || '').toLowerCase().trim();
      return normalized === '' ||
             NULL_VALUES.includes(normalized) ||
             NON_STANDARD_NULLS.includes(normalized);
    });
  }

  /**
   * Checks for inconsistent case in unique values.
   */
  private hasInconsistentCaseFromValues(uniqueValues: string[]): boolean {
    const nonNullValues = uniqueValues.filter(v => {
      const normalized = (v || '').toLowerCase().trim();
      return normalized !== '' && !NULL_VALUES.includes(normalized);
    });

    if (nonNullValues.length === 0) return false;

    // Group by lowercase version
    const groups = new Map<string, Set<string>>();
    for (const v of nonNullValues) {
      const lower = (v || '').toLowerCase().trim();
      if (!groups.has(lower)) {
        groups.set(lower, new Set());
      }
      groups.get(lower)!.add(v);
    }

    // Check if any group has multiple case variants
    for (const variants of groups.values()) {
      if (variants.size > 1) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks for inconsistent null representations in unique values.
   */
  private hasInconsistentNullsFromValues(uniqueValues: string[]): boolean {
    const nullVariants = new Set<string>();

    for (const v of uniqueValues) {
      const normalized = (v || '').toLowerCase().trim();

      if (NULL_VALUES.includes(normalized)) {
        nullVariants.add(normalized);
      } else if (NON_STANDARD_NULLS.includes(normalized)) {
        nullVariants.add(normalized);
      }
    }

    // If we have both standard and non-standard, or multiple variants
    const hasStandard = Array.from(nullVariants).some(v => NULL_VALUES.includes(v));
    const hasNonStandard = Array.from(nullVariants).some(v => NON_STANDARD_NULLS.includes(v));

    return (hasStandard && hasNonStandard) || nullVariants.size > 1;
  }

  /**
   * Checks for wrong reserved words in unique values.
   */
  private hasWrongReservedWordsFromValues(uniqueValues: string[], columnName: string): boolean {
    const isDiseaseColumn = columnName.toLowerCase().includes('disease');

    for (const v of uniqueValues) {
      const normalized = (v || '').toLowerCase().trim();

      // Check for "control" which should be "normal" in disease columns
      if (isDiseaseColumn && normalized === 'control') {
        return true;
      }

      // Check for non-standard null values
      if (NON_STANDARD_NULLS.includes(normalized)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculates Shannon entropy for a list of values.
   * Returns 0 for uniform distribution (no information),
   * higher values indicate more variation.
   */
  private calculateEntropy(values: string[]): number {
    const total = values.length;
    if (total === 0) return 0;

    // Count frequencies
    const freq = new Map<string, number>();
    for (const v of values) {
      const normalized = v.toLowerCase().trim();
      freq.set(normalized, (freq.get(normalized) || 0) + 1);
    }

    // Calculate entropy: -sum(p * log2(p))
    let entropy = 0;
    for (const count of freq.values()) {
      const p = count / total;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    return entropy;
  }

  /**
   * Checks if column is effectively empty (100% null-like values).
   */
  private isEffectivelyEmpty(values: string[]): boolean {
    return values.every(v => {
      const normalized = v.toLowerCase().trim();
      return normalized === '' ||
             NULL_VALUES.includes(normalized) ||
             NON_STANDARD_NULLS.includes(normalized);
    });
  }

  /**
   * Checks for inconsistent case in values (e.g., "Male" vs "male").
   */
  private hasInconsistentCase(values: string[]): boolean {
    const nonNullValues = values.filter(v => {
      const normalized = v.toLowerCase().trim();
      return normalized !== '' && !NULL_VALUES.includes(normalized);
    });

    if (nonNullValues.length === 0) return false;

    // Group by lowercase version
    const groups = new Map<string, Set<string>>();
    for (const v of nonNullValues) {
      const lower = v.toLowerCase().trim();
      if (!groups.has(lower)) {
        groups.set(lower, new Set());
      }
      groups.get(lower)!.add(v);
    }

    // Check if any group has multiple case variants
    for (const variants of groups.values()) {
      if (variants.size > 1) {
        return true;
      }
    }

    return false;
  }

  /**
   * Checks for inconsistent null representations.
   */
  private hasInconsistentNulls(values: string[]): boolean {
    const nullVariants = new Set<string>();

    for (const v of values) {
      const normalized = v.toLowerCase().trim();

      // Check if it's a null-like value
      if (NULL_VALUES.includes(normalized)) {
        nullVariants.add(normalized);
      } else if (NON_STANDARD_NULLS.includes(normalized)) {
        nullVariants.add(normalized);
      }
    }

    // If we have both standard and non-standard, or multiple non-standard
    const hasStandard = [...nullVariants].some(v => NULL_VALUES.includes(v));
    const hasNonStandard = [...nullVariants].some(v => NON_STANDARD_NULLS.includes(v));

    return (hasStandard && hasNonStandard) || nullVariants.size > 1;
  }

  /**
   * Checks for wrong reserved word usage (e.g., "control" instead of "normal").
   */
  private hasWrongReservedWords(values: string[], columnName: string): boolean {
    const isDisease = columnName.toLowerCase().includes('disease');

    if (isDisease) {
      return values.some(v => {
        const normalized = v.toLowerCase().trim();
        return normalized === 'control' || normalized === 'healthy';
      });
    }

    return false;
  }

  /**
   * Checks if column name has wrong case.
   */
  private hasWrongColumnNameCase(columnName: string): boolean {
    // Check for uppercase letters at start of keywords
    if (columnName.startsWith('Characteristics[') ||
        columnName.startsWith('Comment[') ||
        columnName.startsWith('Factor Value[') ||
        columnName.startsWith('Source Name') ||
        columnName.startsWith('Assay Name')) {
      return true;
    }

    return false;
  }

  /**
   * Determines the recommended action for a column.
   */
  private determineAction(params: {
    column: SdrfColumn;
    values: string[];
    isRedundant: boolean;
    isEffectivelyEmpty: boolean;
    hasInconsistentCase: boolean;
    hasInconsistentNulls: boolean;
    hasWrongReservedWords: boolean;
    hasWrongColumnNameCase: boolean;
    isRequired: boolean;
    uniqueValues: number;
    entropy: number;
  }): { action: 'keep' | 'review' | 'remove'; reason: string; suggestedFix?: string } {

    const {
      column, values, isRedundant, isEffectivelyEmpty,
      hasInconsistentCase, hasInconsistentNulls, hasWrongReservedWords,
      hasWrongColumnNameCase, isRequired, uniqueValues, entropy
    } = params;

    // Case 1: Effectively empty and not required → Remove
    if (isEffectivelyEmpty && !isRequired) {
      return {
        action: 'remove',
        reason: `Column is 100% empty or "not available" - adds no information`,
      };
    }

    // Case 2: All identical values and not required → Review (unless expected to be uniform)
    if (isRedundant && !isRequired) {
      const value = values[0];

      // Check if this column is expected to have uniform values
      const isExpectedUniform = this.isExpectedUniformColumn(column.name);
      if (isExpectedUniform) {
        return {
          action: 'keep',
          reason: `All rows have same value (expected for this column type): "${value}"`,
        };
      }

      return {
        action: 'review',
        reason: `All ${values.length} rows have identical value: "${value}"`,
      };
    }

    // Case 3: Required but effectively empty → Review (can't remove)
    if (isEffectivelyEmpty && isRequired) {
      return {
        action: 'review',
        reason: `Required column is 100% empty - needs actual values`,
      };
    }

    // Case 4: Has quality issues → Review
    if (hasWrongReservedWords) {
      return {
        action: 'review',
        reason: `Contains "control" or "healthy" - should use "normal" for healthy samples`,
        suggestedFix: 'Replace "control" and "healthy" with "normal"',
      };
    }

    if (hasInconsistentNulls) {
      return {
        action: 'review',
        reason: `Inconsistent null representations (e.g., "NA", "N/A", "not available")`,
        suggestedFix: 'Standardize to "not available" or "not applicable"',
      };
    }

    if (hasInconsistentCase) {
      return {
        action: 'review',
        reason: `Inconsistent capitalization (e.g., "Male" vs "male")`,
        suggestedFix: 'Standardize to lowercase',
      };
    }

    if (hasWrongColumnNameCase) {
      return {
        action: 'review',
        reason: `Column name should be lowercase (e.g., "characteristics[...]" not "Characteristics[...]")`,
        suggestedFix: 'Rename column to lowercase',
      };
    }

    // Case 5: Very low entropy (almost all same) → Review
    if (entropy < 0.3 && uniqueValues <= 2 && !isRequired) {
      return {
        action: 'review',
        reason: `Very low information content (${uniqueValues} unique values)`,
      };
    }

    // Default: Keep
    return {
      action: 'keep',
      reason: 'Column appears to have valid, varied data',
    };
  }

  /**
   * Checks if a column is expected to have uniform values across all rows.
   * These columns should not be flagged as redundant.
   */
  private isExpectedUniformColumn(columnName: string): boolean {
    const normalized = columnName.toLowerCase().trim();

    // Check exact matches
    if (EXPECTED_UNIFORM_COLUMNS.some(c => c.toLowerCase() === normalized)) {
      return true;
    }

    // Check patterns - template-related comments are expected to be uniform
    if (normalized.includes('template') ||
        normalized.includes('version') ||
        normalized.includes('protocol')) {
      return true;
    }

    return false;
  }

  /**
   * Detects if the SDRF contains human samples.
   */
  private detectIfHuman(table: SdrfTable): boolean {
    const organismCol = table.columns.find(
      c => c.name.toLowerCase() === 'characteristics[organism]'
    );

    if (!organismCol) return false;

    // Check if any sample has human
    for (let i = 1; i <= table.sampleCount; i++) {
      const value = getValueForSample(organismCol, i).toLowerCase();
      if (value.includes('homo sapiens') || value.includes('human')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Gets the list of required columns based on detected templates.
   */
  private getRequiredColumns(isHuman: boolean): string[] {
    const required = [...REQUIRED_COLUMNS];
    if (isHuman) {
      required.push(...HUMAN_REQUIRED_COLUMNS);
    }
    return required;
  }

  /**
   * Gets all values for a column as an array.
   */
  getAllValuesForColumn(column: SdrfColumn, table: SdrfTable): string[] {
    const values: string[] = [];
    for (let i = 1; i <= table.sampleCount; i++) {
      values.push(getValueForSample(column, i));
    }
    return values;
  }
}
