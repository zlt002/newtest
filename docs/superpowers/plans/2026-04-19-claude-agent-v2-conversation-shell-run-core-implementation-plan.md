# Claude Agent V2 Conversation-Shell Run-Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `cc-ui` 中重建一套强绑定 Claude Agent SDK V2 的 Claude agent 主链路，用 `conversation + run + event` 取代现有消息拼装式 Claude 实现，并一次性切换到新的前后端协议、状态模型和聊天 UI。

**Architecture:** 后端新增 `server/agent-v2` 作为独立实现，按 `domain -> runtime -> repository -> application -> route` 分层，Claude SDK V2 只允许出现在 runtime 层。前端新增 `chat v2` 的事件存储、projection 和 UI 容器，用统一 `AgentEventEnvelope` 驱动 timeline、execution panel 和 composer context bar；新链路跑通后删除旧 Claude 专用兼容逻辑并切换入口。

**Tech Stack:** Node.js, Express, WebSocket, Claude Agent SDK V2 preview, React 18, TypeScript, Node test runner, existing `useSessionStore` / chat component system

---

## 文件结构

### 新增

- `server/agent-v2/domain/agent-event.js`
  `AgentEventEnvelope`、事件类型常量和工厂函数
- `server/agent-v2/domain/run-state-machine.js`
  run 生命周期和状态转换
- `server/agent-v2/domain/run-state-machine.test.mjs`
- `server/agent-v2/runtime/claude-v2-session-pool.js`
  `createSession / resumeSession / close` 封装
- `server/agent-v2/runtime/claude-v2-session-pool.test.mjs`
- `server/agent-v2/runtime/claude-v2-event-translator.js`
  Claude SDK V2 message -> `AgentEventEnvelope`
- `server/agent-v2/runtime/claude-v2-event-translator.test.mjs`
- `server/agent-v2/repository/agent-v2-repository.js`
  conversations / runs / run_events / bindings 的持久化
- `server/agent-v2/repository/agent-v2-repository.test.mjs`
- `server/agent-v2/application/start-conversation-run.js`
  创建 conversation 并启动首个 run
- `server/agent-v2/application/start-conversation-run.test.mjs`
- `server/agent-v2/application/continue-conversation-run.js`
  已有 conversation 上发起新 run
- `server/agent-v2/application/continue-conversation-run.test.mjs`
- `server/agent-v2/application/abort-run.js`
- `server/agent-v2/application/abort-run.test.mjs`
- `server/routes/agent-v2.js`
  新 HTTP 路由
- `server/routes/agent-v2.test.mjs`
- `src/components/chat-v2/types/agentEvents.ts`
  前端事件、run、conversation 类型
- `src/components/chat-v2/store/createAgentEventStore.ts`
  事件存储与 reducer
- `src/components/chat-v2/store/createAgentEventStore.test.mjs`
- `src/components/chat-v2/projection/projectConversationTimeline.ts`
  从 events 投影聊天时间线
- `src/components/chat-v2/projection/projectConversationTimeline.test.mjs`
- `src/components/chat-v2/projection/projectRunExecution.ts`
  从 events 投影 execution panel
- `src/components/chat-v2/projection/projectRunExecution.test.mjs`
- `src/components/chat-v2/components/ConversationTimeline.tsx`
- `src/components/chat-v2/components/RunExecutionPanel.tsx`
- `src/components/chat-v2/components/ComposerContextBar.tsx`
- `src/components/chat-v2/components/ConversationTimeline.test.mjs`
- `src/components/chat-v2/components/RunExecutionPanel.test.mjs`
- `src/components/chat-v2/components/ComposerContextBar.test.mjs`

### 修改

- `server/index.js`
  注册新 route 与 WebSocket 事件广播
- `server/routes/agent.js`
  最终切换为兼容入口或删除
- `server/claude-sdk.js`
  清理仅服务旧链路的入口，或让其退化为新 runtime 的薄封装
- `src/contexts/WebSocketContext.tsx`
  消费新的 `AgentEventEnvelope`
- `src/stores/useSessionStore.ts`
  移除 Claude 专用 realtime patch 入口，或收窄为通用会话缓存
