/**
 * SDRF Syntax Service
 *
 * Handles parsing and formatting of special SDRF column values:
 * - Age format (e.g., "30Y", "30Y6M", "25Y-35Y")
 * - Modification parameters (e.g., "NT=Oxidation;MT=Variable;TA=M;AC=UNIMOD:35")
 * - Cleavage agent details (e.g., "NT=Trypsin;AC=MS:1001251")
 * - Spiked compounds (e.g., "SP=iRT;CT=peptide;QY=1fmol")
 *
 * Ported from cupcake-vanilla-ng: projects/cupcake-vanilla/src/lib/services/sdrf-syntax.ts
 */

/**
 * Parsed age format.
 */
export interface AgeFormat {
  years?: number;
  months?: number;
  days?: number;
  isRange?: boolean;
  rangeStart?: AgeFormat;
  rangeEnd?: AgeFormat;
}

/**
 * Parsed modification parameters.
 */
export interface ModificationParameters {
  /** Name of Term (e.g., "Oxidation") */
  NT?: string;
  /** Accession (e.g., "UNIMOD:35") */
  AC?: string;
  /** Chemical Formula (e.g., "O") */
  CF?: string;
  /** Modification Type (Fixed/Variable/Annotated) */
  MT?: string;
  /** Position in Polypeptide (e.g., "Anywhere") */
  PP?: string;
  /** Target Amino acid (e.g., "M") */
  TA?: string;
  /** Monoisotopic Mass */
  MM?: string;
  /** Target Site regex */
  TS?: string;
}

/**
 * Parsed cleavage agent details.
 */
export interface CleavageAgentDetails {
  /** Name of Term (e.g., "Trypsin") */
  NT?: string;
  /** Accession (e.g., "MS:1001251") */
  AC?: string;
  /** Cleavage Site regex (e.g., "[KR]|{P}") */
  CS?: string;
}

/**
 * Parsed spiked compound details.
 */
export interface SpikedCompound {
  /** Spike name */
  SP?: string;
  /** Compound type */
  CT?: string;
  /** Quantity */
  QY?: string;
  /** Purity specification */
  PS?: string;
  /** Accession */
  AC?: string;
  /** Compound name */
  CN?: string;
  /** Controlled vocabulary */
  CV?: string;
  /** Chemical structure */
  CS?: string;
  /** Chemical formula */
  CF?: string;
}

/**
 * Pooled sample value types.
 */
export interface PooledSample {
  /** Raw value: 'not pooled', 'pooled', or 'SN=sample1,sample2' format */
  value: 'not pooled' | 'pooled' | string;
  /** Parsed source names when SN= format is used */
  sourceNames?: string[];
}

/**
 * Validation result for parsed values.
 */
export interface SyntaxValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Type of special SDRF syntax.
 */
export type SyntaxType =
  | 'age'
  | 'modification'
  | 'cleavage'
  | 'spiked_compound'
  | 'pooled_sample'
  | 'synthetic_peptide';

/**
 * Column name patterns for detecting special syntax.
 */
const SPECIAL_COLUMN_PATTERNS: Record<SyntaxType, RegExp> = {
  age: /^characteristics\[age\]$/i,
  modification: /^comment\[modification parameters\]$/i,
  cleavage: /^comment\[cleavage agent details\]$/i,
  spiked_compound: /^characteristics\[spiked compound\]$/i,
  pooled_sample: /^characteristics\[pooled sample\]$/i,
  synthetic_peptide: /^characteristics\[synthetic peptide\]$/i,
};

/** Valid keys for modification parameters */
const MODIFICATION_KEYS = ['NT', 'AC', 'CF', 'MT', 'PP', 'TA', 'MM', 'TS'];

/** Valid keys for cleavage agent details */
const CLEAVAGE_KEYS = ['NT', 'AC', 'CS'];

/** Valid keys for spiked compound */
const SPIKED_COMPOUND_KEYS = ['SP', 'CT', 'QY', 'PS', 'AC', 'CN', 'CV', 'CS', 'CF'];

/** Valid values for pooled sample */
const POOLED_SAMPLE_VALUES = ['not pooled', 'pooled'];

/** Valid values for synthetic peptide */
const SYNTHETIC_PEPTIDE_VALUES = ['synthetic', 'not synthetic'];

/**
 * SDRF Syntax Service
 *
 * Provides parsing, formatting, and validation for special SDRF column values.
 */
