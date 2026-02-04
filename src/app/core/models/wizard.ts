/**
 * SDRF Creation Wizard Models
 *
 * Types and interfaces for the wizard state and data structures.
 */

// ============ Template Types ============

/**
 * Template type - now dynamic string for API-driven templates.
 * Legacy values: 'human', 'cell-line', 'vertebrate', 'other'
 * New values from API: 'human', 'cell-lines', 'vertebrates', 'ms-proteomics', etc.
 */
export type WizardTemplate = string;

/**
 * Legacy template type for backward compatibility.
 */
export type LegacyWizardTemplate = 'human' | 'cell-line' | 'vertebrate' | 'other';

/**
 * Template information for display (legacy format).
 */
export interface TemplateInfo {
  id: WizardTemplate;
  name: string;
  description: string;
  icon: string;
  examples: string[];
}

/**
 * Map legacy template IDs to new ones.
 */
export function mapLegacyTemplateId(id: string): string {
  const mapping: Record<string, string> = {
    'cell-line': 'cell-lines',
    'vertebrate': 'vertebrates',
  };
  return mapping[id] || id;
}

/**
 * Default templates for the wizard (fallback when API unavailable).
 */
export const WIZARD_TEMPLATES: TemplateInfo[] = [
  {
    id: 'human',
    name: 'Human Samples',
    description: 'Clinical samples, patient tissues, human-derived materials',
    icon: 'person',
    examples: ['Patient biopsies', 'Blood samples', 'Tumor tissues'],
  },
  {
    id: 'cell-lines',
    name: 'Cell Lines',
    description: 'Cultured cell lines (HeLa, HEK293, etc.)',
    icon: 'science',
    examples: ['HeLa cells', 'HEK293', 'MCF-7', 'A549'],
  },
  {
    id: 'vertebrates',
    name: 'Vertebrates (Non-Human)',
    description: 'Mouse, rat, zebrafish, and other vertebrate samples',
    icon: 'pets',
    examples: ['Mouse liver', 'Rat brain', 'Zebrafish embryo'],
  },
  {
    id: 'ms-proteomics',
    name: 'MS Proteomics',
    description: 'Mass spectrometry-based proteomics experiments',
    icon: 'analytics',
    examples: ['DDA', 'DIA', 'PRM', 'SRM'],
  },
];

/**
 * Check if template is a human-like template (requires age/sex fields).
 */
export function isHumanTemplate(templateId: string | null): boolean {
  return templateId === 'human';
}

/**
 * Check if template is a cell line template.
 */
export function isCellLineTemplate(templateId: string | null): boolean {
  return templateId === 'cell-line' || templateId === 'cell-lines';
}

/**
 * Check if template is a vertebrate template.
 */
export function isVertebrateTemplate(templateId: string | null): boolean {
  return templateId === 'vertebrate' || templateId === 'vertebrates';
}

// ============ Ontology Term ============

/**
 * An ontology term selected from OLS.
 */
export interface OntologyTerm {
  id: string;
  label: string;
  iri?: string;
  ontologyPrefix?: string;
  ontology?: string;
}

// ============ Sample Entry ============

/**
 * A single sample entry in the wizard.
 */
export interface WizardSampleEntry {
  /** 1-based index */
  index: number;
  /** Source name (unique identifier) */
  sourceName: string;
  /** Biological replicate number */
  biologicalReplicate: number;
  /** Sample-specific disease (if different from default) */
  disease?: OntologyTerm | string;
  /** Sample-specific age */
  age?: string;
  /** Sample-specific sex */
  sex?: 'male' | 'female' | 'not available';
  /** Sample-specific organism part (if different from default) */
  organismPart?: OntologyTerm;
  /** Sample-specific cell line */
  cellLine?: string;
  /** Custom characteristics */
  customCharacteristics?: Record<string, string>;
}

// ============ Label Types ============

/**
 * Common label types for mass spectrometry.
 */
