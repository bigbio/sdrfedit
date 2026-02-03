/**
 * Suggestion Card Component
 *
 * Displays an actionable suggestion with OLS validation status,
 * available actions, and alternatives.
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ActionableSuggestion,
  SuggestionAction,
  SuggestionActionEvent,
  getSuggestionTypeLabel,
  getSuggestionTypeIcon,
  getConfidenceClass,
} from '../../core/models/actionable-suggestion';
import { OntologySuggestion, formatOntologyTerm } from '../../core/models/ontology';

@Component({
  selector: 'app-suggestion-card',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="suggestion-card"
      [class.stale]="suggestion.validation.isStale"
      [class.applied]="suggestion.status === 'applied'"
      [class.dismissed]="suggestion.status === 'dismissed'"
      [class.expanded]="isExpanded()"
    >
      <!-- Header -->
      <div class="card-header" (click)="toggleExpand()">
        <div class="header-left">
          <!-- Type icon -->
          <span class="type-icon material-icons">{{ typeIcon() }}</span>

          <!-- Confidence badge -->
          <span
            class="confidence-badge"
            [class]="confidenceClass()"
          >
            {{ suggestion.confidence | uppercase }}
          </span>

          <!-- OLS status -->
          @if (suggestion.validation.olsValidated) {
            @if (suggestion.validation.olsMatch) {
              <span class="ols-badge verified" title="OLS verified">
                <span class="material-icons">verified</span>
                OLS
              </span>
            } @else if (hasAlternatives()) {
              <span class="ols-badge warning" title="Term not found in OLS">
                <span class="material-icons">warning</span>
                {{ alternativesCount() }}
              </span>
            }
          }

          <!-- Stale indicator -->
          @if (suggestion.validation.isStale) {
            <span class="stale-badge" title="Table has changed since this suggestion was created">
              <span class="material-icons">update</span>
              Stale
            </span>
          }
        </div>

        <div class="header-right">
          <span class="affected-count" title="Affected samples">
            {{ suggestion.affectedSamples.length }} sample{{ suggestion.affectedSamples.length !== 1 ? 's' : '' }}
          </span>
          <span class="expand-icon material-icons">
            {{ isExpanded() ? 'expand_less' : 'expand_more' }}
          </span>
        </div>
      </div>

      <!-- Main content -->
      <div class="card-content">
        <!-- Column and value change -->
        <div class="change-preview">
          <span class="column-name" [title]="suggestion.column">
            {{ suggestion.column }}
          </span>

          <div class="value-change">
            <span class="old-value" [title]="currentValuePreview()">
              {{ currentValuePreview() | slice:0:30 }}{{ currentValuePreview().length > 30 ? '...' : '' }}
            </span>
            <span class="arrow material-icons">arrow_forward</span>
            <span
              class="new-value"
              [class.ols-matched]="suggestion.validation.olsMatch"
              [title]="suggestion.suggestedValue"
            >
              {{ suggestion.suggestedValue | slice:0:30 }}{{ suggestion.suggestedValue.length > 30 ? '...' : '' }}
            </span>
          </div>
        </div>

        <!-- Impact description -->
        <p class="impact">{{ suggestion.impactDescription }}</p>

        <!-- Reasoning (collapsed by default) -->
        @if (isExpanded()) {
          <div class="reasoning-section">
            <p class="reasoning">{{ suggestion.reasoning }}</p>

            <!-- OLS Match details -->
            @if (suggestion.validation.olsMatch) {
              <div class="ols-match">
                <span class="label">OLS Match:</span>
                <span class="term">{{ formatTerm(suggestion.validation.olsMatch) }}</span>
                @if (suggestion.validation.olsMatch.description) {
                  <p class="description">{{ suggestion.validation.olsMatch.description }}</p>
                }
              </div>
            }
          </div>
        }

        <!-- OLS Alternatives (if no exact match) -->
        @if (showAlternatives() && hasAlternatives()) {
          <div class="ols-alternatives">
            <div class="alternatives-header">
              <span class="material-icons">info</span>
              <span>Suggested term not found in OLS. Consider these alternatives:</span>
            </div>
            <ul class="alternatives-list">
              @for (alt of suggestion.validation.olsAlternatives; track alt.id) {
                <li
                  class="alternative-item"
                  (click)="selectAlternative(alt)"
                  [title]="alt.description || ''"
                >
                  <span class="alt-label">{{ alt.label }}</span>
                  <code class="alt-id">{{ alt.id }}</code>
                </li>
              }
            </ul>
          </div>
        }
      </div>

      <!-- Action buttons -->
      <div class="card-actions">
        @for (action of visibleActions(); track action.type) {
          <button
            type="button"
            class="action-btn"
            [class.primary]="action.isPrimary"
            [class]="action.type"
            [disabled]="!action.enabled"
            [title]="action.tooltip || action.label"
            (click)="handleAction(action, $event)"
          >
            <span class="material-icons">{{ action.icon }}</span>
            <span class="action-label">{{ action.label }}</span>
          </button>
        }

        <!-- Show alternatives toggle -->
        @if (hasAlternatives() && !showAlternatives()) {
          <button
            type="button"
            class="action-btn alternatives"
            (click)="toggleAlternatives($event)"
            title="Show OLS alternatives"
          >
            <span class="material-icons">list</span>
            <span class="action-label">{{ alternativesCount() }} Alternatives</span>
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    .suggestion-card {
      background: var(--card-bg, #fff);
      border: 1px solid var(--border-color, #e0e0e0);
      border-radius: 8px;
      margin-bottom: 8px;
      overflow: hidden;
      transition: all 0.2s ease;
    }

    .suggestion-card:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }

    .suggestion-card.stale {
      opacity: 0.7;
      border-color: var(--warning-color, #ff9800);
    }

    .suggestion-card.applied {
      background: var(--success-bg, #e8f5e9);
      border-color: var(--success-color, #4caf50);
    }

    .suggestion-card.dismissed {
      opacity: 0.5;
      background: var(--muted-bg, #f5f5f5);
    }

    /* Header */
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      cursor: pointer;
      background: var(--header-bg, #fafafa);
      border-bottom: 1px solid var(--border-color, #e0e0e0);
    }

    .header-left, .header-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .type-icon {
      font-size: 18px;
      color: var(--text-secondary, #666);
    }

    .confidence-badge {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .confidence-high {
      background: var(--success-bg, #e8f5e9);
      color: var(--success-color, #2e7d32);
    }

    .confidence-medium {
      background: var(--warning-bg, #fff3e0);
      color: var(--warning-color, #ef6c00);
    }

    .confidence-low {
      background: var(--muted-bg, #f5f5f5);
      color: var(--text-secondary, #666);
    }

    .ols-badge {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 500;
    }

    .ols-badge .material-icons {
      font-size: 12px;
    }

    .ols-badge.verified {
      background: var(--info-bg, #e3f2fd);
      color: var(--info-color, #1565c0);
    }

    .ols-badge.warning {
      background: var(--warning-bg, #fff3e0);
      color: var(--warning-color, #ef6c00);
    }

    .stale-badge {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 500;
      background: var(--error-bg, #ffebee);
      color: var(--error-color, #c62828);
    }

    .stale-badge .material-icons {
      font-size: 12px;
    }

    .affected-count {
      font-size: 12px;
      color: var(--text-secondary, #666);
    }

    .expand-icon {
      font-size: 20px;
      color: var(--text-secondary, #666);
    }

    /* Content */
    .card-content {
      padding: 12px;
    }

    .change-preview {
      margin-bottom: 8px;
    }

    .column-name {
      display: block;
      font-weight: 600;
      font-size: 13px;
      color: var(--text-primary, #333);
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .value-change {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }

    .old-value {
      color: var(--error-color, #c62828);
      text-decoration: line-through;
      background: var(--error-bg, #ffebee);
      padding: 2px 6px;
      border-radius: 4px;
    }

    .arrow {
      font-size: 14px;
      color: var(--text-secondary, #666);
    }

    .new-value {
      color: var(--success-color, #2e7d32);
      background: var(--success-bg, #e8f5e9);
      padding: 2px 6px;
      border-radius: 4px;
    }

    .new-value.ols-matched {
      border: 1px solid var(--info-color, #1565c0);
    }

    .impact {
      font-size: 12px;
      color: var(--text-secondary, #666);
      margin: 0 0 8px 0;
    }

    .reasoning-section {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--border-color, #e0e0e0);
    }

    .reasoning {
      font-size: 12px;
      color: var(--text-secondary, #666);
      margin: 0 0 8px 0;
      font-style: italic;
    }

    .ols-match {
      background: var(--info-bg, #e3f2fd);
      padding: 8px;
      border-radius: 4px;
      font-size: 12px;
    }

    .ols-match .label {
      font-weight: 600;
      color: var(--info-color, #1565c0);
    }

    .ols-match .term {
      margin-left: 4px;
    }

    .ols-match .description {
      margin: 4px 0 0 0;
      font-size: 11px;
      color: var(--text-secondary, #666);
    }

    /* Alternatives */
    .ols-alternatives {
      margin-top: 12px;
      padding: 8px;
      background: var(--warning-bg, #fff3e0);
      border-radius: 4px;
    }

    .alternatives-header {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: var(--warning-color, #ef6c00);
      margin-bottom: 8px;
    }

    .alternatives-header .material-icons {
      font-size: 16px;
    }

    .alternatives-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .alternative-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 8px;
      margin-bottom: 4px;
      background: #fff;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .alternative-item:hover {
      background: var(--hover-bg, #f5f5f5);
    }

    .alternative-item:last-child {
      margin-bottom: 0;
    }

    .alt-label {
      font-size: 12px;
      color: var(--text-primary, #333);
    }

    .alt-id {
      font-size: 10px;
      color: var(--text-secondary, #666);
      background: var(--muted-bg, #f5f5f5);
      padding: 2px 4px;
      border-radius: 2px;
    }

    /* Actions */
    .card-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 8px 12px;
      background: var(--header-bg, #fafafa);
      border-top: 1px solid var(--border-color, #e0e0e0);
    }

    .action-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      border: 1px solid var(--border-color, #e0e0e0);
      border-radius: 4px;
      background: #fff;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .action-btn:hover:not(:disabled) {
      background: var(--hover-bg, #f5f5f5);
    }

    .action-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .action-btn .material-icons {
      font-size: 16px;
    }

    .action-btn.primary {
      background: var(--primary-color, #1976d2);
      border-color: var(--primary-color, #1976d2);
      color: #fff;
    }

    .action-btn.primary:hover:not(:disabled) {
      background: var(--primary-dark, #1565c0);
    }

    .action-btn.apply_ols {
      background: var(--info-color, #1565c0);
      border-color: var(--info-color, #1565c0);
      color: #fff;
    }

    .action-btn.dismiss {
      color: var(--error-color, #c62828);
    }

    .action-btn.chat {
      color: var(--info-color, #1565c0);
    }

    .action-label {
      white-space: nowrap;
    }

    /* Responsive */
    @media (max-width: 600px) {
      .action-label {
        display: none;
      }

      .action-btn {
        padding: 8px;
      }
    }
  `],
})
export class SuggestionCardComponent {
  @Input({ required: true }) suggestion!: ActionableSuggestion;

  @Output() actionTriggered = new EventEmitter<SuggestionActionEvent>();
  @Output() alternativeSelected = new EventEmitter<{
    suggestion: ActionableSuggestion;
    alternative: OntologySuggestion;
  }>();

  // Local state
  protected readonly isExpanded = signal(false);
  protected readonly showAlternativesState = signal(false);

  // Computed values
  protected readonly typeIcon = computed(() =>
    getSuggestionTypeIcon(this.suggestion.type)
  );

  protected readonly confidenceClass = computed(() =>
    getConfidenceClass(this.suggestion.confidence)
  );

  protected readonly hasAlternatives = computed(() =>
    (this.suggestion.validation.olsAlternatives?.length || 0) > 0
  );

  protected readonly alternativesCount = computed(() =>
    this.suggestion.validation.olsAlternatives?.length || 0
  );

  protected readonly showAlternatives = computed(() =>
    this.showAlternativesState() || !this.suggestion.validation.olsMatch
  );

  protected readonly visibleActions = computed(() => {
    // Filter out alternatives action (we handle it separately)
    return this.suggestion.availableActions.filter(a => a.type !== 'alternatives');
  });

  /**
   * Gets the first current value for preview.
   */
  protected currentValuePreview(): string {
    const iterator = this.suggestion.currentValues.values();
    const first = iterator.next();
    return first.done ? 'N/A' : first.value;
  }

  /**
   * Formats an ontology term for display.
   */
  protected formatTerm(term: OntologySuggestion): string {
    return formatOntologyTerm(term);
  }

  /**
   * Toggles expanded state.
   */
  protected toggleExpand(): void {
    this.isExpanded.update(v => !v);
  }

  /**
   * Toggles alternatives visibility.
   */
  protected toggleAlternatives(event: Event): void {
    event.stopPropagation();
    this.showAlternativesState.update(v => !v);
  }

  /**
   * Handles an action button click.
   */
  protected handleAction(action: SuggestionAction, event: Event): void {
    event.stopPropagation();

    this.actionTriggered.emit({
      suggestion: this.suggestion,
      action,
    });
  }

  /**
   * Handles selection of an OLS alternative.
   */
  protected selectAlternative(alternative: OntologySuggestion): void {
    this.alternativeSelected.emit({
      suggestion: this.suggestion,
      alternative,
    });
  }
}
