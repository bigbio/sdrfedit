/**
 * Unimod Service
 *
 * Provides modification autocomplete using bundled Unimod data.
 * Unimod is the standard database for protein modifications.
 *
 * Note: The bundled data should be pre-processed from unimod.org
 */

import { UnimodEntry, UnimodSpecification } from '../models/ontology';

// Re-export types for convenience
export type { UnimodEntry, UnimodSpecification } from '../models/ontology';

/**
 * Bundled Unimod database subset.
 * This is a commonly-used subset of modifications.
 * Full database can be loaded from unimod-data.json if bundled.
 */
const COMMON_MODIFICATIONS: UnimodEntry[] = [
  {
    accession: 'UNIMOD:4',
    name: 'Carbamidomethyl',
    deltaMonoMass: 57.021464,
    deltaComposition: 'H3C2NO',
    sites: ['C'],
    positions: ['Anywhere'],
    specifications: [
      { site: 'C', position: 'Anywhere', classification: 'Chemical derivatization', hidden: false },
    ],
  },
  {
    accession: 'UNIMOD:35',
    name: 'Oxidation',
    deltaMonoMass: 15.994915,
    deltaComposition: 'O',
    sites: ['M', 'W', 'H', 'C', 'P', 'F', 'Y'],
    positions: ['Anywhere'],
    specifications: [
      { site: 'M', position: 'Anywhere', classification: 'Post-translational', hidden: false },
      { site: 'W', position: 'Anywhere', classification: 'Post-translational', hidden: false },
      { site: 'H', position: 'Anywhere', classification: 'Post-translational', hidden: true },
    ],
  },
  {
    accession: 'UNIMOD:1',
    name: 'Acetyl',
    deltaMonoMass: 42.010565,
    deltaComposition: 'H2C2O',
    sites: ['K', 'N-term'],
    positions: ['Protein N-term', 'Any N-term', 'Anywhere'],
    specifications: [
      { site: 'K', position: 'Anywhere', classification: 'Post-translational', hidden: false },
      { site: 'N-term', position: 'Protein N-term', classification: 'Post-translational', hidden: false },
    ],
  },
  {
    accession: 'UNIMOD:21',
    name: 'Phospho',
    deltaMonoMass: 79.966331,
    deltaComposition: 'HO3P',
    sites: ['S', 'T', 'Y', 'H', 'D'],
    positions: ['Anywhere'],
    specifications: [
      { site: 'S', position: 'Anywhere', classification: 'Post-translational', hidden: false },
      { site: 'T', position: 'Anywhere', classification: 'Post-translational', hidden: false },
      { site: 'Y', position: 'Anywhere', classification: 'Post-translational', hidden: false },
    ],
  },
  {
    accession: 'UNIMOD:7',
    name: 'Deamidated',
    deltaMonoMass: 0.984016,
    deltaComposition: 'H-1NO',
    sites: ['N', 'Q'],
    positions: ['Anywhere'],
    specifications: [
      { site: 'N', position: 'Anywhere', classification: 'Post-translational', hidden: false },
      { site: 'Q', position: 'Anywhere', classification: 'Post-translational', hidden: false },
    ],
  },
  {
    accession: 'UNIMOD:121',
    name: 'GlyGly',
    deltaMonoMass: 114.042927,
    deltaComposition: 'H6C4N2O2',
    sites: ['K'],
    positions: ['Anywhere'],
    specifications: [
      { site: 'K', position: 'Anywhere', classification: 'Post-translational', hidden: false },
    ],
  },
  {
    accession: 'UNIMOD:36',
    name: 'Dimethyl',
    deltaMonoMass: 28.0313,
    deltaComposition: 'H4C2',
    sites: ['K', 'N-term', 'R'],
    positions: ['Anywhere', 'Any N-term'],
    specifications: [
      { site: 'K', position: 'Anywhere', classification: 'Chemical derivatization', hidden: false },
      { site: 'N-term', position: 'Any N-term', classification: 'Chemical derivatization', hidden: false },
    ],
  },
  {
    accession: 'UNIMOD:34',
    name: 'Methyl',
    deltaMonoMass: 14.01565,
    deltaComposition: 'H2C',
    sites: ['K', 'R', 'E', 'D', 'C', 'H', 'S'],
    positions: ['Anywhere'],
    specifications: [
      { site: 'K', position: 'Anywhere', classification: 'Post-translational', hidden: false },
      { site: 'R', position: 'Anywhere', classification: 'Post-translational', hidden: false },
    ],
  },
  {
    accession: 'UNIMOD:5',
    name: 'Carbamyl',
    deltaMonoMass: 43.005814,
    deltaComposition: 'HCNO',
    sites: ['K', 'N-term', 'R', 'C', 'M'],
    positions: ['Anywhere', 'Any N-term'],
    specifications: [
      { site: 'K', position: 'Anywhere', classification: 'Artefact', hidden: false },
      { site: 'N-term', position: 'Any N-term', classification: 'Artefact', hidden: false },
    ],
  },
  {
    accession: 'UNIMOD:737',
    name: 'TMT6plex',
    deltaMonoMass: 229.162932,
    deltaComposition: 'H20C12N2O2',
    sites: ['K', 'N-term'],
    positions: ['Anywhere', 'Any N-term'],
    specifications: [
      { site: 'K', position: 'Anywhere', classification: 'Chemical derivatization', hidden: false },
      { site: 'N-term', position: 'Any N-term', classification: 'Chemical derivatization', hidden: false },
    ],
  },
  {
    accession: 'UNIMOD:2016',
    name: 'TMTpro',
    deltaMonoMass: 304.207146,
    deltaComposition: 'H25C15N3O3',
    sites: ['K', 'N-term'],
    positions: ['Anywhere', 'Any N-term'],
    specifications: [
      { site: 'K', position: 'Anywhere', classification: 'Chemical derivatization', hidden: false },
      { site: 'N-term', position: 'Any N-term', classification: 'Chemical derivatization', hidden: false },
    ],
  },
  {
    accession: 'UNIMOD:214',
    name: 'iTRAQ4plex',
    deltaMonoMass: 144.102063,
    deltaComposition: 'H12C4C*3N2O',
    sites: ['K', 'N-term', 'Y'],
    positions: ['Anywhere', 'Any N-term'],
    specifications: [
      { site: 'K', position: 'Anywhere', classification: 'Chemical derivatization', hidden: false },
      { site: 'N-term', position: 'Any N-term', classification: 'Chemical derivatization', hidden: false },
    ],
  },
  {
    accession: 'UNIMOD:730',
    name: 'Label:13C(6)15N(2)',
    deltaMonoMass: 8.014199,
    deltaComposition: 'C*6N*2C-6N-2',
    sites: ['K'],
    positions: ['Anywhere'],
    specifications: [
      { site: 'K', position: 'Anywhere', classification: 'Isotopic label', hidden: false },
    ],
  },
  {
    accession: 'UNIMOD:259',
    name: 'Label:13C(6)15N(4)',
    deltaMonoMass: 10.008269,
    deltaComposition: 'C*6N*4C-6N-4',
    sites: ['R'],
    positions: ['Anywhere'],
    specifications: [
      { site: 'R', position: 'Anywhere', classification: 'Isotopic label', hidden: false },
    ],
  },
  {
    accession: 'UNIMOD:188',
    name: 'Label:13C(6)',
    deltaMonoMass: 6.020129,
    deltaComposition: 'C*6C-6',
    sites: ['K', 'R', 'L', 'I'],
    positions: ['Anywhere'],
    specifications: [
      { site: 'K', position: 'Anywhere', classification: 'Isotopic label', hidden: false },
      { site: 'R', position: 'Anywhere', classification: 'Isotopic label', hidden: false },
    ],
  },
  {
    accession: 'UNIMOD:267',
    name: 'Pyro-carbamidomethyl',
    deltaMonoMass: 39.994915,
    deltaComposition: 'C2H2NO-H2O',
    sites: ['C'],
    positions: ['N-term'],
    specifications: [
      { site: 'C', position: 'Any N-term', classification: 'Post-translational', hidden: false },
    ],
  },
  {
    accession: 'UNIMOD:27',
    name: 'Gln->pyro-Glu',
    deltaMonoMass: -17.026549,
    deltaComposition: 'H-3N-1',
    sites: ['Q'],
    positions: ['N-term'],
    specifications: [
      { site: 'Q', position: 'Any N-term', classification: 'Post-translational', hidden: false },
    ],
  },
  {
    accession: 'UNIMOD:28',
    name: 'Glu->pyro-Glu',
    deltaMonoMass: -18.010565,
    deltaComposition: 'H-2O-1',
    sites: ['E'],
    positions: ['N-term'],
    specifications: [
      { site: 'E', position: 'Any N-term', classification: 'Post-translational', hidden: false },
    ],
  },
];

