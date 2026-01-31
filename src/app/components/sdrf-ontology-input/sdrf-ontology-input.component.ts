/**
 * SDRF Ontology Input Component
 *
 * Generic ontology autocomplete input using the EBI OLS service.
 * Supports various ontology types: organism, disease, cell type, tissue, etc.
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
  HostListener,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DirectOlsService } from '../../core/services/ols.service';
import { OntologySuggestion } from '../../core/models/ontology';

/**
 * Predefined ontology configurations for common SDRF column types.
 */
const COLUMN_ONTOLOGY_MAP: Record<string, { ontologies: string[]; searchMethod?: string }> = {
  'organism': { ontologies: ['ncbitaxon'], searchMethod: 'searchOrganism' },
  'disease': { ontologies: ['efo', 'mondo', 'doid'], searchMethod: 'searchDisease' },
  'cell type': { ontologies: ['cl', 'bto'], searchMethod: 'searchCellType' },
  'cell line': { ontologies: ['clo', 'efo', 'bto'] },
  'tissue': { ontologies: ['uberon', 'bto'], searchMethod: 'searchTissue' },
  'organ': { ontologies: ['uberon'] },
  'developmental stage': { ontologies: ['uberon', 'efo'] },
  'sex': { ontologies: ['pato'] },
  'ancestry category': { ontologies: ['hancestro'] },
  'instrument': { ontologies: ['ms'], searchMethod: 'searchInstrument' },
  'enrichment process': { ontologies: ['sep', 'obi'] },
  'label': { ontologies: ['ms', 'pride'] },
  'fraction identifier': { ontologies: ['ms'] },
  'technical replicate': { ontologies: [] },
  'data file': { ontologies: [] },
};