- `src/components/chat/view/ChatInterface.tsx`
  接入 chat-v2 主容器
- `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
  切换到 conversation timeline 视图
- `src/components/chat/view/subcomponents/ChatComposer.tsx`
  接入 composer context bar 与新发送动作
- `src/components/chat/hooks/useChatSessionState.ts`
  切换为 conversation/run 加载，不再主导 Claude 流式拼装
- `src/components/chat/hooks/useChatRealtimeHandlers.ts`
  切换为统一事件消费
- `src/i18n/locales/zh-CN/chat.json`
  新运行状态和错误文案

### 删除或收敛

- `server/providers/claude/adapter.js`
- `server/providers/claude/adapter.test.mjs`
- `server/providers/claude/adapter.system-events.test.mjs`
- `server/sessionManager.js`
- `src/components/chat/execution-message/*`
- `src/components/chat/run-state/*`
- `src/components/chat/run-view/*`
- `src/components/chat/job-tree/*`
- 其它只服务旧 Claude message 拼装的 hook / util / test

### 参考

- `docs/superpowers/specs/2026-04-19-claude-agent-v2-conversation-shell-run-core-design.md`
- `docs/v2.md`
- `server/routes/agent.js`
- `server/claude-sdk.js`
- `src/stores/useSessionStore.ts`
- `src/components/chat/hooks/useChatSessionState.ts`
- `src/components/chat/hooks/useChatRealtimeHandlers.ts`

---

### Task 1: 建立后端领域事件与 run 状态机

**Files:**
- Create: `server/agent-v2/domain/agent-event.js`
- Create: `server/agent-v2/domain/run-state-machine.js`
- Test: `server/agent-v2/domain/run-state-machine.test.mjs`

- [ ] **Step 1: 写失败测试，锁定 run 状态转换和统一事件包络**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAgentEventEnvelope,
  advanceRunState,
} from './run-state-machine.js';

test('createAgentEventEnvelope builds a stable run event payload', () => {
  const event = createAgentEventEnvelope({
    conversationId: 'conv-1',
    runId: 'run-1',
    sessionId: 'sess-1',
    sequence: 3,
    type: 'assistant.message.delta',
    payload: { text: 'hello' },
  });

  assert.equal(event.conversationId, 'conv-1');
  assert.equal(event.runId, 'run-1');
  assert.equal(event.sequence, 3);
  assert.equal(event.type, 'assistant.message.delta');
  assert.equal(event.payload.text, 'hello');
  assert.ok(event.eventId);
  assert.ok(event.timestamp);
});

test('advanceRunState rejects illegal transitions after completion', () => {
  assert.equal(advanceRunState('queued', 'run.started'), 'starting');
  assert.equal(advanceRunState('starting', 'assistant.message.delta'), 'streaming');
  assert.equal(advanceRunState('streaming', 'run.completed'), 'completed');
  assert.throws(() => advanceRunState('completed', 'assistant.message.delta'));
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test server/agent-v2/domain/run-state-machine.test.mjs`

Expected: FAIL，提示 `run-state-machine.js` 不存在或导出缺失

- [ ] **Step 3: 实现事件工厂和状态机最小版本**

```js
import crypto from 'crypto';

export const RUN_STATES = [
  'queued',
  'starting',
  'streaming',
  'waiting_for_tool',
  'completing',
  'completed',
  'failed',
  'aborted',
];

const TRANSITIONS = {
  queued: { 'run.started': 'starting', 'run.failed': 'failed', 'run.aborted': 'aborted' },
  starting: {
    'assistant.message.started': 'streaming',
    'assistant.message.delta': 'streaming',
    'tool.call.started': 'waiting_for_tool',
    'run.completed': 'completed',
    'run.failed': 'failed',
    'run.aborted': 'aborted',
  },
  streaming: {
    'assistant.message.delta': 'streaming',
    'tool.call.started': 'waiting_for_tool',
    'run.completed': 'completed',
    'run.failed': 'failed',
    'run.aborted': 'aborted',
  },
  waiting_for_tool: {
    'tool.call.delta': 'waiting_for_tool',
    'tool.call.completed': 'streaming',
    'tool.call.failed': 'failed',
    'run.failed': 'failed',
    'run.aborted': 'aborted',
  },
  completing: { 'run.completed': 'completed', 'run.failed': 'failed', 'run.aborted': 'aborted' },
  completed: {},
  failed: {},
  aborted: {},
};

export function createAgentEventEnvelope({
  conversationId,
  runId,
  sessionId = null,
  sequence,
  type,
  payload = {},
}) {
  return {
    eventId: crypto.randomUUID(),
    conversationId,
    runId,
    sessionId,
    sequence,
    type,
    timestamp: new Date().toISOString(),
    payload,
  };
}

export function advanceRunState(currentState, eventType) {
  const nextState = TRANSITIONS[currentState]?.[eventType];
  if (!nextState) {
    throw new Error(`Illegal run transition: ${currentState} -> ${eventType}`);
  }
  return nextState;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test server/agent-v2/domain/run-state-machine.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add server/agent-v2/domain/agent-event.js server/agent-v2/domain/run-state-machine.js server/agent-v2/domain/run-state-machine.test.mjs
git commit -m "feat: add agent v2 event envelope and run state machine"
```

### Task 2: 封装 Claude SDK V2 runtime 和事件翻译器

**Files:**
- Create: `server/agent-v2/runtime/claude-v2-session-pool.js`
- Create: `server/agent-v2/runtime/claude-v2-event-translator.js`
- Test: `server/agent-v2/runtime/claude-v2-session-pool.test.mjs`
- Test: `server/agent-v2/runtime/claude-v2-event-translator.test.mjs`

- [ ] **Step 1: 写失败测试，固定 session resume 和 message translation 语义**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createClaudeV2EventTranslator } from './claude-v2-event-translator.js';

test('translator maps assistant deltas and tool lifecycle into agent events', () => {
  const translate = createClaudeV2EventTranslator({
    conversationId: 'conv-1',
    runId: 'run-1',
    sessionId: 'sess-1',
  });

  const delta = translate({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hi' }] } }, 1);
  const tool = translate({ type: 'tool_use', name: 'Read', input: { file_path: '/tmp/a' }, id: 'tool-1' }, 2);

  assert.equal(delta.type, 'assistant.message.delta');
  assert.equal(delta.payload.text, 'Hi');
  assert.equal(tool.type, 'tool.call.started');
  assert.equal(tool.payload.toolName, 'Read');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test server/agent-v2/runtime/claude-v2-event-translator.test.mjs`

Expected: FAIL，提示 translator 文件不存在

- [ ] **Step 3: 实现 session pool 和翻译器最小版本**

```js
import {
  unstable_v2_createSession,
  unstable_v2_resumeSession,
} from '@anthropic-ai/claude-agent-sdk';

export function createClaudeV2SessionPool() {
  const sessions = new Map();

  return {
    create(options) {
      const session = unstable_v2_createSession(options);
      sessions.set(session.sessionId, session);
      return session;
    },
    resume(sessionId, options) {
      const session = unstable_v2_resumeSession(sessionId, options);
      sessions.set(session.sessionId, session);
      return session;
    },
    get(sessionId) {
      return sessions.get(sessionId) || null;
    },
    close(sessionId) {
      const session = sessions.get(sessionId);
      session?.close();
      sessions.delete(sessionId);
    },
  };
}
```

```js
import { createAgentEventEnvelope } from '../domain/run-state-machine.js';

function extractAssistantText(message) {
  if (!message?.message?.content) return '';
  return message.message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

export function createClaudeV2EventTranslator(base) {
  return (sdkMessage, sequence) => {
    if (sdkMessage.type === 'assistant') {
      return createAgentEventEnvelope({
        ...base,
        sequence,
        type: 'assistant.message.delta',
        payload: { text: extractAssistantText(sdkMessage) },
      });
    }

    if (sdkMessage.type === 'tool_use') {
      return createAgentEventEnvelope({
        ...base,
        sequence,
        type: 'tool.call.started',
        payload: {
          toolId: sdkMessage.id,
          toolName: sdkMessage.name,
          input: sdkMessage.input || {},
        },
      });
    }

    if (sdkMessage.type === 'result') {
      return createAgentEventEnvelope({
        ...base,
        sequence,
        type: sdkMessage.subtype === 'success' ? 'run.completed' : 'run.failed',
        payload: {
          result: sdkMessage.result || '',
          subtype: sdkMessage.subtype || 'unknown',
        },
      });
    }

    return createAgentEventEnvelope({
      ...base,
      sequence,
      type: 'run.status_changed',
      payload: { rawType: sdkMessage.type || 'unknown' },
    });
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test server/agent-v2/runtime/claude-v2-session-pool.test.mjs server/agent-v2/runtime/claude-v2-event-translator.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add server/agent-v2/runtime/claude-v2-session-pool.js server/agent-v2/runtime/claude-v2-event-translator.js server/agent-v2/runtime/claude-v2-session-pool.test.mjs server/agent-v2/runtime/claude-v2-event-translator.test.mjs
git commit -m "feat: add claude sdk v2 runtime wrapper"
```

### Task 3: 打通 conversation/run 仓储与应用服务

**Files:**
- Create: `server/agent-v2/repository/agent-v2-repository.js`
- Create: `server/agent-v2/repository/agent-v2-repository.test.mjs`
- Create: `server/agent-v2/application/start-conversation-run.js`
- Create: `server/agent-v2/application/continue-conversation-run.js`
- Create: `server/agent-v2/application/abort-run.js`
- Test: `server/agent-v2/application/start-conversation-run.test.mjs`
- Test: `server/agent-v2/application/continue-conversation-run.test.mjs`
- Test: `server/agent-v2/application/abort-run.test.mjs`

- [ ] **Step 1: 写失败测试，固定 conversation/run/binding 的存储语义**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createAgentV2Repository } from './agent-v2-repository.js';

test('repository persists conversation, run, and ordered run events', async () => {
  const repo = createAgentV2Repository();
  const conversation = await repo.createConversation({ title: '新对话' });
  const run = await repo.createRun({ conversationId: conversation.id, userInput: 'hello' });

  await repo.appendRunEvent({
    conversationId: conversation.id,
    runId: run.id,
    sessionId: 'sess-1',
    sequence: 1,
    type: 'run.started',
    payload: {},
  });

  const events = await repo.listRunEvents(run.id);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'run.started');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test server/agent-v2/repository/agent-v2-repository.test.mjs server/agent-v2/application/start-conversation-run.test.mjs`

Expected: FAIL，提示 repository 或 application 文件不存在

- [ ] **Step 3: 实现最小内存仓储和应用服务骨架**

```js
import crypto from 'crypto';

export function createAgentV2Repository() {
  const conversations = new Map();
  const runs = new Map();
  const runEvents = new Map();
  const bindings = new Map();

  return {
    async createConversation({ title }) {
      const record = { id: crypto.randomUUID(), title, createdAt: new Date().toISOString() };
      conversations.set(record.id, record);
      return record;
    },
    async createRun({ conversationId, userInput }) {
      const record = {
        id: crypto.randomUUID(),
        conversationId,
        userInput,
        status: 'queued',
        createdAt: new Date().toISOString(),
      };
      runs.set(record.id, record);
      return record;
    },
    async appendRunEvent(event) {
      const list = runEvents.get(event.runId) || [];
      list.push(event);
      runEvents.set(event.runId, list);
      return event;
    },
    async listRunEvents(runId) {
      return runEvents.get(runId) || [];
    },
    async bindConversationSession(conversationId, sessionId) {
      bindings.set(conversationId, sessionId);
    },
    async getConversationSession(conversationId) {
      return bindings.get(conversationId) || null;
    },
  };
}
```

```js
export async function startConversationRun({ repo, runtime, title, prompt, model }) {
  const conversation = await repo.createConversation({ title });
  const run = await repo.createRun({ conversationId: conversation.id, userInput: prompt });
  const session = runtime.create({ model });
  await repo.bindConversationSession(conversation.id, session.sessionId);
  return { conversation, run, sessionId: session.sessionId };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test server/agent-v2/repository/agent-v2-repository.test.mjs server/agent-v2/application/start-conversation-run.test.mjs server/agent-v2/application/continue-conversation-run.test.mjs server/agent-v2/application/abort-run.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add server/agent-v2/repository/agent-v2-repository.js server/agent-v2/repository/agent-v2-repository.test.mjs server/agent-v2/application/start-conversation-run.js server/agent-v2/application/continue-conversation-run.js server/agent-v2/application/abort-run.js server/agent-v2/application/*.test.mjs
git commit -m "feat: add agent v2 repository and application services"
```

### Task 4: 新建 route 和 WebSocket 事件广播链路

**Files:**
- Create: `server/routes/agent-v2.js`
- Test: `server/routes/agent-v2.test.mjs`
- Modify: `server/index.js`

- [ ] **Step 1: 写失败测试，固定新接口合同**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createAgentV2Router } from './agent-v2.js';

test('agent v2 router exposes conversation and run endpoints', () => {
  const router = createAgentV2Router({
    services: {
      startConversationRun: async () => ({ conversation: { id: 'conv-1' }, run: { id: 'run-1' }, sessionId: 'sess-1' }),
    },
  });

  const routePaths = router.stack.map((layer) => layer.route?.path).filter(Boolean);
  assert.ok(routePaths.includes('/conversations'));
  assert.ok(routePaths.includes('/conversations/:id/runs'));
  assert.ok(routePaths.includes('/runs/:id/abort'));
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test server/routes/agent-v2.test.mjs`

Expected: FAIL，提示 `agent-v2.js` 不存在

- [ ] **Step 3: 实现 router 和最小广播入口**

```js
import express from 'express';

export function createAgentV2Router({ services }) {
  const router = express.Router();

  router.post('/conversations', async (req, res, next) => {
    try {
      const result = await services.startConversationRun(req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/conversations/:id/runs', async (req, res, next) => {
    try {
      const result = await services.continueConversationRun({
        conversationId: req.params.id,
        ...req.body,
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post('/runs/:id/abort', async (req, res, next) => {
    try {
      await services.abortRun({ runId: req.params.id });
      res.status(202).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
```

```js
import { createAgentV2Router } from './routes/agent-v2.js';

app.use('/api/agent-v2', createAgentV2Router({ services: agentV2Services }));
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test server/routes/agent-v2.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add server/routes/agent-v2.js server/routes/agent-v2.test.mjs server/index.js
git commit -m "feat: expose agent v2 routes"
```

### Task 5: 建立前端事件 store 与 projection 层

**Files:**
- Create: `src/components/chat-v2/types/agentEvents.ts`
- Create: `src/components/chat-v2/store/createAgentEventStore.ts`
- Create: `src/components/chat-v2/store/createAgentEventStore.test.mjs`
- Create: `src/components/chat-v2/projection/projectConversationTimeline.ts`
- Create: `src/components/chat-v2/projection/projectConversationTimeline.test.mjs`
- Create: `src/components/chat-v2/projection/projectRunExecution.ts`
- Create: `src/components/chat-v2/projection/projectRunExecution.test.mjs`
- Modify: `src/contexts/WebSocketContext.tsx`

- [ ] **Step 1: 写失败测试，固定事件重放和 projection 结果**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { createAgentEventStore } from './createAgentEventStore.ts';
import { projectConversationTimeline } from '../projection/projectConversationTimeline.ts';

test('event store keeps events ordered by run sequence', () => {
  const store = createAgentEventStore();
  store.append({
    eventId: 'evt-2',
    conversationId: 'conv-1',
    runId: 'run-1',
    sessionId: 'sess-1',
    sequence: 2,
    type: 'assistant.message.delta',
    timestamp: '2026-04-19T12:00:02.000Z',
    payload: { text: 'world' },
  });
  store.append({
    eventId: 'evt-1',
    conversationId: 'conv-1',
    runId: 'run-1',
    sessionId: 'sess-1',
    sequence: 1,
    type: 'run.started',
    timestamp: '2026-04-19T12:00:01.000Z',
    payload: {},
  });

  assert.deepEqual(store.listByRun('run-1').map((item) => item.sequence), [1, 2]);
});

test('timeline projection returns one assistant turn per run', () => {
  const store = createAgentEventStore();
  store.append({ eventId: '1', conversationId: 'conv-1', runId: 'run-1', sessionId: 'sess-1', sequence: 1, type: 'run.started', timestamp: '2026-04-19T12:00:01.000Z', payload: {} });
  store.append({ eventId: '2', conversationId: 'conv-1', runId: 'run-1', sessionId: 'sess-1', sequence: 2, type: 'assistant.message.delta', timestamp: '2026-04-19T12:00:02.000Z', payload: { text: '你好' } });
  store.append({ eventId: '3', conversationId: 'conv-1', runId: 'run-1', sessionId: 'sess-1', sequence: 3, type: 'run.completed', timestamp: '2026-04-19T12:00:03.000Z', payload: { result: '你好' } });

  const timeline = projectConversationTimeline(store.listByConversation('conv-1'));
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].assistantText, '你好');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/store/createAgentEventStore.test.mjs src/components/chat-v2/projection/projectConversationTimeline.test.mjs src/components/chat-v2/projection/projectRunExecution.test.mjs`

Expected: FAIL，提示 chat-v2 store/projection 文件不存在

- [ ] **Step 3: 实现类型、store 和 projection 最小版本**

```ts
export type AgentEventEnvelope = {
  eventId: string;
  conversationId: string;
  runId: string;
  sessionId: string | null;
  sequence: number;
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
};
```

```ts
import type { AgentEventEnvelope } from '../types/agentEvents.ts';

export function createAgentEventStore() {
  const events = [];

  return {
    append(event: AgentEventEnvelope) {
      events.push(event);
      events.sort((a, b) => a.sequence - b.sequence);
    },
    listByRun(runId: string) {
      return events.filter((event) => event.runId === runId);
    },
    listByConversation(conversationId: string) {
      return events.filter((event) => event.conversationId === conversationId);
    },
  };
}
```

```ts
export function projectConversationTimeline(events) {
  const grouped = new Map();

  for (const event of events) {
    const slot = grouped.get(event.runId) || { runId: event.runId, assistantText: '', status: 'queued' };
    if (event.type === 'assistant.message.delta') {
      slot.assistantText += String(event.payload.text || '');
    }
    if (event.type === 'run.completed') {
      slot.status = 'completed';
    }
    grouped.set(event.runId, slot);
  }

  return Array.from(grouped.values());
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/store/createAgentEventStore.test.mjs src/components/chat-v2/projection/projectConversationTimeline.test.mjs src/components/chat-v2/projection/projectRunExecution.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/chat-v2/types/agentEvents.ts src/components/chat-v2/store/createAgentEventStore.ts src/components/chat-v2/store/createAgentEventStore.test.mjs src/components/chat-v2/projection/projectConversationTimeline.ts src/components/chat-v2/projection/projectConversationTimeline.test.mjs src/components/chat-v2/projection/projectRunExecution.ts src/components/chat-v2/projection/projectRunExecution.test.mjs src/contexts/WebSocketContext.tsx
git commit -m "feat: add chat v2 event store and projections"
```

### Task 6: 构建新的聊天 UI 容器与 composer 状态条

**Files:**
- Create: `src/components/chat-v2/components/ConversationTimeline.tsx`
- Create: `src/components/chat-v2/components/RunExecutionPanel.tsx`
- Create: `src/components/chat-v2/components/ComposerContextBar.tsx`
- Test: `src/components/chat-v2/components/ConversationTimeline.test.mjs`
- Test: `src/components/chat-v2/components/RunExecutionPanel.test.mjs`
- Test: `src/components/chat-v2/components/ComposerContextBar.test.mjs`
- Modify: `src/components/chat/view/ChatInterface.tsx`
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
- Modify: `src/components/chat/view/subcomponents/ChatComposer.tsx`

- [ ] **Step 1: 写失败测试，锁定新的三段式 UI**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ComposerContextBar } from './ComposerContextBar.tsx';

test('ComposerContextBar renders run status with retry hint when failed', () => {
  const markup = renderToStaticMarkup(
    <ComposerContextBar
      status="failed"
      label="上一轮失败，可重试"
    />
  );

  assert.match(markup, /上一轮失败，可重试/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/components/ConversationTimeline.test.mjs src/components/chat-v2/components/RunExecutionPanel.test.mjs src/components/chat-v2/components/ComposerContextBar.test.mjs`

Expected: FAIL，提示 chat-v2 组件不存在

- [ ] **Step 3: 实现最小组件并接入聊天界面**

```tsx
export function ComposerContextBar({
  status,
  label,
}: {
  status: 'queued' | 'starting' | 'streaming' | 'waiting_for_tool' | 'completed' | 'failed' | 'aborted';
  label: string;
}) {
  return (
    <div className="rounded-md border border-neutral-700 bg-neutral-900/60 px-3 py-2 text-xs text-neutral-200">
      <span className="font-medium">{status}</span>
      <span className="ml-2">{label}</span>
    </div>
  );
}
```

```tsx
export function ConversationTimeline({ items }) {
  return (
    <div data-chat-v2-timeline="true" className="space-y-4">
      {items.map((item) => (
        <article key={item.runId} className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-4">
          <div className="text-sm text-neutral-100">{item.assistantText || '处理中...'}</div>
        </article>
      ))}
    </div>
  );
}
```

```tsx
export function RunExecutionPanel({ events }) {
  return (
    <section data-chat-v2-run-panel="true" className="mt-3 space-y-2 rounded-lg border border-neutral-800 p-3">
      {events.map((event) => (
        <div key={event.eventId} className="text-xs text-neutral-300">
          {event.type}
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/components/ConversationTimeline.test.mjs src/components/chat-v2/components/RunExecutionPanel.test.mjs src/components/chat-v2/components/ComposerContextBar.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/chat-v2/components/ConversationTimeline.tsx src/components/chat-v2/components/RunExecutionPanel.tsx src/components/chat-v2/components/ComposerContextBar.tsx src/components/chat-v2/components/*.test.mjs src/components/chat/view/ChatInterface.tsx src/components/chat/view/subcomponents/ChatMessagesPane.tsx src/components/chat/view/subcomponents/ChatComposer.tsx
git commit -m "feat: add chat v2 conversation shell ui"
```

### Task 7: 切换实时消费与发送动作到新链路

**Files:**
- Modify: `src/components/chat/hooks/useChatSessionState.ts`
- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.ts`
- Modify: `src/contexts/WebSocketContext.tsx`
- Modify: `src/stores/useSessionStore.ts`
- Test: `src/components/chat/hooks/useChatSessionState.test.mjs`
- Test: `src/components/chat/hooks/useChatRealtimeHandlers.test.mjs`
- Test: `src/stores/useSessionStore.realtime-merge.test.mjs`

- [ ] **Step 1: 写失败测试，固定新事件消费不再依赖 Claude legacy message shape**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldConsumeAgentV2Event } from './useChatRealtimeHandlers.ts';

test('shouldConsumeAgentV2Event accepts only stable event envelopes', () => {
  assert.equal(
    shouldConsumeAgentV2Event({
      eventId: 'evt-1',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'run.started',
      timestamp: '2026-04-19T12:00:00.000Z',
      payload: {},
    }),
    true,
  );

  assert.equal(shouldConsumeAgentV2Event({ type: 'session-status', sessionId: 'sess-1' }), false);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/hooks/useChatRealtimeHandlers.test.mjs src/components/chat/hooks/useChatSessionState.test.mjs src/stores/useSessionStore.realtime-merge.test.mjs`

Expected: FAIL，提示辅助函数不存在或旧断言不再成立

- [ ] **Step 3: 实现最小切换逻辑**

```ts
export function shouldConsumeAgentV2Event(input: Record<string, unknown>) {
  return typeof input?.eventId === 'string'
    && typeof input?.conversationId === 'string'
    && typeof input?.runId === 'string'
    && typeof input?.type === 'string'
    && typeof input?.sequence === 'number';
}
```

```ts
if (shouldConsumeAgentV2Event(latestMessage)) {
  agentEventStore.append(latestMessage as AgentEventEnvelope);
  return;
}
```

```ts
export function appendRealtimeLegacyMessage() {
  throw new Error('Claude legacy realtime path has been removed; use AgentEventEnvelope instead.');
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/hooks/useChatRealtimeHandlers.test.mjs src/components/chat/hooks/useChatSessionState.test.mjs src/stores/useSessionStore.realtime-merge.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/chat/hooks/useChatSessionState.ts src/components/chat/hooks/useChatRealtimeHandlers.ts src/contexts/WebSocketContext.tsx src/stores/useSessionStore.ts src/components/chat/hooks/useChatSessionState.test.mjs src/components/chat/hooks/useChatRealtimeHandlers.test.mjs src/stores/useSessionStore.realtime-merge.test.mjs
git commit -m "refactor: switch chat realtime handling to agent v2 events"
```

### Task 8: 一次性切换入口并删除旧 Claude 链路

**Files:**
- Modify: `server/index.js`
- Modify: `server/routes/agent.js`
- Modify: `src/components/chat/view/ChatInterface.tsx`
- Delete: `server/providers/claude/adapter.js`
- Delete: `server/providers/claude/adapter.test.mjs`
- Delete: `server/providers/claude/adapter.system-events.test.mjs`
- Delete: `server/sessionManager.js`
- Delete: `src/components/chat/execution-message/*`
- Delete: `src/components/chat/run-state/*`
- Delete: `src/components/chat/run-view/*`
- Delete: `src/components/chat/job-tree/*`

- [ ] **Step 1: 写失败测试，证明旧入口不再被引用**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('ChatInterface no longer references legacy execution-message container', () => {
  const source = readFileSync(new URL('../view/ChatInterface.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /execution-message/i);
  assert.doesNotMatch(source, /job-tree/i);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs src/components/chat/view/subcomponents/MessageComponent.jobTree.test.mjs`

Expected: FAIL，旧组件或旧断言仍在运行

- [ ] **Step 3: 删除旧链路并把入口切到 chat-v2**

```js
app.use('/api/agent', createAgentV2Router({ services: agentV2Services }));
```

```tsx
import { ConversationTimeline } from '../../chat-v2/components/ConversationTimeline.tsx';
import { ComposerContextBar } from '../../chat-v2/components/ComposerContextBar.tsx';
```

```bash
rm -rf server/providers/claude
rm -rf src/components/chat/execution-message
rm -rf src/components/chat/job-tree
rm -rf src/components/chat/run-state
rm -rf src/components/chat/run-view
```

- [ ] **Step 4: 跑聚合验证**

Run: `npm test`

Expected: PASS

Run: `npm run typecheck`

Expected: PASS

Run: `npm run build`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add server src docs
git commit -m "refactor: replace legacy claude flow with agent v2 architecture"
```

## 自检

### Spec coverage

- `conversation + run + event`：Task 1、Task 3、Task 5 覆盖
- Claude SDK V2 强绑定 runtime：Task 2 覆盖
- 前后端统一协议：Task 1、Task 4、Task 5、Task 7 覆盖
- 新聊天 UI：Task 5、Task 6 覆盖
- 一次性切换和删除旧链路：Task 8 覆盖
- 中断、失败、resume：Task 2、Task 3、Task 4、Task 6、Task 7 覆盖

### Placeholder scan

- 已避免 `TODO`、`TBD`、`later`、`similar to Task N`
- 每个任务都给出具体文件、测试命令和最小代码骨架
- 所有关键模块名在前后任务中保持一致

### Type consistency

- 统一使用 `AgentEventEnvelope`
- 统一使用 run 状态：`queued | starting | streaming | waiting_for_tool | completing | completed | failed | aborted`
- 新前端统一使用 `chat-v2` 命名空间，避免和旧聊天链路混淆
