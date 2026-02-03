/**
 * Experiment Setup Component (Step 1)
 *
 * Template selection and sample count configuration.
 */

import {
  Component,
  Input,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { WizardStateService } from '../../../core/services/wizard-state.service';
import { WIZARD_TEMPLATES, WizardTemplate } from '../../../core/models/wizard';

@Component({
  selector: 'wizard-experiment-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="step-container">
      <div class="step-header">
        <h3>What type of experiment is this?</h3>
        <p class="step-description">
          Select the template that best describes your samples. This will determine
          which metadata fields are required.
        </p>
      </div>

      <!-- Template Cards -->
      <div class="template-grid">
        @for (template of templates; track template.id) {
          <button
            class="template-card"
            [class.selected]="wizardState.template() === template.id"
            (click)="selectTemplate(template.id)"
          >
            <div class="template-icon">{{ getIcon(template.id) }}</div>
            <div class="template-info">
              <h4>{{ template.name }}</h4>
              <p>{{ template.description }}</p>
              <div class="template-examples">
                <span class="example-label">Examples:</span>
                {{ template.examples.join(', ') }}
              </div>
            </div>
            @if (wizardState.template() === template.id) {
              <div class="selected-badge">&#10003;</div>
            }
          </button>
        }
      </div>

      <!-- Sample Count -->
      <div class="form-section">
        <label class="form-label">
          How many samples do you have?
          <span class="help-text">
            Biological samples (not including fractions or technical replicates)
          </span>
        </label>
        <div class="sample-count-input">
          <button
            class="count-btn"
            (click)="decrementSamples()"
            [disabled]="wizardState.sampleCount() <= 1"
          >
            -
          </button>
          <input
            type="number"
            [ngModel]="wizardState.sampleCount()"
            (ngModelChange)="setSampleCount($event)"
            min="1"
            max="1000"
            class="count-input"
          />
          <button
            class="count-btn"
            (click)="incrementSamples()"
            [disabled]="wizardState.sampleCount() >= 1000"
          >
            +
          </button>
        </div>
      </div>

      <!-- Experiment Description (for AI context) -->
      @if (aiEnabled) {
        <div class="form-section">
          <label class="form-label">
            Describe your experiment
            <span class="optional-badge">Optional - helps AI suggestions</span>
          </label>
          <textarea
            class="form-textarea"
            [ngModel]="state().experimentDescription"
            (ngModelChange)="setDescription($event)"
            placeholder="E.g., Comparing protein expression between healthy and cancer tissues from 8 patients using TMT labeling..."
            rows="3"
          ></textarea>
        </div>
      }

      <!-- Validation Message -->
      @if (!wizardState.isStep1Valid()) {
        <div class="validation-message">
          <span class="warning-icon">!</span>
          Please select a template and specify the number of samples to continue.
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

    .template-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin-bottom: 32px;
    }

    .template-card {
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: 16px;
      padding: 20px;
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      background: white;
      cursor: pointer;
      text-align: left;
      transition: all 0.15s;
    }

    .template-card:hover {
      border-color: #d1d5db;
      background: #f9fafb;
    }

    .template-card.selected {
      border-color: #3b82f6;
      background: #eff6ff;
    }

    .template-icon {
      width: 48px;
      height: 48px;
      border-radius: 10px;
      background: #f3f4f6;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      flex-shrink: 0;
    }

    .template-card.selected .template-icon {
      background: #dbeafe;
    }

    .template-info {
      flex: 1;
      min-width: 0;
    }

    .template-info h4 {
      margin: 0 0 4px 0;
      font-size: 15px;
      font-weight: 600;
      color: #1f2937;
    }

    .template-info p {
      margin: 0 0 8px 0;
      font-size: 13px;
      color: #6b7280;
      line-height: 1.4;
    }

    .template-examples {
      font-size: 12px;
      color: #9ca3af;
    }

    .example-label {
      font-weight: 500;
    }

    .selected-badge {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #3b82f6;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: bold;
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

    .optional-badge {
      display: inline-block;
      font-size: 11px;
      font-weight: normal;
      color: #8b5cf6;
      background: #f3e8ff;
      padding: 2px 8px;
      border-radius: 4px;
      margin-left: 8px;
    }

    .sample-count-input {
      display: flex;
      align-items: center;
      gap: 0;
      width: fit-content;
    }

    .count-btn {
      width: 40px;
      height: 40px;
      border: 1px solid #d1d5db;
      background: white;
      font-size: 20px;
      font-weight: 500;
      color: #374151;
      cursor: pointer;
      transition: all 0.15s;
    }

    .count-btn:first-child {
      border-radius: 8px 0 0 8px;
    }

    .count-btn:last-child {
      border-radius: 0 8px 8px 0;
    }

    .count-btn:hover:not(:disabled) {
      background: #f3f4f6;
    }

    .count-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .count-input {
      width: 80px;
      height: 40px;
      border: 1px solid #d1d5db;
      border-left: none;
      border-right: none;
      text-align: center;
      font-size: 16px;
      font-weight: 500;
    }

    .count-input:focus {
      outline: none;
      border-color: #3b82f6;
    }

    .form-textarea {
      width: 100%;
      padding: 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      resize: vertical;
      font-family: inherit;
    }

    .form-textarea:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .form-textarea::placeholder {
      color: #9ca3af;
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
      .template-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
})
export class ExperimentSetupComponent {
  @Input() aiEnabled = false;

  readonly wizardState = inject(WizardStateService);
  readonly templates = WIZARD_TEMPLATES;

  readonly state = this.wizardState.state;

  selectTemplate(template: WizardTemplate): void {
    this.wizardState.setTemplate(template);
  }

  setSampleCount(count: number): void {
    this.wizardState.setSampleCount(count);
  }

  incrementSamples(): void {
    this.wizardState.setSampleCount(this.wizardState.sampleCount() + 1);
  }

  decrementSamples(): void {
    this.wizardState.setSampleCount(this.wizardState.sampleCount() - 1);
  }

  setDescription(description: string): void {
    this.wizardState.setExperimentDescription(description);
  }

  getIcon(templateId: WizardTemplate): string {
    switch (templateId) {
      case 'human': return '\ud83e\uddd1';
      case 'cell-line': return '\ud83e\uddeb';
      case 'vertebrate': return '\ud83d\udc2d';
      case 'other': return '\ud83e\uddec';
      default: return '\u2753';
    }
  }
}
