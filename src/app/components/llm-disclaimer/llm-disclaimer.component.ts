/**
 * LLM Disclaimer Component
 *
 * Displays a disclaimer about LLM capabilities and limitations.
 * Shows when users first use the AI assistant or browser-based models.
 */

import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

const STORAGE_KEY = 'sdrf_llm_disclaimer_acknowledged';

@Component({
  selector: 'app-llm-disclaimer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="llm-disclaimer" [class.compact]="compact()">
      <div class="disclaimer-header">
        <div class="disclaimer-icon">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </div>
        <h4>AI Assistant Disclaimer</h4>
      </div>

      <div class="disclaimer-content">
        <p>
          This chatbot is designed to assist you with general information and basic inquiries
          about SDRF files. Please note that it is <strong>not a replacement</strong> for our
          dedicated helpdesk support or official documentation.
        </p>

        <p>
          While the chatbot is powered by a language model, it may occasionally produce
          responses that are unrelated or incorrect, known as <strong>LLM hallucinations</strong>,
          due to the inherent limitations of the technology.
        </p>

        <p>
          We recommend using this tool as a <strong>supplementary resource</strong> and encourage
          you to consult our helpdesk and official documentation for critical or complex inquiries.
        </p>

        @if (showBrowserModelInfo()) {
          <div class="model-info">
            <p>
              <strong>Browser-based models:</strong> When using WebLLM or Transformers.js, a
              language model will be downloaded and cached in your browser. The model size varies
              from {{ modelSize() }}. This data stays on your device and is not sent to any
              external servers.
            </p>
          </div>
        }

        @if (showApiInfo()) {
          <div class="api-info">
            <p>
              <strong>API-based models:</strong> When using OpenAI, Anthropic, or Gemini,
              your data is sent to external servers for processing. Please review their
              privacy policies before using these services with sensitive data.
            </p>
          </div>
        }
      </div>

      <div class="disclaimer-actions">
        @if (showDontShowAgain()) {
          <label class="dont-show">
            <input type="checkbox" [(ngModel)]="dontShowAgain" />
            Don't show this again
          </label>
        }
        <button class="btn-primary" (click)="handleAcknowledge()">I Understand</button>
      </div>
    </div>
  `,
  styles: [
    `
      .llm-disclaimer {
        background: var(--warning-bg, #fff8e1);
        border: 1px solid var(--warning-border, #ffe082);
        border-radius: 8px;
        padding: 16px;
        max-width: 600px;
      }

      .llm-disclaimer.compact {
        padding: 12px;
      }

      .llm-disclaimer.compact .disclaimer-content p {
        margin: 6px 0;
        font-size: 13px;
      }

      .disclaimer-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
      }

      .disclaimer-icon {
        color: var(--warning-color, #f57c00);
        flex-shrink: 0;
      }

      h4 {
        margin: 0;
        color: var(--warning-color, #f57c00);
        font-size: 16px;
      }

      .disclaimer-content p {
        margin: 10px 0;
        font-size: 14px;
        line-height: 1.5;
        color: var(--text-color, #333);
      }

      .model-info,
      .api-info {
        background: var(--warning-bg-light, #fff3e0);
        padding: 10px;
        border-radius: 4px;
        margin-top: 12px;
      }

      .model-info p,
      .api-info p {
        margin: 0;
      }

      .disclaimer-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 16px;
        padding-top: 12px;
        border-top: 1px solid var(--warning-border, #ffe082);
      }

      .dont-show {
        font-size: 13px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--text-secondary, #666);
      }

      .dont-show input {
        cursor: pointer;
      }

      .btn-primary {
        background: var(--primary-color, #1976d2);
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
      }

      .btn-primary:hover {
        background: var(--primary-color-dark, #1565c0);
      }
    `,
  ],
})
export class LlmDisclaimerComponent {
  /** Whether to show browser model information */
  showBrowserModelInfo = input(false);

  /** Whether to show API model information */
  showApiInfo = input(false);

  /** Model size to display */
  modelSize = input('400 MB - 2 GB');

  /** Whether to show "Don't show again" checkbox */
  showDontShowAgain = input(true);

  /** Use compact styling */
  compact = input(false);

  /** Emitted when user acknowledges the disclaimer */
  acknowledged = output<boolean>();

  dontShowAgain = false;

  handleAcknowledge(): void {
    if (this.dontShowAgain) {
      localStorage.setItem(STORAGE_KEY, 'true');
    }
    this.acknowledged.emit(true);
  }

  /**
   * Checks if the disclaimer was previously acknowledged.
   */
  static wasAcknowledged(): boolean {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  }

  /**
   * Resets the acknowledged state.
   */
  static resetAcknowledgement(): void {
    localStorage.removeItem(STORAGE_KEY);
  }
}
