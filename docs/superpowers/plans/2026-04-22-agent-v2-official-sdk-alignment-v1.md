# Claude Agent V2 Official SDK Alignment V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Agent V2's DB-centric run/history model with official Claude `jsonl` history plus SDK live runtime, while keeping only minimal local metadata and debug logging.

**Architecture:** The backend moves history reads to a canonical session/message service built on official `~/.claude/projects/.../*.jsonl` files, and moves runtime control to live session and pending-interaction registries instead of `agent_runs` lookups. The frontend stops consuming `runs + eventsByRun` and instead renders canonical history plus low-transformation SDK realtime messages. To stay YAGNI, v1 reuses the existing `session_names` table as the metadata store and adds only one new persistence surface: `sdk_debug_log`.

**Tech Stack:** Node.js, Express, better-sqlite3, React, TypeScript, WebSocket, `@anthropic-ai/claude-agent-sdk`, Node test runner

---

## File Structure

- Create: `server/agent-v2/history/official-history-reader.js`
  Read canonical session history from official Claude `jsonl` files and normalize it into `CanonicalSessionMessage[]`.
- Create: `server/agent-v2/history/official-history-reader.test.mjs`
  Verify malformed lines are ignored, `agent-*.jsonl` tool records are attached, and messages are time-ordered.
- Create: `server/agent-v2/history/session-history-service.js`
  Compose official history, metadata names, and debug availability into the new `/sessions/:id/history` response.
- Create: `server/agent-v2/history/session-history-service.test.mjs`
  Verify the public history response shape is `{ sessionId, cwd, metadata, messages, diagnosticsSummary }`.
- Create: `server/agent-v2/runtime/live-session-registry.js`
  Track active SDK sessions keyed by `sessionId`.
- Create: `server/agent-v2/runtime/live-session-registry.test.mjs`
  Verify register/get/delete/replace semantics.
- Create: `server/agent-v2/runtime/pending-interaction-registry.js`
  Track active approvals and ask-user prompts keyed by `requestId` and `sessionId`.
- Create: `server/agent-v2/runtime/pending-interaction-registry.test.mjs`
  Verify resolve, lookup, and cleanup behavior.
- Create: `server/agent-v2/debug/sdk-debug-log.js`
  Persist append-only raw SDK diagnostics to SQLite.
- Create: `server/agent-v2/debug/sdk-debug-log.test.mjs`
  Verify append/list/trim behavior for debug records.
- Modify: `server/agent-v2/application/create-agent-v2-services.js`
  Replace repository-backed history and abort logic with history service + live session registry.
- Modify: `server/agent-v2/application/continue-conversation-run.js`
  Stop requiring `repo.getSession()` for continue; use runtime/live session + official history truth.
- Modify: `server/agent-v2/application/start-conversation-run.js`
  Stop creating DB-backed run/session records; return a session-first result.
- Modify: `server/agent-v2/runtime/claude-v2-session-pool.js`
  Publish live session lifecycle into the registry and expose session-level abort/reconnect hooks.
- Modify: `server/routes/agent-v2.js`
  Change `/sessions/:id/history` to canonical response shape and retire `/conversations*` aliases at the end of the migration.
- Modify: `server/routes/agent-v2.test.mjs`
  Update route assertions for the new history payload and final route set.
- Modify: `server/index.js`
  Route `abort-session` through `sessionId` instead of `findLatestRunBySessionId`.
- Modify: `server/providers/claude/adapter.js`
  Remove DB overlay of V2 events onto Claude message history.
- Modify: `server/projects.js`
  Remove run-input overlays for sidebar summaries and centralize official session lookup helpers.
- Modify: `server/routes/projects.test.mjs`
  Update sidebar/project session expectations to use official history only.
- Modify: `server/database/db.js`
  Reuse `session_names` as metadata store, add `sdk_debug_log`, and delete `agent_*` schema paths in the final cleanup task.
- Modify: `server/database/init.sql`
  Keep `session_names`, add `sdk_debug_log`, remove `agent_*` tables.
- Modify: `server/database/db-migration.test.mjs`
  Verify `sdk_debug_log` exists and `agent_*` tables are absent after migration.
- Modify: `server/database/init-compat.test.mjs`
  Verify fresh schema creation matches the new thin persistence model.
- Create: `src/components/chat-v2/types/sessionHistory.ts`
  Define the canonical history payload and message types consumed by the frontend.
- Create: `src/components/chat-v2/api/fetchSessionHistory.ts`
  Fetch the new `/sessions/:id/history` response.
- Create: `src/components/chat-v2/api/fetchSessionHistory.test.mjs`
  Verify the new endpoint and response type are used.
- Create: `src/components/chat-v2/projection/projectOfficialSession.ts`
  Convert canonical history messages into renderable assistant/user turns.
