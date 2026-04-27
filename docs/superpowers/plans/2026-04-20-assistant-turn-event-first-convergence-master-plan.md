# Assistant Turn Event-First Convergence Master Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一次性把当前项目收口到单一 `AssistantTurn` 模型：实时链做到“后端全部动态逐条实时反馈到前端”，历史链做到“event-first 回放同一套 turn 结构”，最终当前与历史共用同一个主渲染路径。

**Architecture:** 先打通 `SDK event -> translator -> publish -> websocket -> agentEventStore -> AssistantTurn` 的实时主链，再补 `session -> runs -> eventsByRun -> hydrate -> same projection -> AssistantTurn[]` 的历史主链，最后让 transcript 退成正文补全/fallback 源，并把聊天页切到 turn-first 唯一路径。整个实现按依赖顺序串行推进，避免在 `store/projection/ChatMessagesPane` 层出现双轨改造冲突。

**Tech Stack:** Node.js, Express, Claude Agent SDK V2, WebSocket, React, existing `agentEventStore`, current chat-v2 projection utilities, sessionStore transcript fallback, Node test runner

---

## 执行原则

这份 master plan 合并了以下两份计划，并重新排了可安全连续执行的顺序：

- `docs/superpowers/plans/2026-04-20-runtime-events-full-realtime-plan.md`
- `docs/superpowers/plans/2026-04-20-event-first-history-convergence-plan.md`

关键原则：

1. 实时链先稳定 event model，再让历史链复用同一模型。
2. 历史链可以在服务端接口层提前铺路，但不能先改前端主渲染。
3. `createAgentEventStore`、`useAgentConversation`、`projectInlineRuntimeActivity`、`ChatInterface`、`ChatMessagesPane` 这些文件只允许按一条主链顺序改，不能双向同时改。
4. transcript 不是删掉，而是最后降级成正文补全和兼容 fallback。

## 文件结构

### 实时事件链

- Modify: `server/agent-v2/runtime/claude-run-executor.js`
- Modify: `server/agent-v2/runtime/claude-v2-event-translator.js`
- Modify: `server/agent-v2/domain/agent-event.js`
- Create: `server/agent-v2/application/run-event-pipeline.js`
- Modify: `server/agent-v2/application/create-agent-v2-services.js`
- Modify: `server/agent-v2/application/start-conversation-run.js`
- Modify: `server/agent-v2/application/continue-conversation-run.js`
- Modify: `server/index.js`

### 历史事件链

- Modify: `server/routes/agent-v2.js`
- Modify: `server/agent-v2/repository/agent-v2-repository.js`
- Modify: `server/agent-v2/repository/sqlite-agent-v2-repository.js`
- Create: `src/components/chat-v2/api/fetchSessionRunHistory.ts`
- Create: `src/components/chat-v2/hooks/useHistoricalAgentConversation.ts`

### 统一 store / projection / view

- Modify: `src/components/chat-v2/store/createAgentEventStore.ts`
- Modify: `src/components/chat-v2/types/agentEvents.ts`
- Modify: `src/components/chat-v2/hooks/useAgentConversation.ts`
- Create: `src/components/chat-v2/projection/projectAssistantTurnsForSession.ts`
- Modify: `src/components/chat-v2/projection/projectRunExecution.ts`
- Modify: `src/components/chat-v2/projection/projectInlineRuntimeActivity.ts`
- Modify: `src/components/chat-v2/components/AssistantRuntimeTurn.ts`
- Modify: `src/components/chat-v2/components/InlineRuntimeActivity.ts`

### transcript 降级与主渲染切换

