# Claude Agent V2 CLI-Like Latency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink Claude Agent V2 first-token latency, make resume/send noticeably faster than new-session startup, and keep the active execution UI driven only by V2 realtime events.

**Architecture:** Split the runtime path into a `fast lane` that establishes only the minimum `session/run` facts before streaming and a `slow lane` that asynchronously persists non-critical event mirrors and projections. Tighten resume paths so existing `sessionId` traffic reuses the in-memory SDK session registry immediately, then simplify the frontend so the current execution panel renders directly from V2 realtime state instead of waiting on transcript or legacy normalized-message paths.

**Tech Stack:** Node.js, better-sqlite3, Claude Agent SDK V2, WebSocket, React, TypeScript/JS, node:test

---

## File Structure

### Backend runtime / orchestration

- Modify: `server/agent-v2/application/create-agent-v2-services.js`
  Purpose: split run execution into first-token `fast lane` and async persistence `slow lane`.
- Create: `server/agent-v2/application/run-event-pipeline.js`
  Purpose: centralize "emit now, persist later where safe" logic and track degraded persistence.
- Modify: `server/agent-v2/application/start-conversation-run.js`
  Purpose: keep new-session startup limited to minimum session/run fact creation.
- Modify: `server/agent-v2/application/continue-conversation-run.js`
  Purpose: enforce resume hot path for existing `sessionId`.
- Modify: `server/agent-v2/runtime/claude-v2-session-pool.js`
  Purpose: expose a direct registry lookup / writer update path for hot resume and reconnect.

### Repository / persistence

- Modify: `server/agent-v2/repository/agent-v2-repository.js`
  Purpose: define minimal write helpers and degraded persistence markers.
- Modify: `server/agent-v2/repository/sqlite-agent-v2-repository.js`
  Purpose: add async-safe append helpers for `run_events` and mark non-critical persistence failures.

### Frontend active execution / rendering

- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.ts`
  Purpose: route V2 realtime events to the active execution store first.
- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.helpers.ts`
  Purpose: isolate current-run updates from transcript/history updates.
- Modify: `src/components/chat/view/agentV2Realtime.ts`
  Purpose: expose current execution state without waiting on transcript sync.
- Modify: `src/components/chat/view/ChatInterface.tsx`
  Purpose: lock composer/execution panel to the active V2 run immediately on submit.
- Modify: `src/components/chat-v2/store/createAgentEventStore.ts`
  Purpose: support direct first-delta insertion and degraded persistence status.
- Modify: `src/components/chat-v2/projection/projectRunExecution.ts`
  Purpose: keep current execution rendering independent from legacy normalized messages.

### Tests / regression

- Modify: `server/agent-v2/application/create-agent-v2-services.test.mjs`
- Modify: `server/agent-v2/application/start-conversation-run.test.mjs`
- Modify: `server/agent-v2/application/continue-conversation-run.test.mjs`
- Modify: `server/agent-v2/runtime/claude-v2-session-pool.test.mjs`
- Modify: `src/components/chat/view/agentV2Realtime.test.mjs`
- Modify: `src/components/chat-v2/projection/projectRunExecution.test.mjs`
- Modify: `src/components/chat/utils/latencyTrace.test.mjs`

## Task 1: Split Runtime Into Fast Lane And Slow Lane

**Files:**
- Create: `server/agent-v2/application/run-event-pipeline.js`
- Modify: `server/agent-v2/application/create-agent-v2-services.js`
- Modify: `server/agent-v2/repository/agent-v2-repository.js`
- Modify: `server/agent-v2/repository/sqlite-agent-v2-repository.js`
- Test: `server/agent-v2/application/create-agent-v2-services.test.mjs`

- [ ] **Step 1: Write the failing backend tests for fast-lane ordering**