- Create: `src/components/chat-v2/projection/projectOfficialSession.test.mjs`
  Verify tool messages, assistant turns, and compact boundaries render correctly.
- Create: `src/components/chat-v2/projection/projectLiveSdkFeed.ts`
  Convert raw realtime SDK messages into UI blocks without reintroducing `run.*` or `tool.call.*` protocols.
- Create: `src/components/chat-v2/projection/projectLiveSdkFeed.test.mjs`
  Verify thinking/tool/hook/interaction messages project into visible blocks.
- Modify: `src/components/chat-v2/hooks/useHistoricalAgentConversation.ts`
  Consume canonical history instead of `runs + eventsByRun`.
- Modify: `src/components/chat/view/ChatInterface.tsx`
  Remove `historyMode`/`legacy-fallback` branching and render official history + live SDK feed.
- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.ts`
  Consume `sdk.message`, `session.status`, `interaction.required`, `interaction.resolved`, and `debug.ref`.
- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.helpers.ts`
  Add helpers for raw SDK feed normalization.
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
  Render raw realtime status blocks and debug references.
- Modify: `src/components/chat/view/agentV2Realtime.test.mjs`
  Update realtime tests for the new event family.
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`
  Update message-pane tests for official history and raw realtime blocks.
- Modify: `src/components/sidebar/hooks/useSidebarController.ts`
  Keep session naming behavior through metadata-only APIs.
- Delete: `server/agent-v2/repository/sqlite-agent-v2-repository.js`
- Delete: `server/agent-v2/repository/agent-v2-repository.js`
- Delete: `server/agent-v2/application/run-event-pipeline.js`
- Delete: `src/components/chat-v2/api/fetchSessionRunHistory.ts`
- Delete: `src/components/chat-v2/api/fetchSessionRunHistory.test.mjs`
- Delete: `src/components/chat-v2/projection/projectAssistantTurnsForSession.ts`
- Delete: `src/components/chat-v2/projection/projectAssistantTurnsForSession.test.mjs`
- Delete: `src/components/chat-v2/projection/projectConversationStream.ts`
- Delete: `src/components/chat-v2/projection/projectConversationStream.test.mjs`

## Task 1: Build the official history reader

**Files:**
- Create: `server/agent-v2/history/official-history-reader.js`
- Test: `server/agent-v2/history/official-history-reader.test.mjs`
- Modify: `server/projects.js`

- [x] **Step 1: Write the failing history-reader tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createOfficialHistoryReader } from './official-history-reader.js';

test('official history reader returns canonical messages for a session', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ccui-history-'));
  const projectDir = path.join(tempRoot, '-Users-demo-project');
  await fs.mkdir(projectDir, { recursive: true });

  await fs.writeFile(
    path.join(projectDir, 'sess-1.jsonl'),
    [
      JSON.stringify({ sessionId: 'sess-1', type: 'user', uuid: 'u1', timestamp: '2026-04-22T10:00:00.000Z', message: { content: [{ type: 'text', text: 'hello' }] } }),
      'not-json',
      JSON.stringify({ sessionId: 'sess-1', type: 'assistant', uuid: 'a1', timestamp: '2026-04-22T10:00:01.000Z', message: { content: [{ type: 'text', text: 'hi' }] } }),
    ].join('\n'),
  );

  const reader = createOfficialHistoryReader({ claudeProjectsRoot: tempRoot });
  const history = await reader.readSession({ sessionId: 'sess-1' });

  assert.equal(history.sessionId, 'sess-1');
  assert.equal(history.messages.map((message) => message.role).join(','), 'user,assistant');
  assert.equal(history.messages[1].text, 'hi');
  assert.equal(history.diagnostics.ignoredLineCount, 1);
});
```

- [x] **Step 2: Run the reader tests to verify they fail**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/agent-v2/history/official-history-reader.test.mjs
```

Expected: FAIL with `Cannot find module './official-history-reader.js'` or missing `createOfficialHistoryReader`.

- [x] **Step 3: Implement the reader by lifting official JSONL parsing into a focused module**

```js
export function createOfficialHistoryReader({
  claudeProjectsRoot = path.join(os.homedir(), '.claude', 'projects'),
  fsImpl = fs,
}) {
  async function locateSessionFile(sessionId) {
    const projectDirs = await fsImpl.readdir(claudeProjectsRoot, { withFileTypes: true });
    for (const entry of projectDirs) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(claudeProjectsRoot, entry.name, `${sessionId}.jsonl`);
      try {
        await fsImpl.access(candidate);
        return { projectDir: path.join(claudeProjectsRoot, entry.name), jsonlPath: candidate };
      } catch {}
    }
    return null;
  }

  return {
    async readSession({ sessionId }) {
      const located = await locateSessionFile(String(sessionId || '').trim());
      if (!located) return { sessionId, cwd: null, messages: [], diagnostics: { ignoredLineCount: 0 } };
      const rawMessages = await readSessionMessagesFromProjectDir(located.projectDir, sessionId, fsImpl);
      return normalizeOfficialSessionHistory({ sessionId, projectDir: located.projectDir, rawMessages });
    },
  };
}
```

```js
function normalizeOfficialSessionHistory({ sessionId, projectDir, rawMessages }) {
  return {
    sessionId,
    cwd: decodeClaudeProjectDir(path.basename(projectDir)),
    messages: rawMessages.flatMap((entry) => normalizeClaudeHistoryEntry(entry)),
    diagnostics: {
      officialMessageCount: rawMessages.length,
      ignoredLineCount: rawMessages.ignoredLineCount || 0,
    },
  };
}
```

- [x] **Step 4: Run the reader tests again**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/agent-v2/history/official-history-reader.test.mjs
```

