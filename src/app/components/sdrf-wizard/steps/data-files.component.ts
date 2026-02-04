/**
 * Data Files Component (Step 6)
 *
 * File naming pattern and data file mapping with multiple import options.
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
import { WizardDataFile, WizardSampleEntry, LABEL_CONFIGS } from '../../../core/models/wizard';

/**
 * Import mode for data files.
 */
type ImportMode = 'pattern' | 'paste' | 'mapping';

/**
 * Mapping result for auto-mapping.
 */
interface MappingResult {
  fileName: string;
  sampleIndex: number | null;
  sampleName: string | null;
  fractionId: number | null;
  label: string | null;
  confidence: 'high' | 'medium' | 'low' | 'unmatched';
  matchReason?: string;
}

@Component({
  selector: 'wizard-data-files',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="step-container">
      <div class="step-header">
        <h3>Data Files</h3>
        <p class="step-description">
          Specify your data files using one of the methods below.
        </p>
      </div>

      <!-- Import Mode Tabs -->
      <div class="import-tabs">
        <button
          class="tab-btn"
          [class.active]="importMode() === 'pattern'"
          (click)="importMode.set('pattern')"
        >
          Auto-generate
        </button>
        <button
          class="tab-btn"
          [class.active]="importMode() === 'paste'"
          (click)="importMode.set('paste')"
        >
          Paste File List
        </button>
        <button
          class="tab-btn"
          [class.active]="importMode() === 'mapping'"
          (click)="importMode.set('mapping')"
        >
          Import Mapping
        </button>
      </div>

      <!-- Pattern Mode -->
      @if (importMode() === 'pattern') {
        <div class="mode-content">
          <div class="form-section">
            <label class="form-label">
              File Naming Pattern
              <span class="help-text">
                Use placeholders: {{ '{' }}sourceName{{ '}' }}, {{ '{' }}n{{ '}' }} (sample number), {{ '{' }}fraction{{ '}' }}, {{ '{' }}replicate{{ '}' }}, {{ '{' }}label{{ '}' }}
              </span>
            </label>

            <input
              type="text"
              class="form-input"
              [ngModel]="state().fileNamingPattern"
              (ngModelChange)="wizardState.setFileNamingPattern($event)"
              [placeholder]="'{sourceName}.raw'"
            />

            <div class="pattern-examples">
              <span class="examples-label">Examples:</span>
              <button class="pattern-btn" (click)="setPattern('{sourceName}.raw')">{{ '{' }}sourceName{{ '}' }}.raw</button>
              <button class="pattern-btn" (click)="setPattern('sample_{n}_F{fraction}.raw')">sample_{{ '{' }}n{{ '}' }}_F{{ '{' }}fraction{{ '}' }}.raw</button>
              <button class="pattern-btn" (click)="setPattern('{sourceName}_{fraction}_{replicate}.raw')">{{ '{' }}sourceName{{ '}' }}_{{ '{' }}fraction{{ '}' }}_{{ '{' }}replicate{{ '}' }}.raw</button>
            </div>
          </div>

          <div class="generate-section">
            <button class="generate-btn" (click)="autoGenerate()">
              Auto-generate Files from Pattern
            </button>
            <span class="generate-info">
              Will create {{ expectedFileCount() }} file entries based on your configuration
            </span>
          </div>
        </div>
      }

      <!-- Paste Mode -->
      @if (importMode() === 'paste') {
        <div class="mode-content">
          <div class="form-section">
            <label class="form-label">
              Paste File Names
              <span class="help-text">
                One file name per line. We'll try to auto-match them to your samples.
              </span>
            </label>

            <textarea
              class="form-textarea"
              rows="8"
              [ngModel]="pastedFileList()"
              (ngModelChange)="pastedFileList.set($event)"
              placeholder="sample1.raw
sample2.raw
sample3_F1.raw
sample3_F2.raw
..."
            ></textarea>

            <div class="paste-actions">
              <button
                class="action-btn primary"
                [disabled]="!pastedFileList().trim()"
                (click)="parseAndMapFiles()"
              >
                Parse & Auto-Map Files
              </button>
              <span class="action-hint">
                {{ countPastedLines() }} file(s) detected
              </span>
            </div>
          </div>

          <!-- Auto-mapping Results -->
          @if (mappingResults().length > 0) {
            <div class="mapping-results">
              <div class="results-header">
                <h4>Mapping Results</h4>
                <div class="results-stats">
                  <span class="stat matched">{{ countMatched() }} matched</span>
                  <span class="stat unmatched">{{ countUnmatched() }} unmatched</span>
                </div>
              </div>

              <div class="results-table-container">
                <table class="results-table">
                  <thead>
                    <tr>
                      <th>File Name</th>
                      <th>Mapped Sample</th>
                      <th>Fraction</th>
                      <th>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (result of mappingResults(); track result.fileName; let i = $index) {
                      <tr [class.unmatched]="result.confidence === 'unmatched'">
                        <td class="file-name">{{ result.fileName }}</td>
                        <td>
                          <select
                            class="cell-select"
                            [ngModel]="result.sampleIndex"
                            (ngModelChange)="updateMappingResult(i, 'sampleIndex', $event)"
                          >
                            <option [ngValue]="null">-- Select Sample --</option>
                            @for (sample of wizardState.samples(); track sample.index) {
                              <option [ngValue]="sample.index">{{ sample.sourceName }}</option>
                            }
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            class="cell-input fraction-input"
                            [ngModel]="result.fractionId"
                            (ngModelChange)="updateMappingResult(i, 'fractionId', $event)"
                            min="1"
                            placeholder="-"
                          />
                        </td>
                        <td>
                          <span class="confidence-badge" [class]="result.confidence">
                            {{ result.confidence }}
                          </span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>

              <div class="mapping-actions">
                <button
                  class="action-btn primary"
                  [disabled]="countUnmatched() > 0"
                  (click)="applyMapping()"
                >
                  Apply Mapping
                </button>
                <button class="action-btn secondary" (click)="clearMapping()">
                  Clear
                </button>
                @if (countUnmatched() > 0) {
                  <span class="action-warning">Please map all files before applying</span>
                }
              </div>
            </div>
          }
        </div>
      }

      <!-- Mapping File Mode -->
      @if (importMode() === 'mapping') {
        <div class="mode-content">
          <div class="form-section">
            <label class="form-label">
              Import Mapping File (TSV)
              <span class="help-text">
                Paste a TSV with columns: sample_name, file_name, [channel], [fraction_index]
              </span>
            </label>

            <textarea
              class="form-textarea"
              rows="8"
              [ngModel]="mappingTsv()"
              (ngModelChange)="mappingTsv.set($event)"
              placeholder="sample_name&#9;file_name&#9;channel&#9;fraction_index
sample1&#9;sample1_F1.raw&#9;&#9;1
sample1&#9;sample1_F2.raw&#9;&#9;2
sample2&#9;sample2_F1.raw&#9;TMT126&#9;1
..."
            ></textarea>

            <div class="paste-actions">
              <button
                class="action-btn primary"
                [disabled]="!mappingTsv().trim()"
                (click)="parseMappingTsv()"
              >
                Parse Mapping File
              </button>
              <span class="action-hint">
                Columns: sample_name (required), file_name (required), channel (optional), fraction_index (optional)
              </span>
            </div>
          </div>

          @if (tsvParseError()) {
            <div class="parse-error">
              {{ tsvParseError() }}
            </div>
          }
        </div>
      }

      <!-- Generated Files Preview -->
      @if (state().dataFiles.length > 0) {
        <div class="files-section">
          <div class="files-header">
            <h4>Data Files ({{ state().dataFiles.length }})</h4>
            <button class="clear-btn" (click)="clearFiles()">Clear all</button>
          </div>

          <div class="files-table-container">
            <table class="files-table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Sample</th>
                  @if (hasFractions()) {
                    <th>Fraction</th>
                  }
                  @if (hasTechReplicates()) {
                    <th>Tech. Rep.</th>
                  }
                  @if (hasLabels()) {
                    <th>Label</th>
                  }
                  <th class="col-actions"></th>
                </tr>
              </thead>
              <tbody>
                @for (file of displayedFiles(); track $index; let i = $index) {
                  <tr>
                    <td>
                      <input
                        type="text"
                        class="cell-input"
                        [ngModel]="file.fileName"
                        (ngModelChange)="updateFile(i, 'fileName', $event)"
                      />
                    </td>
                    <td>
                      <select
                        class="cell-select"
                        [ngModel]="file.sampleIndex"
                        (ngModelChange)="updateFile(i, 'sampleIndex', $event)"
                      >
                        @for (sample of wizardState.samples(); track sample.index) {
                          <option [ngValue]="sample.index">{{ sample.sourceName }}</option>
                        }
                      </select>
                    </td>
                    @if (hasFractions()) {
                      <td>
                        <input
                          type="number"
                          class="cell-input fraction-input"
                          [ngModel]="file.fractionId"
                          (ngModelChange)="updateFile(i, 'fractionId', $event)"
                          min="1"
                        />
                      </td>
                    }
                    @if (hasTechReplicates()) {
                      <td>{{ file.technicalReplicate || '-' }}</td>
                    }
                    @if (hasLabels()) {
                      <td>{{ file.label || '-' }}</td>
                    }
                    <td class="col-actions">
                      <button class="remove-btn" (click)="removeFile(i)">&times;</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          @if (state().dataFiles.length > maxDisplayed && !showAll()) {
            <div class="more-files">
              Showing {{ maxDisplayed }} of {{ state().dataFiles.length }} files.
              <button class="show-more-btn" (click)="showAll.set(true)">Show all</button>
            </div>
          }
        </div>
      }

      <!-- Manual Add -->
      <div class="manual-add">
        <h4>Or add files manually</h4>
        <div class="add-row">
          <input
            type="text"
            class="form-input"
            [(ngModel)]="newFileName"
            placeholder="Enter file name..."
          />
          <select class="form-select" [(ngModel)]="newSampleIndex">
            @for (sample of wizardState.samples(); track sample.index) {
              <option [ngValue]="sample.index">{{ sample.sourceName }}</option>
            }
          </select>
          <button
            class="add-btn"
            [disabled]="!newFileName.trim()"
            (click)="addFile()"
          >
            Add File
          </button>
        </div>
      </div>

      <!-- Validation Message -->
      @if (!wizardState.isStep6Valid()) {
        <div class="validation-message">
          <span class="warning-icon">!</span>
          At least one data file is required. Use auto-generate or add files manually.
        </div>
      }
    </div>
  `,
  styles: [`
    .step-container {
      max-width: 900px;
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

    /* Import Tabs */
    .import-tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 20px;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 0;
    }

    .tab-btn {
      padding: 10px 20px;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      margin-bottom: -2px;
      font-size: 14px;
      font-weight: 500;
      color: #6b7280;
      cursor: pointer;
      transition: all 0.15s;
    }

    .tab-btn:hover {
      color: #374151;
    }

    .tab-btn.active {
      color: #3b82f6;
      border-bottom-color: #3b82f6;
    }

    .mode-content {
      padding: 16px 0;
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

    .form-textarea {
      width: 100%;
      padding: 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 13px;
      font-family: monospace;
      resize: vertical;
      line-height: 1.5;
    }

    .form-textarea:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .pattern-examples {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      flex-wrap: wrap;
    }

    .examples-label {
      font-size: 12px;
      color: #6b7280;
    }

    .pattern-btn {
      padding: 4px 10px;
      background: #f3f4f6;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      font-size: 11px;
      font-family: monospace;
      color: #374151;
      cursor: pointer;
      transition: all 0.15s;
    }

    .pattern-btn:hover {
      background: #e5e7eb;
      border-color: #d1d5db;
    }

    .generate-section {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
      padding: 16px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
    }

    .generate-btn {
      padding: 10px 20px;
      background: #10b981;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      color: white;
      cursor: pointer;
      transition: background 0.15s;
    }

    .generate-btn:hover {
      background: #059669;
    }

    .generate-info {
      font-size: 13px;
      color: #166534;
    }

    /* Paste Actions */
    .paste-actions {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-top: 12px;
    }

    .action-btn {
      padding: 10px 20px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .action-btn.primary {
      background: #3b82f6;
      color: white;
    }

    .action-btn.primary:hover:not(:disabled) {
      background: #2563eb;
    }

    .action-btn.secondary {
      background: #f3f4f6;
      color: #374151;
      border: 1px solid #d1d5db;
    }

    .action-btn.secondary:hover {
      background: #e5e7eb;
    }

    .action-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .action-hint {
      font-size: 13px;
      color: #6b7280;
    }

    .action-warning {
      font-size: 13px;
      color: #dc2626;
    }

    /* Mapping Results */
    .mapping-results {
      margin-top: 20px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
    }

    .results-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
    }

    .results-header h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #374151;
    }

    .results-stats {
      display: flex;
      gap: 12px;
    }

    .stat {
      font-size: 12px;
      font-weight: 500;
      padding: 2px 8px;
      border-radius: 4px;
    }

    .stat.matched {
      background: #dcfce7;
      color: #166534;
    }

    .stat.unmatched {
      background: #fef2f2;
      color: #dc2626;
    }

    .results-table-container {
      max-height: 300px;
      overflow-y: auto;
    }

    .results-table {
      width: 100%;
      border-collapse: collapse;
    }

    .results-table th,
    .results-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #e5e7eb;
      text-align: left;
      font-size: 13px;
    }

    .results-table th {
      background: #f9fafb;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.05em;
      position: sticky;
      top: 0;
    }

    .results-table tr.unmatched {
      background: #fef2f2;
    }

    .file-name {
      font-family: monospace;
      font-size: 12px;
    }

    .cell-select {
      padding: 6px 8px;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      font-size: 13px;
      min-width: 150px;
    }

    .fraction-input {
      width: 60px;
    }

    .confidence-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
    }

    .confidence-badge.high {
      background: #dcfce7;
      color: #166534;
    }

    .confidence-badge.medium {
      background: #fef3c7;
      color: #92400e;
    }

    .confidence-badge.low {
      background: #fed7aa;
      color: #9a3412;
    }

    .confidence-badge.unmatched {
      background: #fecaca;
      color: #991b1b;
    }

    .mapping-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
    }

    .parse-error {
      margin-top: 12px;
      padding: 12px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      color: #dc2626;
      font-size: 13px;
    }

    /* Files Section */
    .files-section {
      margin-bottom: 24px;
    }

    .files-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .files-header h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #374151;
    }

    .clear-btn {
      padding: 4px 10px;
      background: none;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      font-size: 12px;
      color: #6b7280;
      cursor: pointer;
    }

    .clear-btn:hover {
      background: #fef2f2;
      border-color: #fca5a5;
      color: #dc2626;
    }

    .files-table-container {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
      max-height: 400px;
      overflow-y: auto;
    }

    .files-table {
      width: 100%;
      border-collapse: collapse;
    }

    .files-table th,
    .files-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #e5e7eb;
      text-align: left;
      font-size: 13px;
    }

    .files-table th {
      background: #f9fafb;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.05em;
      position: sticky;
      top: 0;
    }

    .files-table tbody tr:hover {
      background: #f9fafb;
    }

    .col-actions {
      width: 40px;
      text-align: center;
    }

    .cell-input {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid transparent;
      border-radius: 4px;
      font-size: 13px;
      font-family: monospace;
      background: transparent;
    }

    .cell-input:hover {
      border-color: #d1d5db;
    }

    .cell-input:focus {
      outline: none;
      border-color: #3b82f6;
      background: white;
    }

    .remove-btn {
      background: none;
      border: none;
      font-size: 16px;
      color: #9ca3af;
      cursor: pointer;
      padding: 4px;
    }

    .remove-btn:hover {
      color: #ef4444;
    }

    .more-files {
      padding: 12px;
      background: #f3f4f6;
      text-align: center;
      font-size: 13px;
      color: #6b7280;
      border-top: 1px solid #e5e7eb;
    }

    .show-more-btn {
      background: none;
      border: none;
      color: #3b82f6;
      cursor: pointer;
      font-size: 13px;
      margin-left: 8px;
    }

    .show-more-btn:hover {
      text-decoration: underline;
    }

    .manual-add {
      margin-bottom: 24px;
      padding: 16px;
      background: #f9fafb;
      border-radius: 8px;
    }

    .manual-add h4 {
      margin: 0 0 12px 0;
      font-size: 14px;
      font-weight: 500;
      color: #374151;
    }

    .add-row {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 8px;
      align-items: center;
    }

    .add-row .form-select {
      width: 180px;
    }

    .add-btn {
      padding: 10px 16px;
      background: #3b82f6;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      color: white;
      cursor: pointer;
      transition: background 0.15s;
    }

    .add-btn:hover:not(:disabled) {
      background: #2563eb;
    }

    .add-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
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
      .add-row {
        grid-template-columns: 1fr;
      }

      .add-row .form-select {
        width: 100%;
      }

      .import-tabs {
        flex-wrap: wrap;
      }

      .tab-btn {
        flex: 1;
        text-align: center;
      }
    }
  `],
})
export class DataFilesComponent {
  @Input() aiEnabled = false;

  readonly wizardState = inject(WizardStateService);
  readonly state = this.wizardState.state;

  readonly maxDisplayed = 20;
  readonly showAll = signal(false);

  // Import mode state
  readonly importMode = signal<ImportMode>('pattern');
  readonly pastedFileList = signal('');
  readonly mappingTsv = signal('');
  readonly mappingResults = signal<MappingResult[]>([]);
  readonly tsvParseError = signal<string | null>(null);

  // Manual add fields
  newFileName = '';
  newSampleIndex = 1;

  readonly displayedFiles = computed(() => {
    const files = this.state().dataFiles;
    if (this.showAll() || files.length <= this.maxDisplayed) {
      return files;
    }
    return files.slice(0, this.maxDisplayed);
  });

  hasFractions(): boolean {
    return this.state().hasFractions;
  }

  hasTechReplicates(): boolean {
    return this.state().technicalReplicates > 1;
  }

  hasLabels(): boolean {
    const labelConfig = LABEL_CONFIGS.find(c => c.id === this.state().labelConfigId);
    return labelConfig ? labelConfig.id !== 'lf' : false;
  }

  expectedFileCount(): number {
    const state = this.state();
    const samples = state.sampleCount;
    const fractions = state.hasFractions ? state.fractionCount : 1;
    const techReps = state.technicalReplicates;

    // For label-free, one file per sample/fraction/replicate
    // For multiplexed, it depends on whether samples share files or not
    // For simplicity, we generate one file per sample/fraction/replicate/label
    const labelConfig = LABEL_CONFIGS.find(c => c.id === state.labelConfigId);
    const labels = labelConfig?.id === 'lf' ? 1 : (labelConfig?.labels.length || 1);

    return samples * fractions * techReps * labels;
  }

  getSampleName(sampleIndex: number): string {
    const sample = this.wizardState.samples().find(s => s.index === sampleIndex);
    return sample?.sourceName || `Sample ${sampleIndex}`;
  }

  setPattern(pattern: string): void {
    this.wizardState.setFileNamingPattern(pattern);
  }

  autoGenerate(): void {
    this.wizardState.autoGenerateDataFiles();
  }

  clearFiles(): void {
    this.wizardState.setDataFiles([]);
    this.showAll.set(false);
  }

  updateFile(index: number, field: keyof WizardDataFile, value: any): void {
    const files = [...this.state().dataFiles];
    if (index >= 0 && index < files.length) {
      files[index] = { ...files[index], [field]: value };
      this.wizardState.setDataFiles(files);
    }
  }

  removeFile(index: number): void {
    const files = this.state().dataFiles.filter((_, i) => i !== index);
    this.wizardState.setDataFiles(files);
  }

  addFile(): void {
    if (!this.newFileName.trim()) return;

    const newFile: WizardDataFile = {
      fileName: this.newFileName.trim(),
      sampleIndex: this.newSampleIndex,
    };

    const files = [...this.state().dataFiles, newFile];
    this.wizardState.setDataFiles(files);

    this.newFileName = '';
  }

  // === Paste Mode Methods ===

  countPastedLines(): number {
    const text = this.pastedFileList().trim();
    if (!text) return 0;
    return text.split('\n').filter(line => line.trim()).length;
  }

  countMatched(): number {
    return this.mappingResults().filter(r => r.sampleIndex !== null).length;
  }

  countUnmatched(): number {
    return this.mappingResults().filter(r => r.sampleIndex === null).length;
  }

  parseAndMapFiles(): void {
    const text = this.pastedFileList().trim();
    if (!text) return;

    const fileNames = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    const samples = this.wizardState.samples();
    const results: MappingResult[] = [];

    for (const fileName of fileNames) {
      const result = this.autoMapFile(fileName, samples);
      results.push(result);
    }

    this.mappingResults.set(results);
  }

  /**
   * Auto-map a file name to a sample based on various heuristics.
   */
  private autoMapFile(fileName: string, samples: WizardSampleEntry[]): MappingResult {
    const result: MappingResult = {
      fileName,
      sampleIndex: null,
      sampleName: null,
      fractionId: null,
      label: null,
      confidence: 'unmatched',
    };

    // Extract base name without extension
    const baseName = fileName.replace(/\.(raw|mzml|mzxml|mgf|d|wiff)$/i, '').toLowerCase();

    // Try to extract fraction from filename (e.g., F1, F01, _1_, fraction1)
    const fractionMatch = baseName.match(/(?:_f|_fraction|[-_]f)(\d+)/i) ||
                          baseName.match(/[-_](\d+)(?:[-_]|$)/);
    if (fractionMatch) {
      result.fractionId = parseInt(fractionMatch[1], 10);
    }

    // Try exact match first
    for (const sample of samples) {
      const sampleNameLower = sample.sourceName.toLowerCase();
      if (baseName === sampleNameLower || baseName.startsWith(sampleNameLower + '_') ||
          baseName.startsWith(sampleNameLower + '-') || baseName.startsWith(sampleNameLower + '.')) {
        result.sampleIndex = sample.index;
        result.sampleName = sample.sourceName;
        result.confidence = 'high';
        result.matchReason = 'Exact prefix match';
        return result;
      }
    }

    // Try contains match
    for (const sample of samples) {
      const sampleNameLower = sample.sourceName.toLowerCase();
      if (baseName.includes(sampleNameLower)) {
        result.sampleIndex = sample.index;
        result.sampleName = sample.sourceName;
        result.confidence = 'medium';
        result.matchReason = 'Contains sample name';
        return result;
      }
    }

    // Try sample index match (e.g., sample_1, s1, 01)
    const indexMatch = baseName.match(/(?:sample[-_]?|s)(\d+)/i) ||
                       baseName.match(/^(\d+)[-_]/);
    if (indexMatch) {
      const matchedIndex = parseInt(indexMatch[1], 10);
      const sample = samples.find(s => s.index === matchedIndex);
      if (sample) {
        result.sampleIndex = sample.index;
        result.sampleName = sample.sourceName;
        result.confidence = 'low';
        result.matchReason = 'Index pattern match';
        return result;
      }
    }

    return result;
  }

  updateMappingResult(index: number, field: 'sampleIndex' | 'fractionId', value: any): void {
    const results = [...this.mappingResults()];
    if (index >= 0 && index < results.length) {
      results[index] = { ...results[index], [field]: value };

      // Update sample name and confidence if sample was selected
      if (field === 'sampleIndex' && value !== null) {
        const sample = this.wizardState.samples().find(s => s.index === value);
        results[index].sampleName = sample?.sourceName || null;
        if (results[index].confidence === 'unmatched') {
          results[index].confidence = 'low';
          results[index].matchReason = 'Manual selection';
        }
      }

      this.mappingResults.set(results);
    }
  }

  clearMapping(): void {
    this.mappingResults.set([]);
  }

  applyMapping(): void {
    const results = this.mappingResults();
    if (results.some(r => r.sampleIndex === null)) {
      return; // Don't apply if there are unmatched files
    }

    const newFiles: WizardDataFile[] = results.map(r => ({
      fileName: r.fileName,
      sampleIndex: r.sampleIndex!,
      fractionId: r.fractionId || undefined,
      label: r.label || undefined,
    }));

    this.wizardState.setDataFiles(newFiles);
    this.clearMapping();
    this.pastedFileList.set('');
  }

  // === Mapping File Mode Methods ===

  parseMappingTsv(): void {
    const text = this.mappingTsv().trim();
    if (!text) return;

    this.tsvParseError.set(null);

    try {
      const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      if (lines.length === 0) {
        this.tsvParseError.set('No data found in the mapping file.');
        return;
      }

      // Parse header
      const headerLine = lines[0].toLowerCase();
      const headers = headerLine.split('\t').map(h => h.trim());

      // Find column indices
      const sampleNameIndex = headers.findIndex(h =>
        h === 'sample_name' || h === 'sample name' || h === 'samplename' || h === 'source name' || h === 'source_name'
      );
      const fileNameIndex = headers.findIndex(h =>
        h === 'file_name' || h === 'file name' || h === 'filename' || h === 'data file' || h === 'data_file'
      );
      const channelIndex = headers.findIndex(h =>
        h === 'channel' || h === 'label' || h === 'tag'
      );
      const fractionIndex = headers.findIndex(h =>
        h === 'fraction_index' || h === 'fraction' || h === 'fraction_id' || h === 'fractionid'
      );

      if (sampleNameIndex === -1) {
        this.tsvParseError.set('Required column "sample_name" not found. Expected columns: sample_name, file_name, [channel], [fraction_index]');
        return;
      }

      if (fileNameIndex === -1) {
        this.tsvParseError.set('Required column "file_name" not found. Expected columns: sample_name, file_name, [channel], [fraction_index]');
        return;
      }

      // Parse data rows
      const samples = this.wizardState.samples();
      const newFiles: WizardDataFile[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split('\t').map(c => c.trim());

        const sampleName = cols[sampleNameIndex] || '';
        const fileName = cols[fileNameIndex] || '';
        const channel = channelIndex >= 0 ? cols[channelIndex] : undefined;
        const fraction = fractionIndex >= 0 ? cols[fractionIndex] : undefined;

        if (!fileName) continue;

        // Find matching sample
        const sample = samples.find(s =>
          s.sourceName.toLowerCase() === sampleName.toLowerCase()
        );

        if (!sample) {
          this.tsvParseError.set(`Sample "${sampleName}" on line ${i + 1} not found. Available samples: ${samples.map(s => s.sourceName).join(', ')}`);
          return;
        }

        newFiles.push({
          fileName,
          sampleIndex: sample.index,
          fractionId: fraction ? parseInt(fraction, 10) : undefined,
          label: channel || undefined,
        });
      }

      if (newFiles.length === 0) {
        this.tsvParseError.set('No valid file entries found in the mapping file.');
        return;
      }

      // Apply the mapping
      this.wizardState.setDataFiles(newFiles);
      this.mappingTsv.set('');
      this.tsvParseError.set(null);

    } catch (error) {
      this.tsvParseError.set(`Error parsing mapping file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
