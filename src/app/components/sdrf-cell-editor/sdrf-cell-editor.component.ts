/**
 * SDRF Cell Editor Component
 *
 * A smart cell editor that detects the column type and renders
 * the appropriate specialized input component.
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  signal,
  computed,
  ElementRef,
  ViewChild,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { SdrfColumn } from '../../core/models/sdrf-column';
import {
  SdrfSyntaxService,
  SyntaxType,
} from '../../core/services/sdrf-syntax.service';

import { SdrfAgeInputComponent } from '../sdrf-age-input/sdrf-age-input.component';
import { SdrfModificationInputComponent } from '../sdrf-modification-input/sdrf-modification-input.component';
import { SdrfCleavageInputComponent } from '../sdrf-cleavage-input/sdrf-cleavage-input.component';
import { SdrfOntologyInputComponent } from '../sdrf-ontology-input/sdrf-ontology-input.component';

/**
 * Editor mode determines which input type to show.
 */
export type EditorMode = 'text' | 'age' | 'modification' | 'cleavage' | 'ontology' | 'select';

/**
 * Predefined options for select-type columns.
 */
const SELECT_COLUMNS: Record<string, string[]> = {
  'pooled sample': ['not pooled', 'pooled'],
  'synthetic peptide': ['synthetic', 'not synthetic'],
  'labeling': ['label free sample', 'SILAC', 'TMT', 'iTRAQ'],
};

/**
 * Columns that should use ontology autocomplete.
 */
const ONTOLOGY_COLUMNS = [
  'organism',
  'disease',
  'cell type',
  'cell line',
  'tissue',
  'organ',
  'developmental stage',
  'sex',
  'ancestry category',
  'instrument',
  'enrichment process',
  'label',
];

@Component({
  selector: 'sdrf-cell-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SdrfAgeInputComponent,
    SdrfModificationInputComponent,
    SdrfCleavageInputComponent,
    SdrfOntologyInputComponent,
  ],
  template: `
    <div class="cell-editor-container" [class.expanded]="isExpanded()">
      <!-- Mode indicator and expand toggle -->
      <div class="editor-header">
        <span class="mode-badge" [class]="editorMode()">
          {{ getModeLabel() }}
        </span>
        @if (canExpand()) {
          <button class="expand-btn" (click)="toggleExpand()">
            {{ isExpanded() ? 'Collapse' : 'Expand' }}
          </button>
        }
      </div>

      <!-- Editor based on mode -->
      <div class="editor-content">
        @switch (editorMode()) {
          @case ('age') {
            <sdrf-age-input
              [value]="value"
              (valueChange)="onValueChange($event)"
            ></sdrf-age-input>
          }

          @case ('modification') {
            <sdrf-modification-input
              [value]="value"
              (valueChange)="onValueChange($event)"
            ></sdrf-modification-input>
          }

          @case ('cleavage') {
            <sdrf-cleavage-input
              [value]="value"
              (valueChange)="onValueChange($event)"
            ></sdrf-cleavage-input>
          }

          @case ('ontology') {
            <sdrf-ontology-input
              [value]="value"
              [columnName]="column?.name || ''"
              [placeholder]="'Search ' + getColumnTypeLabel() + '...'"
              (valueChange)="onValueChange($event)"
            ></sdrf-ontology-input>
          }

          @case ('select') {
            <select
              [ngModel]="value"
              (ngModelChange)="onValueChange($event)"
              class="select-input"
            >
              <option value="">-- Select --</option>
              @for (option of selectOptions(); track option) {
                <option [value]="option">{{ option }}</option>
              }
            </select>
          }

          @default {
            <!-- Plain text input -->
            @if (isExpanded()) {
              <textarea
                #textInput
                [ngModel]="value"
                (ngModelChange)="onValueChange($event)"
                (keydown.escape)="onCancel()"
                class="text-input textarea"
                rows="4"
              ></textarea>
            } @else {
              <input
                #textInput
                type="text"
                [ngModel]="value"
                (ngModelChange)="onValueChange($event)"
                (keydown.enter)="onSave()"
                (keydown.escape)="onCancel()"
                class="text-input"
              />
            }
          }
        }
      </div>

      <!-- Action buttons -->
      <div class="editor-actions">
        <button class="btn btn-primary" (click)="onSave()">Save</button>
        <button class="btn btn-secondary" (click)="onCancel()">Cancel</button>
        @if (canClear()) {
          <button class="btn btn-link" (click)="onClear()">Clear</button>
        }
      </div>

      <!-- Special value options -->
      @if (showSpecialOptions()) {
        <div class="special-options">
          @if (column?.notApplicable) {
            <button
              class="special-btn"
              [class.active]="value === 'not applicable'"
              (click)="setSpecialValue('not applicable')"
            >
              N/A
            </button>
          }
          @if (column?.notAvailable) {
            <button
              class="special-btn"
              [class.active]="value === 'not available'"
              (click)="setSpecialValue('not available')"
            >
              N/Avail
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .cell-editor-container {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px;
      background: white;
      border: 1px solid #ddd;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      min-width: 280px;
      max-width: 400px;
    }

    .cell-editor-container.expanded {
      min-width: 350px;
      max-width: 500px;
    }

    .editor-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 8px;
      border-bottom: 1px solid #eee;
    }

    .mode-badge {
      font-size: 11px;
      font-weight: 500;
      padding: 2px 8px;
      border-radius: 12px;
      background: #e0e0e0;
      color: #333;
    }

    .mode-badge.age { background: #e3f2fd; color: #1565c0; }
    .mode-badge.modification { background: #f3e5f5; color: #7b1fa2; }
    .mode-badge.cleavage { background: #fff3e0; color: #ef6c00; }
    .mode-badge.ontology { background: #e8f5e9; color: #2e7d32; }
    .mode-badge.select { background: #fce4ec; color: #c2185b; }

    .expand-btn {
      font-size: 11px;
      padding: 2px 8px;
      background: none;
      border: 1px solid #ccc;
      border-radius: 4px;
      cursor: pointer;
      color: #666;
    }

    .expand-btn:hover {
      background: #f5f5f5;
    }

    .editor-content {
      min-height: 40px;
    }

    .text-input {
      width: 100%;
      padding: 8px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 13px;
      font-family: inherit;
    }

    .text-input:focus {
      outline: none;
      border-color: #2196f3;
      box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
    }

    .text-input.textarea {
      resize: vertical;
      min-height: 80px;
    }

    .select-input {
      width: 100%;
      padding: 8px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 13px;
      background: white;
    }

    .select-input:focus {
      outline: none;
      border-color: #2196f3;
      box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
    }

    .editor-actions {
      display: flex;
      gap: 8px;
      padding-top: 8px;
      border-top: 1px solid #eee;
    }

    .btn {
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      border: none;
    }

    .btn-primary {
      background: #2196f3;
      color: white;
    }

    .btn-primary:hover {
      background: #1976d2;
    }

    .btn-secondary {
      background: #e0e0e0;
      color: #333;
    }

    .btn-secondary:hover {
      background: #d0d0d0;
    }

    .btn-link {
      background: none;
      color: #666;
      padding: 6px 8px;
    }

    .btn-link:hover {
      color: #d32f2f;
      text-decoration: underline;
    }

    .special-options {
      display: flex;
      gap: 8px;
      padding-top: 8px;
    }

    .special-btn {
      padding: 4px 8px;
      font-size: 11px;
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 4px;
      cursor: pointer;
      color: #666;
    }

    .special-btn:hover {
      background: #e0e0e0;
    }

    .special-btn.active {
      background: #fff3e0;
      border-color: #ffb74d;
      color: #e65100;
    }
  `],
})
export class SdrfCellEditorComponent implements OnInit, OnChanges, AfterViewInit {
  /** Current cell value */
  @Input() value = '';

