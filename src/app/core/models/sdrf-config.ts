/**
 * SDRF Column Configuration
 *
 * Official SDRF-Proteomics column definitions based on specification v1.1.0.
 * Ported from cupcake-vanilla-ng: projects/cupcake-vanilla/src/lib/models/sdrf-config.ts
 */

import { ColumnType } from './sdrf-column';

/**
 * Categories for organizing SDRF columns in the UI.
 */
export type SdrfColumnCategory =
  | 'Core Sample Metadata'
  | 'Characteristics'
  | 'Assay Information'
  | 'Comments'
  | 'Modifications & Enzymes'
  | 'Mass Tolerances'
  | 'Technical Parameters'
  | 'Sample Preparation'
  | 'File & Project Information';

/**
 * Configuration for an SDRF column.
 */
export interface SdrfColumnConfig {
  /** Column name (e.g., "characteristics[organism]") */
  name: string;

  /** Column type */
  type: ColumnType;

  /** Human-readable description */
  description: string;

  /** Category for UI grouping */
  category?: SdrfColumnCategory;

  /** Whether this column is required per specification */
  isRequired?: boolean;

  /** Ontologies to use for validation */
  ontologies?: string[];

  /** Pattern for value validation (regex) */
  pattern?: string;

  /** Example values */
  examples?: string[];
}

/**
 * Official SDRF-Proteomics column configurations based on specification v1.1.0.
 */
