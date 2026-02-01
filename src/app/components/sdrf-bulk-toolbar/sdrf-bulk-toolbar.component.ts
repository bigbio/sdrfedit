/**
 * SDRF Bulk Edit Toolbar
 *
 * Toolbar that appears when multiple samples are selected.
 * Provides bulk editing actions for selected samples.
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { SdrfTable } from '../../core/models/sdrf-table';
import { SdrfColumn } from '../../core/models/sdrf-column';

/**
 * Event emitted when bulk editing a column.
 */
export interface BulkColumnEditEvent {
  columnIndex: number;
  newValue: string;
  sampleIndices: number[];
}

@Component({
  selector: 'sdrf-bulk-toolbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="bulk-toolbar" [class.visible]="selectedCount > 0">
      <div class="toolbar-info">
        <span class="selection-count">
          <strong>{{ selectedCount }}</strong> samples selected
        </span>
        <button class="btn-link" (click)="clearSelection.emit()">
          Clear selection
        </button>
      </div>

      <div class="toolbar-actions">
        <!-- Quick Edit -->
        <div class="action-group">
          <select
            [(ngModel)]="selectedColumnIndex"
            class="column-select"
          >
            <option value="-1">Select column...</option>
            @for (column of table?.columns; track column.columnPosition; let i = $index) {
              <option [value]="i">{{ column.name }}</option>
            }
          </select>

          @if (selectedColumnIndex >= 0) {
            <input
              type="text"
              [(ngModel)]="newValue"
              placeholder="Enter new value..."
              class="value-input"
              (keydown.enter)="applyBulkEdit()"
            />
            <button
              class="btn btn-primary"
              [disabled]="!newValue"
              (click)="applyBulkEdit()"
            >
              Apply to Selected
            </button>
          }
        </div>

        <!-- More Actions -->
        <div class="action-group">
          <button class="btn btn-secondary" (click)="copyFirstValue()">
            Copy from First
          </button>
          <button class="btn btn-danger" (click)="clearValues()">
            Clear Values
          </button>
        </div>
      </div>

      @if (showConfirm()) {
        <div class="confirm-overlay">
          <div class="confirm-dialog">
            <p>{{ confirmMessage() }}</p>
            <div class="confirm-actions">
              <button class="btn btn-primary" (click)="confirmAction()">
                Confirm
              </button>
              <button class="btn" (click)="cancelConfirm()">
                Cancel
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .bulk-toolbar {
      display: none;
      background: #1a237e;
      color: white;
      padding: 12px 16px;
      gap: 16px;
      align-items: center;
      flex-wrap: wrap;
      position: relative;
    }

    .bulk-toolbar.visible {
      display: flex;
    }

    .toolbar-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .selection-count {
      font-size: 14px;
    }

    .selection-count strong {
      font-size: 18px;
    }

    .btn-link {
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.8);
      cursor: pointer;
      font-size: 12px;
      text-decoration: underline;
    }

    .btn-link:hover {
      color: white;
    }

    .toolbar-actions {
      display: flex;
      gap: 16px;
      flex: 1;
      flex-wrap: wrap;
    }

    .action-group {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .column-select {
      padding: 8px 12px;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.1);
      color: white;
      font-size: 13px;
      min-width: 180px;
    }

    .column-select option {
      background: #1a237e;
      color: white;
    }

    .value-input {
      padding: 8px 12px;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.95);
      font-size: 13px;
      min-width: 200px;
    }

    .value-input:focus {
      outline: none;
      border-color: white;
    }

    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-primary {
      background: #4caf50;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #43a047;
    }

    .btn-primary:disabled {
      background: rgba(255, 255, 255, 0.2);
      cursor: not-allowed;
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.3);
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.3);
    }

    .btn-danger {
      background: #f44336;
      color: white;
    }

    .btn-danger:hover {
      background: #e53935;
    }

    .confirm-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
    }

    .confirm-dialog {
      background: white;
      color: #333;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      max-width: 400px;
    }

    .confirm-dialog p {
      margin: 0 0 16px 0;
    }

    .confirm-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .confirm-actions .btn {
      color: #333;
      background: #e0e0e0;
    }

    .confirm-actions .btn-primary {
      background: #2196f3;
      color: white;
    }
  `],
})
export class SdrfBulkToolbarComponent {
  @Input() table: SdrfTable | null = null;
  @Input() selectedCount = 0;
  @Input() selectedSamples: Set<number> = new Set();

  @Output() clearSelection = new EventEmitter<void>();
  @Output() bulkEdit = new EventEmitter<BulkColumnEditEvent>();
  @Output() copyFromFirst = new EventEmitter<number>(); // column index

  selectedColumnIndex = -1;
  newValue = '';

  showConfirm = signal(false);
  confirmMessage = signal('');
  pendingAction: (() => void) | null = null;

  applyBulkEdit(): void {
    if (this.selectedColumnIndex < 0 || !this.newValue) return;

    const indices = Array.from(this.selectedSamples);
    this.confirmMessage.set(
      `Apply "${this.newValue}" to ${indices.length} samples in column "${this.table?.columns[this.selectedColumnIndex]?.name}"?`
    );
    this.pendingAction = () => {
      this.bulkEdit.emit({
        columnIndex: this.selectedColumnIndex,
        newValue: this.newValue,
        sampleIndices: indices,
      });
      this.newValue = '';
    };
    this.showConfirm.set(true);
  }

  copyFirstValue(): void {
    if (this.selectedColumnIndex < 0) return;

    this.confirmMessage.set(
      `Copy value from first selected sample to all ${this.selectedSamples.size} selected samples?`
    );
    this.pendingAction = () => {
      this.copyFromFirst.emit(this.selectedColumnIndex);
    };
    this.showConfirm.set(true);
  }

  clearValues(): void {
    if (this.selectedColumnIndex < 0) return;

    const indices = Array.from(this.selectedSamples);
    this.confirmMessage.set(
      `Clear values for ${indices.length} samples in column "${this.table?.columns[this.selectedColumnIndex]?.name}"?`
    );
    this.pendingAction = () => {
      this.bulkEdit.emit({
        columnIndex: this.selectedColumnIndex,
        newValue: '',
        sampleIndices: indices,
      });
    };
    this.showConfirm.set(true);
  }

  confirmAction(): void {
    if (this.pendingAction) {
      this.pendingAction();
    }
    this.cancelConfirm();
  }

  cancelConfirm(): void {
    this.showConfirm.set(false);
    this.pendingAction = null;
  }
}