Expected: PASS with canonical `messages[]` and ignored malformed lines.

- [ ] **Step 5: Commit**

```bash
git add server/agent-v2/history/official-history-reader.js server/agent-v2/history/official-history-reader.test.mjs server/projects.js
git commit -m "feat: add official claude history reader"
```

## Task 2: Replace DB-backed history with a canonical session history service

**Files:**
- Create: `server/agent-v2/history/session-history-service.js`
- Test: `server/agent-v2/history/session-history-service.test.mjs`
- Modify: `server/agent-v2/application/create-agent-v2-services.js`
- Modify: `server/routes/agent-v2.js`
- Modify: `server/routes/agent-v2.test.mjs`

- [x] **Step 1: Write the failing service and route tests**

```js
test('session history service returns metadata and canonical messages', async () => {
  const historyService = createSessionHistoryService({
    officialHistoryReader: {
      readSession: async () => ({
        sessionId: 'sess-1',
        cwd: '/tmp/project',
        messages: [{ id: 'm1', role: 'assistant', text: 'hi', timestamp: '2026-04-22T10:00:01.000Z' }],
        diagnostics: { officialMessageCount: 1 },
      }),
    },
    metadataStore: {
      getMetadata: async () => ({ title: 'Pinned Name', pinned: false, starred: false, lastViewedAt: null }),
    },
    debugLog: {
      hasSessionLogs: async () => true,
    },
  });

  const result = await historyService.getSessionHistory({ sessionId: 'sess-1' });

  assert.deepEqual(result, {
    sessionId: 'sess-1',
    cwd: '/tmp/project',
    metadata: { title: 'Pinned Name', pinned: false, starred: false, lastViewedAt: null },
    messages: [{ id: 'm1', role: 'assistant', text: 'hi', timestamp: '2026-04-22T10:00:01.000Z' }],
    diagnosticsSummary: { officialMessageCount: 1, debugLogAvailable: true },
  });
});
```

```js
assert.deepEqual(historyResponse.body, {
  sessionId: 'sess-1',
  cwd: '/tmp/project',
  metadata: { title: null, pinned: false, starred: false, lastViewedAt: null },
  messages: [],
  diagnosticsSummary: { officialMessageCount: 0, debugLogAvailable: false },
});
```

- [x] **Step 2: Run the history service and route tests to verify they fail**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/agent-v2/history/session-history-service.test.mjs server/routes/agent-v2.test.mjs
```

Expected: FAIL because services and routes still return `runs + eventsByRun`.

- [x] **Step 3: Implement the canonical history service and wire it into Agent V2 services**

```js
export function createSessionHistoryService({ officialHistoryReader, metadataStore, debugLog }) {
  return {
    async getSessionHistory({ sessionId }) {
      const [history, metadata, debugLogAvailable] = await Promise.all([
        officialHistoryReader.readSession({ sessionId }),
        metadataStore.getMetadata(sessionId),
        debugLog.hasSessionLogs(sessionId),
      ]);

      return {
        sessionId: history.sessionId,
        cwd: history.cwd,
        metadata,
        messages: history.messages,
        diagnosticsSummary: {
          officialMessageCount: history.diagnostics.officialMessageCount,
          debugLogAvailable,
        },
      };
    },
  };
}
```

```js
async getSessionHistory({ sessionId }) {
  return historyService.getSessionHistory({ sessionId });
}
```

```js
router.get('/sessions/:id/history', async (req, res, next) => {
  try {
    res.json(await services.getSessionHistory({ sessionId: req.params.id }));
  } catch (error) {
    next(error);
  }
});
```

- [x] **Step 4: Run the history service and route tests again**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/agent-v2/history/session-history-service.test.mjs server/routes/agent-v2.test.mjs
```

Expected: PASS with the new canonical history response shape.