- Modify: `src/stores/useSessionStore.ts`
- Modify: `src/components/chat/hooks/useChatSessionState.ts`
- Modify: `src/components/chat/hooks/useChatMessages.ts`
- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.ts`
- Modify: `src/components/chat/view/agentV2Realtime.ts`
- Modify: `src/components/chat/view/ChatInterface.tsx`
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
- Modify: `src/components/chat/view/subcomponents/MessageComponent.tsx`

### 测试

- Modify/Test:
  - `server/agent-v2/runtime/claude-v2-event-translator.test.mjs`
  - `server/agent-v2/application/create-agent-v2-services.test.mjs`
  - `server/agent-v2/application/start-conversation-run.test.mjs`
  - `server/agent-v2/application/continue-conversation-run.test.mjs`
  - `server/routes/agent-v2.test.mjs`
  - `server/agent-v2/repository/agent-v2-repository.test.mjs`
  - `server/agent-v2/repository/sqlite-agent-v2-repository.test.mjs`
  - `server/database/init-compat.test.mjs`
  - `src/components/chat-v2/store/createAgentEventStore.test.mjs`
  - `src/components/chat-v2/projection/projectRunExecution.test.mjs`
  - `src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs`
  - `src/components/chat-v2/projection/projectAssistantTurnsForSession.test.mjs`
  - `src/components/chat-v2/components/AssistantRuntimeTurn.test.mjs`
  - `src/components/chat/view/agentV2Realtime.test.mjs`
  - `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`
  - `src/components/chat/hooks/useChatMessages.test.mjs`
  - `src/components/chat/hooks/useChatSessionState.test.mjs`

## Task 1: 打通实时链的 translator，保证 SDK 全量事件不丢

**Files:**
- Modify: `server/agent-v2/runtime/claude-run-executor.js`
- Modify: `server/agent-v2/runtime/claude-v2-event-translator.js`
- Modify: `server/agent-v2/domain/agent-event.js`
- Test: `server/agent-v2/runtime/claude-v2-event-translator.test.mjs`

- [ ] **Step 1: 写失败用例，锁定未知 SDK 事件不会被吞，正文事件会产生 body segment**

```js
test("maps unknown sdk event into fallback activity event", () => {
  const events = translateClaudeV2Event({
    sdkEvent: { type: "sdk.unknown_event", foo: "bar" },
    runId: "run-1",
    sessionId: "sess-1",
  });

  expect(events).toEqual([
    expect.objectContaining({
      type: "run.activity.appended",
      runId: "run-1",
      sessionId: "sess-1",
      activity: expect.objectContaining({
        kind: "sdk_fallback",
        sourceType: "sdk.unknown_event",
      }),
    }),
  ]);
});

test("maps assistant text to run.body.segment_appended", () => {
  const events = translateClaudeV2Event({
    sdkEvent: {
      type: "assistant",
      message: { content: [{ type: "text", text: "hello" }] },
    },
    runId: "run-1",
    sessionId: "sess-1",
  });

  expect(events).toContainEqual(
    expect.objectContaining({
      type: "run.body.segment_appended",
      segment: expect.objectContaining({ text: "hello" }),
    }),
  );
});
```

- [ ] **Step 2: 跑 translator 测试确认当前实现缺口**

Run: `node --test server/agent-v2/runtime/claude-v2-event-translator.test.mjs`

Expected: FAIL

- [ ] **Step 3: 实现 translator 与 domain events 的最小扩展**

```js
export function translateClaudeV2Event({ sdkEvent, runId, sessionId }) {
  const translated = [];

  if (isStatusEvent(sdkEvent)) {
    translated.push(makeStatusEvent({ sdkEvent, runId, sessionId }));
  }

  if (isAssistantTextEvent(sdkEvent)) {
    translated.push(makeBodySegmentEvent({ sdkEvent, runId, sessionId }));
  }

  if (isKnownActivityEvent(sdkEvent)) {
    translated.push(makeActivityEvent({ sdkEvent, runId, sessionId }));
  }

  if (translated.length === 0) {
    translated.push(
      makeActivityEvent({
        runId,
        sessionId,
        sdkEvent,
        kind: "sdk_fallback",
        summary: sdkEvent.type,
      }),
    );
  }

  return translated;
}
```

- [ ] **Step 4: 让执行器逐条发出 translator 产出的所有事件**

```js
for await (const sdkEvent of session.stream(request)) {
  const translatedEvents = translateClaudeV2Event({ sdkEvent, runId, sessionId });
  for (const event of translatedEvents) {
    await onEvent?.(event);
  }
}
```

- [ ] **Step 5: 重跑 translator 测试**

Run: `node --test server/agent-v2/runtime/claude-v2-event-translator.test.mjs`

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add server/agent-v2/runtime/claude-run-executor.js \
  server/agent-v2/runtime/claude-v2-event-translator.js \
  server/agent-v2/domain/agent-event.js \
  server/agent-v2/runtime/claude-v2-event-translator.test.mjs
git commit -m "feat: emit full runtime events from claude translator"
```

