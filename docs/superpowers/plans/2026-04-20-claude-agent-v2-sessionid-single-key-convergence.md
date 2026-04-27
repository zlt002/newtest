# Claude Agent V2 SessionId Single-Key Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Claude Agent V2 的产品层与运行时层统一收口到 `sessionId` 单主键模型，删除 `conversationId` 对主链的控制权与长期兼容债务。

**Architecture:** 后端以 Claude Agent SDK 原生 `sessionId` 为唯一会话身份，把产品会话壳、run、event、权限恢复、前端路由与投影全部围绕 `sessionId` 建模。运行时不再依赖 `conversationId -> sessionId` 的绑定跳转；如果仍保留产品元数据，它也直接挂在 `sessionId` 上，而不是额外生成第二套主 id。

**Tech Stack:** Node.js, better-sqlite3, Claude Agent SDK V2, WebSocket, React, TypeScript, node:test

---

## File Structure

### 数据层
- Modify: `server/database/init.sql`
- Modify: `server/database/db.js`
- Modify: `server/agent-v2/repository/sqlite-agent-v2-repository.js`
- Modify: `server/agent-v2/repository/agent-v2-repository.js`
- Modify: `server/agent-v2/repository/agent-v2-repository.test.mjs`

### 应用层 / 路由
- Modify: `server/agent-v2/application/start-conversation-run.js`
- Modify: `server/agent-v2/application/continue-conversation-run.js`
- Modify: `server/agent-v2/application/create-agent-v2-services.js`
- Modify: `server/agent-v2/application/handle-claude-command.js`
- Modify: `server/routes/agent-v2.js`
- Modify: `server/index.js`
- Modify: `server/agent-v2/application/*.test.mjs`
- Modify: `server/routes/agent-v2.test.mjs`

### 前端状态 / 投影
- Modify: `src/components/chat/view/ChatInterface.tsx`
- Modify: `src/components/chat/view/agentV2Realtime.ts`
- Modify: `src/components/chat/hooks/useChatComposerState.ts`
- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.ts`
- Modify: `src/components/chat-v2/store/createAgentEventStore.ts`
- Modify: `src/components/chat-v2/hooks/useAgentConversation.ts`
- Modify: `src/components/chat-v2/projection/projectConversationStream.ts`
- Modify: `src/components/chat-v2/types/agentEvents.ts`
- Modify: `src/components/chat-v2/types/runState.ts`
- Modify: 对应 `*.test.mjs` / `*.test.ts` 文件

### 清理 / 文档
- Modify: `server/agent-v2/domain/conversation.js`
- Modify: `docs/superpowers/specs/2026-04-19-claude-agent-v2-conversation-shell-run-core-convergence-design.md`
- Modify: `docs/superpowers/specs/2026-04-19-claude-agent-v2-conversation-shell-run-core-design.md`

### 删除候选
- Delete: `server/agent-v2/domain/conversation.js`（确认无引用后）
- Delete: `agent_conversation_runtime_binding` 相关 schema 和 repository API
- Delete: 所有 `findConversationBySessionId` / `bindConversationSession` / `listConversationRuns` 主路径实现

---

### Task 1: 把持久化模型改成 Session-First

**Files:**
- Modify: `server/database/init.sql`
- Modify: `server/database/db.js`
- Modify: `server/agent-v2/repository/sqlite-agent-v2-repository.js`
- Modify: `server/agent-v2/repository/agent-v2-repository.js`
- Test: `server/agent-v2/repository/agent-v2-repository.test.mjs`

- [ ] **Step 1: 写失败测试，要求 repository 只靠 `sessionId` 就能完整查回 session 元数据、run 和 event**

```js
test('session-first repository can resolve metadata, runs, and events by sessionId only', async () => {
  const repo = createAgentV2Repository();
  const sessionRecord = await repo.createSession({ sessionId: 'sess-1', title: '新会话' });
  const run = await repo.createRun({ sessionId: sessionRecord.id, userInput: 'hello' });

  await repo.appendRunEvent(createAgentEventEnvelope({
    runId: run.id,
    sessionId: sessionRecord.id,
    sequence: 1,
    type: 'run.started',
    payload: {},
  }));

  const fetchedSession = await repo.getSession('sess-1');
  const latestRun = await repo.findLatestRunBySessionId('sess-1');
  const sessionEvents = await repo.listSessionEvents('sess-1');

  assert.equal(fetchedSession?.id, 'sess-1');
  assert.equal(latestRun?.sessionId, 'sess-1');
  assert.equal(sessionEvents[0]?.sessionId, 'sess-1');
});
```

- [ ] **Step 2: 运行测试，确认它因缺少 `createSession/getSession` 等 session-first API 而失败**

Run: `node --test server/agent-v2/repository/agent-v2-repository.test.mjs`
Expected: FAIL with missing session-first repository methods or mismatched schema fields

- [ ] **Step 3: 最小实现内存仓储的 session-first API**

```js
const sessions = new Map();