- [ ] **Step 5: Commit**

```bash
git add server/agent-v2/history/session-history-service.js server/agent-v2/history/session-history-service.test.mjs server/agent-v2/application/create-agent-v2-services.js server/routes/agent-v2.js server/routes/agent-v2.test.mjs
git commit -m "refactor: switch agent v2 history to canonical session messages"
```

## Task 3: Introduce live session, pending interaction, and debug-log runtime state

**Files:**
- Create: `server/agent-v2/runtime/live-session-registry.js`
- Create: `server/agent-v2/runtime/live-session-registry.test.mjs`
- Create: `server/agent-v2/runtime/pending-interaction-registry.js`
- Create: `server/agent-v2/runtime/pending-interaction-registry.test.mjs`
- Create: `server/agent-v2/debug/sdk-debug-log.js`
- Create: `server/agent-v2/debug/sdk-debug-log.test.mjs`
- Modify: `server/agent-v2/runtime/claude-v2-session-pool.js`
- Modify: `server/agent-v2/application/continue-conversation-run.js`
- Modify: `server/agent-v2/application/create-agent-v2-services.js`
- Modify: `server/index.js`

- [x] **Step 1: Write the failing runtime-state tests**

```js
test('continueConversationRun reuses a live session without repo.getSession()', async () => {
  const liveSession = { sessionId: 'sess-1' };
  const runtime = {
    liveSessions: createLiveSessionRegistry(),
    resume: () => { throw new Error('resume should not be called'); },
  };
  runtime.liveSessions.set('sess-1', liveSession);

  const result = await continueConversationRun({
    runtime,
    sessionId: 'sess-1',
    prompt: 'next',
    model: 'sonnet',
    projectPath: '/tmp/project',
  });

  assert.equal(result.session, liveSession);
});
```

```js
test('sdk debug log stores append-only records by session', async () => {
  const store = createSdkDebugLog({ db });
  await store.append({
    sessionId: 'sess-1',
    type: 'sdk.message',
    payload: { message: { kind: 'thinking', text: 'Thinking' } },
  });

  const rows = await store.listBySession('sess-1');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, 'sdk.message');
});
```

- [x] **Step 2: Run the runtime-state tests to verify they fail**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/agent-v2/runtime/live-session-registry.test.mjs server/agent-v2/runtime/pending-interaction-registry.test.mjs server/agent-v2/debug/sdk-debug-log.test.mjs server/agent-v2/application/continue-conversation-run.test.mjs
```

Expected: FAIL because the registries/debug log do not exist and continue still requires `repo.getSession()`.

- [x] **Step 3: Implement the registries, debug log, and session-based abort path**

```js
export function createLiveSessionRegistry() {
  const sessions = new Map();
  return {
    set(sessionId, session) { sessions.set(sessionId, session); },
    get(sessionId) { return sessions.get(sessionId) || null; },
    has(sessionId) { return sessions.has(sessionId); },
    delete(sessionId) { sessions.delete(sessionId); },
  };
}
```

```js
export function createPendingInteractionRegistry() {
  const byRequestId = new Map();
  const bySessionId = new Map();
  return {
    add(interaction) {
      byRequestId.set(interaction.requestId, interaction);
      bySessionId.set(interaction.sessionId, interaction);
    },
    resolve(requestId) {
      const interaction = byRequestId.get(requestId) || null;
      if (!interaction) return null;
      byRequestId.delete(requestId);
      bySessionId.delete(interaction.sessionId);
      return interaction;
    },
    getBySession(sessionId) { return bySessionId.get(sessionId) || null; },
  };
}
```

```js
export async function continueConversationRun({ runtime, sessionId, prompt, model, projectPath, effort, permissionMode, toolsSettings, writer }) {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) throw new Error('Unable to continue run without a sessionId');

  const liveSession = runtime.liveSessions?.get(normalizedSessionId) || null;
  if (liveSession) {
    if (typeof runtime.reconnectSessionWriter === 'function') {
      runtime.reconnectSessionWriter(normalizedSessionId, writer);
    }
    return { session: liveSession, sessionId: normalizedSessionId };
  }

  return {
    session: runtime.resume(normalizedSessionId, buildClaudeV2RuntimeOptions({ model, projectPath, effort, permissionMode, toolsSettings, writer })),
    sessionId: normalizedSessionId,
  };
}
```

```js
} else if (data.type === 'abort-session') {
  await defaultAgentV2Services.abortSession({
    sessionId: data.sessionId,
    onEvent: (event) => writer.send(event),
  });
}
```

- [x] **Step 4: Run the runtime-state tests again**

Implementation note: the final v1 landed the live-session and pending-interaction runtime truth through the consolidated in-memory store at `server/agent-v2/application/in-memory-run-state-store.js` plus the session pool wiring, instead of separate `live-session-registry.js` / `pending-interaction-registry.js` files. The behavior target is covered, but the concrete file split differs from the original draft.

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/agent-v2/runtime/live-session-registry.test.mjs server/agent-v2/runtime/pending-interaction-registry.test.mjs server/agent-v2/debug/sdk-debug-log.test.mjs server/agent-v2/application/continue-conversation-run.test.mjs
```

