// V2 服务总装配测试。
// 这里覆盖 start / continue / abort 三条主路径，确保 session-first 主链稳定。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInMemoryAgentV2Repository } from '../test-support/in-memory-agent-v2-repository.js';
import { createAgentV2Services } from './create-agent-v2-services.js';

function createRuntimeWithMessages(messages) {
  return {
    create() {
      return {
        async send() {},
        async *stream() {
          for (const message of messages) {
            yield message;
          }
        },
        get sessionId() {
          return 'sess-fast';
        },
      };
    },
    resume() {
      return this.create();
    },
  };
}

test('startSessionRun executes Claude V2 session and persists translated events', async () => {
  const repo = createInMemoryAgentV2Repository();
  const sent = [];
  const sessionReady = [];
  const createCalls = [];
  const fakeSession = {
    async send(input) {
      sent.push(input);
    },
    async *stream() {
      yield { type: 'system', subtype: 'init', session_id: 'sess-1' };
      yield { type: 'assistant', message: { content: [{ type: 'text', text: '你好' }] } };
      yield { type: 'result', subtype: 'success', result: '你好' };
    },
    get sessionId() {
      return 'sess-1';
    },
  };
  const runtime = {
    create(options) {
      createCalls.push(options);
      return fakeSession;
    },
    resume() {
      return fakeSession;
    },
  };

  const services = createAgentV2Services({ repo, runtime });
  const result = await services.startSessionRun({
    title: '新会话',
    prompt: 'hello',
    model: 'claude-opus-4-7',
    projectPath: '/Users/demo/html',
    onSessionReady(sessionId) {
      sessionReady.push(sessionId);
    },
  });

  assert.equal(sent[0], 'hello');
  assert.equal(result.sessionId, 'sess-1');
  assert.equal(result.session.id, 'sess-1');
  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0]?.model, 'claude-opus-4-7');
  assert.equal(createCalls[0]?.cwd, '/Users/demo/html');
  assert.equal(typeof createCalls[0]?.env, 'object');
  assert.equal(await repo.getSession('sess-1'), null);
  assert.equal(result.session.title, '新会话');
  assert.equal(result.conversation?.id, 'sess-1');
  assert.equal((await repo.getRun(result.run.id))?.sessionId, 'sess-1');
  assert.deepEqual(sessionReady, ['sess-1']);
  assert.equal('mcpEnabled' in createCalls[0], false);
  assert.deepEqual(
    result.events.map((event) => event.type),
    ['run.started', 'sdk.system.init', 'run.body.segment_appended', 'run.completed'],
  );
});

test('startSessionRun sends uploaded images as an SDK user message', async () => {
  const repo = createInMemoryAgentV2Repository();
  const sent = [];
  const fakeSession = {
    async send(input) {
      sent.push(input);
    },
    async *stream() {
      yield { type: 'system', subtype: 'init', session_id: 'sess-vision' };
      yield { type: 'result', subtype: 'success', result: 'done' };
    },
    get sessionId() {
      return 'sess-vision';
    },
  };
  const runtime = {
    create() {
      return fakeSession;
    },
    resume() {
      return fakeSession;
    },
  };

  const services = createAgentV2Services({ repo, runtime });
  await services.startSessionRun({
    title: '图片会话',
    prompt: '图片里是什么',
    projectPath: '/Users/demo/html',
    images: [
      {
        name: 'capture.png',
        mimeType: 'image/png',
        data: 'data:image/png;base64,QUJD',
      },
    ],
  });

  assert.equal(typeof sent[0], 'object');
  assert.equal(sent[0].type, 'user');
  assert.equal(sent[0].message.role, 'user');
  assert.deepEqual(sent[0].message.content, [
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: 'QUJD',
      },
    },
    {
      type: 'text',
      text: '图片里是什么',
    },
  ]);
});

