/**
 * Suggestion State Service
 *
 * Centralized state management for all suggestions across sources.
 * Provides reactive views, staleness detection, and unified operations.
 */

import { Injectable, signal, computed, effect } from '@angular/core';
import {
  ActionableSuggestion,
  SuggestionStatus,
  SuggestionSource,
  ActionableSuggestionType,
  SuggestionSummary,
  createSuggestionSummary,
} from '../models/actionable-suggestion';
import { RecommendationConfidence } from '../models/llm';

/**
 * Filter criteria for suggestions.
 */
export interface SuggestionFilter {
  status?: SuggestionStatus[];
  source?: SuggestionSource[];
  type?: ActionableSuggestionType[];
  confidence?: RecommendationConfidence[];
  column?: string;
  olsValidatedOnly?: boolean;
  excludeStale?: boolean;
}

/**
 * Sort options for suggestions.
 */
export type SuggestionSortField =
  | 'timestamp'
  | 'confidence'
  | 'column'
  | 'type'
  | 'affectedSamples';

export interface SuggestionSort {
  field: SuggestionSortField;
  direction: 'asc' | 'desc';
}

/**
 * Injectable service for managing suggestion state.
 */
@Injectable({
  providedIn: 'root'
})
export class SuggestionStateService {
  // === Core State ===

  /** All suggestions */
  private readonly _suggestions = signal<ActionableSuggestion[]>([]);

  /** Current table state hash for staleness detection */
  private readonly _tableStateHash = signal<string>('');

  /** Current filter */
  private readonly _filter = signal<SuggestionFilter>({
    excludeStale: true,
    status: ['pending'],
  });

  /** Current sort */
  private readonly _sort = signal<SuggestionSort>({
    field: 'confidence',
    direction: 'desc',
  });

  // === Computed Views ===

  /** All suggestions (readonly) */
  readonly suggestions = this._suggestions.asReadonly();

  /** Current table state hash (readonly) */
  readonly tableStateHash = this._tableStateHash.asReadonly();

  /** Current filter (readonly) */
  readonly filter = this._filter.asReadonly();

  /** Current sort (readonly) */
  readonly sort = this._sort.asReadonly();

  /** Filtered suggestions based on current filter and sort */
  readonly filteredSuggestions = computed(() => {
    let result = this._suggestions();
    const filter = this._filter();
    const sort = this._sort();

    // Apply filters
    if (filter.status && filter.status.length > 0) {
      result = result.filter(s => filter.status!.includes(s.status));
    }

    if (filter.source && filter.source.length > 0) {
      result = result.filter(s => filter.source!.includes(s.source));
    }

    if (filter.type && filter.type.length > 0) {
      result = result.filter(s => filter.type!.includes(s.type));
    }

    if (filter.confidence && filter.confidence.length > 0) {
      result = result.filter(s => filter.confidence!.includes(s.confidence));
    }

    if (filter.column) {
      const columnLower = filter.column.toLowerCase();
      result = result.filter(s => s.column.toLowerCase().includes(columnLower));
    }

    if (filter.olsValidatedOnly) {
      result = result.filter(s => s.validation.olsValidated && s.validation.olsMatch);
    }

    if (filter.excludeStale) {
      result = result.filter(s => !s.validation.isStale);
    }

    // Apply sort
    result = [...result].sort((a, b) => {
      let comparison = 0;

      switch (sort.field) {
        case 'timestamp':
          comparison = a.timestamp.getTime() - b.timestamp.getTime();
          break;

        case 'confidence':
          const confOrder: Record<RecommendationConfidence, number> = {
            high: 3,
            medium: 2,
            low: 1,
          };
          comparison = confOrder[a.confidence] - confOrder[b.confidence];
          break;

        case 'column':
          comparison = a.column.localeCompare(b.column);
          break;

        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;

        case 'affectedSamples':
          comparison = a.affectedSamples.length - b.affectedSamples.length;
          break;
      }

      return sort.direction === 'desc' ? -comparison : comparison;
    });

    return result;
  });

  /** Pending suggestions only */
  readonly pendingSuggestions = computed(() =>
    this._suggestions().filter(s => s.status === 'pending' && !s.validation.isStale)
  );

