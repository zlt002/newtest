# Event-First History Convergence Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让历史会话查看从 transcript-first 收口到 event-first，使历史与实时都通过同一套 `run events -> AssistantTurn` projection 渲染。

**Architecture:** 服务端新增 session 级历史聚合接口，返回 `runs + eventsByRun`；前端将历史 run events hydrate 进统一 event store 或等价历史事件入口，再通过共享 projection 生成 `AssistantTurn[]`。`sessionStore` 保留为 transcript/body 补全源与兼容 fallback，不再主导历史主视图。

**Tech Stack:** Node.js, Express, Claude Agent V2 services/repository, React, existing `agentEventStore`, current chat-v2 projection utilities, Node test runner

---

## 文件结构

### 服务端历史聚合接口

- Modify: `server/routes/agent-v2.js`
  责任：新增 `GET /api/agent-v2/sessions/:id/history` 聚合接口。
- Modify: `server/agent-v2/application/create-agent-v2-services.js`
  责任：新增 `getSessionHistory()` 服务，统一返回 runs 与其事件。
- Modify: `server/agent-v2/repository/agent-v2-repository.js`
  责任：暴露 session 级 run 查询与 run event 读取组合能力。
- Modify: `server/agent-v2/repository/sqlite-agent-v2-repository.js`
  责任：实现 session 下 runs 查询与事件聚合读取。
- Test: `server/routes/agent-v2.test.mjs`
- Test: `server/agent-v2/application/create-agent-v2-services.test.mjs`
- Test: `server/agent-v2/repository/agent-v2-repository.test.mjs`

### 前端历史数据入口与 hydrate

- Create: `src/components/chat-v2/api/fetchSessionRunHistory.ts`
  责任：请求聚合历史接口并返回 typed payload。
- Create: `src/components/chat-v2/hooks/useHistoricalAgentConversation.ts`
  责任：按 session 拉取历史 run events，并组装历史 turn 输入。
- Modify: `src/components/chat-v2/store/createAgentEventStore.ts`
  责任：支持批量 hydrate 历史事件，区分 active/history。
- Modify: `src/components/chat-v2/types/agentEvents.ts`
  责任：扩展历史 hydrate 所需类型。
- Test: `src/components/chat-v2/store/createAgentEventStore.test.mjs`

### 统一 projection

- Create: `src/components/chat-v2/projection/projectAssistantTurnsForSession.ts`
  责任：输入 session 级 runs/events/transcript supplements，输出统一 `AssistantTurn[]`。
- Modify: `src/components/chat-v2/projection/projectRunExecution.ts`
  责任：支持 history 模式下的稳定状态投影。
- Modify: `src/components/chat-v2/projection/projectInlineRuntimeActivity.ts`
  责任：支持历史动态流重建。
- Modify: `src/components/chat-v2/hooks/useAgentConversation.ts`
  责任：复用统一 session turn projection，而不只盯 active run。
- Test: `src/components/chat-v2/projection/projectRunExecution.test.mjs`
- Test: `src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs`
- Create: `src/components/chat-v2/projection/projectAssistantTurnsForSession.test.mjs`

### transcript 补正文与 fallback

- Modify: `src/stores/useSessionStore.ts`
  责任：明确 transcript 作为补正文源，不再等价于历史主模型。
- Modify: `src/components/chat/hooks/useChatSessionState.ts`
  责任：在历史模式下同时准备 transcript supplements。
- Modify: `src/components/chat/hooks/useChatMessages.ts`
  责任：减少 transcript 对主聊天区结构的控制，只保留 text/body 提取与兼容 fallback。
- Test: `src/components/chat/hooks/useChatSessionState.test.mjs`
- Test: `src/components/chat/hooks/useChatMessages.test.mjs`

### turn-first 主渲染切换

- Modify: `src/components/chat/view/ChatInterface.tsx`
  责任：统一实时与历史的 session turn 数据输入。
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
  责任：改成渲染 `UserTurn + AssistantTurn[]`，让 `MessageComponent` 退为 fallback。
- Modify: `src/components/chat/view/subcomponents/MessageComponent.tsx`
  责任：仅保留 fallback/renderless 兼容职责，不再承担历史主渲染。
- Test: `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`
- Test: `src/components/chat/view/agentV2Realtime.test.mjs`

## Task 1: 新增 session 级历史聚合接口