test('startSessionRun wraps official user message payload into the SDK user envelope', async () => {
  const repo = createInMemoryAgentV2Repository();
  const sent = [];
  const fakeSession = {
    async send(input) {
      sent.push(input);
    },
    async *stream() {
      yield { type: 'system', subtype: 'init', session_id: 'sess-official-message' };
      yield { type: 'result', subtype: 'success', result: 'done' };
    },
    get sessionId() {
      return 'sess-official-message';
    },
  };
  const runtime = {
    create() {
      return fakeSession;
    },
    resume() {
      return fakeSession;
    },
  };
  const officialMessage = {
    role: 'user',
    content: [
      { type: 'text', text: 'Describe this image' },
      {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: 'QUJD',
        },
      },
    ],
  };

  const services = createAgentV2Services({ repo, runtime });
  const result = await services.startSessionRun({
    title: '官方消息会话',
    prompt: 'legacy fallback',
    projectPath: '/Users/demo/html',
    message: officialMessage,
  });

  assert.deepEqual(sent[0], {
    type: 'user',
    parent_tool_use_id: null,
    message: officialMessage,
  });
  assert.equal((await repo.getRun(result.run.id))?.userInput, 'Describe this image');
});

test('startSessionRun carries traceId through product and sdk-mapped realtime events', async () => {
  const repo = createInMemoryAgentV2Repository();
  const runtime = {
    create() {
      return {
        async send() {},
        async *stream() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-trace' };
          yield { type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } };
          yield { type: 'result', subtype: 'success', result: 'done' };
        },
        get sessionId() {
          return 'sess-trace';
        },
      };
    },
    resume() {
      return this.create();
    },
  };

  const services = createAgentV2Services({ repo, runtime });
  const result = await services.startSessionRun({
    title: 'Trace 会话',
    prompt: 'hello',
    projectPath: '/Users/demo/project',
    traceId: 'trace-submit-1',
  });

  assert.equal(result.events[0].type, 'run.started');
  assert.equal(result.events[0].payload.traceId, 'trace-submit-1');
  assert.equal(result.events[1].type, 'sdk.system.init');
  assert.equal(result.events[1].payload.traceId, 'trace-submit-1');
  assert.equal(result.events[2].type, 'run.body.segment_appended');
  assert.equal(result.events[2].payload.traceId, 'trace-submit-1');
});

test('startSessionRun appends raw SDK messages even when session getter lags behind the init frame', async () => {
  const repo = createInMemoryAgentV2Repository();
  const appended = [];
  let resolvedSessionId = null;
  const runtime = {
    create() {
      return {
        async send() {},
        async *stream() {
          resolvedSessionId = null;
          yield { type: 'system', subtype: 'init', session_id: 'sess-debug' };
          resolvedSessionId = 'sess-debug';
          yield { type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } };
          yield { type: 'result', subtype: 'success', result: 'done' };
        },
        get sessionId() {
          return resolvedSessionId;
        },
      };
    },
    resume() {
      return this.create();
    },
  };
  const debugLog = {
    async append(entry) {
      appended.push(entry);
      return { id: appended.length, ...entry };
    },
  };

  const services = createAgentV2Services({ repo, runtime, debugLog });
  await services.startSessionRun({
    title: 'Debug 会话',
    prompt: 'hello',
    projectPath: '/Users/demo/project',
  });

  assert.equal(appended.length, 3);
  assert.deepEqual(appended.map((entry) => entry.sessionId), ['sess-debug', 'sess-debug', 'sess-debug']);
  assert.deepEqual(appended.map((entry) => entry.type), ['system', 'assistant', 'result']);
  assert.deepEqual(appended[0].payload, { type: 'system', subtype: 'init', session_id: 'sess-debug' });
  assert.deepEqual(appended[1].payload, {
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'hello' }] },
  });
  assert.deepEqual(appended[2].payload, { type: 'result', subtype: 'success', result: 'done' });
});

test('startSessionRun does not fail when debug log append throws', async () => {
  const repo = createInMemoryAgentV2Repository();
  const runtime = {
    create() {
      return {
        async send() {},
        async *stream() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-debug-failure' };
          yield { type: 'result', subtype: 'success', result: 'done' };
        },
        get sessionId() {
          return null;
        },
      };
    },
    resume() {
      return this.create();
    },
  };
  const debugLog = {
    async append() {
      throw new Error('debug log unavailable');
    },
  };

  const services = createAgentV2Services({ repo, runtime, debugLog });
  const result = await services.startSessionRun({
    title: 'Debug 失败会话',
    prompt: 'hello',
    projectPath: '/Users/demo/project',
  });

  assert.equal(result.sessionId, 'sess-debug-failure');
  assert.equal(result.events.at(-1)?.type, 'run.completed');
  assert.equal((await repo.getRun(result.run.id))?.status, 'completed');
});

