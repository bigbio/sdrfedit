/**
 * Validation Models
 *
 * Types for SDRF validation results and errors.
 */

/**
 * Severity level for validation messages.
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Error codes for validation issues.
 */
export type ValidationErrorCode =
  // Required column errors
  | 'MISSING_REQUIRED_COLUMN'
  | 'EMPTY_REQUIRED_VALUE'

  // Format errors
  | 'INVALID_COLLISION_ENERGY'
  | 'INVALID_AGE_FORMAT'
  | 'INVALID_MASS_TOLERANCE'
  | 'INVALID_MODIFICATION_FORMAT'
  | 'INVALID_CLEAVAGE_FORMAT'
  | 'INVALID_PATTERN'

  // Ontology errors
  | 'ONTOLOGY_TERM_NOT_FOUND'
  | 'INVALID_ONTOLOGY_ACCESSION'

  // Structure errors
  | 'DUPLICATE_COLUMN_NAME'
  | 'INVALID_COLUMN_ORDER'
  | 'MISSING_DATA_FILE'

  // Pool errors
  | 'INVALID_POOL_REFERENCE'
  | 'POOL_SAMPLE_NOT_FOUND'

  // General
  | 'UNKNOWN_ERROR';

/**
 * A single validation error or warning.
 */
export interface ValidationError {
  /** Severity level */
  type: ValidationSeverity;

  /** Error code for programmatic handling */
  code: ValidationErrorCode;

  /** Human-readable error message */
  message: string;

  /** Column name where error occurred */
  column?: string;

  /** Column index (0-based) */
  columnIndex?: number;

  /** Sample/row index (1-based) */
  row?: number;

  /** The problematic value */
  value?: string;

  /** Suggested fix */
  suggestion?: string;
}

/**
 * Overall validation result for a table.
 */
export interface ValidationResult {
  /** Whether validation passed (no errors) */
  isValid: boolean;

  /** All errors found */
  errors: ValidationError[];

  /** All warnings found */
  warnings: ValidationError[];

  /** Informational messages */
  info: ValidationError[];

  /** Summary statistics */
  summary: ValidationSummary;

  /** When validation was performed */
  timestamp: Date;

  /** Validation options used */
  options?: ValidationOptions;
}

/**
 * Summary of validation results.
 */
export interface ValidationSummary {
  /** Total number of errors */
  errorCount: number;

  /** Total number of warnings */
  warningCount: number;

  /** Total number of info messages */
  infoCount: number;

  /** Number of columns validated */
  columnsValidated: number;

  /** Number of samples validated */
  samplesValidated: number;

  /** Whether ontology validation was performed */
  ontologyValidated: boolean;
}

/**
 * Options for validation.
 */
export interface ValidationOptions {
  /** Whether to validate ontology terms against OLS */
  validateOntology?: boolean;

  /** Whether to skip validation for specific columns */
  skipColumns?: string[];

  /** Whether to treat warnings as errors */
  strictMode?: boolean;

  /** Maximum errors before stopping */
  maxErrors?: number;

  /** Schema to validate against (e.g., "default", "mass_spectrometry") */
  schema?: string;
}

/**
 * Creates an empty validation result.
 */
export function createEmptyValidationResult(): ValidationResult {
  return {
    isValid: true,
    errors: [],
    warnings: [],
    info: [],
    summary: {
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      columnsValidated: 0,
      samplesValidated: 0,
      ontologyValidated: false,
    },
    timestamp: new Date(),
  };
}

/**
 * Creates a validation error.
 */
export function createValidationError(
  code: ValidationErrorCode,
  message: string,
  options?: Partial<ValidationError>
): ValidationError {
  return {
    type: 'error',
    code,
    message,
    ...options,
  };
}

/**
 * Creates a validation warning.
 */
export function createValidationWarning(
  code: ValidationErrorCode,
  message: string,
  options?: Partial<ValidationError>
): ValidationError {
  return {
    type: 'warning',
    code,
    message,
    ...options,
  };
}

/**
 * Merges multiple validation results.
 */
export function mergeValidationResults(
  results: ValidationResult[]
): ValidationResult {
  const merged = createEmptyValidationResult();

  for (const result of results) {
    merged.errors.push(...result.errors);
    merged.warnings.push(...result.warnings);
    merged.info.push(...result.info);
  }

  merged.isValid = merged.errors.length === 0;
  merged.summary.errorCount = merged.errors.length;
  merged.summary.warningCount = merged.warnings.length;
  merged.summary.infoCount = merged.info.length;

  return merged;
}

/**
 * Filters validation errors by column.
 */
export function getErrorsForColumn(
  result: ValidationResult,
  columnName: string
): ValidationError[] {
  return result.errors.filter(
    (e) => e.column?.toLowerCase() === columnName.toLowerCase()
  );
}

/**
 * Filters validation errors by row.
 */
export function getErrorsForRow(
  result: ValidationResult,
  rowIndex: number
): ValidationError[] {
  return result.errors.filter((e) => e.row === rowIndex);
}