  /** Applied suggestions */
  readonly appliedSuggestions = computed(() =>
    this._suggestions().filter(s => s.status === 'applied')
  );

  /** Dismissed suggestions */
  readonly dismissedSuggestions = computed(() =>
    this._suggestions().filter(s => s.status === 'dismissed')
  );

  /** Stale suggestions */
  readonly staleSuggestions = computed(() =>
    this._suggestions().filter(s => s.validation.isStale)
  );

  /** Suggestions grouped by column */
  readonly suggestionsByColumn = computed(() => {
    const map = new Map<string, ActionableSuggestion[]>();

    for (const s of this._suggestions()) {
      const existing = map.get(s.column) || [];
      existing.push(s);
      map.set(s.column, existing);
    }

    return map;
  });

  /** Suggestions grouped by type */
  readonly suggestionsByType = computed(() => {
    const map = new Map<ActionableSuggestionType, ActionableSuggestion[]>();

    for (const s of this._suggestions()) {
      const existing = map.get(s.type) || [];
      existing.push(s);
      map.set(s.type, existing);
    }

    return map;
  });

  /** Summary statistics */
  readonly summary = computed<SuggestionSummary>(() =>
    createSuggestionSummary(this._suggestions())
  );

  /** Whether there are any pending suggestions */
  readonly hasPendingSuggestions = computed(() =>
    this.pendingSuggestions().length > 0
  );

  /** High confidence suggestions (for quick apply) */
  readonly highConfidenceSuggestions = computed(() =>
    this._suggestions().filter(
      s => s.status === 'pending' &&
           s.confidence === 'high' &&
           !s.validation.isStale
    )
  );

  /** OLS-validated suggestions */
  readonly olsValidatedSuggestions = computed(() =>
    this._suggestions().filter(
      s => s.status === 'pending' &&
           s.validation.olsValidated &&
           s.validation.olsMatch &&
           !s.validation.isStale
    )
  );

  // === Public Methods ===

  /**
   * Adds new suggestions from a source.
   * Existing suggestions from the same source are replaced.
   */
  addSuggestions(
    suggestions: ActionableSuggestion[],
    source: SuggestionSource,
    replaceExisting: boolean = true
  ): void {
    this._suggestions.update(current => {
      let result = current;

      if (replaceExisting) {
        // Remove existing suggestions from this source
        result = result.filter(s => s.source !== source);
      }

      // Add new suggestions
      return [...result, ...suggestions];
    });
  }

  /**
   * Gets a suggestion by ID.
   */
  getSuggestionById(id: string): ActionableSuggestion | undefined {
    return this._suggestions().find(s => s.id === id);
  }

  /**
   * Gets suggestions for a specific cell.
   */
  getSuggestionsForCell(
    column: string,
    sampleIndex: number
  ): ActionableSuggestion[] {
    return this._suggestions().filter(
      s => s.column.toLowerCase() === column.toLowerCase() &&
           s.affectedSamples.includes(sampleIndex) &&
           s.status === 'pending' &&
           !s.validation.isStale
    );
  }

  /**
   * Gets suggestions for a specific column.
   */
  getSuggestionsForColumn(column: string): ActionableSuggestion[] {
    return this._suggestions().filter(
      s => s.column.toLowerCase() === column.toLowerCase() &&
           s.status === 'pending' &&
           !s.validation.isStale
    );
  }

  /**
   * Marks a suggestion as applied.
   */
  markAsApplied(id: string): void {
    this._suggestions.update(suggestions =>
      suggestions.map(s =>
        s.id === id ? { ...s, status: 'applied' as SuggestionStatus } : s
      )
    );
  }

  /**
   * Marks a suggestion as dismissed.
   */
  markAsDismissed(id: string): void {
    this._suggestions.update(suggestions =>
      suggestions.map(s =>
        s.id === id ? { ...s, status: 'dismissed' as SuggestionStatus } : s
      )
    );
  }

  /**
   * Marks multiple suggestions as applied.
   */
  markManyAsApplied(ids: string[]): void {
    const idSet = new Set(ids);
    this._suggestions.update(suggestions =>
      suggestions.map(s =>
        idSet.has(s.id) ? { ...s, status: 'applied' as SuggestionStatus } : s
      )
    );
  }