test('startSessionRun does not let a slow debug log delay the first realtime event', async () => {
  const repo = createInMemoryAgentV2Repository();
  const emitted = [];
  let releaseDebugLog;
  const debugLogGate = new Promise((resolve) => {
    releaseDebugLog = resolve;
  });
  const runtime = {
    create() {
      return {
        async send() {},
        async *stream() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-debug-slow' };
          yield { type: 'assistant', message: { content: [{ type: 'text', text: 'hello' }] } };
          yield { type: 'result', subtype: 'success', result: 'done' };
        },
        get sessionId() {
          return 'sess-debug-slow';
        },
      };
    },
    resume() {
      return this.create();
    },
  };
  const debugLog = {
    async append() {
      await debugLogGate;
    },
  };

  const runPromise = createAgentV2Services({ repo, runtime, debugLog }).startSessionRun({
    title: '慢调试日志会话',
    prompt: 'hello',
    projectPath: '/Users/demo/project',
    onEvent(event) {
      emitted.push(event);
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(emitted.some((event) => event.type === 'sdk.system.init'));

  releaseDebugLog?.();
  const result = await runPromise;
  assert.equal(result.events.at(-1)?.type, 'run.completed');
});

test('continueSessionRun reuses the bound session and persists terminal state', async () => {
  const repo = createInMemoryAgentV2Repository();
  await repo.createSession({ sessionId: 'sess-bound', title: '继续会话' });

  const sent = [];
  const resumeCalls = [];
  const fakeSession = {
    async send(input) {
      sent.push(input);
    },
    async *stream() {
      yield { type: 'assistant', message: { content: [{ type: 'text', text: '处理中' }] } };
      yield { type: 'result', subtype: 'error_during_execution', result: '' };
    },
    get sessionId() {
      return 'sess-bound';
    },
  };
  const runtime = {
    create() {
      return fakeSession;
    },
    resume(sessionId, options) {
      resumeCalls.push({ sessionId, options });
      return fakeSession;
    },
  };

  const services = createAgentV2Services({ repo, runtime });
  const result = await services.continueSessionRun({
    sessionId: 'sess-bound',
    prompt: 'follow up',
    model: 'claude-opus-4-7',
  });

  assert.equal(sent[0], 'follow up');
  assert.equal(result.session.id, 'sess-bound');
  assert.equal(result.run.sessionId, 'sess-bound');
  assert.equal((await repo.getRun(result.run.id))?.status, 'failed');
  assert.equal(resumeCalls.length, 1);
  assert.equal(resumeCalls[0]?.sessionId, 'sess-bound');
  assert.equal(resumeCalls[0]?.options?.model, 'claude-opus-4-7');
  assert.equal('mcpEnabled' in resumeCalls[0].options, false);
  assert.equal(typeof resumeCalls[0]?.options?.env, 'object');
  assert.deepEqual(
    result.events.map((event) => event.type),
    ['run.started', 'run.body.segment_appended', 'run.failed'],
  );
});

test('continueSessionRun can continue from runtime truth without a repo session record', async () => {
  const repo = createInMemoryAgentV2Repository();
  const resumeCalls = [];
  const fakeSession = {
    async send() {},
    async *stream() {
      yield { type: 'result', subtype: 'success', result: '完成' };
    },
    get sessionId() {
      return 'sess-runtime-only';
    },
  };
  const runtime = {
    resume(sessionId, options) {
      resumeCalls.push({ sessionId, options });
      return fakeSession;
    },
  };

  const services = createAgentV2Services({ repo, runtime });
  const result = await services.continueSessionRun({
    sessionId: 'sess-runtime-only',
    prompt: 'follow up',
    model: 'claude-opus-4-7',
  });

  assert.equal(result.sessionId, 'sess-runtime-only');
  assert.equal(result.run.sessionId, 'sess-runtime-only');
  assert.equal(result.session.id, 'sess-runtime-only');
  assert.equal(result.session.title, 'Session sess-runtime-only');
  assert.equal(result.conversation?.id, 'sess-runtime-only');
  assert.equal(await repo.getSession('sess-runtime-only'), null);
  assert.equal(resumeCalls.length, 1);
  assert.equal(resumeCalls[0]?.sessionId, 'sess-runtime-only');
});

test('abortSession aborts a live session without looking up the latest run', async () => {
  const repo = createInMemoryAgentV2Repository();
  const closedSessionIds = [];
  const runtime = {
    close(sessionId) {
      closedSessionIds.push(sessionId);
      return sessionId === 'sess-live';
    },
  };

  const services = createAgentV2Services({ repo, runtime });
  const result = await services.abortSession({ sessionId: 'sess-live' });

  assert.deepEqual(closedSessionIds, ['sess-live']);
  assert.deepEqual(result, {
    sessionId: 'sess-live',
    status: 'aborted',
  });
});

test('getSessionHistory delegates to the canonical session history service', async () => {
  const repo = createInMemoryAgentV2Repository();
  const calls = [];
  const services = createAgentV2Services({
    repo,
    runtime: createRuntimeWithMessages([]),
    sessionHistoryService: {
      async getSessionHistory(params) {
        calls.push(params);
        const { sessionId } = params;
        return {
          sessionId,
          cwd: '/tmp/history-project',
          metadata: {
            title: '历史会话',
            pinned: false,
            starred: false,
            lastViewedAt: null,
          },
          messages: [
            { id: 'msg-1', role: 'user', text: 'first' },
            { id: 'msg-2', role: 'assistant', text: 'second' },
          ],
          diagnosticsSummary: {
            officialMessageCount: 2,
            debugLogAvailable: false,
          },
        };
      },
    },
  });

  const history = await services.getSessionHistory({
    sessionId: 'sess-history',
    limit: 40,
    offset: 0,
    full: false,
  });

  assert.deepEqual(calls, [{
    sessionId: 'sess-history',
    limit: 40,
    offset: 0,
    full: false,
  }]);
  assert.deepEqual(history, {
    sessionId: 'sess-history',
    cwd: '/tmp/history-project',
    metadata: {
      title: '历史会话',
      pinned: false,
      starred: false,
      lastViewedAt: null,
    },
    messages: [
      { id: 'msg-1', role: 'user', text: 'first' },
      { id: 'msg-2', role: 'assistant', text: 'second' },
    ],
    diagnosticsSummary: {
      officialMessageCount: 2,
      debugLogAvailable: false,
    },
  });
});

test('getSessionHistory returns a canonical fallback when sessionHistoryService is not injected', async () => {
  const repo = createInMemoryAgentV2Repository();
  const services = createAgentV2Services({
    repo,
    runtime: createRuntimeWithMessages([]),
  });

  const history = await services.getSessionHistory({ sessionId: 'sess-legacy' });

  assert.deepEqual(history, {
    sessionId: 'sess-legacy',
    cwd: null,
    metadata: {
      title: null,
      pinned: false,
      starred: false,
      lastViewedAt: null,
    },
    messages: [],
    diagnosticsSummary: {
      officialMessageCount: 0,
      debugLogAvailable: false,
    },
  });
});

test('createSession returns a synthetic session shell without persisting agent session rows', async () => {
  const runStateStore = createInMemoryAgentV2Repository();
  const services = createAgentV2Services({
    repo: {
      async createSession() {
        throw new Error('createSession should not touch the repo session table');
      },
    },
    runStateStore,
    runtime: createRuntimeWithMessages([]),
  });

  const session = await services.createSession({
    sessionId: 'sess-shell',
    title: '手动会话',
  });

  assert.deepEqual(session, {
    id: 'sess-shell',
    title: '手动会话',
    createdAt: null,
  });

  assert.deepEqual(await services.getSession({ sessionId: 'sess-shell' }), {
    id: 'sess-shell',
    title: '手动会话',
    createdAt: null,
  });
});

test('getSession derives a session shell from canonical history metadata', async () => {
  const services = createAgentV2Services({
    repo: {
      async getSession() {
        throw new Error('getSession should not read the repo session table');
      },
    },
    runtime: createRuntimeWithMessages([]),
    sessionHistoryService: {
      async getSessionHistory({ sessionId }) {
        return {
          sessionId,
          cwd: '/tmp/project',
          metadata: {
            title: '来自 history 的标题',
            pinned: false,
            starred: false,
            lastViewedAt: null,
          },
          messages: [{ id: 'm1', role: 'assistant', text: 'hi', timestamp: '2026-04-22T10:00:01.000Z' }],
          diagnosticsSummary: {
            officialMessageCount: 1,
            debugLogAvailable: false,
          },
        };
      },
    },
  });

  const session = await services.getSession({ sessionId: 'sess-history-shell' });

  assert.deepEqual(session, {
    id: 'sess-history-shell',
    title: '来自 history 的标题',
    createdAt: null,
  });
});

test('startSessionRun emits the first realtime event before slow persistence completes', async () => {
  const repo = createInMemoryAgentV2Repository();
  const emitted = [];
  const appendLog = [];
  let releaseAssistantAppend;
  const assistantAppendGate = new Promise((resolve) => {
    releaseAssistantAppend = resolve;
  });
  const originalAppendRunEvent = repo.appendRunEvent.bind(repo);
  repo.appendRunEvent = async (event) => {
    appendLog.push(event.type);
    if (event.type === 'sdk.system.init') {
      await assistantAppendGate;
    }
    return originalAppendRunEvent(event);
  };

  const services = createAgentV2Services({
    repo,
    runtime: createRuntimeWithMessages([
      { type: 'system', subtype: 'init', session_id: 'sess-fast' },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'h' }] } },
      { type: 'result', subtype: 'success', result: 'done' },
    ]),
  });

  const runPromise = services.startSessionRun({
    title: 'Fast lane',
    prompt: 'say hi',
    projectPath: '/Users/demo/project',
    onEvent(event) {
      emitted.push(event.type);
    },
  });

  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(emitted.slice(0, 2), ['run.started', 'sdk.system.init']);
  assert.equal(appendLog[0], 'run.started');
  assert.equal(appendLog.includes('sdk.system.init'), true);

  releaseAssistantAppend();
  await runPromise;
});

