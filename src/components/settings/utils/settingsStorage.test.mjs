import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_CLAUDE_ALLOWED_TOOLS,
  DEFAULT_CLAUDE_PERMISSIONS,
  mergeClaudeSettingsForSave,
  normalizeMainTab,
  readClaudePermissions,
} from './settingsStorage.ts';

test('normalizeMainTab keeps the agents tab available', () => {
  assert.equal(normalizeMainTab('agents'), 'agents');
});

test('normalizeMainTab falls back deprecated tools tab to agents', () => {
  assert.equal(normalizeMainTab('tools'), 'agents');
});

test('mergeClaudeSettingsForSave preserves existing permission settings', () => {
  const merged = mergeClaudeSettingsForSave(
    {
      allowedTools: ['AskUserQuestion'],
      disallowedTools: ['Bash(rm:*)'],
      permissionMode: 'bypassPermissions',
    },
    {
      projectSortOrder: 'date',
      lastUpdated: '2026-04-12T00:00:00.000Z',
    },
  );

  assert.deepEqual(merged, {
    allowedTools: ['AskUserQuestion'],
    disallowedTools: ['Bash(rm:*)'],
    permissionMode: 'bypassPermissions',
    projectSortOrder: 'date',
    lastUpdated: '2026-04-12T00:00:00.000Z',
  });
});

test('readClaudePermissions returns the default Claude permissions when no settings exist', () => {
  assert.deepEqual(readClaudePermissions(null), DEFAULT_CLAUDE_PERMISSIONS);
});

test('readClaudePermissions preserves saved permission settings when present', () => {
  const settings = JSON.stringify({
    allowedTools: ['Read'],
    disallowedTools: ['Bash(rm:*)'],
    permissionMode: 'default',
  });

  assert.deepEqual(readClaudePermissions(settings), {
    allowedTools: ['Read'],
    disallowedTools: ['Bash(rm:*)'],
    permissionMode: 'default',
  });
});

test('default Claude permissions preload common allowed tools and set a default permission mode', () => {
  assert.equal(DEFAULT_CLAUDE_PERMISSIONS.permissionMode, 'bypassPermissions');
  assert.deepEqual(DEFAULT_CLAUDE_PERMISSIONS.allowedTools, DEFAULT_CLAUDE_ALLOWED_TOOLS);
  assert.deepEqual(DEFAULT_CLAUDE_PERMISSIONS.disallowedTools, []);
});