export type LabelType =
  | 'label free sample'
  | 'TMT126' | 'TMT127N' | 'TMT127C' | 'TMT128N' | 'TMT128C' | 'TMT129N' | 'TMT129C' | 'TMT130N' | 'TMT130C' | 'TMT131' | 'TMT131C' | 'TMT132N' | 'TMT132C' | 'TMT133N' | 'TMT133C' | 'TMT134N' | 'TMT134C' | 'TMT135N'
  | 'iTRAQ4plex-114' | 'iTRAQ4plex-115' | 'iTRAQ4plex-116' | 'iTRAQ4plex-117'
  | 'iTRAQ8plex-113' | 'iTRAQ8plex-114' | 'iTRAQ8plex-115' | 'iTRAQ8plex-116' | 'iTRAQ8plex-117' | 'iTRAQ8plex-118' | 'iTRAQ8plex-119' | 'iTRAQ8plex-121'
  | 'SILAC light' | 'SILAC medium' | 'SILAC heavy'
  | 'custom';

/**
 * Label plex configuration.
 */
export interface LabelPlexConfig {
  id: string;
  name: string;
  labels: string[];
}

/**
 * Available label configurations.
 */
export const LABEL_CONFIGS: LabelPlexConfig[] = [
  { id: 'lf', name: 'Label-free (LFQ)', labels: ['label free sample'] },
  { id: 'tmt6', name: 'TMT 6-plex', labels: ['TMT126', 'TMT127N', 'TMT127C', 'TMT128N', 'TMT128C', 'TMT129N'] },
  { id: 'tmt10', name: 'TMT 10-plex', labels: ['TMT126', 'TMT127N', 'TMT127C', 'TMT128N', 'TMT128C', 'TMT129N', 'TMT129C', 'TMT130N', 'TMT130C', 'TMT131'] },
  { id: 'tmt11', name: 'TMT 11-plex', labels: ['TMT126', 'TMT127N', 'TMT127C', 'TMT128N', 'TMT128C', 'TMT129N', 'TMT129C', 'TMT130N', 'TMT130C', 'TMT131', 'TMT131C'] },
  { id: 'tmt16', name: 'TMT 16-plex', labels: ['TMT126', 'TMT127N', 'TMT127C', 'TMT128N', 'TMT128C', 'TMT129N', 'TMT129C', 'TMT130N', 'TMT130C', 'TMT131', 'TMT131C', 'TMT132N', 'TMT132C', 'TMT133N', 'TMT133C', 'TMT134N'] },
  { id: 'tmt18', name: 'TMT 18-plex', labels: ['TMT126', 'TMT127N', 'TMT127C', 'TMT128N', 'TMT128C', 'TMT129N', 'TMT129C', 'TMT130N', 'TMT130C', 'TMT131', 'TMT131C', 'TMT132N', 'TMT132C', 'TMT133N', 'TMT133C', 'TMT134N', 'TMT134C', 'TMT135N'] },
  { id: 'itraq4', name: 'iTRAQ 4-plex', labels: ['iTRAQ4plex-114', 'iTRAQ4plex-115', 'iTRAQ4plex-116', 'iTRAQ4plex-117'] },
  { id: 'itraq8', name: 'iTRAQ 8-plex', labels: ['iTRAQ8plex-113', 'iTRAQ8plex-114', 'iTRAQ8plex-115', 'iTRAQ8plex-116', 'iTRAQ8plex-117', 'iTRAQ8plex-118', 'iTRAQ8plex-119', 'iTRAQ8plex-121'] },
  { id: 'silac', name: 'SILAC', labels: ['SILAC light', 'SILAC medium', 'SILAC heavy'] },
];

// ============ Modification ============

/**
 * Position where a modification can occur.
 */
export type ModificationPosition = 'Anywhere' | 'Any N-term' | 'Protein N-term' | 'Any C-term' | 'Protein C-term';

/**
 * Available positions for modification selection.
 */
export const MODIFICATION_POSITIONS: { value: ModificationPosition; label: string }[] = [
  { value: 'Anywhere', label: 'Anywhere' },
  { value: 'Any N-term', label: 'Any N-term' },
  { value: 'Protein N-term', label: 'Protein N-term' },
  { value: 'Any C-term', label: 'Any C-term' },
  { value: 'Protein C-term', label: 'Protein C-term' },
];

