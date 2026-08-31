import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const wizardSource = readFileSync(
  new URL('./sdrf-wizard.component.ts', import.meta.url),
  'utf8'
);
const assistantSource = readFileSync(
  new URL('../wizard-ai-panel/wizard-ai-panel.component.ts', import.meta.url),
  'utf8'
);

describe('wizard mobile layout contract', () => {
  it('switches the wizard and assistant to one pane below 1024px', () => {
    assert.match(wizardSource, /@media \(max-width: 1023px\)/);
    assert.match(wizardSource, /\.wizard-shell\.ai-open \.wizard-container \{ display: none; \}/);
    assert.match(wizardSource, /window\.matchMedia\('\(max-width: 1023px\)'\)\.matches/);
  });

  it('makes the assistant full-screen and removes desktop-only controls', () => {
    assert.match(assistantSource, /@media \(max-width: 1023px\)/);
    assert.match(assistantSource, /width: 100% !important/);
    assert.match(assistantSource, /\.resizer \{ display: none; \}/);
    assert.match(assistantSource, /\.collapse-btn \{ display: none; \}/);
  });

  it('does not discard the draft from a backdrop click', () => {
    assert.doesNotMatch(wizardSource, /wizard-overlay" \(click\)=/);
  });
});