**Files:**
- Modify: `server/routes/agent-v2.js`
- Modify: `server/agent-v2/application/create-agent-v2-services.js`
- Modify: `server/agent-v2/repository/agent-v2-repository.js`
- Modify: `server/agent-v2/repository/sqlite-agent-v2-repository.js`
- Test: `server/routes/agent-v2.test.mjs`
- Test: `server/agent-v2/application/create-agent-v2-services.test.mjs`
- Test: `server/agent-v2/repository/agent-v2-repository.test.mjs`

- [ ] **Step 1: 写失败用例，锁定 session history 接口返回 `runs + eventsByRun`**

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

- [ ] **Step 2: 运行服务端测试，确认接口当前不存在**

Run: `node --test server/routes/agent-v2.test.mjs server/agent-v2/application/create-agent-v2-services.test.mjs server/agent-v2/repository/agent-v2-repository.test.mjs`

Expected: FAIL，包含 `/sessions/:id/history` 缺失或 `getSessionHistory` 未定义。

- [ ] **Step 3: 在 services 中新增 `getSessionHistory()`**

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

- [ ] **Step 4: 在 router 中新增聚合接口**

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

- [ ] **Step 5: 重跑服务端测试**

Run: `node --test server/routes/agent-v2.test.mjs server/agent-v2/application/create-agent-v2-services.test.mjs server/agent-v2/repository/agent-v2-repository.test.mjs`

Expected: PASS

- [ ] **Step 6: 提交这一段**

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

## Task 2: 前端接入历史 run events hydrate 能力

**Files:**
- Create: `src/components/chat-v2/api/fetchSessionRunHistory.ts`
- Create: `src/components/chat-v2/hooks/useHistoricalAgentConversation.ts`
- Modify: `src/components/chat-v2/store/createAgentEventStore.ts`
- Modify: `src/components/chat-v2/types/agentEvents.ts`
- Test: `src/components/chat-v2/store/createAgentEventStore.test.mjs`

- [ ] **Step 1: 写失败用例，锁定 store 可批量注入历史 events**

```js
test("hydrates historical events into session bucket", () => {
  const store = createAgentEventStore();

  store.hydrateSession("sess-1", [
    { type: "run.started", runId: "run-1", sessionId: "sess-1", sequence: 1 },
    { type: "run.completed", runId: "run-1", sessionId: "sess-1", sequence: 2 },
  ]);

  expect(store.listBySession("sess-1")).toHaveLength(2);
});
```

- [ ] **Step 2: 运行 store 测试，确认 hydrate 入口不存在**

Run: `node --test src/components/chat-v2/store/createAgentEventStore.test.mjs`

Expected: FAIL，包含 `hydrateSession is not a function` 或等价错误。

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

- [ ] **Step 4: 扩展 event store 支持 hydrate**

```ts
hydrateSession(sessionId: string, events: AgentEventEnvelope[]) {
  for (const event of events) {
    this.append({ ...event, sessionId });
  }
}
```

- [ ] **Step 5: 新增历史 conversation hook，把 session history 拉回并注入 store**

```ts
const history = await fetchSessionRunHistory(sessionId);
const ordered = Object.values(history.eventsByRun).flat().sort((a, b) => a.sequence - b.sequence);
agentEventStore.hydrateSession(sessionId, ordered);
```

- [ ] **Step 6: 重跑 store 测试**

Run: `node --test src/components/chat-v2/store/createAgentEventStore.test.mjs`

Expected: PASS

- [ ] **Step 7: 提交这一段**

```bash
git add src/components/chat-v2/api/fetchSessionRunHistory.ts \
  src/components/chat-v2/hooks/useHistoricalAgentConversation.ts \
  src/components/chat-v2/store/createAgentEventStore.ts \
  src/components/chat-v2/types/agentEvents.ts \
  src/components/chat-v2/store/createAgentEventStore.test.mjs
git commit -m "feat: hydrate historical run events into agent event store"
```

## Task 3: 新增 session 级 AssistantTurn 统一 projection

**Files:**
- Create: `src/components/chat-v2/projection/projectAssistantTurnsForSession.ts`
- Create: `src/components/chat-v2/projection/projectAssistantTurnsForSession.test.mjs`
- Modify: `src/components/chat-v2/projection/projectRunExecution.ts`
- Modify: `src/components/chat-v2/projection/projectInlineRuntimeActivity.ts`
- Modify: `src/components/chat-v2/hooks/useAgentConversation.ts`
- Test: `src/components/chat-v2/projection/projectRunExecution.test.mjs`
- Test: `src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs`

