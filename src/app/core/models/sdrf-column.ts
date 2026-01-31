/**
 * SDRF Column Models
 *
 * Defines the structure for SDRF columns including modifiers
 * for sample-specific value overrides.
 */

/**
 * Column types in SDRF format
 */
export type ColumnType =
  | 'source_name'
  | 'characteristics'
  | 'comment'
  | 'factor_value'
  | 'special';

/**
 * A modifier represents a sample-specific value override.
 * The samples field uses range notation: "1-3,5,7-10"
 */
export interface Modifier {
  /** Sample indices in range format (e.g., "1-3,5,7-10") */
  samples: string;
  /** The value for these samples */
  value: string;
}

/**
 * Represents a single column in an SDRF table.
 */
export interface SdrfColumn {
  /** Column name (e.g., "characteristics[organism]") */
  name: string;

  /** Column type */
  type: ColumnType;

  /** Default value (most common value across samples) */
  value: string;

  /** Sample-specific value overrides */
  modifiers: Modifier[];

  /** Position in the table (0-indexed) */
  columnPosition: number;

  /** Ontology type for validation (e.g., "ncbitaxon", "efo") */
  ontologyType?: string;

  /** Allowed ontologies for this column */
  ontologyOptions?: string[];

  /** Whether this column is required per SDRF specification */
  isRequired?: boolean;

  /** Whether "not applicable" is allowed */
  notApplicable?: boolean;

  /** Whether "not available" is allowed */
  notAvailable?: boolean;

  /** Whether the column is hidden in the UI */
  hidden?: boolean;

  /** Whether the column is read-only */
  readonly?: boolean;
}

/**
 * Creates a new empty column with default values
 */
export function createEmptyColumn(
  name: string,
  type: ColumnType,
  position: number
): SdrfColumn {
  return {
    name,
    type,
    value: '',
    modifiers: [],
    columnPosition: position,
    isRequired: false,
    notApplicable: true,
    notAvailable: true,
  };
}

/**
 * Gets the value for a specific sample index from a column.
 * Checks modifiers first, then falls back to default value.
 */
export function getValueForSample(column: SdrfColumn, sampleIndex: number): string {
  // Check modifiers first
  for (const modifier of column.modifiers) {
    if (isSampleInRange(sampleIndex, modifier.samples)) {
      return modifier.value;
    }
  }
  return column.value;
}

/**
 * Checks if a sample index is within a range string.
 * Range format: "1-3,5,7-10"
 */
export function isSampleInRange(sampleIndex: number, rangeString: string): boolean {
  const parts = rangeString.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [start, end] = trimmed.split('-').map(Number);
      if (sampleIndex >= start && sampleIndex <= end) {
        return true;
      }
    } else {
      if (sampleIndex === Number(trimmed)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Detects the column type from a header name.
 */
export function detectColumnType(header: string): ColumnType {
  const h = header.toLowerCase().trim();

  if (h === 'source name') {
    return 'source_name';
  }
  if (h.startsWith('characteristics[')) {
    return 'characteristics';
  }
  if (h.startsWith('comment[')) {
    return 'comment';
  }
  if (h.startsWith('factor value[') || h.startsWith('factorvalue[')) {
    return 'factor_value';
  }

  return 'special';
}