```js
test('executeRun emits first realtime event before non-critical persistence completes', async () => {
  const emitted = [];
  const appendLog = [];
  let releaseSlowAppend;
  const slowAppend = new Promise((resolve) => { releaseSlowAppend = resolve; });

  const repo = createFakeRepo({
    async appendRunEvent(event) {
      appendLog.push(event.type);
      if (event.type === 'assistant.message.delta') {
        await slowAppend;
      }
      return event;
    },
    async markRunPersistenceDegraded() {},
  });

  const services = createAgentV2Services({
    repo,
    runtime: createFakeRuntimeWithMessages([
      { type: 'system', subtype: 'init', session_id: 'sess-fast' },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'h' }] } },
      { type: 'result', subtype: 'success', duration_ms: 1 },
    ]),
  });

  const runPromise = services.startSessionRun({
    title: 'Fast lane test',
    prompt: 'say hi',
    onEvent: (event) => emitted.push(event.type),
  });

  await Promise.resolve();
  assert.deepEqual(emitted.slice(0, 2), ['run.started', 'assistant.message.delta']);
  assert.deepEqual(appendLog[0], 'run.started');

  releaseSlowAppend();
  await runPromise;
});

test('executeRun marks run degraded when slow-lane persistence fails after emit', async () => {
  const emitted = [];
  const repo = createFakeRepo({
    async appendRunEvent(event) {
      if (event.type === 'assistant.message.delta') {
        throw new Error('disk busy');
      }
      return event;
    },
    async markRunPersistenceDegraded(runId, message) {
      degraded.push({ runId, message });
    },
  });

  const degraded = [];
  const services = createAgentV2Services({
    repo,
    runtime: createFakeRuntimeWithMessages([
      { type: 'system', subtype: 'init', session_id: 'sess-degraded' },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'h' }] } },
      { type: 'result', subtype: 'success', duration_ms: 1 },
    ]),
  });

  await services.startSessionRun({
    title: 'Degraded lane test',
    prompt: 'say hi',
    onEvent: (event) => emitted.push(event.type),
  });

  assert.equal(emitted.includes('assistant.message.delta'), true);
  assert.equal(degraded.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/agent-v2/application/create-agent-v2-services.test.mjs`
Expected: FAIL because `executeRun` currently persists each event before emitting it and there is no degraded persistence marker.

- [ ] **Step 3: Add a run-event pipeline module with explicit fast/slow responsibilities**

```js
// server/agent-v2/application/run-event-pipeline.js
export function createRunEventPipeline({ repo, runId, onEvent }) {
  let degraded = false;

  async function appendCritical(event) {
    return repo.appendRunEvent(event);
  }

  function emitRealtime(event) {
    onEvent?.(event);
    return event;
  }

  async function appendNonCritical(event) {
    try {
      await repo.appendRunEvent(event);
    } catch (error) {
      degraded = true;
      await repo.markRunPersistenceDegraded?.(
        runId,
        error instanceof Error ? error.message : 'non-critical persistence failed',
      );
    }
  }

  return {
    get degraded() {
      return degraded;
    },
    async publishCritical(event) {
      const persisted = await appendCritical(event);
      emitRealtime(persisted);
      return persisted;
    },
    async publishRealtimeFirst(event) {
      emitRealtime(event);
      await appendNonCritical(event);
      return event;
    },
  };
}
```

- [ ] **Step 4: Refactor `executeRun` to use fast lane for first visible output and slow lane for non-critical events**

```js
// inside server/agent-v2/application/create-agent-v2-services.js
const pipeline = createRunEventPipeline({
  repo,
  runId: run.id,
  onEvent: emitEventRef.current,
});

const startedEvent = await pipeline.publishCritical(createAgentEventEnvelope({
  runId: run.id,
  sessionId: boundSessionId,
  sequence,
  type: 'run.started',
  payload: {},
}));

await executeClaudeRun({
  session,
  prompt,
  onMessage: async (sdkMessage) => {
    const event = translate(sdkMessage, ++sequence);
    const isCritical = event.type === 'run.completed'
      || event.type === 'run.failed'
      || event.type === 'run.aborted';

    if (isCritical) {
      await pipeline.publishCritical(event);
    } else {
      await pipeline.publishRealtimeFirst(event);
    }

    if (event.type === 'run.completed') {
      await repo.updateRun(run.id, {
        status: pipeline.degraded ? 'completed_with_warnings' : 'completed',
      });
    }
  },
});
```

