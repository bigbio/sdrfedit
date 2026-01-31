/**
 * SDRF Editor App Component
 *
 * Main application component that hosts the SDRF editor.
 */

import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SdrfEditorComponent } from './components/sdrf-editor/sdrf-editor.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule, SdrfEditorComponent],
  template: `
    <div class="app-container">
      <header class="app-header">
        <h1>SDRF Editor</h1>
        <p>Standalone SDRF (Sample and Data Relationship Format) editor for proteomics metadata</p>
      </header>

      <main class="app-main">
        <div class="app-controls">
          <label>
            Load from URL:
            <input
              type="text"
              [(ngModel)]="sdrfUrl"
              placeholder="Enter SDRF URL..."
              class="url-input"
            />
          </label>
          <button (click)="loadUrl()" class="btn btn-primary">Load</button>
          <button (click)="loadSample()" class="btn btn-secondary">Load Sample</button>
        </div>

        <div class="editor-wrapper">
          <sdrf-editor
            [url]="activeUrl"
            (tableChange)="onTableChange($event)"
            (validationComplete)="onValidation($event)"
          ></sdrf-editor>
        </div>
      </main>
    </div>
  `,
  styles: [`
    .app-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    .app-header {
      padding: 16px 24px;
      background: #1a1a2e;
      color: white;
    }

    .app-header h1 {
      margin: 0 0 4px 0;
      font-size: 24px;
    }

    .app-header p {
      margin: 0;
      opacity: 0.8;
      font-size: 14px;
    }

    .app-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .app-controls {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 24px;
      background: #f5f5f5;
      border-bottom: 1px solid #ddd;
    }

    .app-controls label {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
    }

    .url-input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 14px;
    }

    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .btn-primary {
      background: #0066cc;
      color: white;
    }

    .btn-primary:hover {
      background: #0055aa;
    }

    .btn-secondary {
      background: #6c757d;
      color: white;
    }

    .btn-secondary:hover {
      background: #5a6268;
    }

    .editor-wrapper {
      flex: 1;
      overflow: hidden;
    }

    sdrf-editor {
      display: block;
      height: 100%;
    }
  `]
})
export class AppComponent {
  sdrfUrl = '';
  activeUrl = '';

  // Sample SDRF from proteomics-metadata-standard
  readonly sampleUrl = 'https://raw.githubusercontent.com/bigbio/proteomics-metadata-standard/master/annotated-projects/PXD000612/sdrf.tsv';

  loadUrl(): void {
    if (this.sdrfUrl) {
      this.activeUrl = this.sdrfUrl;
    }
  }

  loadSample(): void {
    this.sdrfUrl = this.sampleUrl;
    this.activeUrl = this.sampleUrl;
  }

  onTableChange(table: unknown): void {
    console.log('Table changed:', table);
  }

  onValidation(result: unknown): void {
    console.log('Validation result:', result);
  }
}
