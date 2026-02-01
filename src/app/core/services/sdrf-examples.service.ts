/**
 * SDRF Examples Service
 *
 * Provides access to example values from annotated SDRF datasets.
 * Used to enhance AI prompts with real-world examples for better suggestions.
 */

/**
 * Structure of the examples index.
 */
export interface SdrfExamplesIndex {
  columns: {
    [columnName: string]: {
      [organism: string]: {
        [value: string]: number;
      };
    };
  };
  metadata: {
    generatedAt: string;
    filesProcessed: number;
    totalRows: number;
    columnsIndexed: number;
    maxValuesPerColumn: number;
    minCountThreshold: number;
  };
}

/**
 * Example value with count.
 */
export interface ExampleValue {
  value: string;
  count: number;
}

/**
 * SDRF Examples Service
 *
 * Loads and queries the pre-built index of example values from annotated SDRF files.
 * This enables the AI assistant to provide context-aware suggestions based on
 * real-world usage patterns from ~500,000+ annotated samples.
 */
export class SdrfExamplesService {
  private index: SdrfExamplesIndex | null = null;
  private loadPromise: Promise<void> | null = null;
  private loaded = false;

  /**
   * Loads the examples index from the assets folder.
   * Safe to call multiple times - will only load once.
   */
  async loadIndex(): Promise<void> {
    if (this.loaded) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.doLoadIndex();
    return this.loadPromise;
  }

  private async doLoadIndex(): Promise<void> {
    try {
      // Try loading compressed version first (76% smaller)
      const index = await this.loadCompressedIndex();
      if (index) {
        this.index = index;
        this.loaded = true;
        console.log(
          `SDRF examples loaded (compressed): ${this.index?.metadata?.totalRows} rows from ${this.index?.metadata?.filesProcessed} files`
        );
        return;
      }

      // Fallback to uncompressed version
      const response = await fetch('assets/sdrf-examples-index.json');
      if (!response.ok) {
        throw new Error(`Failed to load index: ${response.status}`);
      }
      this.index = await response.json();
      this.loaded = true;
      console.log(
        `SDRF examples loaded: ${this.index?.metadata?.totalRows} rows from ${this.index?.metadata?.filesProcessed} files`
      );
    } catch (error) {
      console.warn('Could not load SDRF examples index:', error);
      // Create empty index so service still works
      this.index = {
        columns: {},
        metadata: {
          generatedAt: new Date().toISOString(),
          filesProcessed: 0,
          totalRows: 0,
          columnsIndexed: 0,
          maxValuesPerColumn: 0,
          minCountThreshold: 0,
        },
      };
      this.loaded = true;
    }
  }

  /**
   * Attempts to load and decompress the gzipped index file.
   * Uses the browser's DecompressionStream API for efficient decompression.
   * Returns null if decompression is not supported or fails.
   */
  private async loadCompressedIndex(): Promise<SdrfExamplesIndex | null> {
    // Check if DecompressionStream is supported
    if (typeof DecompressionStream === 'undefined') {
      console.log('DecompressionStream not supported, falling back to uncompressed');
      return null;
    }

    try {
      const response = await fetch('assets/sdrf-examples-index.json.gz');
      if (!response.ok || !response.body) {
        return null;
      }

      // Decompress the response using DecompressionStream
      const decompressedStream = response.body.pipeThrough(
        new DecompressionStream('gzip')
      );

      // Read the decompressed stream as text
      const reader = decompressedStream.getReader();
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      // Combine chunks and decode as text
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      const text = new TextDecoder().decode(combined);
      return JSON.parse(text);
    } catch (error) {
      console.warn('Failed to load compressed index, falling back to uncompressed:', error);
      return null;
    }
  }

  /**
   * Returns whether the index has been loaded.
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Gets the index metadata.
   */
  getMetadata(): SdrfExamplesIndex['metadata'] | null {
    return this.index?.metadata || null;
  }

