/**
 * SDRF Column Stats Panel
 *
 * Shows value distribution for columns and enables bulk editing.
 * Displays unique values with sample counts and allows selecting/editing groups.
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { SdrfTable } from '../../core/models/sdrf-table';
import { SdrfColumn, getValueForSample } from '../../core/models/sdrf-column';

/**
 * Statistics for a single value in a column.
 */
export interface ValueStats {
  value: string;
  count: number;
  percentage: number;
  sampleIndices: number[];
}

/**
 * Event emitted when user wants to select samples by value.
 */
export interface SelectByValueEvent {
  columnIndex: number;
  value: string;
  sampleIndices: number[];
}

/**
 * Event emitted when user wants to bulk edit a value.
 */
export interface BulkEditEvent {
  columnIndex: number;
  oldValue: string;
  newValue: string;
  sampleIndices: number[];
}

@Component({
  selector: 'sdrf-column-stats',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="column-stats-panel">
      <div class="panel-header">
        <h3>Column Statistics</h3>
        <button class="close-btn" (click)="close.emit()">×</button>
      </div>

      <!-- Column Selector -->
      <div class="column-selector">
        <label>Select Column:</label>
        <select
          [ngModel]="selectedColumnIndex()"
          (ngModelChange)="onColumnChange($event)"
        >
          @for (column of table?.columns; track column.columnPosition; let i = $index) {
            <option [value]="i">{{ column.name }}</option>
          }
        </select>
      </div>

      <!-- Stats Display -->
      @if (selectedColumn()) {
        <div class="stats-content">
          <div class="stats-summary">
            <span class="summary-item">
              <strong>{{ uniqueValues().length }}</strong> unique values
            </span>
            <span class="summary-item">
              <strong>{{ table?.sampleCount || 0 }}</strong> total samples
            </span>
            @if (isComputing()) {
              <span class="computing-indicator">
                <span class="spinner"></span>
                Processing...
              </span>
            }
          </div>

          <!-- Value List -->
          <div class="value-list" [class.computing]="isComputing()">
            @for (stat of uniqueValues(); track stat.value) {
              <div
                class="value-item"
                [class.selected]="isValueSelected(stat.value)"
                [class.editing]="editingValue() === stat.value"
              >
                <div class="value-main" (click)="onValueClick(stat)">
                  <div class="value-bar">
                    <div
                      class="value-bar-fill"
                      [style.width.%]="stat.percentage"
                    ></div>
                  </div>
                  <span class="value-text" [title]="stat.value || '(empty)'">
                    {{ stat.value || '(empty)' }}
                  </span>
                  <span class="value-count">
                    {{ stat.count }}
                    <span class="value-percentage">({{ stat.percentage | number:'1.1-1' }}%)</span>
                  </span>
                </div>

                <div class="value-actions">
                  @if (editingValue() === stat.value) {
                    <div class="edit-inline">
                      <input
                        type="text"
                        [(ngModel)]="editNewValue"
                        (keydown.enter)="applyEdit(stat)"
                        (keydown.escape)="cancelEdit()"
                        class="edit-input"
                        placeholder="New value..."
                      />
                      <button class="btn-sm btn-primary" (click)="applyEdit(stat)">
                        Apply
                      </button>
                      <button class="btn-sm" (click)="cancelEdit()">
                        Cancel
                      </button>
                    </div>
                  } @else {
                    <button
                      class="btn-icon"
                      title="Select all samples with this value"
                      (click)="selectValue(stat); $event.stopPropagation()"
                    >
                      ☑
                    </button>
                    <button
                      class="btn-icon"
                      title="Edit all samples with this value"
                      (click)="startEdit(stat); $event.stopPropagation()"
                    >
                      ✎
                    </button>
                  }
                </div>
              </div>
            }
          </div>

          <!-- Quick Actions -->
          <div class="quick-actions">
            <button class="btn btn-sm" (click)="selectEmpty()">
              Select Empty
            </button>
            <button class="btn btn-sm" (click)="selectAll()">
              Select All
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .column-stats-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #f8f9fa;
      border-left: 1px solid #ddd;
      width: 320px;
      font-size: 13px;
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: #fff;
      border-bottom: 1px solid #ddd;
    }

    .panel-header h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }

    .close-btn {
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      color: #666;
      padding: 0 4px;
    }

    .close-btn:hover {
      color: #333;
    }

    .column-selector {
      padding: 12px 16px;
      background: #fff;
      border-bottom: 1px solid #eee;
    }

    .column-selector label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
      color: #555;
    }

    .column-selector select {
      width: 100%;
      padding: 8px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 13px;
      background: #fff;
    }

    .stats-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .stats-summary {
      display: flex;
      gap: 16px;
      padding: 12px 16px;
      background: #fff;
      border-bottom: 1px solid #eee;
    }

    .summary-item {
      font-size: 12px;
      color: #666;
    }

    .summary-item strong {
      color: #333;
    }

    .value-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }

    .value-item {
      padding: 8px 16px;
      border-bottom: 1px solid #eee;
      transition: background 0.15s;
    }

    .value-item:hover {
      background: #fff;
    }

    .value-item.selected {
      background: #e3f2fd;
    }

    .value-item.editing {
      background: #fff3e0;
    }

    .value-main {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }

    .value-bar {
      width: 40px;
      height: 6px;
      background: #e0e0e0;
      border-radius: 3px;
      overflow: hidden;
      flex-shrink: 0;
    }

    .value-bar-fill {
      height: 100%;
      background: #2196f3;
      border-radius: 3px;
      transition: width 0.3s;
    }

    .value-text {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }

    .value-count {
      font-weight: 500;
      color: #333;
      flex-shrink: 0;
    }

    .value-percentage {
      font-weight: normal;
      color: #999;
      font-size: 11px;
    }

    .value-actions {
      display: flex;
      gap: 4px;
      margin-top: 6px;
    }

    .btn-icon {
      background: none;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 4px 8px;
      cursor: pointer;
      font-size: 12px;
    }

    .btn-icon:hover {
      background: #f0f0f0;
      border-color: #ccc;
    }

    .edit-inline {
      display: flex;
      gap: 4px;
      flex: 1;
    }

    .edit-input {
      flex: 1;
      padding: 4px 8px;
      border: 1px solid #2196f3;
      border-radius: 4px;
      font-size: 12px;
    }

    .btn-sm {
      padding: 4px 8px;
      font-size: 11px;
      border: 1px solid #ccc;
      border-radius: 4px;
      background: #fff;
      cursor: pointer;
    }

    .btn-sm:hover {
      background: #f5f5f5;
    }

    .btn-sm.btn-primary {
      background: #2196f3;
      color: white;
      border-color: #2196f3;
    }

    .btn-sm.btn-primary:hover {
      background: #1976d2;
    }

    .quick-actions {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      background: #fff;
      border-top: 1px solid #ddd;
    }

    .quick-actions .btn {
      flex: 1;
    }

    .computing-indicator {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: #1976d2;
      margin-left: auto;
    }

    .spinner {
      width: 14px;
      height: 14px;
      border: 2px solid #e3f2fd;
      border-top-color: #1976d2;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .value-list.computing {
      opacity: 0.6;
      pointer-events: none;
    }
  `],
})
export class SdrfColumnStatsComponent {
  @Input() table: SdrfTable | null = null;
  @Input() selectedSamples: Set<number> = new Set();

  @Output() close = new EventEmitter<void>();
  @Output() selectByValue = new EventEmitter<SelectByValueEvent>();
  @Output() bulkEdit = new EventEmitter<BulkEditEvent>();
  @Output() selectSamples = new EventEmitter<number[]>();

  selectedColumnIndex = signal(0);
  editingValue = signal<string | null>(null);
  editNewValue = '';
  isComputing = signal(false);
  private cachedValues = signal<ValueStats[]>([]);

  selectedColumn = computed(() => {
    if (!this.table) return null;
    return this.table.columns[this.selectedColumnIndex()] || null;
  });

  // Use cached values for display, computed asynchronously
  uniqueValues = computed<ValueStats[]>(() => this.cachedValues());

  constructor() {
    // Recompute values when column changes, with loading indicator
    effect(() => {
      const column = this.selectedColumn();
      const table = this.table;

      if (!column || !table) {
        this.cachedValues.set([]);
        return;
      }

      // Show loading indicator
      this.isComputing.set(true);

      // Defer heavy computation to allow UI to update
      setTimeout(() => {
        const stats = this.computeUniqueValues(column, table);
        this.cachedValues.set(stats);
        this.isComputing.set(false);
      }, 0);
    });
  }

  private computeUniqueValues(column: SdrfColumn, table: SdrfTable): ValueStats[] {
    const valueMap = new Map<string, number[]>();

    for (let i = 1; i <= table.sampleCount; i++) {
      const value = getValueForSample(column, i);
      if (!valueMap.has(value)) {
        valueMap.set(value, []);
      }
      valueMap.get(value)!.push(i);
    }

    const stats: ValueStats[] = [];
    for (const [value, indices] of valueMap) {
      stats.push({
        value,
        count: indices.length,
        percentage: (indices.length / table.sampleCount) * 100,
        sampleIndices: indices,
      });
    }

    // Sort by count descending
    stats.sort((a, b) => b.count - a.count);
    return stats;
  }

  onColumnChange(index: number): void {
    this.selectedColumnIndex.set(Number(index));
    this.cancelEdit();
  }

  isValueSelected(value: string): boolean {
    const stats = this.uniqueValues().find(s => s.value === value);
    if (!stats) return false;
    return stats.sampleIndices.every(i => this.selectedSamples.has(i));
  }

  onValueClick(stat: ValueStats): void {
    this.selectValue(stat);
  }

  selectValue(stat: ValueStats): void {
    this.selectByValue.emit({
      columnIndex: this.selectedColumnIndex(),
      value: stat.value,
      sampleIndices: stat.sampleIndices,
    });
  }

  startEdit(stat: ValueStats): void {
    this.editingValue.set(stat.value);
    this.editNewValue = stat.value;
  }

  cancelEdit(): void {
    this.editingValue.set(null);
    this.editNewValue = '';
  }

  applyEdit(stat: ValueStats): void {
    if (this.editNewValue !== stat.value) {
      this.bulkEdit.emit({
        columnIndex: this.selectedColumnIndex(),
        oldValue: stat.value,
        newValue: this.editNewValue,
        sampleIndices: stat.sampleIndices,
      });
    }
    this.cancelEdit();
  }

  selectEmpty(): void {
    const emptyStat = this.uniqueValues().find(s => s.value === '');
    if (emptyStat) {
      this.selectSamples.emit(emptyStat.sampleIndices);
    }
  }

  selectAll(): void {
    if (!this.table) return;
    const allIndices = Array.from({ length: this.table.sampleCount }, (_, i) => i + 1);
    this.selectSamples.emit(allIndices);
  }
}
