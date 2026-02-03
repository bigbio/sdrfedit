/**
 * LLM Settings Dialog Component
 *
 * Provides UI for configuring LLM providers and managing API keys.
 * Features:
 * - Provider selection (OpenAI, Anthropic, Gemini, Ollama)
 * - API key management with consent flow
 * - Model selection
 * - Connection testing
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  computed,
  ChangeDetectionStrategy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  LlmProviderType,
  LlmProviderConfig,
  AVAILABLE_MODELS,
  DEFAULT_PROVIDER_CONFIGS,
  getProviderDisplayName,
  providerRequiresApiKey,
} from '../../core/models/llm';
import {
  LlmSettingsService,
  llmSettingsService,
} from '../../core/services/llm/settings.service';
import { RecommendationService, recommendationService } from '../../core/services/llm/recommendation.service';

/**
 * Provider option for the dropdown.
 */
interface ProviderOption {
  value: LlmProviderType;
  label: string;
  requiresKey: boolean;
}

/**
 * LLM Settings Dialog Component.
 */
@Component({
  selector: 'llm-settings-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="settings-dialog-overlay" (click)="onOverlayClick($event)">
      <div class="settings-dialog" (click)="$event.stopPropagation()">
        <div class="dialog-header">
          <h2>AI Assistant Settings</h2>
          <button class="btn-close" (click)="close.emit()" title="Close">×</button>
        </div>

        <div class="dialog-body">
          <!-- Provider Selection -->
          <div class="form-section">
            <label class="form-label">AI Provider</label>
            <div class="provider-cards">
              @for (provider of providerOptions; track provider.value) {
                <button
                  class="provider-card"
                  [class.selected]="selectedProvider() === provider.value"
                  (click)="selectProvider(provider.value)"
                >
                  <span class="provider-name">{{ provider.label }}</span>
                  @if (!provider.requiresKey) {
                    <span class="provider-badge">Local</span>
                  }
                </button>
              }
            </div>
          </div>

          <!-- API Key Section (for cloud providers) -->
          @if (requiresApiKey()) {
            <div class="form-section">
              <label class="form-label">
                API Key
                @if (!hasApiKey()) {
                  <span class="required">*</span>
                }
              </label>

              <!-- Consent notice (show once) -->
              @if (!hasStorageConsent() && !consentShown()) {
                <div class="consent-notice">
                  <p>
                    Your API key will be used to make direct requests from your browser
                    to {{ getProviderDisplayName(selectedProvider()) }}.
                  </p>
                  <p>
                    <strong>Storage options:</strong>
                  </p>
                  <div class="consent-options">
                    <button
                      class="btn btn-secondary"
                      (click)="setStorageConsent('session')"
                    >
                      Session Only
                      <span class="btn-hint">Cleared when you close the browser</span>
                    </button>
                    <button
                      class="btn btn-primary"
                      (click)="setStorageConsent('persistent')"
                    >
                      Remember (Encrypted)
                      <span class="btn-hint">Stored securely in your browser</span>
                    </button>
                  </div>
                </div>
              } @else {
                <div class="api-key-input">
                  <input
                    type="password"
                    [value]="apiKeyDisplay()"
                    (input)="onApiKeyInput($event)"
                    placeholder="Enter your API key"
                    class="form-input"
                    [class.has-value]="hasApiKey()"
                  />
                  @if (hasApiKey()) {
                    <button
                      class="btn-icon"
                      (click)="clearApiKey()"
                      title="Clear API key"
                    >
                      ×
                    </button>
                  }
                </div>
                <p class="form-hint">
                  @if (hasStorageConsent() && storageMode() === 'persistent') {
                    Your key is encrypted and stored in your browser.
                  } @else {
                    Your key will be cleared when you close this tab.
                  }
                  <button class="link-btn" (click)="resetConsent()">Change storage</button>
                </p>
              }
            </div>
          }

          <!-- Ollama Status (for local provider) -->
          @if (selectedProvider() === 'ollama') {
            <div class="form-section">
              <label class="form-label">Ollama Status</label>
              <div class="ollama-status">
                @if (ollamaChecking()) {
                  <span class="status-checking">Checking connection...</span>
                } @else if (ollamaRunning()) {
                  <span class="status-ok">
                    Connected to Ollama
                    @if (ollamaModels().length > 0) {
                      ({{ ollamaModels().length }} models available)
                    }
                  </span>
                  <button
                    class="btn btn-sm btn-refresh"
                    (click)="refreshOllamaModels()"
                    [disabled]="ollamaChecking()"
                    title="Refresh model list"
                  >
                    Refresh Models
                  </button>
                } @else {
                  <div class="ollama-not-found">
                    <div class="status-error">
                      Cannot connect to Ollama at {{ ollamaUrl() }}
                    </div>
                    <div class="install-instructions">
                      <p><strong>To use Ollama:</strong></p>
                      <ol>
                        <li>
                          <strong>Install Ollama:</strong>
                          <a href="https://ollama.ai/download" target="_blank">Download from ollama.ai</a>
                          <div class="install-commands">
                            <code>macOS/Linux: curl -fsSL https://ollama.ai/install.sh | sh</code>
                          </div>
                        </li>
                        <li>
                          <strong>Pull a model:</strong>
                          <div class="install-commands">
                            <code>ollama pull llama3.2</code>
                          </div>
                        </li>
                        <li>
                          <strong>Start Ollama:</strong> Run the Ollama app or use
                          <code class="inline-code">ollama serve</code>
                        </li>
                      </ol>
                    </div>
                    <button
                      class="btn btn-sm"
                      (click)="refreshOllamaModels()"
                      [disabled]="ollamaChecking()"
                    >
                      Retry Connection
                    </button>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Model Selection -->
          <div class="form-section">
            <label class="form-label">Model</label>
            <select
              class="form-select"
              [value]="selectedModel()"
              (change)="onModelChange($event)"
            >
              @for (model of availableModels(); track model) {
                <option [value]="model">{{ model }}</option>
              }
            </select>
            <p class="form-hint">
              @switch (selectedProvider()) {
                @case ('openai') {
                  GPT-4o is recommended for best results.
                }
                @case ('anthropic') {
                  Claude Sonnet is recommended for balanced speed and quality.
                }
                @case ('gemini') {
                  Gemini Flash offers fast responses.
                }
                @case ('ollama') {
                  Llama 3 models work well for this task.
                }
              }
            </p>
          </div>

          <!-- Advanced Settings -->
          <details class="advanced-settings">
            <summary>Advanced Settings</summary>
            <div class="form-section">
              <label class="form-label">Temperature</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                [value]="temperature()"
                (input)="onTemperatureChange($event)"
                class="form-range"
              />
              <span class="range-value">{{ temperature() }}</span>
              <p class="form-hint">
                Lower values produce more focused responses. Higher values increase creativity.
              </p>
            </div>

            @if (selectedProvider() === 'ollama') {
              <div class="form-section">
                <label class="form-label">Ollama URL</label>
                <input
                  type="text"
                  [value]="ollamaUrl()"
                  (input)="onOllamaUrlChange($event)"
                  placeholder="http://localhost:11434"
                  class="form-input"
                />
              </div>
            }
          </details>

          <!-- Connection Test -->
          <div class="form-section">
            <button
              class="btn btn-secondary btn-test"
              [disabled]="!canTest() || testing()"
              (click)="testConnection()"
            >
              @if (testing()) {
                Testing...
              } @else {
                Test Connection
              }
            </button>
            @if (testResult()) {
              <span
                class="test-result"
                [class.success]="testResult()!.success"
                [class.error]="!testResult()!.success"
              >
                @if (testResult()!.success) {
                  Connection successful
                } @else {
                  {{ testResult()!.error }}
                }
              </span>
            }
          </div>
        </div>

        <div class="dialog-footer">
          <button class="btn btn-secondary" (click)="close.emit()">Cancel</button>
          <button
            class="btn btn-primary"
            [disabled]="!isConfigValid()"
            (click)="saveAndClose()"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .settings-dialog-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.15s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .settings-dialog {
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      width: 100%;
      max-width: 520px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      animation: slideUp 0.2s ease-out;
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 24px;
      border-bottom: 1px solid #e5e7eb;
    }

    .dialog-header h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }

    .btn-close {
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #6b7280;
      padding: 0;
      line-height: 1;
    }

    .btn-close:hover {
      color: #374151;
    }

    .dialog-body {
      padding: 24px;
      overflow-y: auto;
      flex: 1;
    }

    .dialog-footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 16px 24px;
      border-top: 1px solid #e5e7eb;
      background: #f9fafb;
      border-radius: 0 0 12px 12px;
    }

    .form-section {
      margin-bottom: 20px;
    }

    .form-label {
      display: block;
      font-size: 14px;
      font-weight: 500;
      color: #374151;
      margin-bottom: 8px;
    }

    .form-label .required {
      color: #ef4444;
    }

    .form-input,
    .form-select {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
      transition: border-color 0.15s, box-shadow 0.15s;
    }

    .form-input:focus,
    .form-select:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .form-input.has-value {
      background: #f0fdf4;
      border-color: #22c55e;
    }

    .form-hint {
      font-size: 12px;
      color: #6b7280;
      margin-top: 6px;
    }

    .provider-cards {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }

    .provider-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 16px 12px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      background: white;
      cursor: pointer;
      transition: all 0.15s;
    }

    .provider-card:hover {
      border-color: #d1d5db;
      background: #f9fafb;
    }

    .provider-card.selected {
      border-color: #3b82f6;
      background: #eff6ff;
    }

    .provider-name {
      font-size: 14px;
      font-weight: 500;
    }

    .provider-badge {
      font-size: 10px;
      color: #059669;
      background: #d1fae5;
      padding: 2px 6px;
      border-radius: 4px;
      margin-top: 4px;
    }

    .consent-notice {
      background: #fef3c7;
      border: 1px solid #fcd34d;
      border-radius: 8px;
      padding: 16px;
    }

    .consent-notice p {
      margin: 0 0 12px 0;
      font-size: 13px;
      color: #92400e;
    }

    .consent-options {
      display: flex;
      gap: 10px;
    }

    .consent-options .btn {
      flex: 1;
      flex-direction: column;
      padding: 12px;
    }

    .btn-hint {
      display: block;
      font-size: 11px;
      font-weight: normal;
      opacity: 0.8;
      margin-top: 4px;
    }

    .api-key-input {
      display: flex;
      gap: 8px;
    }

    .api-key-input .form-input {
      flex: 1;
    }

    .btn-icon {
      padding: 10px 14px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: white;
      cursor: pointer;
      font-size: 16px;
      color: #6b7280;
    }

    .btn-icon:hover {
      background: #f3f4f6;
      color: #374151;
    }

    .link-btn {
      background: none;
      border: none;
      color: #3b82f6;
      cursor: pointer;
      font-size: 12px;
      padding: 0;
      text-decoration: underline;
    }

    .link-btn:hover {
      color: #2563eb;
    }

    .ollama-status {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      padding: 12px;
      border-radius: 6px;
      font-size: 13px;
    }

    .status-checking {
      color: #6b7280;
    }

    .status-ok {
      color: #059669;
      background: #d1fae5;
      padding: 8px 12px;
      border-radius: 6px;
      flex: 1;
    }

    .status-error {
      color: #dc2626;
      background: #fee2e2;
      padding: 8px 12px;
      border-radius: 6px;
      flex: 1;
    }

    .status-error a {
      color: #dc2626;
    }

    .btn-sm {
      padding: 6px 12px;
      font-size: 12px;
    }

    .btn-refresh {
      background: #ecfdf5;
      border-color: #059669;
      color: #059669;
    }

    .btn-refresh:hover:not(:disabled) {
      background: #d1fae5;
    }

    .form-range {
      width: calc(100% - 50px);
      vertical-align: middle;
    }

    .range-value {
      display: inline-block;
      width: 40px;
      text-align: right;
      font-size: 13px;
      color: #6b7280;
    }

    .advanced-settings {
      margin-top: 20px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
    }

    .advanced-settings summary {
      padding: 12px 16px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      color: #6b7280;
    }

    .advanced-settings[open] summary {
      border-bottom: 1px solid #e5e7eb;
    }

    .advanced-settings .form-section {
      padding: 16px;
      margin-bottom: 0;
    }

    .btn-test {
      margin-right: 12px;
    }

    .test-result {
      font-size: 13px;
    }

    .test-result.success {
      color: #059669;
    }

    .test-result.error {
      color: #dc2626;
    }

    .btn {
      padding: 10px 20px;
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

    .ollama-not-found {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 16px;
    }

    .ollama-not-found .status-error {
      background: none;
      padding: 0;
      margin-bottom: 12px;
      flex: none;
    }

    .install-instructions {
      font-size: 13px;
      color: #374151;
      margin-bottom: 12px;
    }

    .install-instructions p {
      margin: 0 0 8px 0;
    }

    .install-instructions ol {
      margin: 0;
      padding-left: 20px;
    }

    .install-instructions li {
      margin-bottom: 10px;
      line-height: 1.5;
    }

    .install-instructions a {
      color: #2563eb;
    }

    .install-commands {
      margin-top: 4px;
    }

    .install-commands code {
      display: block;
      background: #1f2937;
      color: #e5e7eb;
      padding: 8px 12px;
      border-radius: 4px;
      font-family: ui-monospace, monospace;
      font-size: 12px;
      overflow-x: auto;
    }

    .inline-code {
      display: inline !important;
      background: #e5e7eb;
      color: #1f2937;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: ui-monospace, monospace;
      font-size: 12px;
    }
  `],
})
export class LlmSettingsDialogComponent implements OnInit {
  @Input() isOpen = true;
  @Output() close = new EventEmitter<void>();
  @Output() settingsSaved = new EventEmitter<void>();

  // Provider options
  readonly providerOptions: ProviderOption[] = [
    { value: 'openai', label: 'OpenAI', requiresKey: true },
    { value: 'anthropic', label: 'Anthropic', requiresKey: true },
    { value: 'gemini', label: 'Google Gemini', requiresKey: true },
    { value: 'ollama', label: 'Ollama', requiresKey: false },
  ];

  // State signals
  readonly selectedProvider = signal<LlmProviderType>('openai');
  readonly selectedModel = signal<string>('gpt-4o-mini');
  readonly temperature = signal<number>(0.3);
  readonly ollamaUrl = signal<string>('http://localhost:11434');
  readonly apiKey = signal<string>('');
  readonly hasApiKey = signal<boolean>(false);
  readonly consentShown = signal<boolean>(false);
  readonly testing = signal<boolean>(false);
  readonly testResult = signal<{ success: boolean; error?: string } | null>(null);
  readonly ollamaChecking = signal<boolean>(false);
  readonly ollamaRunning = signal<boolean>(false);
  readonly ollamaModels = signal<string[]>([]);

  // Services
  private settingsService: LlmSettingsService;
  private recommendationService: RecommendationService;

  constructor() {
    this.settingsService = llmSettingsService;
    this.recommendationService = recommendationService;
  }

  // Computed
  readonly availableModels = computed(() => {
    const provider = this.selectedProvider();
    if (provider === 'ollama') {
      // Use dynamically fetched Ollama models, fall back to static list
      const dynamicModels = this.ollamaModels();
      return dynamicModels.length > 0 ? dynamicModels : AVAILABLE_MODELS.ollama;
    }
    return AVAILABLE_MODELS[provider] || [];
  });

  readonly requiresApiKey = computed(() => {
    return providerRequiresApiKey(this.selectedProvider());
  });

  readonly apiKeyDisplay = computed(() => {
    if (this.hasApiKey() && !this.apiKey()) {
      return '••••••••••••••••';
    }
    return this.apiKey();
  });

  ngOnInit(): void {
    this.loadSettings();
  }

  // ============ Public Methods ============

  hasStorageConsent(): boolean {
    return this.settingsService.hasStorageConsent();
  }

  storageMode(): 'persistent' | 'session' {
    return this.settingsService.getSettings().storageMode;
  }

  getProviderDisplayName(provider: LlmProviderType): string {
    return getProviderDisplayName(provider);
  }

  selectProvider(provider: LlmProviderType): void {
    this.selectedProvider.set(provider);
    this.testResult.set(null);

    // Set default model
    const models = AVAILABLE_MODELS[provider];
    this.selectedModel.set(models[0]);

    // Load saved config for this provider
    const config = this.settingsService.getProviderConfig(provider);
    if (config) {
      this.selectedModel.set(config.model);
      this.temperature.set(config.temperature || 0.3);
      if (provider === 'ollama' && config.baseUrl) {
        this.ollamaUrl.set(config.baseUrl);
      }
    } else {
      // Use defaults
      const defaults = DEFAULT_PROVIDER_CONFIGS[provider];
      this.temperature.set(defaults.temperature || 0.3);
      if (provider === 'ollama') {
        this.ollamaUrl.set(defaults.baseUrl || 'http://localhost:11434');
      }
    }

    // Load API key status
    this.loadApiKeyStatus();

    // Check Ollama status if selected
    if (provider === 'ollama') {
      this.checkOllamaStatus();
    }
  }

  async setStorageConsent(mode: 'persistent' | 'session'): Promise<void> {
    await this.settingsService.setStorageConsent(true, mode);
    this.consentShown.set(true);
  }

  resetConsent(): void {
    this.consentShown.set(false);
  }

  onApiKeyInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.apiKey.set(input.value);
    this.testResult.set(null);
  }

  async clearApiKey(): Promise<void> {
    await this.settingsService.clearApiKey(this.selectedProvider());
    this.apiKey.set('');
    this.hasApiKey.set(false);
    this.testResult.set(null);
  }

  onModelChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.selectedModel.set(select.value);
  }

  onTemperatureChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.temperature.set(parseFloat(input.value));
  }

  onOllamaUrlChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.ollamaUrl.set(input.value);
  }

  canTest(): boolean {
    const provider = this.selectedProvider();
    // Ollama doesn't need API key
    if (provider === 'ollama') {
      return true;
    }
    return this.hasApiKey() || this.apiKey().length > 0;
  }

  isConfigValid(): boolean {
    const provider = this.selectedProvider();
    // Ollama doesn't need API key
    if (provider === 'ollama') {
      return true;
    }
    return this.hasApiKey() || this.apiKey().length > 0;
  }

  async testConnection(): Promise<void> {
    this.testing.set(true);
    this.testResult.set(null);

    try {
      // Save current settings first
      await this.saveSettings();

      // Test connection
      const result = await this.recommendationService.testConnection();
      this.testResult.set(result);
    } catch (error) {
      this.testResult.set({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      this.testing.set(false);
    }
  }

  async saveAndClose(): Promise<void> {
    await this.saveSettings();
    this.settingsSaved.emit();
    this.close.emit();
  }

  onOverlayClick(event: Event): void {
    if (event.target === event.currentTarget) {
      this.close.emit();
    }
  }

  // ============ Private Methods ============

  private loadSettings(): void {
    const settings = this.settingsService.getSettings();
    this.selectedProvider.set(settings.activeProvider);
    this.consentShown.set(settings.storageConsent);

    // Load provider config
    const config = this.settingsService.getProviderConfig(settings.activeProvider);
    if (config) {
      this.selectedModel.set(config.model);
      this.temperature.set(config.temperature || 0.3);
      if (settings.activeProvider === 'ollama' && config.baseUrl) {
        this.ollamaUrl.set(config.baseUrl);
      }
    }

    // Load API key status
    this.loadApiKeyStatus();

    // Check Ollama if selected
    if (settings.activeProvider === 'ollama') {
      this.checkOllamaStatus();
    }
  }

  private async loadApiKeyStatus(): Promise<void> {
    const key = await this.settingsService.getApiKey(this.selectedProvider());
    this.hasApiKey.set(!!key);
    this.apiKey.set(''); // Don't display actual key
  }

  private async saveSettings(): Promise<void> {
    const provider = this.selectedProvider();

    // Set active provider
    this.settingsService.setActiveProvider(provider);

    // Save provider config
    const config: Partial<LlmProviderConfig> = {
      model: this.selectedModel(),
      temperature: this.temperature(),
    };

    if (provider === 'ollama') {
      config.baseUrl = this.ollamaUrl();
    }

    await this.settingsService.setProviderConfig(provider, config);

    // Save API key if provided
    if (this.apiKey()) {
      await this.settingsService.setApiKey(provider, this.apiKey());
      this.hasApiKey.set(true);
    }
  }

  private async checkOllamaStatus(): Promise<void> {
    this.ollamaChecking.set(true);

    try {
      const response = await fetch(`${this.ollamaUrl()}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        this.ollamaRunning.set(true);

        // Parse the response to get available models
        const data = await response.json();
        if (data.models && Array.isArray(data.models)) {
          const modelNames = data.models.map((m: { name: string }) => m.name);
          this.ollamaModels.set(modelNames);

          // If current model is not in the list, select the first available
          const currentModel = this.selectedModel();
          if (modelNames.length > 0 && !modelNames.includes(currentModel)) {
            this.selectedModel.set(modelNames[0]);
          }
        }
      } else {
        this.ollamaRunning.set(false);
        this.ollamaModels.set([]);
      }
    } catch {
      this.ollamaRunning.set(false);
      this.ollamaModels.set([]);
    } finally {
      this.ollamaChecking.set(false);
    }
  }

  refreshOllamaModels(): void {
    this.checkOllamaStatus();
  }
}