Expected: PASS with live-session reuse, append-only debug logging, and no `repo.getSession()` requirement.

- [ ] **Step 5: Commit**

```bash
git add server/agent-v2/runtime/live-session-registry.js server/agent-v2/runtime/live-session-registry.test.mjs server/agent-v2/runtime/pending-interaction-registry.js server/agent-v2/runtime/pending-interaction-registry.test.mjs server/agent-v2/debug/sdk-debug-log.js server/agent-v2/debug/sdk-debug-log.test.mjs server/agent-v2/runtime/claude-v2-session-pool.js server/agent-v2/application/continue-conversation-run.js server/agent-v2/application/create-agent-v2-services.js server/index.js
git commit -m "refactor: make agent v2 runtime session-first"
```

## Task 4: Cut the frontend over to canonical session history

**Files:**
- Create: `src/components/chat-v2/types/sessionHistory.ts`
- Create: `src/components/chat-v2/api/fetchSessionHistory.ts`
- Create: `src/components/chat-v2/api/fetchSessionHistory.test.mjs`
- Create: `src/components/chat-v2/projection/projectOfficialSession.ts`
- Create: `src/components/chat-v2/projection/projectOfficialSession.test.mjs`
- Modify: `src/components/chat-v2/hooks/useHistoricalAgentConversation.ts`
- Modify: `src/components/chat/view/ChatInterface.tsx`

- [x] **Step 1: Write the failing frontend history tests**

```js
test('fetchSessionHistory calls the canonical history endpoint', async () => {
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      sessionId: 'sess-1',
      cwd: '/tmp/project',
      metadata: { title: null, pinned: false, starred: false, lastViewedAt: null },
      messages: [{ id: 'm1', role: 'assistant', text: 'hi', timestamp: '2026-04-22T10:00:01.000Z' }],
      diagnosticsSummary: { officialMessageCount: 1, debugLogAvailable: false },
    }),
  });

  const history = await fetchSessionHistory('sess-1');
  assert.equal(history.messages[0].text, 'hi');
});
```

```js
test('projectOfficialSession converts canonical messages into turns', () => {
  const turns = projectOfficialSession([
    { id: 'u1', role: 'user', text: 'hello', timestamp: '2026-04-22T10:00:00.000Z' },
    { id: 'a1', role: 'assistant', text: 'hi', timestamp: '2026-04-22T10:00:01.000Z' },
  ]);
  assert.equal(turns[0].assistantText, 'hi');
});
```

- [x] **Step 2: Run the frontend history tests to verify they fail**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/api/fetchSessionHistory.test.mjs src/components/chat-v2/projection/projectOfficialSession.test.mjs
```

Expected: FAIL because the new API/projection modules do not exist.

- [x] **Step 3: Implement the canonical frontend history types, fetcher, and projection**

```ts
export type CanonicalSessionMessage = {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  text?: string | null;
  toolName?: string | null;
  timestamp: string;
  kind?: 'text' | 'tool_use' | 'tool_result' | 'compact_boundary' | 'resume_boundary';
};

export type SessionHistoryResponse = {
  sessionId: string;
  cwd: string | null;
  metadata: {
    title: string | null;
    pinned: boolean;
    starred: boolean;
    lastViewedAt: string | null;
  };
  messages: CanonicalSessionMessage[];
  diagnosticsSummary: {
    officialMessageCount: number;
    debugLogAvailable: boolean;
  };
};
```

```ts
export async function fetchSessionHistory(sessionId: string): Promise<SessionHistoryResponse> {
  const response = await authenticatedFetch(`/api/agent-v2/sessions/${encodeURIComponent(sessionId)}/history`, { method: 'GET' });
  if (!response.ok) throw new Error(`Failed to fetch session history (${response.status})`);
  return response.json();
}
```

```ts
export function projectOfficialSession(messages: CanonicalSessionMessage[]): AssistantTurn[] {
  return messages
    .filter((message) => message.role === 'assistant' && message.kind !== 'tool_result')
    .map((message) => ({
      id: message.id,
      assistantText: message.text || '',
      timestamp: message.timestamp,
      blocks: [{ type: 'assistant_text', text: message.text || '' }],
    }));
}
```

- [x] **Step 4: Switch `useHistoricalAgentConversation` and `ChatInterface` to the canonical flow**

```ts
void fetchSessionHistory(sessionId)
  .then((nextHistory) => {
    if (cancelled) return;
    setHistory(nextHistory);
  });
