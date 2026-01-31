/**
 * SDRF Editor Component
 *
 * Main container component for the standalone SDRF editor.
 * Uses virtual scrolling for scalability with large files (10,000+ rows).
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  signal,
  computed,
  ChangeDetectionStrategy,
  ElementRef,
  ViewChild,
  AfterViewInit,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { SdrfTable } from '../../core/models/sdrf-table';
import { SdrfColumn, getValueForSample } from '../../core/models/sdrf-column';
import { ValidationResult } from '../../core/models/validation';
import { SdrfParserService, SdrfParseResult } from '../../core/services/sdrf-parser.service';
import { SdrfValidatorService } from '../../core/services/sdrf-validator.service';
import { SdrfExportService } from '../../core/services/sdrf-export.service';
import { setValueForSample } from '../../core/utils/modifier-utils';
import { SdrfCellEditorComponent } from '../sdrf-cell-editor/sdrf-cell-editor.component';
import { SdrfColumnStatsComponent, SelectByValueEvent, BulkEditEvent } from '../sdrf-column-stats/sdrf-column-stats.component';
import { SdrfBulkToolbarComponent, BulkColumnEditEvent } from '../sdrf-bulk-toolbar/sdrf-bulk-toolbar.component';
import { SdrfFilterBarComponent, FilterResult } from '../sdrf-filter-bar/sdrf-filter-bar.component';

/**
 * Cell selection state.
 */
export interface CellSelection {
  row: number;
  col: number;
}

/** Row height in pixels for virtual scrolling */
const ROW_HEIGHT = 32;

/** Number of rows to render outside visible area (buffer) */
const BUFFER_ROWS = 10;

