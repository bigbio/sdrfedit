/**
 * Table Cache Service
 *
 * Automatic caching of SDRF table edits to prevent data loss.
 * Stores table snapshots in localStorage with metadata for recovery.
 *
 * Features:
 * - Auto-save on every change
 * - Multiple cached tables support
 * - Recovery on app restart
 * - Change tracking
 */

import { SdrfTable } from '../models/sdrf-table';

export interface CachedTableEntry {
  id: string;
  fileName: string;
  originalHash: string;
  tableData: string; // JSON stringified table
  lastModified: number;
  changeCount: number;
  metadata: {
    sampleCount: number;
    columnCount: number;
    firstColumn: string;
    lastColumn: string;
  };
}

export interface CacheMetadata {
  id: string;
  fileName: string;
  lastModified: Date;
  changeCount: number;
  sampleCount: number;
  columnCount: number;
}

const CACHE_PREFIX = 'sdrf_cache_';
const CACHE_INDEX_KEY = 'sdrf_cache_index';
const MAX_CACHE_SIZE = 10 * 1024 * 1024; // 10MB per entry
const MAX_CACHED_TABLES = 10; // Maximum number of cached tables

/**
 * Table Cache Service
 *
 * Manages automatic saving and recovery of SDRF table edits.
 */
export class TableCacheService {
  /**
   * Saves a table to cache.
   */
  saveTable(
    table: SdrfTable,
    fileName: string,
    originalHash?: string,
    changeCount: number = 1
  ): string | null {
    try {
      const id = this.generateId(fileName, originalHash);
      const entry: CachedTableEntry = {
        id,
        fileName,
        originalHash: originalHash || this.hashTable(table),
        tableData: JSON.stringify(table),
        lastModified: Date.now(),
        changeCount,
        metadata: {
          sampleCount: table.sampleCount,
          columnCount: table.columns.length,
          firstColumn: table.columns[0]?.name || '',
          lastColumn: table.columns[table.columns.length - 1]?.name || '',
        },
      };

      // Check size
      const serialized = JSON.stringify(entry);
      if (serialized.length > MAX_CACHE_SIZE) {
        console.warn('Table too large to cache:', serialized.length);
        return null;
      }

      // Save entry
      localStorage.setItem(CACHE_PREFIX + id, serialized);

      // Update index
      this.updateIndex(id);

      console.log(`Cached table "${fileName}" (${entry.changeCount} changes)`);
      return id;
    } catch (error) {
      console.error('Failed to cache table:', error);
      return null;
    }
  }

  /**
   * Loads a cached table by ID.
   */
  loadTable(id: string): { table: SdrfTable; entry: CachedTableEntry } | null {
    try {
      const cached = localStorage.getItem(CACHE_PREFIX + id);
      if (!cached) return null;

      const entry: CachedTableEntry = JSON.parse(cached);
      const table: SdrfTable = JSON.parse(entry.tableData);

      return { table, entry };
    } catch (error) {
      console.error('Failed to load cached table:', error);
      return null;
    }
  }

  /**
   * Gets metadata for all cached tables.
   */
  listCachedTables(): CacheMetadata[] {
    const index = this.getIndex();
    const metadata: CacheMetadata[] = [];

    for (const id of index) {
      try {
        const cached = localStorage.getItem(CACHE_PREFIX + id);
        if (!cached) continue;

        const entry: CachedTableEntry = JSON.parse(cached);
        metadata.push({
          id: entry.id,
          fileName: entry.fileName,
          lastModified: new Date(entry.lastModified),
          changeCount: entry.changeCount,
          sampleCount: entry.metadata.sampleCount,
          columnCount: entry.metadata.columnCount,
        });
      } catch (error) {
        console.warn('Failed to read cache entry:', id, error);
      }
    }

    // Sort by last modified (newest first)
    return metadata.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  }

  /**
   * Deletes a cached table.
   */
  deleteCache(id: string): void {
    localStorage.removeItem(CACHE_PREFIX + id);
    this.removeFromIndex(id);
    console.log('Deleted cache:', id);
  }

  /**
   * Clears all cached tables.
   */
  clearAllCaches(): void {
    const index = this.getIndex();
    for (const id of index) {
      localStorage.removeItem(CACHE_PREFIX + id);
    }
    localStorage.removeItem(CACHE_INDEX_KEY);
    console.log('Cleared all caches');
  }

  /**
   * Checks if there are any cached tables.
   */
  hasCachedTables(): boolean {
    return this.getIndex().length > 0;
  }

  /**
   * Gets the number of cached tables.
   */
  getCacheCount(): number {
    return this.getIndex().length;
  }

  /**
   * Estimates the total cache size in bytes.
   */
  estimateCacheSize(): number {
    const index = this.getIndex();
    let totalSize = 0;

    for (const id of index) {
      const cached = localStorage.getItem(CACHE_PREFIX + id);
      if (cached) {
        totalSize += cached.length * 2; // UTF-16 encoding
      }
    }

    return totalSize;
  }

  /**
   * Formats cache size for display.
   */
  formatCacheSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ============ Private Methods ============

  private generateId(fileName: string, hash?: string): string {
    const timestamp = Date.now();
    const baseName = fileName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    const hashPart = hash ? hash.substring(0, 8) : timestamp.toString(36);
    return `${baseName}_${hashPart}`;
  }

  private hashTable(table: SdrfTable): string {
    // Simple hash of table structure
    const str = `${table.sampleCount}_${table.columns.length}_${table.columns.map(c => c.name).join('_')}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private getIndex(): string[] {
    try {
      const stored = localStorage.getItem(CACHE_INDEX_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private updateIndex(id: string): void {
    const index = this.getIndex();

    // Add if not exists
    if (!index.includes(id)) {
      index.push(id);

      // Enforce max limit - remove oldest
      if (index.length > MAX_CACHED_TABLES) {
        const toRemove = index.shift();
        if (toRemove) {
          localStorage.removeItem(CACHE_PREFIX + toRemove);
        }
      }

      localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
    }
  }

  private removeFromIndex(id: string): void {
    const index = this.getIndex();
    const filtered = index.filter(i => i !== id);
    localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(filtered));
  }
}

// Export singleton instance
export const tableCacheService = new TableCacheService();
