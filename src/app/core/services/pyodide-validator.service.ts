/**
 * Pyodide Validator Service
 *
 * Provides sdrf-pipelines validation by running Python code in the browser
 * via Pyodide (WebAssembly). Uses a Web Worker to avoid blocking the UI.
 */

import { Injectable, signal, computed } from '@angular/core';

/**
 * Validation error from sdrf-pipelines
 */
export interface ValidationError {
  message: string;
  row: number;  // 0-based, -1 if not applicable
  column: string | null;
  value: string | null;
  level: 'error' | 'warning';
  suggestion: string | null;
}

/**
 * Template column information
 */
export interface TemplateColumn {
  name: string;
  requirement: 'required' | 'recommended' | 'optional';
  description: string;
}

/**
 * Template details
 */
export interface TemplateDetails {
  name: string;
  description: string;
  version: string;
  extends: string | null;
  columns: TemplateColumn[];
}

/**
 * Service state
 */
export type PyodideState = 'not-loaded' | 'loading' | 'ready' | 'error';

@Injectable({ providedIn: 'root' })
export class PyodideValidatorService {
  private worker: Worker | null = null;
  private messageId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }>();

  // State signals
  readonly state = signal<PyodideState>('not-loaded');
  readonly loadProgress = signal<string>('');
  readonly availableTemplates = signal<string[]>([]);
  readonly lastError = signal<string | null>(null);

  // Computed signals
  readonly isReady = computed(() => this.state() === 'ready');
  readonly isLoading = computed(() => this.state() === 'loading');

  /**
   * Initialize Pyodide runtime.
   * This downloads ~15MB on first load (cached afterwards).
   */
  async initialize(): Promise<void> {
    if (this.state() === 'ready') {
      return; // Already initialized
    }

    if (this.state() === 'loading') {
      // Wait for existing initialization
      return new Promise((resolve, reject) => {
        const checkReady = setInterval(() => {
          if (this.state() === 'ready') {
            clearInterval(checkReady);
            resolve();
          } else if (this.state() === 'error') {
            clearInterval(checkReady);
            reject(new Error(this.lastError() || 'Initialization failed'));
          }
        }, 100);
      });
    }

    this.state.set('loading');
    this.loadProgress.set('Creating worker...');
    this.lastError.set(null);

    try {
      // Create Web Worker
      this.worker = new Worker(
        new URL('../../workers/pyodide.worker', import.meta.url),
        { type: 'module' }
      );

      // Set up message handler
      this.worker.onmessage = (event) => this.handleWorkerMessage(event);
      this.worker.onerror = (error) => this.handleWorkerError(error);

      // Wait for Pyodide to be ready
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Pyodide initialization timed out (60s)'));
        }, 60000);

        const readyHandler = (event: MessageEvent) => {
          const { type, payload } = event.data;

          if (type === 'progress') {
            this.loadProgress.set(payload);
          } else if (type === 'ready') {
            clearTimeout(timeout);
            this.worker?.removeEventListener('message', readyHandler);
            resolve();
          } else if (type === 'error') {
            clearTimeout(timeout);
            this.worker?.removeEventListener('message', readyHandler);
            reject(new Error(payload));
          }
        };

        this.worker?.addEventListener('message', readyHandler);
        this.worker?.postMessage({ type: 'init' });
      });

      this.state.set('ready');
      this.loadProgress.set('Ready');

      // Load available templates
      await this.loadTemplates();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.state.set('error');
      this.lastError.set(errorMessage);
      this.loadProgress.set(`Error: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Load list of available templates from sdrf-pipelines
   */
  private async loadTemplates(): Promise<void> {
    try {
      const templates = await this.sendMessage<string[]>('get-templates', {});
      this.availableTemplates.set(templates);
    } catch (error) {
      console.warn('Failed to load templates:', error);
      // Set default templates as fallback
      this.availableTemplates.set([
        'default',
        'human',
        'vertebrates',
        'nonvertebrates',
        'plants',
        'cell_lines'
      ]);
    }
  }

  /**
   * Validate SDRF content against specified templates
   */
  async validate(
    sdrfTsv: string,
    templates: string[],
    options: { skipOntology?: boolean } = {}
  ): Promise<ValidationError[]> {
    if (!this.isReady()) {
      throw new Error('Pyodide not initialized. Call initialize() first.');
    }

    const errors = await this.sendMessage<ValidationError[]>('validate', {
      sdrf: sdrfTsv,
      templates,
      skipOntology: options.skipOntology ?? true
    });

    return errors;
  }

  /**
   * Get details about a specific template
   */
  async getTemplateDetails(templateName: string): Promise<TemplateDetails | null> {
    if (!this.isReady()) {
      throw new Error('Pyodide not initialized. Call initialize() first.');
    }

    return this.sendMessage<TemplateDetails | null>('get-template-details', {
      template: templateName
    });
  }

  /**
   * Get recommended templates based on SDRF content
   */
  detectTemplates(sdrfTsv: string): string[] {
    const templates: string[] = ['default'];
    const content = sdrfTsv.toLowerCase();

    // Check for organism
    if (content.includes('homo sapiens')) {
      templates.push('human');
    } else if (
      content.includes('mus musculus') ||
      content.includes('rattus') ||
      content.includes('danio rerio')
    ) {
      templates.push('vertebrates');
    } else if (
      content.includes('drosophila') ||
      content.includes('caenorhabditis')
    ) {
      templates.push('nonvertebrates');
    } else if (
      content.includes('arabidopsis') ||
      content.includes('zea mays')
    ) {
      templates.push('plants');
    }

    // Check for cell lines
    if (
      content.includes('characteristics[cell line]') ||
      content.includes('cvcl_')
    ) {
      templates.push('cell_lines');
    }

    return templates;
  }

  /**
   * Send a message to the worker and wait for response
   */
  private sendMessage<T>(type: string, payload: any): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const id = ++this.messageId;
      this.pendingRequests.set(id, { resolve, reject });

      this.worker.postMessage({ type, payload, id });

      // Timeout after 5 minutes for long operations
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timed out'));
        }
      }, 300000);
    });
  }

  /**
   * Handle messages from the worker
   */
  private handleWorkerMessage(event: MessageEvent): void {
    const { type, payload, id } = event.data;

    // Handle responses to pending requests
    if (id !== undefined && this.pendingRequests.has(id)) {
      const { resolve, reject } = this.pendingRequests.get(id)!;
      this.pendingRequests.delete(id);

      if (type === 'error') {
        reject(new Error(payload));
      } else {
        resolve(payload);
      }
      return;
    }

    // Handle broadcast messages
    switch (type) {
      case 'progress':
        this.loadProgress.set(payload);
        break;
      case 'templates':
        this.availableTemplates.set(payload);
        break;
      case 'error':
        console.error('Pyodide worker error:', payload);
        this.lastError.set(payload);
        break;
    }
  }

  /**
   * Handle worker errors
   */
  private handleWorkerError(error: ErrorEvent): void {
    console.error('Pyodide worker error:', error);
    this.lastError.set(error.message || 'Unknown worker error');
    this.state.set('error');
  }

  /**
   * Terminate the worker and clean up
   */
  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.state.set('not-loaded');
    this.pendingRequests.clear();
  }
}

// Export singleton instance
export const pyodideValidatorService = new PyodideValidatorService();
