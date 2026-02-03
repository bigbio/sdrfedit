/**
 * Data Files Component (Step 6)
 *
 * File naming pattern and data file mapping.
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
import { WizardDataFile, LABEL_CONFIGS } from '../../../core/models/wizard';

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
          Specify how your data files are named and map them to samples.
        </p>
      </div>

      <!-- File Naming Strategy -->
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

      <!-- Auto-generate button -->
      <div class="generate-section">
        <button class="generate-btn" (click)="autoGenerate()">
          Auto-generate Files from Pattern
        </button>
        <span class="generate-info">
          Will create {{ expectedFileCount() }} file entries based on your configuration
        </span>
      </div>

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
                    <td>{{ getSampleName(file.sampleIndex) }}</td>
                    @if (hasFractions()) {
                      <td>{{ file.fractionId || '-' }}</td>
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

          @if (state().dataFiles.length > maxDisplayed) {
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
      max-width: 800px;
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
    }
  `],
})
export class DataFilesComponent {
  @Input() aiEnabled = false;

  readonly wizardState = inject(WizardStateService);
  readonly state = this.wizardState.state;

  readonly maxDisplayed = 20;
  readonly showAll = signal(false);

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
}