  /** Column definition */
  @Input() column?: SdrfColumn;

  /** Row index (1-based) */
  @Input() rowIndex = 1;

  /** Save event */
  @Output() save = new EventEmitter<string>();

  /** Cancel event */
  @Output() cancel = new EventEmitter<void>();

  @ViewChild('textInput') textInput?: ElementRef<HTMLInputElement | HTMLTextAreaElement>;

  private syntaxService = new SdrfSyntaxService();

  // State
  isExpanded = signal(false);
  currentValue = signal('');

  // Computed editor mode
  editorMode = computed<EditorMode>(() => {
    if (!this.column) return 'text';

    // Check for special syntax types first
    const syntaxType = this.syntaxService.detectSpecialSyntax(
      this.column.name,
      this.column.type
    );

    if (syntaxType) {
      return this.syntaxTypeToEditorMode(syntaxType);
    }

    // Check for select columns
    const columnType = this.getColumnTypeFromName(this.column.name);
    if (SELECT_COLUMNS[columnType]) {
      return 'select';
    }

    // Check for ontology columns
    if (ONTOLOGY_COLUMNS.includes(columnType) || this.column.ontologyType) {
      return 'ontology';
    }

    return 'text';
  });

  // Select options for select-type columns
  selectOptions = computed(() => {
    if (!this.column) return [];
    const columnType = this.getColumnTypeFromName(this.column.name);
    return SELECT_COLUMNS[columnType] || [];
  });

  ngOnInit(): void {
    this.currentValue.set(this.value);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] && !changes['value'].firstChange) {
      this.currentValue.set(this.value);
    }
  }

  ngAfterViewInit(): void {
    // Focus the input after render
    setTimeout(() => {
      this.textInput?.nativeElement?.focus();
      if (this.textInput?.nativeElement instanceof HTMLInputElement) {
        this.textInput.nativeElement.select();
      }
    }, 50);
  }

  getModeLabel(): string {
    const mode = this.editorMode();
    switch (mode) {
      case 'age': return 'Age';
      case 'modification': return 'Modification';
      case 'cleavage': return 'Cleavage';
      case 'ontology': return 'Ontology';
      case 'select': return 'Select';
      default: return 'Text';
    }
  }

  getColumnTypeLabel(): string {
    if (!this.column) return 'term';
    return this.getColumnTypeFromName(this.column.name);
  }

  canExpand(): boolean {
    return this.editorMode() === 'text';
  }

  canClear(): boolean {
    return this.value !== '';
  }

  showSpecialOptions(): boolean {
    return !!(this.column?.notApplicable || this.column?.notAvailable);
  }

  toggleExpand(): void {
    this.isExpanded.set(!this.isExpanded());
  }

  onValueChange(newValue: string): void {
    this.currentValue.set(newValue);
    this.value = newValue;
  }

  onSave(): void {
    this.save.emit(this.currentValue());
  }

  onCancel(): void {
    this.cancel.emit();
  }

  onClear(): void {
    this.currentValue.set('');
    this.value = '';
  }

  setSpecialValue(specialValue: string): void {
    this.currentValue.set(specialValue);
    this.value = specialValue;
  }

  private syntaxTypeToEditorMode(syntaxType: SyntaxType): EditorMode {
    switch (syntaxType) {
      case 'age': return 'age';
      case 'modification': return 'modification';
      case 'cleavage': return 'cleavage';
      case 'pooled_sample':
      case 'synthetic_peptide':
        return 'select';
      default: return 'text';
    }
  }

  private getColumnTypeFromName(columnName: string): string {
    const match = columnName.toLowerCase().match(/\[(.*?)\]/);
    return match ? match[1] : columnName.toLowerCase();
  }
}
