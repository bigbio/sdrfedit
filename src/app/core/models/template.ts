/**
 * Template Model
 *
 * Interfaces for SDRF template definitions loaded from YAML or API.
 * Templates define required columns, validators, and inheritance relationships.
 */

/**
 * Validator types supported by templates.
 */
export type ValidatorName = 'ontology' | 'pattern' | 'values' | 'single_cardinality_validator';

/**
 * Error levels for validation.
 */
export type ErrorLevel = 'error' | 'warning';

/**
 * Requirement levels for columns.
 */
export type RequirementLevel = 'required' | 'recommended' | 'optional';

/**
 * Template layers - determines how templates can be combined.
 */
export type TemplateLayer = 'technology' | 'sample' | 'experiment';

/**
 * Column cardinality.
 */
export type ColumnCardinality = 'single' | 'multiple';

/**
 * Parameters for a template validator.
 */
export interface TemplateValidatorParams {
  /** Ontologies to validate against (for ontology validator) */
  ontologies?: string[];
  /** Regex pattern for validation (for pattern validator) */
  pattern?: string;
  /** Allowed values (for values validator) */
  values?: string[];
  /** Error level for validation failures */
  errorLevel?: ErrorLevel;
  /** Description of the validation rule */
  description?: string;
  /** Example valid values */
  examples?: string[];
  /** Whether pattern matching is case sensitive */
  caseSensitive?: boolean;
  /** Minimum columns required (for min_columns validator) */
  minColumns?: number;
  /** Column names for combination validators */
  columnName?: string[];
  /** Column names for warnings in combination validators */
  columnNameWarning?: string[];
}

/**
 * A validator definition for a column or template.
 */
export interface TemplateValidator {
  /** Name of the validator */
  validatorName: ValidatorName | string;
  /** Validator parameters */
  params: TemplateValidatorParams;
}

/**
 * A column definition within a template.
 */
export interface TemplateColumn {
  /** Column name (e.g., "characteristics[organism]") */
  name: string;
  /** Description of the column */
  description: string;
  /** Whether the column is required, recommended, or optional */
  requirement: RequirementLevel;
  /** Whether "not applicable" is an allowed value */
  allowNotApplicable?: boolean;
  /** Whether "not available" is an allowed value */
  allowNotAvailable?: boolean;
  /** Whether "anonymized" is an allowed value */
  allowAnonymized?: boolean;
  /** Whether "pooled" is an allowed value */
  allowPooled?: boolean;
  /** Column cardinality - single or multiple columns with same name */
  cardinality?: ColumnCardinality;
  /** Column data type */
  type?: 'string' | 'integer' | 'float';
  /** Validators for this column */
  validators?: TemplateValidator[];
}

/**
 * A template definition as loaded from YAML or API.
 */
export interface TemplateDefinition {
  /** Template name (e.g., "human", "ms-proteomics") */
  name: string;
  /** Description of the template */
  description: string;
  /** Template version (semver) */
  version: string;
  /** Parent template name (for inheritance) */
  extends: string | null;
  /** Whether this template can be used alone */
  usableAlone: boolean;
  /** Template layer (technology, sample, experiment) */
  layer: TemplateLayer | null;
  /** Templates that are mutually exclusive with this one */
  mutuallyExclusiveWith?: string[];
  /** Template-level validators */
  validators?: TemplateValidator[];
  /** Column definitions */
  columns: TemplateColumn[];
  /** Template status */
  status?: 'stable' | 'development';
}

/**
 * A resolved template with inheritance applied.
 */
export interface ResolvedTemplate extends TemplateDefinition {
  /** Columns after inheritance resolution */
  resolvedColumns: TemplateColumn[];
  /** Parent chain for debugging (e.g., ["base", "ms-proteomics"]) */
  parentChain: string[];
  /** Combined template-level validators from all parents */
  resolvedValidators: TemplateValidator[];
}

/**
 * Template manifest entry from templates.yaml.
 */
export interface TemplateManifestEntry {
  /** Latest version */
  latest: string;
  /** Available versions */
  versions: string[];
  /** Parent template name */
  extends: string | null;
  /** Whether usable alone */
  usableAlone: boolean;
  /** Template layer */
  layer: TemplateLayer | null;
  /** Template status */
  status: 'stable' | 'development';
  /** Description */
  description: string;
}

