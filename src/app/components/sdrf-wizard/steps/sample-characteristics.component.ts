/**
 * Sample Characteristics Component (Step 2)
 *
 * Organism, disease, organism part, and template-specific fields.
 */

import {
  Component,
  Input,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { WizardStateService } from '../../../core/services/wizard-state.service';
import { OntologyTerm } from '../../../core/models/wizard';
import { olsService, type DirectOlsService } from '../../../core/services/ols.service';

@Component({
  selector: 'wizard-sample-characteristics',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="step-container">
      <div class="step-header">
        <h3>Sample Characteristics</h3>
        <p class="step-description">
          Define the biological characteristics shared by all your samples.
          Sample-specific values can be set in the next step.
        </p>
      </div>

      <!-- Organism -->
      <div class="form-section">
        <label class="form-label">
          Organism
          <span class="required">*</span>
          <span class="help-text">Species of your samples (e.g., Homo sapiens, Mus musculus)</span>
        </label>
        <div class="autocomplete-container">
          <input
            type="text"
            class="form-input"
            [ngModel]="organismSearch()"
            (ngModelChange)="searchOrganism($event)"
            (focus)="showOrganismResults.set(true)"
            placeholder="Search for organism..."
          />
          @if (showOrganismResults() && organismResults().length > 0) {
            <div class="autocomplete-dropdown">
              @for (result of organismResults(); track result.id) {
                <button
                  class="autocomplete-option"
                  (click)="selectOrganism(result)"
                >
                  <span class="option-label">{{ result.label }}</span>
                  <span class="option-id">{{ result.id }}</span>
                </button>
              }
            </div>
          }
        </div>
        @if (state().organism) {
          <div class="selected-value">
            <span class="selected-label">{{ state().organism!.label }}</span>
            <span class="selected-id">{{ state().organism!.id }}</span>
            <button class="btn-clear" (click)="clearOrganism()">&times;</button>
          </div>
        }
        <div class="quick-select">
          <span class="quick-label">Common:</span>
          <button class="quick-btn" (click)="selectQuickOrganism('Homo sapiens', 'NCBITaxon:9606')">Homo sapiens</button>
          <button class="quick-btn" (click)="selectQuickOrganism('Mus musculus', 'NCBITaxon:10090')">Mus musculus</button>
          <button class="quick-btn" (click)="selectQuickOrganism('Rattus norvegicus', 'NCBITaxon:10116')">Rattus norvegicus</button>
        </div>
      </div>

      <!-- Disease -->
      <div class="form-section">
        <label class="form-label">
          Disease
          <span class="required">*</span>
          <span class="help-text">Disease being studied or 'normal' for healthy samples</span>
        </label>
        <div class="autocomplete-container">
          <input
            type="text"
            class="form-input"
            [ngModel]="diseaseSearch()"
            (ngModelChange)="searchDisease($event)"
            (focus)="showDiseaseResults.set(true)"
            placeholder="Search for disease or type 'normal'..."
          />
          @if (showDiseaseResults() && diseaseResults().length > 0) {
            <div class="autocomplete-dropdown">
              @for (result of diseaseResults(); track result.id) {
                <button
                  class="autocomplete-option"
                  (click)="selectDisease(result)"
                >
                  <span class="option-label">{{ result.label }}</span>
                  <span class="option-id">{{ result.id }}</span>
                </button>
              }
            </div>
          }
        </div>
        @if (state().disease) {
          <div class="selected-value">
            @if (isDiseaseString()) {
              <span class="selected-label">{{ state().disease }}</span>
            } @else {
              <span class="selected-label">{{ getDiseaseLabel() }}</span>
              <span class="selected-id">{{ getDiseaseId() }}</span>
            }
            <button class="btn-clear" (click)="clearDisease()">&times;</button>
          </div>
        }
        <div class="quick-select">
          <span class="quick-label">Common:</span>
          <button class="quick-btn" (click)="selectQuickDisease('normal')">normal</button>
          <button class="quick-btn" (click)="selectQuickDiseaseOntology('breast cancer', 'MONDO:0007254')">breast cancer</button>
          <button class="quick-btn" (click)="selectQuickDiseaseOntology('colorectal cancer', 'MONDO:0005575')">colorectal cancer</button>
        </div>
      </div>

      <!-- Organism Part -->
      <div class="form-section">
        <label class="form-label">
          Organism Part / Tissue
          <span class="required">*</span>
          <span class="help-text">Tissue or body part (e.g., liver, blood plasma, whole organism)</span>
        </label>
        <div class="autocomplete-container">
          <input
            type="text"
            class="form-input"
            [ngModel]="organismPartSearch()"
            (ngModelChange)="searchOrganismPart($event)"
            (focus)="showOrganismPartResults.set(true)"
            placeholder="Search for tissue/organ..."
          />
          @if (showOrganismPartResults() && organismPartResults().length > 0) {
            <div class="autocomplete-dropdown">
              @for (result of organismPartResults(); track result.id) {
                <button
                  class="autocomplete-option"
                  (click)="selectOrganismPart(result)"
                >
                  <span class="option-label">{{ result.label }}</span>
                  <span class="option-id">{{ result.id }}</span>
                </button>
              }
            </div>
          }
        </div>
        @if (state().organismPart) {
          <div class="selected-value">
            <span class="selected-label">{{ state().organismPart!.label }}</span>
            <span class="selected-id">{{ state().organismPart!.id }}</span>
            <button class="btn-clear" (click)="clearOrganismPart()">&times;</button>
          </div>
        }
        <div class="quick-select">
          <span class="quick-label">Common:</span>
          <button class="quick-btn" (click)="selectQuickOrganismPart('liver', 'UBERON:0002107')">liver</button>
          <button class="quick-btn" (click)="selectQuickOrganismPart('blood plasma', 'UBERON:0001969')">blood plasma</button>
          <button class="quick-btn" (click)="selectQuickOrganismPart('whole organism', 'UBERON:0000468')">whole organism</button>
        </div>
      </div>

      <!-- Template-specific fields -->
      @switch (state().template) {
        @case ('human') {
          <div class="template-fields">
            <h4>Human-specific Fields</h4>

            <div class="form-row">
              <div class="form-section">
                <label class="form-label">
                  Default Sex
                  <span class="help-text">Biological sex (can be overridden per sample)</span>
                </label>
                <select
                  class="form-select"
                  [ngModel]="state().defaultSex"
                  (ngModelChange)="wizardState.setDefaultSex($event)"
                >
                  <option [ngValue]="null">-- Select --</option>
                  <option value="male">male</option>
                  <option value="female">female</option>
                  <option value="not available">not available</option>
                </select>
              </div>

              <div class="form-section">
                <label class="form-label">
                  Default Age
                  <span class="help-text">Format: 25Y (years), 6M (months), or not available</span>
                </label>
                <input
                  type="text"
                  class="form-input"
                  [ngModel]="state().defaultAge"
                  (ngModelChange)="wizardState.setDefaultAge($event)"
                  placeholder="e.g., 45Y or not available"
                />
              </div>
            </div>
          </div>
        }

        @case ('cell-line') {
          <div class="template-fields">
            <h4>Cell Line Fields</h4>

            <div class="form-section">
              <label class="form-label">
                Cell Line Name
                <span class="help-text">Name of the cell line (e.g., HeLa, HEK293, MCF-7)</span>
              </label>
              <input
                type="text"
                class="form-input"
                [ngModel]="state().defaultCellLine"
                (ngModelChange)="wizardState.setDefaultCellLine($event)"
                placeholder="e.g., HeLa"
              />
              <div class="quick-select">
                <span class="quick-label">Common:</span>
                <button class="quick-btn" (click)="wizardState.setDefaultCellLine('HeLa')">HeLa</button>
                <button class="quick-btn" (click)="wizardState.setDefaultCellLine('HEK293')">HEK293</button>
                <button class="quick-btn" (click)="wizardState.setDefaultCellLine('MCF-7')">MCF-7</button>
                <button class="quick-btn" (click)="wizardState.setDefaultCellLine('A549')">A549</button>
              </div>
            </div>
          </div>
        }

        @case ('vertebrate') {
          <div class="template-fields">
            <h4>Vertebrate-specific Fields</h4>

            <div class="form-row">
              <div class="form-section">
                <label class="form-label">
                  Strain / Breed
                  <span class="help-text">For mice/rats (e.g., C57BL/6, Sprague-Dawley)</span>
                </label>
                <input
                  type="text"
                  class="form-input"
                  [ngModel]="state().strainBreed"
                  (ngModelChange)="wizardState.setStrainBreed($event)"
                  placeholder="e.g., C57BL/6"
                />
              </div>

              <div class="form-section">
                <label class="form-label">
                  Developmental Stage
                  <span class="help-text">Life stage (e.g., adult, embryonic day 14)</span>
                </label>
                <input
                  type="text"
                  class="form-input"
                  [ngModel]="state().developmentalStage"
                  (ngModelChange)="wizardState.setDevelopmentalStage($event)"
                  placeholder="e.g., adult"
                />
              </div>
            </div>
          </div>
        }
      }

      <!-- Validation Message -->
      @if (!wizardState.isStep2Valid()) {
        <div class="validation-message">
          <span class="warning-icon">!</span>
          Please fill in organism, disease, and organism part to continue.
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
      margin-bottom: 24px;
    }

    .form-label {
      display: block;
      font-size: 14px;
      font-weight: 500;
      color: #374151;
      margin-bottom: 8px;
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

    .form-input,
    .form-select {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      transition: border-color 0.15s, box-shadow 0.15s;
    }

    .form-input:focus,
    .form-select:focus {
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
      margin-top: 8px;
      flex-wrap: wrap;
    }

    .quick-label {
      font-size: 12px;
      color: #6b7280;
    }

    .quick-btn {
      padding: 4px 10px;
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

    .template-fields {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #e5e7eb;
    }

    .template-fields h4 {
      margin: 0 0 16px 0;
      font-size: 15px;
      font-weight: 600;
      color: #374151;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
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
      .form-row {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class SampleCharacteristicsComponent {
  @Input() aiEnabled = false;

  readonly wizardState = inject(WizardStateService);
  private readonly ols = olsService;

  readonly state = this.wizardState.state;

  // Search states
  readonly organismSearch = signal('');
  readonly diseaseSearch = signal('');
  readonly organismPartSearch = signal('');

  // Results
  readonly organismResults = signal<OntologyTerm[]>([]);
  readonly diseaseResults = signal<OntologyTerm[]>([]);
  readonly organismPartResults = signal<OntologyTerm[]>([]);

  // Dropdown visibility
  readonly showOrganismResults = signal(false);
  readonly showDiseaseResults = signal(false);
  readonly showOrganismPartResults = signal(false);

  // Organism search
  async searchOrganism(query: string): Promise<void> {
    this.organismSearch.set(query);
    if (query.length < 2) {
      this.organismResults.set([]);
      return;
    }

    try {
      const results = await this.ols.searchOrganism(query);
      this.organismResults.set(results.map(r => ({
        id: r.id,
        label: r.label,
        ontology: r.ontologyPrefix?.toUpperCase() || 'NCBITAXON',
      })));
      this.showOrganismResults.set(true);
    } catch {
      this.organismResults.set([]);
    }
  }

  selectOrganism(term: OntologyTerm): void {
    this.wizardState.setOrganism(term);
    this.organismSearch.set('');
    this.organismResults.set([]);
    this.showOrganismResults.set(false);
  }

  selectQuickOrganism(label: string, id: string): void {
    this.selectOrganism({ id, label, ontology: 'NCBITAXON' });
  }

  clearOrganism(): void {
    this.wizardState.setOrganism(null as any);
  }

  // Disease search
  async searchDisease(query: string): Promise<void> {
    this.diseaseSearch.set(query);

    // Check for "normal" keyword
    if (query.toLowerCase() === 'normal') {
      this.diseaseResults.set([{ id: 'PATO:0000461', label: 'normal', ontology: 'PATO' }]);
      this.showDiseaseResults.set(true);
      return;
    }

    if (query.length < 2) {
      this.diseaseResults.set([]);
      return;
    }

    try {
      const results = await this.ols.searchDisease(query);
      this.diseaseResults.set(results.map(r => ({
        id: r.id,
        label: r.label,
        ontology: r.ontologyPrefix?.toUpperCase() || 'MONDO',
      })));
      this.showDiseaseResults.set(true);
    } catch {
      this.diseaseResults.set([]);
    }
  }

  selectDisease(term: OntologyTerm): void {
    this.wizardState.setDisease(term);
    this.diseaseSearch.set('');
    this.diseaseResults.set([]);
    this.showDiseaseResults.set(false);
  }

  selectQuickDisease(value: string): void {
    this.wizardState.setDisease(value);
    this.diseaseSearch.set('');
    this.diseaseResults.set([]);
    this.showDiseaseResults.set(false);
  }

  selectQuickDiseaseOntology(label: string, id: string): void {
    this.selectDisease({ id, label, ontology: 'MONDO' });
  }

  clearDisease(): void {
    this.wizardState.setDisease(null as any);
  }

  isDiseaseString(): boolean {
    return typeof this.state().disease === 'string';
  }

  getDiseaseLabel(): string {
    const disease = this.state().disease;
    if (!disease) return '';
    if (typeof disease === 'string') return disease;
    return disease.label;
  }

  getDiseaseId(): string {
    const disease = this.state().disease;
    if (!disease || typeof disease === 'string') return '';
    return disease.id;
  }

  // Organism Part search
  async searchOrganismPart(query: string): Promise<void> {
    this.organismPartSearch.set(query);
    if (query.length < 2) {
      this.organismPartResults.set([]);
      return;
    }

    try {
      const results = await this.ols.searchTissue(query);
      this.organismPartResults.set(results.map(r => ({
        id: r.id,
        label: r.label,
        ontology: r.ontologyPrefix?.toUpperCase() || 'UBERON',
      })));
      this.showOrganismPartResults.set(true);
    } catch {
      this.organismPartResults.set([]);
    }
  }

  selectOrganismPart(term: OntologyTerm): void {
    this.wizardState.setOrganismPart(term);
    this.organismPartSearch.set('');
    this.organismPartResults.set([]);
    this.showOrganismPartResults.set(false);
  }

  selectQuickOrganismPart(label: string, id: string): void {
    this.selectOrganismPart({ id, label, ontology: 'UBERON' });
  }

  clearOrganismPart(): void {
    this.wizardState.setOrganismPart(null as any);
  }
}