export class SdrfSyntaxService {
  /**
   * Detects if a column requires special SDRF syntax handling.
   *
   * @param columnName The column name (e.g., "characteristics[age]")
   * @param columnType The column type (optional, for additional matching)
   * @returns The syntax type or null if no special handling needed
   */
  detectSpecialSyntax(columnName: string, columnType?: string): SyntaxType | null {
    const name = columnName.toLowerCase();
    const type = columnType?.toLowerCase() || '';

    for (const [syntaxType, pattern] of Object.entries(SPECIAL_COLUMN_PATTERNS)) {
      if (pattern.test(name) || pattern.test(type)) {
        return syntaxType as SyntaxType;
      }
    }

    return null;
  }

  /**
   * Parses a value based on the syntax type.
   *
   * @param syntaxType The type of syntax to parse
   * @param value The raw string value
   * @returns Parsed object or null if parsing fails
   */
  parseValue(syntaxType: SyntaxType, value: string): unknown {
    if (!value || value.trim() === '') {
      return null;
    }

    try {
      switch (syntaxType) {
        case 'age':
          return this.parseAgeFormat(value);
        case 'modification':
          return this.parseKeyValuePairs(value, MODIFICATION_KEYS) as ModificationParameters;
        case 'cleavage':
          return this.parseKeyValuePairs(value, CLEAVAGE_KEYS) as CleavageAgentDetails;
        case 'spiked_compound':
          return this.parseKeyValuePairs(value, SPIKED_COMPOUND_KEYS) as SpikedCompound;
        case 'pooled_sample':
          return this.parsePooledSample(value);
        case 'synthetic_peptide':
          return { value: value.toLowerCase().trim() };
        default:
          throw new Error(`Unknown syntax type: ${syntaxType}`);
      }
    } catch (error) {
      console.error(`Error parsing ${syntaxType} value:`, error);
      return null;
    }
  }

  /**
   * Formats parsed data back to string format.
   *
   * @param syntaxType The type of syntax
   * @param data The parsed data object
   * @returns Formatted string
   */
  formatValue(syntaxType: SyntaxType, data: unknown): string {
    if (!data) {
      return '';
    }

    try {
      switch (syntaxType) {
        case 'age':
          return this.formatAgeFormat(data as AgeFormat);
        case 'modification':
        case 'cleavage':
        case 'spiked_compound':
          return this.formatKeyValuePairs(data as Record<string, string>);
        case 'pooled_sample':
          return this.formatPooledSample(data as PooledSample);
        case 'synthetic_peptide':
          return (data as { value: string }).value || '';
        default:
          throw new Error(`Unknown syntax type: ${syntaxType}`);
      }
    } catch (error) {
      console.error(`Error formatting ${syntaxType} value:`, error);
      return '';
    }
  }

  /**
   * Validates parsed data.
   *
   * @param syntaxType The type of syntax
   * @param data The parsed data to validate
   * @returns Validation result
   */
  validateValue(syntaxType: SyntaxType, data: unknown): SyntaxValidationResult {
    const result: SyntaxValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
    };

    if (!data) {
      result.isValid = false;
      result.errors.push('Value is required');
      return result;
    }

    try {
      switch (syntaxType) {
        case 'age':
          return this.validateAgeFormat(data as AgeFormat);
        case 'modification':
          return this.validateModificationParameters(data as ModificationParameters);
        case 'cleavage':
          return this.validateCleavageAgentDetails(data as CleavageAgentDetails);
        case 'spiked_compound':
          return this.validateSpikedCompound(data as SpikedCompound);
        case 'pooled_sample':
          return this.validatePooledSample(data as PooledSample);
        case 'synthetic_peptide':
          return this.validateSyntheticPeptide(data as { value: string });
        default:
          result.isValid = false;
          result.errors.push(`Unknown syntax type: ${syntaxType}`);
      }
    } catch (error) {
      result.isValid = false;
      result.errors.push(`Validation error: ${error}`);
    }