/**
 * Template manifest structure from templates.yaml.
 */
export interface TemplateManifest {
  schemaVersion: string;
  generatedAt: string;
  templates: Record<string, TemplateManifestEntry>;
}

/**
 * API response for templates endpoint.
 */
export interface ApiTemplatesResponse {
  templates: string[];
  version?: string;
}

/**
 * Template info for UI display.
 */
export interface TemplateInfo {
  /** Template ID/name */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Template layer */
  layer: TemplateLayer | null;
  /** Whether usable alone */
  usableAlone: boolean;
  /** Parent template */
  extends: string | null;
  /** Icon for UI (derived from template name) */
  icon?: string;
  /** Status */
  status?: 'stable' | 'development';
}

/**
 * Convert snake_case YAML keys to camelCase.
 */
export function convertYamlToTemplateDefinition(yaml: any): TemplateDefinition {
  return {
    name: yaml.name,
    description: yaml.description,
    version: yaml.version,
    extends: yaml.extends || null,
    usableAlone: yaml.usable_alone ?? false,
    layer: yaml.layer || null,
    mutuallyExclusiveWith: yaml.mutually_exclusive_with,
    status: yaml.status,
    validators: yaml.validators?.map((v: any) => convertYamlToValidator(v)),
    columns: yaml.columns?.map((c: any) => convertYamlToColumn(c)) || [],
  };
}

/**
 * Convert YAML column to TemplateColumn.
 */
function convertYamlToColumn(yaml: any): TemplateColumn {
  return {
    name: yaml.name,
    description: yaml.description,
    requirement: yaml.requirement,
    allowNotApplicable: yaml.allow_not_applicable,
    allowNotAvailable: yaml.allow_not_available,
    allowAnonymized: yaml.allow_anonymized,
    allowPooled: yaml.allow_pooled,
    cardinality: yaml.cardinality,
    type: yaml.type,
    validators: yaml.validators?.map((v: any) => convertYamlToValidator(v)),
  };
}

/**
 * Convert YAML validator to TemplateValidator.
 */
function convertYamlToValidator(yaml: any): TemplateValidator {
  return {
    validatorName: yaml.validator_name,
    params: {
      ontologies: yaml.params?.ontologies,
      pattern: yaml.params?.pattern,
      values: yaml.params?.values,
      errorLevel: yaml.params?.error_level,
      description: yaml.params?.description,
      examples: yaml.params?.examples,
      caseSensitive: yaml.params?.case_sensitive,
      minColumns: yaml.params?.min_columns,
      columnName: yaml.params?.column_name,
      columnNameWarning: yaml.params?.column_name_warning,
    },
  };
}

/**
 * Get icon for a template based on its name.
 */
export function getTemplateIcon(templateId: string): string {
  const iconMap: Record<string, string> = {
    'human': 'person',
    'cell-lines': 'science',
    'vertebrates': 'pets',
    'invertebrates': 'bug_report',
    'plants': 'eco',
    'ms-proteomics': 'analytics',
    'affinity-proteomics': 'biotech',
    'dda-acquisition': 'scatter_plot',
    'dia-acquisition': 'assessment',
    'single-cell': 'grain',
    'crosslinking': 'link',
    'immunopeptidomics': 'vaccines',
    'metaproteomics': 'diversity_3',
    'olink': 'hub',
    'somascan': 'developer_board',
  };
  return iconMap[templateId] || 'category';
}

/**
 * Get display name for a template.
 */
export function getTemplateDisplayName(templateId: string): string {
  const nameMap: Record<string, string> = {
    'human': 'Human Samples',
    'cell-lines': 'Cell Lines',
    'vertebrates': 'Vertebrates (Non-Human)',
    'invertebrates': 'Invertebrates',
    'plants': 'Plants',
    'ms-proteomics': 'MS Proteomics',
    'affinity-proteomics': 'Affinity Proteomics',
    'dda-acquisition': 'DDA Acquisition',
    'dia-acquisition': 'DIA Acquisition',
    'single-cell': 'Single Cell',
    'crosslinking': 'Crosslinking (XL-MS)',
    'immunopeptidomics': 'Immunopeptidomics',
    'metaproteomics': 'Metaproteomics',
    'olink': 'Olink',
    'somascan': 'SomaScan',
  };
  return nameMap[templateId] || templateId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
