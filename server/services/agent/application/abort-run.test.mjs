// 验证 abortRun 能把 run 正确标记为 aborted，并触发对应的收尾逻辑。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createAgentV2Services } from './create-agent-v2-services.js';
import { abortRun } from './abort-run.js';
import { createInMemoryRunStateStore } from './in-memory-run-state-store.js';

test('abortRun marks an existing run as aborted', async () => {
  const repo = createInMemoryRunStateStore();
  const run = await repo.createRun({ sessionId: null, userInput: 'stop me' });

  const result = await abortRun({ repo, runId: run.id });

  assert.equal(result.status, 'aborted');
  assert.equal((await repo.getRun(run.id))?.status, 'aborted');
});

test('agent v2 services abort an active run, close the session, and append run.aborted', async () => {
  const repo = createInMemoryRunStateStore();
  let closeCount = 0;
  let releaseStream;
  const streamGate = new Promise((resolve) => {
    releaseStream = resolve;
  });
  const fakeSession = {
    async send() {},
    async *stream() {
      yield { type: 'assistant', message: { content: [{ type: 'text', text: '处理中' }] } };
      await streamGate;
    },
    close() {
      closeCount += 1;
      releaseStream?.();
    },
    get sessionId() {
      return 'sess-abort';
    },
  };
  const runtime = {
    create() {
      return fakeSession;
    },
    resume() {
      return fakeSession;
    },
    close() {
      fakeSession.close();
    },
  };

  const services = createAgentV2Services({
    repo,
    runtime,
  });

  const started = services.startConversationRun({
    title: '可中断运行',
    prompt: 'start',
    model: 'claude-opus-4-7',
    projectPath: '/Users/demo/html',
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  const run = await repo.findLatestRunBySessionId('sess-abort');
  const aborted = await services.abortRun({ runId: run.id });
  const completed = await started;

  assert.equal(aborted.status, 'aborted');
  assert.equal(closeCount, 1);
  assert.equal((await repo.getRun(run.id))?.status, 'aborted');
  assert.equal(completed.events.at(-1)?.type, 'run.aborted');
});
