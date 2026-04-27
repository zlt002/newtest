# Claude Agent V2 Conversation-Shell Run-Core 收口实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把新会话、继续会话和失败重试收口到同一条 V2 入口，并让旧聊天链路退化为只读兼容层，彻底止住会话串线和状态回跳问题。

**Architecture:** 前端只保留一个新消息提交入口，由 V2 conversation / run / event 作为权威状态源；旧 `sessionStore`、旧 realtime handler 和旧 session 视图只做历史展示，不再决定消息发送目标。后端继续沿用现有 `server/agent-v2` 分层，但把 transport、conversation binding 和失败提示统一收紧到同一条路上。

**Tech Stack:** Node.js, Express, WebSocket, SQLite, Claude Agent SDK V2, React 18, TypeScript, Node test runner

---

## 文件结构

### 修改

- `src/components/chat/hooks/chatComposerSessionTarget.js`
  收口 composer 的提交意图，显式区分新会话、继续会话和临时 session
- `src/components/chat/hooks/chatComposerSessionTarget.test.mjs`
  覆盖新会话、真实会话、临时 session 三种提交意图
- `src/components/chat/view/ChatInterface.tsx`
  只保留一个 V2 提交入口，避免旧链路重新抢占发送目标
- `src/components/chat/hooks/useChatRealtimeHandlers.ts`
  收紧旧消息处理，只保留历史兼容和事件转发，不再参与新会话路由
- `src/components/chat/hooks/useChatSessionState.ts`
  保留旧历史展示，但不再把旧 session 作为新消息路由的权威源
- `src/components/chat/hooks/transientSessionState.ts`
  明确临时 session 的过渡条件与退出条件
- `src/components/chat/view/agentConversationContext.ts`
  统一判断 V2 conversation 绑定是否需要重置
- `src/components/chat/view/agentComposerState.ts`
  修正 context bar 状态文案，确保失败态与准备态不会互相覆盖
- `src/components/chat-v2/view/AgentConversationShell.ts`
  继续作为 V2 事件投影壳，补足失败引导与新建会话按钮行为
- `src/components/chat-v2/projection/projectRunExecution.ts`
  强化 run 失败投影和错误文案
- `src/components/chat-v2/projection/runFailureMessage.js`
  统一旧坏会话失败提示
- `server/agent-v2/application/handle-claude-command.js`
  收口 WebSocket 入口的 start / continue 决策
- `server/agent-v2/application/create-agent-v2-services.js`
  统一 conversation / run / session binding 的执行顺序
- `server/agent-v2/repository/sqlite-agent-v2-repository.js`
  保证 conversation / run / event / binding 的读写闭环
- `server/database/init.sql`
  增补或校验 agent_v2 表结构
- `server/index.js`
  保持 V2 路由挂载，清理会影响新会话路由的旧入口

### 测试

- `src/components/chat/hooks/chatComposerSessionTarget.test.mjs`
- `src/components/chat/hooks/useChatSessionState.test.mjs`
- `src/components/chat/view/agentComposerState.test.mjs`
- `src/components/chat/view/agentConversationContext.test.mjs`
- `src/components/chat/view/agentV2Realtime.test.mjs`
- `src/components/chat-v2/projection/projectRunExecution.test.mjs`
- `src/components/chat-v2/view/AgentConversationShell.test.mjs`
- `server/agent-v2/application/handle-claude-command.test.mjs`
- `server/agent-v2/application/create-agent-v2-services.test.mjs`
- `server/agent-v2/repository/agent-v2-repository.test.mjs`

---

### Task 1: 收口 composer 提交意图

**Files:**
- Modify: `src/components/chat/hooks/chatComposerSessionTarget.js`
- Test: `src/components/chat/hooks/chatComposerSessionTarget.test.mjs`

- [ ] **Step 1: 写失败测试，锁定三种提交意图**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveComposerSubmitTarget } from './chatComposerSessionTarget.js';

