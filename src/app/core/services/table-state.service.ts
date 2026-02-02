/**
 * Table State Service
 *
 * Tracks SDRF table state for detecting when suggestions become stale.
 * Provides efficient hashing and change detection.
 */

import { Injectable, signal, computed } from '@angular/core';
import { SdrfTable } from '../models/sdrf-table';
import { SdrfColumn, getValueForSample } from '../models/sdrf-column';

/**
 * Snapshot of table state for change detection.
 */
export interface TableStateSnapshot {
  /** Hash of the table state */
  hash: string;

  /** When the snapshot was taken */
  timestamp: Date;

  /** Column count */
  columnCount: number;

  /** Sample count */
  sampleCount: number;

  /** Column names (for quick comparison) */
  columnNames: string[];
}

/**
 * Change detection result.
 */
export interface TableChangeResult {
  /** Whether the table has changed */
  hasChanged: boolean;

  /** Type of change detected */
  changeType?: 'structure' | 'values' | 'both';

  /** Columns that were added */
  addedColumns?: string[];

  /** Columns that were removed */
  removedColumns?: string[];

  /** Sample count change */
  sampleCountDelta?: number;
}

/**
 * Injectable service for tracking table state.
 */
@Injectable({
  providedIn: 'root'
})
export class TableStateService {
  // === State ===

  /** Current table state hash */
  private readonly _currentHash = signal<string>('');

  /** Previous table state hash */
  private readonly _previousHash = signal<string>('');

  /** Last snapshot */
  private readonly _lastSnapshot = signal<TableStateSnapshot | null>(null);

  // === Computed ===

  /** Current hash (readonly) */
  readonly currentHash = this._currentHash.asReadonly();

  /** Previous hash (readonly) */
  readonly previousHash = this._previousHash.asReadonly();

  /** Last snapshot (readonly) */
  readonly lastSnapshot = this._lastSnapshot.asReadonly();

  /** Whether table has changed since last check */
  readonly hasChanged = computed(() =>
    this._currentHash() !== this._previousHash() && this._previousHash() !== ''
  );

  // === Public Methods ===

  /**
   * Computes a hash of the table state.
   * This is used to detect when suggestions become stale.
   */
  computeTableHash(table: SdrfTable): string {
    const parts: string[] = [];

    // Include structure
    parts.push(`cols:${table.columns.length}`);
    parts.push(`rows:${table.sampleCount}`);

    // Include column names (structure changes)
    const columnNames = table.columns.map(c => c.name).join(',');
    parts.push(`names:${this.simpleHash(columnNames)}`);

    // Include sample of values (content changes)
    const valueSample = this.getValueSample(table);
    parts.push(`vals:${this.simpleHash(valueSample)}`);

    return parts.join('|');
  }

  /**
   * Updates the current table state.
   * Returns the new hash.
   */
  updateState(table: SdrfTable): string {
    const newHash = this.computeTableHash(table);

    // Update previous hash before changing current
    this._previousHash.set(this._currentHash());
    this._currentHash.set(newHash);

    // Update snapshot
    this._lastSnapshot.set({
      hash: newHash,
      timestamp: new Date(),
      columnCount: table.columns.length,
      sampleCount: table.sampleCount,
      columnNames: table.columns.map(c => c.name),
    });

    return newHash;
  }

  /**
   * Checks if a hash is current (not stale).
   */
  isHashCurrent(hash: string): boolean {
    return hash === this._currentHash();
  }

