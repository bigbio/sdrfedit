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
 * A requirement constraint from templates.yaml (requires:).
 */
export interface TemplateRequirement {
  /** Required layer (e.g. "sample", "technology") */
  layer?: TemplateLayer;
  /** Required specific template name */
  template?: string;
}

/**
 * Exclusion constraints from templates.yaml (excludes:).
 */
export interface TemplateExclusions {
  /** Template names that cannot be combined with this one */
  templates?: string[];
}

/**
 * Selection used for combination validation.
 */
export interface TemplateSelection {
  technologyTemplate: string | null;
  sampleTemplate: string | null;
  experimentTemplates: string[];
}

/**
 * Result of combination validation.
 */
export interface TemplateCombinationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

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
  /** Layer/template requirements for combination */
  requires?: TemplateRequirement[];
  /** Templates that cannot be combined with this one */
  excludes?: TemplateExclusions;
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
  /** Combination requirements */
  requires?: TemplateRequirement[];
  /** Exclusion constraints */
  excludes?: TemplateExclusions;
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
  /** Combination requirements */
  requires?: TemplateRequirement[];
  /** Exclusion constraints */
  excludes?: TemplateExclusions;
  /** Icon for UI (derived from template name) */
  icon?: string;
  /** Status */
  status?: 'stable' | 'development';
  /** Latest version from manifest when available */
  version?: string;
}

/**
 * Parse requires array from YAML.
 */
export function parseTemplateRequires(raw: unknown): TemplateRequirement[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  return raw.map((item: any) => ({
    layer: item?.layer || undefined,
    template: item?.template || undefined,
  }));
}

/**
 * Parse excludes object from YAML.
 */
export function parseTemplateExcludes(raw: unknown): TemplateExclusions | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const templates = (raw as any).templates;
  if (!Array.isArray(templates) || templates.length === 0) return undefined;
  return { templates: templates.map(String) };
}

/**
 * Whether a template is considered development / unstable for UI folding.
 */
export function isDevelopmentTemplate(info: Pick<TemplateInfo, 'id' | 'status' | 'version'>): boolean {
  if (info.status === 'development') return true;
  const version = info.version || '';
  return version.includes('dev') || info.id.includes('metabolomics');
}

/**
 * Parse parent template id from extends field.
 * Official YAML uses forms like "sample-metadata@>=1.0.0" or plain "ms-proteomics".
 */
export function parseExtendsTemplateName(extendsValue: string | null | undefined): string | null {
  if (!extendsValue) return null;
  const trimmed = extendsValue.trim();
  if (!trimmed) return null;
  const at = trimmed.indexOf('@');
  return at >= 0 ? trimmed.slice(0, at) : trimmed;
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
    requires: parseTemplateRequires(yaml.requires),
    excludes: parseTemplateExcludes(yaml.excludes),
    mutuallyExclusiveWith: yaml.mutually_exclusive_with,
    status: yaml.status,
    validators: Array.isArray(yaml.validators)
      ? yaml.validators.map((v: any) => convertYamlToValidator(v))
      : undefined,
    columns: Array.isArray(yaml.columns)
      ? yaml.columns.map((c: any) => convertYamlToColumn(c))
      : [],
  };
}

/**
 * Convert YAML column to TemplateColumn.
 */
function convertYamlToColumn(yaml: any): TemplateColumn {
  return {
    name: yaml.name,
    description: yaml.description || '',
    requirement: yaml.requirement || 'optional',
    allowNotApplicable: yaml.allow_not_applicable,
    allowNotAvailable: yaml.allow_not_available,
    allowAnonymized: yaml.allow_anonymized,
    allowPooled: yaml.allow_pooled,
    cardinality: yaml.cardinality,
    type: yaml.type,
    validators: Array.isArray(yaml.validators)
      ? yaml.validators.map((v: any) => convertYamlToValidator(v))
      : undefined,
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
    human: 'person',
    'cell-lines': 'science',
    vertebrates: 'pets',
    invertebrates: 'bug_report',
    plants: 'eco',
    'ms-proteomics': 'analytics',
    'affinity-proteomics': 'biotech',
    'ms-metabolomics': 'science',
    'dia-acquisition': 'assessment',
    'single-cell': 'grain',
    crosslinking: 'link',
    immunopeptidomics: 'vaccines',
    metaproteomics: 'diversity_3',
    'clinical-metadata': 'medical_services',
    'oncology-metadata': 'coronavirus',
    'human-gut': 'accessibility',
    soil: 'landscape',
    water: 'water_drop',
    'lc-ms-metabolomics': 'biotech',
    'gc-ms-metabolomics': 'biotech',
    olink: 'hub',
    somascan: 'developer_board',
  };
  return iconMap[templateId] || 'category';
}

/**
 * Emoji used on wizard template cards.
 */
