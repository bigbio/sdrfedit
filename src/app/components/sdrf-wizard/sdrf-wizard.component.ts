/**
 * SDRF Creation Wizard Component
 *
 * Main wizard container with step navigation for creating SDRF files from scratch.
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { WizardStateService } from '../../core/services/wizard-state.service';
import { SdrfTable } from '../../core/models/sdrf-table';
import { WizardGeneratorService } from '../../core/services/wizard-generator.service';
import { TemplateService } from '../../core/services/template.service';

// Step components
import { ExperimentSetupComponent } from './steps/experiment-setup.component';
import { SampleCharacteristicsComponent } from './steps/sample-characteristics.component';
import { SampleValuesComponent } from './steps/sample-values.component';
import { TechnicalConfigComponent } from './steps/technical-config.component';
import { InstrumentProtocolComponent } from './steps/instrument-protocol.component';
import { DataFilesComponent } from './steps/data-files.component';
import { ReviewCreateComponent } from './steps/review-create.component';

@Component({
  selector: 'sdrf-wizard',
  standalone: true,
  imports: [
    CommonModule,
    ExperimentSetupComponent,
    SampleCharacteristicsComponent,
    SampleValuesComponent,
    TechnicalConfigComponent,
    InstrumentProtocolComponent,
    DataFilesComponent,
    ReviewCreateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wizard-overlay" (click)="onOverlayClick($event)">
      <div class="wizard-container" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="wizard-header">
          <h2>Create New SDRF</h2>
          <button class="btn-close" (click)="onCancel()" title="Close">&times;</button>
        </div>

        <!-- Progress Steps -->
        <div class="wizard-progress">
          @for (step of wizardState.steps; track step.id; let i = $index) {
            <button
              class="step-indicator"
              [class.active]="i === wizardState.currentStep()"
              [class.completed]="i < wizardState.currentStep()"
              [class.clickable]="i <= wizardState.currentStep()"
              (click)="goToStep(i)"
              [disabled]="i > wizardState.currentStep()"
            >
              <span class="step-number">
                @if (i < wizardState.currentStep()) {
                  <span class="check-icon">&#10003;</span>
                } @else {
                  {{ i + 1 }}
                }
              </span>
              <span class="step-title">{{ step.title }}</span>
            </button>
            @if (i < wizardState.steps.length - 1) {
              <div class="step-connector" [class.completed]="i < wizardState.currentStep()"></div>
            }
          }
        </div>

        <!-- Step Content -->
        <div class="wizard-content">
          @switch (wizardState.currentStep()) {
            @case (0) {
              <wizard-experiment-setup
                [aiEnabled]="aiEnabled"
                [availableTemplates]="availableTemplates"
              />
            }
            @case (1) {
              <wizard-sample-characteristics [aiEnabled]="aiEnabled" />
            }
            @case (2) {
              <wizard-sample-values [aiEnabled]="aiEnabled" />
            }
            @case (3) {
              <wizard-technical-config [aiEnabled]="aiEnabled" />
            }
            @case (4) {
              <wizard-instrument-protocol [aiEnabled]="aiEnabled" />
            }
            @case (5) {
              <wizard-data-files [aiEnabled]="aiEnabled" />
            }
            @case (6) {
              <wizard-review-create
                [aiEnabled]="aiEnabled"
                (createTable)="onCreate($event)"
              />
            }
          }
        </div>

        <!-- Footer Navigation -->
        <div class="wizard-footer">
          <button
            class="btn btn-secondary"
            [disabled]="!wizardState.canGoBack()"
            (click)="wizardState.previousStep()"
          >
            Back
          </button>

          <div class="step-info">
            Step {{ wizardState.currentStep() + 1 }} of {{ wizardState.totalSteps }}
          </div>

          @if (wizardState.currentStep() < wizardState.totalSteps - 1) {
            <button
              class="btn btn-primary"
              [disabled]="!wizardState.canProceed()"
              (click)="wizardState.nextStep()"
            >
              Next
            </button>
          } @else {
            <button
              class="btn btn-primary btn-create"
              [disabled]="!wizardState.canCreate()"
              (click)="onCreateClick()"
            >
              Create SDRF
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    .wizard-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.2s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .wizard-container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 25px 80px rgba(0, 0, 0, 0.3);
      width: 95%;
      max-width: 900px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      animation: slideUp 0.25s ease-out;
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(30px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .wizard-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px;
      border-bottom: 1px solid #e5e7eb;
      flex-shrink: 0;
    }

    .wizard-header h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: #1f2937;
    }

    .btn-close {
      background: none;
      border: none;
      font-size: 28px;
      cursor: pointer;
      color: #6b7280;
      padding: 0;
      line-height: 1;
      transition: color 0.15s;
    }

    .btn-close:hover {
      color: #374151;
    }

    .wizard-progress {
      display: flex;
      align-items: center;
      padding: 20px 24px;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
      flex-shrink: 0;
      overflow-x: auto;
    }

    .step-indicator {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: none;
      border: none;
      cursor: default;
      padding: 0;
      min-width: 80px;
      opacity: 0.5;
      transition: opacity 0.2s;
    }

    .step-indicator.active,
    .step-indicator.completed {
      opacity: 1;
    }

    .step-indicator.clickable {
      cursor: pointer;
    }

    .step-indicator.clickable:hover .step-number {
      transform: scale(1.1);
    }

    .step-number {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #e5e7eb;
      color: #6b7280;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 6px;
      transition: all 0.2s;
    }

    .step-indicator.active .step-number {
      background: #3b82f6;
      color: white;
    }

    .step-indicator.completed .step-number {
      background: #10b981;
      color: white;
    }

    .check-icon {
      font-size: 16px;
    }

    .step-title {
      font-size: 11px;
      color: #6b7280;
      text-align: center;
      white-space: nowrap;
    }

    .step-indicator.active .step-title {
      color: #3b82f6;
      font-weight: 500;
    }

    .step-indicator.completed .step-title {
      color: #10b981;
    }

    .step-connector {
      flex: 1;
      height: 2px;
      background: #e5e7eb;
      margin: 0 8px;
      margin-bottom: 20px;
      min-width: 20px;
      transition: background 0.2s;
    }

    .step-connector.completed {
      background: #10b981;
    }

    .wizard-content {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
    }

    .wizard-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px;
      border-top: 1px solid #e5e7eb;
      background: #f9fafb;
      border-radius: 0 0 12px 12px;
      flex-shrink: 0;
    }

    .step-info {
      font-size: 13px;
      color: #6b7280;
    }

    .btn {
      padding: 10px 24px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-primary {
      background: #3b82f6;
      color: white;
      border-color: #3b82f6;
    }

    .btn-primary:hover:not(:disabled) {
      background: #2563eb;
    }

    .btn-secondary {
      background: white;
      color: #374151;
    }

    .btn-secondary:hover:not(:disabled) {
      background: #f3f4f6;
    }

    .btn-create {
      background: #10b981;
      border-color: #10b981;
    }

    .btn-create:hover:not(:disabled) {
      background: #059669;
    }
  `],
})
export class SdrfWizardComponent implements OnInit {
  @Input() aiEnabled = false;
  @Input() availableTemplates: string[] = ['human', 'cell-lines', 'vertebrates', 'ms-proteomics'];
  @Output() complete = new EventEmitter<SdrfTable>();
  @Output() cancel = new EventEmitter<void>();

  readonly wizardState = inject(WizardStateService);
  private readonly generator = inject(WizardGeneratorService);
  readonly templateService = inject(TemplateService);

  constructor() {
    // Reset wizard state when component is created
    this.wizardState.reset();
  }

  ngOnInit(): void {
    // Fetch templates when wizard opens
    this.templateService.fetchTemplates();
  }

  goToStep(step: number): void {
    if (step <= this.wizardState.currentStep()) {
      this.wizardState.goToStep(step);
    }
  }

  onOverlayClick(event: Event): void {
    if (event.target === event.currentTarget) {
      this.onCancel();
    }
  }

  onCancel(): void {
    this.wizardState.reset();
    this.cancel.emit();
  }

  onCreateClick(): void {
    const table = this.generator.generate(this.wizardState.getState());
    this.onCreate(table);
  }

  onCreate(table: SdrfTable): void {
    this.complete.emit(table);
    this.wizardState.reset();
  }
}