test('startSessionRun marks the run degraded when slow persistence fails after emit', async () => {
  const repo = createInMemoryAgentV2Repository();
  const emitted = [];
  const degraded = [];
  const originalAppendRunEvent = repo.appendRunEvent.bind(repo);
  repo.appendRunEvent = async (event) => {
    if (event.type === 'run.body.segment_appended') {
      throw new Error('disk busy');
    }
    return originalAppendRunEvent(event);
  };
  const originalMarkRunPersistenceDegraded = repo.markRunPersistenceDegraded.bind(repo);
  repo.markRunPersistenceDegraded = async (runId, message) => {
    degraded.push({ runId, message });
    return originalMarkRunPersistenceDegraded(runId, message);
  };

  const services = createAgentV2Services({
    repo,
    runtime: {
      create() {
        return {
          async send() {},
          async *stream() {
            yield { type: 'system', subtype: 'init', session_id: 'sess-degraded' };
            yield { type: 'assistant', message: { content: [{ type: 'text', text: 'h' }] } };
            yield { type: 'result', subtype: 'success', result: 'done' };
          },
          get sessionId() {
            return 'sess-degraded';
          },
        };
      },
      resume() {
        return this.create();
      },
    },
  });

  const result = await services.startSessionRun({
    title: 'Degraded lane',
    prompt: 'say hi',
    projectPath: '/Users/demo/project',
    onEvent(event) {
      emitted.push(event.type);
    },
  });

  assert.equal(emitted.includes('run.body.segment_appended'), true);
  assert.equal(degraded.length, 1);
  assert.equal(degraded[0].message, 'disk busy');
  assert.equal(result.events.some((event) => event.type === 'run.status_changed'), true);
});

