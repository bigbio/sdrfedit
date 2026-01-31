/**
 * SDRF Export Service
 *
 * Exports SDRF tables to TSV and Excel formats.
 */

import { SdrfTable, getTableDataMatrix } from '../models/sdrf-table';

/**
 * Export options.
 */
export interface SdrfExportOptions {
  /** Whether to include pools in export */
  includePools?: boolean;

  /** Line ending style */
  lineEnding?: 'unix' | 'windows';

  /** Whether to include BOM for UTF-8 */
  includeBom?: boolean;
}

const DEFAULT_OPTIONS: SdrfExportOptions = {
  includePools: true,
  lineEnding: 'unix',
  includeBom: false,
};

/**
 * SDRF Export Service
 *
 * Converts SdrfTable to exportable formats.
 */
export class SdrfExportService {
  /**
   * Exports table to TSV string.
   *
   * @param table The table to export
   * @param options Export options
   * @returns TSV content as string
   */
  exportToTsv(table: SdrfTable, options: SdrfExportOptions = {}): string {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const lines: string[] = [];
    const lineEnding = opts.lineEnding === 'windows' ? '\r\n' : '\n';

    // Header row
    const headers = table.columns.map((col) => col.name);
    lines.push(headers.join('\t'));

    // Data rows
    const dataMatrix = getTableDataMatrix(table);
    for (const row of dataMatrix) {
      lines.push(row.join('\t'));
    }

    // Add pools if included and present
    if (opts.includePools && table.pools.length > 0) {
      for (const pool of table.pools) {
        if (pool.sdrfValue) {
          // Add pool row
          const poolRow = this.createPoolRow(table, pool);
          lines.push(poolRow.join('\t'));
        }
      }
    }

    let content = lines.join(lineEnding);

    // Add BOM if requested
    if (opts.includeBom) {
      content = '\ufeff' + content;
    }

    return content;
  }

  /**
   * Exports table to TSV Blob for download.
   *
   * @param table The table to export
   * @param options Export options
   * @returns Blob containing TSV content
   */
  exportToTsvBlob(table: SdrfTable, options: SdrfExportOptions = {}): Blob {
    const content = this.exportToTsv(table, options);
    return new Blob([content], { type: 'text/tab-separated-values;charset=utf-8' });
  }

  /**
   * Triggers download of TSV file.
   *
   * @param table The table to export
   * @param filename Filename for download
   * @param options Export options
   */
  downloadTsv(
    table: SdrfTable,
    filename: string = 'sdrf.tsv',
    options: SdrfExportOptions = {}
  ): void {
    const blob = this.exportToTsvBlob(table, options);
    this.downloadBlob(blob, filename);
  }

  /**
   * Exports table to Excel format.
   * Note: Requires xlsx library to be loaded.
   *
   * @param table The table to export
   * @param options Export options
   * @returns Promise with Excel Blob
   */
  async exportToExcel(
    table: SdrfTable,
    options: SdrfExportOptions = {}
  ): Promise<Blob> {
    // Dynamic import of xlsx library
    const XLSX = await this.loadXlsx();

    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Main data sheet
    const headers = table.columns.map((col) => col.name);
    const dataMatrix = getTableDataMatrix(table);
    const mainData = [headers, ...dataMatrix];

    const mainSheet = XLSX.utils.aoa_to_sheet(mainData);
    XLSX.utils.book_append_sheet(wb, mainSheet, 'main');

    // Column mapping sheet
    const columnMapData = [
      ['id', 'column', 'name', 'type', 'hidden'],
      ...table.columns.map((col, idx) => [
        idx,
        idx,
        col.name,
        col.type,
        col.hidden || false,
      ]),
    ];
    const columnMapSheet = XLSX.utils.aoa_to_sheet(columnMapData);
    XLSX.utils.book_append_sheet(wb, columnMapSheet, 'id_metadata_column_map');

    // Pools sheet if included
    if (opts.includePools && table.pools.length > 0) {
      const poolMapData = [
        ['pool_name', 'pooled_only_samples', 'pooled_and_independent_samples', 'is_reference'],
        ...table.pools.map((pool) => [
          pool.poolName,
          JSON.stringify(pool.pooledOnlySamples),
          JSON.stringify(pool.pooledAndIndependentSamples),
          pool.isReference,
        ]),
      ];
      const poolMapSheet = XLSX.utils.aoa_to_sheet(poolMapData);
      XLSX.utils.book_append_sheet(wb, poolMapSheet, 'pool_object_map');
    }

    // Convert to blob
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([excelBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  /**
   * Triggers download of Excel file.
   *
   * @param table The table to export
   * @param filename Filename for download
   * @param options Export options
   */
  async downloadExcel(
    table: SdrfTable,
    filename: string = 'sdrf.xlsx',
    options: SdrfExportOptions = {}
  ): Promise<void> {
    const blob = await this.exportToExcel(table, options);
    this.downloadBlob(blob, filename);
  }

  /**
   * Creates a pool row for TSV export.
   */
  private createPoolRow(table: SdrfTable, pool: any): string[] {
    const row: string[] = [];

    for (const column of table.columns) {
      const name = column.name.toLowerCase();

      if (name === 'source name') {
        row.push(pool.poolName);
      } else if (name.includes('pooled sample')) {
        row.push(pool.sdrfValue);
      } else {
        // Use pool metadata if available, otherwise empty
        const poolColumn = pool.metadata?.find(
          (m: any) => m.name.toLowerCase() === name
        );
        row.push(poolColumn?.value || '');
      }
    }

    return row;
  }

  /**
   * Downloads a blob as a file.
   */
  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Dynamically loads the xlsx library.
   */
  private async loadXlsx(): Promise<any> {
    // @ts-ignore - dynamic import
    const XLSX = await import('xlsx');
    return XLSX;
  }
}

// Export singleton instance for convenience
export const sdrfExport = new SdrfExportService();
