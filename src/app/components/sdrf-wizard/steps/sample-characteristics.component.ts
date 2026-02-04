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
          These values will be used as <strong>defaults</strong> for cells not specified individually.
          Sample-specific overrides can be set in the next step.
        </p>
      </div>

      <!-- Info Banner -->
      <div class="info-banner">
        <span class="info-icon">i</span>
        <div class="info-content">
          <strong>SDRF Characteristics Columns</strong>
          <p>
            These fields map to <code>characteristics[...]</code> columns in your SDRF file.
            Values should use controlled vocabulary terms from ontologies (NCBI Taxonomy, MONDO, UBERON).
            <a href="https://github.com/bigbio/proteomics-metadata-standard/tree/master/sdrf-proteomics" target="_blank" rel="noopener">Learn more about SDRF-Proteomics</a>
          </p>
        </div>
      </div>

      <!-- Organism -->
      <div class="form-section">
        <label class="form-label">
          Organism
          <span class="required">*</span>
          <button type="button" class="help-btn" (click)="toggleHelp('organism')" title="Learn more">?</button>
          <span class="help-text">Species of your samples (e.g., Homo sapiens, Mus musculus)</span>
        </label>
        @if (activeHelp() === 'organism') {
          <div class="help-tooltip">
            <strong>characteristics[organism]</strong>
            <p>The taxonomic species from which the sample originates. Uses <strong>NCBI Taxonomy</strong> ontology.</p>
            <div class="help-details">
              <div class="help-row"><span class="help-key">Ontology:</span> NCBITaxon</div>
              <div class="help-row"><span class="help-key">Format:</span> Species name (e.g., "Homo sapiens")</div>
              <div class="help-row"><span class="help-key">Requirement:</span> <span class="badge-required">Required</span></div>
            </div>
            <div class="help-examples">
              <strong>Examples:</strong> Homo sapiens, Mus musculus, Rattus norvegicus, Saccharomyces cerevisiae
            </div>
          </div>
        }
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
          <button type="button" class="help-btn" (click)="toggleHelp('disease')" title="Learn more">?</button>
          <span class="help-text">Disease being studied or 'normal' for healthy samples</span>
        </label>
        @if (activeHelp() === 'disease') {
          <div class="help-tooltip">
            <strong>characteristics[disease]</strong>
            <p>The disease or condition being studied. For healthy/control samples, use <strong>"normal"</strong> (PATO:0000461).</p>
            <div class="help-details">
              <div class="help-row"><span class="help-key">Ontologies:</span> MONDO, EFO, DOID, PATO</div>
              <div class="help-row"><span class="help-key">Format:</span> Disease name or "normal"</div>
              <div class="help-row"><span class="help-key">Requirement:</span> <span class="badge-required">Required</span></div>
            </div>
            <div class="help-examples">
              <strong>Examples:</strong> normal, breast cancer, Alzheimer disease, diabetes mellitus
            </div>
          </div>
        }
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
          <button class="quick-btn quick-btn-special" (click)="selectSpecialDisease('not applicable')">not applicable</button>
          <button class="quick-btn quick-btn-special" (click)="selectSpecialDisease('not available')">not available</button>
        </div>
      </div>

      <!-- Organism Part -->
      <div class="form-section">
        <label class="form-label">
          Organism Part / Tissue
          <span class="required">*</span>
          <button type="button" class="help-btn" (click)="toggleHelp('organismPart')" title="Learn more">?</button>
          <span class="help-text">Tissue or body part (e.g., liver, blood plasma, whole organism)</span>
        </label>
        @if (activeHelp() === 'organismPart') {
          <div class="help-tooltip">
            <strong>characteristics[organism part]</strong>
            <p>The anatomical tissue or organ from which the sample was derived. For cell lines or whole organisms, use appropriate terms.</p>
            <div class="help-details">
              <div class="help-row"><span class="help-key">Ontologies:</span> UBERON, BTO (BRENDA Tissue)</div>
              <div class="help-row"><span class="help-key">Format:</span> Anatomical term</div>
              <div class="help-row"><span class="help-key">Special:</span> "not applicable", "not available" allowed</div>
              <div class="help-row"><span class="help-key">Requirement:</span> <span class="badge-required">Required</span></div>
            </div>
            <div class="help-examples">
              <strong>Examples:</strong> liver, blood plasma, heart, brain, whole organism, not applicable, not available
            </div>
          </div>
        }
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
          <button class="quick-btn quick-btn-special" (click)="selectSpecialOrganismPart('not applicable')">not applicable</button>
          <button class="quick-btn quick-btn-special" (click)="selectSpecialOrganismPart('not available')">not available</button>
        </div>
      </div>

      <!-- Template-specific fields -->
      @if (wizardState.isHumanTemplate()) {
        <div class="template-fields">
          <h4>Human-specific Fields</h4>
          <p class="template-fields-desc">
            Required for human samples per SDRF-Proteomics specification. Values like "anonymized" or "pooled" are accepted when applicable.
          </p>

          <div class="form-row">
            <div class="form-section">
              <label class="form-label">
                Default Sex
                <button type="button" class="help-btn" (click)="toggleHelp('sex')" title="Learn more">?</button>
                <span class="help-text">Biological sex (can be overridden per sample)</span>
              </label>
              @if (activeHelp() === 'sex') {
                <div class="help-tooltip">
                  <strong>characteristics[sex]</strong>
                  <p>Biological sex of the sample donor.</p>
                  <div class="help-details">
                    <div class="help-row"><span class="help-key">Allowed values:</span> male, female, intersex, not available, anonymized, pooled</div>
                    <div class="help-row"><span class="help-key">Requirement:</span> <span class="badge-recommended">Recommended</span></div>
                  </div>
                </div>
              }
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
                <button type="button" class="help-btn" (click)="toggleHelp('age')" title="Learn more">?</button>
                <span class="help-text">Format: 25Y (years), 6M (months), or not available</span>
              </label>
              @if (activeHelp() === 'age') {
                <div class="help-tooltip">
                  <strong>characteristics[age]</strong>
                  <p>Age of the sample donor at collection time. Use standard age format.</p>
                  <div class="help-details">
                    <div class="help-row"><span class="help-key">Format:</span> Number + unit (Y=years, M=months, D=days)</div>
                    <div class="help-row"><span class="help-key">Ranges:</span> 40Y-50Y for age ranges</div>
                    <div class="help-row"><span class="help-key">Special:</span> not available, anonymized, pooled</div>
                    <div class="help-row"><span class="help-key">Requirement:</span> <span class="badge-recommended">Recommended</span></div>
                  </div>
                  <div class="help-examples">
                    <strong>Examples:</strong> 45Y, 6M, 30Y6M, 40Y-50Y, not available
                  </div>
                </div>
              }
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

      @if (wizardState.isCellLineTemplate()) {
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

      @if (wizardState.isVertebrateTemplate()) {
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

    .quick-btn-special {
      background: #fef3c7;
      border-color: #fcd34d;
      color: #92400e;
    }

    .quick-btn-special:hover {
      background: #fde68a;
      border-color: #f59e0b;
    }

    .template-fields {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #e5e7eb;
    }

    .template-fields h4 {
      margin: 0 0 8px 0;
      font-size: 15px;
      font-weight: 600;
      color: #374151;
    }

    .template-fields-desc {
      margin: 0 0 16px 0;
      font-size: 13px;
      color: #6b7280;
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

    /* Info Banner */
    .info-banner {
      display: flex;
      gap: 12px;
      padding: 14px 16px;
      background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%);
      border: 1px solid #bfdbfe;
      border-radius: 10px;
      margin-bottom: 24px;
    }

    .info-icon {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #3b82f6;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 600;
      flex-shrink: 0;
    }

    .info-content {
      flex: 1;
    }

    .info-content strong {
      display: block;
      font-size: 14px;
      color: #1e40af;
      margin-bottom: 4px;
    }

    .info-content p {
      margin: 0;
      font-size: 13px;
      color: #4b5563;
      line-height: 1.5;
    }

    .info-content code {
      background: #dbeafe;
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 12px;
      color: #1e40af;
    }

    .info-content a {
      color: #2563eb;
      text-decoration: none;
    }

    .info-content a:hover {
      text-decoration: underline;
    }

    /* Help Button */
    .help-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #e5e7eb;
      border: none;
      font-size: 11px;
      font-weight: 600;
      color: #6b7280;
      cursor: pointer;
      margin-left: 6px;
      vertical-align: middle;
      transition: all 0.15s;
    }

    .help-btn:hover {
      background: #3b82f6;
      color: white;
    }

    /* Help Tooltip */
    .help-tooltip {
      margin: 12px 0;
      padding: 14px 16px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-left: 4px solid #3b82f6;
      border-radius: 8px;
      font-size: 13px;
    }

    .help-tooltip strong {
      display: block;
      color: #1e40af;
      font-family: monospace;
      font-size: 13px;
      margin-bottom: 8px;
    }

    .help-tooltip p {
      margin: 0 0 12px 0;
      color: #4b5563;
      line-height: 1.5;
    }

    .help-details {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 12px;
    }

    .help-row {
      display: flex;
      gap: 8px;
      font-size: 12px;
    }

    .help-key {
      color: #6b7280;
      min-width: 90px;
    }

    .badge-required {
      display: inline-block;
      padding: 2px 8px;
      background: #fef2f2;
      color: #dc2626;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
    }

    .badge-recommended {
      display: inline-block;
      padding: 2px 8px;
      background: #fefce8;
      color: #ca8a04;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
    }

    .badge-optional {
      display: inline-block;
      padding: 2px 8px;
      background: #f0fdf4;
      color: #16a34a;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
    }

    .help-examples {
      font-size: 12px;
      color: #6b7280;
      padding-top: 8px;
      border-top: 1px solid #e5e7eb;
    }

    .help-examples strong {
      display: inline;
      color: #374151;
      font-family: inherit;
      font-size: 12px;
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

  // Help tooltip state
  readonly activeHelp = signal<string | null>(null);

  /** Toggle help tooltip for a field */
  toggleHelp(field: string): void {
    this.activeHelp.set(this.activeHelp() === field ? null : field);
  }

  // Special values for organism (metaproteomics)
  private readonly specialOrganismValues: OntologyTerm[] = [
    { id: 'not applicable', label: 'not applicable', ontology: 'SDRF' },
  ];

  // Organism search
  async searchOrganism(query: string): Promise<void> {
    this.organismSearch.set(query);
    const lowerQuery = query.toLowerCase().trim();

    // Check for special values first
    const matchingSpecial = this.specialOrganismValues.filter(v =>
      v.label.toLowerCase().includes(lowerQuery)
    );

    if (lowerQuery === 'not' || lowerQuery === 'not a' || lowerQuery === 'not applicable') {
      this.organismResults.set(matchingSpecial);
      this.showOrganismResults.set(true);
      return;
    }

    if (query.length < 2) {
      this.organismResults.set([]);
      return;
    }

    try {
      const results = await this.ols.searchOrganism(query);
      const ontologyResults = results.map(r => ({
        id: r.id,
        label: r.label,
        ontology: r.ontologyPrefix?.toUpperCase() || 'NCBITAXON',
      }));
      this.organismResults.set([...matchingSpecial, ...ontologyResults]);
      this.showOrganismResults.set(true);
    } catch {
      this.organismResults.set(matchingSpecial);
      this.showOrganismResults.set(true);
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

  // Special values for disease
  private readonly specialDiseaseValues: OntologyTerm[] = [
    { id: 'PATO:0000461', label: 'normal', ontology: 'PATO' },
    { id: 'not applicable', label: 'not applicable', ontology: 'SDRF' },
    { id: 'not available', label: 'not available', ontology: 'SDRF' },
  ];

  // Disease search
  async searchDisease(query: string): Promise<void> {
    this.diseaseSearch.set(query);
    const lowerQuery = query.toLowerCase().trim();

    // Check for special values first
    const matchingSpecial = this.specialDiseaseValues.filter(v =>
      v.label.toLowerCase().includes(lowerQuery)
    );

    if (lowerQuery === 'normal' || lowerQuery === 'not' || lowerQuery === 'not a' ||
        lowerQuery === 'not available' || lowerQuery === 'not applicable') {
      this.diseaseResults.set(matchingSpecial);
      this.showDiseaseResults.set(true);
      return;
    }

    if (query.length < 2) {
      this.diseaseResults.set([]);
      return;
    }

    try {
      const results = await this.ols.searchDisease(query);
      const ontologyResults = results.map(r => ({
        id: r.id,
        label: r.label,
        ontology: r.ontologyPrefix?.toUpperCase() || 'MONDO',
      }));
      // Prepend matching special values
      this.diseaseResults.set([...matchingSpecial, ...ontologyResults]);
      this.showDiseaseResults.set(true);
    } catch {
      this.diseaseResults.set(matchingSpecial);
      this.showDiseaseResults.set(true);
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

  /** Select a special value for disease (not applicable, not available) */
  selectSpecialDisease(value: string): void {
    this.selectDisease({ id: value, label: value, ontology: 'SDRF' });
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

  // Special values allowed for organism part per SDRF spec
  private readonly specialOrganismPartValues: OntologyTerm[] = [
    { id: 'not applicable', label: 'not applicable', ontology: 'SDRF' },
    { id: 'not available', label: 'not available', ontology: 'SDRF' },
  ];

  // Organism Part search
  async searchOrganismPart(query: string): Promise<void> {
    this.organismPartSearch.set(query);
    const lowerQuery = query.toLowerCase().trim();

    // Check for special values first
    const matchingSpecial = this.specialOrganismPartValues.filter(v =>
      v.label.toLowerCase().includes(lowerQuery)
    );

    if (lowerQuery === 'not' || lowerQuery === 'not a' || lowerQuery === 'not av' ||
        lowerQuery === 'not available' || lowerQuery === 'not applicable') {
      this.organismPartResults.set(matchingSpecial);
      this.showOrganismPartResults.set(true);
      return;
    }

    if (query.length < 2) {
      this.organismPartResults.set([]);
      return;
    }

    try {
      const results = await this.ols.searchTissue(query);
      const ontologyResults = results.map(r => ({
        id: r.id,
        label: r.label,
        ontology: r.ontologyPrefix?.toUpperCase() || 'UBERON',
      }));
      // Prepend special values if they match
      this.organismPartResults.set([...matchingSpecial, ...ontologyResults]);
      this.showOrganismPartResults.set(true);
    } catch {
      this.organismPartResults.set(matchingSpecial);
      this.showOrganismPartResults.set(true);
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

  /** Select a special value for organism part (not applicable, not available) */
  selectSpecialOrganismPart(value: string): void {
    this.selectOrganismPart({ id: value, label: value, ontology: 'SDRF' });
  }

  clearOrganismPart(): void {
    this.wizardState.setOrganismPart(null as any);
  }
}
