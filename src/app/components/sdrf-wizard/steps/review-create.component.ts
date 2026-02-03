/**
 * Review & Create Component (Step 7)
 *
 * Preview generated SDRF and create the table.
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { WizardStateService } from '../../../core/services/wizard-state.service';
import { WizardGeneratorService } from '../../../core/services/wizard-generator.service';
import { SdrfTable, getTableDataMatrix } from '../../../core/models/sdrf-table';
import { WIZARD_TEMPLATES, LABEL_CONFIGS } from '../../../core/models/wizard';

@Component({
  selector: 'wizard-review-create',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="step-container">
      <div class="step-header">
        <h3>Review Your SDRF</h3>
        <p class="step-description">
          Preview the generated SDRF table before creating it.
        </p>
      </div>

      <!-- Summary Cards -->
      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-icon">{{ templateIcon() }}</div>
          <div class="summary-content">
            <span class="summary-label">Template</span>
            <span class="summary-value">{{ templateName() }}</span>
          </div>
        </div>

        <div class="summary-card">
          <div class="summary-icon">#</div>
          <div class="summary-content">
            <span class="summary-label">Samples</span>
            <span class="summary-value">{{ state().sampleCount }}</span>
          </div>
        </div>

        <div class="summary-card">
          <div class="summary-icon">C</div>
          <div class="summary-content">
            <span class="summary-label">Columns</span>
            <span class="summary-value">{{ previewTable()?.columns?.length || 0 }}</span>
          </div>
        </div>

        <div class="summary-card">
          <div class="summary-icon">R</div>
          <div class="summary-content">
            <span class="summary-label">Rows</span>
            <span class="summary-value">{{ previewTable()?.sampleCount || 0 }}</span>
          </div>
        </div>
      </div>

      <!-- Configuration Summary -->
      <div class="config-summary">
        <h4>Configuration Summary</h4>
        <div class="config-grid">
          <div class="config-item">
            <span class="config-label">Organism:</span>
            <span class="config-value">{{ state().organism?.label || 'Not set' }}</span>
          </div>
          <div class="config-item">
            <span class="config-label">Disease:</span>
            <span class="config-value">{{ getDiseaseLabel() }}</span>
          </div>
          <div class="config-item">
            <span class="config-label">Organism Part:</span>
            <span class="config-value">{{ state().organismPart?.label || 'Not set' }}</span>
          </div>
          <div class="config-item">
            <span class="config-label">Label Type:</span>
            <span class="config-value">{{ labelConfigName() }}</span>
          </div>
          <div class="config-item">
            <span class="config-label">Fractions:</span>
            <span class="config-value">{{ state().hasFractions ? state().fractionCount : 'None' }}</span>
          </div>
          <div class="config-item">
            <span class="config-label">Tech. Replicates:</span>
            <span class="config-value">{{ state().technicalReplicates }}</span>
          </div>
          <div class="config-item">
            <span class="config-label">Instrument:</span>
            <span class="config-value">{{ state().instrument?.label || 'Not set' }}</span>
          </div>
          <div class="config-item">
            <span class="config-label">Enzyme:</span>
            <span class="config-value">{{ state().cleavageAgent?.name || 'Not set' }}</span>
          </div>
        </div>
      </div>

      <!-- Table Preview -->
      <div class="preview-section">
        <h4>Table Preview</h4>
        <div class="table-preview-container">
          @if (previewTable(); as table) {
            <table class="preview-table">
              <thead>
                <tr>
                  @for (col of table.columns; track col.columnPosition) {
                    <th>{{ col.name }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of previewRows(); track $index; let i = $index) {
                  <tr>
                    @for (cell of row; track $index) {
                      <td>{{ cell }}</td>
                    }
                  </tr>
                }
                @if (previewTable()!.sampleCount > 5) {
                  <tr class="more-rows">
                    <td [attr.colspan]="table.columns.length">
                      ... and {{ previewTable()!.sampleCount - 5 }} more rows
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <div class="no-preview">
              Complete all required steps to preview the SDRF.
            </div>
          }
        </div>
      </div>

      <!-- Validation Status -->
      <div class="validation-status" [class.valid]="wizardState.isAllValid()" [class.invalid]="!wizardState.isAllValid()">
        @if (wizardState.isAllValid()) {
          <span class="status-icon">&#10003;</span>
          <span>All required fields are complete. Ready to create SDRF!</span>
        } @else {
          <span class="status-icon">!</span>
          <span>Please complete all required steps before creating.</span>
        }
      </div>
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

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }

    .summary-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      background: #f9fafb;
      border-radius: 10px;
      border: 1px solid #e5e7eb;
    }

    .summary-icon {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      background: #3b82f6;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: 600;
    }

    .summary-content {
      display: flex;
      flex-direction: column;
    }

    .summary-label {
      font-size: 12px;
      color: #6b7280;
    }

    .summary-value {
      font-size: 16px;
      font-weight: 600;
      color: #1f2937;
    }

    .config-summary {
      margin-bottom: 24px;
      padding: 20px;
      background: #f9fafb;
      border-radius: 10px;
      border: 1px solid #e5e7eb;
    }

    .config-summary h4 {
      margin: 0 0 16px 0;
      font-size: 14px;
      font-weight: 600;
      color: #374151;
    }

    .config-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }

    .config-item {
      display: flex;
      gap: 8px;
    }

    .config-label {
      font-size: 13px;
      color: #6b7280;
      min-width: 120px;
    }

    .config-value {
      font-size: 13px;
      color: #1f2937;
      font-weight: 500;
    }

    .preview-section {
      margin-bottom: 24px;
    }

    .preview-section h4 {
      margin: 0 0 12px 0;
      font-size: 14px;
      font-weight: 600;
      color: #374151;
    }

    .table-preview-container {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
    }

    .preview-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    .preview-table th,
    .preview-table td {
      padding: 10px 12px;
      border-bottom: 1px solid #e5e7eb;
      text-align: left;
      white-space: nowrap;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .preview-table th {
      background: #f3f4f6;
      font-weight: 600;
      color: #374151;
      position: sticky;
      top: 0;
    }

    .preview-table tbody tr:hover {
      background: #f9fafb;
    }

    .preview-table .more-rows td {
      text-align: center;
      color: #6b7280;
      font-style: italic;
      background: #f9fafb;
    }

    .no-preview {
      padding: 40px;
      text-align: center;
      color: #6b7280;
    }

    .validation-status {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      border-radius: 10px;
      font-size: 14px;
    }

    .validation-status.valid {
      background: #d1fae5;
      color: #065f46;
    }

    .validation-status.invalid {
      background: #fef3c7;
      color: #92400e;
    }

    .status-icon {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: bold;
    }

    .validation-status.valid .status-icon {
      background: #10b981;
      color: white;
    }

    .validation-status.invalid .status-icon {
      background: #f59e0b;
      color: white;
    }

    @media (max-width: 600px) {
      .summary-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .config-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class ReviewCreateComponent {
  @Input() aiEnabled = false;
  @Output() createTable = new EventEmitter<SdrfTable>();

  readonly wizardState = inject(WizardStateService);
  private readonly generator = inject(WizardGeneratorService);

  readonly state = this.wizardState.state;

  readonly previewTable = computed(() => {
    try {
      return this.generator.generate(this.state());
    } catch {
      return null;
    }
  });

  readonly previewRows = computed(() => {
    const table = this.previewTable();
    if (!table) return [];
    const matrix = getTableDataMatrix(table);
    return matrix.slice(0, 5); // Show first 5 rows
  });

  readonly templateName = computed(() => {
    const template = this.state().template;
    const found = WIZARD_TEMPLATES.find(t => t.id === template);
    return found?.name || 'Not selected';
  });

  readonly templateIcon = computed(() => {
    const template = this.state().template;
    switch (template) {
      case 'human': return '\ud83e\uddd1';
      case 'cell-line': return '\ud83e\uddeb';
      case 'vertebrate': return '\ud83d\udc2d';
      case 'other': return '\ud83e\uddec';
      default: return '?';
    }
  });

  readonly labelConfigName = computed(() => {
    const configId = this.state().labelConfigId;
    const found = LABEL_CONFIGS.find(c => c.id === configId);
    return found?.name || 'Unknown';
  });

  getDiseaseLabel(): string {
    const disease = this.state().disease;
    if (!disease) return 'Not set';
    if (typeof disease === 'string') return disease;
    return disease.label;
  }

  onCreate(): void {
    const table = this.previewTable();
    if (table) {
      this.createTable.emit(table);
    }
  }
}