async createSession({ sessionId, title }) {
  const record = {
    id: sessionId,
    title,
    createdAt: new Date().toISOString(),
  };
  sessions.set(record.id, record);
  return record;
},

async getSession(sessionId) {
  return sessions.get(sessionId) || null;
},

async createRun({ sessionId, userInput }) {
  const record = {
    id: crypto.randomUUID(),
    sessionId,
    userInput,
    status: 'queued',
    createdAt: new Date().toISOString(),
  };
  runs.set(record.id, record);
  return record;
},
```

- [ ] **Step 4: 最小实现 SQLite schema 与 repository 的 session-first 结构**

```sql
CREATE TABLE IF NOT EXISTS agent_sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    user_input TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agent_run_events (
    event_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
);
```

- [ ] **Step 5: 在迁移代码里为旧库做一次性破坏性重建或最小迁移兜底**

```js
db.exec('DROP TABLE IF EXISTS agent_conversation_runtime_binding');
db.exec('ALTER TABLE agent_runs RENAME TO agent_runs_legacy');
db.exec('ALTER TABLE agent_run_events RENAME TO agent_run_events_legacy');
db.exec('DROP TABLE IF EXISTS agent_conversations');
db.exec(initSessionFirstSql);
```

说明：如果项目决定“不保旧会话历史”，优先采用直接重建 V2 表而不是复杂迁移。

- [ ] **Step 6: 跑 repository 测试确认 session-first 落库通过**

Run: `node --test server/agent-v2/repository/agent-v2-repository.test.mjs`
Expected: PASS with all repository tests green

- [ ] **Step 7: Commit**

```bash
git add server/database/init.sql server/database/db.js server/agent-v2/repository/sqlite-agent-v2-repository.js server/agent-v2/repository/agent-v2-repository.js server/agent-v2/repository/agent-v2-repository.test.mjs
git commit -m "refactor: make agent v2 persistence session-first"
```

### Task 2: 把后端应用层和 WebSocket 主链改成只认 SessionId

**Files:**
- Modify: `server/agent-v2/application/start-conversation-run.js`
- Modify: `server/agent-v2/application/continue-conversation-run.js`
- Modify: `server/agent-v2/application/create-agent-v2-services.js`
- Modify: `server/agent-v2/application/handle-claude-command.js`
- Modify: `server/routes/agent-v2.js`
- Modify: `server/index.js`
- Test: `server/agent-v2/application/*.test.mjs`
- Test: `server/routes/agent-v2.test.mjs`

- [ ] **Step 1: 写失败测试，要求 start/continue/handle-command 都只用 `sessionId`**

```js
test('handleClaudeCommandWithAgentV2 routes entirely by sessionId', async () => {
  const calls = [];
  const services = {
    async startSessionRun(input) {
      calls.push({ type: 'start', input });
      return { session: { id: 'sess-1' }, run: { id: 'run-1', sessionId: 'sess-1' }, events: [] };
    },
    async continueSessionRun(input) {
      calls.push({ type: 'continue', input });
      return { session: { id: 'sess-1' }, run: { id: 'run-2', sessionId: 'sess-1' }, events: [] };
    },
  };

  await handleClaudeCommandWithAgentV2({ services, sessionId: 'sess-1', prompt: 'continue' });
  assert.equal(calls[0]?.type, 'continue');
  assert.equal(calls[0]?.input.sessionId, 'sess-1');
});
```

- [ ] **Step 2: 运行应用层测试，确认因 `conversationId` 仍然存在主路径而失败**

Run: `node --test server/agent-v2/application/*.test.mjs server/routes/agent-v2.test.mjs`
Expected: FAIL with obsolete conversation-based expectations

- [ ] **Step 3: 把 use case 和 services 重命名并切换到 session-first**

```js
export async function startSessionRun({ repo, runtime, title, prompt, ...options }) {
  const session = runtime.create(buildClaudeV2RuntimeOptions(options));
  const sessionId = readSessionId(session);
  const sessionRecord = await repo.createSession({ sessionId, title });
  const run = await repo.createRun({ sessionId: sessionRecord.id, userInput: prompt });
  return { session: sessionRecord, run, runtimeSession: session, sessionId };
}
```

- [ ] **Step 4: 删除绑定跳转逻辑，WebSocket 主链只保留 `sessionId`**

```js
socket.on('agent-run', async ({ sessionId, prompt, ...rest }) => {
  const result = sessionId
    ? await services.continueSessionRun({ sessionId, prompt, ...rest })
    : await services.startSessionRun({ prompt, ...rest });
  writer.send({ type: 'run.event.batch', sessionId: result.sessionId, events: result.events });
});
```

- [ ] **Step 5: 跑应用层与路由测试确认后端主链完全 session-first**

Run: `node --test server/agent-v2/application/*.test.mjs server/routes/agent-v2.test.mjs`
Expected: PASS with no conversation-first routing left

- [ ] **Step 6: Commit**

```bash
git add server/agent-v2/application server/routes/agent-v2.js server/index.js
git commit -m "refactor: make agent v2 runtime flow session-first"
```

### Task 3: 把前端当前执行态与历史展示统一到 SessionId

**Files:**
- Modify: `src/components/chat/view/ChatInterface.tsx`
- Modify: `src/components/chat/view/agentV2Realtime.ts`
- Modify: `src/components/chat/hooks/useChatComposerState.ts`
- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.ts`
- Modify: `src/components/chat-v2/store/createAgentEventStore.ts`
- Modify: `src/components/chat-v2/hooks/useAgentConversation.ts`
- Modify: `src/components/chat-v2/projection/projectConversationStream.ts`
- Modify: `src/components/chat-v2/types/agentEvents.ts`
- Modify: `src/components/chat-v2/types/runState.ts`
- Test: `src/components/chat/**/*.test.*`
- Test: `src/components/chat-v2/**/*.test.*`

- [ ] **Step 1: 写失败测试，要求前端只靠 `sessionId` 续跑和重放**

```js
test('agent event store and realtime coordinator key current execution by sessionId only', () => {
  const store = createAgentEventStore();
  store.append({ eventId: '1', runId: 'run-1', sessionId: 'sess-1', sequence: 1, type: 'run.started', timestamp: '2026-04-20T00:00:00.000Z', payload: {} });

  assert.equal(store.listBySession('sess-1').length, 1);
  assert.equal(store.listBySession('sess-1')[0].sessionId, 'sess-1');
});
```

- [ ] **Step 2: 运行前端相关测试，确认 `conversationId` 相关类型或聚合仍造成失败**

Run: `node --test src/components/chat/**/*.test.* src/components/chat-v2/**/*.test.*`
Expected: FAIL with remaining conversation-first assumptions

- [ ] **Step 3: 把事件类型、projection 和 hooks 里的 `conversationId` 字段删除或降为兼容可选字段**

```ts
export type AgentEventEnvelope = {
  eventId: string;
  runId: string;
  sessionId: string;
  sequence: number;
  type: AgentEventType;
  timestamp: string;
  payload: Record<string, unknown>;
};
```

- [ ] **Step 4: 把 composer、realtime coordinator、界面选中态都统一到 `sessionId`**

```ts
const targetSessionId = selectedSession?.id || currentSessionId || null;
submitAgentRun({
  sessionId: targetSessionId,
  prompt: input,
});
```

- [ ] **Step 5: 跑前端测试与 typecheck，确认当前执行态已不受 `conversationId` 干扰**

Run: `node --test src/components/chat/**/*.test.* src/components/chat-v2/**/*.test.*`
Expected: PASS with session-based expectations

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/chat src/components/chat-v2
git commit -m "refactor: align chat frontend to session-first agent state"
```