  /**
   * Marks multiple suggestions as dismissed.
   */
  markManyAsDismissed(ids: string[]): void {
    const idSet = new Set(ids);
    this._suggestions.update(suggestions =>
      suggestions.map(s =>
        idSet.has(s.id) ? { ...s, status: 'dismissed' as SuggestionStatus } : s
      )
    );
  }

  /**
   * Updates the table state hash and invalidates stale suggestions.
   */
  updateTableState(newHash: string): void {
    const oldHash = this._tableStateHash();

    if (newHash !== oldHash) {
      this._tableStateHash.set(newHash);

      // Mark suggestions with old hash as stale
      this._suggestions.update(suggestions =>
        suggestions.map(s => {
          if (s.validation.tableStateHash !== newHash && s.status === 'pending') {
            return {
              ...s,
              validation: {
                ...s.validation,
                isStale: true,
              },
            };
          }
          return s;
        })
      );
    }
  }

  /**
   * Invalidates all suggestions created before a specific hash.
   */
  invalidateStale(currentHash: string): void {
    this._suggestions.update(suggestions =>
      suggestions.map(s => {
        if (s.validation.tableStateHash !== currentHash) {
          return {
            ...s,
            validation: {
              ...s.validation,
              isStale: true,
            },
          };
        }
        return s;
      })
    );
  }

  /**
   * Removes all stale suggestions.
   */
  clearStale(): void {
    this._suggestions.update(suggestions =>
      suggestions.filter(s => !s.validation.isStale)
    );
  }

  /**
   * Removes all suggestions.
   */
  clearAll(): void {
    this._suggestions.set([]);
  }

  /**
   * Removes suggestions from a specific source.
   */
  clearBySource(source: SuggestionSource): void {
    this._suggestions.update(suggestions =>
      suggestions.filter(s => s.source !== source)
    );
  }

  /**
   * Updates the filter.
   */
  setFilter(filter: Partial<SuggestionFilter>): void {
    this._filter.update(current => ({ ...current, ...filter }));
  }

  /**
   * Resets the filter to default.
   */
  resetFilter(): void {
    this._filter.set({
      excludeStale: true,
      status: ['pending'],
    });
  }

  /**
   * Updates the sort.
   */
  setSort(sort: Partial<SuggestionSort>): void {
    this._sort.update(current => ({ ...current, ...sort }));
  }

  /**
   * Links a suggestion to a chat message.
   */
  linkToChatMessage(suggestionId: string, chatMessageId: string): void {
    this._suggestions.update(suggestions =>
      suggestions.map(s =>
        s.id === suggestionId
          ? { ...s, linkedChatMessageId: chatMessageId }
          : s
      )
    );
  }

  /**
   * Updates a suggestion's value (e.g., when user selects an OLS alternative).
   */
  updateSuggestionValue(
    id: string,
    newValue: string,
    ontologyId?: string,
    ontologyLabel?: string
  ): void {
    this._suggestions.update(suggestions =>
      suggestions.map(s => {
        if (s.id === id) {
          return {
            ...s,
            suggestedValue: newValue,
            ontologyId,
            ontologyLabel,
          };
        }
        return s;
      })
    );
  }

  /**
   * Restores a dismissed suggestion to pending.
   */
  restoreDismissed(id: string): void {
    this._suggestions.update(suggestions =>
      suggestions.map(s =>
        s.id === id && s.status === 'dismissed'
          ? { ...s, status: 'pending' as SuggestionStatus }
          : s
      )
    );
  }

  /**
   * Gets unique columns that have suggestions.
   */
  getColumnsWithSuggestions(): string[] {
    const columns = new Set<string>();
    for (const s of this.pendingSuggestions()) {
      columns.add(s.column);
    }
    return Array.from(columns).sort();
  }

  /**
   * Gets count of suggestions by column.
   */
  getSuggestionCountByColumn(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const s of this.pendingSuggestions()) {
      counts.set(s.column, (counts.get(s.column) || 0) + 1);
    }
    return counts;
  }
}

/**
 * Singleton instance for convenience in non-DI contexts.
 */
export const suggestionStateService = new SuggestionStateService();