test('abortRun does not overwrite a natural completion that wins the race', async () => {
  const repo = createInMemoryAgentV2Repository();
  let releaseCompletionUpdate;
  const completionUpdateGate = new Promise((resolve) => {
    releaseCompletionUpdate = resolve;
  });
  const originalUpdateRun = repo.updateRun.bind(repo);
  repo.updateRun = async (runId, patch) => {
    if (patch?.status === 'completed') {
      await completionUpdateGate;
    }
    return originalUpdateRun.call(repo, runId, patch);
  };
  const originalMarkRunAbortedIfActive = repo.markRunAbortedIfActive.bind(repo);
  let releaseAbortMark;
  const abortMarkGate = new Promise((resolve) => {
    releaseAbortMark = resolve;
  });
  repo.markRunAbortedIfActive = async (runId) => {
    await abortMarkGate;
    return originalMarkRunAbortedIfActive(runId);
  };
  const runtime = {
    create() {
      return {
        sessionId: 'sess-race',
        async send() {},
        async *stream() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-race' };
          yield { type: 'assistant', message: { content: [{ type: 'text', text: '处理中' }] } };
          yield { type: 'result', subtype: 'success', result: '完成' };
        },
      };
    },
    resume() {
      return this.create();
    },
  };

  const services = createAgentV2Services({ repo, runtime });
  const started = services.startSessionRun({
    title: '竞态会话',
    prompt: 'hello',
    model: 'claude-opus-4-7',
    projectPath: '/Users/demo/html',
  });

  await new Promise((resolve) => setImmediate(resolve));
  const run = await repo.findLatestRunBySessionId('sess-race');
  const abortPromise = services.abortRun({ runId: run.id });

  releaseCompletionUpdate();
  await new Promise((resolve) => setImmediate(resolve));
  releaseAbortMark();

  const [result, aborted] = await Promise.all([started, abortPromise]);
  const finalRun = await repo.getRun(run.id);

  assert.equal(finalRun?.status, 'completed');
  assert.equal(aborted.status, 'completed');
  assert.equal(result.events.at(-1)?.type, 'run.completed');
  assert.equal(result.events.some((event) => event.type === 'run.aborted'), false);
});

