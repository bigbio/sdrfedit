/**
 * Data Cleaning Service
 *
 * Provides automated and semi-automated data cleaning operations for SDRF files:
 * - Standardize null values (NA, N/A, etc. → "not available")
 * - Fix reserved word usage ("control" → "normal" in disease columns)
 * - Lowercase column names and values
 * - Remove useless columns (100% empty or redundant)
 */

import { SdrfTable } from '../models/sdrf-table';
import { SdrfColumn, getValueForSample, ColumnType, createEmptyColumn, Modifier, isSampleInRange } from '../models/sdrf-column';
import { ColumnQuality, ColumnQualityService, TableQualityResult } from './column-quality.service';

/**
 * Types of automatic fixes.
 */
export type AutoFixType =
  | 'standardize_nulls'      // Standardize null representations
  | 'fix_reserved_words'     // Fix reserved word usage (control → normal)
  | 'lowercase_values'       // Lowercase values in specific columns
  | 'lowercase_column_names' // Lowercase column headers
  | 'remove_column';         // Remove a column

/**
 * Definition of an automatic fix.
 */
export interface AutoFix {
  /** Unique ID for this fix */
  id: string;

  /** Type of fix */
  type: AutoFixType;

  /** Column this fix applies to ('*' for all columns) */
  column: string;

  /** Human-readable description */
  description: string;

  /** Number of cells/columns affected */
  affectedCount: number;

  /** Sample indices affected (1-based) */
  affectedSamples?: number[];

  /** Whether this fix is safe to apply automatically */
  isSafe: boolean;

  /** Preview of changes (before → after) */
  preview?: Array<{ before: string; after: string; sampleIndex?: number }>;
}

/**
 * Result of applying fixes.
 */
export interface FixResult {
  /** Whether the fix was applied successfully */
  success: boolean;

  /** Number of changes made */
  changesCount: number;

  /** Error message if failed */
  error?: string;

  /** Details of changes made */
  changes?: Array<{
    column: string;
    sampleIndex?: number;
    before: string;
    after: string;
  }>;
}

/**
 * Column removal suggestion.
 */
export interface ColumnRemovalSuggestion {
  /** Column name */
  column: string;

  /** Column index */
  columnIndex: number;

  /** Reason for removal */
  reason: string;

  /** Impact level */
  impact: 'none' | 'low' | 'high';

  /** Whether this column is required (cannot be removed) */
  isRequired: boolean;

  /** Quality metrics for context */
  quality: ColumnQuality;
}

/**
 * Non-standard null representations to standardize.
 */
const NON_STANDARD_NULLS = new Set([
  'na', 'n/a', 'n.a.', 'none', 'null', 'unknown', '-', '--', 'missing', ''
]);

/**
 * Standard SDRF null value.
 */
const STANDARD_NULL = 'not available';

/**
 * Columns where values should be lowercase.
 */
const LOWERCASE_VALUE_COLUMNS = [
  'characteristics[organism]',
  'characteristics[organism part]',
  'characteristics[cell type]',
  'characteristics[disease]',
  'characteristics[sex]',
  'characteristics[ancestry category]',
];

/**
 * Data Cleaning Service
 */
export class DataCleaningService {
  private qualityService: ColumnQualityService;

  constructor(qualityService?: ColumnQualityService) {
    this.qualityService = qualityService || new ColumnQualityService();
  }

  /**
   * Detects all available auto-fixes for a table.
   */
  detectAvailableFixes(table: SdrfTable, qualityResult?: TableQualityResult): AutoFix[] {
    const fixes: AutoFix[] = [];
    const quality = qualityResult || this.qualityService.analyzeTable(table);

    // Check for null standardization
    const nullFix = this.detectNullStandardization(table);
    if (nullFix) fixes.push(nullFix);

    // Check for reserved word fixes (control → normal)
    const reservedWordFix = this.detectReservedWordFixes(table);
    if (reservedWordFix) fixes.push(reservedWordFix);

    // Check for lowercase column name fixes
    const columnNameFix = this.detectColumnNameCaseFixes(table);
    if (columnNameFix) fixes.push(columnNameFix);

    // Check for lowercase value fixes
    const valueFixes = this.detectLowercaseValueFixes(table);
    fixes.push(...valueFixes);

    // Check for removable columns based on quality analysis
    const removalFixes = this.detectRemovableColumns(table, quality);
    fixes.push(...removalFixes);

    return fixes;
  }