/**
 * Unimod Service
 *
 * Provides modification search and lookup functionality.
 */
export class UnimodService {
  private modifications: Map<string, UnimodEntry> = new Map();
  private modificationsByName: Map<string, UnimodEntry> = new Map();
  private loaded = false;
  private loadPromise: Promise<void> | null = null;

  /**
   * Loads the modification database.
   * Call this before searching to ensure data is available.
   */
  async loadDatabase(): Promise<void> {
    if (this.loaded) {
      return;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = this.doLoad();
    return this.loadPromise;
  }

  private async doLoad(): Promise<void> {
    // Start with common modifications
    for (const mod of COMMON_MODIFICATIONS) {
      this.modifications.set(mod.accession, mod);
      this.modificationsByName.set(mod.name.toLowerCase(), mod);
    }

    // Try to load extended database if available
    try {
      // This would be replaced with actual dynamic import
      // const extendedData = await import('../data/unimod-data.json');
      // for (const mod of extendedData.modifications) {
      //   this.modifications.set(mod.accession, mod);
      //   this.modificationsByName.set(mod.name.toLowerCase(), mod);
      // }
    } catch {
      // Extended data not available, use common modifications only
    }

    this.loaded = true;
  }

  /**
   * Searches for modifications by name or accession.
   *
   * @param query Search query
   * @param limit Maximum results
   * @returns Matching modifications
   */
  async searchModifications(query: string, limit: number = 10): Promise<UnimodEntry[]> {
    await this.loadDatabase();

    if (!query || query.trim() === '') {
      return [];
    }

    const queryLower = query.toLowerCase().trim();
    const results: UnimodEntry[] = [];
    const seen = new Set<string>();

    // Exact matches first
    for (const mod of this.modifications.values()) {
      if (seen.has(mod.accession)) continue;

      if (
        mod.name.toLowerCase() === queryLower ||
        mod.accession.toLowerCase() === queryLower
      ) {
        results.push(mod);
        seen.add(mod.accession);
      }

      if (results.length >= limit) break;
    }

    // Then prefix matches
    if (results.length < limit) {
      for (const mod of this.modifications.values()) {
        if (seen.has(mod.accession)) continue;

        if (
          mod.name.toLowerCase().startsWith(queryLower) ||
          mod.accession.toLowerCase().startsWith(queryLower)
        ) {
          results.push(mod);
          seen.add(mod.accession);
        }

        if (results.length >= limit) break;
      }
    }

    // Then contains matches
    if (results.length < limit) {
      for (const mod of this.modifications.values()) {
        if (seen.has(mod.accession)) continue;

        if (
          mod.name.toLowerCase().includes(queryLower) ||
          mod.accession.toLowerCase().includes(queryLower)
        ) {
          results.push(mod);
          seen.add(mod.accession);
        }

        if (results.length >= limit) break;
      }
    }

    return results;
  }

  /**
   * Gets a modification by accession.
   *
   * @param accession Unimod accession (e.g., "UNIMOD:35")
   * @returns The modification or undefined
   */
  async getByAccession(accession: string): Promise<UnimodEntry | undefined> {
    await this.loadDatabase();

    // Normalize accession
    let normalized = accession.toUpperCase();
    if (!normalized.startsWith('UNIMOD:')) {
      normalized = `UNIMOD:${normalized}`;
    }

    return this.modifications.get(normalized);
  }

  /**
   * Gets a modification by name.
   *
   * @param name Modification name (e.g., "Oxidation")
   * @returns The modification or undefined
   */
  async getByName(name: string): Promise<UnimodEntry | undefined> {
    await this.loadDatabase();
    return this.modificationsByName.get(name.toLowerCase());
  }

  /**
   * Gets all modifications for a specific amino acid site.
   *
   * @param site Amino acid (e.g., "M", "K")
   * @param limit Maximum results
   * @returns Modifications that can occur at this site
   */
  async getModificationsForSite(site: string, limit: number = 50): Promise<UnimodEntry[]> {
    await this.loadDatabase();

    const siteUpper = site.toUpperCase();
    const results: UnimodEntry[] = [];

    for (const mod of this.modifications.values()) {
      if (mod.sites.includes(siteUpper)) {
        results.push(mod);
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  /**
   * Gets all loaded modifications.
   */
  async getAllModifications(): Promise<UnimodEntry[]> {
    await this.loadDatabase();
    return Array.from(this.modifications.values());
  }

  /**
   * Gets the total count of loaded modifications.
   */
  async getCount(): Promise<number> {
    await this.loadDatabase();
    return this.modifications.size;
  }

  /**
   * Formats a modification for SDRF output.
   *
   * @param mod The modification entry
   * @param targetAminoAcid Target amino acid
   * @param modType Modification type (Fixed/Variable)
   * @returns Formatted SDRF string
   */
  formatForSdrf(
    mod: UnimodEntry,
    targetAminoAcid: string,
    modType: 'Fixed' | 'Variable' | 'Annotated' = 'Variable'
  ): string {
    const parts = [
      `NT=${mod.name}`,
      `TA=${targetAminoAcid}`,
      `MT=${modType}`,
      `AC=${mod.accession}`,
    ];

    return parts.join(';');
  }

  /**
   * Validates a modification accession.
   *
   * @param accession Accession to validate
   * @returns Whether the accession is valid
   */
  async isValidAccession(accession: string): Promise<boolean> {
    const mod = await this.getByAccession(accession);
    return mod !== undefined;
  }
}

// Export singleton instance for convenience
export const unimodService = new UnimodService();
