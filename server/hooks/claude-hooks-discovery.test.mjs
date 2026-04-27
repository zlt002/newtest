import test from 'node:test';
import assert from 'node:assert/strict';

import { discoverClaudeHookSources } from './claude-hooks-discovery.js';
import { createHookSource } from './claude-hooks-types.js';
import { normalizeHookEntries } from './claude-hooks-normalizer.js';

test('discoverClaudeHookSources returns writable file sources and readonly plugin-like sources', async () => {
  const seenPaths = [];
  const result = await discoverClaudeHookSources({
    homeDir: '/tmp/home',
    projectPath: '/tmp/project',
    settingsReader: async (targetPath) => {
      seenPaths.push(targetPath);
      if (targetPath === '/tmp/home/.claude/settings.json') {
        return {
          hooks: {
            Stop: [{ matcher: '', hooks: [{ type: 'http', url: 'https://example.com/hook' }] }],
          },
        };
      }
      if (targetPath === '/tmp/project/.claude/settings.json') {
        return {
          hooks: {
            PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo project' }] }],
          },
        };
      }
      if (targetPath === '/tmp/project/.claude/settings.local.json') {
        return {
          hooks: {
            PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'prompt', prompt: 'summarize' }] }],
          },
        };
      }
      return null;
    },
    pluginSources: [
      {
        id: 'plugin:git',
        name: 'git-helper',
        path: '/tmp/plugins/git-helper/hooks.json',
        hooks: {
          UserPromptSubmit: [{ matcher: '', hooks: [{ type: 'command', command: 'echo plugin' }] }],
        },
      },
    ],
    skillSources: [{ id: 'skill:brainstorming', name: 'brainstorming', path: '/tmp/skills/brainstorming/hooks.json', hooks: { Stop: [] } }],
    subagentSources: [{ id: 'subagent:raman', name: 'Raman', path: '/tmp/subagents/raman/hooks.json', hooks: { Notification: [] } }],
    sessionMemorySources: [{ sessionId: 'sess-1', hooks: { PreToolUse: [] } }],
  });

  assert.deepEqual(
    result.sources.map((source) => source.kind),
    [
      'user',
      'project',
      'local',
      'plugin',
      'skill',
      'subagent',
      'session-memory',
    ],
  );
  assert.deepEqual(seenPaths, [
    '/tmp/home/.claude/settings.json',
    '/tmp/project/.claude/settings.json',
    '/tmp/project/.claude/settings.local.json',
  ]);

  assert.equal(result.entries.some((entry) => entry.event === 'PreToolUse'), true);
  assert.equal(result.entries.some((entry) => entry.readonly === true), true);
  assert.equal(result.entries.some((entry) => entry.event === null), false);
  assert.equal(result.entries.some((entry) => Object.hasOwn(entry, 'source')), false);
  assert.equal(result.sources[3].path, '/tmp/plugins/git-helper/hooks.json');
  assert.equal(result.sources[6].id, 'session-memory:sess-1');
});

test('discoverClaudeHookSources skips invalid external providers', async () => {
  const result = await discoverClaudeHookSources({
    homeDir: '/tmp/home',
    projectPath: '/tmp/project',
    settingsReader: async () => ({ hooks: {} }),
    pluginSources: [{ id: '   ', name: 'bad-plugin', hooks: { Stop: [] } }],
    skillSources: [{ name: 'bad-skill', hooks: { Stop: [] } }],
    subagentSources: [{ id: '', name: 'bad-subagent', hooks: { Stop: [] } }],
    sessionMemorySources: [
      { sessionId: '', hooks: { Stop: [] } },
      { hooks: { Stop: [] } },
    ],
  });

  assert.deepEqual(
    result.sources.map((source) => source.kind),
    ['user', 'project', 'local'],
  );
  assert.equal(result.entries.length, 0);
});

test('normalizeHookEntries ignores invalid hook structures and matcher entries', () => {
  const source = createHookSource({
    id: 'plugin:ok',
    kind: 'plugin',
    label: 'ok',
    writable: false,
  });

  assert.deepEqual(normalizeHookEntries({ source, hooks: [] }), []);
  assert.deepEqual(normalizeHookEntries({ source, hooks: 'bad' }), []);
  assert.deepEqual(normalizeHookEntries({ source, hooks: 123 }), []);
  assert.deepEqual(normalizeHookEntries({ source, hooks: { Stop: [null, 'x', 1, { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo ok' }] }] } }).map((entry) => entry.matcher), ['Bash']);
});
