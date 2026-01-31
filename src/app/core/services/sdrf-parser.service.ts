/**
 * SDRF Parser Service
 *
 * Parses SDRF files (TSV format) into the in-memory SdrfTable structure.
 * Handles column detection, modifier creation, and pool detection.
 *
 * Ported from Python backend: ccv/tasks/import_utils.py:import_sdrf_data()
 */

import Papa from 'papaparse';
import {
  SdrfTable,
  SamplePool,
  createEmptyTable,
} from '../models/sdrf-table';
import {
  SdrfColumn,
  Modifier,
  ColumnType,
  detectColumnType,
} from '../models/sdrf-column';
import {
  getSdrfColumnConfig,
  isSdrfColumnRequired,
  getColumnOntologies,
} from '../models/sdrf-config';
import { encodeSampleRange } from '../utils/sample-range';

/**
 * Options for parsing SDRF files.
 */
export interface SdrfParseOptions {
  /** Whether to detect and create sample pools */
  detectPools?: boolean;

  /** Whether to trim whitespace from values */
  trimValues?: boolean;

  /** Whether to normalize column names to lowercase */
  normalizeColumnNames?: boolean;

  /** Custom delimiter (default: tab) */
  delimiter?: string;
}

/**
 * Result of parsing an SDRF file.
 */
export interface SdrfParseResult {
  /** Whether parsing was successful */
  success: boolean;

  /** The parsed table (if successful) */
  table?: SdrfTable;

  /** Error message (if failed) */
  error?: string;

  /** Warnings during parsing */
  warnings: string[];

  /** Statistics about the parse */
  stats: {
    rowCount: number;
    columnCount: number;
    poolCount: number;
    parseTimeMs: number;
  };
}

const DEFAULT_OPTIONS: SdrfParseOptions = {
  detectPools: true,
  trimValues: true,
  normalizeColumnNames: true,
  delimiter: '\t',
};

/**
 * SDRF Parser Service
 *
 * Parses SDRF TSV files and URLs into SdrfTable structure.
 */
