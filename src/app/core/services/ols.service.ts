/**
 * Direct OLS Service
 *
 * Provides direct browser-based access to the EBI Ontology Lookup Service (OLS) API.
 * Replaces the backend proxy at /ontology/search/suggest/
 *
 * EBI OLS API: https://www.ebi.ac.uk/ols4/api/
 */

import {
  OntologySuggestion,
  OntologySearchParams,
  OntologySearchResponse,
} from '../models/ontology';

/**
 * Configuration for the OLS service.
 */
export interface OlsServiceConfig {
  /** Base URL for OLS API */
  baseUrl?: string;

  /** Default number of results to return */
  defaultRows?: number;

  /** Cache TTL in milliseconds */
  cacheTtlMs?: number;

  /** Request timeout in milliseconds */
  timeoutMs?: number;

  /** Whether to enable caching */
  enableCache?: boolean;
}

/**
 * Cache entry with TTL.
 */
interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

const DEFAULT_CONFIG: OlsServiceConfig = {
  baseUrl: 'https://www.ebi.ac.uk/ols4/api',
  defaultRows: 10,
  cacheTtlMs: 5 * 60 * 1000, // 5 minutes
  timeoutMs: 10000, // 10 seconds
  enableCache: true,
};

/**
 * Direct OLS Service
 *
 * Provides search functionality for ontology terms directly from the browser.
 */
export class DirectOlsService {
  private config: OlsServiceConfig;
  private cache = new Map<string, CacheEntry<OntologySuggestion[]>>();

  constructor(config: OlsServiceConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Searches for ontology terms.
   *
   * @param params Search parameters
   * @returns Promise with search results
   */
  async search(params: OntologySearchParams): Promise<OntologySearchResponse> {
    const query = params.query?.trim() || '';

    if (query.length < 2) {
      return {
        suggestions: [],
        totalCount: 0,
        hasMore: false,
        query,
        ontologies: params.ontology || [],
      };
    }

    // Check cache
    const cacheKey = this.getCacheKey(params);
    if (this.config.enableCache) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return {
          suggestions: cached,
          totalCount: cached.length,
          hasMore: cached.length >= (params.rows || this.config.defaultRows!),
          query,
          ontologies: params.ontology || [],
        };
      }
    }