## Task 2: 打通实时链的持久化与 websocket 广播

**Files:**
- Create: `server/agent-v2/application/run-event-pipeline.js`
- Modify: `server/agent-v2/application/create-agent-v2-services.js`
- Modify: `server/agent-v2/application/start-conversation-run.js`
- Modify: `server/agent-v2/application/continue-conversation-run.js`
- Modify: `server/index.js`
- Test: `server/agent-v2/application/create-agent-v2-services.test.mjs`
- Test: `server/agent-v2/application/start-conversation-run.test.mjs`
- Test: `server/agent-v2/application/continue-conversation-run.test.mjs`

- [ ] **Step 1: 写失败用例，锁定每条 run event 都会立即持久化和广播**

```js
test("publishes translated run events immediately", async () => {
  const published = [];
  const persisted = [];
  const services = createAgentV2Services({
    publishRunEvent: (event) => published.push(event),
    repository: { appendRunEvent: async (event) => persisted.push(event) },
  });

  await services.handleRunEvent({
    type: "run.activity.appended",
    runId: "run-1",
    sessionId: "sess-1",
  });

  expect(persisted).toHaveLength(1);
  expect(published).toHaveLength(1);
});
```

- [ ] **Step 2: 运行 application 测试确认当前不是逐条 publish**

Run: `node --test server/agent-v2/application/create-agent-v2-services.test.mjs server/agent-v2/application/start-conversation-run.test.mjs server/agent-v2/application/continue-conversation-run.test.mjs`

Expected: FAIL

- [ ] **Step 3: 实现统一 run event pipeline**

```js
export async function handleRunEvent({ event, repository, publish }) {
  await repository.appendRunEvent(event);
  publish(event);
}
```

- [ ] **Step 4: 在 start/continue 中接上 pipeline**

```js
await executeClaudeRun({
  runId,
  sessionId,
  onEvent: async (event) => {
    await handleRunEvent({ event, repository, publish: publishRunEvent });
  },
});
```

- [ ] **Step 5: 在 `server/index.js` 广播统一 envelope**

```js
broadcastToSession(event.sessionId, {
  type: "agent-v2.run.event",
  payload: event,
});
```

- [ ] **Step 6: 重跑 application 测试**

Run: `node --test server/agent-v2/application/create-agent-v2-services.test.mjs server/agent-v2/application/start-conversation-run.test.mjs server/agent-v2/application/continue-conversation-run.test.mjs`

Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add server/agent-v2/application/run-event-pipeline.js \
  server/agent-v2/application/create-agent-v2-services.js \
  server/agent-v2/application/start-conversation-run.js \
  server/agent-v2/application/continue-conversation-run.js \
  server/index.js \
  server/agent-v2/application/create-agent-v2-services.test.mjs \
  server/agent-v2/application/start-conversation-run.test.mjs \
  server/agent-v2/application/continue-conversation-run.test.mjs