test('run.failed stays ordered after a pending realtime event is flushed', async () => {
  const repo = createInMemoryAgentV2Repository();
  const eventTypes = [];
  let releaseDeltaAppend;
  const deltaAppendGate = new Promise((resolve) => {
    releaseDeltaAppend = resolve;
  });
  const originalAppendRunEvent = repo.appendRunEvent.bind(repo);
  repo.appendRunEvent = async (event) => {
    eventTypes.push(event.type);
    if (event.type === 'run.body.segment_appended') {
      await deltaAppendGate;
    }
    return originalAppendRunEvent(event);
  };

  const runtime = {
    create() {
      return {
        sessionId: 'sess-failure',
        async send() {},
        async *stream() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-failure' };
          yield { type: 'assistant', message: { content: [{ type: 'text', text: '处理中' }] } };
          throw new Error('boom');
        },
      };
    },
    resume() {
      return this.create();
    },
  };

  const services = createAgentV2Services({ repo, runtime });
  const runPromise = services.startSessionRun({
    title: '失败竞态',
    prompt: 'hello',
    model: 'claude-opus-4-7',
    projectPath: '/Users/demo/html',
  });

  releaseDeltaAppend();
  const result = await runPromise;

  assert.deepEqual(result.events.map((event) => event.type), [
    'run.started',
    'sdk.system.init',
    'run.body.segment_appended',
    'run.failed',
  ]);
  assert.deepEqual(result.events.map((event) => event.sequence), [1, 2, 3, 4]);
  assert.deepEqual(eventTypes.slice(0, 3), ['run.started', 'sdk.system.init', 'run.body.segment_appended']);
});

