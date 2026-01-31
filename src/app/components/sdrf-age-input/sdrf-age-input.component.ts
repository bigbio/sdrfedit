/**
 * SDRF Age Input Component
 *
 * Specialized input for age values in SDRF format.
 * Supports formats like "30Y", "30Y6M", "25Y-35Y" (ranges).
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  SdrfSyntaxService,
  AgeFormat,
} from '../../core/services/sdrf-syntax.service';

@Component({
  selector: 'sdrf-age-input',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="age-input-container">
      <div class="age-mode-toggle">
        <label>
          <input
            type="checkbox"
            [checked]="isRange()"
            (change)="toggleRange()"
          />
          Age Range
        </label>
      </div>

      @if (isRange()) {
        <!-- Range input -->
        <div class="age-range">
          <div class="age-group">
            <label>From:</label>
            <div class="age-fields">
              <input
                type="number"
                min="0"
                max="200"
                [ngModel]="startYears()"
                (ngModelChange)="updateStartYears($event)"
                placeholder="Y"
                class="age-field"
              />
              <span>Y</span>
              <input
                type="number"
                min="0"
                max="11"
                [ngModel]="startMonths()"
                (ngModelChange)="updateStartMonths($event)"
                placeholder="M"
                class="age-field"
              />
              <span>M</span>
              <input
                type="number"
                min="0"
                max="31"
                [ngModel]="startDays()"
                (ngModelChange)="updateStartDays($event)"
                placeholder="D"
                class="age-field"
              />
              <span>D</span>
            </div>
          </div>

          <div class="age-group">
            <label>To:</label>
            <div class="age-fields">
              <input
                type="number"
                min="0"
                max="200"
                [ngModel]="endYears()"
                (ngModelChange)="updateEndYears($event)"
                placeholder="Y"
                class="age-field"
              />
              <span>Y</span>
              <input
                type="number"
                min="0"
                max="11"
                [ngModel]="endMonths()"
                (ngModelChange)="updateEndMonths($event)"
                placeholder="M"
                class="age-field"
              />
              <span>M</span>
              <input
                type="number"
                min="0"
                max="31"
                [ngModel]="endDays()"
                (ngModelChange)="updateEndDays($event)"
                placeholder="D"
                class="age-field"
              />
              <span>D</span>
            </div>
          </div>
        </div>
      } @else {
        <!-- Single age input -->
        <div class="age-single">
          <div class="age-fields">
            <input
              type="number"
              min="0"
              max="200"
              [ngModel]="years()"
              (ngModelChange)="updateYears($event)"
              placeholder="Years"
              class="age-field"
            />
            <span>Y</span>
            <input
              type="number"
              min="0"
              max="11"
              [ngModel]="months()"
              (ngModelChange)="updateMonths($event)"
              placeholder="Months"
              class="age-field"
            />
            <span>M</span>
            <input
              type="number"
              min="0"
              max="31"
              [ngModel]="days()"
              (ngModelChange)="updateDays($event)"
              placeholder="Days"
              class="age-field"
            />
            <span>D</span>
          </div>
        </div>
      }

      <div class="age-preview">
        <span class="label">Output:</span>
        <code>{{ formattedValue() || '(empty)' }}</code>
      </div>

      @if (validationErrors().length > 0) {
        <div class="validation-errors">
          @for (error of validationErrors(); track $index) {
            <span class="error">{{ error }}</span>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .age-input-container {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: #fafafa;
    }

    .age-mode-toggle label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      cursor: pointer;
    }

    .age-range, .age-single {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .age-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .age-group label {
      min-width: 40px;
      font-size: 13px;
      font-weight: 500;
    }

    .age-fields {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .age-field {
      width: 60px;
      padding: 6px 8px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 13px;
      text-align: center;
    }

    .age-field:focus {
      outline: none;
      border-color: #2196f3;
      box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
    }

    .age-fields span {
      font-size: 12px;
      color: #666;
      min-width: 12px;
    }

    .age-preview {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      background: #fff;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
    }

    .age-preview .label {
      font-size: 12px;
      color: #666;
    }

    .age-preview code {
      font-family: monospace;
      font-size: 13px;
      color: #333;
    }

    .validation-errors {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .validation-errors .error {
      font-size: 12px;
      color: #d32f2f;
    }
  `],
})
export class SdrfAgeInputComponent implements OnInit, OnChanges {
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();

  private syntaxService = new SdrfSyntaxService();

  // Single age state
  years = signal<number | null>(null);
  months = signal<number | null>(null);
  days = signal<number | null>(null);

  // Range state
  isRange = signal(false);
  startYears = signal<number | null>(null);
  startMonths = signal<number | null>(null);
  startDays = signal<number | null>(null);
  endYears = signal<number | null>(null);
  endMonths = signal<number | null>(null);
  endDays = signal<number | null>(null);

  // Validation
  validationErrors = signal<string[]>([]);

  // Computed formatted value
  formattedValue = computed(() => {
    if (this.isRange()) {
      const start = this.formatSingleAge(
        this.startYears(),
        this.startMonths(),
        this.startDays()
      );
      const end = this.formatSingleAge(
        this.endYears(),
        this.endMonths(),
        this.endDays()
      );
      if (start && end) {
        return `${start}-${end}`;
      }
      return '';
    } else {
      return this.formatSingleAge(this.years(), this.months(), this.days());
    }
  });

  ngOnInit(): void {
    this.parseValue();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] && !changes['value'].firstChange) {
      this.parseValue();
    }
  }

  private parseValue(): void {
    if (!this.value) {
      this.resetFields();
      return;
    }

    const parsed = this.syntaxService.parseValue('age', this.value) as AgeFormat;
    if (!parsed) {
      this.resetFields();
      return;
    }

    if (parsed.isRange && parsed.rangeStart && parsed.rangeEnd) {
      this.isRange.set(true);
      this.startYears.set(parsed.rangeStart.years ?? null);
      this.startMonths.set(parsed.rangeStart.months ?? null);
      this.startDays.set(parsed.rangeStart.days ?? null);
      this.endYears.set(parsed.rangeEnd.years ?? null);
      this.endMonths.set(parsed.rangeEnd.months ?? null);
      this.endDays.set(parsed.rangeEnd.days ?? null);
    } else {
      this.isRange.set(false);
      this.years.set(parsed.years ?? null);
      this.months.set(parsed.months ?? null);
      this.days.set(parsed.days ?? null);
    }
  }

  private resetFields(): void {
    this.years.set(null);
    this.months.set(null);
    this.days.set(null);
    this.startYears.set(null);
    this.startMonths.set(null);
    this.startDays.set(null);
    this.endYears.set(null);
    this.endMonths.set(null);
    this.endDays.set(null);
  }

  toggleRange(): void {
    this.isRange.set(!this.isRange());
    this.emitValue();
  }

  // Single age updates
  updateYears(value: number | null): void {
    this.years.set(value);
    this.emitValue();
  }

  updateMonths(value: number | null): void {
    this.months.set(value);
    this.emitValue();
  }

  updateDays(value: number | null): void {
    this.days.set(value);
    this.emitValue();
  }

  // Range updates
  updateStartYears(value: number | null): void {
    this.startYears.set(value);
    this.emitValue();
  }

  updateStartMonths(value: number | null): void {
    this.startMonths.set(value);
    this.emitValue();
  }

  updateStartDays(value: number | null): void {
    this.startDays.set(value);
    this.emitValue();
  }

  updateEndYears(value: number | null): void {
    this.endYears.set(value);
    this.emitValue();
  }

  updateEndMonths(value: number | null): void {
    this.endMonths.set(value);
    this.emitValue();
  }

  updateEndDays(value: number | null): void {
    this.endDays.set(value);
    this.emitValue();
  }

  private formatSingleAge(
    years: number | null,
    months: number | null,
    days: number | null
  ): string {
    let result = '';
    if (years !== null && years > 0) result += `${years}Y`;
    if (months !== null && months > 0) result += `${months}M`;
    if (days !== null && days > 0) result += `${days}D`;
    return result;
  }

  private emitValue(): void {
    const formatted = this.formattedValue();
    this.validate(formatted);
    this.valueChange.emit(formatted);
  }

  private validate(value: string): void {
    if (!value) {
      this.validationErrors.set([]);
      return;
    }

    const parsed = this.syntaxService.parseValue('age', value) as AgeFormat;
    if (parsed) {
      const result = this.syntaxService.validateValue('age', parsed);
      this.validationErrors.set(result.errors);
    } else {
      this.validationErrors.set(['Invalid age format']);
    }
  }
}
