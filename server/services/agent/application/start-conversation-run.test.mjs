// 验证新 run 创建时只创建 run，不预占 runtime sessionId。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInMemoryRunStateStore } from './in-memory-run-state-store.js';
import { startConversationRun } from './start-conversation-run.js';

test('startConversationRun creates a queued run and waits for runtime sessionId', async () => {
  const repo = createInMemoryRunStateStore();
  const session = { sessionId: 'sess-claude-opus-4-7' };
  const runtime = {
    create() {
      return session;
    },
  };

  const result = await startConversationRun({
    repo,
    runtime,
    title: '对话 1',
    prompt: 'hello',
    model: 'claude-opus-4-7',
    projectPath: '/Users/demo/html',
  });

  assert.equal(result.run.userInput, 'hello');
  assert.equal(result.run.sessionId, null);
  assert.equal(result.session, session);
  assert.equal(result.sessionId, null);
  assert.equal(await repo.getSession('sess-claude-opus-4-7'), null);
});

test('startConversationRun only writes the run record before handing off to runtime', async () => {
  const calls = [];
  const runtimeCalls = [];
  const repo = {
    async createRun(input) {
      calls.push({ type: 'createRun', input });
      return { id: 'run-1', sessionId: null, userInput: input.userInput };
    },
    async createSession() {
      throw new Error('startConversationRun should not create a session record');
    },
  };
  const runtime = {
    create(options) {
      calls.push({ type: 'createSession' });
      runtimeCalls.push(options);
      return { sessionId: 'sess-runtime' };
    },
  };

  const result = await startConversationRun({
    repo,
    runtime,
    title: '对话 2',
    prompt: 'hello again',
    model: 'claude-opus-4-7',
    projectPath: '/Users/demo/html',
  });

  assert.equal(result.run.id, 'run-1');
  assert.deepEqual(calls, [
    { type: 'createRun', input: { sessionId: null, userInput: 'hello again' } },
    { type: 'createSession' },
  ]);
  assert.equal('mcpEnabled' in runtimeCalls[0], false);
});

test('startConversationRun forwards resolved Claude plugins to runtime.create', async () => {
  let runtimeOptions = null;
  const repo = createInMemoryRunStateStore();
  const runtime = {
    create(options) {
      runtimeOptions = options;
      return { sessionId: 'sess-runtime' };
    },
  };

  await startConversationRun({
    repo,
    runtime,
    title: '对话 3',
    prompt: 'plugin test',
    model: 'claude-opus-4-7',
    projectPath: '/Users/demo/html',
    plugins: [{ type: 'local', path: '/tmp/plugins/superpowers/5.0.7' }],
  });

  assert.deepEqual(runtimeOptions?.plugins, [{ type: 'local', path: '/tmp/plugins/superpowers/5.0.7' }]);
});