export const OFFICIAL_SDRF_COLUMNS: SdrfColumnConfig[] = [
  // Core sample metadata
  {
    name: 'source name',
    type: 'source_name',
    description: 'Unique sample identifier',
    category: 'Core Sample Metadata',
    isRequired: true,
  },

  // Required characteristics
  {
    name: 'characteristics[organism]',
    type: 'characteristics',
    description: 'Organism of the sample',
    category: 'Characteristics',
    isRequired: true,
    ontologies: ['ncbitaxon'],
    examples: ['Homo sapiens', 'Mus musculus'],
  },
  {
    name: 'characteristics[disease]',
    type: 'characteristics',
    description: 'Disease under study',
    category: 'Characteristics',
    isRequired: true,
    ontologies: ['efo', 'mondo', 'doid'],
    examples: ['normal', 'breast cancer'],
  },
  {
    name: 'characteristics[organism part]',
    type: 'characteristics',
    description: 'Part of organism anatomy',
    category: 'Characteristics',
    isRequired: true,
    ontologies: ['uberon', 'bto'],
    examples: ['liver', 'brain', 'blood'],
  },
  {
    name: 'characteristics[cell type]',
    type: 'characteristics',
    description: 'Cell type',
    category: 'Characteristics',
    ontologies: ['cl', 'bto'],
    examples: ['T cell', 'hepatocyte'],
  },

  // Additional characteristics
  {
    name: 'characteristics[age]',
    type: 'characteristics',
    description: 'Age of the individual',
    category: 'Characteristics',
    pattern: '^(\\d+Y)?(\\d+M)?(\\d+D)?(-\\d+Y(\\d+M)?(\\d+D)?)?$|^not available$|^not applicable$',
    examples: ['30Y', '30Y6M', '25Y-35Y'],
  },
  {
    name: 'characteristics[sex]',
    type: 'characteristics',
    description: 'Biological sex',
    category: 'Characteristics',
    ontologies: ['pato'],
    examples: ['male', 'female'],
  },
  {
    name: 'characteristics[ancestry category]',
    type: 'characteristics',
    description: 'Ancestry or ethnicity',
    category: 'Characteristics',
    ontologies: ['hancestro'],
  },
  {
    name: 'characteristics[cell line]',
    type: 'characteristics',
    description: 'Cell line name',
    category: 'Characteristics',
    ontologies: ['clo', 'bto'],
    examples: ['HeLa', 'HEK293'],
  },
  {
    name: 'characteristics[enrichment process]',
    type: 'characteristics',
    description: 'Enrichment process applied',
    category: 'Characteristics',
  },
  {
    name: 'characteristics[pooled sample]',
    type: 'characteristics',
    description: 'Pooled sample indicator',
    category: 'Characteristics',
    examples: ['not pooled', 'pooled', 'SN=sample1,sample2'],
  },
  {
    name: 'characteristics[spiked compound]',
    type: 'characteristics',
    description: 'Spiked compound details',
    category: 'Characteristics',
    examples: ['SP=iRT;CT=peptide;QY=1fmol'],
  },
  {
    name: 'characteristics[synthetic peptide]',
    type: 'characteristics',
    description: 'Synthetic peptide indicator',
    category: 'Characteristics',
    examples: ['synthetic', 'not synthetic'],
  },
  {
    name: 'characteristics[individual]',
    type: 'characteristics',
    description: 'Patient/individual identifier',
    category: 'Characteristics',
  },
  {
    name: 'characteristics[biological replicate]',
    type: 'characteristics',
    description: 'Biological replicate number',
    category: 'Characteristics',
  },

  // Assay information
  {
    name: 'assay name',
    type: 'special',
    description: 'MS run identifier',
    category: 'Assay Information',
    isRequired: true,
  },
  {
    name: 'technology type',
    type: 'special',
    description: 'Technology used for data generation',
    category: 'Assay Information',
    isRequired: true,
    examples: ['proteomic profiling by mass spectrometry'],
  },

  // Required comment fields
  {
    name: 'comment[fraction identifier]',
    type: 'comment',
    description: 'Fraction number',
    category: 'Comments',
    examples: ['1', '2', '3'],
  },
  {
    name: 'comment[label]',
    type: 'comment',
    description: 'Label applied to sample',
    category: 'Comments',
    isRequired: true,
    ontologies: ['ms', 'pride'],
    examples: ['label free sample', 'TMT126', 'iTRAQ4plex-114'],
  },
  {
    name: 'comment[data file]',
    type: 'comment',
    description: 'Raw data file name',
    category: 'Comments',
    isRequired: true,
    examples: ['sample1.raw', 'sample1.mzML'],
  },
  {
    name: 'comment[instrument]',
    type: 'comment',
    description: 'Mass spectrometer model',
    category: 'Comments',
    isRequired: true,
    ontologies: ['ms'],
    examples: ['Orbitrap Fusion Lumos', 'Q Exactive HF'],
  },
  {
    name: 'comment[technical replicate]',
    type: 'comment',
    description: 'Technical replicate number',
    category: 'Comments',
    examples: ['1', '2'],
  },

  // Modification and enzyme information
  {
    name: 'comment[modification parameters]',
    type: 'comment',
    description: 'Protein modifications',
    category: 'Modifications & Enzymes',
    isRequired: true,
    ontologies: ['unimod'],
    examples: [
      'NT=Oxidation;MT=Variable;TA=M;AC=UNIMOD:35',
      'NT=Carbamidomethyl;TA=C;MT=fixed;AC=UNIMOD:4',
    ],
  },
  {
    name: 'comment[cleavage agent details]',
    type: 'comment',
    description: 'Digestion enzyme information',
    category: 'Modifications & Enzymes',
    isRequired: true,
    ontologies: ['ms'],
    examples: [
      'NT=Trypsin;AC=MS:1001251',
      'NT=Trypsin/P;AC=MS:1001313',
    ],
  },

  // Mass tolerances
  {
    name: 'comment[fragment mass tolerance]',
    type: 'comment',
    description: 'Fragment ion mass tolerance',
    category: 'Mass Tolerances',
    pattern: '^\\d+(\\.\\d+)?\\s*(ppm|Da)$|^not available$|^not applicable$',
    examples: ['20 ppm', '0.02 Da'],
  },
  {
    name: 'comment[precursor mass tolerance]',
    type: 'comment',
    description: 'Precursor ion mass tolerance',
    category: 'Mass Tolerances',
    pattern: '^\\d+(\\.\\d+)?\\s*(ppm|Da)$|^not available$|^not applicable$',
    examples: ['10 ppm', '20 ppm'],
  },

  // Technical parameters
  {
    name: 'comment[collision energy]',
    type: 'comment',
    description: 'Collision energy used',
    category: 'Technical Parameters',
    pattern: '^\\d+(\\.\\d+)?%? (NCE|eV)(;\\d+(\\.\\d+)?%? (NCE|eV))*$|^not available$',
    examples: ['30 NCE', '30% NCE', '27 eV', '25 NCE;27 NCE;30 NCE'],
  },
  {
    name: 'comment[dissociation method]',
    type: 'comment',
    description: 'Fragmentation method',
    category: 'Technical Parameters',
    ontologies: ['ms', 'pride'],
    examples: ['HCD', 'CID', 'ETD', 'EThcD'],
  },
  {
    name: 'comment[proteomics data acquisition method]',
    type: 'comment',
    description: 'DDA, DIA, etc.',
    category: 'Technical Parameters',
    ontologies: ['ms'],
    examples: ['Data-dependent acquisition', 'Data-independent acquisition'],
  },
  {
    name: 'comment[scan window lower limit]',
    type: 'comment',
    description: 'Lower m/z limit of DIA scan window',
    category: 'Technical Parameters',
    pattern: '^\\d+(\\.\\d+)?$',
    examples: ['400', '350.5'],
  },
  {
    name: 'comment[scan window upper limit]',
    type: 'comment',
    description: 'Upper m/z limit of DIA scan window',
    category: 'Technical Parameters',
    pattern: '^\\d+(\\.\\d+)?$',
    examples: ['1200', '1000.5'],
  },
  {
    name: 'comment[isolation window width]',
    type: 'comment',
    description: 'Width of the isolation window in m/z units',
    category: 'Technical Parameters',
    pattern: '^\\d+(\\.\\d+)?$',
    examples: ['25', '8', '4'],
  },
  {
    name: 'comment[MS2 mass analyzer]',
    type: 'comment',
    description: 'Mass analyzer used for MS2 acquisition',
    category: 'Technical Parameters',
    ontologies: ['ms'],
    examples: ['orbitrap', 'ion trap', 'TOF'],
  },

  // Sample preparation
  {
    name: 'comment[depletion]',
    type: 'comment',
    description: 'Depletion method applied',
    category: 'Sample Preparation',
  },
  {
    name: 'comment[reduction reagent]',
    type: 'comment',
    description: 'Reduction reagent used',
    category: 'Sample Preparation',
    examples: ['DTT', 'TCEP'],
  },
  {
    name: 'comment[alkylation reagent]',
    type: 'comment',
    description: 'Alkylation reagent used',
    category: 'Sample Preparation',
    examples: ['IAA', 'IAM', 'Chloroacetamide'],
  },
  {
    name: 'comment[fractionation method]',
    type: 'comment',
    description: 'Fractionation method',
    category: 'Sample Preparation',
    ontologies: ['pride'],
    examples: ['High-pH reversed-phase chromatography', 'SCX'],
  },

  // File and project information
  {
    name: 'comment[file uri]',
    type: 'comment',
    description: 'Public URI of the file',
    category: 'File & Project Information',
    examples: ['ftp://ftp.pride.ebi.ac.uk/pride/...'],
  },
  {
    name: 'comment[proteomexchange accession number]',
    type: 'comment',
    description: 'ProteomeXchange accession',
    category: 'File & Project Information',
    pattern: '^PXD\\d{6}$',
    examples: ['PXD000001'],
  },
];

