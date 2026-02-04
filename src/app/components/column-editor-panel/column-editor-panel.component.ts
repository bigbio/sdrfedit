/**
 * Column Editor Panel Component
 *
 * Side panel for bulk editing values in a specific column.
 * Allows users to:
 * - See current unique values and their frequencies
 * - Search for new values (with OLS for ontology columns)
 * - Select which samples to apply values to
 * - Apply changes in bulk
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
  OnInit,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SdrfTable } from '../../core/models/sdrf-table';
import { SdrfColumn, getValueForSample } from '../../core/models/sdrf-column';
import { SdrfOntologyInputComponent } from '../sdrf-ontology-input/sdrf-ontology-input.component';
import { OntologySuggestion } from '../../core/models/ontology';

export interface ValueDistribution {
  value: string;
  sampleCount: number;
  sampleIndices: number[];
}

export interface BulkEditEvent {
  columnIndex: number;
  value: string;
  sampleIndices: number[];
  ontologyId?: string;
  ontologyLabel?: string;
}

type SelectionMode = 'all' | 'range' | 'selected' | 'empty' | 'custom';

@Component({
  selector: 'column-editor-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, SdrfOntologyInputComponent],
  template: `
    <div class="column-editor-panel" [class.open]="isOpen()">
      <div class="panel-backdrop" (click)="close.emit()"></div>
      <div class="panel-content">
        <!-- Header -->
        <div class="panel-header">
          <div class="header-title">
            <span class="icon">📝</span>
            <div class="title-text">
              <div class="column-name">{{ column()?.name || 'Column Editor' }}</div>
              <div class="sample-count">{{ table()?.sampleCount || 0 }} samples</div>
            </div>
          </div>
          <button class="close-btn" (click)="close.emit()" title="Close">×</button>
        </div>

        @if (column() && table()) {
          <div class="panel-body">
            <!-- Current Values Section -->
            <div class="section">
              <h3 class="section-title">Current Values</h3>
              <div class="value-distribution">
                @for (dist of valueDistribution(); track dist.value) {
                  <div class="value-item" (click)="selectValueSamples(dist)">
                    <div class="value-info">
                      <span class="value-text">{{ dist.value || '(empty)' }}</span>
                      <span class="value-count">{{ dist.sampleCount }} samples</span>
                    </div>
                    <button
                      class="edit-value-btn"
                      (click)="startEditingValue(dist); $event.stopPropagation()"
                      title="Replace this value"
                    >
                      Edit
                    </button>
                  </div>
                }
                @if (valueDistribution().length === 0) {
                  <div class="empty-state">No values in this column</div>
                }
              </div>
            </div>

            <!-- Edit Section -->
            <div class="section">
              <h3 class="section-title">
                {{ editingExisting() ? 'Replace Value' : 'Add/Edit Value' }}
              </h3>

              @if (editingExisting()) {
                <div class="editing-info">
                  Replacing: <strong>{{ editingValue() }}</strong> ({{ editingSampleCount() }} samples)
                </div>
              }

              <!-- Value Input -->
              <div class="form-group">
                <label>New Value</label>
                @if (isOntologyColumn()) {
                  <sdrf-ontology-input
                    [value]="newValue()"
                    [columnName]="column()!.name"
                    (valueChange)="newValue.set($event)"
                    (termSelected)="onTermSelected($event)"
                    [placeholder]="'Search ' + getColumnTypeLabel() + '...'"
                  ></sdrf-ontology-input>
                } @else {
                  <input
                    type="text"
                    class="text-input"
                    [value]="newValue()"
                    (input)="newValue.set($any($event.target).value)"
                    placeholder="Enter value..."
                  />
                }
              </div>

              <!-- Sample Selection -->
              <div class="form-group">
                <label>Apply to</label>
                <div class="selection-options">
                  <label class="radio-option">
                    <input
                      type="radio"
                      name="selectionMode"
                      value="all"
                      [checked]="selectionMode() === 'all'"
                      (change)="setSelectionMode('all')"
                    />
                    <span>All samples ({{ table()!.sampleCount }})</span>
                  </label>

                  <label class="radio-option">
                    <input
                      type="radio"
                      name="selectionMode"
                      value="empty"
                      [checked]="selectionMode() === 'empty'"
                      (change)="setSelectionMode('empty')"
                    />
                    <span>Empty cells only ({{ emptyCellCount() }})</span>
                  </label>

                  <label class="radio-option">
                    <input
                      type="radio"
                      name="selectionMode"
                      value="range"
                      [checked]="selectionMode() === 'range'"
                      (change)="setSelectionMode('range')"
                    />
                    <span>Sample range</span>
                  </label>

                  @if (selectionMode() === 'range') {
                    <div class="range-inputs">
                      <input
                        type="number"
                        class="range-input"
                        [value]="rangeStart()"
                        (input)="rangeStart.set(+$any($event.target).value)"
                        [min]="1"
                        [max]="table()!.sampleCount"
                        placeholder="From"
                      />
                      <span>to</span>
                      <input
                        type="number"
                        class="range-input"
                        [value]="rangeEnd()"
                        (input)="rangeEnd.set(+$any($event.target).value)"
                        [min]="1"
                        [max]="table()!.sampleCount"
                        placeholder="To"
                      />
                    </div>
                  }

                  <label class="radio-option">
                    <input
                      type="radio"
                      name="selectionMode"
                      value="custom"
                      [checked]="selectionMode() === 'custom'"
                      (change)="setSelectionMode('custom')"
                    />
                    <span>Custom selection ({{ customSelection().length }})</span>
                  </label>

                  @if (selectionMode() === 'custom') {
                    <div class="custom-selection-panel">
                      <p class="hint">
                        Enter sample numbers (comma-separated) or ranges (e.g., "1-10, 15, 20, 25-30")
                      </p>
                      <textarea
                        class="sample-input"
                        [value]="customSelectionInput()"
                        (input)="onCustomSelectionInput($any($event.target).value)"
                        placeholder="e.g., 1-10, 15, 20, 25-30"
                        rows="3"
                      ></textarea>
                      @if (customSelectionError()) {
                        <p class="error-text">{{ customSelectionError() }}</p>
                      }
                      @if (customSelection().length > 0 && !customSelectionError()) {
                        <p class="success-text">
                          ✓ {{ customSelection().length }} sample(s) selected: {{ formatSampleRange(customSelection()) }}
                        </p>
                      }
                      <div class="quick-actions">
                        <p class="hint-small">Quick select from current values:</p>
                        @for (dist of valueDistribution().slice(0, 5); track dist.value) {
                          <button
                            class="quick-select-btn"
                            (click)="addValueSamplesToSelection(dist)"
                            title="Add samples with this value"
                          >
                            {{ dist.value || '(empty)' }} ({{ dist.sampleCount }})
                          </button>
                        }
                        <button class="clear-btn" (click)="clearCustomSelection()">Clear All</button>
                      </div>
                    </div>
                  }
                </div>
              </div>

              <!-- Preview -->
              @if (selectedSampleCount() > 0) {
                <div class="preview">
                  <strong>{{ selectedSampleCount() }}</strong> sample(s) will be updated
                </div>
              }

              <!-- Actions -->
              <div class="actions">
                @if (editingExisting()) {
                  <button class="btn btn-secondary" (click)="cancelEditing()">
                    Cancel
                  </button>
                }
                <button
                  class="btn btn-primary"
                  [disabled]="!canApply()"
                  (click)="applyChanges()"
                >
                  Apply to {{ selectedSampleCount() }} Sample(s)
                </button>
              </div>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .column-editor-panel {
      position: fixed;
      top: 0;
      right: -100%;
      width: 100%;
      height: 100%;
      z-index: 1000;
      transition: right 0.3s ease;
    }

    .column-editor-panel.open {
      right: 0;
    }

    .panel-backdrop {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      cursor: pointer;
    }

    .panel-content {
      position: absolute;
      top: 0;
      right: 0;
      width: 450px;
      max-width: 90vw;
      height: 100%;
      background: white;
      box-shadow: -2px 0 8px rgba(0, 0, 0, 0.15);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid #e0e0e0;
      background: #f8f9fa;
    }

    .header-title {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
    }

    .icon {
      font-size: 20px;
    }

    .title-text {
      flex: 1;
    }

    .column-name {
      font-weight: 600;
      font-size: 14px;
      color: #1a1a1a;
    }

    .sample-count {
      font-size: 12px;
      color: #666;
    }

    .close-btn {
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #666;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: all 0.2s;
    }

    .close-btn:hover {
      background: #e0e0e0;
      color: #1a1a1a;
    }

    .panel-body {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
    }

    .section {
      margin-bottom: 24px;
    }

    .section-title {
      font-size: 13px;
      font-weight: 600;
      color: #1a1a1a;
      margin: 0 0 12px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .value-distribution {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .value-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      background: #f8f9fa;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .value-item:hover {
      background: #e8f4f8;
      border-color: #2196f3;
    }

    .value-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .value-text {
      font-size: 13px;
      color: #1a1a1a;
      font-weight: 500;
    }

    .value-count {
      font-size: 11px;
      color: #666;
    }

    .edit-value-btn {
      padding: 4px 12px;
      font-size: 11px;
      background: white;
      border: 1px solid #ccc;
      border-radius: 3px;
      cursor: pointer;
      color: #666;
      transition: all 0.2s;
    }

    .edit-value-btn:hover {
      background: #2196f3;
      color: white;
      border-color: #2196f3;
    }

    .empty-state {
      padding: 20px;
      text-align: center;
      color: #999;
      font-size: 13px;
    }

    .editing-info {
      padding: 8px 12px;
      background: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 4px;
      font-size: 12px;
      margin-bottom: 12px;
    }

    .form-group {
      margin-bottom: 16px;
    }

    .form-group label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #555;
      margin-bottom: 6px;
    }

    .text-input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 13px;
    }

    .text-input:focus {
      outline: none;
      border-color: #2196f3;
      box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
    }

    .selection-options {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .radio-option {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      cursor: pointer;
      border-radius: 4px;
      transition: background 0.2s;
    }

    .radio-option:hover {
      background: #f5f5f5;
    }

    .radio-option input[type="radio"] {
      cursor: pointer;
    }

    .radio-option span {
      font-size: 13px;
      color: #1a1a1a;
    }

    .range-inputs {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: 28px;
      margin-top: 4px;
    }

    .range-input {
      width: 80px;
      padding: 6px 8px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 13px;
    }

    .custom-selection-info {
      margin-left: 28px;
      margin-top: 4px;
    }

    .custom-selection-panel {
      margin-left: 28px;
      margin-top: 8px;
      padding: 12px;
      background: #f8f9fa;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
    }

    .sample-input {
      width: 100%;
      padding: 8px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 12px;
      font-family: monospace;
      resize: vertical;
      margin-top: 4px;
    }

    .sample-input:focus {
      outline: none;
      border-color: #2196f3;
      box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
    }

    .error-text {
      color: #d32f2f;
      font-size: 11px;
      margin: 4px 0;
    }

    .success-text {
      color: #2e7d32;
      font-size: 11px;
      margin: 4px 0;
      font-weight: 500;
    }

    .quick-actions {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #e0e0e0;
    }

    .hint-small {
      font-size: 10px;
      color: #666;
      margin: 0 0 6px 0;
    }

    .quick-select-btn {
      display: inline-block;
      padding: 4px 8px;
      font-size: 10px;
      background: white;
      border: 1px solid #ccc;
      border-radius: 3px;
      cursor: pointer;
      margin: 2px 4px 2px 0;
      transition: all 0.2s;
    }

    .quick-select-btn:hover {
      background: #e3f2fd;
      border-color: #2196f3;
    }

    .hint {
      font-size: 11px;
      color: #666;
      margin: 4px 0;
    }

    .clear-btn {
      padding: 4px 12px;
      font-size: 11px;
      background: white;
      border: 1px solid #ccc;
      border-radius: 3px;
      cursor: pointer;
      color: #666;
      margin-top: 4px;
    }

    .clear-btn:hover {
      background: #f5f5f5;
    }

    .preview {
      padding: 12px;
      background: #e8f5e9;
      border: 1px solid #4caf50;
      border-radius: 4px;
      font-size: 13px;
      color: #2e7d32;
      margin-bottom: 16px;
    }

    .actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
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

    .btn-secondary {
      background: white;
      color: #666;
      border: 1px solid #ccc;
    }

    .btn-secondary:hover {
      background: #f5f5f5;
    }
  `],
})
export class ColumnEditorPanelComponent implements OnInit, OnChanges {
  @Input() isOpen = signal(false);
  @Input() table = signal<SdrfTable | null>(null);
  @Input() columnIndex = signal<number>(-1);

  @Output() close = new EventEmitter<void>();
  @Output() applyBulkEdit = new EventEmitter<BulkEditEvent>();

  // Computed
  column = computed(() => {
    const t = this.table();
    const idx = this.columnIndex();
    if (!t || idx < 0 || idx >= t.columns.length) return null;
    return t.columns[idx];
  });

  valueDistribution = computed(() => {
    const col = this.column();
    const t = this.table();
    if (!col || !t) return [];

    const distribution = new Map<string, number[]>();

    for (let i = 1; i <= t.sampleCount; i++) {
      const value = getValueForSample(col, i);
      const key = value || '';
      if (!distribution.has(key)) {
        distribution.set(key, []);
      }
      distribution.get(key)!.push(i);
    }

    return Array.from(distribution.entries())
      .map(([value, sampleIndices]) => ({
        value,
        sampleCount: sampleIndices.length,
        sampleIndices,
      }))
      .sort((a, b) => b.sampleCount - a.sampleCount);
  });

  emptyCellCount = computed(() => {
    const dist = this.valueDistribution();
    const emptyDist = dist.find(d => d.value === '');
    return emptyDist ? emptyDist.sampleCount : 0;
  });

  selectedSampleCount = computed(() => {
    return this.getSelectedSamples().length;
  });

  // State
  newValue = signal('');
  selectedOntology = signal<OntologySuggestion | null>(null);
  selectionMode = signal<SelectionMode>('all');
  rangeStart = signal(1);
  rangeEnd = signal(1);
  customSelection = signal<number[]>([]);
  customSelectionInput = signal('');
  customSelectionError = signal('');
  editingExisting = signal(false);
  editingValue = signal('');
  editingSampleCount = signal(0);

  ngOnInit(): void {
    const t = this.table();
    if (t) {
      this.rangeEnd.set(t.sampleCount);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['table'] && this.table()) {
      this.rangeEnd.set(this.table()!.sampleCount);
    }

    if (changes['isOpen'] || changes['columnIndex']) {
      // Reset state when panel opens/changes
      this.resetState();
    }
  }

  isOntologyColumn(): boolean {
    const col = this.column();
    if (!col) return false;

    const ontologyColumns = [
      'organism',
      'disease',
      'cell type',
      'cell line',
      'tissue',
      'organ',
      'organism part',
      'developmental stage',
      'sex',
      'ancestry category',
      'instrument',
      'enrichment process',
    ];

    const nameLower = col.name.toLowerCase();
    return ontologyColumns.some(ont => nameLower.includes(ont));
  }

  getColumnTypeLabel(): string {
    const col = this.column();
    if (!col) return 'term';

    const match = col.name.toLowerCase().match(/\[(.*?)\]/);
    return match ? match[1] : 'term';
  }

  setSelectionMode(mode: SelectionMode): void {
    this.selectionMode.set(mode);
  }

  selectValueSamples(dist: ValueDistribution): void {
    // This is called when clicking on a value item
    // For custom mode, we'll use addValueSamplesToSelection instead
  }

  clearCustomSelection(): void {
    this.customSelection.set([]);
    this.customSelectionInput.set('');
    this.customSelectionError.set('');
  }

  onCustomSelectionInput(input: string): void {
    this.customSelectionInput.set(input);

    const parsed = this.parseCustomSelection(input);
    if (parsed.error) {
      this.customSelectionError.set(parsed.error);
      this.customSelection.set([]);
    } else {
      this.customSelectionError.set('');
      this.customSelection.set(parsed.samples);
    }
  }

  addValueSamplesToSelection(dist: ValueDistribution): void {
    const current = this.customSelection();
    const combined = [...new Set([...current, ...dist.sampleIndices])];
    this.customSelection.set(combined.sort((a, b) => a - b));

    // Update input to reflect the selection
    this.customSelectionInput.set(this.samplesToInputString(combined));
    this.customSelectionError.set('');
  }

  private parseCustomSelection(input: string): { samples: number[]; error?: string } {
    const t = this.table();
    if (!t) return { samples: [], error: 'No table loaded' };

    const trimmed = input.trim();
    if (!trimmed) return { samples: [] };

    const samples: number[] = [];
    const parts = trimmed.split(',');

    try {
      for (const part of parts) {
        const trimmedPart = part.trim();
        if (!trimmedPart) continue;

        // Check if it's a range (e.g., "1-10")
        if (trimmedPart.includes('-')) {
          const rangeParts = trimmedPart.split('-').map(s => s.trim());
          if (rangeParts.length !== 2) {
            return { samples: [], error: `Invalid range: "${trimmedPart}"` };
          }

          const start = parseInt(rangeParts[0]);
          const end = parseInt(rangeParts[1]);

          if (isNaN(start) || isNaN(end)) {
            return { samples: [], error: `Invalid range numbers: "${trimmedPart}"` };
          }

          if (start < 1 || end > t.sampleCount || start > end) {
            return {
              samples: [],
              error: `Range "${trimmedPart}" out of bounds (1-${t.sampleCount})`
            };
          }

          for (let i = start; i <= end; i++) {
            samples.push(i);
          }
        } else {
          // Single number
          const num = parseInt(trimmedPart);
          if (isNaN(num)) {
            return { samples: [], error: `Invalid sample number: "${trimmedPart}"` };
          }

          if (num < 1 || num > t.sampleCount) {
            return {
              samples: [],
              error: `Sample ${num} out of bounds (1-${t.sampleCount})`
            };
          }

          samples.push(num);
        }
      }

      // Remove duplicates and sort
      const unique = [...new Set(samples)].sort((a, b) => a - b);
      return { samples: unique };
    } catch (error) {
      return { samples: [], error: 'Invalid input format' };
    }
  }

  private samplesToInputString(samples: number[]): string {
    if (samples.length === 0) return '';

    // Group consecutive numbers into ranges
    const ranges: string[] = [];
    let rangeStart = samples[0];
    let rangeEnd = samples[0];

    for (let i = 1; i <= samples.length; i++) {
      if (i < samples.length && samples[i] === rangeEnd + 1) {
        rangeEnd = samples[i];
      } else {
        // End of range
        if (rangeStart === rangeEnd) {
          ranges.push(rangeStart.toString());
        } else if (rangeEnd === rangeStart + 1) {
          ranges.push(`${rangeStart}, ${rangeEnd}`);
        } else {
          ranges.push(`${rangeStart}-${rangeEnd}`);
        }

        if (i < samples.length) {
          rangeStart = samples[i];
          rangeEnd = samples[i];
        }
      }
    }

    return ranges.join(', ');
  }

  startEditingValue(dist: ValueDistribution): void {
    this.editingExisting.set(true);
    this.editingValue.set(dist.value);
    this.editingSampleCount.set(dist.sampleCount);
    this.customSelection.set(dist.sampleIndices);
    this.selectionMode.set('custom');
  }

  cancelEditing(): void {
    this.editingExisting.set(false);
    this.editingValue.set('');
    this.editingSampleCount.set(0);
    this.customSelection.set([]);
    this.selectionMode.set('all');
  }

  onTermSelected(term: OntologySuggestion | null): void {
    this.selectedOntology.set(term);
  }

  getSelectedSamples(): number[] {
    const mode = this.selectionMode();
    const t = this.table();
    if (!t) return [];

    switch (mode) {
      case 'all':
        return Array.from({ length: t.sampleCount }, (_, i) => i + 1);

      case 'empty': {
        const col = this.column();
        if (!col) return [];
        const empty: number[] = [];
        for (let i = 1; i <= t.sampleCount; i++) {
          const value = getValueForSample(col, i);
          if (!value || value.trim() === '') {
            empty.push(i);
          }
        }
        return empty;
      }

      case 'range': {
        const start = Math.max(1, this.rangeStart());
        const end = Math.min(t.sampleCount, this.rangeEnd());
        if (start > end) return [];
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
      }

      case 'custom':
        return this.customSelection();

      default:
        return [];
    }
  }

  canApply(): boolean {
    return this.newValue().trim() !== '' && this.selectedSampleCount() > 0;
  }

  applyChanges(): void {
    const value = this.newValue().trim();
    const sampleIndices = this.getSelectedSamples();

    if (!value || sampleIndices.length === 0) return;

    const event: BulkEditEvent = {
      columnIndex: this.columnIndex(),
      value,
      sampleIndices,
      ontologyId: this.selectedOntology()?.id,
      ontologyLabel: this.selectedOntology()?.label,
    };

    this.applyBulkEdit.emit(event);
    this.resetState();
  }

  formatSampleRange(indices: number[]): string {
    if (indices.length === 0) return 'None';
    if (indices.length <= 5) return indices.join(', ');

    const sorted = [...indices].sort((a, b) => a - b);
    return `${sorted[0]}-${sorted[sorted.length - 1]} (${indices.length} samples)`;
  }

  private resetState(): void {
    this.newValue.set('');
    this.selectedOntology.set(null);
    this.selectionMode.set('all');
    this.customSelection.set([]);
    this.customSelectionInput.set('');
    this.customSelectionError.set('');
    this.editingExisting.set(false);
    this.editingValue.set('');
    this.editingSampleCount.set(0);

    const t = this.table();
    if (t) {
      this.rangeStart.set(1);
      this.rangeEnd.set(t.sampleCount);
    }
  }
}
