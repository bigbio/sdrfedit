/**
 * Technical Configuration Component (Step 4)
 *
 * Label type, fractionation, and replicates configuration.
 */

import {
  Component,
  Input,
  inject,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { WizardStateService } from '../../../core/services/wizard-state.service';
import { LABEL_CONFIGS } from '../../../core/models/wizard';

@Component({
  selector: 'wizard-technical-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="step-container">
      <div class="step-header">
        <h3>Technical Configuration</h3>
        <p class="step-description">
          Configure the labeling strategy, fractionation, and replication scheme.
        </p>
      </div>

      <!-- Label Type Selection -->
      <div class="form-section">
        <label class="form-label">
          Label Type
          <span class="help-text">Select the quantification strategy used in your experiment</span>
        </label>

        <div class="label-grid">
          @for (config of labelConfigs; track config.id) {
            <button
              class="label-card"
              [class.selected]="state().labelConfigId === config.id"
              (click)="wizardState.setLabelConfig(config.id)"
            >
              <div class="label-name">{{ config.name }}</div>
              <div class="label-count">{{ config.labels.length }} channel(s)</div>
              @if (state().labelConfigId === config.id) {
                <div class="selected-badge">&#10003;</div>
              }
            </button>
          }
        </div>

        <!-- Show selected labels -->
        @if (selectedConfig(); as config) {
          <div class="selected-labels">
            <span class="labels-title">Labels:</span>
            <div class="labels-list">
              @for (label of config.labels; track label) {
                <span class="label-tag">{{ label }}</span>
              }
            </div>
          </div>
        }
      </div>

      <!-- Fractionation -->
      <div class="form-section">
        <label class="form-label">
          Fractionation
          <span class="help-text">Did you fractionate your samples before MS analysis?</span>
        </label>

        <div class="toggle-group">
          <button
            class="toggle-btn"
            [class.active]="!state().hasFractions"
            (click)="wizardState.setHasFractions(false)"
          >
            No fractionation
          </button>
          <button
            class="toggle-btn"
            [class.active]="state().hasFractions"
            (click)="wizardState.setHasFractions(true)"
          >
            Fractionated
          </button>
        </div>

        @if (state().hasFractions) {
          <div class="fraction-config">
            <label class="sub-label">Number of fractions per sample:</label>
            <div class="number-input-group">
              <button
                class="number-btn"
                (click)="decrementFractions()"
                [disabled]="state().fractionCount <= 1"
              >
                -
              </button>
              <input
                type="number"
                class="number-input"
                [ngModel]="state().fractionCount"
                (ngModelChange)="wizardState.setFractionCount($event)"
                min="1"
                max="100"
              />
              <button
                class="number-btn"
                (click)="incrementFractions()"
                [disabled]="state().fractionCount >= 100"
              >
                +
              </button>
            </div>
            <div class="quick-presets">
              <span class="preset-label">Common:</span>
              <button class="preset-btn" (click)="wizardState.setFractionCount(8)">8</button>
              <button class="preset-btn" (click)="wizardState.setFractionCount(12)">12</button>
              <button class="preset-btn" (click)="wizardState.setFractionCount(24)">24</button>
              <button class="preset-btn" (click)="wizardState.setFractionCount(48)">48</button>
            </div>
          </div>
        }
      </div>

      <!-- Technical Replicates -->
      <div class="form-section">
        <label class="form-label">
          Technical Replicates
          <span class="help-text">Number of MS runs per sample/fraction (separate injections of same preparation)</span>
        </label>

        <div class="number-input-group">
          <button
            class="number-btn"
            (click)="decrementReplicates()"
            [disabled]="state().technicalReplicates <= 1"
          >
            -
          </button>
          <input
            type="number"
            class="number-input"
            [ngModel]="state().technicalReplicates"
            (ngModelChange)="wizardState.setTechnicalReplicates($event)"
            min="1"
            max="10"
          />
          <button
            class="number-btn"
            (click)="incrementReplicates()"
            [disabled]="state().technicalReplicates >= 10"
          >
            +
          </button>
        </div>

        @if (state().technicalReplicates > 1) {
          <div class="info-note">
            Each sample will have {{ state().technicalReplicates }} technical replicates.
          </div>
        }
      </div>

      <!-- Data Acquisition Method -->
      <div class="form-section">
        <label class="form-label">
          Data Acquisition Method
          <span class="help-text">How was the MS data acquired?</span>
        </label>

        <div class="toggle-group">
          <button
            class="toggle-btn"
            [class.active]="state().acquisitionMethod === 'dda'"
            (click)="wizardState.setAcquisitionMethod('dda')"
          >
            DDA (Data-Dependent)
          </button>
          <button
            class="toggle-btn"
            [class.active]="state().acquisitionMethod === 'dia'"
            (click)="wizardState.setAcquisitionMethod('dia')"
          >
            DIA (Data-Independent)
          </button>
        </div>
      </div>

      <!-- Summary Calculator -->
      <div class="summary-section">
        <h4>Data File Summary</h4>
        <div class="summary-grid">
          <div class="summary-item">
            <span class="summary-label">Samples</span>
            <span class="summary-value">{{ wizardState.sampleCount() }}</span>
          </div>
          <div class="summary-operator">&times;</div>
          <div class="summary-item">
            <span class="summary-label">Fractions</span>
            <span class="summary-value">{{ state().hasFractions ? state().fractionCount : 1 }}</span>
          </div>
          <div class="summary-operator">&times;</div>
          <div class="summary-item">
            <span class="summary-label">Tech. Reps</span>
            <span class="summary-value">{{ state().technicalReplicates }}</span>
          </div>
          @if (isMultiplexed()) {
            <div class="summary-operator">&times;</div>
            <div class="summary-item">
              <span class="summary-label">Labels</span>
              <span class="summary-value">{{ selectedConfig()?.labels?.length || 1 }}</span>
            </div>
          }
          <div class="summary-operator">=</div>
          <div class="summary-item total">
            <span class="summary-label">Total Rows</span>
            <span class="summary-value">{{ totalRows() }}</span>
          </div>
        </div>
      </div>

      <!-- Validation Message -->
      @if (!wizardState.isStep4Valid()) {
        <div class="validation-message">
          <span class="warning-icon">!</span>
          Please select a label type to continue.
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

    .help-text {
      display: block;
      font-size: 12px;
      font-weight: normal;
      color: #6b7280;
      margin-top: 4px;
    }

    .label-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 16px;
    }

    .label-card {
      position: relative;
      padding: 16px;
      background: white;
      border: 2px solid #e5e7eb;
      border-radius: 10px;
      cursor: pointer;
      text-align: left;
      transition: all 0.15s;
    }

    .label-card:hover {
      border-color: #d1d5db;
      background: #f9fafb;
    }

    .label-card.selected {
      border-color: #3b82f6;
      background: #eff6ff;
    }

    .label-name {
      font-size: 14px;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 4px;
    }

    .label-count {
      font-size: 12px;
      color: #6b7280;
    }

    .selected-badge {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #3b82f6;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
    }

    .selected-labels {
      padding: 12px;
      background: #f3f4f6;
      border-radius: 8px;
    }

    .labels-title {
      font-size: 12px;
      color: #6b7280;
      margin-right: 8px;
    }

    .labels-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }

    .label-tag {
      padding: 4px 8px;
      background: white;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      font-size: 11px;
      color: #374151;
    }

    .toggle-group {
      display: flex;
      background: #f3f4f6;
      border-radius: 8px;
      padding: 4px;
      width: fit-content;
    }

    .toggle-btn {
      padding: 10px 20px;
      border: none;
      background: transparent;
      border-radius: 6px;
      font-size: 14px;
      color: #6b7280;
      cursor: pointer;
      transition: all 0.15s;
    }

    .toggle-btn.active {
      background: white;
      color: #1f2937;
      font-weight: 500;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .fraction-config {
      margin-top: 16px;
      padding: 16px;
      background: #f9fafb;
      border-radius: 8px;
    }

    .sub-label {
      display: block;
      font-size: 13px;
      color: #374151;
      margin-bottom: 8px;
    }

    .number-input-group {
      display: flex;
      align-items: center;
      width: fit-content;
    }

    .number-btn {
      width: 36px;
      height: 36px;
      border: 1px solid #d1d5db;
      background: white;
      font-size: 18px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .number-btn:first-child {
      border-radius: 6px 0 0 6px;
    }

    .number-btn:last-child {
      border-radius: 0 6px 6px 0;
    }

    .number-btn:hover:not(:disabled) {
      background: #f3f4f6;
    }

    .number-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .number-input {
      width: 60px;
      height: 36px;
      border: 1px solid #d1d5db;
      border-left: none;
      border-right: none;
      text-align: center;
      font-size: 14px;
      font-weight: 500;
    }

    .number-input:focus {
      outline: none;
    }

    .quick-presets {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
    }

    .preset-label {
      font-size: 12px;
      color: #6b7280;
    }

    .preset-btn {
      padding: 4px 12px;
      background: white;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;
    }

    .preset-btn:hover {
      background: #f3f4f6;
      border-color: #9ca3af;
    }

    .info-note {
      margin-top: 8px;
      font-size: 13px;
      color: #6b7280;
    }

    .summary-section {
      margin-top: 32px;
      padding: 20px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 10px;
    }

    .summary-section h4 {
      margin: 0 0 16px 0;
      font-size: 14px;
      font-weight: 600;
      color: #166534;
    }

    .summary-grid {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .summary-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 8px 12px;
      background: white;
      border-radius: 6px;
      min-width: 60px;
    }

    .summary-item.total {
      background: #166534;
    }

    .summary-item.total .summary-label,
    .summary-item.total .summary-value {
      color: white;
    }

    .summary-label {
      font-size: 11px;
      color: #6b7280;
    }

    .summary-value {
      font-size: 16px;
      font-weight: 600;
      color: #1f2937;
    }

    .summary-operator {
      font-size: 18px;
      color: #6b7280;
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
      .label-grid {
        grid-template-columns: repeat(2, 1fr);
      }

      .summary-grid {
        justify-content: center;
      }
    }
  `],
})
export class TechnicalConfigComponent {
  @Input() aiEnabled = false;

  readonly wizardState = inject(WizardStateService);
  readonly state = this.wizardState.state;
  readonly labelConfigs = LABEL_CONFIGS;

  readonly selectedConfig = computed(() => {
    const configId = this.state().labelConfigId;
    return LABEL_CONFIGS.find(c => c.id === configId);
  });

  isMultiplexed(): boolean {
    const config = this.selectedConfig();
    return config ? config.id !== 'lf' : false;
  }

  totalRows(): number {
    const state = this.state();
    const samples = state.sampleCount;
    const fractions = state.hasFractions ? state.fractionCount : 1;
    const techReps = state.technicalReplicates;
    const labels = this.isMultiplexed() ? (this.selectedConfig()?.labels?.length || 1) : 1;

    return samples * fractions * techReps * labels;
  }

  incrementFractions(): void {
    this.wizardState.setFractionCount(this.state().fractionCount + 1);
  }

  decrementFractions(): void {
    this.wizardState.setFractionCount(this.state().fractionCount - 1);
  }

  incrementReplicates(): void {
    this.wizardState.setTechnicalReplicates(this.state().technicalReplicates + 1);
  }

  decrementReplicates(): void {
    this.wizardState.setTechnicalReplicates(this.state().technicalReplicates - 1);
  }
}