/**
 * Get columns by category.
 */
export function getSdrfColumnsByCategory(
  category?: SdrfColumnCategory
): SdrfColumnConfig[] {
  if (!category) {
    return OFFICIAL_SDRF_COLUMNS;
  }
  return OFFICIAL_SDRF_COLUMNS.filter((col) => col.category === category);
}

/**
 * Get required columns.
 */
export function getRequiredSdrfColumns(): SdrfColumnConfig[] {
  return OFFICIAL_SDRF_COLUMNS.filter((col) => col.isRequired === true);
}

/**
 * Get column configuration by name (case-insensitive).
 */
export function getSdrfColumnConfig(name: string): SdrfColumnConfig | undefined {
  return OFFICIAL_SDRF_COLUMNS.find(
    (col) => col.name.toLowerCase() === name.toLowerCase()
  );
}

/**
 * Check if a column is required.
 */
export function isSdrfColumnRequired(name: string): boolean {
  const config = getSdrfColumnConfig(name);
  return config?.isRequired === true;
}

/**
 * Get the ontologies for a column.
 */
export function getColumnOntologies(name: string): string[] {
  const config = getSdrfColumnConfig(name);
  return config?.ontologies || [];
}

/**
 * Get all unique categories.
 */
export function getAllCategories(): SdrfColumnCategory[] {
  const categories = new Set<SdrfColumnCategory>();
  for (const col of OFFICIAL_SDRF_COLUMNS) {
    if (col.category) {
      categories.add(col.category);
    }
  }
  return Array.from(categories);
}
