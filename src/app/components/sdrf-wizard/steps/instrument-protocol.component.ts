/**
 * Instrument & Protocol Component (Step 5)
 *
 * Instrument selection, cleavage agent, and modifications.
 */

import {
  Component,
  Input,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { WizardStateService } from '../../../core/services/wizard-state.service';
import {
  OntologyTerm,
  WizardModification,
  WizardCleavageAgent,
  COMMON_MODIFICATIONS,
  COMMON_CLEAVAGE_AGENTS,
} from '../../../core/models/wizard';
import { olsService } from '../../../core/services/ols.service';

@Component({
  selector: 'wizard-instrument-protocol',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="step-container">
      <div class="step-header">
        <h3>Instrument & Protocol</h3>
        <p class="step-description">
          Configure the mass spectrometer, enzyme, and post-translational modifications.
        </p>
      </div>

      <!-- Instrument Selection -->
      <div class="form-section">
        <label class="form-label">
          Mass Spectrometer
          <span class="required">*</span>
          <span class="help-text">Select the instrument used for analysis</span>
        </label>

        <div class="autocomplete-container">
          <input
            type="text"
            class="form-input"
            [ngModel]="instrumentSearch()"
            (ngModelChange)="searchInstrument($event)"
            (focus)="showInstrumentResults.set(true)"
            placeholder="Search for instrument..."
          />
          @if (showInstrumentResults() && instrumentResults().length > 0) {
            <div class="autocomplete-dropdown">
              @for (result of instrumentResults(); track result.id) {
                <button
                  class="autocomplete-option"
                  (click)="selectInstrument(result)"
                >
                  <span class="option-label">{{ result.label }}</span>
                  <span class="option-id">{{ result.id }}</span>
                </button>
              }
            </div>
          }
        </div>

        @if (state().instrument) {
          <div class="selected-value">
            <span class="selected-label">{{ state().instrument!.label }}</span>
            <span class="selected-id">{{ state().instrument!.id }}</span>
            <button class="btn-clear" (click)="clearInstrument()">&times;</button>
          </div>
        }

        <div class="quick-select">
          <span class="quick-label">Common:</span>
          <button class="quick-btn" (click)="selectQuickInstrument('Q Exactive', 'MS:1001911')">Q Exactive</button>
          <button class="quick-btn" (click)="selectQuickInstrument('Orbitrap Fusion', 'MS:1002416')">Orbitrap Fusion</button>
          <button class="quick-btn" (click)="selectQuickInstrument('Orbitrap Exploris 480', 'MS:1003028')">Exploris 480</button>
          <button class="quick-btn" (click)="selectQuickInstrument('timsTOF Pro', 'MS:1003005')">timsTOF Pro</button>
        </div>
      </div>

      <!-- Cleavage Agent -->
      <div class="form-section">
        <label class="form-label">
          Cleavage Agent / Enzyme
          <span class="required">*</span>
          <span class="help-text">Enzyme used for protein digestion</span>
        </label>

        <div class="enzyme-grid">
          @for (enzyme of cleavageAgents; track enzyme.msAccession) {
            <button
              class="enzyme-card"
              [class.selected]="state().cleavageAgent?.msAccession === enzyme.msAccession"
              (click)="selectCleavageAgent(enzyme)"
            >
              <div class="enzyme-name">{{ enzyme.name }}</div>
              <div class="enzyme-id">{{ enzyme.msAccession }}</div>
            </button>
          }
        </div>

        @if (state().cleavageAgent) {
          <div class="selected-value">
            <span class="selected-label">{{ state().cleavageAgent!.name }}</span>
            <span class="selected-id">{{ state().cleavageAgent!.msAccession }}</span>
          </div>
        }
      </div>

      <!-- Modifications -->
      <div class="form-section">
        <label class="form-label">
          Post-Translational Modifications
          <span class="help-text">Select fixed and variable modifications (optional)</span>
        </label>

        <!-- Fixed Modifications -->
        <div class="mod-section">
          <h4>Fixed Modifications</h4>
          <p class="mod-description">Applied to all occurrences of the residue</p>

          <div class="mod-grid">
            @for (mod of fixedMods; track mod.name) {
              <button
                class="mod-btn"
                [class.selected]="isModSelected(mod)"
                (click)="toggleModification(mod)"
              >
                {{ mod.name }} ({{ mod.targetAminoAcids }})
              </button>
            }
          </div>
        </div>

        <!-- Variable Modifications -->
        <div class="mod-section">
          <h4>Variable Modifications</h4>
          <p class="mod-description">May or may not be present on peptides</p>

          <div class="mod-grid">
            @for (mod of variableMods; track mod.name) {
              <button
                class="mod-btn"
                [class.selected]="isModSelected(mod)"
                (click)="toggleModification(mod)"
              >
                {{ mod.name }} ({{ mod.targetAminoAcids }})
              </button>
            }
          </div>
        </div>

        <!-- Selected Modifications Summary -->
        @if (state().modifications.length > 0) {
          <div class="selected-mods">
            <h4>Selected Modifications</h4>
            <div class="mod-list">
              @for (mod of state().modifications; track mod.name; let i = $index) {
                <div class="mod-tag" [class.fixed]="mod.type === 'fixed'">
                  <span class="mod-type">{{ mod.type }}</span>
                  <span class="mod-name">{{ mod.name }}</span>
                  <span class="mod-site">({{ mod.targetAminoAcids }})</span>
                  <button class="mod-remove" (click)="removeModification(i)">&times;</button>
                </div>
              }
            </div>
          </div>
        }
      </div>

      <!-- Validation Message -->
      @if (!wizardState.isStep5Valid()) {
        <div class="validation-message">
          <span class="warning-icon">!</span>
          Please select an instrument and cleavage agent to continue.
        </div>
      }
    </div>
  `,
  styles: [`
    .step-container {
      max-width: 700px;
    }

    .step-header {
      margin-bottom: 24px;
    }

    .step-header h3 {
      margin: 0 0 8px 0;
      font-size: 18px;
      font-weight: 600;
      color: #1f2937;
    }

    .step-description {
      margin: 0;
      color: #6b7280;
      font-size: 14px;
    }

    .form-section {
      margin-bottom: 32px;
    }

    .form-label {
      display: block;
      font-size: 14px;
      font-weight: 500;
      color: #374151;
      margin-bottom: 12px;
    }

    .required {
      color: #ef4444;
      margin-left: 4px;
    }

    .help-text {
      display: block;
      font-size: 12px;
      font-weight: normal;
      color: #6b7280;
      margin-top: 4px;
    }

    .form-input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      transition: border-color 0.15s, box-shadow 0.15s;
    }

    .form-input:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .autocomplete-container {
      position: relative;
    }

    .autocomplete-dropdown {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: white;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
      max-height: 200px;
      overflow-y: auto;
      z-index: 100;
      margin-top: 4px;
    }

    .autocomplete-option {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
      padding: 10px 12px;
      border: none;
      background: none;
      text-align: left;
      cursor: pointer;
      transition: background 0.15s;
    }

    .autocomplete-option:hover {
      background: #f3f4f6;
    }

    .option-label {
      font-size: 14px;
      color: #1f2937;
    }

    .option-id {
      font-size: 12px;
      color: #6b7280;
    }

    .selected-value {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      padding: 8px 12px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 6px;
    }

    .selected-label {
      font-size: 14px;
      font-weight: 500;
      color: #1e40af;
    }

    .selected-id {
      font-size: 12px;
      color: #3b82f6;
    }

    .btn-clear {
      margin-left: auto;
      background: none;
      border: none;
      font-size: 18px;
      color: #6b7280;
      cursor: pointer;
      padding: 0 4px;
    }

    .btn-clear:hover {
      color: #ef4444;
    }

    .quick-select {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      flex-wrap: wrap;
    }

    .quick-label {
      font-size: 12px;
      color: #6b7280;
    }

    .quick-btn {
      padding: 6px 12px;
      background: #f3f4f6;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      font-size: 12px;
      color: #374151;
      cursor: pointer;
      transition: all 0.15s;
    }

    .quick-btn:hover {
      background: #e5e7eb;
      border-color: #d1d5db;
    }

    .enzyme-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }

    .enzyme-card {
      padding: 12px;
      background: white;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      cursor: pointer;
      text-align: left;
      transition: all 0.15s;
    }

    .enzyme-card:hover {
      border-color: #d1d5db;
      background: #f9fafb;
    }

    .enzyme-card.selected {
      border-color: #3b82f6;
      background: #eff6ff;
    }

    .enzyme-name {
      font-size: 13px;
      font-weight: 600;
      color: #1f2937;
    }

    .enzyme-id {
      font-size: 11px;
      color: #6b7280;
      margin-top: 2px;
    }

    .mod-section {
      margin-top: 16px;
      padding: 16px;
      background: #f9fafb;
      border-radius: 8px;
    }

    .mod-section h4 {
      margin: 0 0 4px 0;
      font-size: 13px;
      font-weight: 600;
      color: #374151;
    }

    .mod-description {
      margin: 0 0 12px 0;
      font-size: 12px;
      color: #6b7280;
    }

    .mod-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .mod-btn {
      padding: 8px 12px;
      background: white;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 12px;
      color: #374151;
      cursor: pointer;
      transition: all 0.15s;
    }

    .mod-btn:hover {
      background: #f3f4f6;
      border-color: #9ca3af;
    }

    .mod-btn.selected {
      background: #dbeafe;
      border-color: #3b82f6;
      color: #1e40af;
    }

    .selected-mods {
      margin-top: 16px;
      padding: 12px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
    }

    .selected-mods h4 {
      margin: 0 0 12px 0;
      font-size: 13px;
      font-weight: 600;
      color: #166534;
    }

    .mod-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .mod-tag {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background: white;
      border: 1px solid #d1d5db;
      border-radius: 6px;
    }

    .mod-tag.fixed {
      background: #fef3c7;
      border-color: #fcd34d;
    }

    .mod-type {
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 600;
      color: #6b7280;
    }

    .mod-name {
      font-size: 12px;
      font-weight: 500;
      color: #1f2937;
    }

    .mod-site {
      font-size: 11px;
      color: #6b7280;
    }

    .mod-remove {
      background: none;
      border: none;
      font-size: 14px;
      color: #9ca3af;
      cursor: pointer;
      padding: 0 2px;
      margin-left: 4px;
    }

    .mod-remove:hover {
      color: #ef4444;
    }

    .validation-message {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: #fef3c7;
      border: 1px solid #fcd34d;
      border-radius: 8px;
      font-size: 13px;
      color: #92400e;
      margin-top: 24px;
    }

    .warning-icon {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #f59e0b;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
    }

    @media (max-width: 600px) {
      .enzyme-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `],
})
export class InstrumentProtocolComponent {
  @Input() aiEnabled = false;

  readonly wizardState = inject(WizardStateService);
  private readonly ols = olsService;

  readonly state = this.wizardState.state;
  readonly cleavageAgents = COMMON_CLEAVAGE_AGENTS;

  readonly fixedMods = COMMON_MODIFICATIONS.filter(m => m.type === 'fixed');
  readonly variableMods = COMMON_MODIFICATIONS.filter(m => m.type === 'variable');

  // Instrument search
  readonly instrumentSearch = signal('');
  readonly instrumentResults = signal<OntologyTerm[]>([]);
  readonly showInstrumentResults = signal(false);

  async searchInstrument(query: string): Promise<void> {
    this.instrumentSearch.set(query);
    if (query.length < 2) {
      this.instrumentResults.set([]);
      return;
    }

    try {
      const results = await this.ols.searchInstrument(query);
      this.instrumentResults.set(results.map(r => ({
        id: r.id,
        label: r.label,
        ontology: r.ontologyPrefix?.toUpperCase() || 'MS',
      })));
      this.showInstrumentResults.set(true);
    } catch {
      this.instrumentResults.set([]);
    }
  }

  selectInstrument(term: OntologyTerm): void {
    this.wizardState.setInstrument(term);
    this.instrumentSearch.set('');
    this.instrumentResults.set([]);
    this.showInstrumentResults.set(false);
  }

  selectQuickInstrument(label: string, id: string): void {
    this.selectInstrument({ id, label, ontology: 'MS' });
  }

  clearInstrument(): void {
    this.wizardState.setInstrument(null as any);
  }

  selectCleavageAgent(agent: WizardCleavageAgent): void {
    this.wizardState.setCleavageAgent(agent);
  }

  isModSelected(mod: WizardModification): boolean {
    return this.state().modifications.some(m => m.name === mod.name);
  }

  toggleModification(mod: WizardModification): void {
    if (this.isModSelected(mod)) {
      const index = this.state().modifications.findIndex(m => m.name === mod.name);
      if (index >= 0) {
        this.wizardState.removeModification(index);
      }
    } else {
      this.wizardState.addModification(mod);
    }
  }

  removeModification(index: number): void {
    this.wizardState.removeModification(index);
  }
}
