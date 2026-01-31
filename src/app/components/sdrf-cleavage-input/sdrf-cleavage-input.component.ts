/**
 * SDRF Cleavage Input Component
 *
 * Specialized input for cleavage agent details in SDRF format.
 * Format: NT=Trypsin;AC=MS:1001251;CS=[KR]|{P}
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
  CleavageAgentDetails,
} from '../../core/services/sdrf-syntax.service';

/**
 * Common cleavage agents with their MS ontology accessions.
 */
const COMMON_CLEAVAGE_AGENTS = [
  { name: 'Trypsin', accession: 'MS:1001251', site: '[KR]|{P}' },
  { name: 'Trypsin/P', accession: 'MS:1001313', site: '[KR]' },
  { name: 'Lys-C', accession: 'MS:1001309', site: 'K|' },
  { name: 'Lys-N', accession: 'MS:1001310', site: '|K' },
  { name: 'Arg-C', accession: 'MS:1001303', site: 'R|{P}' },
  { name: 'Asp-N', accession: 'MS:1001304', site: '|D' },
  { name: 'Chymotrypsin', accession: 'MS:1001306', site: '[FYWL]|{P}' },
  { name: 'Glu-C', accession: 'MS:1001917', site: '[DE]|{P}' },
  { name: 'PepsinA', accession: 'MS:1001311', site: '[FL]|' },
  { name: 'CNBr', accession: 'MS:1001307', site: 'M|' },
  { name: 'no cleavage', accession: 'MS:1001955', site: '' },
  { name: 'unspecific cleavage', accession: 'MS:1001956', site: '' },
];

@Component({
  selector: 'sdrf-cleavage-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="cleavage-input-container">
      <!-- Quick Select -->
      <div class="field-group">
        <label>Quick Select</label>
        <select
          (change)="selectPreset($event)"
          class="field-input"
        >
          <option value="">-- Select common enzyme --</option>
          @for (agent of commonAgents; track agent.accession) {
            <option [value]="agent.accession">{{ agent.name }}</option>
          }
        </select>
      </div>

      <!-- Name of Term -->
      <div class="field-group">
        <label>Name of Term (NT)*</label>
        <input
          type="text"
          [ngModel]="nt()"
          (ngModelChange)="updateNt($event)"
          placeholder="e.g., Trypsin"
          class="field-input"
        />
      </div>

      <!-- Accession -->
      <div class="field-group">
        <label>Accession (AC)</label>
        <input
          type="text"
          [ngModel]="ac()"
          (ngModelChange)="updateAc($event)"
          placeholder="e.g., MS:1001251"
          class="field-input"
        />
      </div>

      <!-- Cleavage Site -->
      <div class="field-group">
        <label>Cleavage Site Regex (CS)</label>
        <input
          type="text"
          [ngModel]="cs()"
          (ngModelChange)="updateCs($event)"
          placeholder="e.g., [KR]|{P}"
          class="field-input"
        />
        <div class="hint">
          Format: [allowed]|&#123;not allowed&#125; — e.g., [KR]|&#123;P&#125; means cleave after K or R, not followed by P
        </div>
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
    .cleavage-input-container {
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
export class SdrfCleavageInputComponent implements OnInit, OnChanges {
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();

  private syntaxService = new SdrfSyntaxService();

  readonly commonAgents = COMMON_CLEAVAGE_AGENTS;

  // Field values
  nt = signal('');
  ac = signal('');
  cs = signal('');

  // Validation
  validationErrors = signal<string[]>([]);

  // Computed formatted value
  formattedValue = computed(() => {
    const params: CleavageAgentDetails = {};

    if (this.nt()) params.NT = this.nt();
    if (this.ac()) params.AC = this.ac();
    if (this.cs()) params.CS = this.cs();

    return this.syntaxService.formatValue('cleavage', params);
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
      'cleavage',
      this.value
    ) as CleavageAgentDetails;

    if (parsed) {
      this.nt.set(parsed.NT || '');
      this.ac.set(parsed.AC || '');
      this.cs.set(parsed.CS || '');
    } else {
      this.resetFields();
    }
  }

  private resetFields(): void {
    this.nt.set('');
    this.ac.set('');
    this.cs.set('');
  }

  selectPreset(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const accession = select.value;

    if (!accession) return;

    const agent = this.commonAgents.find((a) => a.accession === accession);
    if (agent) {
      this.nt.set(agent.name);
      this.ac.set(agent.accession);
      this.cs.set(agent.site);
      this.emitValue();
    }

    // Reset select
    select.value = '';
  }

  // Field updates
  updateNt(value: string): void {
    this.nt.set(value);
    this.emitValue();
  }

  updateAc(value: string): void {
    this.ac.set(value);
    this.emitValue();
  }

  updateCs(value: string): void {
    this.cs.set(value);
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
      'cleavage',
      value
    ) as CleavageAgentDetails;

    if (parsed) {
      const result = this.syntaxService.validateValue('cleavage', parsed);
      this.validationErrors.set([...result.errors, ...(result.warnings || [])]);
    } else {
      this.validationErrors.set(['Invalid cleavage agent format']);
    }
  }
}