  /**
   * Applies a specific fix to the table.
   * Returns a new table with the fix applied (immutable).
   */
  applyFix(table: SdrfTable, fix: AutoFix): { table: SdrfTable; result: FixResult } {
    try {
      switch (fix.type) {
        case 'standardize_nulls':
          return this.applyNullStandardization(table, fix);

        case 'fix_reserved_words':
          return this.applyReservedWordFix(table, fix);

        case 'lowercase_column_names':
          return this.applyColumnNameLowercase(table, fix);

        case 'lowercase_values':
          return this.applyValueLowercase(table, fix);

        case 'remove_column':
          return this.applyColumnRemoval(table, fix);

        default:
          return {
            table,
            result: { success: false, changesCount: 0, error: `Unknown fix type: ${fix.type}` }
          };
      }
    } catch (error) {
      return {
        table,
        result: {
          success: false,
          changesCount: 0,
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  /**
   * Applies multiple fixes in sequence.
   */
  applyFixes(table: SdrfTable, fixes: AutoFix[]): { table: SdrfTable; results: FixResult[] } {
    let currentTable = table;
    const results: FixResult[] = [];

    for (const fix of fixes) {
      const { table: newTable, result } = this.applyFix(currentTable, fix);
      currentTable = newTable;
      results.push(result);
    }

    return { table: currentTable, results };
  }

  /**
   * Gets column removal suggestions.
   */
  getRemovalSuggestions(table: SdrfTable, qualityResult?: TableQualityResult): ColumnRemovalSuggestion[] {
    const quality = qualityResult || this.qualityService.analyzeTable(table);
    const suggestions: ColumnRemovalSuggestion[] = [];

    for (const colQuality of quality.columns) {
      if (colQuality.action === 'remove' && !colQuality.isRequired) {
        suggestions.push({
          column: colQuality.name,
          columnIndex: colQuality.columnIndex,
          reason: colQuality.reason,
          impact: 'none',
          isRequired: false,
          quality: colQuality,
        });
      } else if (colQuality.isEffectivelyEmpty && colQuality.isRequired) {
        // Required but empty - flag for review
        suggestions.push({
          column: colQuality.name,
          columnIndex: colQuality.columnIndex,
          reason: colQuality.reason + ' (Required column - needs actual values)',
          impact: 'high',
          isRequired: true,
          quality: colQuality,
        });
      } else if (colQuality.isRedundant && !colQuality.isRequired) {
        // All same value - might be intentional
        suggestions.push({
          column: colQuality.name,
          columnIndex: colQuality.columnIndex,
          reason: colQuality.reason,
          impact: 'low',
          isRequired: false,
          quality: colQuality,
        });
      }
    }

    return suggestions;
  }

  // ============ Detection Methods ============

  /**
   * Detects cells with non-standard null representations.
   */
  private detectNullStandardization(table: SdrfTable): AutoFix | null {
    const affectedCells: Array<{ column: string; sampleIndex: number; value: string }> = [];

    for (const column of table.columns) {
      for (let i = 1; i <= table.sampleCount; i++) {
        const value = getValueForSample(column, i);
        const normalized = value.toLowerCase().trim();

        if (NON_STANDARD_NULLS.has(normalized) && normalized !== '') {
          affectedCells.push({
            column: column.name,
            sampleIndex: i,
            value,
          });
        }
      }
    }

    if (affectedCells.length === 0) return null;

    return {
      id: 'standardize_nulls',
      type: 'standardize_nulls',
      column: '*',
      description: `Standardize ${affectedCells.length} null values to "${STANDARD_NULL}"`,
      affectedCount: affectedCells.length,
      affectedSamples: [...new Set(affectedCells.map(c => c.sampleIndex))],
      isSafe: true,
      preview: affectedCells.slice(0, 5).map(c => ({
        before: c.value || '(empty)',
        after: STANDARD_NULL,
        sampleIndex: c.sampleIndex,
      })),
    };
  }

  /**
   * Detects cells with wrong reserved word usage.
   */
  private detectReservedWordFixes(table: SdrfTable): AutoFix | null {
    const diseaseColumn = table.columns.find(
      c => c.name.toLowerCase() === 'characteristics[disease]'
    );

    if (!diseaseColumn) {
      return null;
    }

    const affectedSamples: number[] = [];
    const preview: Array<{ before: string; after: string; sampleIndex: number }> = [];

    for (let i = 1; i <= table.sampleCount; i++) {
      const value = getValueForSample(diseaseColumn, i);
      const normalized = value.toLowerCase().trim();

      if (normalized === 'control' || normalized === 'healthy') {
        affectedSamples.push(i);
        if (preview.length < 5) {
          preview.push({ before: value, after: 'normal', sampleIndex: i });
        }
      }
    }

    if (affectedSamples.length === 0) return null;

    return {
      id: 'fix_reserved_words_disease',
      type: 'fix_reserved_words',
      column: 'characteristics[disease]',
      description: `Replace "control"/"healthy" with "normal" in ${affectedSamples.length} samples`,
      affectedCount: affectedSamples.length,
      affectedSamples,
      isSafe: true,
      preview,
    };
  }

  /**
   * Detects columns with wrong case in names.
   */
  private detectColumnNameCaseFixes(table: SdrfTable): AutoFix | null {
    const affectedColumns: string[] = [];

    for (const column of table.columns) {
      if (
        column.name.startsWith('Characteristics[') ||
        column.name.startsWith('Comment[') ||
        column.name.startsWith('Factor Value[') ||
        column.name.startsWith('Source Name') ||
        column.name.startsWith('Assay Name')
      ) {
        affectedColumns.push(column.name);
      }
    }

    if (affectedColumns.length === 0) return null;

    return {
      id: 'lowercase_column_names',
      type: 'lowercase_column_names',
      column: '*',
      description: `Lowercase ${affectedColumns.length} column names`,
      affectedCount: affectedColumns.length,
      isSafe: true,
      preview: affectedColumns.slice(0, 5).map(name => ({
        before: name,
        after: this.lowercaseColumnName(name),
      })),
    };
  }

  /**
   * Detects values that should be lowercase.
   */
  private detectLowercaseValueFixes(table: SdrfTable): AutoFix[] {
    const fixes: AutoFix[] = [];

    for (const targetCol of LOWERCASE_VALUE_COLUMNS) {
      const column = table.columns.find(c => c.name.toLowerCase() === targetCol.toLowerCase());
      if (!column) continue;

      const affectedSamples: number[] = [];
      const preview: Array<{ before: string; after: string; sampleIndex: number }> = [];

      for (let i = 1; i <= table.sampleCount; i++) {
        const value = getValueForSample(column, i);
        if (value && value !== value.toLowerCase() && !this.isNullValue(value)) {
          affectedSamples.push(i);
          if (preview.length < 3) {
            preview.push({ before: value, after: value.toLowerCase(), sampleIndex: i });
          }
        }
      }

      if (affectedSamples.length > 0) {
        fixes.push({
          id: `lowercase_values_${column.name.replace(/[^a-z]/gi, '_')}`,
          type: 'lowercase_values',
          column: column.name,
          description: `Lowercase ${affectedSamples.length} values in ${column.name}`,
          affectedCount: affectedSamples.length,
          affectedSamples,
          isSafe: true,
          preview,
        });
      }
    }

    return fixes;
  }

  /**
   * Detects columns that can be removed.
   */
  private detectRemovableColumns(table: SdrfTable, quality: TableQualityResult): AutoFix[] {
    const fixes: AutoFix[] = [];

    for (const colQuality of quality.columns) {
      if (colQuality.action === 'remove' && !colQuality.isRequired) {
        fixes.push({
          id: `remove_column_${colQuality.columnIndex}`,
          type: 'remove_column',
          column: colQuality.name,
          description: `Remove column "${colQuality.name}" - ${colQuality.reason}`,
          affectedCount: 1,
          isSafe: false, // Column removal requires confirmation
          preview: [{ before: colQuality.name, after: '(removed)' }],
        });
      }
    }

    return fixes;
  }

  // ============ Apply Methods ============

  /**
   * Applies null standardization.
   */
  private applyNullStandardization(table: SdrfTable, _fix: AutoFix): { table: SdrfTable; result: FixResult } {
    const changes: Array<{ column: string; sampleIndex: number; before: string; after: string }> = [];
    const newColumns = table.columns.map(column => {
      const newColumn = this.cloneColumn(column);

      for (let i = 1; i <= table.sampleCount; i++) {
        const value = getValueForSample(newColumn, i);
        const normalized = value.toLowerCase().trim();

        if (NON_STANDARD_NULLS.has(normalized)) {
          this.setValueForSample(newColumn, i, STANDARD_NULL, table);
          changes.push({
            column: column.name,
            sampleIndex: i,
            before: value || '(empty)',
            after: STANDARD_NULL,
          });
        }
      }

      return newColumn;
    });

    return {
      table: { ...table, columns: newColumns },
      result: {
        success: true,
        changesCount: changes.length,
        changes,
      },
    };
  }

  /**
   * Applies reserved word fix (control → normal).
   */
  private applyReservedWordFix(table: SdrfTable, fix: AutoFix): { table: SdrfTable; result: FixResult } {
    const changes: Array<{ column: string; sampleIndex: number; before: string; after: string }> = [];

    const newColumns = table.columns.map(column => {
      if (column.name.toLowerCase() !== fix.column.toLowerCase()) {
        return column;
      }

      const newColumn = this.cloneColumn(column);

      for (let i = 1; i <= table.sampleCount; i++) {
        const value = getValueForSample(newColumn, i);
        const normalized = value.toLowerCase().trim();

        if (normalized === 'control' || normalized === 'healthy') {
          this.setValueForSample(newColumn, i, 'normal', table);

          changes.push({
            column: column.name,
            sampleIndex: i,
            before: value,
            after: 'normal',
          });
        }
      }

      return newColumn;
    });

    return {
      table: { ...table, columns: newColumns },
      result: {
        success: true,
        changesCount: changes.length,
        changes,
      },
    };
  }

  /**
   * Applies column name lowercase fix.
   */
  private applyColumnNameLowercase(table: SdrfTable, _fix: AutoFix): { table: SdrfTable; result: FixResult } {
    const changes: Array<{ column: string; before: string; after: string }> = [];
    const newColumns = table.columns.map(column => {
      const newName = this.lowercaseColumnName(column.name);

      if (newName !== column.name) {
        changes.push({
          column: column.name,
          before: column.name,
          after: newName,
        });

        return { ...column, name: newName };
      }

      return column;
    });

    return {
      table: { ...table, columns: newColumns },
      result: {
        success: true,
        changesCount: changes.length,
        changes,
      },
    };
  }

  /**
   * Applies value lowercase fix.
   */
  private applyValueLowercase(table: SdrfTable, fix: AutoFix): { table: SdrfTable; result: FixResult } {
    const changes: Array<{ column: string; sampleIndex: number; before: string; after: string }> = [];
    const newColumns = table.columns.map(column => {
      if (column.name.toLowerCase() !== fix.column.toLowerCase()) {
        return column;
      }

      const newColumn = this.cloneColumn(column);

      for (let i = 1; i <= table.sampleCount; i++) {
        const value = getValueForSample(newColumn, i);

        if (value && value !== value.toLowerCase() && !this.isNullValue(value)) {
          this.setValueForSample(newColumn, i, value.toLowerCase(), table);
          changes.push({
            column: column.name,
            sampleIndex: i,
            before: value,
            after: value.toLowerCase(),
          });
        }
      }

      return newColumn;
    });

    return {
      table: { ...table, columns: newColumns },
      result: {
        success: true,
        changesCount: changes.length,
        changes,
      },
    };
  }

  /**
   * Applies column removal.
   */
  private applyColumnRemoval(table: SdrfTable, fix: AutoFix): { table: SdrfTable; result: FixResult } {
    const columnIndex = table.columns.findIndex(
      c => c.name.toLowerCase() === fix.column.toLowerCase()
    );

    if (columnIndex < 0) {
      return {
        table,
        result: {
          success: false,
          changesCount: 0,
          error: `Column "${fix.column}" not found`,
        },
      };
    }

    // Remove the column and reindex remaining columns
    const newColumns = table.columns
      .filter((_, i) => i !== columnIndex)
      .map((col, newIndex) => ({
        ...col,
        columnPosition: newIndex,
      }));

    return {
      table: { ...table, columns: newColumns },
      result: {
        success: true,
        changesCount: 1,
        changes: [{ column: fix.column, before: fix.column, after: '(removed)' }],
      },
    };
  }

  // ============ Helper Methods ============

  /**
   * Lowercases a column name properly.
   */
  private lowercaseColumnName(name: string): string {
    return name
      .replace(/^Characteristics\[/i, 'characteristics[')
      .replace(/^Comment\[/i, 'comment[')
      .replace(/^Factor Value\[/i, 'factor value[')
      .replace(/^Source Name$/i, 'source name')
      .replace(/^Assay Name$/i, 'assay name');
  }

  /**
   * Checks if a value is a null value.
   */
  private isNullValue(value: string): boolean {
    const normalized = value.toLowerCase().trim();
    return normalized === 'not available' ||
           normalized === 'not applicable' ||
           normalized === 'anonymized' ||
           normalized === 'pooled' ||
           NON_STANDARD_NULLS.has(normalized);
  }

  /**
   * Clones a column for immutable updates.
   */
  private cloneColumn(column: SdrfColumn): SdrfColumn {
    return {
      name: column.name,
      type: column.type,
      value: column.value,
      modifiers: column.modifiers.map(m => ({ ...m })),
      columnPosition: column.columnPosition,
      ontologyType: column.ontologyType,
      ontologyOptions: column.ontologyOptions ? [...column.ontologyOptions] : undefined,
      isRequired: column.isRequired,
      notApplicable: column.notApplicable,
      notAvailable: column.notAvailable,
      hidden: column.hidden,
      readonly: column.readonly,
    };
  }

  /**
   * Sets a value for a specific sample in a column.
   * This updates modifiers to reflect the new value.
   */
  private setValueForSample(column: SdrfColumn, sampleIndex: number, newValue: string, table: SdrfTable): void {
    // If the new value equals the default value, we might need to remove from modifiers
    if (newValue === column.value) {
      // Remove this sample from any modifier that covers it
      column.modifiers = column.modifiers.map(m => {
        if (isSampleInRange(sampleIndex, m.samples)) {
          return { ...m, samples: this.removeSampleFromRange(m.samples, sampleIndex) };
        }
        return m;
      }).filter(m => m.samples.length > 0);
      return;
    }

    // ALWAYS remove from any existing modifiers first (except the one we're adding to)
    column.modifiers = column.modifiers.map(m => {
      // Don't remove from the modifier we'll be adding to
      if (m.value === newValue) {
        return m;
      }
      // Remove this sample from other modifiers
      if (isSampleInRange(sampleIndex, m.samples)) {
        return { ...m, samples: this.removeSampleFromRange(m.samples, sampleIndex) };
      }
      return m;
    }).filter(m => m.samples.length > 0);

    // Check if there's already a modifier with this value
    const existingModifier = column.modifiers.find(m => m.value === newValue);

    if (existingModifier) {
      // Add this sample to the existing modifier's range
      existingModifier.samples = this.addSampleToRange(existingModifier.samples, sampleIndex);
    } else {
      // Add new modifier
      column.modifiers.push({
        samples: String(sampleIndex),
        value: newValue,
      });
    }
  }

  /**
   * Adds a sample to a range string.
   */
  private addSampleToRange(rangeString: string, sampleIndex: number): string {
    const samples = this.expandRange(rangeString);
    if (!samples.includes(sampleIndex)) {
      samples.push(sampleIndex);
      samples.sort((a, b) => a - b);
    }
    return this.compactRange(samples);
  }

  /**
   * Removes a sample from a range string.
   */
  private removeSampleFromRange(rangeString: string, sampleIndex: number): string {
    const samples = this.expandRange(rangeString);
    const filtered = samples.filter(s => s !== sampleIndex);
    return this.compactRange(filtered);
  }

  /**
   * Expands a range string to an array of sample indices.
   */
  private expandRange(rangeString: string): number[] {
    const samples: number[] = [];
    const parts = rangeString.split(',');

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      if (trimmed.includes('-')) {
        const [start, end] = trimmed.split('-').map(Number);
        for (let i = start; i <= end; i++) {
          samples.push(i);
        }
      } else {
        samples.push(Number(trimmed));
      }
    }

    return samples;
  }

  /**
   * Compacts an array of sample indices to a range string.
   */
  private compactRange(samples: number[]): string {
    if (samples.length === 0) return '';
    if (samples.length === 1) return String(samples[0]);

    const sorted = [...new Set(samples)].sort((a, b) => a - b);
    const ranges: string[] = [];
    let rangeStart = sorted[0];
    let rangeEnd = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === rangeEnd + 1) {
        rangeEnd = sorted[i];
      } else {
        ranges.push(rangeStart === rangeEnd ? String(rangeStart) : `${rangeStart}-${rangeEnd}`);
        rangeStart = sorted[i];
        rangeEnd = sorted[i];
      }
    }

    ranges.push(rangeStart === rangeEnd ? String(rangeStart) : `${rangeStart}-${rangeEnd}`);
    return ranges.join(',');
  }
}

// Export singleton instance
export const dataCleaningService = new DataCleaningService();