/**
 * Common amino acids for modification target.
 */
export const AMINO_ACIDS = ['A', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'Y'];

/**
 * A protein modification configuration.
 */
export interface WizardModification {
  /** Name of the modification */
  name: string;
  /** Target amino acids (e.g., "C", "M", "S,T,Y") */
  targetAminoAcids: string;
  /** Modification type */
  type: 'fixed' | 'variable';
  /** Position (terminal/anywhere) */
  position: ModificationPosition;
  /** UNIMOD accession */
  unimodAccession?: string;
  /** Mass shift (delta mass) */
  deltaMass?: number;
}

/**
 * Common modifications with their details.
 */
export const COMMON_MODIFICATIONS: WizardModification[] = [
  { name: 'Carbamidomethyl', targetAminoAcids: 'C', type: 'fixed', position: 'Anywhere', unimodAccession: 'UNIMOD:4', deltaMass: 57.021464 },
  { name: 'Oxidation', targetAminoAcids: 'M', type: 'variable', position: 'Anywhere', unimodAccession: 'UNIMOD:35', deltaMass: 15.994915 },
  { name: 'Acetyl', targetAminoAcids: 'N-term', type: 'variable', position: 'Protein N-term', unimodAccession: 'UNIMOD:1', deltaMass: 42.010565 },
  { name: 'Phospho', targetAminoAcids: 'S,T,Y', type: 'variable', position: 'Anywhere', unimodAccession: 'UNIMOD:21', deltaMass: 79.966331 },
  { name: 'Deamidated', targetAminoAcids: 'N,Q', type: 'variable', position: 'Anywhere', unimodAccession: 'UNIMOD:7', deltaMass: 0.984016 },
  { name: 'TMT6plex', targetAminoAcids: 'K', type: 'fixed', position: 'Anywhere', unimodAccession: 'UNIMOD:737', deltaMass: 229.162932 },
  { name: 'TMT6plex', targetAminoAcids: 'N-term', type: 'fixed', position: 'Any N-term', unimodAccession: 'UNIMOD:737', deltaMass: 229.162932 },
  { name: 'TMTpro', targetAminoAcids: 'K', type: 'fixed', position: 'Anywhere', unimodAccession: 'UNIMOD:2016', deltaMass: 304.207146 },
  { name: 'TMTpro', targetAminoAcids: 'N-term', type: 'fixed', position: 'Any N-term', unimodAccession: 'UNIMOD:2016', deltaMass: 304.207146 },
  { name: 'GlyGly', targetAminoAcids: 'K', type: 'variable', position: 'Anywhere', unimodAccession: 'UNIMOD:121', deltaMass: 114.042927 },
];

// ============ Cleavage Agent ============

/**
 * A cleavage agent (enzyme) configuration.
 */
export interface WizardCleavageAgent {
  /** Name of the enzyme */
  name: string;
  /** MS ontology accession */
  msAccession: string;
}

/**
 * Common cleavage agents.
 */
export const COMMON_CLEAVAGE_AGENTS: WizardCleavageAgent[] = [
  { name: 'Trypsin', msAccession: 'MS:1001251' },
  { name: 'Trypsin/P', msAccession: 'MS:1001313' },
  { name: 'Lys-C', msAccession: 'MS:1001309' },
  { name: 'Chymotrypsin', msAccession: 'MS:1001306' },
  { name: 'Asp-N', msAccession: 'MS:1001304' },
  { name: 'Glu-C', msAccession: 'MS:1001917' },
  { name: 'Arg-C', msAccession: 'MS:1001303' },
  { name: 'No cleavage', msAccession: 'MS:1001955' },
];

// ============ Data File Entry ============

/**
 * A data file entry.
 */
export interface WizardDataFile {
  /** File name */
  fileName: string;
  /** Index of associated sample (1-based) */
  sampleIndex: number;
  /** Fraction identifier (if fractionated) */
  fractionId?: number;
  /** Technical replicate number */
  technicalReplicate?: number;
  /** Label (for multiplexed experiments) */
  label?: string;
}

