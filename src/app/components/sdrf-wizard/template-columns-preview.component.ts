/**
 * Template Columns Preview
 *
 * Side drawer with tabbed required / recommended / optional columns.
 */

import {
  Component,
  Output,
  EventEmitter,
  inject,
  signal,
  computed,
  effect,
  input,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { TemplateService } from '../../core/services/template.service';
import {
  ResolvedTemplate,
  TemplateColumn,
  RequirementLevel,
  getTemplateDisplayName,
} from '../../core/models/template';

@Component({
  selector: 'wizard-template-columns-preview',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (templateId()) {
      <div class="overlay" (click)="close.emit()" role="presentation">
        <aside
          class="drawer"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="'Columns for ' + displayName()"
          (click)="$event.stopPropagation()"
        >
          <header class="drawer-header">
            <div class="header-text">
              <div class="title-row">
                <h3>{{ displayName() }}</h3>
                @if (resolved()?.layer) {
                  <span class="layer-tag" [attr.data-layer]="resolved()!.layer">{{ resolved()!.layer }}</span>
                }
              </div>
              <p class="subtitle">
                Columns after inheritance
                @if (resolved()?.version) {
                  <span>· v{{ resolved()!.version }}</span>
                }
              </p>
            </div>
            <button type="button" class="close-btn" (click)="close.emit()" aria-label="Close">×</button>
          </header>

          @if (loading()) {
            <div class="status">Loading columns…</div>
          } @else if (error()) {
            <div class="status error">{{ error() }}</div>
          } @else if (resolved()) {
            @if (parentChainLabel()) {
              <div class="inheritance">
                <span class="inh-label">Inheritance</span>
                <code>{{ parentChainLabel() }}</code>
              </div>
            }

            @if (isLimitedData()) {
              <div class="notice">Column list may be incomplete (offline / fallback data).</div>
            }

            <nav class="tabs" aria-label="Column requirement">
              @for (tab of tabs(); track tab.level) {
                <button
                  type="button"
                  class="tab"
                  [class.active]="activeTab() === tab.level"
                  [attr.data-level]="tab.level"
                  [disabled]="tab.count === 0"
                  (click)="activeTab.set(tab.level)"
                >
                  <span class="tab-label">{{ tab.label }}</span>
                  <span class="tab-count">{{ tab.count }}</span>
                </button>
              }
            </nav>

            <div class="columns-scroll">
              @if (activeColumns().length === 0) {
                <div class="empty">No {{ activeTab() }} columns in this template.</div>
              } @else {
                <ul>
                  @for (col of activeColumns(); track col.name; let i = $index) {
                    <li>
                      <div class="col-index">{{ i + 1 }}</div>
                      <div class="col-body">
                        <div class="col-name">{{ col.name }}</div>
                        @if (col.description) {
                          <div class="col-desc">{{ col.description }}</div>
                        }
                        @if (hasExtras(col)) {
                          <div class="col-extras">
                            @if (ontologyHint(col); as onto) {
                              <span class="chip">{{ onto }}</span>
                            }
                            @if (col.allowNotAvailable) {
                              <span class="chip muted">not available</span>
                            }
                            @if (col.allowNotApplicable) {
                              <span class="chip muted">not applicable</span>
                            }
                          </div>
                        }
                      </div>
                    </li>
                  }
                </ul>
              }
            </div>
          }
        </aside>
      </div>
    }
  `,
  styles: [`
    .overlay {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgba(15, 23, 42, 0.4);
      display: flex;
      justify-content: flex-end;
      animation: fade-in 0.15s ease-out;
    }
    @keyframes fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes slide-in {
      from { transform: translateX(24px); opacity: 0.6; }
      to { transform: translateX(0); opacity: 1; }
    }
    .drawer {
      width: min(440px, 100%);
      height: 100%;
      background: #fff;
      border-left: 1px solid #e5e7eb;
      display: flex;
      flex-direction: column;
      animation: slide-in 0.2s ease-out;
      box-shadow: -8px 0 24px rgba(15, 23, 42, 0.08);
    }
    .drawer-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 20px 20px 14px;
      border-bottom: 1px solid #f3f4f6;
    }
    .title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .drawer-header h3 {
      margin: 0;
      font-size: 17px;
      font-weight: 650;
      color: #111827;
      letter-spacing: -0.01em;
    }
    .subtitle {
      margin: 6px 0 0;
      font-size: 12px;
      color: #6b7280;
    }
    .layer-tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .layer-tag[data-layer='technology'] { background: #dcfce7; color: #166534; }
    .layer-tag[data-layer='sample'] { background: #dbeafe; color: #1e40af; }
    .layer-tag[data-layer='experiment'] { background: #fef3c7; color: #92400e; }
    .close-btn {
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 8px;
      background: #f3f4f6;
      font-size: 20px;
      line-height: 1;
      color: #6b7280;
      cursor: pointer;
      flex-shrink: 0;
    }
    .close-btn:hover { background: #e5e7eb; color: #111827; }
    .inheritance {
      padding: 10px 20px;
      background: #f8fafc;
      border-bottom: 1px solid #f1f5f9;
      font-size: 12px;
      color: #475569;
    }
    .inh-label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .inheritance code {
      font-size: 12px;
      word-break: break-all;
      color: #334155;
    }
    .notice {
      padding: 8px 20px;
      font-size: 12px;
      background: #fffbeb;
      color: #92400e;
      border-bottom: 1px solid #fde68a;
    }
    .tabs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      padding: 12px 16px;
      border-bottom: 1px solid #f3f4f6;
      background: #fff;
    }
    .tab {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 10px 6px;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      background: #fafafa;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
    }
    .tab:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .tab:not(:disabled):hover {
      border-color: #cbd5e1;
      background: #fff;
    }
    .tab.active {
      background: #fff;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
    }
    .tab.active[data-level='required'] { border-color: #fca5a5; background: #fef2f2; }
    .tab.active[data-level='recommended'] { border-color: #fdba74; background: #fff7ed; }
    .tab.active[data-level='optional'] { border-color: #cbd5e1; background: #f8fafc; }
    .tab-label {
      font-size: 11px;
      font-weight: 650;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: #64748b;
    }
    .tab.active .tab-label { color: #0f172a; }
    .tab-count {
      font-size: 16px;
      font-weight: 700;
      color: #334155;
      font-variant-numeric: tabular-nums;
    }
    .tab.active[data-level='required'] .tab-count { color: #b91c1c; }
    .tab.active[data-level='recommended'] .tab-count { color: #c2410c; }
    .tab.active[data-level='optional'] .tab-count { color: #475569; }
    .columns-scroll {
      overflow: auto;
      flex: 1;
      padding: 8px 12px 20px;
    }
    .empty {
      padding: 32px 12px;
      text-align: center;
      font-size: 13px;
      color: #94a3b8;
    }
    .status {
      padding: 24px 20px;
      font-size: 13px;
      color: #64748b;
    }
    .status.error { color: #b91c1c; }
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    li {
      display: flex;
      gap: 10px;
      padding: 12px;
      border: 1px solid #f1f5f9;
      border-radius: 10px;
      background: #fff;
    }
    li:hover {
      border-color: #e2e8f0;
      background: #f8fafc;
    }
    .col-index {
      width: 22px;
      height: 22px;
      border-radius: 6px;
      background: #f1f5f9;
      color: #64748b;
      font-size: 11px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .col-body { flex: 1; min-width: 0; }
    .col-name {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      font-weight: 600;
      color: #0f172a;
      word-break: break-all;
      line-height: 1.35;
    }
    .col-desc {
      margin-top: 4px;
      font-size: 12px;
      color: #64748b;
      line-height: 1.45;
    }
    .col-extras {
      margin-top: 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .chip {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 11px;
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
    }
    .chip.muted {
      background: #f8fafc;
      color: #64748b;
      border-color: #e2e8f0;
    }
  `],
})
export class TemplateColumnsPreviewComponent {
  readonly templateId = input<string | null>(null);
  @Output() close = new EventEmitter<void>();

  private readonly templateService = inject(TemplateService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly resolved = signal<ResolvedTemplate | null>(null);
  readonly activeTab = signal<RequirementLevel>('required');

  readonly displayName = computed(() => {
    const id = this.templateId();
    return id ? getTemplateDisplayName(id) : '';
  });

  readonly requiredColumns = computed(() => this.columnsByLevel('required'));
  readonly recommendedColumns = computed(() => this.columnsByLevel('recommended'));
  readonly optionalColumns = computed(() => this.columnsByLevel('optional'));

  readonly tabs = computed(() => [
    { level: 'required' as const, label: 'Required', count: this.requiredColumns().length },
    { level: 'recommended' as const, label: 'Recommended', count: this.recommendedColumns().length },
    { level: 'optional' as const, label: 'Optional', count: this.optionalColumns().length },
  ]);

  readonly activeColumns = computed(() => {
    const level = this.activeTab();
    if (level === 'required') return this.requiredColumns();
    if (level === 'recommended') return this.recommendedColumns();
    return this.optionalColumns();
  });

  readonly parentChainLabel = computed(() => {
    const r = this.resolved();
    if (!r) return '';
    const chain = [...(r.parentChain || []), r.name];
    return chain.join(' → ');
  });

  readonly isLimitedData = computed(() => {
    const r = this.resolved();
    if (!r) return false;
    return (r.resolvedColumns?.length || 0) < 3 && (r.parentChain?.length || 0) === 0;
  });

  constructor() {
    effect(() => {
      const id = this.templateId();
      if (!id) {
        this.resolved.set(null);
        this.error.set(null);
        this.loading.set(false);
        return;
      }
      void this.load(id);
    });

    // Prefer first non-empty tab when data arrives
    effect(() => {
      const r = this.resolved();
      if (!r) return;
      const required = this.requiredColumns().length;
      const recommended = this.recommendedColumns().length;
      const optional = this.optionalColumns().length;
      if (required > 0) this.activeTab.set('required');
      else if (recommended > 0) this.activeTab.set('recommended');
      else if (optional > 0) this.activeTab.set('optional');
      else this.activeTab.set('required');
    });
  }

  private columnsByLevel(level: RequirementLevel): TemplateColumn[] {
    return (this.resolved()?.resolvedColumns || []).filter(
      c => (c.requirement || 'optional') === level
    );
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.resolved.set(null);
    try {
      const resolved = await this.templateService.getResolvedTemplate(id);
      if (this.templateId() === id) {
        this.resolved.set(resolved);
      }
    } catch (e) {
      if (this.templateId() === id) {
        this.error.set(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (this.templateId() === id) {
        this.loading.set(false);
      }
    }
  }

  hasExtras(col: TemplateColumn): boolean {
    return !!(this.ontologyHint(col) || col.allowNotAvailable || col.allowNotApplicable);
  }

  ontologyHint(col: TemplateColumn): string | null {
    const onto = col.validators?.find(v => v.validatorName === 'ontology');
    const list = onto?.params?.ontologies;
    if (!list?.length) return null;
    return list.join(', ');
  }
}