### Task 4: 删除残余 Conversation 兼容层并统一命名

**Files:**
- Modify: `server/agent-v2/domain/conversation.js`
- Modify: `docs/superpowers/specs/2026-04-19-claude-agent-v2-conversation-shell-run-core-convergence-design.md`
- Modify: `docs/superpowers/specs/2026-04-19-claude-agent-v2-conversation-shell-run-core-design.md`
- Test: 全量受影响测试

- [ ] **Step 1: 搜索所有残余 `conversationId` 主路径引用并收敛成清单**

Run: `rg -n "conversationId|conversation_id|agent_conversations|runtime_binding" server src docs`
Expected: 只剩文档、迁移注释、或待删除兼容层

- [ ] **Step 2: 删除无用 domain/model 和旧命名 API**

```js
// 删除前
export function createConversation({ id, title, sessionId = null, createdAt = new Date().toISOString() }) {
  return { id, title, sessionId, createdAt };
}

// 删除后：如果仍需产品元数据，统一由 createSessionRecord 表达
export function createSessionRecord({ id, title, createdAt = new Date().toISOString() }) {
  return { id, title, createdAt };
}
```

- [ ] **Step 3: 更新设计文档，明确项目最终模型是 `sessionId` 单主键**

```md
- `sessionId` = runtime truth + product truth
- `runId` = 单次执行主键
- `eventId` = 事件主键
- `conversationId` 不再作为运行时或产品会话主身份
```