// ============ Wizard State ============

/**
 * Dynamic column default value.
 */
export interface DynamicColumnDefault {
  /** Column name */
  columnName: string;
  /** Default value (applies to all samples unless overridden) */
  value: string;
  /** Ontology term if selected from autocomplete */
  ontologyTerm?: OntologyTerm;
}

/**
 * Complete wizard state.
 */
export interface WizardState {
  // Step 1: Experiment Setup
  template: WizardTemplate | null;
  sampleCount: number;
  experimentDescription: string;

  // Step 2: Sample Characteristics (shared defaults)
  organism: OntologyTerm | null;
  disease: OntologyTerm | string | null;  // string for "normal"
  organismPart: OntologyTerm | null;

  // Step 2: Human-specific
  defaultSex: 'male' | 'female' | 'not available' | null;
  defaultAge: string;

  // Step 2: Cell line-specific
  defaultCellLine: string;

  // Step 2: Vertebrate-specific
  strainBreed: string;
  developmentalStage: string;

  // Step 2: Dynamic column defaults from template
  dynamicColumnDefaults: DynamicColumnDefault[];

  // Step 3: Sample-specific values
  samples: WizardSampleEntry[];

  // Step 4: Technical Configuration
  labelConfigId: string;
  customLabels: string[];
  hasFractions: boolean;
  fractionCount: number;
  technicalReplicates: number;
  acquisitionMethod: 'dda' | 'dia';

  // Step 5: Instrument & Protocol
  instrument: OntologyTerm | null;
  cleavageAgent: WizardCleavageAgent | null;
  modifications: WizardModification[];

  // Step 6: Data Files
  fileNamingPattern: string;
  dataFiles: WizardDataFile[];
}

/**
 * Creates a default sample entry.
 */
export function createDefaultSample(index: number): WizardSampleEntry {
  return {
    index,
    sourceName: `sample_${index}`,
    biologicalReplicate: 1,
  };
}

/**
 * Creates an empty wizard state.
 */
export function createEmptyWizardState(): WizardState {
  return {
    // Step 1
    template: null,
    sampleCount: 1,
    experimentDescription: '',

    // Step 2 (shared)
    organism: null,
    disease: null,
    organismPart: null,

    // Step 2 (human)
    defaultSex: null,
    defaultAge: '',

    // Step 2 (cell line)
    defaultCellLine: '',

    // Step 2 (vertebrate)
    strainBreed: '',
    developmentalStage: '',

    // Step 2 (dynamic)
    dynamicColumnDefaults: [],

    // Step 3 - Initialize with one sample to match sampleCount
    samples: [createDefaultSample(1)],

    // Step 4
    labelConfigId: 'lf',
    customLabels: [],
    hasFractions: false,
    fractionCount: 1,
    technicalReplicates: 1,
    acquisitionMethod: 'dda',

    // Step 5
    instrument: null,
    cleavageAgent: null,
    modifications: [],

    // Step 6
    fileNamingPattern: '{sourceName}.raw',
    dataFiles: [],
  };
}

// ============ Step Configuration ============

/**
 * Wizard step configuration.
 */
export interface WizardStepConfig {
  id: string;
  title: string;
  description: string;
  isRequired: boolean;
}

/**
 * Wizard steps configuration.
 */
export const WIZARD_STEPS: WizardStepConfig[] = [
  { id: 'setup', title: 'Experiment Setup', description: 'Select template and number of samples', isRequired: true },
  { id: 'characteristics', title: 'Sample Characteristics', description: 'Define organism, disease, and tissue', isRequired: true },
  { id: 'samples', title: 'Sample Values', description: 'Enter sample-specific information', isRequired: true },
  { id: 'technical', title: 'Technical Config', description: 'Labels, fractions, and replicates', isRequired: true },
  { id: 'protocol', title: 'Instrument & Protocol', description: 'Instrument, enzyme, and modifications', isRequired: true },
  { id: 'files', title: 'Data Files', description: 'Map raw files to samples', isRequired: true },
  { id: 'review', title: 'Review & Create', description: 'Preview and generate SDRF', isRequired: true },
];