test('selectedSession + agentConversationId resolves to continue mode', () => {
  assert.deepEqual(
    resolveComposerSubmitTarget({
      selectedSessionId: 'session-1',
      currentSessionId: 'new-session-123',
      agentConversationId: 'conv-1',
    }),
    {
      mode: 'continue',
      sessionId: 'session-1',
      conversationId: 'conv-1',
    },
  );
});

test('new-session 草稿只保留临时 session，不生成 conversation binding', () => {
  assert.deepEqual(
    resolveComposerSubmitTarget({
      selectedSessionId: null,
      currentSessionId: 'new-session-123',
      agentConversationId: null,
    }),
    {
      mode: 'new',
      sessionId: 'new-session-123',
      conversationId: null,
    },
  );
});

test('真实 session 在未绑定 conversation 时不应继续冒充提交目标', () => {
  assert.deepEqual(
    resolveComposerSubmitTarget({
      selectedSessionId: null,
      currentSessionId: 'real-session-from-cloudcli',
      agentConversationId: null,
    }),
    {
      mode: 'new-conversation',
      sessionId: null,
      conversationId: null,
    },
  );
});
```

- [ ] **Step 2: 运行测试确认当前实现不足**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/hooks/chatComposerSessionTarget.test.mjs`

Expected: FAIL，因为当前 helper 还没有 `resolveComposerSubmitTarget` 这类显式意图对象。

- [ ] **Step 3: 实现提交意图收口**

```js
export function resolveComposerSubmitTarget({
  selectedSessionId,
  currentSessionId,
  agentConversationId,
}) {
  if (selectedSessionId && agentConversationId) {
    return {
      mode: 'continue',
      sessionId: selectedSessionId,
      conversationId: agentConversationId,
    };
  }

  if (currentSessionId && currentSessionId.startsWith('new-session-')) {
    return {
      mode: 'new',
      sessionId: currentSessionId,
      conversationId: null,
    };
  }

  return {
    mode: 'new-conversation',
    sessionId: null,
    conversationId: null,
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/hooks/chatComposerSessionTarget.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/chat/hooks/chatComposerSessionTarget.js src/components/chat/hooks/chatComposerSessionTarget.test.mjs
git commit -m "fix: narrow composer submit target for v2 conversations"
```

---

### Task 2: 收紧 V2 会话绑定与失败引导

**Files:**
- Modify: `server/agent-v2/application/handle-claude-command.js`
- Modify: `server/agent-v2/application/create-agent-v2-services.js`
- Modify: `server/agent-v2/repository/sqlite-agent-v2-repository.js`
- Modify: `src/components/chat-v2/projection/projectRunExecution.ts`
- Modify: `src/components/chat-v2/projection/runFailureMessage.js`
- Test: `server/agent-v2/application/handle-claude-command.test.mjs`
- Test: `server/agent-v2/application/create-agent-v2-services.test.mjs`
- Test: `src/components/chat-v2/projection/projectRunExecution.test.mjs`

- [ ] **Step 1: 写失败测试，锁定旧坏会话的引导文案**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRunFailureMessage } from './runFailureMessage.js';

test('error_during_execution returns a new-session retry hint', () => {
  assert.equal(
    resolveRunFailureMessage({ subtype: 'error_during_execution' }),
    '该旧会话已无法继续，建议新建会话后重试。',
  );
});
```

- [ ] **Step 2: 写失败测试，锁定 start / continue 的分流**

```js
test('with explicit conversationId the transport continues the same conversation', async () => {
  const writer = createWriter();
  const calls = [];
  const services = {
    async startConversationRun() {
      throw new Error('should not start');
    },
    async continueConversationRun(input) {
      calls.push(input);
      return {
        conversation: { id: 'conv-9' },
        run: { id: 'run-9' },
        sessionId: 'sess-9',
        events: [
          { eventId: 'evt-9', conversationId: 'conv-9', runId: 'run-9', sessionId: 'sess-9', sequence: 1, type: 'run.completed', timestamp: '2026-04-19T12:10:00.000Z', payload: { result: 'done' } },
        ],
      };
    },
  };
  const repo = {
    async findConversationBySessionId(sessionId) {
      assert.equal(sessionId, 'sess-9');
      return { id: 'conv-9' };
    },
  };

  await handleClaudeCommandWithAgentV2({
    command: '继续',
    options: {
      conversationId: 'conv-9',
      projectPath: '/workspace/demo-project',
      model: 'claude-opus-4-7',
    },
    services,
    repo,
    writer,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].conversationId, 'conv-9');
  assert.equal(writer.messages[0]?.type, 'run.completed');
  assert.equal(writer.messages[1]?.kind, 'complete');
});