git commit -m "feat: stream run events through unified publish pipeline"
```

## Task 3: 提前铺好历史聚合接口

**Files:**
- Modify: `server/routes/agent-v2.js`
- Modify: `server/agent-v2/application/create-agent-v2-services.js`
- Modify: `server/agent-v2/repository/agent-v2-repository.js`
- Modify: `server/agent-v2/repository/sqlite-agent-v2-repository.js`
- Test: `server/routes/agent-v2.test.mjs`
- Test: `server/agent-v2/application/create-agent-v2-services.test.mjs`
- Test: `server/agent-v2/repository/agent-v2-repository.test.mjs`

- [ ] **Step 1: 写失败用例，锁定 session 聚合历史接口返回 `runs + eventsByRun`**

```js
test("GET /sessions/:id/history returns runs and eventsByRun", async () => {
  const services = {
    getSessionHistory: async () => ({
      sessionId: "sess-1",
      runs: [{ id: "run-1", sessionId: "sess-1", status: "completed" }],
      eventsByRun: {
        "run-1": [{ type: "run.completed", runId: "run-1", sessionId: "sess-1" }],
      },
    }),
  };

  const app = express();
  app.use(createAgentV2Router({ services }));

  const response = await request(app).get("/sessions/sess-1/history");
  expect(response.status).toBe(200);
  expect(response.body.runs).toHaveLength(1);
  expect(response.body.eventsByRun["run-1"]).toHaveLength(1);
});
```

- [ ] **Step 2: 运行接口测试确认当前接口不存在**

Run: `node --test server/routes/agent-v2.test.mjs server/agent-v2/application/create-agent-v2-services.test.mjs server/agent-v2/repository/agent-v2-repository.test.mjs`

Expected: FAIL

- [ ] **Step 3: 新增 `getSessionHistory()` 服务**

```js
async function getSessionHistory({ sessionId }) {
  const runs = await repo.listSessionRuns(sessionId);
  const eventsByRun = {};

  for (const run of runs) {
    eventsByRun[run.id] = await repo.listRunEvents(run.id);
  }

  return { sessionId, runs, eventsByRun };
}
```

- [ ] **Step 4: 增加 `/sessions/:id/history` 路由**

```js
router.get('/sessions/:id/history', async (req, res, next) => {
  try {
    const history = await services.getSessionHistory({ sessionId: req.params.id });
    res.json(history);
  } catch (error) {
    next(error);
  }
});
```

- [ ] **Step 5: 重跑接口测试**

Run: `node --test server/routes/agent-v2.test.mjs server/agent-v2/application/create-agent-v2-services.test.mjs server/agent-v2/repository/agent-v2-repository.test.mjs`

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add server/routes/agent-v2.js \
  server/agent-v2/application/create-agent-v2-services.js \
  server/agent-v2/repository/agent-v2-repository.js \
  server/agent-v2/repository/sqlite-agent-v2-repository.js \
  server/routes/agent-v2.test.mjs \
  server/agent-v2/application/create-agent-v2-services.test.mjs \
  server/agent-v2/repository/agent-v2-repository.test.mjs
git commit -m "feat: add aggregated session history endpoint"
```

## Task 4: 打通前端 realtime store，允许历史 hydrate 但先不切历史主视图

**Files:**
- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.ts`
- Modify: `src/components/chat/view/agentV2Realtime.ts`
- Modify: `src/components/chat-v2/store/createAgentEventStore.ts`
- Modify: `src/components/chat-v2/types/agentEvents.ts`
- Modify: `src/components/chat-v2/hooks/useAgentConversation.ts`
- Test: `src/components/chat-v2/store/createAgentEventStore.test.mjs`
- Test: `src/components/chat/view/agentV2Realtime.test.mjs`

- [ ] **Step 1: 写失败用例，锁定 websocket 收到一条 event 就 append 到 store，且 store 支持 hydrate**

```js
test("appends websocket runtime event immediately", () => {
  const store = createAgentEventStore();

  store.append({
    type: "run.activity.appended",
    runId: "run-1",
    sessionId: "sess-1",
    activity: { id: "a-1", kind: "tool", summary: "Read file" },
  });

  expect(store.listBySession("sess-1")).toHaveLength(1);
});

test("hydrates historical events into session bucket", () => {
  const store = createAgentEventStore();

  store.hydrateSession("sess-1", [
    { type: "run.started", runId: "run-1", sessionId: "sess-1", sequence: 1 },
    { type: "run.completed", runId: "run-1", sessionId: "sess-1", sequence: 2 },
  ]);

  expect(store.listBySession("sess-1")).toHaveLength(2);
});
```

- [ ] **Step 2: 运行 store/realtime 测试**

Run: `node --test src/components/chat-v2/store/createAgentEventStore.test.mjs src/components/chat/view/agentV2Realtime.test.mjs`

Expected: FAIL

- [ ] **Step 3: 扩展 event store 支持 append 与 hydrate**

```ts
append(event: AgentEventEnvelope) {
  const bucket = ensureSessionBucket(event.sessionId);
  bucket.events.push(event);
}

