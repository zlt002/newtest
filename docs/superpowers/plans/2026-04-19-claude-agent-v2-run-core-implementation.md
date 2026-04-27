# Claude Agent V2 Run-Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy Claude chat pipeline with a persisted `conversation + run + event` architecture for new conversations while leaving historical conversations read-only.

**Architecture:** The backend becomes the single source of truth for conversations, runs, runtime bindings, and replayable run events. The frontend switches from legacy message/session patching to an `AgentEventEnvelope` event store plus projections for timeline, execution panel, and composer status. Claude Agent SDK V2 remains isolated inside the backend runtime layer.

**Tech Stack:** Express, WebSocket, Claude Agent SDK V2, React, TypeScript, Node test runner, SQLite/local persistence, Vite

---

## File Map

**Create**
- `server/agent-v2/domain/conversation.js`
- `server/agent-v2/repository/sqlite-agent-v2-repository.js`
- `server/agent-v2/runtime/claude-run-executor.js`
- `server/routes/agent-events-ws.js`
- `src/components/chat-v2/store/createConversationStore.ts`
- `src/components/chat-v2/types/runState.ts`
- `src/components/chat-v2/hooks/useAgentConversation.ts`
- `src/components/chat-v2/view/AgentConversationShell.tsx`

**Modify**
- `server/agent-v2/domain/agent-event.js`
- `server/agent-v2/domain/run-state-machine.js`
- `server/agent-v2/default-services.js`
- `server/agent-v2/application/create-agent-v2-services.js`
- `server/agent-v2/application/start-conversation-run.js`
- `server/agent-v2/application/continue-conversation-run.js`
- `server/agent-v2/application/abort-run.js`
- `server/agent-v2/repository/agent-v2-repository.js`
- `server/agent-v2/runtime/claude-v2-event-translator.js`
- `server/agent-v2/runtime/claude-v2-session-pool.js`
- `server/routes/agent-v2.js`
- `server/index.js`
- `server/database/init.sql`
- `src/components/chat-v2/types/agentEvents.ts`
- `src/components/chat-v2/store/createAgentEventStore.ts`
- `src/components/chat-v2/projection/projectConversationTimeline.ts`
- `src/components/chat-v2/projection/projectRunExecution.ts`
- `src/components/chat-v2/components/ConversationTimeline.ts`
- `src/components/chat-v2/components/RunExecutionPanel.ts`
- `src/components/chat-v2/components/ComposerContextBar.ts`
- `src/components/chat/view/ChatInterface.tsx`
- `src/components/chat/hooks/useChatComposerState.ts`
- `src/components/chat/hooks/useChatRealtimeHandlers.ts`
- `src/components/app/AppContent.tsx`

**Likely Removal After Cutover**
- legacy Claude-specific websocket shape handling inside `server/index.js`
- legacy Claude-specific normalization/output handling in `server/claude-sdk.js`
- legacy Claude session message source responsibilities in `src/stores/useSessionStore.ts`

**Test**
- `server/agent-v2/domain/run-state-machine.test.mjs`
- `server/agent-v2/repository/agent-v2-repository.test.mjs`
- `server/agent-v2/application/create-agent-v2-services.test.mjs`
- `server/agent-v2/runtime/claude-v2-event-translator.test.mjs`
- `server/routes/agent-v2.test.mjs`
- `src/components/chat-v2/store/createAgentEventStore.test.mjs`
- `src/components/chat-v2/projection/projectConversationTimeline.test.mjs`
- `src/components/chat-v2/projection/projectRunExecution.test.mjs`
- `src/components/chat/view/agentV2Realtime.test.mjs`
- new frontend integration tests around the conversation shell

### Task 1: Lock Domain Contracts

**Files:**
- Create: `server/agent-v2/domain/conversation.js`
- Modify: `server/agent-v2/domain/agent-event.js`
- Modify: `server/agent-v2/domain/run-state-machine.js`
- Modify: `src/components/chat-v2/types/agentEvents.ts`
- Test: `server/agent-v2/domain/run-state-machine.test.mjs`

- [ ] **Step 1: Write failing domain tests for run state and event contract**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunStateMachine } from './run-state-machine.js';
import { createAgentEventEnvelope } from './agent-event.js';