test('without conversationId the transport starts a fresh conversation run', async () => {
  const writer = createWriter();
  const services = {
    async startConversationRun(input) {
      assert.equal(input.title, 'demo-project');
      return {
        conversation: { id: 'conv-1', title: 'demo-project' },
        run: { id: 'run-1' },
        sessionId: 'sess-1',
        events: [
          { eventId: 'evt-1', conversationId: 'conv-1', runId: 'run-1', sessionId: 'sess-1', sequence: 1, type: 'run.started', timestamp: '2026-04-19T12:00:00.000Z', payload: {} },
          { eventId: 'evt-2', conversationId: 'conv-1', runId: 'run-1', sessionId: 'sess-1', sequence: 2, type: 'run.completed', timestamp: '2026-04-19T12:00:01.000Z', payload: { result: 'done' } },
        ],
      };
    },
    async continueConversationRun() {
      throw new Error('should not continue');
    },
  };
  const repo = {
    async findConversationBySessionId() {
      return null;
    },
  };

  await handleClaudeCommandWithAgentV2({
    command: '帮我总结一下',
    options: {
      projectPath: '/workspace/demo-project',
      model: 'claude-opus-4-7',
    },
    services,
    repo,
    writer,
  });

  assert.equal(writer.messages[0]?.kind, 'session_created');
  assert.equal(writer.messages[1]?.type, 'run.started');
});
```

- [ ] **Step 3: 运行测试确认当前分流和失败投影仍有缺口**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test server/agent-v2/application/handle-claude-command.test.mjs server/agent-v2/application/create-agent-v2-services.test.mjs src/components/chat-v2/projection/projectRunExecution.test.mjs`

Expected: 先有至少一个失败点，用来定位当前收口还没完全落稳的地方。

- [ ] **Step 4: 实现分流、绑定和失败投影**

```js
// handle-claude-command.js
const resumeRequested = Boolean(options.resume || sessionId || explicitConversationId);
const boundConversation = !explicitConversationId && sessionId
  ? await repo.findConversationBySessionId(sessionId)
  : null;
const conversationId = explicitConversationId || boundConversation?.id || null;

const result = (resumeRequested && conversationId)
  ? await services.continueConversationRun(/* ... */)
  : await services.startConversationRun(/* ... */);
```

```js
// runFailureMessage.js
if (subtype === 'error_during_execution') {
  return '该旧会话已无法继续，建议新建会话后重试。';
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test server/agent-v2/application/handle-claude-command.test.mjs server/agent-v2/application/create-agent-v2-services.test.mjs src/components/chat-v2/projection/projectRunExecution.test.mjs`

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add server/agent-v2/application/handle-claude-command.js server/agent-v2/application/create-agent-v2-services.js server/agent-v2/repository/sqlite-agent-v2-repository.js src/components/chat-v2/projection/projectRunExecution.ts src/components/chat-v2/projection/runFailureMessage.js server/agent-v2/application/handle-claude-command.test.mjs server/agent-v2/application/create-agent-v2-services.test.mjs src/components/chat-v2/projection/projectRunExecution.test.mjs
git commit -m "fix: converge agent v2 session binding and failure hints"
```

---

### Task 3: 让前端只保留一条新会话路径

**Files:**
- Modify: `src/components/chat/view/ChatInterface.tsx`
- Modify: `src/components/chat/hooks/useChatComposerState.ts`
- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.ts`
- Modify: `src/components/chat/hooks/useChatSessionState.ts`
- Modify: `src/components/chat/hooks/transientSessionState.ts`
- Modify: `src/components/chat/view/agentConversationContext.ts`
- Modify: `src/components/chat/view/agentComposerState.ts`
- Modify: `src/components/chat-v2/view/AgentConversationShell.ts`
- Test: `src/components/chat/hooks/useChatSessionState.test.mjs`
- Test: `src/components/chat/view/agentConversationContext.test.mjs`
- Test: `src/components/chat/view/agentComposerState.test.mjs`
- Test: `src/components/chat/view/agentV2Realtime.test.mjs`
- Test: `src/components/chat-v2/view/AgentConversationShell.test.mjs`