```

```tsx
const historicalTurns = useMemo(() => {
  if (!historicalAgentConversation.history) return [];
  return projectOfficialSession(historicalAgentConversation.history.messages);
}, [historicalAgentConversation.history]);
```

Expected: `ChatInterface` no longer reads `historyMode`, `hasRenderableV2History`, or `eventsByRun`.

- [ ] **Step 5: Run the frontend history tests and typecheck**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/api/fetchSessionHistory.test.mjs src/components/chat-v2/projection/projectOfficialSession.test.mjs
npm run typecheck
```

Expected: PASS with the canonical types and no `historyMode` branch errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/chat-v2/types/sessionHistory.ts src/components/chat-v2/api/fetchSessionHistory.ts src/components/chat-v2/api/fetchSessionHistory.test.mjs src/components/chat-v2/projection/projectOfficialSession.ts src/components/chat-v2/projection/projectOfficialSession.test.mjs src/components/chat-v2/hooks/useHistoricalAgentConversation.ts src/components/chat/view/ChatInterface.tsx
git commit -m "refactor: render canonical agent session history"
```

## Task 5: Replace the custom realtime protocol with raw SDK message families

**Files:**
- Create: `src/components/chat-v2/projection/projectLiveSdkFeed.ts`
- Create: `src/components/chat-v2/projection/projectLiveSdkFeed.test.mjs`
- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.ts`
- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.helpers.ts`
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`
- Modify: `src/components/chat/view/agentV2Realtime.test.mjs`

- [x] **Step 1: Write the failing realtime tests**

```js
test('projectLiveSdkFeed keeps thinking, tool, and interaction blocks visible', () => {
  const blocks = projectLiveSdkFeed([
    { type: 'sdk.message', sessionId: 'sess-1', message: { kind: 'thinking', text: 'Working...' } },
    { type: 'sdk.message', sessionId: 'sess-1', message: { kind: 'tool_use', toolName: 'Read', input: { file_path: 'a.js' } } },
    { type: 'interaction.required', sessionId: 'sess-1', requestId: 'req-1', interaction: { kind: 'permission', toolName: 'Bash' } },
  ]);

  assert.deepEqual(blocks.map((block) => block.type), ['thinking', 'tool_use', 'interaction_required']);
});
```

```js
assert.match(source, /case 'sdk\\.message'/);
assert.match(source, /case 'interaction\\.required'/);
assert.doesNotMatch(source, /run\\.completed/);
```

- [x] **Step 2: Run the realtime tests to verify they fail**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/projectLiveSdkFeed.test.mjs src/components/chat/view/agentV2Realtime.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs
```

Expected: FAIL because the realtime path still expects `run.*`, `sdk.system.*`, and `tool.call.*`.

- [x] **Step 3: Implement the new realtime event family and UI projection**

```ts
export function projectLiveSdkFeed(events: AgentRealtimeEvent[]) {
  return events.flatMap((event) => {
    if (event.type === 'sdk.message') {
      return normalizeSdkMessageToBlocks(event.message);
    }
    if (event.type === 'interaction.required') {
      return [{ type: 'interaction_required', requestId: event.requestId, interaction: event.interaction }];
    }
    if (event.type === 'session.status') {
      return [{ type: 'session_status', status: event.status, sessionId: event.sessionId }];
    }
    if (event.type === 'debug.ref') {
      return [{ type: 'debug_ref', ref: event.ref, sessionId: event.sessionId }];
    }
    return [];
  });
}
```

```ts
switch (data.type) {
  case 'sdk.message':
  case 'session.status':
  case 'interaction.required':
  case 'interaction.resolved':
  case 'debug.ref':
    dispatchRealtimeEvent(data);
    break;
  default:
    return;
}
```

- [x] **Step 4: Run the realtime tests again**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/projectLiveSdkFeed.test.mjs src/components/chat/view/agentV2Realtime.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs
```