hydrateSession(sessionId: string, events: AgentEventEnvelope[]) {
  for (const event of events) {
    this.append({ ...event, sessionId });
  }
}
```

- [ ] **Step 4: 在 realtime handler 中直接把 run event append 到 `agentEventStore`**

```ts
if (message.type === "agent-v2.run.event") {
  agentEventStore.append(message.payload);
  return;
}
```

- [ ] **Step 5: 让 `useAgentConversation` 继续只从 event store 算 active run**

```ts
const activeRun = activeRunId
  ? projectRunExecution(events.filter((event) => event.runId === activeRunId))
  : null;
```

- [ ] **Step 6: 重跑 store/realtime 测试**

Run: `node --test src/components/chat-v2/store/createAgentEventStore.test.mjs src/components/chat/view/agentV2Realtime.test.mjs`

Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src/components/chat/hooks/useChatRealtimeHandlers.ts \
  src/components/chat/view/agentV2Realtime.ts \
  src/components/chat-v2/store/createAgentEventStore.ts \
  src/components/chat-v2/types/agentEvents.ts \
  src/components/chat-v2/hooks/useAgentConversation.ts \
  src/components/chat-v2/store/createAgentEventStore.test.mjs \
  src/components/chat/view/agentV2Realtime.test.mjs
git commit -m "feat: unify realtime append and history hydrate in event store"
```

## Task 5: 稳定实时 `AssistantTurn` projection 与渲染

**Files:**
- Modify: `src/components/chat-v2/projection/projectInlineRuntimeActivity.ts`
- Modify: `src/components/chat-v2/components/AssistantRuntimeTurn.ts`
- Modify: `src/components/chat-v2/components/InlineRuntimeActivity.ts`
- Test: `src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs`
- Test: `src/components/chat-v2/components/AssistantRuntimeTurn.test.mjs`

- [ ] **Step 1: 写失败用例，锁定所有 activity/body 事件都进入同一个 turn**

```js
test("projects mixed runtime events into one assistant turn", () => {
  const turn = projectAssistantTurn([
    { type: "run.activity.appended", activity: { kind: "tool", summary: "Read a.ts" } },
    { type: "run.activity.appended", activity: { kind: "sdk_fallback", summary: "task_updated" } },
    { type: "run.body.segment_appended", segment: { kind: "phase", text: "I found the issue" } },
  ]);

  expect(turn.activityItems).toHaveLength(2);
  expect(turn.bodySegments).toHaveLength(1);
});
```

- [ ] **Step 2: 运行 projection/component 测试**

Run: `node --test src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs src/components/chat-v2/components/AssistantRuntimeTurn.test.mjs`

Expected: FAIL

- [ ] **Step 3: 扩展 projection 和 `AssistantRuntimeTurn` 的三层结构**

```tsx
<AssistantRuntimeTurn>
  <RuntimeHeader status={turn.status} />
  <InlineRuntimeActivity items={turn.activityItems} />
  <AssistantBody segments={turn.bodySegments} />
</AssistantRuntimeTurn>
```

- [ ] **Step 4: 在 `InlineRuntimeActivity` 中实现“最近 5 条 + 展开全部 + 自动滚动”**

```tsx
const visibleItems = expanded ? items : items.slice(-5);
useEffect(() => {
  if (isRunning) {
    scrollToBottom();
  }
}, [items, isRunning]);
```

- [ ] **Step 5: 重跑 projection/component 测试**

Run: `node --test src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs src/components/chat-v2/components/AssistantRuntimeTurn.test.mjs`

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/components/chat-v2/projection/projectInlineRuntimeActivity.ts \
  src/components/chat-v2/components/AssistantRuntimeTurn.ts \
  src/components/chat-v2/components/InlineRuntimeActivity.ts \
  src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs \
  src/components/chat-v2/components/AssistantRuntimeTurn.test.mjs
