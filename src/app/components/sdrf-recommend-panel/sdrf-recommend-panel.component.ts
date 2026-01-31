/**
 * SDRF Recommend Panel Component
 *
 * AI-powered recommendations sidebar panel.
 * Features:
 * - Slide-in sidebar like Stats panel
 * - Nicely rendered recommendations sorted by confidence
 * - Chat-like interface for user prompts
 * - Advanced settings for power users
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
  ChangeDetectionStrategy,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  SdrfRecommendation,
  RecommendationResult,
  RecommendationType,
  RecommendationConfidence,
  AnalysisFocusArea,
  LlmError,
  getProviderDisplayName,
} from '../../core/models/llm';
import { SdrfTable } from '../../core/models/sdrf-table';
import {
  RecommendationService,
  recommendationService,
} from '../../core/services/llm/recommendation.service';
import {
  LlmSettingsService,
  llmSettingsService,
} from '../../core/services/llm/settings.service';

export interface ApplyRecommendationEvent {
  recommendation: SdrfRecommendation;
}

export interface BatchApplyEvent {
  recommendations: SdrfRecommendation[];
}

type SortOption = 'confidence' | 'column' | 'type' | 'samples';
type ViewTab = 'recommendations' | 'chat' | 'advanced';

@Component({
  selector: 'sdrf-recommend-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ai-panel">
      <!-- Header -->
      <div class="panel-header">
        <div class="header-title">
          <span class="ai-icon">✨</span>
          <span>AI Assistant</span>
          @if (isConfigured()) {
            <span class="provider-tag">{{ getActiveProviderName() }}</span>
          }
        </div>
        <div class="header-actions">
          <button class="icon-btn" (click)="openSettings.emit()" title="Settings">
            ⚙️
          </button>
          <button class="icon-btn" (click)="close.emit()" title="Close">×</button>
        </div>
      </div>

      <!-- Not Configured -->
      @if (!isConfigured()) {
        <div class="empty-state">
          <p>Configure an AI provider to get started.</p>
          <button class="btn btn-primary" (click)="openSettings.emit()">
            Configure Provider
          </button>
        </div>
      } @else {
        <!-- Tabs -->
        <div class="panel-tabs">
          <button
            class="tab"
            [class.active]="activeTab() === 'recommendations'"
            (click)="activeTab.set('recommendations')"
          >
            Recommendations
            @if (result() && result()!.recommendations.length > 0) {
              <span class="tab-badge">{{ result()!.recommendations.length }}</span>
            }
          </button>
          <button
            class="tab"
            [class.active]="activeTab() === 'chat'"
            (click)="activeTab.set('chat')"
          >
            Chat
          </button>
          <button
            class="tab"
            [class.active]="activeTab() === 'advanced'"
            (click)="activeTab.set('advanced')"
          >
            Advanced
          </button>
        </div>

        <!-- Tab Content -->
        <div class="panel-content">
          <!-- Recommendations Tab -->
          @if (activeTab() === 'recommendations') {
            <div class="recommendations-tab">
              <!-- Analysis Controls -->
              <div class="analysis-section">
                <div class="focus-options">
                  <label class="focus-option">
                    <input type="checkbox" [checked]="focusFillMissing()" (change)="toggleFocus('fill_missing')" />
                    Fill missing
                  </label>
                  <label class="focus-option">
                    <input type="checkbox" [checked]="focusValidateOntology()" (change)="toggleFocus('validate_ontology')" />
                    Ontology
                  </label>
                  <label class="focus-option">
                    <input type="checkbox" [checked]="focusCheckConsistency()" (change)="toggleFocus('check_consistency')" />
                    Consistency
                  </label>
                </div>

                <button
                  class="btn btn-primary btn-block"
                  [disabled]="analyzing() || !table"
                  (click)="analyze()"
                >
                  @if (analyzing()) {
                    <span class="spinner"></span> Analyzing...
                  } @else {
                    Analyze SDRF
                  }
                </button>
              </div>

              <!-- Error -->
              @if (error()) {
                <div class="error-msg">
                  {{ error() }}
                  <button class="dismiss-btn" (click)="clearError()">×</button>
                </div>
              }

              <!-- Streaming Output (collapsible) -->
              @if (streamContent()) {
                <details class="stream-section" [open]="analyzing()">
                  <summary>
                    @if (analyzing()) {
                      <span class="spinner-sm"></span> Processing...
                    } @else {
                      Raw Output
                    }
                  </summary>
                  <pre class="stream-output">{{ streamContent() }}</pre>
                </details>
              }

              <!-- Results -->
              @if (result() && !analyzing()) {
                <div class="results-section">
                  <!-- Sort & Filter Bar -->
                  <div class="results-bar">
                    <span class="results-count">
                      {{ filteredRecommendations().length }} suggestion{{ filteredRecommendations().length !== 1 ? 's' : '' }}
                    </span>
                    <select class="sort-select" [value]="sortBy()" (change)="onSortChange($event)">
                      <option value="confidence">Sort: Confidence</option>
                      <option value="column">Sort: Column</option>
                      <option value="type">Sort: Type</option>
                      <option value="samples">Sort: # Samples</option>
                    </select>
                  </div>

                  <!-- Filter Pills -->
                  <div class="filter-pills">
                    <button
                      class="pill"
                      [class.active]="filterType() === 'all'"
                      (click)="filterType.set('all')"
                    >All</button>
                    <button
                      class="pill"
                      [class.active]="filterType() === 'fill_value'"
                      (click)="filterType.set('fill_value')"
                    >Fill</button>
                    <button
                      class="pill"
                      [class.active]="filterType() === 'ontology_suggestion'"
                      (click)="filterType.set('ontology_suggestion')"
                    >Ontology</button>
                    <button
                      class="pill"
                      [class.active]="filterType() === 'consistency_fix'"
                      (click)="filterType.set('consistency_fix')"
                    >Consistency</button>
                  </div>

                  <!-- Batch Actions -->
                  @if (unappliedCount() > 0) {
                    <div class="batch-actions">
                      <button class="btn btn-sm" (click)="applyHighConfidence()">
                        Apply High Confidence ({{ highConfidenceCount() }})
                      </button>
                      <button class="btn btn-sm" (click)="applyAll()">
                        Apply All ({{ unappliedCount() }})
                      </button>
                    </div>
                  }

                  <!-- Recommendations List -->
                  <div class="recommendations-list">
                    @if (filteredRecommendations().length === 0) {
                      <div class="no-results">
                        @if (result()!.recommendations.length === 0) {
                          ✅ No issues found. Your SDRF looks good!
                        } @else {
                          No recommendations match current filter.
                        }
                      </div>
                    } @else {
                      @for (rec of sortedRecommendations(); track rec.id) {
                        <div class="rec-card" [class.applied]="rec.applied">
                          <!-- Confidence indicator -->
                          <div class="rec-confidence-bar" [class]="'conf-' + rec.confidence"></div>

                          <div class="rec-content">
                            <!-- Header row -->
                            <div class="rec-header">
                              <span class="rec-type-badge" [class]="'type-' + rec.type">
                                {{ formatType(rec.type) }}
                              </span>
                              <span class="rec-column-name">{{ rec.column }}</span>
                              <span class="rec-confidence-badge" [class]="'conf-' + rec.confidence">
                                {{ rec.confidence }}
                              </span>
                            </div>

                            <!-- Change -->
                            <div class="rec-change">
                              @if (rec.currentValue && rec.currentValue !== rec.suggestedValue) {
                                <span class="old-val">{{ rec.currentValue }}</span>
                                <span class="arrow">→</span>
                              }
                              <span class="new-val">{{ rec.suggestedValue }}</span>
                            </div>

                            <!-- Meta -->
                            <div class="rec-meta">
                              {{ rec.sampleIndices.length }} sample{{ rec.sampleIndices.length > 1 ? 's' : '' }}
                              <span class="sample-list">({{ formatSamples(rec.sampleIndices) }})</span>
                            </div>

                            <!-- Reasoning -->
                            <div class="rec-reasoning">{{ rec.reasoning }}</div>

                            <!-- Actions -->
                            <div class="rec-actions">
                              @if (rec.applied) {
                                <span class="applied-label">✓ Applied</span>
                              } @else {
                                <button class="btn btn-primary btn-xs" (click)="onApplyClick(rec)">
                                  Accept
                                </button>
                                <button class="btn btn-xs" (click)="onPreviewClick(rec)">
                                  Preview
                                </button>
                                <button class="btn btn-xs btn-muted" (click)="dismissRecommendation(rec)">
                                  Dismiss
                                </button>
                              }
                            </div>
                          </div>
                        </div>
                      }
                    }
                  </div>
                </div>
              }
            </div>
          }

          <!-- Chat Tab -->
          @if (activeTab() === 'chat') {
            <div class="chat-tab">
              <div class="chat-messages">
                @for (msg of chatMessages(); track $index) {
                  <div class="chat-msg" [class]="'msg-' + msg.role">
                    <div class="msg-role">{{ msg.role === 'user' ? 'You' : 'AI' }}</div>
                    <div class="msg-content">{{ msg.content }}</div>
                  </div>
                }
                @if (chatMessages().length === 0) {
                  <div class="chat-empty">
                    <p>Ask questions or provide additional context to refine recommendations.</p>
                    <p class="hint">Examples:</p>
                    <ul class="hint-list">
                      <li (click)="sendChatMessage('What columns have the most issues?')">
                        "What columns have the most issues?"
                      </li>
                      <li (click)="sendChatMessage('The samples are from a clinical trial with healthy controls')">
                        "The samples are from a clinical trial..."
                      </li>
                      <li (click)="sendChatMessage('Focus only on the organism and disease columns')">
                        "Focus only on organism and disease columns"
                      </li>
                    </ul>
                  </div>
                }
              </div>
              <div class="chat-input-area">
                <textarea
                  class="chat-input"
                  [value]="chatInput()"
                  (input)="onChatInput($event)"
                  (keydown.enter)="onChatEnter($event)"
                  placeholder="Ask a question or provide context..."
                  rows="2"
                ></textarea>
                <button
                  class="btn btn-primary"
                  [disabled]="!chatInput().trim() || chatLoading()"
                  (click)="sendChatMessage()"
                >
                  @if (chatLoading()) {
                    <span class="spinner-sm"></span>
                  } @else {
                    Send
                  }
                </button>
              </div>
            </div>
          }

          <!-- Advanced Tab -->
          @if (activeTab() === 'advanced') {
            <div class="advanced-tab">
              <div class="adv-section">
                <h4>Context Options</h4>
                <label class="adv-option">
                  <input type="checkbox" [checked]="includeSampleData()" (change)="includeSampleData.set(!includeSampleData())" />
                  Include sample data in context
                </label>
                <label class="adv-option">
                  <span>Max samples in context:</span>
                  <input type="number" class="num-input" [value]="maxSampleRows()" (input)="onMaxSamplesChange($event)" min="1" max="50" />
                </label>
                <label class="adv-option">
                  <span>Max unique values per column:</span>
                  <input type="number" class="num-input" [value]="maxUniqueValues()" (input)="onMaxUniqueChange($event)" min="5" max="100" />
                </label>
              </div>

              <div class="adv-section">
                <h4>Custom Instructions</h4>
                <p class="adv-hint">Add additional instructions for the AI. These will be appended to the analysis prompt.</p>
                <textarea
                  class="adv-textarea"
                  [value]="customInstructions()"
                  (input)="onCustomInstructionsChange($event)"
                  placeholder="e.g., Focus on human samples only. Suggest UBERON terms for organism parts. Be conservative with low-confidence suggestions."
                  rows="4"
                ></textarea>
              </div>

              <div class="adv-section">
                <h4>System Prompt Preview</h4>
                <p class="adv-hint">The base system prompt used for SDRF analysis. Read-only.</p>
                <details class="prompt-preview">
                  <summary>View system prompt</summary>
                  <pre class="prompt-content">{{ systemPromptPreview() }}</pre>
                </details>
              </div>

              <div class="adv-section">
                <h4>Debug</h4>
                <label class="adv-option">
                  <input type="checkbox" [checked]="showRawOutput()" (change)="showRawOutput.set(!showRawOutput())" />
                  Show raw LLM output
                </label>
                @if (result()?.rawResponse && showRawOutput()) {
                  <pre class="raw-output">{{ result()!.rawResponse }}</pre>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .ai-panel {
      width: 400px;
      min-width: 350px;
      max-width: 500px;
      height: 100%;
      background: white;
      border-left: 1px solid #e5e7eb;
      display: flex;
      flex-direction: column;
      font-size: 13px;
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      flex-shrink: 0;
    }

    .header-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
    }

    .ai-icon { font-size: 16px; }

    .provider-tag {
      font-size: 10px;
      background: rgba(255,255,255,0.2);
      padding: 2px 8px;
      border-radius: 10px;
      font-weight: 400;
    }

    .header-actions {
      display: flex;
      gap: 4px;
    }

    .icon-btn {
      background: rgba(255,255,255,0.15);
      border: none;
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
    }
    .icon-btn:hover { background: rgba(255,255,255,0.25); }

    .empty-state {
      padding: 40px 20px;
      text-align: center;
      color: #6b7280;
    }

    .panel-tabs {
      display: flex;
      border-bottom: 1px solid #e5e7eb;
      flex-shrink: 0;
    }

    .tab {
      flex: 1;
      padding: 10px 12px;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      cursor: pointer;
      font-size: 12px;
      color: #6b7280;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .tab:hover { background: #f9fafb; }
    .tab.active {
      color: #667eea;
      border-bottom-color: #667eea;
      font-weight: 500;
    }

    .tab-badge {
      background: #667eea;
      color: white;
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 10px;
    }

    .panel-content {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    /* Recommendations Tab */
    .recommendations-tab {
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
    }

    .analysis-section {
      padding: 12px 16px;
      border-bottom: 1px solid #e5e7eb;
      flex-shrink: 0;
    }

    .focus-options {
      display: flex;
      gap: 12px;
      margin-bottom: 10px;
      flex-wrap: wrap;
    }

    .focus-option {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: #4b5563;
      cursor: pointer;
    }

    .error-msg {
      margin: 8px 16px;
      padding: 8px 12px;
      background: #fee2e2;
      color: #b91c1c;
      border-radius: 6px;
      font-size: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .dismiss-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 16px;
      color: inherit;
    }

    .stream-section {
      margin: 8px 16px;
      font-size: 11px;
    }

    .stream-section summary {
      cursor: pointer;
      color: #6b7280;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .stream-output {
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 10px;
      border-radius: 6px;
      font-size: 10px;
      max-height: 150px;
      overflow: auto;
      margin-top: 6px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .results-section {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .results-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 16px;
      border-bottom: 1px solid #e5e7eb;
      flex-shrink: 0;
    }

    .results-count {
      font-size: 12px;
      color: #6b7280;
    }

    .sort-select {
      font-size: 11px;
      padding: 4px 8px;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      background: white;
    }

    .filter-pills {
      display: flex;
      gap: 6px;
      padding: 8px 16px;
      border-bottom: 1px solid #e5e7eb;
      flex-shrink: 0;
      flex-wrap: wrap;
    }

    .pill {
      padding: 4px 10px;
      border: 1px solid #d1d5db;
      border-radius: 12px;
      background: white;
      font-size: 11px;
      cursor: pointer;
      color: #6b7280;
    }
    .pill:hover { background: #f3f4f6; }
    .pill.active {
      background: #667eea;
      color: white;
      border-color: #667eea;
    }

    .batch-actions {
      display: flex;
      gap: 8px;
      padding: 8px 16px;
      border-bottom: 1px solid #e5e7eb;
      flex-shrink: 0;
    }

    .recommendations-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px 12px;
    }

    .no-results {
      padding: 30px 20px;
      text-align: center;
      color: #9ca3af;
      font-size: 13px;
    }

    .rec-card {
      display: flex;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      margin-bottom: 8px;
      overflow: hidden;
    }
    .rec-card.applied { opacity: 0.5; }

    .rec-confidence-bar {
      width: 4px;
      flex-shrink: 0;
    }
    .rec-confidence-bar.conf-high { background: #22c55e; }
    .rec-confidence-bar.conf-medium { background: #f59e0b; }
    .rec-confidence-bar.conf-low { background: #9ca3af; }

    .rec-content {
      flex: 1;
      padding: 10px 12px;
    }

    .rec-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
      flex-wrap: wrap;
    }

    .rec-type-badge {
      font-size: 9px;
      font-weight: 600;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 3px;
    }
    .type-fill_value { background: #dbeafe; color: #1d4ed8; }
    .type-correct_value { background: #fef3c7; color: #b45309; }
    .type-ontology_suggestion { background: #f3e8ff; color: #7c3aed; }
    .type-consistency_fix { background: #e0e7ff; color: #4338ca; }

    .rec-column-name {
      font-weight: 600;
      color: #374151;
      font-size: 12px;
    }

    .rec-confidence-badge {
      margin-left: auto;
      font-size: 9px;
      padding: 2px 6px;
      border-radius: 3px;
    }
    .conf-high { background: #d1fae5; color: #059669; }
    .conf-medium { background: #fef3c7; color: #d97706; }
    .conf-low { background: #f3f4f6; color: #6b7280; }

    .rec-change {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
      flex-wrap: wrap;
    }

    .old-val {
      color: #9ca3af;
      text-decoration: line-through;
      font-size: 11px;
    }

    .arrow { color: #6b7280; font-size: 10px; }

    .new-val {
      background: #d1fae5;
      color: #059669;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 11px;
      font-weight: 500;
    }

    .rec-meta {
      font-size: 10px;
      color: #9ca3af;
      margin-bottom: 4px;
    }

    .sample-list { opacity: 0.7; }

    .rec-reasoning {
      font-size: 11px;
      color: #6b7280;
      font-style: italic;
      background: #f9fafb;
      padding: 6px 8px;
      border-radius: 4px;
      margin-bottom: 8px;
      line-height: 1.4;
    }

    .rec-actions {
      display: flex;
      gap: 6px;
    }

    .applied-label {
      color: #059669;
      font-size: 11px;
      font-weight: 500;
    }

    /* Chat Tab */
    .chat-tab {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 12px 16px;
    }

    .chat-empty {
      color: #9ca3af;
      font-size: 12px;
    }

    .chat-empty .hint { margin-top: 16px; font-weight: 500; color: #6b7280; }

    .hint-list {
      list-style: none;
      padding: 0;
      margin: 8px 0 0 0;
    }

    .hint-list li {
      padding: 8px 12px;
      background: #f3f4f6;
      border-radius: 6px;
      margin-bottom: 6px;
      cursor: pointer;
      font-style: italic;
    }
    .hint-list li:hover { background: #e5e7eb; }

    .chat-msg {
      margin-bottom: 12px;
    }

    .msg-role {
      font-size: 10px;
      font-weight: 600;
      color: #6b7280;
      margin-bottom: 4px;
    }

    .msg-content {
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 12px;
      line-height: 1.5;
    }

    .msg-user .msg-content {
      background: #667eea;
      color: white;
    }

    .msg-assistant .msg-content {
      background: #f3f4f6;
      color: #374151;
    }

    .chat-input-area {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid #e5e7eb;
      flex-shrink: 0;
    }

    .chat-input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 12px;
      resize: none;
      font-family: inherit;
    }

    /* Advanced Tab */
    .advanced-tab {
      padding: 16px;
      overflow-y: auto;
    }

    .adv-section {
      margin-bottom: 20px;
    }

    .adv-section h4 {
      margin: 0 0 10px 0;
      font-size: 12px;
      color: #374151;
    }

    .adv-hint {
      font-size: 11px;
      color: #9ca3af;
      margin: 0 0 8px 0;
    }

    .adv-option {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: #4b5563;
      margin-bottom: 8px;
      cursor: pointer;
    }

    .num-input {
      width: 60px;
      padding: 4px 8px;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      font-size: 12px;
    }

    .adv-textarea {
      width: 100%;
      padding: 10px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 12px;
      font-family: inherit;
      resize: vertical;
    }

    .prompt-preview summary {
      cursor: pointer;
      font-size: 11px;
      color: #667eea;
    }

    .prompt-content {
      background: #f9fafb;
      padding: 10px;
      border-radius: 6px;
      font-size: 10px;
      max-height: 200px;
      overflow: auto;
      margin-top: 8px;
      white-space: pre-wrap;
    }

    .raw-output {
      background: #1e1e1e;
      color: #d4d4d4;
      padding: 10px;
      border-radius: 6px;
      font-size: 10px;
      max-height: 200px;
      overflow: auto;
      margin-top: 8px;
      white-space: pre-wrap;
    }

    /* Buttons */
    .btn {
      padding: 8px 14px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      background: white;
      color: #374151;
      font-weight: 500;
    }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn:hover:not(:disabled) { background: #f3f4f6; }

    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
    }
    .btn-primary:hover:not(:disabled) { opacity: 0.9; }

    .btn-block { width: 100%; }

    .btn-sm { padding: 5px 10px; font-size: 11px; }
    .btn-xs { padding: 4px 8px; font-size: 10px; }
    .btn-muted { color: #9ca3af; border-color: #e5e7eb; }

    .spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    .spinner-sm {
      display: inline-block;
      width: 10px;
      height: 10px;
      border: 2px solid #d1d5db;
      border-top-color: #667eea;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class SdrfRecommendPanelComponent implements OnChanges {
  @Input() table: SdrfTable | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() openSettings = new EventEmitter<void>();
  @Output() applyRecommendation = new EventEmitter<ApplyRecommendationEvent>();
  @Output() batchApply = new EventEmitter<BatchApplyEvent>();
  @Output() previewRecommendation = new EventEmitter<SdrfRecommendation>();

  // State
  readonly activeTab = signal<ViewTab>('recommendations');
  readonly analyzing = signal(false);
  readonly error = signal<string | null>(null);
  readonly result = signal<RecommendationResult | null>(null);
  readonly streamContent = signal<string>('');

  // Focus options
  readonly focusFillMissing = signal(true);
  readonly focusValidateOntology = signal(true);
  readonly focusCheckConsistency = signal(true);

  // Sort & Filter
  readonly sortBy = signal<SortOption>('confidence');
  readonly filterType = signal<RecommendationType | 'all'>('all');

  // Chat state
  readonly chatMessages = signal<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
  readonly chatInput = signal('');
  readonly chatLoading = signal(false);

  // Advanced options
  readonly includeSampleData = signal(true);
  readonly maxSampleRows = signal(10);
  readonly maxUniqueValues = signal(20);
  readonly customInstructions = signal('');
  readonly showRawOutput = signal(false);

  // Dismissed recommendations
  private dismissedIds = new Set<string>();

  // Services
  private recommendationService: RecommendationService;
  private settingsService: LlmSettingsService;

  constructor() {
    this.recommendationService = recommendationService;
    this.settingsService = llmSettingsService;
  }

  // Computed
  readonly filteredRecommendations = computed(() => {
    const res = this.result();
    if (!res) return [];

    let recs = res.recommendations.filter(r => !this.dismissedIds.has(r.id));

    const typeFilter = this.filterType();
    if (typeFilter !== 'all') {
      recs = recs.filter(r => r.type === typeFilter);
    }

    return recs;
  });

  readonly sortedRecommendations = computed(() => {
    const recs = [...this.filteredRecommendations()];
    const sort = this.sortBy();

    recs.sort((a, b) => {
      switch (sort) {
        case 'confidence':
          const confOrder = { high: 0, medium: 1, low: 2 };
          return confOrder[a.confidence] - confOrder[b.confidence];
        case 'column':
          return a.column.localeCompare(b.column);
        case 'type':
          return a.type.localeCompare(b.type);
        case 'samples':
          return b.sampleIndices.length - a.sampleIndices.length;
        default:
          return 0;
      }
    });

    return recs;
  });

  readonly unappliedCount = computed(() =>
    this.filteredRecommendations().filter(r => !r.applied).length
  );

  readonly highConfidenceCount = computed(() =>
    this.filteredRecommendations().filter(r => !r.applied && r.confidence === 'high').length
  );

  readonly systemPromptPreview = computed(() => {
    // Return a preview of the system prompt
    return `You are an expert in proteomics data annotation, specifically the SDRF format...

Key concepts:
- Reserved values: "not available", "not applicable", "anonymized", "pooled"
- Column types: source name, characteristics[...], factor value[...], comment[...]
- Ontology requirements per column type

Output: JSON with recommendations array containing type, column, suggestedValue, confidence, reasoning...`;
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['table']) {
      this.result.set(null);
      this.error.set(null);
      this.streamContent.set('');
      this.dismissedIds.clear();
    }
  }

  isConfigured(): boolean {
    return this.settingsService.isActiveProviderConfigured();
  }

  getActiveProviderName(): string {
    return getProviderDisplayName(this.settingsService.getActiveProvider());
  }

  toggleFocus(area: 'fill_missing' | 'validate_ontology' | 'check_consistency'): void {
    switch (area) {
      case 'fill_missing': this.focusFillMissing.set(!this.focusFillMissing()); break;
      case 'validate_ontology': this.focusValidateOntology.set(!this.focusValidateOntology()); break;
      case 'check_consistency': this.focusCheckConsistency.set(!this.focusCheckConsistency()); break;
    }
  }

  async analyze(): Promise<void> {
    if (!this.table || this.analyzing()) return;

    this.analyzing.set(true);
    this.error.set(null);
    this.streamContent.set('');
    this.result.set(null);
    this.dismissedIds.clear();

    const focusAreas: AnalysisFocusArea[] = [];
    if (this.focusFillMissing()) focusAreas.push('fill_missing');
    if (this.focusValidateOntology()) focusAreas.push('validate_ontology');
    if (this.focusCheckConsistency()) focusAreas.push('check_consistency');

    try {
      let finalResult: RecommendationResult | null = null;

      for await (const chunk of this.recommendationService.analyzeStreaming(
        this.table,
        focusAreas
      )) {
        if (typeof chunk === 'string') {
          this.streamContent.update(s => s + chunk);
        } else {
          finalResult = chunk;
        }
      }

      if (finalResult) {
        this.result.set(finalResult);
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      this.analyzing.set(false);
    }
  }

  clearError(): void {
    this.error.set(null);
  }

  onSortChange(event: Event): void {
    this.sortBy.set((event.target as HTMLSelectElement).value as SortOption);
  }

  formatType(type: RecommendationType): string {
    const labels: Record<RecommendationType, string> = {
      fill_value: 'Fill',
      correct_value: 'Fix',
      ontology_suggestion: 'Ontology',
      consistency_fix: 'Consistency',
    };
    return labels[type];
  }

  formatSamples(indices: number[]): string {
    if (indices.length <= 3) return indices.join(', ');
    return `${indices.slice(0, 3).join(', ')}...+${indices.length - 3}`;
  }

  onApplyClick(rec: SdrfRecommendation): void {
    rec.applied = true;
    this.applyRecommendation.emit({ recommendation: rec });
  }

  onPreviewClick(rec: SdrfRecommendation): void {
    this.previewRecommendation.emit(rec);
  }

  dismissRecommendation(rec: SdrfRecommendation): void {
    this.dismissedIds.add(rec.id);
    // Trigger re-computation
    this.result.update(r => r ? { ...r } : null);
  }

  applyHighConfidence(): void {
    const highConf = this.filteredRecommendations().filter(r => !r.applied && r.confidence === 'high');
    for (const rec of highConf) rec.applied = true;
    this.batchApply.emit({ recommendations: highConf });
  }

  applyAll(): void {
    const toApply = this.filteredRecommendations().filter(r => !r.applied);
    for (const rec of toApply) rec.applied = true;
    this.batchApply.emit({ recommendations: toApply });
  }

  // Chat methods
  onChatInput(event: Event): void {
    this.chatInput.set((event.target as HTMLTextAreaElement).value);
  }

  onChatEnter(event: Event): void {
    if (!(event as KeyboardEvent).shiftKey) {
      event.preventDefault();
      this.sendChatMessage();
    }
  }

  async sendChatMessage(preset?: string): Promise<void> {
    const message = preset || this.chatInput().trim();
    if (!message || this.chatLoading()) return;

    this.chatInput.set('');
    this.chatMessages.update(msgs => [...msgs, { role: 'user', content: message }]);
    this.chatLoading.set(true);

    try {
      // For now, add a placeholder response
      // In a full implementation, this would call the LLM with chat context
      const response = `I understand you want to: "${message}". This feature will integrate with the analysis to provide contextual responses based on your SDRF data.`;

      this.chatMessages.update(msgs => [...msgs, { role: 'assistant', content: response }]);
    } catch (err) {
      this.chatMessages.update(msgs => [...msgs, {
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Failed to get response'}`
      }]);
    } finally {
      this.chatLoading.set(false);
    }
  }

  // Advanced options
  onMaxSamplesChange(event: Event): void {
    this.maxSampleRows.set(parseInt((event.target as HTMLInputElement).value) || 10);
  }

  onMaxUniqueChange(event: Event): void {
    this.maxUniqueValues.set(parseInt((event.target as HTMLInputElement).value) || 20);
  }

  onCustomInstructionsChange(event: Event): void {
    this.customInstructions.set((event.target as HTMLTextAreaElement).value);
  }
}