Expected: PASS with visible thinking/tool/interaction blocks and no `run.*` assertions remaining.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat-v2/projection/projectLiveSdkFeed.ts src/components/chat-v2/projection/projectLiveSdkFeed.test.mjs src/components/chat/hooks/useChatRealtimeHandlers.ts src/components/chat/hooks/useChatRealtimeHandlers.helpers.ts src/components/chat/view/subcomponents/ChatMessagesPane.tsx src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs src/components/chat/view/agentV2Realtime.test.mjs
git commit -m "refactor: expose raw sdk realtime events in chat ui"
```

## Task 6: Converge metadata, sidebar, and adapter behavior on official history only

**Files:**
- Modify: `server/database/db.js`
- Modify: `server/database/init.sql`
- Modify: `server/providers/claude/adapter.js`
- Modify: `server/projects.js`
- Modify: `server/routes/projects.test.mjs`
- Modify: `src/components/sidebar/hooks/useSidebarController.ts`

- [x] **Step 1: Write the failing metadata/sidebar tests**

```js
test('project session list overlays custom names without run-input history overlay', async () => {
  const sessions = await getProjectSessions('demo-project', 20, 0);
  assert.equal(sessions.sessions[0].summary, 'Pinned Name');
  assert.equal(sessions.sessions[0].lastActivity, '2026-04-22T10:00:01.000Z');
});
```

```js
test('claude adapter no longer merges agent run events onto official messages', async () => {
  const result = await adapter.getMessages({ sessionId: 'sess-1', offset: 0, limit: 20 });
  assert.equal(result.messages.some((message) => message.kind === 'agent_run_event'), false);
});
```

- [x] **Step 2: Run the metadata/sidebar tests to verify they fail**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/routes/projects.test.mjs server/providers/claude/adapter.test.mjs
```

Expected: FAIL because projects and adapter code still overlay `agent_runs` / `agent_run_events`.

- [x] **Step 3: Reuse `session_names` as the metadata store and remove DB overlays**

```js
const sessionMetadataDb = {
  getMetadata: async (sessionId) => ({
    title: sessionNamesDb.getName(sessionId, 'claude'),
    pinned: false,
    starred: false,
    lastViewedAt: null,
  }),
  setTitle: async (sessionId, title) => sessionNamesDb.setName(sessionId, 'claude', title),
};
```

```js
return {
  messages: normalized.sort((left, right) => String(left.timestamp || '').localeCompare(String(right.timestamp || ''))),
  total,
  hasMore,
  offset,
  limit,
};
```

```js
const customNames = sessionNamesDb.getNames(ids, 'claude');
for (const session of sessions) {
  const customName = customNames.get(session.id);
  if (customName) session.summary = customName;
}
```

- [x] **Step 4: Run the metadata/sidebar tests again**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/routes/projects.test.mjs
```

Expected: PASS with custom names still applied and no DB run overlay behavior.

- [ ] **Step 5: Commit**

```bash
git add server/database/db.js server/database/init.sql server/providers/claude/adapter.js server/projects.js server/routes/projects.test.mjs src/components/sidebar/hooks/useSidebarController.ts
git commit -m "refactor: converge metadata and sidebar on official history"
```

## Task 7: Retire legacy repository files, routes, and schema

**Files:**
- Modify: `server/routes/agent-v2.js`
- Modify: `server/routes/agent-v2.test.mjs`
- Modify: `server/database/db.js`
- Modify: `server/database/init.sql`
- Modify: `server/database/db-migration.test.mjs`
- Modify: `server/database/init-compat.test.mjs`
- Delete: `server/agent-v2/repository/sqlite-agent-v2-repository.js`
- Delete: `server/agent-v2/repository/agent-v2-repository.js`
- Delete: `server/agent-v2/application/run-event-pipeline.js`
- Delete: `src/components/chat-v2/api/fetchSessionRunHistory.ts`
- Delete: `src/components/chat-v2/api/fetchSessionRunHistory.test.mjs`
- Delete: `src/components/chat-v2/projection/projectAssistantTurnsForSession.ts`
- Delete: `src/components/chat-v2/projection/projectAssistantTurnsForSession.test.mjs`
- Delete: `src/components/chat-v2/projection/projectConversationStream.ts`
- Delete: `src/components/chat-v2/projection/projectConversationStream.test.mjs`

- [x] **Step 1: Write the failing cleanup tests**

```js
assert.equal(routePaths.includes('/conversations'), false);
assert.equal(routePaths.includes('/conversations/:id'), false);
assert.equal(routePaths.includes('/runs/:id/events'), false);
```

```js
const tables = migratedDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
assert.equal(tables.includes('agent_sessions'), false);
assert.equal(tables.includes('agent_runs'), false);
assert.equal(tables.includes('agent_run_events'), false);
assert.equal(tables.includes('session_names'), true);
assert.equal(tables.includes('sdk_debug_log'), true);
```

- [x] **Step 2: Run the cleanup tests to verify they fail**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/routes/agent-v2.test.mjs server/database/db-migration.test.mjs server/database/init-compat.test.mjs
```

Expected: FAIL because the aliases, run-event endpoint, and `agent_*` schema still exist.

- [x] **Step 3: Remove the legacy routes, schema, and dead files**

```js
router.post('/sessions/:id/runs', async (req, res, next) => {
  try {
    const result = await services.continueSessionRun({ sessionId: req.params.id, ...req.body });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});
```