- [ ] **Step 5: Extend repository interfaces for degraded persistence markers**

```js
// server/agent-v2/repository/agent-v2-repository.js
export function createAgentV2Repository() {
  return {
    // existing methods...
    async markRunPersistenceDegraded(runId, message) {
      throw new Error(`markRunPersistenceDegraded not implemented for ${runId}: ${message}`);
    },
  };
}
```

```js
// server/agent-v2/repository/sqlite-agent-v2-repository.js
async function markRunPersistenceDegraded(runId, message) {
  db.prepare(`
    UPDATE agent_runs
    SET status = CASE
      WHEN status IN ('completed', 'failed', 'aborted') THEN status
      ELSE 'degraded'
    END,
    error_message = @message,
    updated_at = @updatedAt
    WHERE id = @runId
  `).run({
    runId,
    message,
    updatedAt: new Date().toISOString(),
  });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test server/agent-v2/application/create-agent-v2-services.test.mjs`
Expected: PASS with new fast-lane ordering and degraded persistence coverage.

- [ ] **Step 7: Commit**

```bash
git add server/agent-v2/application/run-event-pipeline.js \
  server/agent-v2/application/create-agent-v2-services.js \
  server/agent-v2/repository/agent-v2-repository.js \
  server/agent-v2/repository/sqlite-agent-v2-repository.js \
  server/agent-v2/application/create-agent-v2-services.test.mjs
git commit -m "refactor: split claude v2 event fast lane from slow lane"
```

## Task 2: Tighten Session Resume Hot Path

**Files:**
- Modify: `server/agent-v2/application/start-conversation-run.js`
- Modify: `server/agent-v2/application/continue-conversation-run.js`
- Modify: `server/agent-v2/runtime/claude-v2-session-pool.js`
- Test: `server/agent-v2/application/start-conversation-run.test.mjs`
- Test: `server/agent-v2/application/continue-conversation-run.test.mjs`
- Test: `server/agent-v2/runtime/claude-v2-session-pool.test.mjs`

- [ ] **Step 1: Write the failing tests for resume hot-path behavior**

```js
test('continueSessionRun reuses active SDKSession before falling back to runtime.resume', async () => {
  const pool = createClaudeV2SessionPool(createFakeSdk());
  const existing = pool.create({ cwd: '/tmp/project' });
  await existing.send('hello');
  for await (const _message of existing.stream()) break;

  const runtime = {
    get: (sessionId) => pool.get(sessionId),
    resume() {
      throw new Error('resume should not be called when active session exists');
    },
  };

  await continueConversationRun({
    repo: createFakeRepoWithSession('sess-hot'),
    runtime,
    sessionId: 'sess-hot',
    prompt: 'again',
  });
});

test('startConversationRun writes only minimum session/run facts before send', async () => {
  const calls = [];
  const repo = createFakeRepo({
    async createSession(input) { calls.push(['createSession', input]); },
    async createRun(input) { calls.push(['createRun', input]); return { id: 'run-1', ...input }; },
    async appendRunEvent() { calls.push(['appendRunEvent']); },
  });

  await startConversationRun({
    repo,
    runtime: createFakeRuntime(),
    title: 'New run',
    prompt: 'hello',
  });

  assert.deepEqual(calls.map(([name]) => name), ['createRun']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test server/agent-v2/application/start-conversation-run.test.mjs server/agent-v2/application/continue-conversation-run.test.mjs server/agent-v2/runtime/claude-v2-session-pool.test.mjs`
Expected: FAIL because continue/start paths currently do extra setup and do not explicitly prefer an active session lookup.

