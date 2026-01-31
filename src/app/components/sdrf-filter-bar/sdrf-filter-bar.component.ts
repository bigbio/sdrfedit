/**
 * SDRF Filter Bar Component
 *
 * Provides row filtering by column values.
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { SdrfTable } from '../../core/models/sdrf-table';
import { getValueForSample } from '../../core/models/sdrf-column';

/**
 * Filter condition
 */
export interface FilterCondition {
  columnIndex: number;
  columnName: string;
  operator: 'equals' | 'contains' | 'starts_with' | 'ends_with' | 'is_empty' | 'is_not_empty';
  value: string;
}

/**
 * Filter result
 */
export interface FilterResult {
  matchingIndices: number[];
  totalCount: number;
}

@Component({
  selector: 'sdrf-filter-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="filter-bar" [class.has-filters]="filters().length > 0">
      <div class="filter-controls">
        <select
          [(ngModel)]="newFilterColumn"
          class="filter-select"
        >
          <option value="-1">Select column...</option>
          @for (column of table?.columns; track column.columnPosition; let i = $index) {
            <option [value]="i">{{ column.name }}</option>
          }
        </select>

        <select
          [(ngModel)]="newFilterOperator"
          class="filter-select operator"
        >
          <option value="equals">equals</option>
          <option value="contains">contains</option>
          <option value="starts_with">starts with</option>
          <option value="ends_with">ends with</option>
          <option value="is_empty">is empty</option>
          <option value="is_not_empty">is not empty</option>
        </select>

        @if (newFilterOperator !== 'is_empty' && newFilterOperator !== 'is_not_empty') {
          <div class="value-input-wrapper">
            <input
              type="text"
              [(ngModel)]="newFilterValue"
              (focus)="showSuggestions = true"
              (blur)="onInputBlur()"
              (keydown.enter)="addFilter()"
              placeholder="Value..."
              class="filter-input"
            />
            @if (showSuggestions && valueSuggestions().length > 0) {
              <div class="suggestions">
                @for (suggestion of valueSuggestions().slice(0, 10); track suggestion) {
                  <div
                    class="suggestion-item"
                    (mousedown)="selectSuggestion(suggestion)"
                  >
                    {{ suggestion }}
                  </div>
                }
              </div>
            }
          </div>
        }

        <button
          class="btn btn-primary"
          [disabled]="!canAddFilter()"
          (click)="addFilter()"
        >
          Add Filter
        </button>
      </div>

      <!-- Active filters -->
      @if (filters().length > 0) {
        <div class="active-filters">
          @for (filter of filters(); track $index) {
            <span class="filter-chip">
              <span class="filter-column">{{ filter.columnName }}</span>
              <span class="filter-operator">{{ getOperatorLabel(filter.operator) }}</span>
              @if (filter.value) {
                <span class="filter-value">"{{ filter.value }}"</span>
              }
              <button class="remove-btn" (click)="removeFilter($index)">×</button>
            </span>
          }
          <button class="btn-link" (click)="clearFilters()">Clear all</button>
          <span class="filter-result">
            {{ filterResult().matchingIndices.length }} of {{ filterResult().totalCount }} samples
          </span>
        </div>
      }
    </div>
  `,
  styles: [`
    .filter-bar {
      padding: 8px 16px;
      background: #f8f9fa;
      border-bottom: 1px solid #ddd;
    }

    .filter-bar.has-filters {
      background: #e3f2fd;
    }

    .filter-controls {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }

    .filter-select {
      padding: 6px 10px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 13px;
      background: white;
    }

    .filter-select.operator {
      min-width: 120px;
    }

    .value-input-wrapper {
      position: relative;
      flex: 1;
      min-width: 150px;
      max-width: 250px;
    }

    .filter-input {
      width: 100%;
      padding: 6px 10px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 13px;
    }

    .filter-input:focus {
      outline: none;
      border-color: #2196f3;
    }

    .suggestions {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: white;
      border: 1px solid #ddd;
      border-top: none;
      border-radius: 0 0 4px 4px;
      max-height: 200px;
      overflow-y: auto;
      z-index: 100;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .suggestion-item {
      padding: 8px 10px;
      cursor: pointer;
      font-size: 13px;
    }

    .suggestion-item:hover {
      background: #f5f5f5;
    }

    .btn {
      padding: 6px 12px;
      border: none;
      border-radius: 4px;
      font-size: 13px;
      cursor: pointer;
    }

    .btn-primary {
      background: #2196f3;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #1976d2;
    }

    .btn-primary:disabled {
      background: #ccc;
      cursor: not-allowed;
    }

    .btn-link {
      background: none;
      border: none;
      color: #1976d2;
      cursor: pointer;
      font-size: 12px;
      text-decoration: underline;
    }

    .active-filters {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-top: 8px;
      flex-wrap: wrap;
    }

    .filter-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      background: white;
      border: 1px solid #2196f3;
      border-radius: 16px;
      font-size: 12px;
    }

    .filter-column {
      font-weight: 500;
      color: #1976d2;
    }

    .filter-operator {
      color: #666;
    }

    .filter-value {
      color: #333;
    }

    .remove-btn {
      background: none;
      border: none;
      color: #999;
      cursor: pointer;
      padding: 0 2px;
      font-size: 14px;
      line-height: 1;
    }

    .remove-btn:hover {
      color: #d32f2f;
    }

    .filter-result {
      margin-left: auto;
      font-size: 12px;
      color: #666;
      font-weight: 500;
    }
  `],
})
export class SdrfFilterBarComponent {
  @Input() table: SdrfTable | null = null;

  @Output() filterChange = new EventEmitter<FilterResult>();

  // New filter form
  newFilterColumn = -1;
  newFilterOperator: FilterCondition['operator'] = 'equals';
  newFilterValue = '';
  showSuggestions = false;

  // Active filters
  filters = signal<FilterCondition[]>([]);

  // Filter result
  filterResult = computed<FilterResult>(() => {
    if (!this.table) {
      return { matchingIndices: [], totalCount: 0 };
    }

    const allFilters = this.filters();
    if (allFilters.length === 0) {
      // No filters - all rows match
      const allIndices = Array.from({ length: this.table.sampleCount }, (_, i) => i + 1);
      return { matchingIndices: allIndices, totalCount: this.table.sampleCount };
    }

    // Apply all filters (AND logic)
    const matchingIndices: number[] = [];
    for (let i = 1; i <= this.table.sampleCount; i++) {
      if (this.rowMatchesAllFilters(i, allFilters)) {
        matchingIndices.push(i);
      }
    }

    return { matchingIndices, totalCount: this.table.sampleCount };
  });

  // Value suggestions for autocomplete
  valueSuggestions = computed<string[]>(() => {
    if (!this.table || this.newFilterColumn < 0) return [];

    const column = this.table.columns[this.newFilterColumn];
    if (!column) return [];

    const values = new Set<string>();
    for (let i = 1; i <= this.table.sampleCount; i++) {
      const value = getValueForSample(column, i);
      if (value && value.toLowerCase().includes(this.newFilterValue.toLowerCase())) {
        values.add(value);
      }
    }

    return Array.from(values).sort();
  });

  canAddFilter(): boolean {
    if (this.newFilterColumn < 0) return false;
    if (this.newFilterOperator === 'is_empty' || this.newFilterOperator === 'is_not_empty') {
      return true;
    }
    return this.newFilterValue.trim().length > 0;
  }

  addFilter(): void {
    if (!this.canAddFilter() || !this.table) return;

    const column = this.table.columns[this.newFilterColumn];
    const newFilter: FilterCondition = {
      columnIndex: this.newFilterColumn,
      columnName: column.name,
      operator: this.newFilterOperator,
      value: this.newFilterValue.trim(),
    };

    this.filters.set([...this.filters(), newFilter]);
    this.emitFilterChange();

    // Reset form
    this.newFilterValue = '';
  }

  removeFilter(index: number): void {
    const current = this.filters();
    this.filters.set([...current.slice(0, index), ...current.slice(index + 1)]);
    this.emitFilterChange();
  }

  clearFilters(): void {
    this.filters.set([]);
    this.emitFilterChange();
  }

  selectSuggestion(value: string): void {
    this.newFilterValue = value;
    this.showSuggestions = false;
  }

  onInputBlur(): void {
    // Delay to allow clicking suggestions
    setTimeout(() => {
      this.showSuggestions = false;
    }, 200);
  }

  getOperatorLabel(operator: FilterCondition['operator']): string {
    switch (operator) {
      case 'equals': return '=';
      case 'contains': return 'contains';
      case 'starts_with': return 'starts with';
      case 'ends_with': return 'ends with';
      case 'is_empty': return 'is empty';
      case 'is_not_empty': return 'is not empty';
    }
  }

  private rowMatchesAllFilters(rowIndex: number, filters: FilterCondition[]): boolean {
    if (!this.table) return false;

    for (const filter of filters) {
      const column = this.table.columns[filter.columnIndex];
      if (!column) continue;

      const value = getValueForSample(column, rowIndex);
      if (!this.matchesFilter(value, filter)) {
        return false;
      }
    }

    return true;
  }

  private matchesFilter(value: string, filter: FilterCondition): boolean {
    const v = value.toLowerCase();
    const f = filter.value.toLowerCase();

    switch (filter.operator) {
      case 'equals':
        return v === f;
      case 'contains':
        return v.includes(f);
      case 'starts_with':
        return v.startsWith(f);
      case 'ends_with':
        return v.endsWith(f);
      case 'is_empty':
        return value.trim() === '';
      case 'is_not_empty':
        return value.trim() !== '';
    }
  }

  private emitFilterChange(): void {
    this.filterChange.emit(this.filterResult());
  }
}