export class SdrfParserService {
  /**
   * Parses SDRF content from a string.
   *
   * @param content TSV content as string
   * @param options Parse options
   * @returns Parse result with table or error
   */
  parseFromContent(
    content: string,
    options: SdrfParseOptions = {}
  ): SdrfParseResult {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const startTime = performance.now();
    const warnings: string[] = [];

    try {
      // Parse TSV with PapaParse
      const parseResult = Papa.parse<string[]>(content, {
        delimiter: opts.delimiter,
        header: false,
        skipEmptyLines: true,
        transformHeader: undefined,
      });

      if (parseResult.errors.length > 0) {
        // Check for critical errors
        const criticalErrors = parseResult.errors.filter(
          (e) => e.type === 'Quotes' || e.type === 'FieldMismatch'
        );
        if (criticalErrors.length > 0) {
          return {
            success: false,
            error: `Parse error: ${criticalErrors[0].message}`,
            warnings,
            stats: { rowCount: 0, columnCount: 0, poolCount: 0, parseTimeMs: 0 },
          };
        }
        // Add non-critical errors as warnings
        for (const err of parseResult.errors) {
          warnings.push(`Row ${err.row}: ${err.message}`);
        }
      }

      const data = parseResult.data;

      if (data.length === 0) {
        return {
          success: false,
          error: 'Empty file',
          warnings,
          stats: { rowCount: 0, columnCount: 0, poolCount: 0, parseTimeMs: 0 },
        };
      }

      // Extract headers and data rows
      const headers = data[0];
      const dataRows = data.slice(1);

      // Build the table
      const table = this.buildTable(headers, dataRows, opts, warnings);

      const parseTimeMs = performance.now() - startTime;

      return {
        success: true,
        table,
        warnings,
        stats: {
          rowCount: table.sampleCount,
          columnCount: table.columns.length,
          poolCount: table.pools.length,
          parseTimeMs,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Parse error: ${error instanceof Error ? error.message : String(error)}`,
        warnings,
        stats: { rowCount: 0, columnCount: 0, poolCount: 0, parseTimeMs: 0 },
      };
    }
  }

  /**
   * Parses SDRF content from a URL.
   *
   * @param url URL to fetch SDRF from
   * @param options Parse options
   * @returns Parse result with table or error
   */
  async parseFromUrl(
    url: string,
    options: SdrfParseOptions = {}
  ): Promise<SdrfParseResult> {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        return {
          success: false,
          error: `Failed to fetch: ${response.status} ${response.statusText}`,
          warnings: [],
          stats: { rowCount: 0, columnCount: 0, poolCount: 0, parseTimeMs: 0 },
        };
      }

      const content = await response.text();
      const result = this.parseFromContent(content, options);

      // Add source URL to metadata
      if (result.success && result.table) {
        result.table.metadata = {
          ...result.table.metadata,
          sourceUrl: url,
        };
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: `Fetch error: ${error instanceof Error ? error.message : String(error)}`,
        warnings: [],
        stats: { rowCount: 0, columnCount: 0, poolCount: 0, parseTimeMs: 0 },
      };
    }
  }

  /**
   * Parses SDRF content from a File object.
   *
   * @param file File to parse
   * @param options Parse options
   * @returns Promise with parse result
   */
  async parseFromFile(
    file: File,
    options: SdrfParseOptions = {}
  ): Promise<SdrfParseResult> {
    return new Promise((resolve) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const content = e.target?.result as string;
        const result = this.parseFromContent(content, options);

        // Add filename to metadata
        if (result.success && result.table) {
          result.table.metadata = {
            ...result.table.metadata,
            filename: file.name,
          };
        }

        resolve(result);
      };

      reader.onerror = () => {
        resolve({
          success: false,
          error: `File read error: ${reader.error?.message || 'Unknown error'}`,
          warnings: [],
          stats: { rowCount: 0, columnCount: 0, poolCount: 0, parseTimeMs: 0 },
        });
      };

      reader.readAsText(file);
    });
  }

  /**
   * Builds an SdrfTable from parsed headers and data rows.
   */
  private buildTable(
    headers: string[],
    dataRows: string[][],
    options: SdrfParseOptions,
    warnings: string[]
  ): SdrfTable {
    const table = createEmptyTable(dataRows.length);

    // Track column name occurrences for duplicate handling
    const columnNameCounts = new Map<string, number>();

    // Process each column
    headers.forEach((header, colIndex) => {
      const normalizedName = options.normalizeColumnNames
        ? header.toLowerCase().trim()
        : header.trim();

      // Track duplicates
      const count = (columnNameCounts.get(normalizedName) || 0) + 1;
      columnNameCounts.set(normalizedName, count);

      if (count > 1) {
        warnings.push(
          `Duplicate column name: "${normalizedName}" (occurrence ${count})`
        );
      }

      // Create column
      const column = this.createColumn(
        normalizedName,
        colIndex,
        dataRows,
        options
      );

      table.columns.push(column);
    });

    // Detect pools if enabled
    if (options.detectPools) {
      table.pools = this.detectPools(table.columns, dataRows, warnings);
    }

    table.metadata = {
      ...table.metadata,
      loadedAt: new Date(),
      modifiedAt: new Date(),
    };

    return table;
  }

  /**
   * Creates a column from parsed data with optimized modifiers.
   */
  private createColumn(
    name: string,
    colIndex: number,
    dataRows: string[][],
    options: SdrfParseOptions
  ): SdrfColumn {
    // Collect all values for this column
    const valueMap = new Map<string, number[]>();
    let hasNotApplicable = false;
    let hasNotAvailable = false;

    dataRows.forEach((row, rowIndex) => {
      let value = row[colIndex] || '';
      if (options.trimValues) {
        value = value.trim();
      }

      // Track special/reserved values (but still store them for display)
      const lower = value.toLowerCase();
      if (lower === 'not applicable') {
        hasNotApplicable = true;
      }
      if (lower === 'not available') {
        hasNotAvailable = true;
      }
      if (lower === 'anonymized') {
        // Track anonymized values
      }
      if (lower === 'pooled') {
        // Track pooled values
      }

      if (value === '') {
        return;
      }

      // Add to value map (1-based sample index)
      const sampleIndex = rowIndex + 1;
      if (!valueMap.has(value)) {
        valueMap.set(value, []);
      }
      valueMap.get(value)!.push(sampleIndex);
    });

    // Find most common value (default)
    let defaultValue = '';
    let maxCount = 0;

    for (const [value, samples] of valueMap) {
      if (samples.length > maxCount) {
        maxCount = samples.length;
        defaultValue = value;
      }
    }

    // Create modifiers for non-default values
    const modifiers: Modifier[] = [];

    for (const [value, samples] of valueMap) {
      if (value !== defaultValue) {
        modifiers.push({
          samples: encodeSampleRange(samples),
          value,
        });
      }
    }

    // Detect column type and get configuration
    const type = detectColumnType(name);
    const config = getSdrfColumnConfig(name);

    return {
      name,
      type,
      value: defaultValue,
      modifiers,
      columnPosition: colIndex,
      isRequired: isSdrfColumnRequired(name),
      ontologyType: config?.ontologies?.[0],
      ontologyOptions: getColumnOntologies(name),
      notApplicable: hasNotApplicable,
      notAvailable: hasNotAvailable,
    };
  }

  /**
   * Detects sample pools from the pooled sample column.
   */
  private detectPools(
    columns: SdrfColumn[],
    dataRows: string[][],
    warnings: string[]
  ): SamplePool[] {
    const pools: SamplePool[] = [];

    // Find pooled sample column
    const pooledColumnIndex = columns.findIndex((col) =>
      col.name.includes('pooled sample')
    );

    if (pooledColumnIndex === -1) {
      return pools;
    }

    // Find source name column
    const sourceNameColumnIndex = columns.findIndex(
      (col) => col.name === 'source name'
    );

    // Collect SN= rows and "pooled" rows
    const snRows: { rowIndex: number; row: string[]; value: string }[] = [];
    const pooledSamples: number[] = [];

    dataRows.forEach((row, rowIndex) => {
      const pooledValue = row[pooledColumnIndex]?.trim() || '';

      if (pooledValue.startsWith('SN=')) {
        snRows.push({ rowIndex, row, value: pooledValue });
      } else if (pooledValue.toLowerCase() === 'pooled') {
        pooledSamples.push(rowIndex + 1);
      }
    });

    // Process SN= rows (explicit pool definitions)
    for (const snRow of snRows) {
      const sourceNames = snRow.value
        .substring(3)
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s);

      // Get pool name from source name column
      const poolName =
        sourceNameColumnIndex !== -1
          ? snRow.row[sourceNameColumnIndex]?.trim() || `Pool ${pools.length + 1}`
          : `Pool ${pools.length + 1}`;

      // Find sample indices matching source names
      const pooledOnlySamples: number[] = [];
      const pooledAndIndependentSamples: number[] = [];

      if (sourceNameColumnIndex !== -1) {
        dataRows.forEach((row, rowIndex) => {
          const sourceName = row[sourceNameColumnIndex]?.trim() || '';
          if (sourceNames.includes(sourceName)) {
            const samplePooledValue = row[pooledColumnIndex]?.trim().toLowerCase() || '';

            if (
              samplePooledValue === 'not pooled' ||
              samplePooledValue === '' ||
              samplePooledValue === 'independent'
            ) {
              pooledAndIndependentSamples.push(rowIndex + 1);
            } else if (!samplePooledValue.startsWith('sn=')) {
              pooledOnlySamples.push(rowIndex + 1);
            }
          }
        });
      }

      pools.push({
        poolName,
        pooledOnlySamples,
        pooledAndIndependentSamples,
        isReference: true,
        sdrfValue: snRow.value,
      });
    }

    // If no SN= rows but there are "pooled" samples, create a pool from them
    if (snRows.length === 0 && pooledSamples.length > 0) {
      const sourceNames: string[] = [];

      if (sourceNameColumnIndex !== -1) {
        for (const sampleIndex of pooledSamples) {
          const row = dataRows[sampleIndex - 1];
          const sourceName = row[sourceNameColumnIndex]?.trim() || '';
          if (sourceName) {
            sourceNames.push(sourceName);
          }
        }
      }

      const sdrfValue =
        sourceNames.length > 0 ? `SN=${sourceNames.join(',')}` : '';

      pools.push({
        poolName: 'Pool 1',
        pooledOnlySamples: pooledSamples,
        pooledAndIndependentSamples: [],
        isReference: false,
        sdrfValue,
      });
    }

    return pools;
  }
}

// Export singleton instance for convenience
export const sdrfParser = new SdrfParserService();
