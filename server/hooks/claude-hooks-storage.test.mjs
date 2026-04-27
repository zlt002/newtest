import test from 'node:test';
import assert from 'node:assert/strict';

import { createClaudeHooksStorage } from './claude-hooks-storage.js';

test('storage writes user, project, and local hooks to official settings paths', async () => {
  const writes = [];
  const storage = createClaudeHooksStorage({
    homeDir: '/tmp/home',
    projectPath: '/tmp/project',
    readJson: async () => ({ hooks: { Stop: [] }, theme: 'dark' }),
    writeJson: async (targetPath, payload) => {
      writes.push({ targetPath, payload });
    },
    sessionMemoryStore: {
      getHooks: async () => ({}),
      setHooks: async () => {},
    },
  });

  await storage.updateSource({ sourceKind: 'user', hooks: { Stop: [{ matcher: '', hooks: [] }] } });
  await storage.updateSource({ sourceKind: 'project', hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [] }] } });
  await storage.updateSource({ sourceKind: 'local', hooks: { PostToolUse: [{ matcher: 'Write', hooks: [] }] } });

  assert.deepEqual(writes, [
    {
      targetPath: '/tmp/home/.claude/settings.json',
      payload: { hooks: { Stop: [{ matcher: '', hooks: [] }] }, theme: 'dark' },
    },
    {
      targetPath: '/tmp/project/.claude/settings.json',
      payload: { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [] }] }, theme: 'dark' },
    },
    {
      targetPath: '/tmp/project/.claude/settings.local.json',
      payload: { hooks: { PostToolUse: [{ matcher: 'Write', hooks: [] }] }, theme: 'dark' },
    },
  ]);
});

test('storage rejects invalid hooks payload instead of overwriting persisted hooks', async () => {
  const writes = [];
  const storage = createClaudeHooksStorage({
    homeDir: '/tmp/home',
    projectPath: '/tmp/project',
    readJson: async () => ({ hooks: { Stop: [{ matcher: '', hooks: [] }] }, theme: 'dark' }),
    writeJson: async (targetPath, payload) => {
      writes.push({ targetPath, payload });
    },
    sessionMemoryStore: {
      getHooks: async () => ({ Stop: [{ matcher: '', hooks: [] }] }),
      setHooks: async () => {},
    },
  });

  await assert.rejects(
    storage.updateSource({ sourceKind: 'project', hooks: [] }),
    (error) => {
      assert.equal(error?.statusCode, 400);
      assert.match(error?.message, /hooks/i);
      return true;
    },
  );

  await assert.rejects(
    storage.updateSource({ sourceKind: 'session-memory', sessionId: 'sess-1', hooks: null }),
    (error) => {
      assert.equal(error?.statusCode, 400);
      assert.match(error?.message, /hooks/i);
      return true;
    },
  );

  assert.deepEqual(writes, []);
});

test('storage writes session-memory hooks into injected store', async () => {
  const calls = [];
  const storage = createClaudeHooksStorage({
    readJson: async () => ({}),
    writeJson: async () => {},
    sessionMemoryStore: {
      getHooks: async (sessionId) => {
        calls.push({ type: 'getHooks', sessionId });
        return { Stop: [{ matcher: '', hooks: [] }] };
      },
      setHooks: async (sessionId, hooks) => {
        calls.push({ type: 'setHooks', sessionId, hooks });
      },
    },
  });

  await storage.updateSource({
    sourceKind: 'session-memory',
    sessionId: 'sess-1',
    hooks: { UserPromptSubmit: [{ matcher: '', hooks: [{ type: 'command', command: 'echo hi' }] }] },
  });

  assert.deepEqual(calls, [
    { type: 'setHooks', sessionId: 'sess-1', hooks: { UserPromptSubmit: [{ matcher: '', hooks: [{ type: 'command', command: 'echo hi' }] }] } },
  ]);
});

test('storage rejects readonly source kind deletion', async () => {
  const storage = createClaudeHooksStorage({
    readJson: async () => ({}),
    writeJson: async () => {},
    sessionMemoryStore: {
      getHooks: async () => ({}),
      setHooks: async () => {},
    },
  });

  await assert.rejects(
    storage.deleteEntry({ sourceKind: 'plugin', entryId: 'plugin:git:Stop:0' }),
    (error) => {
      assert.equal(error?.statusCode, 400);
      assert.match(error?.message, /read-only/i);
      return true;
    },
  );
});

test('storage deletes matching entry from project settings and rewrites file', async () => {
  const writes = [];
  const storage = createClaudeHooksStorage({
    homeDir: '/tmp/home',
    projectPath: '/tmp/project',
    readJson: async (targetPath) => {
      assert.equal(targetPath, '/tmp/project/.claude/settings.json');
      return {
        hooks: {
          Stop: [
            { matcher: '', hooks: [{ type: 'command', command: 'echo first' }] },
            { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo second' }] },
          ],
          PreToolUse: [{ matcher: 'Write', hooks: [] }],
        },
        env: { A: '1' },
      };
    },
    writeJson: async (targetPath, payload) => {
      writes.push({ targetPath, payload });
    },
    sessionMemoryStore: {
      getHooks: async () => ({}),
      setHooks: async () => {},
    },
  });

  const result = await storage.deleteEntry({ sourceKind: 'project', entryId: 'project:Stop:1' });

  assert.deepEqual(result, {
    sourceId: 'project',
    sourceKind: 'project',
    entryId: 'project:Stop:1',
    path: '/tmp/project/.claude/settings.json',
  });
  assert.deepEqual(writes, [
    {
      targetPath: '/tmp/project/.claude/settings.json',
      payload: {
        hooks: {
          Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'echo first' }] }],
          PreToolUse: [{ matcher: 'Write', hooks: [] }],
        },
        env: { A: '1' },
      },
    },
  ]);
});

test('storage rejects delete when entryId source does not match writable file source', async () => {
  const storage = createClaudeHooksStorage({
    homeDir: '/tmp/home',
    projectPath: '/tmp/project',
    readJson: async () => ({
      hooks: {
        Stop: [{ matcher: '', hooks: [] }],
      },
    }),
    writeJson: async () => {},
    sessionMemoryStore: {
      getHooks: async () => ({}),
      setHooks: async () => {},
    },
  });

  await assert.rejects(
    storage.deleteEntry({ sourceKind: 'project', entryId: 'user:Stop:0' }),
    (error) => {
      assert.equal(error?.statusCode, 400);
      assert.match(error?.message, /source/i);
      return true;
    },
  );
});

test('storage rejects session delete when query sessionId mismatches entryId session', async () => {
  const storage = createClaudeHooksStorage({
    readJson: async () => ({}),
    writeJson: async () => {},
    sessionMemoryStore: {
      getHooks: async () => ({
        Stop: [{ matcher: '', hooks: [] }],
      }),
      setHooks: async () => {},
    },
  });

  await assert.rejects(
    storage.deleteEntry({
      sourceKind: 'session-memory',
      sessionId: 'sess-query',
      entryId: 'session-memory:sess-entry:Stop:0',
    }),
    (error) => {
      assert.equal(error?.statusCode, 400);
      assert.match(error?.message, /session/i);
      return true;
    },
  );
});
