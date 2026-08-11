/**
 * Study factors section (embedded in Sample Characteristics / Step 2).
 *
 * Define factor value[…] columns and their candidate values. Per-sample picks
 * happen on Step 3.
 */

import {
  Component,
  inject,
  OnInit,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { WizardStateService } from '../../../core/services/wizard-state.service';
import { WizardFactor } from '../../../core/models/wizard';

@Component({
  selector: 'wizard-factor-values',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="factors-panel">
      <div class="step-header">
        <h3>Study factors (grouping)</h3>
        <p class="step-description">
          Declare the experimental comparison variables as
          <code>factor value[...]</code> columns and add every candidate value.
          On the next step you will assign one value to each sample.
        </p>
      </div>

      <div class="info-banner">
        <span class="info-icon">i</span>
        <div class="info-content">
          <strong>Why factors?</strong>
          <p>
            Factors are how SDRF records study groups (control vs treated, disease
            vs normal, …). Add all group labels here — you can define more than one
            factor.
          </p>
        </div>
      </div>

      <div class="factors-list">
        @for (factor of wizardState.factors(); track $index; let i = $index) {
          <div class="factor-card" [class.disabled]="!factor.enabled">
            <div class="factor-top">
              <label class="enable-toggle" title="Include this factor">
                <input
                  type="checkbox"
                  [ngModel]="factor.enabled"
                  (ngModelChange)="wizardState.toggleFactor(i, $event)"
                />
              </label>

              <div class="name-field">
                <label>Factor name</label>
                <div class="name-input-row">
                  <span class="prefix">factor value[</span>
                  <input
                    type="text"
                    class="form-input"
                    [ngModel]="factor.name"
                    (ngModelChange)="onNameChange(i, $event)"
                    placeholder="compound"
                  />
                  <span class="suffix">]</span>
                </div>
              </div>

              <button
                type="button"
                class="btn-remove"
                (click)="wizardState.removeFactor(i)"
                [disabled]="wizardState.factors().length <= 1"
                title="Remove factor"
              >
                &times;
              </button>
            </div>

            <div class="values-block">
              <label>Candidate values</label>
              <div class="choice-chips">
                @for (value of factor.values; track value) {
                  <span class="selected-chip">
                    {{ value }}
                    <button
                      type="button"
                      class="chip-clear"
                      (click)="wizardState.removeFactorValue(i, value)"
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                } @empty {
                  <span class="empty-hint">No candidates yet — add every group label</span>
                }
              </div>
              <div class="add-row">
                <input
                  type="text"
                  class="form-input"
                  [ngModel]="draftValues()[i] || ''"
                  (ngModelChange)="setDraft(i, $event)"
                  (keydown.enter)="commitDraft(i); $event.preventDefault()"
                  placeholder="e.g. none, EGF, Nocodazole"
                />
                <button
                  type="button"
                  class="btn-add-value"
                  (click)="commitDraft(i)"
                  [disabled]="!(draftValues()[i] || '').trim()"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        }
      </div>

      <button type="button" class="btn-add-factor" (click)="addCustomFactor()">
        + Add factor
      </button>

      @if (!wizardState.isFactorsDefined()) {
        <div class="validation-message">
          <span class="warning-icon">!</span>
          Enable at least one factor with a name and one or more candidate values.
        </div>
      }
    </div>
  `,
  styles: [`
    .factors-panel {
      margin-top: 28px;
      padding-top: 22px;
      border-top: 1px solid #e5e7eb;
    }

    .step-header { margin-bottom: 16px; }
    .step-header h3 {
      margin: 0 0 8px;
      font-size: 16px;
      font-weight: 600;
      color: #1f2937;
    }
    .step-description {
      margin: 0;
      color: #6b7280;
      font-size: 14px;
    }
    .step-description code {
      background: #f3f4f6;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 12px;
    }

    .info-banner {
      display: flex;
      gap: 12px;
      padding: 14px 16px;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 10px;
      margin-bottom: 16px;
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
      font-size: 12px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .info-content strong { font-size: 13px; color: #1e40af; }
    .info-content p { margin: 4px 0 0; font-size: 13px; color: #1e3a8a; }

    .factors-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 12px;
    }

    .factor-card {
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      background: white;
      padding: 14px 16px;
    }
    .factor-card.disabled { opacity: 0.55; background: #f9fafb; }

    .factor-top {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      margin-bottom: 12px;
    }
    .enable-toggle { padding-top: 26px; }
    .name-field { flex: 1; display: flex; flex-direction: column; gap: 6px; }
    .name-field label, .values-block label {
      font-size: 12px;
      font-weight: 600;
      color: #6b7280;
    }
    .name-input-row {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .prefix, .suffix {
      font-size: 12px;
      color: #9ca3af;
      font-family: ui-monospace, monospace;
      white-space: nowrap;
    }
    .form-input {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 14px;
      box-sizing: border-box;
    }
    .form-input:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
    }

    .btn-remove {
      margin-top: 22px;
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 8px;
      background: #fee2e2;
      color: #b91c1c;
      font-size: 18px;
      cursor: pointer;
    }
    .btn-remove:disabled { opacity: 0.4; cursor: not-allowed; }

    .values-block { display: flex; flex-direction: column; gap: 8px; }
    .choice-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      min-height: 28px;
      align-items: center;
    }
    .selected-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border-radius: 999px;
      background: #dbeafe;
      color: #1e40af;
      font-size: 12px;
      font-weight: 600;
    }
    .chip-clear {
      border: none;
      background: transparent;
      cursor: pointer;
      color: #64748b;
      font-size: 14px;
      line-height: 1;
      padding: 0;
    }
    .empty-hint { font-size: 12px; color: #94a3b8; }

    .add-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
    }
    .btn-add-value {
      border: 1px solid #bfdbfe;
      background: #eff6ff;
      color: #1d4ed8;
      border-radius: 8px;
      padding: 0 14px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-add-value:disabled { opacity: 0.45; cursor: not-allowed; }

    .btn-add-factor {
      border: 1px dashed #93c5fd;
      background: #eff6ff;
      color: #1d4ed8;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      width: 100%;
    }
    .btn-add-factor:hover { background: #dbeafe; }

    .validation-message {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 14px;
      padding: 12px 14px;
      background: #fef3c7;
      color: #92400e;
      border-radius: 8px;
      font-size: 13px;
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
      font-weight: 700;
      font-size: 12px;
    }
  `],
})
export class FactorValuesComponent implements OnInit {
  readonly wizardState = inject(WizardStateService);
  readonly draftValues = signal<Record<number, string>>({});

  ngOnInit(): void {
    this.wizardState.ensureDefaultFactors();
  }

  setDraft(index: number, value: string): void {
    this.draftValues.update(map => ({ ...map, [index]: value }));
  }

  commitDraft(index: number): void {
    const value = (this.draftValues()[index] || '').trim();
    if (!value) return;
    this.wizardState.addFactorValue(index, value);
    this.draftValues.update(map => ({ ...map, [index]: '' }));
  }

  onNameChange(index: number, name: string): void {
    this.wizardState.updateFactor(index, { name });
  }

  addCustomFactor(): void {
    this.wizardState.addFactor({
      name: '',
      enabled: true,
      values: [],
    } as WizardFactor);
  }
}