- [ ] **Step 1: 写失败测试，锁定临时 session 只做过渡**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldPreserveTransientSessionState } from './transientSessionState.ts';

test('new-session temp state is preserved only when the pending session matches', () => {
  assert.equal(
    shouldPreserveTransientSessionState({
      currentSessionId: 'new-session-123',
      nextSessionId: 'session-real-123',
      pendingSessionId: 'session-real-123',
    }),
    true,
  );
});
```

- [ ] **Step 2: 写失败测试，锁定 conversation 切换时不会回跳**

```js
import { resolveVisibleChatSessionId } from './chatSessionViewState.ts';
import { shouldPreserveTransientSessionState } from './transientSessionState.ts';

test('pending real session keeps the transient view visible until binding settles', () => {
  assert.equal(
    resolveVisibleChatSessionId({
      selectedSessionId: null,
      currentSessionId: 'new-session-123',
      pendingSessionId: 'session-real-123',
    }),
    'session-real-123',
  );

  assert.equal(
    shouldPreserveTransientSessionState({
      currentSessionId: 'new-session-123',
      nextSessionId: 'session-real-123',
      pendingSessionId: 'session-real-123',
    }),
    true,
  );
});
```

- [ ] **Step 3: 运行前端相关测试确认当前仍有回跳风险**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/hooks/useChatSessionState.test.mjs src/components/chat/view/agentConversationContext.test.mjs src/components/chat/view/agentComposerState.test.mjs src/components/chat/view/agentV2Realtime.test.mjs src/components/chat-v2/view/AgentConversationShell.test.mjs`

Expected: 至少一个测试提示状态绑定还不够严格。

- [ ] **Step 4: 实现前端单轨显示与转场**

```tsx
// ChatInterface.tsx
const agentConversation = useAgentConversation({
  conversationId: agentConversationId,
  listEventsByConversation: (conversationId) => agentEventStoreRef.current.listByConversation(conversationId),
});

const composerState = resolveAgentComposerState({
  isLoading,
  claudeStatusText: String(claudeStatus?.text || '').trim() || null,
  execution: agentConversation.execution,
});
```

