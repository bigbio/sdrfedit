/**
 * Sample Values Component (Step 3)
 *
 * Batch entry table for sample-specific values.
 */

import {
  Component,
  Input,
  inject,
  signal,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { WizardStateService } from '../../../core/services/wizard-state.service';
import { WizardSampleEntry } from '../../../core/models/wizard';

@Component({
  selector: 'wizard-sample-values',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="step-container">
      <div class="step-header">
        <h3>Sample-Specific Values</h3>
        <p class="step-description">
          Enter values for each sample. Use the toolbar to auto-fill or copy values across samples.
        </p>
      </div>

      <!-- Toolbar -->
      <div class="toolbar">
        <div class="toolbar-group">
          <button class="toolbar-btn" (click)="autoGenerateNames()">
            Auto-name samples
          </button>
          <input
            type="text"
            class="pattern-input"
            [ngModel]="namePattern()"
            (ngModelChange)="namePattern.set($event)"
            placeholder="sample_{n}"
            title="Pattern: use {n} for number"
          />
        </div>

        <div class="toolbar-group">
          <button class="toolbar-btn" (click)="copyFirstToAll('biologicalReplicate')">
            Copy Bio. Rep. to all
          </button>
        </div>
      </div>

      <!-- Sample Table -->
      <div class="table-container">
        <table class="sample-table">
          <thead>
            <tr>
              <th class="col-index">#</th>
              <th class="col-name">Source Name <span class="required">*</span></th>
              <th class="col-biorep">Bio. Replicate</th>
              @if (showDiseaseColumn()) {
                <th class="col-disease">Disease Override</th>
              }
              @if (showAgeColumn()) {
                <th class="col-age">Age</th>
              }
              @if (showSexColumn()) {
                <th class="col-sex">Sex</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (sample of wizardState.samples(); track sample.index; let i = $index) {
              <tr>
                <td class="col-index">{{ sample.index }}</td>
                <td class="col-name">
                  <input
                    type="text"
                    class="cell-input"
                    [ngModel]="sample.sourceName"
                    (ngModelChange)="updateSample(i, 'sourceName', $event)"
                    placeholder="Enter name..."
                  />
                </td>
                <td class="col-biorep">
                  <input
                    type="number"
                    class="cell-input"
                    [ngModel]="sample.biologicalReplicate"
                    (ngModelChange)="updateSample(i, 'biologicalReplicate', $event)"
                    min="1"
                  />
                </td>
                @if (showDiseaseColumn()) {
                  <td class="col-disease">
                    <input
                      type="text"
                      class="cell-input"
                      [ngModel]="sample.disease || ''"
                      (ngModelChange)="updateSample(i, 'disease', $event)"
                      placeholder="Same as default"
                    />
                  </td>
                }
                @if (showAgeColumn()) {
                  <td class="col-age">
                    <input
                      type="text"
                      class="cell-input"
                      [ngModel]="sample.age || ''"
                      (ngModelChange)="updateSample(i, 'age', $event)"
                      [placeholder]="state().defaultAge || 'e.g., 45Y'"
                    />
                  </td>
                }
                @if (showSexColumn()) {
                  <td class="col-sex">
                    <select
                      class="cell-select"
                      [ngModel]="sample.sex || ''"
                      (ngModelChange)="updateSample(i, 'sex', $event)"
                    >
                      <option value="">Same as default</option>
                      <option value="male">male</option>
                      <option value="female">female</option>
                      <option value="not available">not available</option>
                    </select>
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>

      <!-- Summary -->
      <div class="summary">
        <div class="summary-item">
          <span class="summary-label">Total samples:</span>
          <span class="summary-value">{{ wizardState.sampleCount() }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Unique bio. replicates:</span>
          <span class="summary-value">{{ uniqueBioReplicates() }}</span>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="quick-actions">
        <h4>Quick Actions</h4>
        <div class="action-buttons">
          <button class="action-btn" (click)="assignSequentialReplicates()">
            Sequential bio. replicates (1, 2, 3...)
          </button>
          <button class="action-btn" (click)="assignPairedReplicates()">
            Paired replicates (1, 1, 2, 2...)
          </button>
          <button class="action-btn" (click)="assignTriplicates()">
            Triplicates (1, 1, 1, 2, 2, 2...)
          </button>
        </div>
      </div>

      <!-- Validation Message -->
      @if (!wizardState.isStep3Valid()) {
        <div class="validation-message">
          <span class="warning-icon">!</span>
          All samples must have a source name to continue.
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

    .toolbar {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
      padding: 12px;
      background: #f9fafb;
      border-radius: 8px;
      flex-wrap: wrap;
    }

    .toolbar-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .toolbar-btn {
      padding: 8px 12px;
      background: white;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 13px;
      color: #374151;
      cursor: pointer;
      transition: all 0.15s;
    }

    .toolbar-btn:hover {
      background: #f3f4f6;
      border-color: #9ca3af;
    }

    .pattern-input {
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 13px;
      width: 120px;
    }

    .pattern-input:focus {
      outline: none;
      border-color: #3b82f6;
    }

    .table-container {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 16px;
    }

    .sample-table {
      width: 100%;
      border-collapse: collapse;
    }

    .sample-table th,
    .sample-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #e5e7eb;
      text-align: left;
    }

    .sample-table th {
      background: #f9fafb;
      font-size: 12px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .sample-table tbody tr:hover {
      background: #f9fafb;
    }

    .sample-table tbody tr:last-child td {
      border-bottom: none;
    }

    .col-index {
      width: 40px;
      text-align: center;
      color: #9ca3af;
      font-size: 12px;
    }

    .col-name {
      min-width: 200px;
    }

    .col-biorep {
      width: 100px;
    }

    .col-disease {
      min-width: 150px;
    }

    .col-age {
      width: 100px;
    }

    .col-sex {
      width: 140px;
    }

    .required {
      color: #ef4444;
    }

    .cell-input,
    .cell-select {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid transparent;
      border-radius: 4px;
      font-size: 13px;
      background: transparent;
      transition: all 0.15s;
    }

    .cell-input:hover,
    .cell-select:hover {
      border-color: #d1d5db;
    }

    .cell-input:focus,
    .cell-select:focus {
      outline: none;
      border-color: #3b82f6;
      background: white;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
    }

    .cell-input::placeholder {
      color: #9ca3af;
    }

    .summary {
      display: flex;
      gap: 24px;
      padding: 12px 16px;
      background: #f3f4f6;
      border-radius: 8px;
      margin-bottom: 24px;
    }

    .summary-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .summary-label {
      font-size: 13px;
      color: #6b7280;
    }

    .summary-value {
      font-size: 14px;
      font-weight: 600;
      color: #1f2937;
    }

    .quick-actions {
      margin-bottom: 24px;
    }

    .quick-actions h4 {
      margin: 0 0 12px 0;
      font-size: 14px;
      font-weight: 600;
      color: #374151;
    }

    .action-buttons {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .action-btn {
      padding: 8px 14px;
      background: white;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 13px;
      color: #374151;
      cursor: pointer;
      transition: all 0.15s;
    }

    .action-btn:hover {
      background: #f3f4f6;
      border-color: #9ca3af;
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
  `],
})
export class SampleValuesComponent implements OnInit {
  @Input() aiEnabled = false;

  readonly wizardState = inject(WizardStateService);
  readonly state = this.wizardState.state;

  /** Name pattern as a signal for consistent OnPush change detection */
  readonly namePattern = signal('sample_{n}');

  ngOnInit(): void {
    // Ensure samples are initialized when component loads
    this.wizardState.ensureSamplesInitialized();
  }

  showDiseaseColumn(): boolean {
    // Show if we might have varying diseases per sample
    return false; // Can be enabled based on user preference
  }

  showAgeColumn(): boolean {
    return this.wizardState.isHumanTemplate();
  }

  showSexColumn(): boolean {
    return this.wizardState.isHumanTemplate();
  }

  updateSample(index: number, field: keyof WizardSampleEntry, value: any): void {
    this.wizardState.updateSample(index, { [field]: value });
  }

  autoGenerateNames(): void {
    this.wizardState.autoGenerateSourceNames(this.namePattern());
  }

  copyFirstToAll(field: keyof WizardSampleEntry): void {
    this.wizardState.copyToAllSamples(field);
  }

  uniqueBioReplicates(): number {
    const samples = this.wizardState.samples();
    const unique = new Set(samples.map(s => s.biologicalReplicate));
    return unique.size;
  }

  assignSequentialReplicates(): void {
    const samples = this.wizardState.samples();
    const updated = samples.map((s, i) => ({
      ...s,
      biologicalReplicate: i + 1,
    }));
    this.wizardState.setSamples(updated);
  }

  assignPairedReplicates(): void {
    const samples = this.wizardState.samples();
    const updated = samples.map((s, i) => ({
      ...s,
      biologicalReplicate: Math.floor(i / 2) + 1,
    }));
    this.wizardState.setSamples(updated);
  }

  assignTriplicates(): void {
    const samples = this.wizardState.samples();
    const updated = samples.map((s, i) => ({
      ...s,
      biologicalReplicate: Math.floor(i / 3) + 1,
    }));
    this.wizardState.setSamples(updated);
  }
}