  /**
   * Gets example values for a column, optionally filtered by organism.
   *
   * @param columnName - The column name (e.g., "characteristics[disease]")
   * @param organism - Optional organism filter (e.g., "homo sapiens")
   * @param limit - Maximum number of values to return (default 20)
   * @returns Array of {value, count} sorted by count descending
   */
  getExamplesForColumn(
    columnName: string,
    organism?: string,
    limit: number = 20
  ): ExampleValue[] {
    if (!this.index) return [];

    const normalizedCol = columnName.toLowerCase().trim();
    const columnData = this.index.columns[normalizedCol];

    if (!columnData) return [];

    // If organism specified, try to get organism-specific data
    const normalizedOrg = organism?.toLowerCase().trim();
    let values: { [value: string]: number } | undefined;

    if (normalizedOrg) {
      // Try exact match first
      values = columnData[normalizedOrg];

      // If no exact match, try to find partial match
      if (!values) {
        const matchingOrg = Object.keys(columnData).find(
          (org) => org.includes(normalizedOrg) || normalizedOrg.includes(org)
        );
        if (matchingOrg) {
          values = columnData[matchingOrg];
        }
      }

      // Fall back to 'all' if this is organism column, or aggregate all organisms
      if (!values) {
        if (normalizedCol === 'characteristics[organism]') {
          values = columnData['all'];
        } else {
          // Aggregate across all organisms
          values = this.aggregateAllOrganisms(columnData);
        }
      }
    } else {
      // No organism specified - use 'all' for organism column, aggregate for others
      if (normalizedCol === 'characteristics[organism]') {
        values = columnData['all'];
      } else {
        values = this.aggregateAllOrganisms(columnData);
      }
    }

    if (!values) return [];

    // Convert to array and sort by count
    return Object.entries(values)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Aggregates values across all organisms for a column.
   */
  private aggregateAllOrganisms(
    columnData: { [organism: string]: { [value: string]: number } }
  ): { [value: string]: number } {
    const aggregated: { [value: string]: number } = {};

    for (const orgValues of Object.values(columnData)) {
      for (const [value, count] of Object.entries(orgValues)) {
        aggregated[value] = (aggregated[value] || 0) + count;
      }
    }

    return aggregated;
  }

  /**
   * Gets a context string for use in LLM prompts.
   * Provides common values with their occurrence counts.
   *
   * @param columnName - The column name
   * @param organism - Optional organism filter
   * @param limit - Maximum number of examples to include
   * @returns A formatted string for LLM context
   */
  getContextForColumn(
    columnName: string,
    organism?: string,
    limit: number = 10
  ): string {
    const examples = this.getExamplesForColumn(columnName, organism, limit);

    if (examples.length === 0) {
      return '';
    }

    const lines = examples.map((ex) => {
      const countStr = ex.count >= 1000
        ? `${(ex.count / 1000).toFixed(1)}k`
        : `${ex.count}`;
      return `- "${ex.value}" (${countStr} occurrences)`;
    });

    const orgInfo = organism ? ` for ${organism}` : '';
    return `Common values in ${columnName}${orgInfo}:\n${lines.join('\n')}`;
  }

  /**
   * Gets context for multiple columns at once.
   *
   * @param columnNames - Array of column names to get context for
   * @param organism - Optional organism filter
   * @param limitPerColumn - Max examples per column
   * @returns Combined context string
   */
  getContextForColumns(
    columnNames: string[],
    organism?: string,
    limitPerColumn: number = 5
  ): string {
    const contexts: string[] = [];

    for (const col of columnNames) {
      const ctx = this.getContextForColumn(col, organism, limitPerColumn);
      if (ctx) {
        contexts.push(ctx);
      }
    }

    if (contexts.length === 0) {
      return '';
    }

    return '## Reference Examples from Annotated Datasets\n\n' + contexts.join('\n\n');
  }

  /**
   * Gets example values formatted as a simple list for quick reference.
   */
  getExampleValuesList(
    columnName: string,
    organism?: string,
    limit: number = 5
  ): string[] {
    return this.getExamplesForColumn(columnName, organism, limit).map((ex) => ex.value);
  }

  /**
   * Checks if a value is a common/valid value for a column.
   * Useful for validation suggestions.
   */
  isCommonValue(columnName: string, value: string, organism?: string): boolean {
    const examples = this.getExamplesForColumn(columnName, organism, 50);
    const normalizedValue = value.toLowerCase().trim();
    return examples.some((ex) => ex.value === normalizedValue);
  }

  /**
   * Suggests similar values for a potentially misspelled input.
   */
  suggestSimilarValues(
    columnName: string,
    input: string,
    organism?: string,
    limit: number = 5
  ): ExampleValue[] {
    const examples = this.getExamplesForColumn(columnName, organism, 50);
    const normalizedInput = input.toLowerCase().trim();

    // Score each example by similarity
    const scored = examples.map((ex) => ({
      ...ex,
      score: this.similarityScore(normalizedInput, ex.value),
    }));

    // Filter and sort by similarity score
    return scored
      .filter((ex) => ex.score > 0.3) // At least 30% similar
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Simple similarity score based on common characters.
   */
  private similarityScore(a: string, b: string): number {
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.8;

    // Count common characters
    const aChars = new Set(a.split(''));
    const bChars = new Set(b.split(''));
    let common = 0;
    for (const c of aChars) {
      if (bChars.has(c)) common++;
    }

    const maxLen = Math.max(aChars.size, bChars.size);
    return maxLen > 0 ? common / maxLen : 0;
  }

  /**
   * Gets all available organisms in the index.
   */
  getAvailableOrganisms(): string[] {
    if (!this.index) return [];

    const organisms = new Set<string>();
    for (const columnData of Object.values(this.index.columns)) {
      for (const org of Object.keys(columnData)) {
        if (org !== 'all') {
          organisms.add(org);
        }
      }
    }

    return Array.from(organisms).sort();
  }

  /**
   * Gets all indexed column names.
   */
  getIndexedColumns(): string[] {
    if (!this.index) return [];
    return Object.keys(this.index.columns);
  }
}

// Export singleton instance
export const sdrfExamplesService = new SdrfExamplesService();