```sql
CREATE TABLE IF NOT EXISTS session_names (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'claude',
  custom_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, provider)
);

CREATE TABLE IF NOT EXISTS sdk_debug_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

```bash
git rm server/agent-v2/repository/sqlite-agent-v2-repository.js \
  server/agent-v2/repository/agent-v2-repository.js \
  server/agent-v2/application/run-event-pipeline.js \
  src/components/chat-v2/api/fetchSessionRunHistory.ts \
  src/components/chat-v2/api/fetchSessionRunHistory.test.mjs \
  src/components/chat-v2/projection/projectAssistantTurnsForSession.ts \
  src/components/chat-v2/projection/projectAssistantTurnsForSession.test.mjs \
  src/components/chat-v2/projection/projectConversationStream.ts \
  src/components/chat-v2/projection/projectConversationStream.test.mjs
```

- [x] **Step 4: Run the cleanup tests plus a focused regression pass**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/routes/agent-v2.test.mjs server/database/db-migration.test.mjs server/database/init-compat.test.mjs server/routes/projects.test.mjs src/components/chat/view/agentV2Realtime.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs
npm run typecheck
```

Expected: PASS with no `agent_*` tables, no legacy conversation aliases, and no missing imports from deleted files.

- [ ] **Step 5: Commit**

```bash
git add server/routes/agent-v2.js server/routes/agent-v2.test.mjs server/database/db.js server/database/init.sql server/database/db-migration.test.mjs server/database/init-compat.test.mjs
git add -u server/agent-v2/repository server/agent-v2/application src/components/chat-v2/api src/components/chat-v2/projection
git commit -m "refactor: remove legacy agent v2 repository model"
```

## Task 8: Run the full targeted verification sweep

**Files:**
- Modify: `docs/superpowers/plans/2026-04-22-agent-v2-official-sdk-alignment-v1.md`

- [x] **Step 1: Run the backend verification set**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test \
  server/agent-v2/history/official-history-reader.test.mjs \
  server/agent-v2/history/session-history-service.test.mjs \
  server/agent-v2/runtime/live-session-registry.test.mjs \
  server/agent-v2/runtime/pending-interaction-registry.test.mjs \
  server/agent-v2/debug/sdk-debug-log.test.mjs \
  server/routes/agent-v2.test.mjs \
  server/routes/projects.test.mjs \
  server/database/db-migration.test.mjs \
  server/database/init-compat.test.mjs
```

Expected: PASS.

- [x] **Step 2: Run the frontend verification set**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test \
  src/components/chat-v2/api/fetchSessionHistory.test.mjs \
  src/components/chat-v2/projection/projectOfficialSession.test.mjs \
  src/components/chat-v2/projection/projectLiveSdkFeed.test.mjs \
  src/components/chat/view/agentV2Realtime.test.mjs \
  src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS with no lingering imports of removed history/run files.

- [ ] **Step 4: Update plan checkboxes and commit the completed migration**

```bash
git add docs/superpowers/plans/2026-04-22-agent-v2-official-sdk-alignment-v1.md
git commit -m "chore: mark agent v2 sdk alignment plan complete"
```

Verification note: the final targeted sweep expanded beyond the original draft and passed the focused Agent V2 backend/frontend regression set, including history, debug log, session-first runtime, project/sidebar, realtime projection, and message-pane coverage. `npm run typecheck` still fails, but the remaining failures are pre-existing TypeScript debt outside this migration's critical path:

- `src/components/chat/hooks/useChatSessionState.ts`
- `src/components/hooks/view/HookEditorPage.tsx`
- `src/components/right-pane/view/visual-html/grapes-like/SpacingOverlay.tsx`
- `src/components/right-pane/view/visual-html/htmlDocumentTransforms.ts`
- `src/components/right-pane/view/visual-html/useHtmlDocumentController.ts`

Near-field Agent V2 type regressions found during this refactor were cleaned up before close-out, including the `ClaudeEffortLevel` wiring between `ChatComposer`, `ChatInputControls`, and `ThinkingModeSelector`.

Commit note: this worktree is already dirty with unrelated changes, so commit checkboxes remain intentionally open in this plan update.

## Self-Review Notes

- Spec coverage: history truth source, session-first runtime, raw realtime visibility, metadata/debug thin persistence, sidebar/adapter convergence, and old-table retirement each map to at least one task.
- Placeholder scan: the plan intentionally uses exact file paths, test names, commands, and commit messages; there are no `TODO`/`TBD` markers.
- Type consistency: the same names are used throughout the plan:
  - `createOfficialHistoryReader`
  - `createSessionHistoryService`
  - `createLiveSessionRegistry`
  - `createPendingInteractionRegistry`
  - `createSdkDebugLog`
  - `SessionHistoryResponse`
  - `projectOfficialSession`
  - `projectLiveSdkFeed`
