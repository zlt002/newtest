import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizePersistedAppTab } from './activeTabPersistence.ts';

test('normalizePersistedAppTab keeps supported tabs', () => {
  assert.equal(normalizePersistedAppTab('chat'), 'chat');
  assert.equal(normalizePersistedAppTab('preview'), 'preview');
});

test('normalizePersistedAppTab migrates deprecated right-pane tabs back to chat', () => {
  assert.equal(normalizePersistedAppTab('files'), 'chat');
  assert.equal(normalizePersistedAppTab('git'), 'chat');
});

test('normalizePersistedAppTab falls back to chat for unknown values', () => {
  assert.equal(normalizePersistedAppTab('tasks'), 'chat');
  assert.equal(normalizePersistedAppTab(''), 'chat');
  assert.equal(normalizePersistedAppTab(null), 'chat');
});