- [ ] **Step 1: 写失败用例，锁定“一个 session 多个 runs -> 多个 AssistantTurn”**

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

- [ ] **Step 2: 运行 projection 测试，确认 session 级 turn projection 目前不存在**

Run: `node --test src/components/chat-v2/projection/projectRunExecution.test.mjs src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs src/components/chat-v2/projection/projectAssistantTurnsForSession.test.mjs`

Expected: FAIL，至少包含新增投影文件缺失。

- [ ] **Step 3: 实现 session 级 turn projection**

```ts
export function projectAssistantTurnsForSession({ sessionId, events }) {
  const grouped = groupEventsByRun(events.filter((event) => event.sessionId === sessionId));

  return Object.entries(grouped).map(([runId, runEvents]) => ({
    runId,
    summary: projectRunExecution(runEvents),
    activity: projectInlineRuntimeActivity(runEvents),
    presentationMode: "history",
  }));
}
```

- [ ] **Step 4: 让 `useAgentConversation` 同时暴露 session turns**

```ts
const sessionTurns = sessionId ? projectAssistantTurnsForSession({ sessionId, events }) : [];
return { stream, activeRunEvents, activeRunActivity, execution, hasBlockingDecision, sessionTurns };
```

- [ ] **Step 5: 重跑 projection 测试**

Run: `node --test src/components/chat-v2/projection/projectRunExecution.test.mjs src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs src/components/chat-v2/projection/projectAssistantTurnsForSession.test.mjs`

Expected: PASS

- [ ] **Step 6: 提交这一段**

```bash
git add src/components/chat-v2/projection/projectAssistantTurnsForSession.ts \
  src/components/chat-v2/projection/projectAssistantTurnsForSession.test.mjs \
  src/components/chat-v2/projection/projectRunExecution.ts \
  src/components/chat-v2/projection/projectInlineRuntimeActivity.ts \
  src/components/chat-v2/hooks/useAgentConversation.ts \
  src/components/chat-v2/projection/projectRunExecution.test.mjs \
  src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs
git commit -m "feat: project historical session runs into assistant turns"
```

## Task 4: transcript 降级为补正文源，不再主导历史结构

**Files:**
- Modify: `src/stores/useSessionStore.ts`
- Modify: `src/components/chat/hooks/useChatSessionState.ts`
- Modify: `src/components/chat/hooks/useChatMessages.ts`
- Test: `src/components/chat/hooks/useChatSessionState.test.mjs`
- Test: `src/components/chat/hooks/useChatMessages.test.mjs`

- [ ] **Step 1: 写失败用例，锁定 transcript 只作为 body supplement，不再决定主结构**

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

- [ ] **Step 2: 运行相关测试，确认当前 transcript 仍直接控制主消息列表**

Run: `node --test src/components/chat/hooks/useChatSessionState.test.mjs src/components/chat/hooks/useChatMessages.test.mjs`

Expected: FAIL，或现有断言显示 transcript 仍直接复活 legacy 执行态。

- [ ] **Step 3: 在 session state 中显式区分 transcript supplements 与主 turns**

```ts
const transcriptSupplements = extractTranscriptSupplements(storeMessages);
return {
  chatMessages,
  transcriptSupplements,
};
```

- [ ] **Step 4: 在 `useChatMessages` 中保留正文提取，削弱协议/工具/思考消息的主渲染资格**

```ts
if (message.kind === 'thinking' || message.kind === 'tool_use' || message.kind === 'task_notification') {
  return null;
}
```

- [ ] **Step 5: 重跑 transcript 相关测试**

Run: `node --test src/components/chat/hooks/useChatSessionState.test.mjs src/components/chat/hooks/useChatMessages.test.mjs`

Expected: PASS

- [ ] **Step 6: 提交这一段**

```bash
git add src/stores/useSessionStore.ts \
  src/components/chat/hooks/useChatSessionState.ts \
  src/components/chat/hooks/useChatMessages.ts \
  src/components/chat/hooks/useChatSessionState.test.mjs \
  src/components/chat/hooks/useChatMessages.test.mjs
git commit -m "refactor: use transcript as history body supplement only"
```