@Component({
  selector: 'sdrf-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, SdrfCellEditorComponent, SdrfColumnStatsComponent, SdrfBulkToolbarComponent, SdrfFilterBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sdrf-editor" [class.loading]="loading()">
      <!-- Toolbar -->
      <div class="sdrf-toolbar">
        <div class="toolbar-left">
          <input
            type="file"
            #fileInput
            accept=".tsv,.txt,.sdrf"
            style="display: none"
            (change)="onFileSelected($event)"
          />
          <button class="btn btn-primary" (click)="fileInput.click()">
            Import File
          </button>

          @if (table()) {
            <button class="btn btn-secondary" (click)="exportTsv()">
              Export TSV
            </button>
            <button class="btn btn-secondary" (click)="validate()">
              Validate
            </button>
            <span class="toolbar-divider"></span>
            <button
              class="btn"
              [class.btn-active]="showFilterBar()"
              (click)="toggleFilterBar()"
              title="Filter rows"
            >
              Filter
            </button>
            <button
              class="btn"
              [class.btn-active]="showStatsPanel()"
              (click)="toggleStatsPanel()"
              title="Show column statistics"
            >
              Stats
            </button>
          }
        </div>

        <div class="toolbar-right">
          @if (table()) {
            <div class="column-legend">
              <span class="legend-item source">Source</span>
              <span class="legend-item assay">Assay</span>
              <span class="legend-item characteristic">Characteristics</span>
              <span class="legend-item factor">Factor Values</span>
              <span class="legend-item comment">Comments</span>
            </div>
            <span class="table-info">
              {{ table()!.columns.length }} columns,
              {{ table()!.sampleCount }} samples
              @if (visibleRange()) {
                (showing {{ visibleRange()!.start }}-{{ visibleRange()!.end }})
              }
            </span>
          }
        </div>
      </div>

      <!-- Loading indicator -->
      @if (loading()) {
        <div class="loading-overlay">
          <div class="loading-spinner"></div>
          <span>{{ loadingMessage() }}</span>
        </div>
      }

      <!-- Error display -->
      @if (error()) {
        <div class="error-banner">
          <span>{{ error() }}</span>
          <button class="btn-close" (click)="clearError()">×</button>
        </div>
      }

      <!-- Bulk Edit Toolbar -->
      <sdrf-bulk-toolbar
        [table]="table()"
        [selectedCount]="selectedSamples().size"
        [selectedSamples]="selectedSamples()"
        (clearSelection)="clearSelection()"
        (bulkEdit)="onBulkColumnEdit($event)"
        (copyFromFirst)="onCopyFromFirst($event)"
      ></sdrf-bulk-toolbar>

      <!-- Filter Bar -->
      @if (table() && showFilterBar()) {
        <sdrf-filter-bar
          [table]="table()"
          (filterChange)="onFilterChange($event)"
        ></sdrf-filter-bar>
      }

      <!-- Main content -->
      @if (table()) {
        <div class="sdrf-content">
          <!-- Table and sidebar row -->
          <div class="table-row" [class.with-sidebar]="showStatsPanel()">
            <!-- Virtual scrolling table container -->
            <div
              class="sdrf-table-container"
              #scrollContainer
              (scroll)="onScroll($event)"
            >
            <!-- Sticky header table (outside transform for proper sticky behavior) -->
            <table class="sdrf-table sdrf-header-table">
              <thead>
                <tr>
                  <th class="row-header checkbox-col">
                    <input
                      type="checkbox"
                      [checked]="isAllVisibleSelected()"
                      [indeterminate]="isSomeVisibleSelected()"
                      (change)="toggleSelectAllVisible()"
                      title="Select all visible rows"
                    />
                  </th>
                  <th class="row-header">#</th>
                  @for (column of table()!.columns; track column.columnPosition) {
                    <th
                      [class]="'col-type-' + getColumnTypeClass(column.name)"
                      [class.required]="column.isRequired"
                      [class.selected]="selectedCell()?.col === column.columnPosition"
                      [class.sorted]="sortColumn() === column.columnPosition"
                      (click)="onHeaderClick(column.columnPosition, $event)"
                    >
                      <span class="col-type-indicator"></span>
                      <span class="col-name">{{ column.name }}</span>
                      @if (column.isRequired) {
                        <span class="required-marker">*</span>
                      }
                      @if (sortColumn() === column.columnPosition) {
                        <span class="sort-indicator">{{ sortDirection() === 'asc' ? '▲' : '▼' }}</span>
                      }
                    </th>
                  }
                </tr>
              </thead>
            </table>

            <!-- Spacer for total scroll height -->
            <div
              class="scroll-spacer"
              [style.height.px]="totalHeight()"
            >
              <!-- Body table positioned at scroll offset -->
              <table
                class="sdrf-table sdrf-body-table"
                [style.transform]="'translateY(' + tableOffset() + 'px)'"
              >
                <tbody>
                  @for (rowIndex of visibleRows(); track rowIndex) {
                    <tr
                      [class.selected]="selectedCell()?.row === rowIndex"
                      [class.row-selected]="isRowSelected(rowIndex)"
                      [style.height.px]="ROW_HEIGHT"
                    >
                      <td class="row-header checkbox-col">
                        <input
                          type="checkbox"
                          [checked]="isRowSelected(rowIndex)"
                          (change)="toggleRowSelection(rowIndex, $event)"
                          (click)="$event.stopPropagation()"
                        />
                      </td>
                      <td class="row-header" (click)="onRowHeaderClick(rowIndex, $event)">
                        {{ rowIndex }}
                      </td>
                      @for (column of table()!.columns; track column.columnPosition) {
                        <td
                          [class.selected]="isSelected(rowIndex, column.columnPosition)"
                          [class.has-error]="hasCellError(rowIndex, column.columnPosition)"
                          (click)="selectCell(rowIndex, column.columnPosition)"
                          (dblclick)="startEditing(rowIndex, column.columnPosition)"
                          (contextmenu)="onCellContextMenu($event, rowIndex, column.columnPosition)"
                        >
                          <span
                            class="cell-value"
                            [class.reserved-value]="isReservedValue(getCellValue(rowIndex, column.columnPosition))"
                            [class.reserved-not-available]="isReservedValueType(getCellValue(rowIndex, column.columnPosition), 'not available')"
                            [class.reserved-not-applicable]="isReservedValueType(getCellValue(rowIndex, column.columnPosition), 'not applicable')"
                            [class.reserved-anonymized]="isReservedValueType(getCellValue(rowIndex, column.columnPosition), 'anonymized')"
                            [class.reserved-pooled]="isReservedValueType(getCellValue(rowIndex, column.columnPosition), 'pooled')"
                          >
                            {{ getCellValue(rowIndex, column.columnPosition) }}
                          </span>
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <!-- Cell editor popup -->
            @if (editingCell() && editingColumn()) {
              <div
                class="cell-editor-popup"
                [style.top.px]="editorPosition().top"
                [style.left.px]="editorPosition().left"
              >
                <sdrf-cell-editor
                  [value]="getCellValue(editingCell()!.row, editingCell()!.col)"
                  [column]="editingColumn()!"
                  [rowIndex]="editingCell()!.row"
                  (save)="onCellEditorSave($event)"
                  (cancel)="cancelEditing()"
                ></sdrf-cell-editor>
              </div>
            }
          </div>

          <!-- Stats Panel Sidebar -->
          @if (showStatsPanel()) {
            <sdrf-column-stats
              [table]="table()"
              [selectedSamples]="selectedSamples()"
              (close)="toggleStatsPanel()"
              (selectByValue)="onSelectByValue($event)"
              (bulkEdit)="onStatsPanelBulkEdit($event)"
              (selectSamples)="onSelectSamples($event)"
            ></sdrf-column-stats>
          }
        </div>

          <!-- Jump to row control -->
          <div class="jump-to-row">
            <label>
              Go to row:
              <input
                type="number"
                min="1"
                [max]="table()!.sampleCount"
                [(ngModel)]="jumpToRowInput"
                (keydown.enter)="jumpToRow()"
                class="jump-input"
              />
            </label>
            <button class="btn btn-small" (click)="jumpToRow()">Go</button>
          </div>

          <!-- Validation panel -->
          @if (validationResult()) {
            <div class="validation-panel" [class.has-errors]="!validationResult()!.isValid">
              <div class="validation-header">
                <h3>
                  @if (validationResult()!.isValid) {
                    ✓ Validation Passed
                  } @else {
                    ✗ Validation Failed
                  }
                </h3>
                <button class="btn-close" (click)="clearValidation()">×</button>
              </div>

              @if (validationResult()!.errors.length > 0) {
                <div class="validation-errors">
                  <h4>Errors ({{ validationResult()!.errors.length }})</h4>
                  <ul>
                    @for (err of validationResult()!.errors.slice(0, 20); track $index) {
                      <li class="error">
                        @if (err.column) {
                          <strong>{{ err.column }}:</strong>
                        }
                        {{ err.message }}
                      </li>
                    }
                    @if (validationResult()!.errors.length > 20) {
                      <li class="more">... and {{ validationResult()!.errors.length - 20 }} more errors</li>
                    }
                  </ul>
                </div>
              }

              @if (validationResult()!.warnings.length > 0) {
                <div class="validation-warnings">
                  <h4>Warnings ({{ validationResult()!.warnings.length }})</h4>
                  <ul>
                    @for (warning of validationResult()!.warnings.slice(0, 10); track $index) {
                      <li class="warning">
                        @if (warning.column) {
                          <strong>{{ warning.column }}:</strong>
                        }
                        {{ warning.message }}
                      </li>
                    }
                    @if (validationResult()!.warnings.length > 10) {
                      <li class="more">... and {{ validationResult()!.warnings.length - 10 }} more warnings</li>
                    }
                  </ul>
                </div>
              }
            </div>
          }

          <!-- Context Menu -->
          @if (contextMenu()) {
            <div
              class="context-menu"
              [style.top.px]="contextMenu()!.y"
              [style.left.px]="contextMenu()!.x"
            >
              <button (click)="selectAllWithSameValue()">
                Select all with same value
              </button>
              <button (click)="selectAllInColumn()">
                Select all in this column
              </button>
              <hr />
              <button (click)="editSelectedCells()">
                Edit selected cells
              </button>
              <button (click)="clearSelectedCells()">
                Clear selected cells
              </button>
              <button (click)="closeContextMenu()">
                Cancel
              </button>
            </div>
          }
        </div>
      } @else if (!loading() && !error()) {
        <div class="empty-state">
          <p>No SDRF file loaded</p>
          <p class="hint">Import a file or provide a URL to get started</p>
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      overflow: hidden;
    }

    .sdrf-editor {
      display: flex;
      flex-direction: column;
      height: 100%;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      overflow: hidden;
    }

    /* Ensure child components don't expand beyond their content */
    sdrf-bulk-toolbar,
    sdrf-filter-bar {
      display: block;
      flex-shrink: 0;
    }

    .sdrf-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 16px;
      background: #f5f5f5;
      border-bottom: 1px solid #ddd;
      gap: 8px;
      flex-shrink: 0;
    }

    .toolbar-left, .toolbar-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .btn {
      padding: 6px 12px;
      border: 1px solid #ccc;
      border-radius: 4px;
      background: white;
      cursor: pointer;
      font-size: 13px;
    }

    .btn:hover {
      background: #f0f0f0;
    }

    .btn-primary {
      background: #0066cc;
      color: white;
      border-color: #0066cc;
    }

    .btn-primary:hover {
      background: #0055aa;
    }

    .btn-secondary {
      background: #6c757d;
      color: white;
      border-color: #6c757d;
    }

    .btn-secondary:hover {
      background: #5a6268;
    }

    .btn-small {
      padding: 4px 8px;
      font-size: 12px;
    }

    .table-info {
      color: #666;
      font-size: 12px;
    }

    .column-legend {
      display: flex;
      gap: 8px;
      margin-right: 16px;
      padding-right: 16px;
      border-right: 1px solid #ddd;
    }

    .legend-item {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 3px;
      border-left: 3px solid;
    }

    .legend-item.source {
      border-left-color: #4caf50;
      background: rgba(76, 175, 80, 0.1);
    }

    .legend-item.assay {
      border-left-color: #9c27b0;
      background: rgba(156, 39, 176, 0.1);
    }

    .legend-item.characteristic {
      border-left-color: #2196f3;
      background: rgba(33, 150, 243, 0.1);
    }

    .legend-item.factor {
      border-left-color: #ff9800;
      background: rgba(255, 152, 0, 0.1);
    }

    .legend-item.comment {
      border-left-color: #9e9e9e;
      background: rgba(158, 158, 158, 0.1);
    }

    .loading-overlay {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
      color: #666;
      flex: 1;
    }

    .loading-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid #f3f3f3;
      border-top: 3px solid #0066cc;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 12px;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .error-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: #fee2e2;
      color: #b91c1c;
      border-bottom: 1px solid #fca5a5;
      flex-shrink: 0;
    }

    .btn-close {
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      padding: 0 4px;
    }

    .sdrf-content {
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
      min-height: 0;
    }

    .table-row {
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
      min-height: 0;
    }

    .table-row.with-sidebar {
      flex-direction: row;
    }

    .table-row.with-sidebar .sdrf-table-container {
      flex: 1;
      min-width: 0;
    }

    .table-row.with-sidebar sdrf-column-stats {
      flex-shrink: 0;
    }

    .sdrf-table-container {
      flex: 1;
      overflow: auto;
      position: relative;
      min-height: 0;
    }

    .scroll-spacer {
      position: relative;
      width: fit-content;
      min-width: 100%;
    }

    .sdrf-table {
      border-collapse: collapse;
      font-size: 13px;
      position: relative;
      table-layout: fixed;
      width: max-content;
      min-width: 100%;
    }

    /* Sticky header table - stays at top during scroll */
    .sdrf-header-table {
      position: sticky;
      top: 0;
      z-index: 20;
      background: #f8f9fa;
    }

    /* Body table uses transform for virtual scrolling */
    .sdrf-body-table {
      will-change: transform;
    }

    .sdrf-table th,
    .sdrf-table td {
      border: 1px solid #ddd;
      padding: 6px 8px;
      text-align: left;
      white-space: nowrap;
      min-width: 100px;
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      height: 32px;
      box-sizing: border-box;
    }

    .sdrf-table th {
      background: #f8f9fa;
      font-weight: 600;
    }

    .sdrf-table th.required {
      background: #fff3cd;
    }

    .required-marker {
      color: #dc3545;
      margin-left: 2px;
    }

    .row-header {
      background: #f8f9fa;
      font-weight: 500;
      text-align: center;
      width: 60px;
      min-width: 60px;
      max-width: 60px;
      position: sticky;
      left: 0;
      z-index: 5;
    }

    .sdrf-header-table .row-header {
      z-index: 25;
    }

    .checkbox-col {
      width: 32px;
      min-width: 32px;
      max-width: 32px;
      text-align: center;
      padding: 4px !important;
    }

    .checkbox-col input[type="checkbox"] {
      margin: 0;
      cursor: pointer;
    }

    .sdrf-table td.selected,
    .sdrf-table th.selected {
      background: #e3f2fd;
      outline: 2px solid #2196f3;
      outline-offset: -2px;
    }

    .sdrf-table td.has-error {
      background: #ffebee;
    }

    .cell-value {
      display: block;
      min-height: 1em;
    }

    /* Reserved value styling - muted appearance to indicate valid but placeholder values */
    .cell-value.reserved-value {
      color: #9e9e9e;
      font-style: italic;
    }

    /* Specific reserved value types with visible background */
    .cell-value.reserved-not-available {
      color: #757575;
      font-style: italic;
      background: #f5f5f5;
      border-radius: 3px;
      padding: 2px 6px;
      margin: -2px -6px;
    }

    .cell-value.reserved-not-applicable {
      color: #757575;
      font-style: italic;
      background: #f5f5f5;
      border-radius: 3px;
      padding: 2px 6px;
      margin: -2px -6px;
    }

    .cell-value.reserved-anonymized {
      color: #7b1fa2;
      font-style: italic;
      background: #f3e5f5;
      border-radius: 3px;
      padding: 2px 6px;
      margin: -2px -6px;
    }

    .cell-value.reserved-pooled {
      color: #1565c0;
      font-style: italic;
      background: #e3f2fd;
      border-radius: 3px;
      padding: 2px 6px;
      margin: -2px -6px;
    }

    .cell-editor-popup {
      position: absolute;
      z-index: 100;
      animation: fadeIn 0.15s ease-out;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .jump-to-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: #f8f9fa;
      border-top: 1px solid #ddd;
      flex-shrink: 0;
    }

    .jump-to-row label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }

    .jump-input {
      width: 80px;
      padding: 4px 8px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 13px;
    }

    .validation-panel {
      padding: 16px;
      border-top: 1px solid #ddd;
      background: #f8f9fa;
      max-height: 200px;
      overflow-y: auto;
      flex-shrink: 0;
    }

    .validation-panel.has-errors {
      background: #fff5f5;
    }

    .validation-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .validation-header h3 {
      margin: 0;
      font-size: 14px;
    }

    .validation-errors h4,
    .validation-warnings h4 {
      margin: 0 0 8px 0;
      font-size: 13px;
      font-weight: 600;
    }

    .validation-errors ul,
    .validation-warnings ul {
      margin: 0;
      padding-left: 20px;
    }

    .validation-errors li {
      color: #b91c1c;
    }

    .validation-warnings li {
      color: #b45309;
    }

    .validation-errors li.more,
    .validation-warnings li.more {
      font-style: italic;
      opacity: 0.8;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px;
      color: #666;
      flex: 1;
    }

    .empty-state p {
      margin: 4px 0;
    }

    .empty-state .hint {
      font-size: 12px;
      color: #999;
    }

    /* Column type indicators - subtle left border style */
    .col-type-indicator {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
    }

    .sdrf-table th {
      padding-left: 10px;
    }

    .sdrf-table th .col-name {
      display: inline;
    }

    /* Source Name - Green */
    .col-type-source .col-type-indicator { background: #4caf50; }
    .col-type-source { border-left: 3px solid #4caf50; }

    /* Assay Name - Purple */
    .col-type-assay .col-type-indicator { background: #9c27b0; }
    .col-type-assay { border-left: 3px solid #9c27b0; }

    /* Characteristics - Blue */
    .col-type-characteristic .col-type-indicator { background: #2196f3; }
    .col-type-characteristic { border-left: 3px solid #2196f3; }

    /* Factor Value - Orange */
    .col-type-factor .col-type-indicator { background: #ff9800; }
    .col-type-factor { border-left: 3px solid #ff9800; }

    /* Comment - Gray */
    .col-type-comment .col-type-indicator { background: #9e9e9e; }
    .col-type-comment { border-left: 3px solid #9e9e9e; }

    /* Technology Type & Special - Blue Gray */
    .col-type-special .col-type-indicator { background: #607d8b; }
    .col-type-special { border-left: 3px solid #607d8b; }

    /* Other/Unknown */
    .col-type-other .col-type-indicator { background: #bdbdbd; }
    .col-type-other { border-left: 3px solid #bdbdbd; }

    /* Sort indicator */
    .sort-indicator {
      margin-left: 4px;
      font-size: 10px;
      color: #1976d2;
    }

    .sdrf-table th.sorted {
      background: #e3f2fd;
    }

    .sdrf-table th:hover {
      cursor: pointer;
      background: #f0f0f0;
    }

    /* Multi-selection styles */
    .toolbar-divider {
      width: 1px;
      height: 24px;
      background: #ddd;
      margin: 0 4px;
    }

    .btn-active {
      background: #e3f2fd !important;
      border-color: #2196f3 !important;
      color: #1976d2 !important;
    }


    tr.row-selected td {
      background: #e8f5e9 !important;
    }

    tr.row-selected td.row-header {
      background: #c8e6c9 !important;
    }

    .context-menu {
      position: absolute;
      z-index: 200;
      background: white;
      border: 1px solid #ddd;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      padding: 4px 0;
      min-width: 200px;
    }

    .context-menu button {
      display: block;
      width: 100%;
      padding: 8px 16px;
      border: none;
      background: none;
      text-align: left;
      cursor: pointer;
      font-size: 13px;
    }

    .context-menu button:hover {
      background: #f5f5f5;
    }

    .context-menu hr {
      margin: 4px 0;
      border: none;
      border-top: 1px solid #eee;
    }
  `],
})
export class SdrfEditorComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  // Expose constant for template
  readonly ROW_HEIGHT = ROW_HEIGHT;

  // ============ Inputs ============

  /** URL to load SDRF from */
  @Input() url?: string;

  /** SDRF content to load directly */
  @Input() content?: string;

  /** Whether the editor is read-only */
  @Input() readonly = false;

  // ============ Outputs ============

  /** Emitted when the table changes */
  @Output() tableChange = new EventEmitter<SdrfTable>();

  /** Emitted when validation completes */
  @Output() validationComplete = new EventEmitter<ValidationResult>();

  // ============ View References ============

  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLDivElement>;

  // ============ State ============

  /** The loaded SDRF table */
  table = signal<SdrfTable | null>(null);

  /** Whether currently loading */
  loading = signal(false);

  /** Loading message */
  loadingMessage = signal('Loading...');

  /** Current error message */
  error = signal<string | null>(null);

  /** Currently selected cell */
  selectedCell = signal<CellSelection | null>(null);

  /** Cell being edited */
  editingCell = signal<CellSelection | null>(null);

  /** Column being edited */
  editingColumn = signal<SdrfColumn | null>(null);

  /** Editor popup position */
  editorPosition = signal({ top: 0, left: 0 });

  /** Validation result */
  validationResult = signal<ValidationResult | null>(null);

  /** Current scroll position */
  scrollTop = signal(0);

  /** Container height */
  containerHeight = signal(500);

  /** Jump to row input */
  jumpToRowInput = 1;

  // ============ Multi-Selection State ============

  /** Selected sample indices (1-based) */
  selectedSamples = signal<Set<number>>(new Set());

  /** Whether stats panel is visible */
  showStatsPanel = signal(false);

  /** Context menu state */
  contextMenu = signal<{ x: number; y: number; row: number; col: number } | null>(null);

  /** Last selected row for shift-click range selection */
  private lastSelectedRow: number | null = null;

  // ============ Filter State ============

  /** Whether filter bar is visible */
  showFilterBar = signal(false);

  /** Filtered row indices (empty = no filter) */
  filteredIndices = signal<number[]>([]);

  // ============ Sorting State ============

  /** Currently sorted column index (-1 = no sort) */
  sortColumn = signal<number>(-1);

  /** Sort direction */
  sortDirection = signal<'asc' | 'desc'>('asc');

  /** Sorted row indices (maps display order to actual sample index) */
  sortedIndices = signal<number[]>([]);

  // ============ Computed (Virtual Scrolling) ============

  /** Total scrollable height (accounts for filtering) */
  totalHeight = computed(() => {
    const t = this.table();
    if (!t) return 0;

    // Use filtered count if filtering, otherwise full count
    const rowCount = this.filteredIndices().length > 0
      ? this.filteredIndices().length
      : t.sampleCount;

    // Add extra height for header
    return (rowCount * ROW_HEIGHT) + ROW_HEIGHT + 100;
  });

  /** Table Y offset for transform */
  tableOffset = computed(() => {
    const range = this.visibleRange();
    if (!range) return 0;
    // Offset to position visible rows, accounting for header
    return (range.start - 1) * ROW_HEIGHT;
  });

  /** Visible row range */
  visibleRange = computed(() => {
    const t = this.table();
    if (!t) return null;

    const scrollPos = this.scrollTop();
    const viewHeight = this.containerHeight();

    // Calculate visible range
    const startRow = Math.max(1, Math.floor(scrollPos / ROW_HEIGHT) - BUFFER_ROWS);
    const visibleCount = Math.ceil(viewHeight / ROW_HEIGHT) + (BUFFER_ROWS * 2);
    const endRow = Math.min(t.sampleCount, startRow + visibleCount);

    return { start: startRow, end: endRow };
  });

  /** Effective row list (filtered and/or sorted) */
  effectiveRows = computed(() => {
    const t = this.table();
    if (!t) return [];

    // Start with all rows or filtered rows
    let rows = this.filteredIndices().length > 0
      ? [...this.filteredIndices()]
      : Array.from({ length: t.sampleCount }, (_, i) => i + 1);

    // Apply sorting if active
    const sorted = this.sortedIndices();
    if (sorted.length > 0) {
      // Filter sorted indices to only include filtered rows
      const rowSet = new Set(rows);
      rows = sorted.filter(i => rowSet.has(i));
    }

    return rows;
  });

  /** Array of visible row indices (accounts for filtering and sorting) */
  visibleRows = computed(() => {
    const range = this.visibleRange();
    if (!range) return [];

    const effective = this.effectiveRows();
    const rows: number[] = [];

    // Get the slice of effective rows for this visible range
    for (let i = range.start - 1; i < range.end && i < effective.length; i++) {
      if (effective[i]) {
        rows.push(effective[i]);
      }
    }

    return rows;
  });

  // ============ Services ============

  private parser = new SdrfParserService();
  private validator = new SdrfValidatorService();
  private exporter = new SdrfExportService();

  private resizeObserver?: ResizeObserver;

  constructor(private ngZone: NgZone) {}

  // ============ Lifecycle ============

  ngOnInit(): void {
    // Auto-load from URL or content if provided
    if (this.url) {
      this.loadFromUrl(this.url);
    } else if (this.content) {
      this.loadFromContent(this.content);
    }
  }

  ngAfterViewInit(): void {
    // Set up resize observer for container height
    if (this.scrollContainer) {
      this.updateContainerHeight();

      this.resizeObserver = new ResizeObserver(() => {
        this.ngZone.run(() => {
          this.updateContainerHeight();
        });
      });
      this.resizeObserver.observe(this.scrollContainer.nativeElement);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['url'] && !changes['url'].firstChange && this.url) {
      this.loadFromUrl(this.url);
    }
    if (changes['content'] && !changes['content'].firstChange && this.content) {
      this.loadFromContent(this.content);
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  // ============ Public Methods ============

  /**
   * Loads SDRF from a URL.
   */
  async loadFromUrl(url: string): Promise<void> {
    this.loading.set(true);
    this.loadingMessage.set('Fetching file...');
    this.error.set(null);

    try {
      const result = await this.parser.parseFromUrl(url);
      this.handleParseResult(result);
    } catch (e) {
      this.error.set(`Failed to load: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Loads SDRF from content string.
   */
  async loadFromContent(content: string): Promise<void> {
    this.loading.set(true);
    this.loadingMessage.set('Parsing file...');
    this.error.set(null);

    try {
      // Use setTimeout to allow UI to update before heavy parsing
      await new Promise(resolve => setTimeout(resolve, 10));
      const result = this.parser.parseFromContent(content);
      this.handleParseResult(result);
    } catch (e) {
      this.error.set(`Failed to parse: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Gets the current table.
   */
  getTable(): SdrfTable | null {
    return this.table();
  }

  /**
   * Validates the current table.
   */
  async validate(): Promise<ValidationResult | null> {
    const t = this.table();
    if (!t) return null;

    this.loading.set(true);
    this.loadingMessage.set('Validating...');

    try {
      // Allow UI to update
      await new Promise(resolve => setTimeout(resolve, 10));
      const result = await this.validator.validate(t);
      this.validationResult.set(result);
      this.validationComplete.emit(result);
      return result;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Exports to TSV and triggers download.
   */
  exportTsv(): void {
    const t = this.table();
    if (!t) return;

    const filename = t.metadata?.filename?.replace(/\.[^.]+$/, '.tsv') || 'sdrf.tsv';
    this.exporter.downloadTsv(t, filename);
  }

  /**
   * Exports to Excel and triggers download.
   */
  async exportExcel(): Promise<void> {
    const t = this.table();
    if (!t) return;

    const filename = t.metadata?.filename?.replace(/\.[^.]+$/, '.xlsx') || 'sdrf.xlsx';
    await this.exporter.downloadExcel(t, filename);
  }

  // ============ Event Handlers ============

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.loading.set(true);
    this.loadingMessage.set(`Parsing ${file.name}...`);
    this.error.set(null);

    this.parser.parseFromFile(file).then((result) => {
      this.handleParseResult(result);
      this.loading.set(false);
      input.value = ''; // Reset input
    });
  }

  onScroll(event: Event): void {
    const target = event.target as HTMLDivElement;
    this.scrollTop.set(target.scrollTop);
  }

  selectCell(row: number, col: number): void {
    this.selectedCell.set({ row, col });
  }

  selectColumn(col: number): void {
    this.selectedCell.set({ row: 0, col });
  }

  startEditing(row: number, col: number): void {
    if (this.readonly) return;

    const t = this.table();
    if (!t || col >= t.columns.length) return;

    // Get the cell element to position the editor
    const cellSelector = `tr:nth-child(${row - (this.visibleRange()?.start ?? 1) + 1}) td:nth-child(${col + 2})`;
    const cell = this.scrollContainer?.nativeElement.querySelector(cellSelector) as HTMLElement;

    if (cell) {
      const containerRect = this.scrollContainer.nativeElement.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();

      // Position editor below and to the right of the cell, within container bounds
      let top = cellRect.bottom - containerRect.top + this.scrollContainer.nativeElement.scrollTop + 4;
      let left = cellRect.left - containerRect.left + 4;

      // Keep editor within visible area
      const maxLeft = containerRect.width - 320; // Approximate editor width
      if (left > maxLeft) left = maxLeft;
      if (left < 0) left = 0;

      this.editorPosition.set({ top, left });
    } else {
      // Fallback positioning
      this.editorPosition.set({ top: 100, left: 100 });
    }

    this.editingCell.set({ row, col });
    this.editingColumn.set(t.columns[col]);
  }

  onCellEditorSave(newValue: string): void {
    const editing = this.editingCell();
    if (!editing) {
      this.cancelEditing();
      return;
    }

    this.setCellValue(editing.row, editing.col, newValue);
    this.editingCell.set(null);
    this.editingColumn.set(null);
  }

  cancelEditing(): void {
    this.editingCell.set(null);
    this.editingColumn.set(null);
  }

  clearError(): void {
    this.error.set(null);
  }

  clearValidation(): void {
    this.validationResult.set(null);
  }

  jumpToRow(): void {
    const t = this.table();
    if (!t || !this.scrollContainer) return;

    const row = Math.max(1, Math.min(this.jumpToRowInput, t.sampleCount));
    const scrollPos = (row - 1) * ROW_HEIGHT;

    this.scrollContainer.nativeElement.scrollTop = scrollPos;
    this.scrollTop.set(scrollPos);
    this.selectedCell.set({ row, col: 0 });
  }

  // ============ Helper Methods ============

  getCellValue(row: number, col: number): string {
    const t = this.table();
    if (!t || col >= t.columns.length) return '';

    const column = t.columns[col];
    return getValueForSample(column, row);
  }

  setCellValue(row: number, col: number, value: string): void {
    const t = this.table();
    if (!t || col >= t.columns.length) return;

    // Clone the table and update the value
    const newTable = { ...t, columns: [...t.columns] };
    const column = { ...newTable.columns[col], modifiers: [...newTable.columns[col].modifiers] };

    // Update value using modifier utilities
    if (value === column.value) {
      // Remove from modifiers if setting to default
      column.modifiers = column.modifiers.filter((m) => {
        const samples = m.samples.split(',').map((s) => parseInt(s.trim(), 10));
        return !samples.includes(row);
      });
    } else {
      // Add or update modifier
      const existingModifier = column.modifiers.find((m) => m.value === value);
      if (existingModifier) {
        existingModifier.samples = `${existingModifier.samples},${row}`;
      } else {
        column.modifiers.push({ samples: String(row), value });
      }
    }

    newTable.columns[col] = column;
    this.table.set(newTable);
    this.tableChange.emit(newTable);
  }

  isSelected(row: number, col: number): boolean {
    const sel = this.selectedCell();
    return sel?.row === row && sel?.col === col;
  }

  hasCellError(row: number, col: number): boolean {
    const result = this.validationResult();
    if (!result) return false;

    const t = this.table();
    if (!t) return false;

    const column = t.columns[col];
    return result.errors.some(
      (e) => e.column?.toLowerCase() === column.name.toLowerCase() && (!e.row || e.row === row)
    );
  }

  /**
   * Reserved SDRF values that are valid but indicate missing/special data.
   */
  private readonly RESERVED_VALUES = [
    'not available',
    'not applicable',
    'anonymized',
    'pooled'
  ];

  /**
   * Checks if a cell value is a reserved SDRF value.
   */
  isReservedValue(value: string): boolean {
    if (!value) return false;
    const lower = value.toLowerCase().trim();
    return this.RESERVED_VALUES.includes(lower);
  }

  /**
   * Checks if a cell value matches a specific reserved value type.
   */
  isReservedValueType(value: string, type: string): boolean {
    if (!value) return false;
    return value.toLowerCase().trim() === type.toLowerCase();
  }

  private updateContainerHeight(): void {
    if (this.scrollContainer) {
      this.containerHeight.set(this.scrollContainer.nativeElement.clientHeight);
    }
  }

  private handleParseResult(result: SdrfParseResult): void {
    if (result.success && result.table) {
      this.table.set(result.table);
      this.tableChange.emit(result.table);
      this.validationResult.set(null);
      this.scrollTop.set(0);
      this.clearSelection();

      if (result.warnings.length > 0) {
        console.warn('Parse warnings:', result.warnings);
      }

      console.log(`Loaded ${result.table.sampleCount} samples, ${result.table.columns.length} columns in ${result.stats.parseTimeMs.toFixed(0)}ms`);
    } else {
      this.error.set(result.error || 'Unknown error');
    }
  }

  // ============ Multi-Selection Methods ============

  toggleStatsPanel(): void {
    this.showStatsPanel.set(!this.showStatsPanel());
  }

  isRowSelected(rowIndex: number): boolean {
    return this.selectedSamples().has(rowIndex);
  }

  toggleRowSelection(rowIndex: number, event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    const newSelection = new Set(this.selectedSamples());

    if (checkbox.checked) {
      newSelection.add(rowIndex);
    } else {
      newSelection.delete(rowIndex);
    }

    this.selectedSamples.set(newSelection);
    this.lastSelectedRow = rowIndex;
  }

  onRowHeaderClick(rowIndex: number, event: MouseEvent): void {
    const newSelection = new Set(this.selectedSamples());

    if (event.shiftKey && this.lastSelectedRow !== null) {
      // Range selection
      const start = Math.min(this.lastSelectedRow, rowIndex);
      const end = Math.max(this.lastSelectedRow, rowIndex);
      for (let i = start; i <= end; i++) {
        newSelection.add(i);
      }
    } else if (event.ctrlKey || event.metaKey) {
      // Toggle selection
      if (newSelection.has(rowIndex)) {
        newSelection.delete(rowIndex);
      } else {
        newSelection.add(rowIndex);
      }
    } else {
      // Single selection
      newSelection.clear();
      newSelection.add(rowIndex);
    }

    this.selectedSamples.set(newSelection);
    this.lastSelectedRow = rowIndex;
  }

  isAllVisibleSelected(): boolean {
    const visible = this.visibleRows();
    if (visible.length === 0) return false;
    return visible.every(r => this.selectedSamples().has(r));
  }

  isSomeVisibleSelected(): boolean {
    const visible = this.visibleRows();
    const selected = this.selectedSamples();
    const someSelected = visible.some(r => selected.has(r));
    const allSelected = visible.every(r => selected.has(r));
    return someSelected && !allSelected;
  }

  toggleSelectAllVisible(): void {
    const visible = this.visibleRows();
    const newSelection = new Set(this.selectedSamples());

    if (this.isAllVisibleSelected()) {
      // Deselect all visible
      for (const r of visible) {
        newSelection.delete(r);
      }
    } else {
      // Select all visible
      for (const r of visible) {
        newSelection.add(r);
      }
    }

    this.selectedSamples.set(newSelection);
  }

  clearSelection(): void {
    this.selectedSamples.set(new Set());
    this.lastSelectedRow = null;
  }

  // ============ Context Menu Methods ============

  onCellContextMenu(event: MouseEvent, row: number, col: number): void {
    event.preventDefault();
    this.contextMenu.set({
      x: event.clientX,
      y: event.clientY,
      row,
      col,
    });
  }

  closeContextMenu(): void {
    this.contextMenu.set(null);
  }

  selectAllWithSameValue(): void {
    const ctx = this.contextMenu();
    if (!ctx) return;

    const value = this.getCellValue(ctx.row, ctx.col);
    const t = this.table();
    if (!t) return;

    const newSelection = new Set(this.selectedSamples());
    for (let i = 1; i <= t.sampleCount; i++) {
      if (this.getCellValue(i, ctx.col) === value) {
        newSelection.add(i);
      }
    }

    this.selectedSamples.set(newSelection);
    this.closeContextMenu();
  }

  selectAllInColumn(): void {
    const ctx = this.contextMenu();
    const t = this.table();
    if (!ctx || !t) return;

    const newSelection = new Set<number>();
    for (let i = 1; i <= t.sampleCount; i++) {
      newSelection.add(i);
    }

    this.selectedSamples.set(newSelection);
    this.closeContextMenu();
  }

  editSelectedCells(): void {
    const ctx = this.contextMenu();
    if (ctx) {
      this.startEditing(ctx.row, ctx.col);
    }
    this.closeContextMenu();
  }

  clearSelectedCells(): void {
    const ctx = this.contextMenu();
    const selected = this.selectedSamples();
    if (!ctx || selected.size === 0) {
      this.closeContextMenu();
      return;
    }

    this.bulkSetValue(ctx.col, '', Array.from(selected));
    this.closeContextMenu();
  }

  // ============ Bulk Edit Methods ============

  onSelectByValue(event: SelectByValueEvent): void {
    const newSelection = new Set(this.selectedSamples());
    for (const idx of event.sampleIndices) {
      newSelection.add(idx);
    }
    this.selectedSamples.set(newSelection);
  }

  onSelectSamples(indices: number[]): void {
    this.selectedSamples.set(new Set(indices));
  }

  onStatsPanelBulkEdit(event: BulkEditEvent): void {
    this.bulkSetValue(event.columnIndex, event.newValue, event.sampleIndices);
  }

  onBulkColumnEdit(event: BulkColumnEditEvent): void {
    this.bulkSetValue(event.columnIndex, event.newValue, event.sampleIndices);
  }

  onCopyFromFirst(columnIndex: number): void {
    const selected = Array.from(this.selectedSamples()).sort((a, b) => a - b);
    if (selected.length < 2) return;

    const firstValue = this.getCellValue(selected[0], columnIndex);
    const restIndices = selected.slice(1);
    this.bulkSetValue(columnIndex, firstValue, restIndices);
  }

  private bulkSetValue(columnIndex: number, newValue: string, sampleIndices: number[]): void {
    const t = this.table();
    if (!t || columnIndex >= t.columns.length) return;

    // Clone the table
    const newTable = { ...t, columns: [...t.columns] };
    const column = { ...newTable.columns[columnIndex], modifiers: [...newTable.columns[columnIndex].modifiers] };

    // Apply value to all samples
    for (const sampleIndex of sampleIndices) {
      setValueForSample(column, sampleIndex, newValue);
    }

    newTable.columns[columnIndex] = column;
    this.table.set(newTable);
    this.tableChange.emit(newTable);

    console.log(`Bulk updated ${sampleIndices.length} samples in column "${column.name}" to "${newValue}"`);
  }

  // ============ Column Type Methods ============

  /**
   * Gets the CSS class for a column based on its name/type.
   */
  getColumnTypeClass(columnName: string): string {
    const name = columnName.toLowerCase().trim();

    if (name === 'source name') {
      return 'source';
    }
    if (name === 'assay name') {
      return 'assay';
    }
    if (name.startsWith('characteristics[')) {
      return 'characteristic';
    }
    if (name.startsWith('factor value[') || name.startsWith('factorvalue[')) {
      return 'factor';
    }
    if (name.startsWith('comment[')) {
      return 'comment';
    }
    if (name === 'technology type' || name === 'fraction identifier' || name === 'label') {
      return 'special';
    }

    return 'other';
  }

  // ============ Sorting Methods ============

  onHeaderClick(columnIndex: number, event: MouseEvent): void {
    // If clicking for selection (with modifier) don't sort
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      this.selectColumn(columnIndex);
      return;
    }

    // Toggle sort
    if (this.sortColumn() === columnIndex) {
      if (this.sortDirection() === 'asc') {
        this.sortDirection.set('desc');
      } else {
        // Clear sort
        this.sortColumn.set(-1);
        this.sortedIndices.set([]);
        return;
      }
    } else {
      this.sortColumn.set(columnIndex);
      this.sortDirection.set('asc');
    }

    this.applySorting();
  }

  private applySorting(): void {
    const t = this.table();
    const colIndex = this.sortColumn();
    if (!t || colIndex < 0) {
      this.sortedIndices.set([]);
      return;
    }

    // Build array of [sampleIndex, value] pairs
    const pairs: [number, string][] = [];
    for (let i = 1; i <= t.sampleCount; i++) {
      pairs.push([i, this.getCellValue(i, colIndex)]);
    }

    // Sort by value
    const dir = this.sortDirection() === 'asc' ? 1 : -1;
    pairs.sort((a, b) => {
      const valA = a[1].toLowerCase();
      const valB = b[1].toLowerCase();

      // Try numeric comparison first
      const numA = parseFloat(valA);
      const numB = parseFloat(valB);
      if (!isNaN(numA) && !isNaN(numB)) {
        return (numA - numB) * dir;
      }

      // Fall back to string comparison
      return valA.localeCompare(valB) * dir;
    });

    this.sortedIndices.set(pairs.map(p => p[0]));
  }

  /**
   * Gets the actual sample index for a display row (accounts for sorting).
   */
  getActualRowIndex(displayIndex: number): number {
    const sorted = this.sortedIndices();
    if (sorted.length === 0) {
      return displayIndex;
    }
    return sorted[displayIndex - 1] || displayIndex;
  }

  // ============ Filter Methods ============

  toggleFilterBar(): void {
    this.showFilterBar.set(!this.showFilterBar());
  }

  onFilterChange(result: FilterResult): void {
    if (result.matchingIndices.length === result.totalCount) {
      // No filter active
      this.filteredIndices.set([]);
    } else {
      this.filteredIndices.set(result.matchingIndices);
    }

    // Reset scroll position when filter changes
    this.scrollTop.set(0);
    if (this.scrollContainer) {
      this.scrollContainer.nativeElement.scrollTop = 0;
    }
  }
}