    try {
      const url = this.buildSearchUrl(params);
      const response = await this.fetchWithTimeout(url);

      if (!response.ok) {
        throw new Error(`OLS API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const suggestions = this.mapOlsResponse(data, params);

      // Cache results
      if (this.config.enableCache) {
        this.addToCache(cacheKey, suggestions);
      }

      return {
        suggestions,
        totalCount: data.response?.numFound || suggestions.length,
        hasMore: (data.response?.numFound || 0) > suggestions.length,
        query,
        ontologies: params.ontology || [],
      };
    } catch (error) {
      console.error('OLS search error:', error);
      return {
        suggestions: [],
        totalCount: 0,
        hasMore: false,
        query,
        ontologies: params.ontology || [],
      };
    }
  }

  /**
   * Searches for organisms (NCBI Taxonomy).
   */
  async searchOrganism(query: string, limit?: number): Promise<OntologySuggestion[]> {
    const response = await this.search({
      query,
      ontology: ['ncbitaxon'],
      rows: limit || 15,
    });
    return response.suggestions;
  }

  /**
   * Searches for diseases (EFO, MONDO, DOID).
   */
  async searchDisease(query: string, limit?: number): Promise<OntologySuggestion[]> {
    const response = await this.search({
      query,
      ontology: ['efo', 'mondo', 'doid'],
      rows: limit || 15,
    });
    return response.suggestions;
  }

  /**
   * Searches for cell types (CL, BTO).
   */
  async searchCellType(query: string, limit?: number): Promise<OntologySuggestion[]> {
    const response = await this.search({
      query,
      ontology: ['cl', 'bto'],
      rows: limit || 15,
    });
    return response.suggestions;
  }

  /**
   * Searches for tissues/anatomy (UBERON, BTO).
   */
  async searchTissue(query: string, limit?: number): Promise<OntologySuggestion[]> {
    const response = await this.search({
      query,
      ontology: ['uberon', 'bto'],
      rows: limit || 15,
    });
    return response.suggestions;
  }

  /**
   * Searches for instruments and MS terms (MS ontology).
   */
  async searchInstrument(query: string, limit?: number): Promise<OntologySuggestion[]> {
    const response = await this.search({
      query,
      ontology: ['ms'],
      rows: limit || 15,
    });
    return response.suggestions;
  }

  /**
   * Searches for PRIDE ontology terms.
   */
  async searchPride(query: string, limit?: number): Promise<OntologySuggestion[]> {
    const response = await this.search({
      query,
      ontology: ['pride'],
      rows: limit || 15,
    });
    return response.suggestions;
  }

  /**
   * Validates that a term exists in the specified ontologies.
   *
   * @param term The term label to validate
   * @param ontologies Ontologies to search in
   * @returns Whether the term was found
   */
  async validateTerm(term: string, ontologies: string[]): Promise<boolean> {
    if (!term || term.trim() === '') {
      return false;
    }

    const response = await this.search({
      query: term,
      ontology: ontologies,
      exact: true,
      rows: 1,
    });

    return response.suggestions.length > 0;
  }

  /**
   * Gets a term by its IRI.
   *
   * @param iri Full IRI of the term
   * @returns The term suggestion or null
   */
  async getTermByIri(iri: string): Promise<OntologySuggestion | null> {
    try {
      const encodedIri = encodeURIComponent(encodeURIComponent(iri));
      const url = `${this.config.baseUrl}/terms/${encodedIri}`;

      const response = await this.fetchWithTimeout(url);

      if (!response.ok) {
        return null;
      }

      const data = await response.json();

      return {
        id: data.obo_id || data.short_form || '',
        label: data.label || '',
        iri: data.iri || iri,
        ontologyPrefix: data.ontology_prefix || '',
        description: data.description?.[0] || '',
        synonyms: data.synonyms || [],
      };
    } catch {
      return null;
    }
  }

  /**
   * Clears the cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Gets cache statistics.
   */
  getCacheStats(): { size: number; entries: number } {
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += JSON.stringify(entry.value).length;
    }
    return {
      size: totalSize,
      entries: this.cache.size,
    };
  }

  // ============ Private Methods ============

  private buildSearchUrl(params: OntologySearchParams): string {
    const searchParams = new URLSearchParams();

    // Query
    searchParams.set('q', params.query);

    // Number of results
    searchParams.set('rows', String(params.rows || this.config.defaultRows));

    // Ontologies
    if (params.ontology && params.ontology.length > 0) {
      for (const ont of params.ontology) {
        searchParams.append('ontology', ont.toLowerCase());
      }
    }

    // Exact match
    if (params.exact) {
      searchParams.set('exact', 'true');
    }

    // Type filter
    if (params.type) {
      searchParams.set('type', params.type);
    }

    // Additional parameters for better results
    searchParams.set('fieldList', 'id,iri,short_form,obo_id,label,description,ontology_prefix,synonym');
    searchParams.set('queryFields', 'label,synonym,short_form,obo_id');
    searchParams.set('highlight', 'true');

    return `${this.config.baseUrl}/select?${searchParams.toString()}`;
  }

  private mapOlsResponse(
    data: any,
    params: OntologySearchParams
  ): OntologySuggestion[] {
    const docs = data.response?.docs || [];

    return docs.map((doc: any) => {
      const suggestion: OntologySuggestion = {
        id: doc.obo_id || doc.short_form || doc.id || '',
        label: doc.label || '',
        iri: doc.iri || '',
        ontologyPrefix: doc.ontology_prefix || '',
        description: doc.description?.[0] || '',
        synonyms: doc.synonym || [],
        isExactMatch:
          params.exact ||
          doc.label?.toLowerCase() === params.query.toLowerCase(),
      };

      return suggestion;
    });
  }

  private getCacheKey(params: OntologySearchParams): string {
    return JSON.stringify({
      query: params.query.toLowerCase(),
      ontology: params.ontology?.sort() || [],
      exact: params.exact || false,
      rows: params.rows || this.config.defaultRows,
      type: params.type,
    });
  }

  private getFromCache(key: string): OntologySuggestion[] | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.config.cacheTtlMs!) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  private addToCache(key: string, suggestions: OntologySuggestion[]): void {
    this.cache.set(key, {
      value: suggestions,
      timestamp: Date.now(),
    });

    // Limit cache size (simple LRU-ish behavior)
    if (this.cache.size > 1000) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs
    );

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// Export singleton instance for convenience
export const olsService = new DirectOlsService();