@Component({
  selector: 'sdrf-ontology-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ontology-input-container">
      <div class="input-wrapper">
        <input
          type="text"
          [ngModel]="inputValue()"
          (ngModelChange)="onInputChange($event)"
          (focus)="onFocus()"
          (blur)="onBlur()"
          [placeholder]="placeholder"
          class="field-input"
        />
        @if (loading()) {
          <span class="loading-indicator"></span>
        }
      </div>

      @if (showDropdown() && suggestions().length > 0) {
        <div class="suggestions-dropdown">
          @for (suggestion of suggestions(); track suggestion.iri) {
            <div
              class="suggestion-item"
              [class.selected]="selectedIndex() === $index"
              (mousedown)="selectSuggestion(suggestion)"
            >
              <div class="suggestion-main">
                <span class="suggestion-label">{{ suggestion.label }}</span>
                <span class="suggestion-id">{{ suggestion.id }}</span>
              </div>
              @if (suggestion.description) {
                <div class="suggestion-description">
                  {{ suggestion.description | slice:0:100 }}{{ suggestion.description.length > 100 ? '...' : '' }}
                </div>
              }
            </div>
          }
        </div>
      }

      @if (showDropdown() && !loading() && suggestions().length === 0 && inputValue().length >= 2) {
        <div class="suggestions-dropdown">
          <div class="no-results">No results found</div>
        </div>
      }

      @if (selectedTerm()) {
        <div class="selected-term">
          <span class="term-label">{{ selectedTerm()!.label }}</span>
          <span class="term-id">({{ selectedTerm()!.id }})</span>
          <button class="clear-btn" (click)="clearSelection()">×</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .ontology-input-container {
      position: relative;
      width: 100%;
    }

    .input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .field-input {
      width: 100%;
      padding: 8px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 13px;
    }

    .field-input:focus {
      outline: none;
      border-color: #2196f3;
      box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
    }

    .loading-indicator {
      position: absolute;
      right: 8px;
      width: 16px;
      height: 16px;
      border: 2px solid #ddd;
      border-top-color: #2196f3;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .suggestions-dropdown {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      max-height: 250px;
      overflow-y: auto;
      background: white;
      border: 1px solid #ddd;
      border-top: none;
      border-radius: 0 0 4px 4px;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
      z-index: 100;
    }

    .suggestion-item {
      padding: 8px 12px;
      cursor: pointer;
      border-bottom: 1px solid #eee;
    }

    .suggestion-item:hover,
    .suggestion-item.selected {
      background: #f0f7ff;
    }

    .suggestion-item:last-child {
      border-bottom: none;
    }

    .suggestion-main {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .suggestion-label {
      font-weight: 500;
      flex: 1;
    }

    .suggestion-id {
      font-size: 11px;
      color: #666;
      font-family: monospace;
      background: #f0f0f0;
      padding: 2px 4px;
      border-radius: 2px;
    }

    .suggestion-description {
      font-size: 11px;
      color: #666;
      margin-top: 4px;
      line-height: 1.3;
    }

    .no-results {
      padding: 12px;
      text-align: center;
      color: #666;
      font-size: 13px;
    }

    .selected-term {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 6px;
      padding: 6px 8px;
      background: #e3f2fd;
      border-radius: 4px;
      font-size: 12px;
    }

    .term-label {
      font-weight: 500;
    }

    .term-id {
      color: #666;
      font-family: monospace;
    }

    .clear-btn {
      margin-left: auto;
      background: none;
      border: none;
      font-size: 16px;
      cursor: pointer;
      color: #666;
      padding: 0 4px;
    }

    .clear-btn:hover {
      color: #d32f2f;
    }
  `],
})
export class SdrfOntologyInputComponent implements OnInit, OnChanges {
  /** Current value */
  @Input() value = '';

  /** Column name to determine ontology type */
  @Input() columnName = '';

  /** Explicit ontologies to search */
  @Input() ontologies: string[] = [];

  /** Placeholder text */
  @Input() placeholder = 'Type to search...';

  /** Allow free text (non-ontology values) */
  @Input() allowFreeText = true;

  /** Value change event */
  @Output() valueChange = new EventEmitter<string>();

  /** Term selection event with full ontology info */
  @Output() termSelected = new EventEmitter<OntologySuggestion | null>();

  private olsService = new DirectOlsService();
  private searchTimeout?: ReturnType<typeof setTimeout>;

  // State
  inputValue = signal('');
  suggestions = signal<OntologySuggestion[]>([]);
  selectedTerm = signal<OntologySuggestion | null>(null);
  showDropdown = signal(false);
  loading = signal(false);
  selectedIndex = signal(-1);

  constructor(private elementRef: ElementRef) {}

  ngOnInit(): void {
    this.inputValue.set(this.value);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] && !changes['value'].firstChange) {
      this.inputValue.set(this.value);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.showDropdown.set(false);
    }
  }

  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (!this.showDropdown()) return;

    const sugg = this.suggestions();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectedIndex.set(Math.min(this.selectedIndex() + 1, sugg.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.selectedIndex.set(Math.max(this.selectedIndex() - 1, -1));
        break;
      case 'Enter':
        event.preventDefault();
        if (this.selectedIndex() >= 0 && sugg[this.selectedIndex()]) {
          this.selectSuggestion(sugg[this.selectedIndex()]);
        } else if (this.allowFreeText) {
          this.emitValue();
        }
        break;
      case 'Escape':
        this.showDropdown.set(false);
        break;
    }
  }

  onInputChange(value: string): void {
    this.inputValue.set(value);
    this.selectedTerm.set(null);
    this.selectedIndex.set(-1);

    // Debounce search
    clearTimeout(this.searchTimeout);
    if (value.length >= 2) {
      this.loading.set(true);
      this.searchTimeout = setTimeout(() => {
        this.search(value);
      }, 300);
    } else {
      this.suggestions.set([]);
      this.loading.set(false);
    }

    // Emit for free text
    if (this.allowFreeText) {
      this.valueChange.emit(value);
    }
  }

  onFocus(): void {
    if (this.suggestions().length > 0 || this.inputValue().length >= 2) {
      this.showDropdown.set(true);
    }
  }

  onBlur(): void {
    // Delay to allow click on suggestions
    setTimeout(() => {
      if (this.allowFreeText) {
        this.emitValue();
      }
    }, 200);
  }

  selectSuggestion(suggestion: OntologySuggestion): void {
    this.inputValue.set(suggestion.label);
    this.selectedTerm.set(suggestion);
    this.showDropdown.set(false);
    this.suggestions.set([]);

    this.valueChange.emit(suggestion.label);
    this.termSelected.emit(suggestion);
  }

  clearSelection(): void {
    this.inputValue.set('');
    this.selectedTerm.set(null);
    this.valueChange.emit('');
    this.termSelected.emit(null);
  }

  private async search(query: string): Promise<void> {
    const ontologyConfig = this.getOntologyConfig();

    try {
      let results: OntologySuggestion[];

      // Use specialized search method if available
      if (ontologyConfig.searchMethod) {
        const method = ontologyConfig.searchMethod as keyof DirectOlsService;
        results = await (this.olsService[method] as (q: string, l?: number) => Promise<OntologySuggestion[]>)(query, 10);
      } else if (ontologyConfig.ontologies.length > 0) {
        const response = await this.olsService.search({
          query,
          ontology: ontologyConfig.ontologies,
          rows: 10,
        });
        results = response.suggestions;
      } else {
        // No ontology restriction - search all
        const response = await this.olsService.search({
          query,
          rows: 10,
        });
        results = response.suggestions;
      }

      this.suggestions.set(results);
      this.showDropdown.set(true);
    } catch (error) {
      console.error('Ontology search error:', error);
      this.suggestions.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  private getOntologyConfig(): { ontologies: string[]; searchMethod?: string } {
    // Use explicit ontologies if provided
    if (this.ontologies.length > 0) {
      return { ontologies: this.ontologies };
    }

    // Extract column type from column name
    const match = this.columnName.toLowerCase().match(/\[(.*?)\]/);
    const columnType = match ? match[1] : this.columnName.toLowerCase();

    // Look up in predefined map
    return COLUMN_ONTOLOGY_MAP[columnType] || { ontologies: [] };
  }

  private emitValue(): void {
    this.valueChange.emit(this.inputValue());
  }
}