- [ ] **Step 3: Add explicit active-session lookup and reconnect helpers to the session pool**

```js
// inside server/agent-v2/runtime/claude-v2-session-pool.js
return {
  create(options = {}) { /* existing */ },
  resume(sessionId, options = {}) { /* existing */ },
  get(sessionId) {
    return pool.sessions.get(String(sessionId || '').trim())?.session || null;
  },
  ensureWriter(sessionId, writer) {
    const entry = pool.sessions.get(String(sessionId || '').trim());
    if (!entry) return false;
    entry.writer = writer;
    return true;
  },
  hasLiveSession(sessionId) {
    return Boolean(pool.sessions.get(String(sessionId || '').trim()));
  },
};
```

- [ ] **Step 4: Refactor continue/start use cases to keep the startup write set minimal**

```js
// server/agent-v2/application/continue-conversation-run.js
export async function continueConversationRun({ repo, runtime, sessionId, prompt, ...rest }) {
  const run = await repo.createRun({
    sessionId,
    status: 'created',
    trigger: 'user_prompt',
  });

  const session = runtime.get?.(sessionId)
    || runtime.resume(sessionId, { sessionId, prompt, ...rest });

  return { run, session, sessionId };
}
```

```js
// server/agent-v2/application/start-conversation-run.js
export async function startConversationRun({ repo, runtime, title, prompt, ...rest }) {
  const run = await repo.createRun({
    sessionId: null,
    status: 'created',
    trigger: 'user_prompt',
  });

  const session = runtime.create({ title, prompt, ...rest });
  return { run, session, sessionId: null };
}
```

- [ ] **Step 5: Run tests to verify the hot path passes**

Run: `node --test server/agent-v2/application/start-conversation-run.test.mjs server/agent-v2/application/continue-conversation-run.test.mjs server/agent-v2/runtime/claude-v2-session-pool.test.mjs`
Expected: PASS with explicit active-session reuse and reduced startup writes.

- [ ] **Step 6: Commit**

```bash
git add server/agent-v2/application/start-conversation-run.js \
  server/agent-v2/application/continue-conversation-run.js \
  server/agent-v2/runtime/claude-v2-session-pool.js \
  server/agent-v2/application/start-conversation-run.test.mjs \
  server/agent-v2/application/continue-conversation-run.test.mjs \
  server/agent-v2/runtime/claude-v2-session-pool.test.mjs
git commit -m "refactor: tighten claude v2 session resume hot path"
```

## Task 3: Make Active Execution Render From V2 Realtime Only

**Files:**
- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.ts`
- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.helpers.ts`
- Modify: `src/components/chat/view/agentV2Realtime.ts`
- Modify: `src/components/chat/view/ChatInterface.tsx`
- Modify: `src/components/chat-v2/store/createAgentEventStore.ts`
- Modify: `src/components/chat-v2/projection/projectRunExecution.ts`
- Test: `src/components/chat/view/agentV2Realtime.test.mjs`
- Test: `src/components/chat-v2/projection/projectRunExecution.test.mjs`

- [ ] **Step 1: Write the failing frontend tests for first-delta rendering and transcript isolation**

```js
test('active execution panel renders first assistant delta without waiting for transcript sync', () => {
  const store = createAgentEventStore();
  store.applyEvent({
    type: 'assistant.message.delta',
    runId: 'run-fast',
    sessionId: 'sess-fast',
    payload: { text: 'h' },
  });

  const execution = projectRunExecution({
    activeRunId: 'run-fast',
    events: store.getState().events,
    transcriptMessages: [],
  });

  assert.equal(execution.blocks[0].text, 'h');
});

test('legacy transcript update does not replace active V2 execution state', () => {
  const state = reduceChatRealtimeState(initialState, {
    type: 'assistant.message.delta',
    runId: 'run-1',
    sessionId: 'sess-1',
    payload: { text: 'fast' },
  });

  const next = reduceChatRealtimeState(state, {
    type: 'legacy-transcript-sync',
    sessionId: 'sess-1',
    messages: [],
  });

  assert.equal(next.activeRunId, 'run-1');
  assert.equal(next.executionText, 'fast');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/components/chat/view/agentV2Realtime.test.mjs src/components/chat-v2/projection/projectRunExecution.test.mjs`
