/**
 * Ontology Models
 *
 * Types for ontology search and suggestions from EBI OLS API.
 */

/**
 * Common ontology types used in SDRF.
 */
export type OntologyType =
  | 'ncbitaxon'  // Organism taxonomy
  | 'efo'        // Experimental Factor Ontology (disease, etc.)
  | 'mondo'      // Mondo Disease Ontology
  | 'doid'       // Disease Ontology
  | 'cl'         // Cell Ontology
  | 'bto'        // BRENDA Tissue Ontology
  | 'uberon'     // Uber Anatomy Ontology
  | 'ms'         // Mass Spectrometry Ontology
  | 'pride'      // PRIDE Ontology
  | 'unimod'     // Unimod (modifications)
  | 'pato'       // Phenotype And Trait Ontology
  | 'hancestro'  // Human Ancestry Ontology
  | 'clo';       // Cell Line Ontology

/**
 * A suggestion from ontology search.
 */
export interface OntologySuggestion {
  /** Term ID/accession (e.g., "NCBITAXON:9606") */
  id: string;

  /** Human-readable label (e.g., "Homo sapiens") */
  label: string;

  /** Full IRI of the term */
  iri: string;

  /** Ontology prefix (e.g., "ncbitaxon") */
  ontologyPrefix: string;

  /** Term description */
  description?: string;

  /** Synonyms for the term */
  synonyms?: string[];

  /** Whether this is an exact match */
  isExactMatch?: boolean;
}

/**
 * Parameters for ontology search.
 */
export interface OntologySearchParams {
  /** Search query string */
  query: string;

  /** Ontologies to search (e.g., ['ncbitaxon', 'efo']) */
  ontology?: string[];

  /** Type of term to search for */
  type?: 'class' | 'property' | 'individual';

  /** Whether to require exact match */
  exact?: boolean;

  /** Maximum number of results */
  rows?: number;
}

/**
 * Response from ontology search.
 */
export interface OntologySearchResponse {
  /** Matching suggestions */
  suggestions: OntologySuggestion[];

  /** Total number of matches */
  totalCount: number;

  /** Whether there are more results */
  hasMore: boolean;

  /** Search query used */
  query: string;

  /** Ontologies searched */
  ontologies: string[];
}

/**
 * Unimod modification entry.
 */
export interface UnimodEntry {
  /** Accession (e.g., "UNIMOD:35") */
  accession: string;

  /** Name (e.g., "Oxidation") */
  name: string;

  /** Delta monoisotopic mass */
  deltaMonoMass: number;

  /** Delta average mass */
  deltaAvgMass?: number;

  /** Chemical composition delta (e.g., "O") */
  deltaComposition: string;

  /** Target amino acid sites */
  sites: string[];

  /** Allowed positions */
  positions: string[];

  /** Detailed specifications */
  specifications: UnimodSpecification[];
}

/**
 * Unimod specification for a modification.
 */
export interface UnimodSpecification {
  /** Target site (amino acid) */
  site: string;

  /** Position (e.g., "Anywhere", "Protein N-term") */
  position: string;

  /** Classification (e.g., "Post-translational") */
  classification: string;

  /** Whether this specification is hidden/deprecated */
  hidden: boolean;
}

/**
 * Maps ontology prefixes to their full names.
 */
export const ONTOLOGY_NAMES: Record<string, string> = {
  ncbitaxon: 'NCBI Taxonomy',
  efo: 'Experimental Factor Ontology',
  mondo: 'Mondo Disease Ontology',
  doid: 'Disease Ontology',
  cl: 'Cell Ontology',
  bto: 'BRENDA Tissue Ontology',
  uberon: 'Uber Anatomy Ontology',
  ms: 'Mass Spectrometry Ontology',
  pride: 'PRIDE Controlled Vocabulary',
  unimod: 'Unimod',
  pato: 'Phenotype And Trait Ontology',
  hancestro: 'Human Ancestry Ontology',
  clo: 'Cell Line Ontology',
};

/**
 * Gets the display name for an ontology.
 */
export function getOntologyDisplayName(prefix: string): string {
  return ONTOLOGY_NAMES[prefix.toLowerCase()] || prefix;
}

/**
 * Parses an ontology term ID into prefix and local ID.
 * Example: "NCBITAXON:9606" -> { prefix: "ncbitaxon", localId: "9606" }
 */
export function parseOntologyId(id: string): { prefix: string; localId: string } | null {
  const match = id.match(/^([A-Za-z_]+):(.+)$/);
  if (match) {
    return {
      prefix: match[1].toLowerCase(),
      localId: match[2],
    };
  }
  return null;
}

/**
 * Formats an ontology term for display.
 * Example: { label: "Homo sapiens", id: "NCBITAXON:9606" } -> "Homo sapiens (NCBITAXON:9606)"
 */
export function formatOntologyTerm(suggestion: OntologySuggestion): string {
  return `${suggestion.label} (${suggestion.id})`;
}
