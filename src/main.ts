/**
 * SDRF Editor Application
 *
 * Standalone SDRF (Sample and Data Relationship Format) editor
 * for proteomics metadata editing in the browser.
 */

import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: []
}).catch(err => console.error(err));