Expected: FAIL because current helpers still allow transcript/legacy paths to interfere with current execution updates.

- [ ] **Step 3: Refactor realtime handler helpers so V2 execution updates happen before transcript/history work**

```ts
// inside src/components/chat/hooks/useChatRealtimeHandlers.helpers.ts
export function applyRealtimeExecutionEvent(state, event) {
  const nextStore = state.agentEventStore.applyEvent(event);
  return {
    ...state,
    activeRunId: event.runId ?? state.activeRunId,
    executionStore: nextStore,
    executionStatus: deriveExecutionStatus(nextStore, event),
  };
}

export function applyTranscriptSync(state, event) {
  return {
    ...state,
    transcript: mergeTranscript(state.transcript, event.messages),
    // intentionally do not mutate activeRunId / execution store
  };
}
```

- [ ] **Step 4: Update the view model and store to surface immediate running state and degraded persistence**

```ts
// inside src/components/chat-v2/store/createAgentEventStore.ts
function applyEvent(event: AgentEvent) {
  state.events.push(event);
  if (event.type === 'run.started') {
    state.status = 'running';
  }
  if (event.type === 'run.persistence_degraded') {
    state.persistence = 'degraded';
  }
  return state;
}
```

```ts
// inside src/components/chat/view/agentV2Realtime.ts
export function buildAgentV2RealtimeView(input) {
  return {
    status: input.execution.status,
    isRunning: input.execution.status === 'running',
    blocks: input.execution.blocks,
    persistence: input.execution.persistence ?? 'healthy',
  };
}
```

- [ ] **Step 5: Update `ChatInterface` so send immediately locks the active run shell before first delta arrives**

```tsx
// inside src/components/chat/view/ChatInterface.tsx
const handleSubmit = async (value) => {
  const target = resolveComposerSubmitTarget(/* existing args */);
  setActiveExecution({
    sessionId: target.sessionId,
    runId: `pending:${Date.now()}`,
    status: 'running',
  });
  await sendMessage(value, target);
};
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test src/components/chat/view/agentV2Realtime.test.mjs src/components/chat-v2/projection/projectRunExecution.test.mjs`
Expected: PASS with active execution driven only by V2 realtime input.

- [ ] **Step 7: Commit**

```bash
git add src/components/chat/hooks/useChatRealtimeHandlers.ts \
  src/components/chat/hooks/useChatRealtimeHandlers.helpers.ts \
  src/components/chat/view/agentV2Realtime.ts \
  src/components/chat/view/ChatInterface.tsx \
  src/components/chat-v2/store/createAgentEventStore.ts \
  src/components/chat-v2/projection/projectRunExecution.ts \
  src/components/chat/view/agentV2Realtime.test.mjs \
  src/components/chat-v2/projection/projectRunExecution.test.mjs
git commit -m "refactor: render active chat execution from v2 realtime"
```

## Task 4: Add Latency Regression Coverage And End-To-End Smoke Checks

**Files:**
- Modify: `src/components/chat/utils/latencyTrace.ts`
- Modify: `src/components/chat/utils/latencyTrace.test.mjs`
- Modify: `server/agent-v2/application/handle-claude-command.test.mjs`
- Modify: `server/agent-v2/application/abort-run.test.mjs`
- Modify: `docs/superpowers/specs/2026-04-20-claude-agent-v2-cli-like-latency-design.md`
- Create: `docs/superpowers/plans/2026-04-20-claude-agent-v2-cli-like-latency-smoke-checklist.md`

- [ ] **Step 1: Write the failing latency-trace and smoke-check tests**

