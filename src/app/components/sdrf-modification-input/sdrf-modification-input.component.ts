/**
 * SDRF Modification Input Component
 *
 * Specialized input for modification parameters in SDRF format.
 * Format: NT=Oxidation;MT=Variable;TA=M;AC=UNIMOD:35
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
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  SdrfSyntaxService,
  ModificationParameters,
} from '../../core/services/sdrf-syntax.service';
import { UnimodService, UnimodEntry } from '../../core/services/unimod.service';

@Component({
  selector: 'sdrf-modification-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modification-input-container">
      <!-- Name of Term (with autocomplete) -->
      <div class="field-group">
        <label>Name of Term (NT)*</label>
        <div class="autocomplete-wrapper">
          <input
            type="text"
            [ngModel]="nt()"
            (ngModelChange)="updateNt($event)"
            (input)="onNtInput($event)"
            placeholder="e.g., Oxidation, Carbamidomethyl"
            class="field-input"
          />
          @if (suggestions().length > 0) {
            <div class="suggestions-dropdown">
              @for (suggestion of suggestions(); track suggestion.accession) {
                <div
                  class="suggestion-item"
                  (click)="selectSuggestion(suggestion)"
                >
                  <span class="suggestion-name">{{ suggestion.name }}</span>
                  <span class="suggestion-accession">{{ suggestion.accession }}</span>
                  <span class="suggestion-mass">Δ{{ suggestion.deltaMonoMass.toFixed(4) }}</span>
                </div>
              }
            </div>
          }
        </div>
      </div>

      <!-- Target Amino Acid -->
      <div class="field-group">
        <label>Target Amino Acid (TA)*</label>
        <input
          type="text"
          [ngModel]="ta()"
          (ngModelChange)="updateTa($event)"
          placeholder="e.g., M, K, C"
          class="field-input"
          maxlength="10"
        />
        @if (selectedMod() && selectedMod()!.sites.length > 0) {
          <div class="hint">
            Valid sites: {{ selectedMod()!.sites.join(', ') }}
          </div>
        }
      </div>

      <!-- Modification Type -->
      <div class="field-group">
        <label>Modification Type (MT)</label>
        <select
          [ngModel]="mt()"
          (ngModelChange)="updateMt($event)"
          class="field-input"
        >
          <option value="">-- Select --</option>
          <option value="Fixed">Fixed</option>
          <option value="Variable">Variable</option>
          <option value="Annotated">Annotated</option>
        </select>
      </div>

      <!-- Accession -->
      <div class="field-group">
        <label>Accession (AC)</label>
        <input
          type="text"
          [ngModel]="ac()"
          (ngModelChange)="updateAc($event)"
          placeholder="e.g., UNIMOD:35"
          class="field-input"
        />
      </div>

      <!-- Position in Polypeptide -->
      <div class="field-group">
        <label>Position (PP)</label>
        <select
          [ngModel]="pp()"
          (ngModelChange)="updatePp($event)"
          class="field-input"
        >
          <option value="">-- Select --</option>
          <option value="Anywhere">Anywhere</option>
          <option value="Protein N-term">Protein N-term</option>
          <option value="Protein C-term">Protein C-term</option>
          <option value="Any N-term">Any N-term</option>
          <option value="Any C-term">Any C-term</option>
        </select>
      </div>

      <!-- Chemical Formula -->
      <div class="field-group">
        <label>Chemical Formula (CF)</label>
        <input
          type="text"
          [ngModel]="cf()"
          (ngModelChange)="updateCf($event)"
          placeholder="e.g., O, H3C2NO"
          class="field-input"
        />
      </div>

      <!-- Monoisotopic Mass -->
      <div class="field-group">
        <label>Monoisotopic Mass (MM)</label>
        <input
          type="text"
          [ngModel]="mm()"
          (ngModelChange)="updateMm($event)"
          placeholder="e.g., 15.994915"
          class="field-input"
        />
      </div>

      <!-- Output Preview -->
      <div class="output-preview">
        <span class="label">Output:</span>
        <code>{{ formattedValue() || '(empty)' }}</code>
      </div>

      @if (validationErrors().length > 0) {
        <div class="validation-errors">
          @for (error of validationErrors(); track $index) {
            <span class="error">{{ error }}</span>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .modification-input-container {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: #fafafa;
    }

    .field-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .field-group label {
      font-size: 12px;
      font-weight: 500;
      color: #333;
    }

    .field-input {
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

    select.field-input {
      background: white;
    }

    .autocomplete-wrapper {
      position: relative;
    }

    .suggestions-dropdown {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      max-height: 200px;
      overflow-y: auto;
      background: white;
      border: 1px solid #ddd;
      border-top: none;
      border-radius: 0 0 4px 4px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      z-index: 100;
    }

    .suggestion-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      cursor: pointer;
      border-bottom: 1px solid #eee;
    }

    .suggestion-item:hover {
      background: #f5f5f5;
    }

    .suggestion-item:last-child {
      border-bottom: none;
    }

    .suggestion-name {
      font-weight: 500;
      flex: 1;
    }

    .suggestion-accession {
      font-size: 11px;
      color: #666;
      font-family: monospace;
    }

    .suggestion-mass {
      font-size: 11px;
      color: #999;
    }

    .hint {
      font-size: 11px;
      color: #666;
      margin-top: 2px;
    }

    .output-preview {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 8px;
      background: #fff;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      margin-top: 8px;
    }

    .output-preview .label {
      font-size: 12px;
      color: #666;
      flex-shrink: 0;
    }

    .output-preview code {
      font-family: monospace;
      font-size: 12px;
      color: #333;
      word-break: break-all;
    }

    .validation-errors {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .validation-errors .error {
      font-size: 12px;
      color: #d32f2f;
    }
  `],
})
export class SdrfModificationInputComponent implements OnInit, OnChanges {
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();

  private syntaxService = new SdrfSyntaxService();
  private unimodService = new UnimodService();

  // Field values
  nt = signal('');
  ta = signal('');
  mt = signal('');
  ac = signal('');
  pp = signal('');
  cf = signal('');
  mm = signal('');

  // Autocomplete
  suggestions = signal<UnimodEntry[]>([]);
  selectedMod = signal<UnimodEntry | null>(null);

  // Validation
  validationErrors = signal<string[]>([]);

  // Computed formatted value
  formattedValue = computed(() => {
    const params: ModificationParameters = {};

    if (this.nt()) params.NT = this.nt();
    if (this.ta()) params.TA = this.ta();
    if (this.mt()) params.MT = this.mt();
    if (this.ac()) params.AC = this.ac();
    if (this.pp()) params.PP = this.pp();
    if (this.cf()) params.CF = this.cf();
    if (this.mm()) params.MM = this.mm();

    return this.syntaxService.formatValue('modification', params);
  });

  ngOnInit(): void {
    this.parseValue();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] && !changes['value'].firstChange) {
      this.parseValue();
    }
  }

  private parseValue(): void {
    if (!this.value) {
      this.resetFields();
      return;
    }

    const parsed = this.syntaxService.parseValue(
      'modification',
      this.value
    ) as ModificationParameters;

    if (parsed) {
      this.nt.set(parsed.NT || '');
      this.ta.set(parsed.TA || '');
      this.mt.set(parsed.MT || '');
      this.ac.set(parsed.AC || '');
      this.pp.set(parsed.PP || '');
      this.cf.set(parsed.CF || '');
      this.mm.set(parsed.MM || '');

      // Try to find matching Unimod entry
      if (parsed.AC) {
        this.unimodService.getByAccession(parsed.AC).then((mod) => {
          this.selectedMod.set(mod || null);
        });
      }
    } else {
      this.resetFields();
    }
  }

  private resetFields(): void {
    this.nt.set('');
    this.ta.set('');
    this.mt.set('');
    this.ac.set('');
    this.pp.set('');
    this.cf.set('');
    this.mm.set('');
    this.selectedMod.set(null);
  }

  // Field updates
  updateNt(value: string): void {
    this.nt.set(value);
    this.emitValue();
  }

  updateTa(value: string): void {
    // Uppercase amino acids
    this.ta.set(value.toUpperCase());
    this.emitValue();
  }

  updateMt(value: string): void {
    this.mt.set(value);
    this.emitValue();
  }

  updateAc(value: string): void {
    this.ac.set(value);
    this.emitValue();
  }

  updatePp(value: string): void {
    this.pp.set(value);
    this.emitValue();
  }

  updateCf(value: string): void {
    this.cf.set(value);
    this.emitValue();
  }

  updateMm(value: string): void {
    this.mm.set(value);
    this.emitValue();
  }

  // Autocomplete
  async onNtInput(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const query = input.value.trim();

    if (query.length < 2) {
      this.suggestions.set([]);
      return;
    }

    const results = await this.unimodService.searchModifications(query, 8);
    this.suggestions.set(results);
  }

  selectSuggestion(mod: UnimodEntry): void {
    this.nt.set(mod.name);
    this.ac.set(mod.accession);
    this.cf.set(mod.deltaComposition);
    this.mm.set(mod.deltaMonoMass.toString());
    this.selectedMod.set(mod);
    this.suggestions.set([]);

    // Set default target amino acid if only one site
    if (mod.sites.length === 1) {
      this.ta.set(mod.sites[0]);
    }

    // Set default position if only one
    if (mod.positions.length === 1) {
      this.pp.set(mod.positions[0]);
    }

    this.emitValue();
  }

  private emitValue(): void {
    const formatted = this.formattedValue();
    this.validate(formatted);
    this.valueChange.emit(formatted);
  }

  private validate(value: string): void {
    if (!value) {
      this.validationErrors.set([]);
      return;
    }

    const parsed = this.syntaxService.parseValue(
      'modification',
      value
    ) as ModificationParameters;

    if (parsed) {
      const result = this.syntaxService.validateValue('modification', parsed);
      this.validationErrors.set([...result.errors, ...(result.warnings || [])]);
    } else {
      this.validationErrors.set(['Invalid modification format']);
    }
  }
}