  /**
   * Detects changes between two table states.
   */
  detectChanges(
    previousTable: SdrfTable,
    currentTable: SdrfTable
  ): TableChangeResult {
    const result: TableChangeResult = {
      hasChanged: false,
    };

    // Check structure changes
    const prevNames = new Set(previousTable.columns.map(c => c.name.toLowerCase()));
    const currNames = new Set(currentTable.columns.map(c => c.name.toLowerCase()));

    const addedColumns = currentTable.columns
      .filter(c => !prevNames.has(c.name.toLowerCase()))
      .map(c => c.name);

    const removedColumns = previousTable.columns
      .filter(c => !currNames.has(c.name.toLowerCase()))
      .map(c => c.name);

    const sampleCountDelta = currentTable.sampleCount - previousTable.sampleCount;

    const structureChanged =
      addedColumns.length > 0 ||
      removedColumns.length > 0 ||
      sampleCountDelta !== 0;

    // Check value changes
    const prevHash = this.computeTableHash(previousTable);
    const currHash = this.computeTableHash(currentTable);
    const valuesChanged = prevHash !== currHash;

    if (structureChanged || valuesChanged) {
      result.hasChanged = true;

      if (structureChanged && valuesChanged) {
        result.changeType = 'both';
      } else if (structureChanged) {
        result.changeType = 'structure';
      } else {
        result.changeType = 'values';
      }

      if (addedColumns.length > 0) {
        result.addedColumns = addedColumns;
      }

      if (removedColumns.length > 0) {
        result.removedColumns = removedColumns;
      }

      if (sampleCountDelta !== 0) {
        result.sampleCountDelta = sampleCountDelta;
      }
    }

    return result;
  }

  /**
   * Resets the state tracking.
   */
  reset(): void {
    this._currentHash.set('');
    this._previousHash.set('');
    this._lastSnapshot.set(null);
  }

  /**
   * Creates a detailed snapshot for debugging.
   */
  createDetailedSnapshot(table: SdrfTable): TableStateSnapshot & { valueSnapshot: string[][] } {
    const snapshot = {
      hash: this.computeTableHash(table),
      timestamp: new Date(),
      columnCount: table.columns.length,
      sampleCount: table.sampleCount,
      columnNames: table.columns.map(c => c.name),
      valueSnapshot: this.getValueMatrix(table, 5, 5), // First 5 rows, first 5 columns
    };

    return snapshot;
  }

  // === Private Helper Methods ===

  /**
   * Gets a sample of values for hashing.
   * Samples first, middle, and last rows to detect changes.
   */
  private getValueSample(table: SdrfTable): string {
    if (table.columns.length === 0 || table.sampleCount === 0) {
      return '';
    }

    const parts: string[] = [];
    const sampleSize = Math.min(5, table.sampleCount);
    const columnSample = Math.min(10, table.columns.length);

    // Sample specific rows
    const rowIndices = this.getSampleIndices(table.sampleCount, sampleSize);

    for (const rowIndex of rowIndices) {
      const rowValues: string[] = [];

      for (let colIndex = 0; colIndex < columnSample; colIndex++) {
        const column = table.columns[colIndex];
        const value = getValueForSample(column, rowIndex);
        rowValues.push(value);
      }

      parts.push(rowValues.join('|'));
    }

    return parts.join('\n');
  }

  /**
   * Gets sample indices for a given count.
   * Includes first, middle, and last rows for good coverage.
   */
  private getSampleIndices(total: number, sampleSize: number): number[] {
    if (total <= sampleSize) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }

    const indices: number[] = [1]; // First row (1-based)

    // Add middle rows
    const step = Math.floor((total - 2) / (sampleSize - 2));
    for (let i = 1; i < sampleSize - 1; i++) {
      indices.push(1 + i * step);
    }

    indices.push(total); // Last row

    return indices;
  }

  /**
   * Gets a matrix of values for detailed snapshot.
   */
  private getValueMatrix(
    table: SdrfTable,
    maxRows: number,
    maxCols: number
  ): string[][] {
    const matrix: string[][] = [];
    const rows = Math.min(maxRows, table.sampleCount);
    const cols = Math.min(maxCols, table.columns.length);

    for (let row = 1; row <= rows; row++) {
      const rowValues: string[] = [];

      for (let col = 0; col < cols; col++) {
        const column = table.columns[col];
        const value = getValueForSample(column, row);
        rowValues.push(value);
      }

      matrix.push(rowValues);
    }

    return matrix;
  }

  /**
   * Simple hash function for strings.
   * Uses djb2 algorithm for speed.
   */
  private simpleHash(str: string): string {
    let hash = 5381;

    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }

    return (hash >>> 0).toString(36);
  }
}

/**
 * Singleton instance for convenience in non-DI contexts.
 */
export const tableStateService = new TableStateService();