- [ ] **Step 4: 跑全量关键验证，确认可以对外宣称“主链已与 SDK 原生模型高度一致”**

Run: `node --test server/agent-v2/**/*.test.mjs src/components/chat/**/*.test.* src/components/chat-v2/**/*.test.* server/routes/agent-v2.test.mjs`
Expected: PASS

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/agent-v2 docs
git commit -m "refactor: remove remaining conversation-first compatibility layer"
```

---

## Self-Review

### Spec coverage
- session-first 数据模型：Task 1
- 后端主链统一：Task 2
- 前端状态与路由统一：Task 3
- 文档与兼容层删减：Task 4

### Placeholder scan
- 所有任务都给出了明确文件、测试命令、预期结果与最小代码方向
- 未使用 `TODO/TBD/implement later` 这类占位语句

### Type consistency
- 最终主键统一为 `sessionId`
- 运行记录统一为 `runId`
- 事件统一为 `eventId`
- `conversationId` 只允许出现在清理任务的“待删除项”中

---

Plan complete and saved to `docs/superpowers/plans/2026-04-20-claude-agent-v2-sessionid-single-key-convergence.md`. Two execution options:

**1. Subagent-Driven (recommended)** - 我按任务拆给独立 worker 并逐段 review

**2. Inline Execution** - 我在当前会话里按这个计划连续实现，分批给你 checkpoint

Which approach?