test('run state machine allows queued -> starting -> streaming -> completed', () => {
  const machine = createRunStateMachine();
  assert.equal(machine.transition('queued', 'run.started'), 'starting');
  assert.equal(machine.transition('starting', 'assistant.message.delta'), 'streaming');
  assert.equal(machine.transition('streaming', 'run.completed'), 'completed');
});

test('agent event envelope requires conversationId, runId, sequence, type, timestamp', () => {
  const event = createAgentEventEnvelope({
    conversationId: 'conv_1',
    runId: 'run_1',
    sessionId: null,
    sequence: 1,
    type: 'run.created',
    payload: {},
  });

  assert.equal(event.conversationId, 'conv_1');
  assert.equal(event.runId, 'run_1');
  assert.equal(event.type, 'run.created');
});
```

- [ ] **Step 2: Run the domain test and verify it fails**

Run: `node --test server/agent-v2/domain/run-state-machine.test.mjs`  
Expected: FAIL because the current state machine and event helpers do not yet cover the full contract.

- [ ] **Step 3: Implement the domain contract**

```js
export const RUN_STATUSES = [
  'queued',
  'starting',
  'streaming',
  'waiting_for_tool',
  'completing',
  'completed',
  'failed',
  'aborted',
];

export function createConversation({ id, title, sessionId = null, createdAt }) {
  return { id, title, sessionId, createdAt };
}
```

```ts
export type AgentEventType =
  | 'run.created'
  | 'run.started'
  | 'run.status_changed'
  | 'assistant.message.started'
  | 'assistant.message.delta'
  | 'assistant.message.completed'
  | 'tool.call.started'
  | 'tool.call.delta'
  | 'tool.call.completed'
  | 'tool.call.failed'
  | 'artifact.created'
  | 'usage.updated'
  | 'run.completed'
  | 'run.failed'
  | 'run.aborted';