test('startSessionRun fails and closes the session when the sdk stream stalls without a terminal result', async () => {
  const repo = createInMemoryAgentV2Repository();
  let closeCalls = 0;
  const runtime = {
    create() {
      return {
        async send() {},
        async *stream() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-stalled' };
          yield {
            type: 'system',
            subtype: 'task_started',
            session_id: 'sess-stalled',
            task_id: 'task-stalled',
            description: '子代理处理中',
            tool_use_id: 'tool-task-1',
          };
          await new Promise(() => {});
        },
        get sessionId() {
          return 'sess-stalled';
        },
        close() {
          closeCalls += 1;
        },
      };
    },
    resume() {
      return this.create();
    },
    close(sessionId) {
      assert.equal(sessionId, 'sess-stalled');
      closeCalls += 1;
      return true;
    },
  };

  const services = createAgentV2Services({
    repo,
    runtime,
    runInactivityTimeoutMs: 20,
  });
  const result = await services.startSessionRun({
    title: '卡住会话',
    prompt: 'hello',
    projectPath: '/Users/demo/html',
  });

  assert.equal(result.events.at(-1)?.type, 'run.failed');
  assert.match(result.events.at(-1)?.payload?.error || '', /idle timeout/i);
  assert.equal((await repo.getRun(result.run.id))?.status, 'failed');
  assert.equal(closeCalls, 1);
});

test('startSessionRun does not fail idle runs while runtime is waiting for user interaction', async () => {
  const repo = createInMemoryAgentV2Repository();
  let waitingForApproval = true;
  const runtime = {
    create() {
      return {
        async send() {},
        async *stream() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-waiting' };
          await new Promise((resolve) => setTimeout(resolve, 35));
          waitingForApproval = false;
          yield { type: 'result', subtype: 'success', result: 'done' };
        },
        get sessionId() {
          return 'sess-waiting';
        },
      };
    },
    resume() {
      return this.create();
    },
    listPendingApprovals(sessionId) {
      assert.equal(sessionId, 'sess-waiting');
      return waitingForApproval ? [{ id: 'approval-1' }] : [];
    },
  };

  const services = createAgentV2Services({
    repo,
    runtime,
    runInactivityTimeoutMs: 20,
  });
  const result = await services.startSessionRun({
    title: '等待审批会话',
    prompt: 'hello',
    projectPath: '/Users/demo/html',
  });

  assert.equal(result.events.at(-1)?.type, 'run.completed');
  assert.equal((await repo.getRun(result.run.id))?.status, 'completed');
});

test('runtime error and abort do not persist failed and aborted together', async () => {
  const repo = createInMemoryAgentV2Repository();
  const originalListRunEvents = repo.listRunEvents.bind(repo);
  let releaseListGate;
  let resolveListStarted;
  let listGatePassed = false;
  const listGate = new Promise((resolve) => {
    releaseListGate = resolve;
  });
  const listStarted = new Promise((resolve) => {
    resolveListStarted = resolve;
  });
  repo.listRunEvents = async (runId) => {
    if (!listGatePassed) {
      listGatePassed = true;
      resolveListStarted();
      await listGate;
    }
    return originalListRunEvents(runId);
  };

  const runtime = {
    create() {
      return {
        sessionId: 'sess-runtime-abort',
        async send() {},
        async *stream() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-runtime-abort' };
          yield { type: 'assistant', message: { content: [{ type: 'text', text: '处理中' }] } };
          throw new Error('boom');
        },
      };
    },
    resume() {
      return this.create();
    },
  };

  const services = createAgentV2Services({ repo, runtime });
  const runPromise = services.startSessionRun({
    title: '运行错误竞态',
    prompt: 'hello',
    model: 'claude-opus-4-7',
    projectPath: '/Users/demo/html',
  });

  await new Promise((resolve) => setImmediate(resolve));
  await listStarted;

  const run = await repo.findLatestRunBySessionId('sess-runtime-abort');
  const abortPromise = services.abortRun({ runId: run.id });

  releaseListGate();
  const [result, aborted] = await Promise.all([runPromise, abortPromise]);
  const finalRun = await repo.getRun(run.id);
  const terminalTypes = result.events
    .filter((event) => event.type === 'run.failed' || event.type === 'run.aborted')
    .map((event) => event.type);

  assert.equal(finalRun?.status, 'failed');
  assert.equal(aborted.status, 'failed');
  assert.deepEqual(terminalTypes, ['run.failed']);
});

