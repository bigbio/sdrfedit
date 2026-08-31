import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveAssistantNavigation } from './wizard-navigation.ts';

describe('resolveAssistantNavigation', () => {
  it('allows the adjacent next step after validation', () => {
    assert.equal(resolveAssistantNavigation(1, 2, true, 6), 'next');
  });

  it('blocks the adjacent next step when validation fails', () => {
    assert.equal(resolveAssistantNavigation(1, 2, false, 6), 'stay');
  });

  it('allows returning to the current or an earlier step', () => {
    assert.equal(resolveAssistantNavigation(3, 3, false, 6), 'back');
    assert.equal(resolveAssistantNavigation(3, 1, false, 6), 'back');
  });

  it('blocks skipped and out-of-range steps', () => {
    assert.equal(resolveAssistantNavigation(1, 4, true, 6), 'stay');
    assert.equal(resolveAssistantNavigation(1, -1, true, 6), 'stay');
    assert.equal(resolveAssistantNavigation(1, 6, true, 6), 'stay');
  });
});