```ts
// agentConversationContext.ts
export function shouldResetAgentConversationId({
  previousSelection,
  nextSelection,
}) {
  return (
    previousSelection.projectKey !== nextSelection.projectKey ||
    previousSelection.sessionId !== nextSelection.sessionId
  );
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/hooks/useChatSessionState.test.mjs src/components/chat/view/agentConversationContext.test.mjs src/components/chat/view/agentComposerState.test.mjs src/components/chat/view/agentV2Realtime.test.mjs src/components/chat-v2/view/AgentConversationShell.test.mjs`

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/components/chat/view/ChatInterface.tsx src/components/chat/hooks/useChatRealtimeHandlers.ts src/components/chat/hooks/useChatSessionState.ts src/components/chat/hooks/transientSessionState.ts src/components/chat/view/agentConversationContext.ts src/components/chat/view/agentComposerState.ts src/components/chat-v2/view/AgentConversationShell.ts src/components/chat/hooks/useChatSessionState.test.mjs src/components/chat/view/agentConversationContext.test.mjs src/components/chat/view/agentComposerState.test.mjs src/components/chat/view/agentV2Realtime.test.mjs src/components/chat-v2/view/AgentConversationShell.test.mjs
git commit -m "fix: keep chat v2 as the only active submission path"
```

---

### Task 4: 验证数据库闭环与端到端串线回归

**Files:**
- Modify: `server/database/init.sql`
- Modify: `server/agent-v2/repository/sqlite-agent-v2-repository.js`
- Modify: `server/index.js`
- Modify: `src/contexts/WebSocketContext.tsx`
- Test: `server/agent-v2/repository/agent-v2-repository.test.mjs`
- Test: `src/contexts/WebSocketContext.test.mjs`
- Test: `src/hooks/useProjectsState.test.mjs`

- [ ] **Step 1: 写失败测试，锁定数据库表和 binding 查询**

```js
test('repository can bind a conversation to a session and read it back', async () => {
  const repo = createSqliteAgentV2Repository({ db });
  const conversation = await repo.createConversation({ title: 'html' });
  await repo.bindConversationSession(conversation.id, 'sess-1');
  assert.equal(await repo.getConversationSession(conversation.id), 'sess-1');
});
```

- [ ] **Step 2: 写失败测试，锁定 WebSocket 只消费统一事件包络**

```js
test('isAgentEventEnvelopeMessage only accepts normalized agent events', () => {
  assert.equal(
    isAgentEventEnvelopeMessage({
      eventId: 'evt-1',
      conversationId: 'conv-1',
      runId: 'run-1',
      sequence: 1,
      type: 'run.started',
    }),
    true,
  );
});
```

- [ ] **Step 3: 运行仓储和 websocket 测试确认收口前仍有缺口**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test server/agent-v2/repository/agent-v2-repository.test.mjs src/contexts/WebSocketContext.test.mjs src/hooks/useProjectsState.test.mjs`

Expected: 可能有一项测试失败，用来暴露当前串线风险仍未完全收口。

- [ ] **Step 4: 实现数据库和 WebSocket 兜底一致性**

```sql
CREATE TABLE IF NOT EXISTS agent_conversation_runtime_binding (
  conversation_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES agent_conversations(id) ON DELETE CASCADE
);
```

```tsx
// WebSocketContext.tsx
export const isAgentEventEnvelopeMessage = (message: any) => (
  typeof message?.eventId === 'string'
  && typeof message?.conversationId === 'string'
  && typeof message?.runId === 'string'
  && typeof message?.sequence === 'number'
  && typeof message?.type === 'string'
);
```

- [ ] **Step 5: 跑测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test server/agent-v2/repository/agent-v2-repository.test.mjs src/contexts/WebSocketContext.test.mjs src/hooks/useProjectsState.test.mjs`

Expected: PASS

- [ ] **Step 6: 执行一次真实回归**

Run: 启动本地开发环境，在 `html` 项目中新建会话并发送一条消息，再切换到 `cloudcli` 项目确认不会复用同一个新会话。

Expected: `html` 的新会话留在 `html`，不会再跳到 `cloudcli`。

- [ ] **Step 7: 提交**

```bash
git add server/database/init.sql server/agent-v2/repository/sqlite-agent-v2-repository.js server/index.js src/contexts/WebSocketContext.tsx server/agent-v2/repository/agent-v2-repository.test.mjs src/contexts/WebSocketContext.test.mjs src/hooks/useProjectsState.test.mjs
git commit -m "fix: close agent v2 persistence and websocket routing"
```

---

## 验收标准

1. 在 `html` 项目新建会话并发送消息，不会再串到 `cloudcli`。
2. `new-session-*` 只会在真实 session 到达前作为过渡态存在。
3. 旧坏会话会明确提示“建议新建会话后重试”。
4. 新会话和继续会话都只能通过 V2 事件和 conversation binding 决策。
5. 旧链路只剩历史展示能力，不再决定新消息发送目标。
