import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveTokenUsageProjectName } from './tokenUsageRequest.ts';

test('resolveTokenUsageProjectName uses the selected project when the session has no explicit owner', () => {
  assert.equal(
    resolveTokenUsageProjectName({
      selectedProjectName: 'demo-project',
      sessionProjectName: '',
    }),
    'demo-project',
  );
});

test('resolveTokenUsageProjectName keeps the shared project when session and selection match', () => {
  assert.equal(
    resolveTokenUsageProjectName({
      selectedProjectName: 'demo-project',
      sessionProjectName: 'demo-project',
    }),
    'demo-project',
  );
});

test('resolveTokenUsageProjectName returns null for transient mismatches between project and session', () => {
  assert.equal(
    resolveTokenUsageProjectName({
      selectedProjectName: 'downloads',
      sessionProjectName: 'release',
    }),
    null,
  );
});