git commit -m "feat: stabilize assistant runtime turn projection"
```

## Task 6: 新增 session 级历史 hydrate hook 和 session turn projection

**Files:**
- Create: `src/components/chat-v2/api/fetchSessionRunHistory.ts`
- Create: `src/components/chat-v2/hooks/useHistoricalAgentConversation.ts`
- Create: `src/components/chat-v2/projection/projectAssistantTurnsForSession.ts`
- Create: `src/components/chat-v2/projection/projectAssistantTurnsForSession.test.mjs`
- Modify: `src/components/chat-v2/projection/projectRunExecution.ts`
- Modify: `src/components/chat-v2/projection/projectInlineRuntimeActivity.ts`
- Modify: `src/components/chat-v2/hooks/useAgentConversation.ts`
- Test: `src/components/chat-v2/projection/projectRunExecution.test.mjs`
- Test: `src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs`

- [ ] **Step 1: 写失败用例，锁定一个 session 多个 runs 会投影成多个 `AssistantTurn`**

```js
test("projects session events into ordered assistant turns", () => {
  const turns = projectAssistantTurnsForSession({
    sessionId: "sess-1",
    events: [
      { type: "run.started", runId: "run-1", sessionId: "sess-1", sequence: 1 },
      { type: "run.completed", runId: "run-1", sessionId: "sess-1", sequence: 2 },
      { type: "run.started", runId: "run-2", sessionId: "sess-1", sequence: 3 },
      { type: "run.failed", runId: "run-2", sessionId: "sess-1", sequence: 4 },
    ],
  });

  expect(turns).toHaveLength(2);
  expect(turns[0].runId).toBe("run-1");
  expect(turns[1].runId).toBe("run-2");
});
```

- [ ] **Step 2: 跑新增 projection 测试**

Run: `node --test src/components/chat-v2/projection/projectRunExecution.test.mjs src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs src/components/chat-v2/projection/projectAssistantTurnsForSession.test.mjs`

Expected: FAIL

- [ ] **Step 3: 新增历史接口请求函数**

```ts
export async function fetchSessionRunHistory(sessionId: string) {
  const response = await authenticatedFetch(`/api/agent-v2/sessions/${encodeURIComponent(sessionId)}/history`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}
```

- [ ] **Step 4: 新增历史 hook，把 events hydrate 进 store 并生成 session turns**

```ts
const history = await fetchSessionRunHistory(sessionId);
const orderedEvents = Object.values(history.eventsByRun)
  .flat()
  .sort((a, b) => a.sequence - b.sequence);

agentEventStore.hydrateSession(sessionId, orderedEvents);

const turns = projectAssistantTurnsForSession({
  sessionId,
  events: orderedEvents,
});
```

- [ ] **Step 5: 让 `useAgentConversation` 同时返回 `sessionTurns`**

```ts
const sessionTurns = sessionId
  ? projectAssistantTurnsForSession({ sessionId, events })
  : [];

return { stream, activeRunEvents, activeRunActivity, execution, hasBlockingDecision, sessionTurns };
```

- [ ] **Step 6: 重跑 projection 测试**

Run: `node --test src/components/chat-v2/projection/projectRunExecution.test.mjs src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs src/components/chat-v2/projection/projectAssistantTurnsForSession.test.mjs`

Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src/components/chat-v2/api/fetchSessionRunHistory.ts \
  src/components/chat-v2/hooks/useHistoricalAgentConversation.ts \
  src/components/chat-v2/projection/projectAssistantTurnsForSession.ts \
  src/components/chat-v2/projection/projectAssistantTurnsForSession.test.mjs \
  src/components/chat-v2/projection/projectRunExecution.ts \
  src/components/chat-v2/projection/projectInlineRuntimeActivity.ts \
  src/components/chat-v2/hooks/useAgentConversation.ts \
  src/components/chat-v2/projection/projectRunExecution.test.mjs \
  src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs
git commit -m "feat: add event-first historical assistant turns"
```

## Task 7: 把 transcript 降级为正文补全源

**Files:**
- Modify: `src/stores/useSessionStore.ts`
- Modify: `src/components/chat/hooks/useChatSessionState.ts`
- Modify: `src/components/chat/hooks/useChatMessages.ts`
- Test: `src/components/chat/hooks/useChatSessionState.test.mjs`
- Test: `src/components/chat/hooks/useChatMessages.test.mjs`

- [ ] **Step 1: 写失败用例，锁定 transcript 只补 body，不再复活 legacy 执行结构**

```js
test("history transcript supplements body without reviving legacy execution structure", async () => {
  const transcript = [{ kind: "text", role: "assistant", content: "final answer" }];
  const result = buildTranscriptSupplements(transcript);

  expect(result.bodySegments).toEqual([
    expect.objectContaining({ text: "final answer" }),
  ]);
  expect(result.activityItems).toBeUndefined();
});
```

- [ ] **Step 2: 运行 transcript 相关测试**

Run: `node --test src/components/chat/hooks/useChatSessionState.test.mjs src/components/chat/hooks/useChatMessages.test.mjs`

Expected: FAIL

- [ ] **Step 3: 在 session state 中显式准备 transcript supplements**

```ts
const transcriptSupplements = extractTranscriptSupplements(storeMessages);
return {
  chatMessages,
  transcriptSupplements,
};
```

- [ ] **Step 4: 在 `useChatMessages` 中保留正文提取，削弱协议/工具/思考的主渲染资格**

```ts
if (message.kind === 'thinking' || message.kind === 'tool_use' || message.kind === 'task_notification') {
  return null;
}
```

- [ ] **Step 5: 重跑 transcript 相关测试**

Run: `node --test src/components/chat/hooks/useChatSessionState.test.mjs src/components/chat/hooks/useChatMessages.test.mjs`

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/stores/useSessionStore.ts \
  src/components/chat/hooks/useChatSessionState.ts \
  src/components/chat/hooks/useChatMessages.ts \
  src/components/chat/hooks/useChatSessionState.test.mjs \
  src/components/chat/hooks/useChatMessages.test.mjs
git commit -m "refactor: demote transcript to body supplement source"
```

## Task 8: 切主渲染到 turn-first，统一实时与历史

**Files:**
- Modify: `src/components/chat/view/ChatInterface.tsx`
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
- Modify: `src/components/chat/view/subcomponents/MessageComponent.tsx`
- Test: `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`
- Test: `src/components/chat/view/agentV2Realtime.test.mjs`

- [ ] **Step 1: 写失败用例，锁定历史模式优先渲染 `AssistantRuntimeTurn` 列表，实时也不再混 legacy assistant cluster**

```js
test("renders assistant turns before legacy assistant messages", () => {
  const screen = renderChatMessagesPane({
    sessionTurns: [{ runId: "run-1", summary: { status: "completed" }, activity: [] }],
    visibleMessages: [makeLegacyAssistantMessage("old assistant text")],
  });

  expect(screen.queryByText("old assistant text")).toBeNull();
  expect(screen.getByTestId("assistant-runtime-turn")).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行聊天渲染测试**

Run: `node --test src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs src/components/chat/view/agentV2Realtime.test.mjs`

Expected: FAIL

- [ ] **Step 3: 在 `ChatInterface` 中统一组装实时/历史 turns 输入**

```tsx
const historicalTurns = selectedSession ? historicalAgentConversation.turns : [];
const sessionTurns = historicalTurns.length > 0 ? historicalTurns : agentConversation.sessionTurns;
```

- [ ] **Step 4: 在 `ChatMessagesPane` 中优先渲染 turns，`MessageComponent` 退为 fallback**

```tsx
{sessionTurns.length > 0 ? (
  sessionTurns.map((turn) => (
    <AssistantRuntimeTurn key={turn.runId} summary={turn.summary} activity={turn.activity} />
  ))
) : (
  renderedMessages.map(renderLegacyMessage)
)}
```

- [ ] **Step 5: 重跑聊天渲染测试**

Run: `node --test src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs src/components/chat/view/agentV2Realtime.test.mjs`

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/components/chat/view/ChatInterface.tsx \
  src/components/chat/view/subcomponents/ChatMessagesPane.tsx \
  src/components/chat/view/subcomponents/MessageComponent.tsx \
  src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs \
  src/components/chat/view/agentV2Realtime.test.mjs
git commit -m "refactor: switch chat rendering to turn-first path"
```

## Task 9: 做数据库、类型和端到端最终验收

**Files:**
- Modify: `server/agent-v2/repository/agent-v2-repository.js`
- Modify: `server/agent-v2/repository/sqlite-agent-v2-repository.js`
- Test: `server/agent-v2/repository/agent-v2-repository.test.mjs`
- Test: `server/agent-v2/repository/sqlite-agent-v2-repository.test.mjs`
- Test: `server/database/init-compat.test.mjs`
- Modify: `src/components/chat-v2/components/AssistantRuntimeTurn.test.mjs`
- Modify: `src/components/chat-v2/hooks/useHistoricalAgentConversation.ts`
- Test: `src/components/chat-v2/projection/projectAssistantTurnsForSession.test.mjs`

- [ ] **Step 1: 写同构验证用例，锁定历史与实时共享同一 turn shape**

```js
test("historical and active projections share the same assistant turn shape", () => {
  const events = [
    { type: "run.started", runId: "run-1", sessionId: "sess-1", sequence: 1 },
    { type: "run.completed", runId: "run-1", sessionId: "sess-1", sequence: 2 },
  ];

  const historyTurn = projectAssistantTurnsForSession({ sessionId: "sess-1", events })[0];
  const activeSummary = projectRunExecution(events);

  expect(historyTurn.summary.status).toBe(activeSummary.status);
  expect(historyTurn.activity).toEqual(projectInlineRuntimeActivity(events));
});
```

- [ ] **Step 2: 运行后端持久化测试**

Run: `node --test server/agent-v2/repository/agent-v2-repository.test.mjs server/agent-v2/repository/sqlite-agent-v2-repository.test.mjs server/database/init-compat.test.mjs`

Expected: PASS

- [ ] **Step 3: 运行完整重点测试集**

Run: `node --test server/agent-v2/runtime/claude-v2-event-translator.test.mjs server/agent-v2/application/create-agent-v2-services.test.mjs server/agent-v2/application/start-conversation-run.test.mjs server/agent-v2/application/continue-conversation-run.test.mjs server/routes/agent-v2.test.mjs server/agent-v2/repository/agent-v2-repository.test.mjs server/agent-v2/repository/sqlite-agent-v2-repository.test.mjs src/components/chat-v2/store/createAgentEventStore.test.mjs src/components/chat-v2/projection/projectRunExecution.test.mjs src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs src/components/chat-v2/projection/projectAssistantTurnsForSession.test.mjs src/components/chat-v2/components/AssistantRuntimeTurn.test.mjs src/components/chat/hooks/useChatSessionState.test.mjs src/components/chat/hooks/useChatMessages.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs src/components/chat/view/agentV2Realtime.test.mjs`

Expected: PASS

- [ ] **Step 4: 运行类型检查**

Run: `npm run typecheck`

Expected: PASS

- [ ] **Step 5: 运行本地 smoke**

Run:

```bash
npm run dev
```

Manual expectations:

- 当前项目新建会话时，动态流从第一条事件开始逐条实时更新
- `html` 项目新建会话时，动态仍留在正确项目上下文，不串项目
- 当前运行态只显示一个 `AssistantTurn`
- 打开刚完成的历史 session，看到的是同一套 `AssistantTurn`
- 某些老旧 session 即使走 transcript fallback，也不再长出多套样式

- [ ] **Step 6: 提交收尾**

```bash
git add server/agent-v2/repository/agent-v2-repository.js \
  server/agent-v2/repository/sqlite-agent-v2-repository.js \
  server/agent-v2/repository/agent-v2-repository.test.mjs \
  server/agent-v2/repository/sqlite-agent-v2-repository.test.mjs \
  server/database/init-compat.test.mjs \
  src/components/chat-v2/components/AssistantRuntimeTurn.test.mjs \
  src/components/chat-v2/hooks/useHistoricalAgentConversation.ts \
  src/components/chat-v2/projection/projectAssistantTurnsForSession.test.mjs
git commit -m "test: verify assistant turn convergence end to end"
```

## 自检

### Spec coverage

- 后端全部动态实时反馈到前端：Task 1-5 覆盖
- 历史向 event-first 收口：Task 3、Task 6、Task 7 覆盖
- transcript 降级为正文补全：Task 7 覆盖
- turn-first 主渲染切换：Task 8 覆盖
- 历史/实时同构验收：Task 9 覆盖

### Placeholder scan

- 无 TBD/TODO
- 每个任务都给出具体文件、命令、预期结果和代码骨架

### Type consistency

- 全程统一围绕 `sessionId / runId / AgentEventEnvelope / AssistantTurn`
- 先稳定实时 event model，再让历史复用同一个 projection contract