```js
test('latency trace records send_to_first_stream_delta when first realtime event arrives', () => {
  const trace = createLatencyTrace({ traceId: 'trace-1', sessionId: 'sess-1' });
  markLatencyTrace(trace, 'send_clicked', 100);
  markLatencyTrace(trace, 'first_stream_delta', 140);
  assert.equal(trace.durations.sendToFirstStreamDelta, 40);
});

test('handleClaudeCommandWithAgentV2 reports degraded persistence as a visible run status', async () => {
  const sent = [];
  const services = createFakeServices({
    async startSessionRun() {
      return {
        run: { id: 'run-1', status: 'degraded' },
        sessionId: 'sess-1',
        events: [{ type: 'run.persistence_degraded', runId: 'run-1', sessionId: 'sess-1' }],
      };
    },
  });

  await handleClaudeCommandWithAgentV2({
    command: 'hi',
    options: {},
    services,
    repo: {},
    writer: { send(event) { sent.push(event); } },
  });

  assert.equal(sent.some((event) => event.type === 'run.persistence_degraded'), true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/components/chat/utils/latencyTrace.test.mjs server/agent-v2/application/handle-claude-command.test.mjs server/agent-v2/application/abort-run.test.mjs`
Expected: FAIL because there is no dedicated first-delta duration metric and degraded persistence is not yet surfaced explicitly.

- [ ] **Step 3: Add explicit first-delta latency measurement and a smoke checklist document**

```ts
// inside src/components/chat/utils/latencyTrace.ts
if (mark === 'first_stream_delta' && trace.marks.send_clicked) {
  trace.durations.sendToFirstStreamDelta =
    trace.marks.first_stream_delta - trace.marks.send_clicked;
}
```

```md
<!-- docs/superpowers/plans/2026-04-20-claude-agent-v2-cli-like-latency-smoke-checklist.md -->
# Claude Agent V2 CLI-Like Latency Smoke Checklist

- [ ] In `/Users/zhanglt21/Desktop/ccui0414/cc-ui/.worktrees/codex-claude-agent-v2-run-core`, create a new session and confirm the UI enters `running` immediately.
- [ ] In the same session, send a second message and confirm server logs show `🔄 Session: Resume`.
- [ ] In `/Users/zhanglt21/Desktop/html`, create a new session and confirm the first visible delta arrives without route/project switching.
- [ ] Refresh during streaming and confirm reconnect shows the current active run rather than falling back to transcript-only history.
```

- [ ] **Step 4: Update tests and docs to pass**

```js
// inside server/agent-v2/application/handle-claude-command.test.mjs
assert.deepEqual(sent.map((event) => event.type), [
  'run.started',
  'assistant.message.delta',
  'run.persistence_degraded',
  'run.completed',
]);
```

- [ ] **Step 5: Run the targeted verification suite**

Run: `node --test server/agent-v2/application/*.test.mjs server/agent-v2/runtime/*.test.mjs src/components/chat/view/agentV2Realtime.test.mjs src/components/chat-v2/projection/projectRunExecution.test.mjs src/components/chat/utils/latencyTrace.test.mjs`
Expected: PASS

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/utils/latencyTrace.ts \
  src/components/chat/utils/latencyTrace.test.mjs \
  server/agent-v2/application/handle-claude-command.test.mjs \
  server/agent-v2/application/abort-run.test.mjs \
  docs/superpowers/plans/2026-04-20-claude-agent-v2-cli-like-latency-smoke-checklist.md
git commit -m "test: add claude v2 latency regression coverage"
```

## Spec Coverage Check

- Fast lane / slow lane split: covered by Task 1.
- Minimum `session/run` hard facts before first delta: covered by Task 1 and Task 2.
- Resume/send hot path for existing `sessionId`: covered by Task 2.
- Current execution driven only by V2 realtime: covered by Task 3.
- First-delta latency and degraded persistence visibility: covered by Task 4.
- E2E smoke in both `cc-ui` and `html` projects: covered by Task 4 checklist.

