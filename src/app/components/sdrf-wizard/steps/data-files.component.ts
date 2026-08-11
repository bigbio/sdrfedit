/**
 * Data Files Component (Step 6)
 *
 * Raw files are the truth source for fraction / technical replicate.
 * Import: auto from Step 4 planner, fetch by PXD, or custom paste.
 */

import {
  Component,
  Input,
  OnInit,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { WizardStateService } from '../../../core/services/wizard-state.service';
import {
  fetchPrideRawFileNames,
  normalizePxdAccession,
  isValidPxdAccession,
} from '../../../core/services/pride-archive.service';
import {
  WizardDataFile,
  countUsedChannels,
  buildWizardExpansionRows,
  resolveRunLabelConfigId,
  labelConfigDisplayName,
} from '../../../core/models/wizard';

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
          One row per raw file. Fraction and tech replicate are edited here.
          Files hang on an MS run from Step 4 and expand to its used channels.
        </p>
      </div>

      <section class="form-section">
        <h4 class="section-title">1. Auto from Step 4 planner</h4>
        <p class="section-help">
          Slots are generated automatically when you enter this step (if the table is empty),
          using run × planned fractions × tech names
          (e.g. <code>Run_1_F1.raw</code>, <code>Run_1_F1_r2.raw</code>).
        </p>
        <div class="toolbar-row">
          <button type="button" class="btn-secondary" (click)="regenerateFromPlanner()">
            Regenerate from planner
          </button>
          <span class="soft-status">{{ files().length }} file(s) in table</span>
        </div>
      </section>

      <section class="form-section">
        <h4 class="section-title">2. Fetch from ProteomeXchange (PXD)</h4>
        <p class="section-help">
          Enter a PXD accession to crawl RAW filenames from PRIDE Archive.
          Existing fraction / tech / MS run from the planner table are kept; only filenames are replaced (matched by row order).
        </p>
        <div class="pxd-row">
          <input
            class="pxd-input"
            placeholder="PXD000001"
            [ngModel]="pxdInput()"
            (ngModelChange)="pxdInput.set($event)"
            (keydown.enter)="fetchFromPxd()"
          />
          <button
            type="button"
            class="btn-primary"
            [disabled]="pxdLoading() || !pxdInput().trim()"
            (click)="fetchFromPxd()"
          >
            {{ pxdLoading() ? 'Fetching…' : 'Fetch RAW files' }}
          </button>
        </div>
        @if (pxdStatus()) {
          <div class="status-line" [class.error]="pxdError()" [class.ok]="!pxdError()">
            {{ pxdStatus() }}
          </div>
        }
      </section>

      <section class="form-section">
        <h4 class="section-title">3. Custom filenames</h4>
        <p class="section-help">Paste one filename per line. F# / tech are parsed when possible.</p>
        <div class="paste-block">
          <textarea
            class="paste-area"
            rows="4"
            [ngModel]="pasteText()"
            (ngModelChange)="pasteText.set($event)"
            placeholder="Run_1_F1.raw&#10;Run_1_F2.raw&#10;Run_1_F1_r2.raw"
          ></textarea>
          <div class="toolbar-row">
            <button type="button" class="btn-secondary" (click)="applyPaste(false)">
              Replace table
            </button>
            <button type="button" class="btn-secondary" (click)="applyPaste(true)">
              Append to table
            </button>
            <button type="button" class="btn-secondary" (click)="addEmptyFile()">
              Add empty row
            </button>
            <button
              type="button"
              class="btn-secondary"
              [disabled]="selectedIndices().size === 0"
              (click)="removeSelected()"
            >
              Remove selected
            </button>
          </div>
        </div>
      </section>

      @if (selectedIndices().size > 0) {
        <section class="form-section batch-section">
          <div class="batch-row">
            <span class="small-label">Batch selected ({{ selectedIndices().size }})</span>
            <input
              type="number"
              class="mini-input"
              placeholder="Fraction"
              [ngModel]="batchFraction()"
              (ngModelChange)="batchFraction.set($event)"
              min="1"
            />
            <input
              type="number"
              class="mini-input"
              placeholder="Tech"
              [ngModel]="batchTech()"
              (ngModelChange)="batchTech.set($event)"
              min="1"
            />
            <select
              class="mini-select"
              [ngModel]="batchRunId()"
              (ngModelChange)="batchRunId.set($event)"
            >
              <option value="">Run…</option>
              @for (run of msRuns(); track run.id) {
                <option [value]="run.id">{{ run.name }}</option>
              }
            </select>
            <button type="button" class="btn-secondary" (click)="applyBatch()">Apply</button>
          </div>
        </section>
      }

      <section class="form-section">
        <div class="table-meta">
          <span>{{ files().length }} file(s)</span>
          <span>·</span>
          <span>{{ sdrfRowCount() }} SDRF row(s) after expand</span>
        </div>
        <div class="table-wrap">
          <table class="files-table">
            <thead>
              <tr>
                <th class="check-col">
                  <input
                    type="checkbox"
                    [checked]="allSelected()"
                    (change)="toggleSelectAll($event)"
                  />
                </th>
                <th>Raw file</th>
                <th>MS run</th>
                <th>Fraction</th>
                <th>Tech</th>
                <th>Expands to</th>
              </tr>
            </thead>
            <tbody>
              @for (file of files(); track $index; let i = $index) {
                <tr
                  [class.selected]="selectedIndices().has(i)"
                  [class.active-drill]="drillIndex() === i"
                  (click)="drillIndex.set(i)"
                >
                  <td class="check-col" (click)="$event.stopPropagation()">
                    <input
                      type="checkbox"
                      [checked]="selectedIndices().has(i)"
                      (change)="toggleSelect(i, $event)"
                    />
                  </td>
                  <td>
                    <input
                      class="cell-input"
                      [ngModel]="file.fileName"
                      (ngModelChange)="updateFile(i, { fileName: $event })"
                      (click)="$event.stopPropagation()"
                    />
                  </td>
                  <td (click)="$event.stopPropagation()">
                    <select
                      class="cell-select"
                      [ngModel]="file.runId ?? ''"
                      (ngModelChange)="updateFile(i, { runId: $event || undefined })"
                    >
                      <option value="">—</option>
                      @for (run of msRuns(); track run.id) {
                        <option [value]="run.id">{{ run.name }}</option>
                      }
                    </select>
                  </td>
                  <td (click)="$event.stopPropagation()">
                    <input
                      type="number"
                      class="cell-num"
                      min="1"
                      [ngModel]="file.fractionId ?? 1"
                      (ngModelChange)="updateFile(i, { fractionId: +$event || 1 })"
                    />
                  </td>
                  <td (click)="$event.stopPropagation()">
                    <input
                      type="number"
                      class="cell-num"
                      min="1"
                      [ngModel]="file.technicalReplicate ?? 1"
                      (ngModelChange)="updateFile(i, { technicalReplicate: +$event || 1 })"
                    />
                  </td>
                  <td class="expand-cell">{{ expandLabel(file) }}</td>
                </tr>
              }
            </tbody>
          </table>
          @if (files().length === 0) {
            <div class="empty">No files yet. Enter this step to auto-generate, fetch a PXD, or paste names.</div>
          }
        </div>
      </section>

      @if (drillFile(); as file) {
        <section class="form-section drill">
          <h4 class="section-title">
            Channel map · {{ file.fileName || 'selected file' }}
            @if (drillKitName()) {
              <span class="kit-pill">{{ drillKitName() }}</span>
            }
          </h4>
          <p class="section-help">
            Inherited from
            {{ runName(file.runId) }}. Fraction={{ file.fractionId ?? 1 }},
            Tech={{ file.technicalReplicate ?? 1 }} copy onto every expanded row.
          </p>
          <table class="files-table compact">
            <thead>
              <tr>
                <th>Label</th>
                <th>Role</th>
                <th>Sample / name</th>
              </tr>
            </thead>
            <tbody>
              @for (ch of drillChannels(); track ch.label) {
                <tr>
                  <td class="mono">{{ ch.label }}</td>
                  <td>{{ ch.role }}</td>
                  <td>{{ channelDisplay(ch) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </section>
      }

      @if (!wizardState.isStep6Valid()) {
        <div class="validation-message">
          <span class="warning-icon">!</span>
          Add at least one data file to continue.
        </div>
      }
    </div>
  `,
  styles: [`
    .step-container { max-width: 920px; }
    .step-header { margin-bottom: 16px; }
    .step-header h3 { margin: 0 0 6px; font-size: 18px; font-weight: 600; color: #111827; }
    .step-description { margin: 0; font-size: 13px; color: #6b7280; line-height: 1.45; }

    .form-section {
      margin-bottom: 16px; padding: 14px; border: 1px solid #e5e7eb; border-radius: 12px; background: #fff;
    }
    .form-section.drill { border-color: #bae6fd; background: #f8fbff; }
    .form-section.batch-section { padding: 10px 14px; }
    .section-title { margin: 0 0 4px; font-size: 14px; font-weight: 650; color: #0f172a; }
    .kit-pill {
      display: inline-block; margin-left: 8px; padding: 2px 8px; border-radius: 999px;
      font-size: 11px; font-weight: 600; background: #e0f2fe; color: #0369a1;
      vertical-align: middle;
    }
    .section-help { margin: 0 0 10px; font-size: 12px; color: #64748b; line-height: 1.4; }
    .section-help code {
      font-size: 11px; background: #e2e8f0; padding: 1px 5px; border-radius: 4px;
    }

    .toolbar-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .btn-primary, .btn-secondary {
      border-radius: 8px; padding: 7px 12px; font-size: 12px; cursor: pointer;
    }
    .btn-primary { border: 1px solid #0284c7; background: #0ea5e9; color: #fff; font-weight: 600; }
    .btn-primary:disabled, .btn-secondary:disabled { opacity: 0.45; cursor: not-allowed; }
    .btn-secondary { border: 1px solid #e2e8f0; background: #fff; color: #334155; }
    .soft-status { font-size: 12px; color: #64748b; }

    .pxd-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .pxd-input {
      width: min(220px, 100%); height: 34px; border: 1px solid #d1d5db; border-radius: 8px;
      padding: 0 10px; font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .status-line { margin-top: 8px; font-size: 12px; }
    .status-line.ok { color: #166534; }
    .status-line.error { color: #b91c1c; }

    .paste-block { display: flex; flex-direction: column; gap: 8px; }
    .paste-area {
      width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px;
      font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; resize: vertical;
    }
    .small-label { font-size: 12px; color: #64748b; font-weight: 500; }
    .batch-row {
      display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
    }
    .mini-input, .mini-select {
      height: 32px; border: 1px solid #d1d5db; border-radius: 6px; padding: 0 8px; font-size: 12px;
    }
    .mini-input { width: 88px; }

    .table-meta { display: flex; gap: 8px; font-size: 12px; color: #64748b; margin-bottom: 8px; }
    .table-wrap { overflow: auto; border: 1px solid #e2e8f0; border-radius: 8px; }
    .files-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .files-table th, .files-table td {
      padding: 6px 8px; border-bottom: 1px solid #f1f5f9; text-align: left; vertical-align: middle;
    }
    .files-table th { background: #f8fafc; font-weight: 600; color: #475569; }
    .files-table tr.selected { background: #f0f9ff; }
    .files-table tr.active-drill { outline: 1px solid #7dd3fc; }
    .files-table.compact td, .files-table.compact th { padding: 5px 8px; }
    .check-col { width: 36px; }
    .cell-input, .cell-select, .cell-num {
      width: 100%; height: 30px; border: 1px solid #d1d5db; border-radius: 6px; padding: 0 6px;
      font-size: 12px; background: #fff;
    }
    .cell-num { width: 64px; }
    .expand-cell { color: #0369a1; white-space: nowrap; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .empty { padding: 16px; text-align: center; color: #94a3b8; font-size: 13px; }

    .validation-message {
      display: flex; align-items: center; gap: 8px; margin-top: 8px; padding: 12px 14px;
      background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; color: #92400e; font-size: 13px;
    }
    .warning-icon {
      width: 18px; height: 18px; border-radius: 50%; background: #f59e0b; color: #fff;
      display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700;
    }
  `],
})
export class DataFilesComponent implements OnInit {
  @Input() aiEnabled = false;

  readonly wizardState = inject(WizardStateService);
  readonly state = this.wizardState.state;

  readonly pasteText = signal('');
  readonly pxdInput = signal('');
  readonly pxdLoading = signal(false);
  readonly pxdStatus = signal('');
  readonly pxdError = signal(false);
  readonly selectedIndices = signal<Set<number>>(new Set());
  readonly drillIndex = signal<number | null>(null);
  readonly batchFraction = signal<number | null>(null);
  readonly batchTech = signal<number | null>(null);
  readonly batchRunId = signal('');

  readonly files = computed(() => this.state().dataFiles);
  readonly samples = computed(() => this.state().samples);
  readonly msRuns = computed(() => this.state().msRuns || []);

  readonly sdrfRowCount = computed(() => buildWizardExpansionRows(this.state()).length);

  readonly drillFile = computed(() => {
    const i = this.drillIndex();
    if (i == null) return this.files()[0] || null;
    return this.files()[i] || null;
  });

  readonly drillChannels = computed(() => {
    const file = this.drillFile();
    if (!file?.runId) return [];
    const run = this.msRuns().find(r => r.id === file.runId);
    return run?.channels.filter(c => c.role !== 'empty') || [];
  });

  readonly drillKitName = computed(() => {
    const file = this.drillFile();
    if (!file?.runId) return '';
    const run = this.msRuns().find(r => r.id === file.runId);
    if (!run) return '';
    return labelConfigDisplayName(resolveRunLabelConfigId(run, this.state()));
  });

  ngOnInit(): void {
    this.wizardState.ensurePlannerDataFiles();
    if (this.files().length && !this.pasteText().trim()) {
      this.pasteText.set(this.files().map(f => f.fileName).filter(Boolean).join('\n'));
    }
  }

  allSelected(): boolean {
    const n = this.files().length;
    return n > 0 && this.selectedIndices().size === n;
  }

  regenerateFromPlanner(): void {
    this.wizardState.generateFileSlotsFromPlanner();
    const names = this.wizardState.dataFiles().map(f => f.fileName).filter(Boolean);
    this.pasteText.set(names.join('\n'));
    this.selectedIndices.set(new Set());
    this.drillIndex.set(this.files().length ? 0 : null);
    this.pxdStatus.set(`Regenerated ${names.length} planner slot(s).`);
    this.pxdError.set(false);
  }

  async fetchFromPxd(): Promise<void> {
    const accession = normalizePxdAccession(this.pxdInput());
    this.pxdInput.set(accession);
    if (!isValidPxdAccession(accession)) {
      this.pxdError.set(true);
      this.pxdStatus.set('Enter a valid PXD accession (e.g. PXD000001).');
      return;
    }

    this.pxdLoading.set(true);
    this.pxdError.set(false);
    this.pxdStatus.set(`Fetching RAW files for ${accession}…`);
    try {
      const { fileNames } = await fetchPrideRawFileNames(accession);
      const existingCount = this.files().length;
      // Keep planner fraction/tech/run; only swap in crawled names by row index.
      this.applyFileNames(fileNames, false, { preserveSlots: true });
      this.pasteText.set(fileNames.join('\n'));
      const preserved = Math.min(fileNames.length, existingCount);
      this.pxdStatus.set(
        `Imported ${fileNames.length} RAW file(s) from ${accession}` +
          (preserved
            ? ` · kept fraction/tech/run on ${preserved} existing slot(s).`
            : '.')
      );
      this.pxdError.set(false);
    } catch (err) {
      this.pxdError.set(true);
      this.pxdStatus.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.pxdLoading.set(false);
    }
  }

  applyPaste(append: boolean): void {
    const lines = this.pasteText()
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      this.pxdError.set(true);
      this.pxdStatus.set('Paste at least one filename.');
      return;
    }
    this.applyFileNames(lines, append);
    this.pxdError.set(false);
    this.pxdStatus.set(
      append
        ? `Appended ${lines.length} custom filename(s).`
        : `Imported ${lines.length} custom filename(s).`
    );
  }

  private applyFileNames(
    names: string[],
    append: boolean,
    options?: { preserveSlots?: boolean }
  ): void {
    let next: WizardDataFile[];
    if (append) {
      next = [...this.files(), ...this.filesFromNames(names)];
    } else if (options?.preserveSlots && this.files().length > 0) {
      next = this.overlayNamesOntoSlots(names);
    } else {
      next = this.filesFromNames(names);
    }
    this.wizardState.setDataFiles(next);
    this.selectedIndices.set(new Set());
    this.drillIndex.set(next.length ? 0 : null);
  }

  /** Replace filenames by index; keep existing run / fraction / tech. */
  private overlayNamesOntoSlots(names: string[]): WizardDataFile[] {
    const existing = this.files();
    return names.map((fileName, i) => {
      if (i < existing.length) {
        return { ...existing[i], fileName };
      }
      return this.filesFromNames([fileName])[0];
    });
  }

  private filesFromNames(names: string[]): WizardDataFile[] {
    const runs = this.msRuns();
    return names.map((fileName, i) => {
      const parsed = this.parseFractionTech(fileName);
      return {
        fileName,
        runId: runs.length ? runs[i % runs.length].id : undefined,
        fractionId: parsed.fractionId,
        technicalReplicate: parsed.technicalReplicate,
      };
    });
  }

  addEmptyFile(): void {
    const runs = this.msRuns();
    const next: WizardDataFile = {
      fileName: '',
      fractionId: 1,
      technicalReplicate: 1,
      runId: runs[0]?.id,
    };
    this.wizardState.setDataFiles([...this.files(), next]);
  }

  updateFile(index: number, patch: Partial<WizardDataFile>): void {
    this.wizardState.updateDataFile(index, patch);
  }

  toggleSelect(index: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const next = new Set(this.selectedIndices());
    if (checked) next.add(index);
    else next.delete(index);
    this.selectedIndices.set(next);
  }

  toggleSelectAll(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (!checked) {
      this.selectedIndices.set(new Set());
      return;
    }
    this.selectedIndices.set(new Set(this.files().map((_, i) => i)));
  }

  removeSelected(): void {
    const selected = this.selectedIndices();
    const remaining = this.files().filter((_, i) => !selected.has(i));
    this.wizardState.setDataFiles(remaining);
    this.selectedIndices.set(new Set());
    this.drillIndex.set(remaining.length ? 0 : null);
  }

  applyBatch(): void {
    const selected = this.selectedIndices();
    if (selected.size === 0) return;
    const files = this.files().map((f, i) => {
      if (!selected.has(i)) return f;
      const patch: Partial<WizardDataFile> = {};
      if (this.batchFraction() != null) patch.fractionId = Number(this.batchFraction());
      if (this.batchTech() != null) patch.technicalReplicate = Number(this.batchTech());
      if (this.batchRunId()) patch.runId = this.batchRunId();
      return { ...f, ...patch };
    });
    this.wizardState.setDataFiles(files);
  }

  parseFractionTech(fileName: string): { fractionId: number; technicalReplicate: number } {
    const base = fileName.replace(/\.[^.]+$/, '');
    const fractionMatch =
      base.match(/(?:^|[_\-.])(?:f|fraction|slice)(\d+)/i) ||
      base.match(/_F(\d+)(?:_|\.|$)/);
    const techMatch =
      base.match(/(?:^|[_\-.])(?:r|rep|tech|replicate)(\d+)/i) ||
      base.match(/_R(\d+)(?:_|\.|$)/);
    return {
      fractionId: fractionMatch ? parseInt(fractionMatch[1], 10) : 1,
      technicalReplicate: techMatch ? parseInt(techMatch[1], 10) : 1,
    };
  }

  expandLabel(file: WizardDataFile): string {
    const run = this.msRuns().find(r => r.id === file.runId);
    if (!run) return '—';
    const n = countUsedChannels(run);
    return `${n} channel${n === 1 ? '' : 's'} → ${n} SDRF row${n === 1 ? '' : 's'}`;
  }

  runName(runId?: string): string {
    return this.msRuns().find(r => r.id === runId)?.name || 'unassigned run';
  }

  channelDisplay(ch: {
    role: string;
    sampleIndex?: number;
    pooledSampleIndices?: number[];
    sourceNameOverride?: string;
  }): string {
    if (ch.sourceNameOverride?.trim()) return ch.sourceNameOverride;
    if (ch.role === 'pooled' && ch.pooledSampleIndices?.length) {
      const names = ch.pooledSampleIndices.map(
        i => this.samples().find(s => s.index === i)?.sourceName || `sample_${i}`
      );
      return `pool(${names.join(', ')})`;
    }
    if (ch.sampleIndex != null) {
      return (
        this.samples().find(s => s.index === ch.sampleIndex)?.sourceName ||
        `sample_${ch.sampleIndex}`
      );
    }
    return ch.role;
  }
}
