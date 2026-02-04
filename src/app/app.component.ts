/**
 * SDRF Editor App Component
 *
 * Main application component that hosts the SDRF editor.
 */

import { Component, OnInit, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SdrfEditorComponent } from './components/sdrf-editor/sdrf-editor.component';

@Component({
  selector: 'sdrf-editor',
  standalone: true,
  imports: [FormsModule, SdrfEditorComponent],
  template: `
    <div class="app-container">
      <main class="app-main">
        <sdrf-editor-table
          [url]="activeUrl"
          [exampleUrl]="exampleUrl"
          (tableChange)="onTableChange($event)"
          (validationComplete)="onValidation($event)"
          (loadUrlRequested)="onLoadUrlRequested($event)"
          (loadExampleRequested)="onLoadExampleRequested()"
        ></sdrf-editor-table>
      </main>
    </div>
  `,
  styles: [`
    .app-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    .app-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    sdrf-editor-table {
      display: block;
      height: 100%;
    }
  `]
})
export class AppComponent implements OnInit {
  activeUrl = '';

  // Example SDRF from proteomics-metadata-standard
  readonly exampleUrl = 'https://raw.githubusercontent.com/bigbio/proteomics-metadata-standard/master/annotated-projects/PXD000070/PXD000070.sdrf.tsv';

  ngOnInit(): void {
    // Check for URL parameter to auto-load SDRF file
    const urlParams = new URLSearchParams(window.location.search);
    const urlParam = urlParams.get('url');
    if (urlParam) {
      this.activeUrl = urlParam;
    }
  }

  onLoadUrlRequested(url: string): void {
    if (url) {
      this.activeUrl = url;
    }
  }

  onLoadExampleRequested(): void {
    this.activeUrl = this.exampleUrl;
  }

  onTableChange(table: unknown): void {
    console.log('Table changed:', table);
  }

  onValidation(result: unknown): void {
    console.log('Validation result:', result);
  }
}
