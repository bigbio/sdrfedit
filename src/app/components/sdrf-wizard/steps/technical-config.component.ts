/**
 * Technical Configuration Component (Step 4)
 *
 * Quantification design, MS run × channel packing, and planner defaults
 * for fraction / tech file slots.
 */

import {
  Component,
  Input,
  inject,
  computed,
  signal,
  HostListener,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { WizardStateService } from '../../../core/services/wizard-state.service';
import {
  LABEL_CONFIGS,
  LabelPlexConfig,
  ChannelRole,
  WizardMsRun,
  WizardChannelAssignment,
  countUsedChannels,
  estimatePlannerSdrfRows,
  estimatePlannerFileSlots,
  plannedFractionCount,
  plannedTechRepCount,
  resolveRunLabelConfigId,
  isRunLabelFree,
  labelConfigDisplayName,
} from '../../../core/models/wizard';

type AcquisitionMethod = 'dda' | 'dia' | 'prm' | 'srm';

const CHANNEL_ROLES: { id: ChannelRole; label: string }[] = [
  { id: 'sample', label: 'sample' },
  { id: 'empty', label: 'empty' },
  { id: 'bridge', label: 'bridge' },
  { id: 'carrier', label: 'carrier' },
  { id: 'pooled', label: 'pooled' },
];

const ACQUISITION_OPTIONS: {
  id: AcquisitionMethod;
  short: string;
  sdrf: string;
}[] = [
  { id: 'dda', short: 'DDA', sdrf: 'data-dependent acquisition' },
  { id: 'dia', short: 'DIA', sdrf: 'data-independent acquisition' },
  { id: 'prm', short: 'PRM', sdrf: 'parallel reaction monitoring' },
  { id: 'srm', short: 'SRM', sdrf: 'selected reaction monitoring' },
];

@Component({
  selector: 'wizard-technical-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="step-container">
      <div class="step-header">
        <h3>Runs &amp; Channels</h3>
        <p class="step-description">
          Pack samples into MS runs (channel map). Fraction and technical replicate
          here are only <strong>planner defaults</strong> for empty file slots —
          real values are set per raw file in Step 6.
        </p>
      </div>

      <!-- 1. Default kit (new runs / Auto-pack) -->
      <section class="form-section">
        <h4 class="section-title">1. Default label / plex kit</h4>
        <p class="section-help">
          Default for <strong>Add run</strong> and <strong>Auto-pack</strong>.
          Each run can use a different kit in the packing matrix below
          (e.g. one TMT10 run and one label-free run).
        </p>
        <div class="plex-groups">
          @for (group of labelGroups(); track group.name) {
            <div class="plex-group">
              <div class="plex-group-title">{{ group.name }}</div>
              <div class="plex-chips">
                @for (config of group.configs; track config.id) {
                  <button
                    type="button"
                    class="plex-chip"
                    [class.selected]="state().labelConfigId === config.id"
                    (click)="selectDefaultKit(config.id)"
                  >
                    {{ config.name }}
                    <span class="plex-n">{{ config.labels.length }}ch</span>
                  </button>
                }
              </div>
            </div>
          }
        </div>
        <div class="toolbar-row kit-actions">
          <button type="button" class="btn-secondary" (click)="wizardState.applyDefaultKitToAllRuns()">
            Apply default kit to all runs
          </button>
          @if (mixedKits()) {
            <span class="soft-status warn">Mixed kits across runs</span>
          }
        </div>
      </section>

      <!-- 2. Channel packing (all label modes, including LF) -->
      <section class="form-section accent">
          <div class="section-head-row">
            <h4 class="section-title">2. Channel packing matrix</h4>
            <div class="head-actions">
              <button type="button" class="btn-secondary" (click)="wizardState.autoPackSamplesIntoRuns()">
                Auto-pack samples
              </button>
              <button type="button" class="btn-secondary" (click)="wizardState.addMsRun()">
                Add run
              </button>
            </div>
          </div>
          <p class="section-help">
            @if (selectedRunIsLabelFree()) {
              This run is label-free: one channel (<strong>label free sample</strong>).
              Use role <strong>pooled</strong> to mix samples.
            } @else {
              Each run is one multiplex injection set. Use role <strong>pooled</strong> for mixed channels.
              Empty channels are skipped when expanding SDRF rows.
            }
          </p>

          @if (msRuns().length === 0) {
            <div class="empty-runs">
              No runs yet.
              <button type="button" class="btn-primary" (click)="wizardState.autoPackSamplesIntoRuns()">
                Pack samples into runs
              </button>
            </div>
          } @else {
            <div class="run-tabs">
              @for (run of msRuns(); track run.id) {
                <button
                  type="button"
                  class="run-tab"
                  [class.active]="selectedRunId() === run.id"
                  (click)="selectedRunId.set(run.id)"
                >
                  {{ run.name }}
                  <span class="run-meta">{{ kitShortName(run) }} · {{ usedChannelCount(run) }} used</span>
                </button>
              }
            </div>

            @if (selectedRun(); as run) {
              <div class="run-toolbar">
                <input
                  class="run-name-input"
                  [ngModel]="run.name"
                  (ngModelChange)="wizardState.renameMsRun(run.id, $event)"
                />
                <label class="run-kit-label">
                  <span>Kit</span>
                  <select
                    class="run-kit-select"
                    [ngModel]="runKitId(run)"
                    (ngModelChange)="onRunKitChange(run.id, $event)"
                  >
                    @for (group of labelGroups(); track group.name) {
                      @for (config of group.configs; track config.id) {
                        <option [value]="config.id">
                          {{ config.name }} ({{ config.labels.length }}ch)
                        </option>
                      }
                    }
                  </select>
                </label>
                <button
                  type="button"
                  class="btn-danger-ghost"
                  [disabled]="msRuns().length <= 1"
                  (click)="removeRun(run.id)"
                >
                  Remove run
                </button>
              </div>

              @if (selectedRunIsLabelFree()) {
                <div class="lf-banner compact">
                  Label-free run · single channel · files in Step 6 hang on this run.
                </div>
              }

              <div class="matrix-wrap">
                <table class="matrix-table">
                  <thead>
                    <tr>
                      <th>Channel</th>
                      <th>Role</th>
                      <th>Bound sample / name</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (ch of run.channels; track ch.label; let ci = $index) {
                      <tr [class.row-empty]="ch.role === 'empty'">
                        <td class="mono">{{ ch.label }}</td>
                        <td>
                          <select
                            class="cell-select"
                            [ngModel]="ch.role"
                            (ngModelChange)="onRoleChange(run.id, ci, $event)"
                          >
                            @for (role of channelRoles; track role.id) {
                              <option [value]="role.id">{{ role.label }}</option>
                            }
                          </select>
                        </td>
                        <td>
                          @if (ch.role === 'sample') {
                            <select
                              class="cell-select"
                              [ngModel]="ch.sampleIndex ?? ''"
                              (ngModelChange)="onSampleBind(run.id, ci, $event)"
                            >
                              <option value="">— select —</option>
                              @for (s of state().samples; track s.index) {
                                <option [ngValue]="s.index">{{ s.sourceName }}</option>
                              }
                            </select>
                          } @else if (ch.role === 'empty') {
                            <span class="muted">—</span>
                          } @else if (ch.role === 'pooled') {
                            <div class="pooled-cell" (click)="$event.stopPropagation()">
                              <button
                                type="button"
                                class="pooled-select-btn"
                                [class.open]="isPooledPickerOpen(run.id, ci)"
                                (click)="togglePooledPicker(run.id, ci, $event)"
                              >
                                <span class="pooled-select-label">
                                  @if ((ch.pooledSampleIndices || []).length === 0) {
                                    Select samples…
                                  } @else {
                                    {{ pooledSummary(ch) }}
                                  }
                                </span>
                                <span class="pooled-select-count">
                                  {{ (ch.pooledSampleIndices || []).length }}
                                </span>
                              </button>
                              @if (isPooledPickerOpen(run.id, ci)) {
                                <div class="pooled-popover" (mousedown)="$event.stopPropagation()">
                                  <div class="pooled-pop-head">
                                    <span>Pool members (click or drag)</span>
                                    <div class="pooled-pop-actions">
                                      <button type="button" class="link-btn" (click)="pooledSelectAll()">Select all</button>
                                      <button type="button" class="link-btn" (click)="pooledClearDraft()">Clear</button>
                                    </div>
                                  </div>
                                  <ul
                                    class="pooled-pick-list"
                                    [class.dragging]="pooledDragActive()"
                                  >
                                    @for (s of state().samples; track s.index; let i = $index) {
                                      <li>
                                        <div
                                          class="pooled-pick"
                                          [class.checked]="pooledDraft().has(s.index)"
                                          (mousedown)="onPooledDragStart(i, $event)"
                                          (mouseenter)="onPooledDragEnter(i)"
                                        >
                                          <input
                                            type="checkbox"
                                            tabindex="-1"
                                            [checked]="pooledDraft().has(s.index)"
                                            (click)="$event.preventDefault()"
                                          />
                                          <span>{{ s.sourceName }}</span>
                                        </div>
                                      </li>
                                    }
                                  </ul>
                                  <div class="pooled-pop-foot">
                                    <input
                                      class="cell-input"
                                      placeholder="Optional pool name override"
                                      [ngModel]="ch.sourceNameOverride || ''"
                                      (ngModelChange)="wizardState.setChannelAssignment(run.id, ci, { sourceNameOverride: $event })"
                                    />
                                    <button type="button" class="btn-primary pooled-done" (click)="applyPooledPicker()">
                                      Done ({{ pooledDraft().size }})
                                    </button>
                                  </div>
                                </div>
                              }
                            </div>
                          } @else {
                            <input
                              class="cell-input"
                              placeholder="source name override"
                              [ngModel]="ch.sourceNameOverride || ''"
                              (ngModelChange)="wizardState.setChannelAssignment(run.id, ci, { sourceNameOverride: $event })"
                            />
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          }
        </section>

      <!-- 3. Slot planner -->
      <section class="form-section">
        <h4 class="section-title">3. Slot planner (optional)</h4>
        <p class="section-help">
          Expected fractions / tech reps for generating empty file slots in Step 6.
          Uneven layouts are edited per file later — these are not SDRF truth.
        </p>
        <div class="planner-grid">
          <div class="planner-card">
            <div class="counter-label">Expected fractions</div>
            <div class="toggle-group">
              <button
                type="button"
                class="toggle-btn"
                [class.active]="!state().hasFractions"
                (click)="wizardState.setHasFractions(false)"
              >
                Off (= 1)
              </button>
              <button
                type="button"
                class="toggle-btn"
                [class.active]="state().hasFractions"
                (click)="wizardState.setHasFractions(true)"
              >
                On
              </button>
            </div>
            @if (state().hasFractions) {
              <div class="counter-row">
                <div class="number-input-group">
                  <button type="button" class="number-btn" (click)="decrementFractions()" [disabled]="state().fractionCount <= 1">−</button>
                  <input
                    type="number"
                    class="number-input"
                    [ngModel]="state().fractionCount"
                    (ngModelChange)="wizardState.setFractionCount($event)"
                    min="1"
                    max="100"
                  />
                  <button type="button" class="number-btn" (click)="incrementFractions()">+</button>
                </div>
                <div class="quick-presets">
                  @for (n of [8, 12, 24]; track n) {
                    <button type="button" class="preset-btn" (click)="wizardState.setFractionCount(n)">{{ n }}</button>
                  }
                </div>
              </div>
            }
          </div>
          <div class="planner-card">
            <div class="counter-label">Expected tech replicates</div>
            <div class="counter-row">
              <div class="number-input-group">
                <button type="button" class="number-btn" (click)="decrementReplicates()" [disabled]="state().technicalReplicates <= 1">−</button>
                <input
                  type="number"
                  class="number-input"
                  [ngModel]="state().technicalReplicates"
                  (ngModelChange)="wizardState.setTechnicalReplicates($event)"
                  min="1"
                  max="10"
                />
                <button type="button" class="number-btn" (click)="incrementReplicates()">+</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 4. Acquisition -->
      <section class="form-section">
        <h4 class="section-title">4. Acquisition method</h4>
        <div class="acq-grid">
          @for (opt of acquisitionOptions; track opt.id) {
            <button
              type="button"
              class="acq-card"
              [class.active]="state().acquisitionMethod === opt.id"
              (click)="wizardState.setAcquisitionMethod(opt.id)"
            >
              <span class="acq-short">{{ opt.short }}</span>
              <span class="acq-sdrf">{{ opt.sdrf }}</span>
            </button>
          }
        </div>
      </section>

      <!-- Soft preview -->
      <section class="preview-section">
        <h4>Soft estimate (if all planner slots filled)</h4>
        <div class="stat-row">
          <div class="stat">
            <span class="stat-label">Est. SDRF rows</span>
            <span class="stat-value">~{{ estimatedRows() }}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Est. raw slots</span>
            <span class="stat-value">~{{ estimatedFiles() }}</span>
          </div>
        </div>
        <p class="preview-note">
          Final counts come from Step 6 files. Formula:
          Σ over runs (used channels × planned F × planned T).
          Planned F={{ plannedF() }}, T={{ plannedT() }}.
        </p>
      </section>

      @if (!wizardState.isStep4Valid()) {
        <div class="validation-message">
          <span class="warning-icon">!</span>
          Pack at least one run with a non-empty channel binding to continue.
        </div>
      }
    </div>
  `,
  styles: [`
    .step-container { max-width: 820px; }
    .step-header { margin-bottom: 18px; }
    .step-header h3 { margin: 0 0 6px; font-size: 18px; font-weight: 600; color: #111827; }
    .step-description { margin: 0; font-size: 13px; color: #6b7280; line-height: 1.45; }

    .form-section {
      margin-bottom: 18px;
      padding: 14px;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      background: #fff;
    }
    .form-section.accent { border-color: #bae6fd; background: #f8fbff; }
    .section-title { margin: 0 0 4px; font-size: 14px; font-weight: 650; color: #0f172a; }
    .section-help { margin: 0 0 12px; font-size: 12px; color: #64748b; line-height: 1.4; }
    .section-help code {
      font-size: 11px; background: #e2e8f0; padding: 1px 5px; border-radius: 4px;
    }
    .section-head-row { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 4px; }
    .head-actions { display: flex; gap: 6px; flex-wrap: wrap; }

    .lf-banner {
      margin-top: 12px;
      padding: 10px 12px; border-radius: 8px; background: #f0fdf4; border: 1px solid #bbf7d0;
      font-size: 13px; color: #166534; line-height: 1.45;
    }
    .lf-banner.compact { margin-top: 0; margin-bottom: 10px; font-size: 12px; }
    .kit-actions { margin-top: 10px; }
    .soft-status { font-size: 12px; color: #64748b; }
    .soft-status.warn { color: #b45309; font-weight: 500; }
    .toolbar-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }

    .plex-group { margin-bottom: 10px; }
    .plex-group-title {
      font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
      color: #94a3b8; margin-bottom: 6px;
    }
    .plex-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .plex-chip {
      border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 999px; padding: 6px 10px;
      font-size: 12px; cursor: pointer; color: #334155;
    }
    .plex-chip.selected { background: #e0f2fe; border-color: #7dd3fc; color: #0369a1; font-weight: 600; }
    .plex-n { margin-left: 4px; font-size: 10px; opacity: 0.75; }

    .btn-secondary, .btn-primary, .btn-danger-ghost {
      border-radius: 8px; padding: 6px 10px; font-size: 12px; cursor: pointer;
    }
    .btn-secondary { border: 1px solid #e2e8f0; background: #fff; color: #334155; }
    .btn-primary { border: 1px solid #0284c7; background: #0ea5e9; color: #fff; font-weight: 600; }
    .btn-danger-ghost { border: 1px solid #fecaca; background: #fff; color: #b91c1c; }
    .btn-danger-ghost:disabled { opacity: 0.4; cursor: not-allowed; }

    .empty-runs {
      display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
      padding: 12px; border-radius: 8px; background: #fff; border: 1px dashed #cbd5e1;
      font-size: 13px; color: #64748b;
    }

    .run-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .run-tab {
      border: 1px solid #e2e8f0; background: #fff; border-radius: 8px; padding: 6px 10px;
      font-size: 12px; cursor: pointer; color: #334155;
    }
    .run-tab.active { background: #0ea5e9; border-color: #0284c7; color: #fff; font-weight: 600; }
    .run-meta { margin-left: 6px; font-size: 10px; opacity: 0.8; }

    .run-toolbar { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; flex-wrap: wrap; }
    .run-kit-label {
      display: flex; align-items: center; gap: 6px; font-size: 12px; color: #64748b; font-weight: 500;
    }
    .run-kit-select {
      height: 32px; border: 1px solid #d1d5db; border-radius: 6px; padding: 0 8px;
      font-size: 12px; background: #fff; min-width: 160px;
    }
    .run-name-input {
      flex: 1; height: 34px; border: 1px solid #d1d5db; border-radius: 6px; padding: 0 10px; font-size: 13px;
    }

    .matrix-wrap { overflow: visible; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; }
    .matrix-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .matrix-table th, .matrix-table td {
      padding: 6px 8px; text-align: left; border-bottom: 1px solid #f1f5f9; vertical-align: middle;
    }
    .matrix-table th { background: #f8fafc; font-weight: 600; color: #475569; }
    .row-empty { opacity: 0.65; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .muted { color: #94a3b8; }
    .cell-select, .cell-input {
      width: 100%; height: 32px; border: 1px solid #d1d5db; border-radius: 6px; padding: 0 8px; font-size: 12px;
      background: #fff;
    }

    .pooled-cell {
      position: relative;
      min-width: 200px;
    }
    .pooled-select-btn {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      width: 100%;
      min-height: 32px;
      padding: 4px 10px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: #fff;
      cursor: pointer;
      text-align: left;
      font-size: 12px;
      color: #334155;
    }
    .pooled-select-btn:hover { border-color: #94a3b8; background: #f8fafc; }
    .pooled-select-btn.open {
      border-color: #7dd3fc;
      box-shadow: 0 0 0 2px #e0f2fe;
    }
    .pooled-select-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }
    .pooled-select-count {
      flex-shrink: 0;
      min-width: 20px;
      height: 20px;
      padding: 0 6px;
      border-radius: 999px;
      background: #e0f2fe;
      color: #0369a1;
      font-size: 11px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .pooled-popover {
      position: absolute;
      z-index: 40;
      top: calc(100% + 4px);
      left: 0;
      width: min(320px, 70vw);
      padding: 10px;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      background: #fff;
      box-shadow: 0 10px 28px rgba(15, 23, 42, 0.12);
    }
    .pooled-pop-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
    }
    .pooled-pop-actions { display: flex; gap: 8px; }
    .link-btn {
      border: none; background: transparent; color: #0284c7; font-size: 11px;
      font-weight: 600; cursor: pointer; padding: 0;
    }
    .link-btn:hover { text-decoration: underline; }
    .pooled-pick-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
      max-height: 200px;
      overflow: auto;
      user-select: none;
    }
    .pooled-pick-list.dragging { cursor: grabbing; }
    .pooled-pick {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 8px;
      border: 1px solid transparent;
      background: #f8fafc;
      cursor: pointer;
      font-size: 12px;
      color: #0f172a;
    }
    .pooled-pick input { pointer-events: none; margin: 0; }
    .pooled-pick:hover { background: #f1f5f9; }
    .pooled-pick.checked {
      background: #f0f9ff;
      border-color: #bae6fd;
      font-weight: 500;
    }
    .pooled-pop-foot {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 10px;
      padding-top: 8px;
      border-top: 1px solid #f1f5f9;
    }
    .pooled-done { width: 100%; }

    .planner-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    @media (max-width: 640px) { .planner-grid { grid-template-columns: 1fr; } }
    .planner-card {
      padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; background: #f8fafc;
    }
    .toggle-group { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .toggle-btn {
      border: 1px solid #d1d5db; background: #fff; border-radius: 8px; padding: 8px 12px;
      font-size: 13px; cursor: pointer;
    }
    .toggle-btn.active { background: #0ea5e9; border-color: #0284c7; color: #fff; font-weight: 600; }
    .counter-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 10px; }
    .counter-label { font-size: 13px; color: #374151; font-weight: 500; }
    .number-input-group { display: flex; align-items: center; }
    .number-btn {
      width: 34px; height: 34px; border: 1px solid #d1d5db; background: #fff; font-size: 16px; cursor: pointer;
    }
    .number-btn:first-child { border-radius: 6px 0 0 6px; }
    .number-btn:last-child { border-radius: 0 6px 6px 0; }
    .number-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .number-input {
      width: 56px; height: 34px; border: 1px solid #d1d5db; border-left: none; border-right: none;
      text-align: center; font-size: 14px; font-weight: 600;
    }
    .quick-presets { display: flex; gap: 6px; }
    .preset-btn {
      border: 1px solid #e2e8f0; background: #fff; border-radius: 6px; padding: 4px 8px; font-size: 12px; cursor: pointer;
    }

    .acq-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .acq-card {
      display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left;
      padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; cursor: pointer;
    }
    .acq-card.active { border-color: #7dd3fc; background: #f0f9ff; }
    .acq-short { font-size: 13px; font-weight: 700; color: #0f172a; }
    .acq-sdrf { font-size: 11px; color: #64748b; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

    .preview-section {
      margin-top: 8px; padding: 14px; border-radius: 12px; border: 1px solid #bbf7d0; background: #f0fdf4;
    }
    .preview-section h4 { margin: 0 0 10px; font-size: 14px; font-weight: 650; color: #166534; }
    .stat-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px; }
    .stat { background: #fff; border-radius: 8px; padding: 10px 12px; border: 1px solid #dcfce7; }
    .stat-label { display: block; font-size: 11px; color: #6b7280; }
    .stat-value { display: block; font-size: 20px; font-weight: 700; color: #166534; }
    .preview-note { margin: 0; font-size: 12px; color: #3f6212; line-height: 1.4; }

    .validation-message {
      display: flex; align-items: center; gap: 8px; margin-top: 14px; padding: 12px 14px;
      background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; color: #92400e; font-size: 13px;
    }
    .warning-icon {
      width: 18px; height: 18px; border-radius: 50%; background: #f59e0b; color: #fff;
      display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700;
    }
  `],
})
export class TechnicalConfigComponent {
  @Input() aiEnabled = false;

  readonly wizardState = inject(WizardStateService);
  readonly state = this.wizardState.state;
  readonly acquisitionOptions = ACQUISITION_OPTIONS;
  readonly channelRoles = CHANNEL_ROLES;

  readonly selectedRunId = signal<string | null>(null);

  /** Open pooled sample picker target */
  readonly pooledPicker = signal<{ runId: string; channelIndex: number } | null>(null);
  /** Draft selection uses 1-based sample.index */
  readonly pooledDraft = signal<Set<number>>(new Set());
  readonly pooledDragActive = signal(false);
  private pooledDragAnchor = 0;
  private pooledDragMode: 'add' | 'remove' = 'add';
  private pooledDragBase = new Set<number>();

  readonly msRuns = computed(() => this.state().msRuns || []);

  readonly isLabelFree = computed(() => {
    const s = this.state();
    const runs = s.msRuns || [];
    if (runs.length === 0) return s.labelConfigId === 'lf';
    return runs.every(r => isRunLabelFree(r, s));
  });

  readonly selectedRunIsLabelFree = computed(() => {
    const run = this.selectedRun();
    if (!run) return this.state().labelConfigId === 'lf';
    return isRunLabelFree(run, this.state());
  });

  readonly mixedKits = computed(() => {
    const s = this.state();
    const ids = new Set(
      (s.msRuns || []).map(r => resolveRunLabelConfigId(r, s))
    );
    return ids.size > 1;
  });

  readonly selectedRun = computed(() => {
    const runs = this.msRuns();
    if (runs.length === 0) return null;
    const id = this.selectedRunId();
    return runs.find(r => r.id === id) || runs[0];
  });

  readonly labelGroups = computed(() => {
    const groups: { name: string; configs: LabelPlexConfig[] }[] = [
      { name: 'Label-free', configs: LABEL_CONFIGS.filter(c => c.id === 'lf') },
      { name: 'TMT', configs: LABEL_CONFIGS.filter(c => c.id.startsWith('tmt')) },
      { name: 'iTRAQ', configs: LABEL_CONFIGS.filter(c => c.id.startsWith('itraq')) },
      { name: 'SILAC', configs: LABEL_CONFIGS.filter(c => c.id === 'silac') },
    ];
    return groups.filter(g => g.configs.length > 0);
  });

  /** Set default kit; also apply to the currently selected run. */
  selectDefaultKit(configId: string): void {
    this.wizardState.setLabelConfig(configId);
    this.closePooledPicker();
    const runs = this.wizardState.msRuns() || [];
    if (runs.length === 0) {
      this.wizardState.autoPackSamplesIntoRuns();
    } else {
      const selected = this.selectedRun();
      const targetId = selected?.id || runs[0].id;
      this.wizardState.setRunLabelConfig(targetId, configId);
    }
    const next = this.wizardState.msRuns();
    if (next[0]) this.selectedRunId.set(this.selectedRunId() || next[0].id);
  }

  onRunKitChange(runId: string, configId: string): void {
    this.closePooledPicker();
    this.wizardState.setRunLabelConfig(runId, configId);
  }

  runKitId(run: WizardMsRun): string {
    return resolveRunLabelConfigId(run, this.state());
  }

  kitShortName(run: WizardMsRun): string {
    const id = this.runKitId(run);
    if (id === 'lf') return 'LF';
    const name = labelConfigDisplayName(id);
    return name.replace(/\s*\(.*\)\s*$/, '').replace(/^TMT\s*/, 'TMT').slice(0, 14);
  }

  usedChannelCount(run: WizardMsRun): number {
    return countUsedChannels(run);
  }

  onRoleChange(runId: string, channelIndex: number, role: ChannelRole): void {
    if (role === 'pooled') {
      this.wizardState.setChannelAssignment(runId, channelIndex, {
        role,
        sampleIndex: undefined,
        pooledSampleIndices: [],
      });
      this.openPooledPicker(runId, channelIndex);
      return;
    }
    this.closePooledPicker();
    this.wizardState.setChannelAssignment(runId, channelIndex, { role });
  }

  onSampleBind(runId: string, channelIndex: number, sampleIndex: number | ''): void {
    const idx = sampleIndex === '' ? undefined : Number(sampleIndex);
    this.wizardState.setChannelAssignment(runId, channelIndex, {
      role: 'sample',
      sampleIndex: idx,
    });
  }

  isPooledPickerOpen(runId: string, channelIndex: number): boolean {
    const open = this.pooledPicker();
    return !!open && open.runId === runId && open.channelIndex === channelIndex;
  }

  pooledSummary(ch: WizardChannelAssignment): string {
    const indices = ch.pooledSampleIndices || [];
    if (indices.length === 0) return 'Select samples…';
    const names = indices.map(
      i => this.state().samples.find(s => s.index === i)?.sourceName || `sample_${i}`
    );
    if (names.length <= 2) return names.join(', ');
    return `${names[0]}, ${names[1]} +${names.length - 2}`;
  }

  togglePooledPicker(runId: string, channelIndex: number, event: MouseEvent): void {
    event.stopPropagation();
    if (this.isPooledPickerOpen(runId, channelIndex)) {
      this.closePooledPicker();
      return;
    }
    this.openPooledPicker(runId, channelIndex);
  }

  openPooledPicker(runId: string, channelIndex: number): void {
    const run = this.msRuns().find(r => r.id === runId);
    const current = run?.channels[channelIndex]?.pooledSampleIndices || [];
    this.pooledDraft.set(new Set(current));
    this.pooledPicker.set({ runId, channelIndex });
  }

  closePooledPicker(): void {
    this.pooledPicker.set(null);
    this.pooledDragActive.set(false);
  }

  pooledSelectAll(): void {
    this.pooledDraft.set(new Set(this.state().samples.map(s => s.index)));
  }

  pooledClearDraft(): void {
    this.pooledDraft.set(new Set());
  }

  applyPooledPicker(): void {
    const open = this.pooledPicker();
    if (!open) return;
    const indices = [...this.pooledDraft()].sort((a, b) => a - b);
    this.wizardState.setChannelAssignment(open.runId, open.channelIndex, {
      role: 'pooled',
      pooledSampleIndices: indices,
    });
    this.closePooledPicker();
  }

  onPooledDragStart(listIndex: number, event: MouseEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    const sampleIndex = this.state().samples[listIndex]?.index;
    if (sampleIndex == null) return;
    this.pooledDragActive.set(true);
    this.pooledDragAnchor = listIndex;
    this.pooledDragBase = new Set(this.pooledDraft());
    this.pooledDragMode = this.pooledDraft().has(sampleIndex) ? 'remove' : 'add';
    this.applyPooledDragRange(listIndex);
  }

  onPooledDragEnter(listIndex: number): void {
    if (!this.pooledDragActive()) return;
    this.applyPooledDragRange(listIndex);
  }

  private applyPooledDragRange(toIndex: number): void {
    const samples = this.state().samples;
    const lo = Math.min(this.pooledDragAnchor, toIndex);
    const hi = Math.max(this.pooledDragAnchor, toIndex);
    const next = new Set(this.pooledDragBase);
    for (let i = lo; i <= hi; i++) {
      const sampleIndex = samples[i]?.index;
      if (sampleIndex == null) continue;
      if (this.pooledDragMode === 'add') next.add(sampleIndex);
      else next.delete(sampleIndex);
    }
    this.pooledDraft.set(next);
  }

  private endPooledDrag(): void {
    if (!this.pooledDragActive()) return;
    this.pooledDragActive.set(false);
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp(): void {
    this.endPooledDrag();
  }

  @HostListener('document:mouseleave')
  onDocumentMouseLeave(): void {
    this.endPooledDrag();
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent): void {
    if (!this.pooledPicker()) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('.pooled-cell')) return;
    // Click outside: apply current draft then close
    this.applyPooledPicker();
  }

  removeRun(runId: string): void {
    this.wizardState.removeMsRun(runId);
    const runs = this.wizardState.msRuns();
    this.selectedRunId.set(runs[0]?.id ?? null);
  }

  plannedF(): number {
    return plannedFractionCount(this.state());
  }

  plannedT(): number {
    return plannedTechRepCount(this.state());
  }

  estimatedRows(): number {
    return estimatePlannerSdrfRows(this.state());
  }

  estimatedFiles(): number {
    return estimatePlannerFileSlots(this.state());
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