test('continueConversationRun path alias forwards to continueSessionRun semantics', async () => {
  const repo = createInMemoryAgentV2Repository();
  await repo.createSession({ sessionId: 'sess-alias', title: '别名续跑' });
  const sent = [];
  const fakeSession = {
    sessionId: 'sess-alias',
    async send(input) {
      sent.push(input);
    },
    async *stream() {
      yield { type: 'result', subtype: 'success', result: '完成' };
    },
  };
  const runtime = {
    create() {
      return fakeSession;
    },
    resume(sessionId) {
      assert.equal(sessionId, 'sess-alias');
      return fakeSession;
    },
  };

  const services = createAgentV2Services({ repo, runtime });
  const result = await services.continueConversationRun({
    conversationId: 'sess-alias',
    prompt: 'follow up',
    images: [
      {
        name: 'alias.png',
        mimeType: 'image/png',
        data: 'data:image/png;base64,QUJD',
      },
    ],
    model: 'claude-opus-4-7',
  });

  assert.equal(result.sessionId, 'sess-alias');
  assert.equal(result.run.sessionId, 'sess-alias');
  assert.equal(typeof sent[0], 'object');
  assert.deepEqual(sent[0].message.content, [
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: 'QUJD',
      },
    },
    {
      type: 'text',
      text: 'follow up',
    },
  ]);
});

test('startConversationRun path alias forwards uploaded images to startSessionRun semantics', async () => {
  const repo = createInMemoryAgentV2Repository();
  const sent = [];
  const runtime = {
    create() {
      return {
        async send(input) {
          sent.push(input);
        },
        async *stream() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-alias-start' };
          yield { type: 'result', subtype: 'success', result: '完成' };
        },
        get sessionId() {
          return 'sess-alias-start';
        },
      };
    },
    resume() {
      return this.create();
    },
  };

  const services = createAgentV2Services({ repo, runtime });
  const result = await services.startConversationRun({
    title: '别名新会话',
    prompt: 'start with image',
    images: [
      {
        name: 'alias-start.png',
        mimeType: 'image/png',
        data: 'data:image/png;base64,REVG',
      },
    ],
    projectPath: '/Users/demo/html',
  });

  assert.equal(result.sessionId, 'sess-alias-start');
  assert.equal(typeof sent[0], 'object');
  assert.deepEqual(sent[0].message.content, [
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: 'REVG',
      },
    },
    {
      type: 'text',
      text: 'start with image',
    },
  ]);
});

test('startSessionRun uses the in-memory run state as source of truth when a side-channel repo is unavailable', async () => {
  const runStateStore = createInMemoryAgentV2Repository();
  const services = createAgentV2Services({
    repo: {
      async getRun() {
        throw new Error('side-channel repo should not be consulted for run truth');
      },
      async updateRun() {
        throw new Error('side-channel repo should not be consulted for run truth');
      },
      async listRunEvents() {
        throw new Error('side-channel repo should not be consulted for run truth');
      },
      async appendRunEvent() {
        throw new Error('side-channel repo should not be consulted for run truth');
      },
    },
    runStateStore,
    runtime: {
      create() {
        return {
          async send() {},
          async *stream() {
            yield { type: 'system', subtype: 'init', session_id: 'sess-store-truth' };
            yield { type: 'result', subtype: 'success', result: '完成' };
          },
          get sessionId() {
            return 'sess-store-truth';
          },
        };
      },
      resume() {
        return this.create();
      },
    },
  });

  const result = await services.startSessionRun({
    title: '内存真相会话',
    prompt: 'hello',
    projectPath: '/Users/demo/project',
  });

  assert.equal(result.sessionId, 'sess-store-truth');
  assert.equal(result.run.sessionId, 'sess-store-truth');
  assert.deepEqual(
    result.events.map((event) => event.type),
    ['run.started', 'sdk.system.init', 'run.completed'],
  );
  assert.equal((await runStateStore.getRun(result.run.id))?.status, 'completed');
});