    return result;
  }

  // ============ Age Format Methods ============

  private parseAgeFormat(value: string): AgeFormat {
    const trimmed = value.trim();

    // Check for range format (e.g., "25Y-35Y")
    if (trimmed.includes('-') && !trimmed.startsWith('-')) {
      const parts = trimmed.split('-');
      if (parts.length === 2) {
        return {
          isRange: true,
          rangeStart: this.parseSingleAge(parts[0].trim()),
          rangeEnd: this.parseSingleAge(parts[1].trim()),
        };
      }
    }

    return this.parseSingleAge(trimmed);
  }

  private parseSingleAge(ageStr: string): AgeFormat {
    const age: AgeFormat = {};

    const yearMatch = ageStr.match(/(\d+)Y/i);
    const monthMatch = ageStr.match(/(\d+)M/i);
    const dayMatch = ageStr.match(/(\d+)D/i);

    if (yearMatch) {
      age.years = parseInt(yearMatch[1], 10);
    }
    if (monthMatch) {
      age.months = parseInt(monthMatch[1], 10);
    }
    if (dayMatch) {
      age.days = parseInt(dayMatch[1], 10);
    }

    return age;
  }

  private formatAgeFormat(age: AgeFormat): string {
    if (age.isRange && age.rangeStart && age.rangeEnd) {
      return `${this.formatSingleAge(age.rangeStart)}-${this.formatSingleAge(age.rangeEnd)}`;
    }

    return this.formatSingleAge(age);
  }

  private formatSingleAge(age: AgeFormat): string {
    let result = '';
    if (age.years !== undefined && age.years > 0) result += `${age.years}Y`;
    if (age.months !== undefined && age.months > 0) result += `${age.months}M`;
    if (age.days !== undefined && age.days > 0) result += `${age.days}D`;
    return result;
  }

  private validateAgeFormat(age: AgeFormat): SyntaxValidationResult {
    const result: SyntaxValidationResult = { isValid: true, errors: [], warnings: [] };

    if (age.isRange) {
      if (!age.rangeStart || !age.rangeEnd) {
        result.isValid = false;
        result.errors.push('Range format requires both start and end values');
        return result;
      }

      const startValidation = this.validateSingleAge(age.rangeStart);
      const endValidation = this.validateSingleAge(age.rangeEnd);

      if (!startValidation.isValid) {
        result.isValid = false;
        result.errors.push(...startValidation.errors.map((e) => `Range start: ${e}`));
      }

      if (!endValidation.isValid) {
        result.isValid = false;
        result.errors.push(...endValidation.errors.map((e) => `Range end: ${e}`));
      }
    } else {
      const singleValidation = this.validateSingleAge(age);
      if (!singleValidation.isValid) {
        result.isValid = false;
        result.errors.push(...singleValidation.errors);
      }
    }

    return result;
  }

  private validateSingleAge(age: AgeFormat): SyntaxValidationResult {
    const result: SyntaxValidationResult = { isValid: true, errors: [] };

    if (age.years === undefined && age.months === undefined && age.days === undefined) {
      result.isValid = false;
      result.errors.push('At least one age component (years, months, or days) is required');
    }

    if (age.years !== undefined && (age.years < 0 || age.years > 200)) {
      result.isValid = false;
      result.errors.push('Years must be between 0 and 200');
    }

    if (age.months !== undefined && (age.months < 0 || age.months > 11)) {
      result.isValid = false;
      result.errors.push('Months must be between 0 and 11');
    }

    if (age.days !== undefined && (age.days < 0 || age.days > 31)) {
      result.isValid = false;
      result.errors.push('Days must be between 0 and 31');
    }

    return result;
  }

  // ============ Key-Value Pair Methods ============

  private parseKeyValuePairs(value: string, validKeys: string[]): Record<string, string> {
    const result: Record<string, string> = {};

    const pairs = value.split(';').map((pair) => pair.trim()).filter((pair) => pair);

    for (const pair of pairs) {
      const [key, ...valueParts] = pair.split('=');
      const keyTrimmed = key?.trim();
      const valueTrimmed = valueParts.join('=').trim();

      if (keyTrimmed && validKeys.includes(keyTrimmed)) {
        result[keyTrimmed] = valueTrimmed;
      }
    }

    return result;
  }

  private formatKeyValuePairs(data: Record<string, string>): string {
    const pairs: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined && value !== '') {
        pairs.push(`${key}=${value}`);
      }
    }

    return pairs.join(';');
  }

  // ============ Modification Methods ============

  private validateModificationParameters(params: ModificationParameters): SyntaxValidationResult {
    const result: SyntaxValidationResult = { isValid: true, errors: [], warnings: [] };

    const hasAnyParam = Object.values(params).some(
      (value) => value !== undefined && value !== ''
    );
    if (!hasAnyParam) {
      result.isValid = false;
      result.errors.push('At least one modification parameter is required');
    }

    // Validate required fields
    if (!params.NT) {
      result.warnings?.push('NT (Name of Term) is recommended');
    }

    if (!params.TA) {
      result.warnings?.push('TA (Target Amino acid) is recommended');
    }

    // Validate PP format if present
    if (params.PP && !/^\d+$/.test(params.PP)) {
      // PP can be "Anywhere", "Protein N-term", etc. - not just numbers
      const validPositions = ['Anywhere', 'Protein N-term', 'Protein C-term', 'Any N-term', 'Any C-term'];
      if (!validPositions.some((p) => p.toLowerCase() === params.PP?.toLowerCase())) {
        result.warnings?.push('PP (position) should be a number or standard position term');
      }
    }

    // Validate MM format if present
    if (params.MM && !/^-?\d+(\.\d+)?$/.test(params.MM)) {
      result.errors.push('MM (monoisotopic mass) must be a valid number');
      result.isValid = false;
    }

    return result;
  }

  // ============ Cleavage Methods ============

  private validateCleavageAgentDetails(details: CleavageAgentDetails): SyntaxValidationResult {
    const result: SyntaxValidationResult = { isValid: true, errors: [], warnings: [] };

    const hasAnyDetail = Object.values(details).some(
      (value) => value !== undefined && value !== ''
    );
    if (!hasAnyDetail) {
      result.isValid = false;
      result.errors.push('At least one cleavage agent detail is required');
    }

    if (!details.NT) {
      result.warnings?.push('NT (Name of Term) is recommended');
    }

    return result;
  }

  // ============ Spiked Compound Methods ============

  private validateSpikedCompound(compound: SpikedCompound): SyntaxValidationResult {
    const result: SyntaxValidationResult = { isValid: true, errors: [], warnings: [] };

    const hasAnyParam = Object.values(compound).some(
      (value) => value !== undefined && value !== ''
    );
    if (!hasAnyParam) {
      result.isValid = false;
      result.errors.push('At least one spiked compound parameter is required');
    }

    // Validate QY format if present
    if (compound.QY && !/^\d+(\.\d+)?\s*(mg|g|kg|μg|ng|pg|M|mM|μM|nM|pM|fmol|pmol|nmol)?$/i.test(compound.QY)) {
      result.warnings?.push('QY (quantity) format may not be standard - consider using standard units');
    }

    return result;
  }

  // ============ Pooled Sample Methods ============

  private parsePooledSample(value: string): PooledSample {
    const trimmed = value.trim();
    const lower = trimmed.toLowerCase();

    if (lower === 'not pooled' || lower === 'pooled') {
      return { value: lower as 'not pooled' | 'pooled' };
    }

    // Check for SN= format
    if (trimmed.startsWith('SN=')) {
      const sourceNames = trimmed
        .substring(3)
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name);
      return {
        value: trimmed,
        sourceNames,
      };
    }

    return { value: trimmed };
  }

  private formatPooledSample(sample: PooledSample): string {
    if (sample.sourceNames && sample.sourceNames.length > 0) {
      return `SN=${sample.sourceNames.join(',')}`;
    }
    return sample.value;
  }

  private validatePooledSample(sample: PooledSample): SyntaxValidationResult {
    const result: SyntaxValidationResult = { isValid: true, errors: [], warnings: [] };

    const lower = sample.value.toLowerCase();

    if (lower !== 'not pooled' && lower !== 'pooled' && !sample.value.startsWith('SN=')) {
      result.warnings?.push(
        'Pooled sample should be "not pooled", "pooled", or use SN= format'
      );
    }

    if (sample.value.startsWith('SN=') && (!sample.sourceNames || sample.sourceNames.length === 0)) {
      result.isValid = false;
      result.errors.push('SN= format requires at least one source name');
    }

    return result;
  }

  // ============ Synthetic Peptide Methods ============

  private validateSyntheticPeptide(data: { value: string }): SyntaxValidationResult {
    const result: SyntaxValidationResult = { isValid: true, errors: [], warnings: [] };

    if (!SYNTHETIC_PEPTIDE_VALUES.includes(data.value.toLowerCase())) {
      result.warnings?.push('Synthetic peptide should be "synthetic" or "not synthetic"');
    }

    return result;
  }

  // ============ Helper Methods ============

  /**
   * Gets the valid values for pooled sample column.
   */
  getPooledSampleValues(): string[] {
    return [...POOLED_SAMPLE_VALUES];
  }

  /**
   * Gets the valid values for synthetic peptide column.
   */
  getSyntheticPeptideValues(): string[] {
    return [...SYNTHETIC_PEPTIDE_VALUES];
  }

  /**
   * Gets the valid keys for modification parameters.
   */
  getModificationKeys(): string[] {
    return [...MODIFICATION_KEYS];
  }

  /**
   * Gets the valid keys for cleavage agent details.
   */
  getCleavageKeys(): string[] {
    return [...CLEAVAGE_KEYS];
  }

  /**
   * Gets the valid keys for spiked compound.
   */
  getSpikedCompoundKeys(): string[] {
    return [...SPIKED_COMPOUND_KEYS];
  }
}

// Export singleton instance for convenience
export const sdrfSyntax = new SdrfSyntaxService();
