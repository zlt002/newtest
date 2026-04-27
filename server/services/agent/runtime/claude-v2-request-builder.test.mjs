import test from 'node:test';
import assert from 'node:assert/strict';

import { buildClaudeV2RuntimeOptions } from './claude-v2-request-builder.js';

test('runtime options enable native Claude settings sources for skill loading by default', () => {
  const options = buildClaudeV2RuntimeOptions({
    projectPath: '/tmp/project',
  });

  assert.deepEqual(options.settingSources, ['user', 'project', 'local']);
});

test('runtime options keep explicit plugin and settings payloads for native skill resolution', () => {
  const options = buildClaudeV2RuntimeOptions({
    projectPath: '/tmp/project',
    plugins: [{ type: 'local', path: '/tmp/plugin' }],
    settings: { disableSkillShellExecution: true },
  });

  assert.deepEqual(options.plugins, [{ type: 'local', path: '/tmp/plugin' }]);
  assert.deepEqual(options.settings, { disableSkillShellExecution: true });
});

test('runtime options ignore mcpEnabled in favor of the SDK defaults', () => {
  const options = buildClaudeV2RuntimeOptions({
    projectPath: '/tmp/project',
    mcpEnabled: false,
  });

  assert.equal('mcpEnabled' in options, false);
  assert.deepEqual(options.settingSources, ['user', 'project', 'local']);
});

test('runtime options filter invalid plugin entries while preserving valid plugins', () => {
  const plugins = [null, false, { type: 'local', path: '/tmp/plugin' }];
  const options = buildClaudeV2RuntimeOptions({
    projectPath: '/tmp/project',
    plugins,
  });

  assert.deepEqual(options.plugins, [{ type: 'local', path: '/tmp/plugin' }]);
});

test('runtime options preserve hooks for native SDK session injection', () => {
  const hooks = {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre' }] }],
  };

  const options = buildClaudeV2RuntimeOptions({
    projectPath: '/tmp/project',
    hooks,
  });

  assert.deepEqual(options.hooks, hooks);
});

test('runtime options isolate plugin settings and hooks objects from caller mutations', () => {
  const plugins = [{ type: 'local', path: '/tmp/plugin', meta: { source: 'user' } }];
  const settings = { disableSkillShellExecution: true, nested: { mode: 'strict' } };
  const hooks = {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre' }] }],
  };

  const options = buildClaudeV2RuntimeOptions({
    projectPath: '/tmp/project',
    plugins,
    settings,
    hooks,
  });

  plugins[0].path = '/tmp/changed';
  plugins[0].meta.source = 'sdk';
  settings.disableSkillShellExecution = false;
  settings.nested.mode = 'loose';
  hooks.PreToolUse[0].matcher = 'Edit';
  hooks.PreToolUse[0].hooks[0].command = 'echo changed';

  assert.deepEqual(options.plugins, [{ type: 'local', path: '/tmp/plugin', meta: { source: 'user' } }]);
  assert.deepEqual(options.settings, { disableSkillShellExecution: true, nested: { mode: 'strict' } });
  assert.deepEqual(options.hooks, {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre' }] }],
  });
});

test('runtime options ignore invalid hooks payloads', () => {
  const arrayOptions = buildClaudeV2RuntimeOptions({
    projectPath: '/tmp/project',
    hooks: [],
  });
  const stringOptions = buildClaudeV2RuntimeOptions({
    projectPath: '/tmp/project',
    hooks: 'invalid',
  });

  assert.equal(arrayOptions.hooks, undefined);
  assert.equal(stringOptions.hooks, undefined);
});

test('runtime options fall back to default setting sources when filtered array is empty', () => {
  const options = buildClaudeV2RuntimeOptions({
    projectPath: '/tmp/project',
    settingSources: [' ', null],
  });

  assert.deepEqual(options.settingSources, ['user', 'project', 'local']);
});

test('buildClaudeV2RuntimeOptions preserves local skipPermissions without escalating to bypass', () => {
  const options = buildClaudeV2RuntimeOptions({
    model: ' sonnet ',
    projectPath: ' /Users/demo/project ',
    env: {
      PATH: '/usr/bin',
    },
    settingsEnv: {},
    toolsSettings: {
      allowedTools: ['Read', ''],
      disallowedTools: ['Bash(rm -rf /:*)'],
      skipPermissions: true,
      ignoredFlag: true,
    },
  });

  assert.deepEqual(options, {
    model: 'sonnet',
    cwd: '/Users/demo/project',
    env: {
      PATH: '/usr/bin',
    },
    toolsSettings: {
      allowedTools: ['Read'],
      disallowedTools: ['Bash(rm -rf /:*)'],
      skipPermissions: true,
    },
    settingSources: ['user', 'project', 'local'],
  });
});

test('buildClaudeV2RuntimeOptions keeps bypassPermissions explicit and normalized', () => {
  const options = buildClaudeV2RuntimeOptions({
    model: 'opus',
    env: {},
    settingsEnv: {},
    permissionMode: 'bypassPermissions',
  });

  assert.deepEqual(options, {
    model: 'opus',
    env: {},
    permissionMode: 'bypassPermissions',
    settingSources: ['user', 'project', 'local'],
  });
});

test('buildClaudeV2RuntimeOptions preserves an already-normalized cwd', () => {
  const options = buildClaudeV2RuntimeOptions({
    model: 'sonnet',
    cwd: ' /Users/demo/html ',
    env: {},
    settingsEnv: {},
    permissionMode: 'acceptEdits',
  });

  assert.deepEqual(options, {
    model: 'sonnet',
    cwd: '/Users/demo/html',
    env: {},
    permissionMode: 'acceptEdits',
    settingSources: ['user', 'project', 'local'],
  });
});

test('buildClaudeV2RuntimeOptions preserves official effort values', () => {
  const options = buildClaudeV2RuntimeOptions({
    model: 'sonnet',
    cwd: '/Users/demo/html',
    env: {},
    settingsEnv: {},
    effort: 'max',
  });

  assert.deepEqual(options, {
    model: 'sonnet',
    cwd: '/Users/demo/html',
    env: {},
    effort: 'max',
    settingSources: ['user', 'project', 'local'],
  });
});