export function getTemplateEmoji(templateId: string): string {
  const emojiMap: Record<string, string> = {
    human: '🧑',
    'cell-lines': '🧫',
    vertebrates: '🐁',
    invertebrates: '🪲',
    plants: '🌱',
    'ms-proteomics': '📊',
    'affinity-proteomics': '🧪',
    'ms-metabolomics': '⚗️',
    'dia-acquisition': '📈',
    'single-cell': '🧬',
    crosslinking: '🔗',
    immunopeptidomics: '💉',
    metaproteomics: '🦠',
    'clinical-metadata': '🏥',
    'oncology-metadata': '🎗️',
    'human-gut': '🫁',
    soil: '🪴',
    water: '💧',
    'lc-ms-metabolomics': '⚗️',
    'gc-ms-metabolomics': '⚗️',
    olink: '🧪',
    somascan: '🧪',
  };
  return emojiMap[templateId] || '📋';
}

/**
 * Short card blurb for the wizard (keeps UI readable).
 */
export function getTemplateShortDescription(templateId: string): string {
  const descMap: Record<string, string> = {
    'ms-proteomics': 'Mass spectrometry proteomics (DDA, DIA, PRM, SRM).',
    'affinity-proteomics': 'Protein assays such as Olink and SomaScan.',
    'ms-metabolomics': 'Mass spectrometry metabolomics (development).',
    human: 'Human clinical or patient-derived samples.',
    vertebrates: 'Non-human vertebrates (mouse, rat, zebrafish, …).',
    invertebrates: 'Invertebrates (Drosophila, C. elegans, insects, …).',
    plants: 'Plant samples (Arabidopsis, crops, …).',
    'clinical-metadata': 'Treatment, demographics, and lifestyle metadata.',
    'oncology-metadata': 'Tumor staging, grading, and oncology outcomes.',
    metaproteomics: 'Microbial community / metaproteomics samples.',
    'human-gut': 'Human gut metaproteomics (MIxS human-gut).',
    soil: 'Soil metaproteomics with environment metadata.',
    water: 'Water / aquatic metaproteomics samples.',
    'cell-lines': 'Cultured cell lines (HeLa, HEK293, …).',
    'dia-acquisition': 'DIA-specific acquisition columns.',
    'single-cell': 'Single-cell proteomics (SCP) columns.',
    immunopeptidomics: 'MHC / HLA immunopeptidomics columns.',
    crosslinking: 'Crosslinking MS (XL-MS) columns.',
    'lc-ms-metabolomics': 'LC-MS metabolomics add-on columns.',
    'gc-ms-metabolomics': 'GC-MS metabolomics add-on columns.',
  };
  return descMap[templateId] || '';
}

/**
 * Display order within each layer — more common templates first.
 * Lower number = earlier. Unknown templates sort after known ones.
 */
export function getTemplateSortOrder(templateId: string): number {
  const order: Record<string, number> = {
    // technology
    'ms-proteomics': 10,
    'affinity-proteomics': 20,
    'ms-metabolomics': 30,
    // sample
    human: 10,
    vertebrates: 20,
    plants: 30,
    invertebrates: 40,
    'clinical-metadata': 50,
    'oncology-metadata': 60,
    metaproteomics: 70,
    'human-gut': 80,
    soil: 90,
    water: 100,
    // experiment
    'cell-lines': 10,
    'dia-acquisition': 20,
    'single-cell': 30,
    immunopeptidomics: 40,
    crosslinking: 50,
    'lc-ms-metabolomics': 60,
    'gc-ms-metabolomics': 70,
  };
  return order[templateId] ?? 1000;
}

/**
 * Get display name for a template.
 */
export function getTemplateDisplayName(templateId: string): string {
  const nameMap: Record<string, string> = {
    human: 'Human Samples',
    'cell-lines': 'Cell Lines',
    vertebrates: 'Vertebrates (Non-Human)',
    invertebrates: 'Invertebrates',
    plants: 'Plants',
    'ms-proteomics': 'MS Proteomics',
    'affinity-proteomics': 'Affinity Proteomics',
    'ms-metabolomics': 'MS Metabolomics',
    'dia-acquisition': 'DIA Acquisition',
    'single-cell': 'Single Cell',
    crosslinking: 'Crosslinking (XL-MS)',
    immunopeptidomics: 'Immunopeptidomics',
    metaproteomics: 'Metaproteomics',
    'clinical-metadata': 'Clinical Metadata',
    'oncology-metadata': 'Oncology Metadata',
    'human-gut': 'Human Gut Metaproteomics',
    soil: 'Soil Metaproteomics',
    water: 'Water Metaproteomics',
    'lc-ms-metabolomics': 'LC-MS Metabolomics',
    'gc-ms-metabolomics': 'GC-MS Metabolomics',
    olink: 'Olink',
    somascan: 'SomaScan',
  };
  return nameMap[templateId] || templateId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