## Task 5: 聊天页切到 turn-first 历史主渲染

**Files:**
- Modify: `src/components/chat/view/ChatInterface.tsx`
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
- Modify: `src/components/chat/view/subcomponents/MessageComponent.tsx`
- Test: `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`
- Test: `src/components/chat/view/agentV2Realtime.test.mjs`

- [ ] **Step 1: 写失败用例，锁定历史模式优先渲染 `AssistantRuntimeTurn` 列表**

```js
test("renders historical assistant turns instead of legacy assistant messages", () => {
  const screen = renderChatMessagesPane({
    historicalTurns: [{ runId: "run-1", summary: { status: "completed" }, activity: [] }],
    visibleMessages: [makeLegacyAssistantMessage("old assistant text")],
  });

  expect(screen.queryByText("old assistant text")).toBeNull();
  expect(screen.getByTestId("assistant-runtime-turn")).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行聊天渲染测试，确认当前历史主链仍是 `MessageComponent`**

Run: `node --test src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs src/components/chat/view/agentV2Realtime.test.mjs`

Expected: FAIL，显示历史会话仍先渲染 legacy messages。

- [ ] **Step 3: 在 `ChatInterface` 中组装实时/历史统一 turns 输入**

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

- [ ] **Step 6: 提交这一段**

```bash
git add src/components/chat/view/ChatInterface.tsx \
  src/components/chat/view/subcomponents/ChatMessagesPane.tsx \
  src/components/chat/view/subcomponents/MessageComponent.tsx \
  src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs \
  src/components/chat/view/agentV2Realtime.test.mjs
git commit -m "refactor: render history through assistant turns first"
```

## Task 6: 端到端验证历史/实时同构

**Files:**
- Modify: `src/components/chat-v2/components/AssistantRuntimeTurn.test.mjs`
- Modify: `src/components/chat-v2/hooks/useHistoricalAgentConversation.ts`
- Test: `src/components/chat-v2/projection/projectAssistantTurnsForSession.test.mjs`

- [ ] **Step 1: 写同构验证用例，锁定“同一 run 的实时与历史投影结构一致”**

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

- [ ] **Step 2: 跑收口后的重点测试集**

Run: `node --test server/routes/agent-v2.test.mjs server/agent-v2/application/create-agent-v2-services.test.mjs server/agent-v2/repository/agent-v2-repository.test.mjs src/components/chat-v2/store/createAgentEventStore.test.mjs src/components/chat-v2/projection/projectRunExecution.test.mjs src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs src/components/chat-v2/projection/projectAssistantTurnsForSession.test.mjs src/components/chat/hooks/useChatSessionState.test.mjs src/components/chat/hooks/useChatMessages.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs src/components/chat/view/agentV2Realtime.test.mjs`

Expected: PASS

- [ ] **Step 3: 运行类型检查**

Run: `npm run typecheck`

Expected: PASS

- [ ] **Step 4: 做两轮人工 smoke**

Run:

```bash
npm run dev
```

Manual expectations:

- 打开一个刚完成的历史 session，看到的是 `AssistantRuntimeTurn` 而不是 legacy assistant/tool 卡片
- 同一个 session 的当前运行态与历史回看态结构一致，只是 history 不自动滚动
- 某些老旧 session 若没有完整 run events，会走 transcript fallback，但不重新长出多套样式

- [ ] **Step 5: 提交验证收尾**

```bash
git add src/components/chat-v2/components/AssistantRuntimeTurn.test.mjs \
  src/components/chat-v2/hooks/useHistoricalAgentConversation.ts \
  src/components/chat-v2/projection/projectAssistantTurnsForSession.test.mjs
git commit -m "test: verify event-first history matches live assistant turns"
```

## 自检

### Spec coverage

- 历史从 transcript-first 收口到 event-first：Task 1-3 覆盖
- transcript 降级为补正文源：Task 4 覆盖
- turn-first 主渲染切换：Task 5 覆盖
- 历史/实时同构验证：Task 6 覆盖

### Placeholder scan

- 无 TBD/TODO
- 每个任务都有文件、命令、预期结果和最小代码骨架

### Type consistency

- 全程统一使用 `sessionId / runId / eventsByRun / AssistantTurn`
- 历史与实时共享同一 projection contract，不新增第二套 view model