```

- [ ] **Step 4: Run the domain test and verify it passes**

Run: `node --test server/agent-v2/domain/run-state-machine.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/agent-v2/domain/conversation.js server/agent-v2/domain/agent-event.js server/agent-v2/domain/run-state-machine.js src/components/chat-v2/types/agentEvents.ts server/agent-v2/domain/run-state-machine.test.mjs
git commit -m "feat: define agent v2 run domain contracts"
```

### Task 2: Add Persistent Repository and Schema

**Files:**
- Create: `server/agent-v2/repository/sqlite-agent-v2-repository.js`
- Modify: `server/database/init.sql`
- Modify: `server/agent-v2/default-services.js`
- Modify: `server/agent-v2/repository/agent-v2-repository.js`
- Test: `server/agent-v2/repository/agent-v2-repository.test.mjs`

- [ ] **Step 1: Write failing repository tests for persistence and replay**

```js
test('repository persists conversations, runs, events, and runtime binding', async () => {
  const repo = await createSqliteAgentV2Repository({ filename: ':memory:' });
  const conversation = await repo.createConversation({ title: 'demo' });
  const run = await repo.createRun({ conversationId: conversation.id, userInput: 'hello' });

  await repo.bindConversationSession(conversation.id, 'session_1');
  await repo.appendRunEvent(createAgentEventEnvelope({
    conversationId: conversation.id,
    runId: run.id,
    sessionId: 'session_1',
    sequence: 1,
    type: 'run.created',
    payload: {},
  }));

  assert.equal((await repo.getConversationSession(conversation.id)), 'session_1');
  assert.equal((await repo.listRunEvents(run.id)).length, 1);
});
```

- [ ] **Step 2: Run the repository test and verify it fails**

Run: `node --test server/agent-v2/repository/agent-v2-repository.test.mjs`  
Expected: FAIL because persistence tables and sqlite-backed repository are missing.

- [ ] **Step 3: Implement schema and sqlite repository**

```sql
CREATE TABLE IF NOT EXISTS agent_conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  user_input TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_run_events (
  event_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  session_id TEXT,
  sequence INTEGER NOT NULL,
  type TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
```

```js
export async function createSqliteAgentV2Repository({ db }) {
  return {
    async createConversation({ title }) { /* insert into agent_conversations */ },
    async createRun({ conversationId, userInput }) { /* insert into agent_runs */ },
    async appendRunEvent(event) { /* insert into agent_run_events */ },
    async bindConversationSession(conversationId, sessionId) { /* upsert binding */ },
  };
}
```

- [ ] **Step 4: Run repository tests and verify they pass**

Run: `node --test server/agent-v2/repository/agent-v2-repository.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/database/init.sql server/agent-v2/repository/sqlite-agent-v2-repository.js server/agent-v2/repository/agent-v2-repository.js server/agent-v2/default-services.js server/agent-v2/repository/agent-v2-repository.test.mjs
git commit -m "feat: persist agent v2 conversations and run events"
```

### Task 3: Isolate Claude SDK V2 Runtime and Event Translation

**Files:**
- Create: `server/agent-v2/runtime/claude-run-executor.js`
- Modify: `server/agent-v2/runtime/claude-v2-event-translator.js`
- Modify: `server/agent-v2/runtime/claude-v2-session-pool.js`
- Modify: `server/agent-v2/application/create-agent-v2-services.js`
- Test: `server/agent-v2/runtime/claude-v2-event-translator.test.mjs`
- Test: `server/agent-v2/application/create-agent-v2-services.test.mjs`

- [ ] **Step 1: Write failing translator and orchestration tests**

```js
test('translator maps SDK deltas and tool updates to stable agent events', async () => {
  const translate = createClaudeV2EventTranslator({
    conversationId: 'conv_1',
    runId: 'run_1',
    sessionId: 'session_1',
  });

  const delta = translate({ type: 'assistant_delta', text: 'Hi' }, 2);
  assert.equal(delta.type, 'assistant.message.delta');
  assert.equal(delta.payload.text, 'Hi');
});
```

- [ ] **Step 2: Run focused tests and verify they fail**

Run: `node --test server/agent-v2/runtime/claude-v2-event-translator.test.mjs server/agent-v2/application/create-agent-v2-services.test.mjs`  
Expected: FAIL because runtime events still reflect partial legacy assumptions.

- [ ] **Step 3: Implement runtime executor and strict translation boundary**

```js
export async function executeClaudeRun({ session, prompt, translate, onEvent }) {
  await session.send(prompt);
  for await (const sdkMessage of session.stream()) {
    const event = translate(sdkMessage);
    if (event) {
      await onEvent(event);
    }
  }
}
```

```js
if (sdkMessage.type === 'tool_started') {
  return createAgentEventEnvelope({
    conversationId,
    runId,
    sessionId,
    sequence,
    type: 'tool.call.started',
    payload: { toolName: sdkMessage.toolName },
  });
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run: `node --test server/agent-v2/runtime/claude-v2-event-translator.test.mjs server/agent-v2/application/create-agent-v2-services.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/agent-v2/runtime/claude-run-executor.js server/agent-v2/runtime/claude-v2-event-translator.js server/agent-v2/runtime/claude-v2-session-pool.js server/agent-v2/application/create-agent-v2-services.js server/agent-v2/runtime/claude-v2-event-translator.test.mjs server/agent-v2/application/create-agent-v2-services.test.mjs
git commit -m "feat: isolate claude v2 runtime behind stable event translation"
```

### Task 4: Expose the New Agent Transport and Replay Endpoints

**Files:**
- Create: `server/routes/agent-events-ws.js`
- Modify: `server/routes/agent-v2.js`
- Modify: `server/index.js`
- Test: `server/routes/agent-v2.test.mjs`

- [ ] **Step 1: Write failing route tests for conversation and run lifecycle**

```js
test('POST /api/agent/conversations creates a conversation', async () => {
  const response = await request(app)
    .post('/api/agent/conversations')
    .send({ title: 'Workspace A' });

  assert.equal(response.statusCode, 201);
  assert.equal(typeof response.body.id, 'string');
});

test('GET /api/agent/runs/:id/events returns replayable ordered events', async () => {
  const response = await request(app).get(`/api/agent/runs/${runId}/events`);
  assert.equal(response.statusCode, 200);
  assert.equal(Array.isArray(response.body.events), true);
});
```

- [ ] **Step 2: Run route tests and verify they fail**

Run: `node --test server/routes/agent-v2.test.mjs`  
Expected: FAIL because the new route surface is incomplete.

- [ ] **Step 3: Implement transport routes and websocket event push**

```js
router.post('/conversations', async (req, res) => {
  const conversation = await services.createConversation(req.body);
  res.status(201).json(conversation);
});

router.get('/runs/:id/events', async (req, res) => {
  const events = await services.listRunEvents({ runId: req.params.id });
  res.json({ events });
});
```

```js
app.use('/api/agent', agentV2Routes);
attachAgentEventsWebSocket({ server, path: '/ws/agent-events', services });
```

- [ ] **Step 4: Run route tests and verify they pass**

Run: `node --test server/routes/agent-v2.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/routes/agent-events-ws.js server/routes/agent-v2.js server/index.js server/routes/agent-v2.test.mjs
git commit -m "feat: add persisted agent conversation transport"
```

### Task 5: Build Frontend Event Store and Projection Model

**Files:**
- Create: `src/components/chat-v2/store/createConversationStore.ts`
- Create: `src/components/chat-v2/types/runState.ts`
- Modify: `src/components/chat-v2/store/createAgentEventStore.ts`
- Modify: `src/components/chat-v2/projection/projectConversationTimeline.ts`
- Modify: `src/components/chat-v2/projection/projectRunExecution.ts`
- Test: `src/components/chat-v2/store/createAgentEventStore.test.mjs`
- Test: `src/components/chat-v2/projection/projectConversationTimeline.test.mjs`
- Test: `src/components/chat-v2/projection/projectRunExecution.test.mjs`

- [ ] **Step 1: Write failing frontend projection tests**

```js
test('timeline projection groups events by run and surfaces final assistant text', () => {
  const turns = projectConversationTimeline([
    event('run.created'),
    event('assistant.message.delta', { text: 'Hello' }),
    event('run.completed', { result: 'Hello' }),
  ]);

  assert.equal(turns[0].assistantText, 'Hello');
  assert.equal(turns[0].status, 'completed');
});
```

- [ ] **Step 2: Run projection tests and verify they fail**

Run: `node --test src/components/chat-v2/store/createAgentEventStore.test.mjs src/components/chat-v2/projection/projectConversationTimeline.test.mjs src/components/chat-v2/projection/projectRunExecution.test.mjs`  
Expected: FAIL because stores and projections do not yet cover the final conversation/run contract.

- [ ] **Step 3: Implement the event store and run projections**

```ts
export type RunState = {
  runId: string;
  conversationId: string;
  status: 'queued' | 'starting' | 'streaming' | 'waiting_for_tool' | 'completing' | 'completed' | 'failed' | 'aborted';
  userInput: string;
  assistantText: string;
  error: string | null;
};
```

```ts
export function createConversationStore() {
  return {
    conversation: null,
    runsById: new Map(),
    appendEvents(events) { /* update byRunId and derived run state */ },
  };
}
```

- [ ] **Step 4: Run projection tests and verify they pass**

Run: `node --test src/components/chat-v2/store/createAgentEventStore.test.mjs src/components/chat-v2/projection/projectConversationTimeline.test.mjs src/components/chat-v2/projection/projectRunExecution.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/chat-v2/store/createConversationStore.ts src/components/chat-v2/types/runState.ts src/components/chat-v2/store/createAgentEventStore.ts src/components/chat-v2/projection/projectConversationTimeline.ts src/components/chat-v2/projection/projectRunExecution.ts src/components/chat-v2/store/createAgentEventStore.test.mjs src/components/chat-v2/projection/projectConversationTimeline.test.mjs src/components/chat-v2/projection/projectRunExecution.test.mjs
git commit -m "feat: derive chat ui from persisted agent run events"
```

### Task 6: Replace the Legacy Claude UI Entry With Conversation Shell

**Files:**
- Create: `src/components/chat-v2/hooks/useAgentConversation.ts`
- Create: `src/components/chat-v2/view/AgentConversationShell.tsx`
- Modify: `src/components/chat-v2/components/ConversationTimeline.ts`
- Modify: `src/components/chat-v2/components/RunExecutionPanel.ts`
- Modify: `src/components/chat-v2/components/ComposerContextBar.ts`
- Modify: `src/components/chat/view/ChatInterface.tsx`
- Modify: `src/components/chat/hooks/useChatComposerState.ts`
- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.ts`
- Modify: `src/components/app/AppContent.tsx`
- Test: `src/components/chat/view/agentV2Realtime.test.mjs`
- Test: new shell/component integration tests

- [ ] **Step 1: Write failing integration tests for new-conversation send, stream, abort, and replay**

```js
test('new Claude conversations render timeline and execution panel from agent events', async () => {
  render(<AgentConversationShell />);
  await user.type(screen.getByRole('textbox'), 'Fix the bug');
  await user.click(screen.getByRole('button', { name: /send/i }));

  assert.equal(await screen.findByText('Fix the bug'), true);
  assert.equal(await screen.findByText(/completed/i), true);
});
```

- [ ] **Step 2: Run UI tests and verify they fail**

Run: `node --test src/components/chat/view/agentV2Realtime.test.mjs`  
Expected: FAIL because the shell still routes through legacy composer/realtime assumptions.

- [ ] **Step 3: Implement the conversation shell cutover**

```tsx
export default function AgentConversationShell() {
  const { timeline, activeRun, sendPrompt, abortRun } = useAgentConversation();
  return (
    <>
      <ConversationTimeline turns={timeline} />
      <RunExecutionPanel run={activeRun} />
      <ComposerContextBar status={activeRun?.status ?? 'idle'} onSubmit={sendPrompt} onAbort={abortRun} />
    </>
  );
}
```

```ts
sendPrompt({ conversationId, prompt }) {
  return api.createRun(conversationId, { prompt });
}
```

- [ ] **Step 4: Run UI tests and verify they pass**

Run: `node --test src/components/chat/view/agentV2Realtime.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/chat-v2/hooks/useAgentConversation.ts src/components/chat-v2/view/AgentConversationShell.tsx src/components/chat-v2/components/ConversationTimeline.ts src/components/chat-v2/components/RunExecutionPanel.ts src/components/chat-v2/components/ComposerContextBar.ts src/components/chat/view/ChatInterface.tsx src/components/chat/hooks/useChatComposerState.ts src/components/chat/hooks/useChatRealtimeHandlers.ts src/components/app/AppContent.tsx src/components/chat/view/agentV2Realtime.test.mjs
git commit -m "feat: switch claude chat ui to conversation shell"
```

### Task 7: Remove Legacy Claude Execution Paths

**Files:**
- Modify: `server/index.js`
- Modify: `server/claude-sdk.js`
- Modify: `src/stores/useSessionStore.ts`
- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.ts`
- Modify: `src/components/chat/view/ChatInterface.tsx`
- Test: targeted regression tests across backend and frontend suites

- [ ] **Step 1: Write failing regression tests that assert new Claude flows no longer emit legacy message shapes**

```js
test('Claude websocket path emits agent event envelopes only for new conversations', async () => {
  const message = await connectAndReadFirstEvent();
  assert.equal(typeof message.eventId, 'string');
  assert.equal(typeof message.runId, 'string');
  assert.equal(message.kind, undefined);
});
```

- [ ] **Step 2: Run regression tests and verify they fail**

Run: `npm test`  
Expected: FAIL because legacy Claude-specific message shapes are still present.

- [ ] **Step 3: Remove legacy Claude runtime branches and cleanup dead state**

```js
if (provider === 'claude') {
  throw new Error('legacy Claude transport removed; use agent event transport');
}
```

```ts
// Remove Claude-specific realtime merge path.
// Keep store responsibilities only for historical read-only transcript rendering where still needed.
```

- [ ] **Step 4: Run the full test suite and verify it passes**

Run: `npm test && npm run typecheck`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/index.js server/claude-sdk.js src/stores/useSessionStore.ts src/components/chat/hooks/useChatRealtimeHandlers.ts src/components/chat/view/ChatInterface.tsx
git commit -m "refactor: remove legacy claude execution pipeline"
```

## Spec Coverage Check

- The plan covers persisted `conversation + run + event` storage in Task 2.
- The plan keeps Claude SDK V2 isolated in runtime in Task 3.
- The plan introduces stable HTTP and WebSocket transport in Task 4.
- The plan switches the frontend to projection-based rendering in Tasks 5 and 6.
- The plan explicitly removes legacy Claude compatibility logic in Task 7.
- Historical conversations are not migrated; they remain read-only by omission from all new write paths.

## Notes

- Do not add new Claude product features during this migration.
- Keep each task behind passing tests before moving on.
- Prefer small follow-up cleanup commits if a task leaves mechanical dead code behind.
