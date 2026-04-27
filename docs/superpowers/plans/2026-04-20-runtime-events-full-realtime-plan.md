# Runtime Events Full Realtime Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Claude Agent V2 后端产生的全部运行时动态事件，都能逐条实时进入前端当前 `AssistantTurn` 的动态流，并在历史回放中用同一模型重建。

**Architecture:** 以 `SDK event -> translator -> service publish -> websocket -> agentEventStore -> unified projection -> AssistantRuntimeTurn` 作为唯一主链。已知 SDK 事件走明确映射，未知事件走受控 fallback；前端只允许 `agentEventStore + projection` 驱动当前执行态，不再依赖 legacy message 分流。

**Tech Stack:** Node.js, Claude Agent SDK V2, WebSocket, React, Zustand/Jotai-style store utilities, existing `agentEventStore`, Node test runner, Vitest-style component tests

---

## 文件结构

### 后端事件生产与翻译

- Modify: `server/agent-v2/runtime/claude-run-executor.js`
  责任：消费 SDK session 的原始事件流，逐条交给 translator，并保证事件在 run 结束前就能被发布。
- Modify: `server/agent-v2/runtime/claude-v2-event-translator.js`
  责任：把 SDK 原始事件映射成稳定的 V2 domain events；新增 fallback 映射，禁止吞事件。
- Modify: `server/agent-v2/domain/agent-event.js`
  责任：补充前端需要的事件类型与 payload 结构，明确 status/activity/body 三类事件边界。
- Test: `server/agent-v2/runtime/claude-v2-event-translator.test.mjs`
  责任：覆盖已知事件、未知事件 fallback、正文增量与系统/工具/任务事件的映射。

### 后端发布与推送

- Modify: `server/agent-v2/application/create-agent-v2-services.js`
  责任：保证 run event 一产生就进入 publish pipeline，而不是只在 run 完结后落库再统一返回。
- Modify: `server/agent-v2/application/start-conversation-run.js`
  责任：启动新 run 时把 event publisher 接到执行器。
- Modify: `server/agent-v2/application/continue-conversation-run.js`
  责任：续跑时同样复用逐条事件发布链。
- Create: `server/agent-v2/application/run-event-pipeline.js`
  责任：统一“持久化 + 广播 + 运行态更新”的单条事件流水，避免 start/continue 各自拼装。
- Modify: `server/index.js`
  责任：WebSocket `agent-run`、状态推送、权限推送都改为消费统一 run event pipeline 输出。
- Test: `server/agent-v2/application/create-agent-v2-services.test.mjs`
- Test: `server/agent-v2/application/start-conversation-run.test.mjs`
- Test: `server/agent-v2/application/continue-conversation-run.test.mjs`

### 前端实时接收与统一投影

- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.ts`
  责任：WebSocket 收到一条 event 就立刻 append 到 `agentEventStore`，不等待 transcript 补写。
- Modify: `src/components/chat/view/agentV2Realtime.ts`
  责任：统一前端 event envelope 解析。
- Modify: `src/components/chat-v2/store/createAgentEventStore.ts`
  责任：支持 activity/body/status 全量逐条追加，以及历史回放重建。
- Modify: `src/components/chat-v2/types/agentEvents.ts`
  责任：补齐新的 event shape。
- Modify: `src/components/chat-v2/hooks/useAgentConversation.ts`
  责任：只从 `agentEventStore + projection` 产出当前 active run 的 turn model。
- Modify: `src/components/chat-v2/projection/projectInlineRuntimeActivity.ts`
  责任：把全量活动事件稳定映射到动态流 item，不再只映射少数已知类型。
- Test: `src/components/chat-v2/store/createAgentEventStore.test.mjs`
- Test: `src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs`
- Test: `src/components/chat/view/agentV2Realtime.test.mjs`

### 前端统一渲染与 legacy 退出

- Modify: `src/components/chat-v2/components/AssistantRuntimeTurn.ts`
  责任：只基于统一 turn model 渲染状态头、动态流、正文区。
- Modify: `src/components/chat-v2/components/InlineRuntimeActivity.ts`
  责任：展示实时最多 5 条、支持展开全部、运行中自动滚动。
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
  责任：主路径只渲染 user turn 与 assistant turn，隐藏 legacy assistant cluster。
- Modify: `src/components/chat/hooks/useChatMessages.ts`
  责任：阻止协议文本和旧 assistant/tool 消息继续污染主聊天流。
- Modify: `src/components/chat/view/ChatInterface.tsx`
  责任：统一接线到 `AssistantRuntimeTurn` 主路径。
- Test: `src/components/chat-v2/components/AssistantRuntimeTurn.test.mjs`
- Test: `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`
- Test: `src/components/chat/hooks/useChatMessages.test.mjs`

## Task 1: 打通后端“每条 SDK 事件都可外发”的翻译链

**Files:**
- Modify: `server/agent-v2/runtime/claude-run-executor.js`
- Modify: `server/agent-v2/runtime/claude-v2-event-translator.js`
- Modify: `server/agent-v2/domain/agent-event.js`
- Test: `server/agent-v2/runtime/claude-v2-event-translator.test.mjs`

- [ ] **Step 1: 写 translator 失败用例，锁定“未知事件不能吞”和“activity/body/status 三类都要出事件”**

```js
test("maps unknown sdk event into controlled fallback activity event", () => {
  const sdkEvent = { type: "sdk.weird_new_event", foo: "bar" };
  const events = translateClaudeV2Event({ sdkEvent, runId: "run-1", sessionId: "sess-1" });

  expect(events).toEqual([
    expect.objectContaining({
      type: "run.activity.appended",
      runId: "run-1",
      sessionId: "sess-1",
      activity: expect.objectContaining({
        kind: "sdk_fallback",
        sourceType: "sdk.weird_new_event",
      }),
    }),
  ]);
});

test("maps assistant text delta into body segment event", () => {
  const sdkEvent = {
    type: "assistant",
    message: { content: [{ type: "text", text: "hello" }] },
  };
  const events = translateClaudeV2Event({ sdkEvent, runId: "run-1", sessionId: "sess-1" });

  expect(events).toContainEqual(
    expect.objectContaining({
      type: "run.body.segment_appended",
      segment: expect.objectContaining({ text: "hello" }),
    }),
  );
});
```

- [ ] **Step 2: 运行后端 translator 测试，确认当前实现确实缺映射**

Run: `node --test server/agent-v2/runtime/claude-v2-event-translator.test.mjs`

Expected: FAIL，至少包含 unknown event 被丢弃、正文事件未正确映射，或断言类型不匹配。

- [ ] **Step 3: 最小实现 translator 与 domain event 扩展**

```js
export function translateClaudeV2Event({ sdkEvent, runId, sessionId }) {
  const mapped = [];

  if (isStatusEvent(sdkEvent)) {
    mapped.push(makeStatusEvent({ sdkEvent, runId, sessionId }));
  }

  if (isAssistantTextEvent(sdkEvent)) {
    mapped.push(makeBodySegmentEvent({ sdkEvent, runId, sessionId }));
  }

  if (isKnownActivityEvent(sdkEvent)) {
    mapped.push(makeActivityEvent({ sdkEvent, runId, sessionId }));
  }

  if (mapped.length === 0) {
    mapped.push(
      makeActivityEvent({
        runId,
        sessionId,
        sdkEvent,
        kind: "sdk_fallback",
        summary: sdkEvent.type,
      }),
    );
  }

  return mapped;
}
```

- [ ] **Step 4: 让执行器逐条吐出 translator 的所有事件**

```js
for await (const sdkEvent of session.stream(request)) {
  const translatedEvents = translateClaudeV2Event({ sdkEvent, runId, sessionId });
  for (const event of translatedEvents) {
    onEvent?.(event);
  }
}
```

- [ ] **Step 5: 重新运行 translator 测试，确认事件不再被吞**

Run: `node --test server/agent-v2/runtime/claude-v2-event-translator.test.mjs`

Expected: PASS

- [ ] **Step 6: 提交这一段**

```bash
git add server/agent-v2/runtime/claude-run-executor.js \
  server/agent-v2/runtime/claude-v2-event-translator.js \
  server/agent-v2/domain/agent-event.js \
  server/agent-v2/runtime/claude-v2-event-translator.test.mjs
git commit -m "feat: emit full runtime events from claude translator"
```

## Task 2: 打通服务端逐条 publish 和 websocket 广播

**Files:**
- Create: `server/agent-v2/application/run-event-pipeline.js`
- Modify: `server/agent-v2/application/create-agent-v2-services.js`
- Modify: `server/agent-v2/application/start-conversation-run.js`
- Modify: `server/agent-v2/application/continue-conversation-run.js`
- Modify: `server/index.js`
- Test: `server/agent-v2/application/create-agent-v2-services.test.mjs`
- Test: `server/agent-v2/application/start-conversation-run.test.mjs`
- Test: `server/agent-v2/application/continue-conversation-run.test.mjs`

- [ ] **Step 1: 写失败用例，锁定“每条事件都会立刻持久化并广播”**

```js
test("publishes every translated run event immediately", async () => {
  const published = [];
  const persisted = [];
  const services = createAgentV2Services({
    publishRunEvent: (event) => published.push(event),
    repository: { appendRunEvent: async (event) => persisted.push(event) },
  });

  await services.handleRunEvent(
    { type: "run.activity.appended", runId: "run-1", sessionId: "sess-1" },
  );

  expect(persisted).toHaveLength(1);
  expect(published).toHaveLength(1);
});
```

- [ ] **Step 2: 运行 application 测试，确认当前 publish 行为不是逐条即时**

Run: `node --test server/agent-v2/application/create-agent-v2-services.test.mjs server/agent-v2/application/start-conversation-run.test.mjs server/agent-v2/application/continue-conversation-run.test.mjs`

Expected: FAIL，体现事件只在 run 结束后汇总、或某些分支未广播。

- [ ] **Step 3: 引入统一 run event pipeline**

```js
export async function handleRunEvent({ event, repository, publish }) {
  await repository.appendRunEvent(event);
  publish(event);
}
```

- [ ] **Step 4: 在 start/continue 中把执行器的 `onEvent` 接到 pipeline**

```js
await executeClaudeRun({
  runId,
  sessionId,
  onEvent: async (event) => {
    await handleRunEvent({ event, repository, publish: publishRunEvent });
  },
});
```

- [ ] **Step 5: 在 `server/index.js` 中统一 websocket 广播 event envelope**

```js
publishRunEvent(event) {
  broadcastToSession(event.sessionId, {
    type: "agent-v2.run.event",
    payload: event,
  });
}
```

- [ ] **Step 6: 重跑 application 测试，确认事件逐条持久化与广播**

Run: `node --test server/agent-v2/application/create-agent-v2-services.test.mjs server/agent-v2/application/start-conversation-run.test.mjs server/agent-v2/application/continue-conversation-run.test.mjs`

Expected: PASS

- [ ] **Step 7: 提交这一段**

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

## Task 3: 打通前端 websocket -> store 的逐条实时接入

**Files:**
- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.ts`
- Modify: `src/components/chat/view/agentV2Realtime.ts`
- Modify: `src/components/chat-v2/store/createAgentEventStore.ts`
- Modify: `src/components/chat-v2/types/agentEvents.ts`
- Modify: `src/components/chat-v2/hooks/useAgentConversation.ts`
- Test: `src/components/chat-v2/store/createAgentEventStore.test.mjs`
- Test: `src/components/chat/view/agentV2Realtime.test.mjs`

- [ ] **Step 1: 写失败用例，锁定“收到一条 event 就立刻进入 store”**

```js
test("appends websocket runtime event immediately", () => {
  const store = createAgentEventStore();

  store.append({
    type: "run.activity.appended",
    runId: "run-1",
    sessionId: "sess-1",
    activity: { id: "a-1", kind: "tool", summary: "Read file" },
  });

  expect(store.getState().runs["run-1"].events).toHaveLength(1);
});
```

- [ ] **Step 2: 运行前端 store/realtime 测试，确认当前实现还存在 legacy 分流或缺字段**

Run: `node --test src/components/chat-v2/store/createAgentEventStore.test.mjs src/components/chat/view/agentV2Realtime.test.mjs`

Expected: FAIL，可能表现为 event 未进入 active run、未知事件被忽略、或 envelope 解析失败。

- [ ] **Step 3: 扩展 agent event types 与 store append 逻辑**

```ts
type AgentRunEvent =
  | RunStatusEvent
  | RunActivityAppendedEvent
  | RunBodySegmentAppendedEvent;

append(event: AgentRunEvent) {
  const run = ensureRunBucket(event.runId, event.sessionId);
  run.events.push(event);
}
```

- [ ] **Step 4: 在 realtime handler 中直接把 websocket event append 到 `agentEventStore`**

```ts
if (message.type === "agent-v2.run.event") {
  agentEventStore.append(message.payload);
  return;
}
```

- [ ] **Step 5: 调整 `useAgentConversation`，只从 `agentEventStore` 计算 active run**

```ts
const activeRun = projectRunExecution(agentEventStoreState, {
  sessionId,
  activeRunId,
});
```

- [ ] **Step 6: 重跑 store/realtime 测试**

Run: `node --test src/components/chat-v2/store/createAgentEventStore.test.mjs src/components/chat/view/agentV2Realtime.test.mjs`

Expected: PASS

- [ ] **Step 7: 提交这一段**

```bash
git add src/components/chat/hooks/useChatRealtimeHandlers.ts \
  src/components/chat/view/agentV2Realtime.ts \
  src/components/chat-v2/store/createAgentEventStore.ts \
  src/components/chat-v2/types/agentEvents.ts \
  src/components/chat-v2/hooks/useAgentConversation.ts \
  src/components/chat-v2/store/createAgentEventStore.test.mjs \
  src/components/chat/view/agentV2Realtime.test.mjs
git commit -m "feat: append run events to frontend store in realtime"
```

## Task 4: 完成 unified projection，让全部动态都进入 AssistantTurn 动态流

**Files:**
- Modify: `src/components/chat-v2/projection/projectInlineRuntimeActivity.ts`
- Modify: `src/components/chat-v2/components/AssistantRuntimeTurn.ts`
- Modify: `src/components/chat-v2/components/InlineRuntimeActivity.ts`
- Test: `src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs`
- Test: `src/components/chat-v2/components/AssistantRuntimeTurn.test.mjs`

- [ ] **Step 1: 写失败用例，锁定“tool/system/fallback/body 都能出现在同一 turn model”**

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

- [ ] **Step 2: 运行 projection / component 测试，确认当前投影未覆盖全量动态**

Run: `node --test src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs src/components/chat-v2/components/AssistantRuntimeTurn.test.mjs`

Expected: FAIL，表现为 activity item 数量不足、body segment 不稳定、或组件未渲染完整动态流。

- [ ] **Step 3: 扩展 projection，把所有 activity 事件映射到统一动态项**

```ts
if (event.type === "run.activity.appended") {
  items.push({
    id: event.activity.id,
    label: event.activity.summary,
    kind: event.activity.kind,
    timestamp: event.activity.timestamp ?? event.timestamp,
  });
}
```

- [ ] **Step 4: 让 `AssistantRuntimeTurn` 固定渲染三层结构**

```tsx
<AssistantRuntimeTurn>
  <RuntimeHeader status={turn.status} />
  <InlineRuntimeActivity items={turn.activityItems} />
  <AssistantBody segments={turn.bodySegments} />
</AssistantRuntimeTurn>
```

- [ ] **Step 5: 在 `InlineRuntimeActivity` 中实现“最近 5 条 + 展开全部 + 运行中自动滚动”**

```tsx
const visibleItems = expanded ? items : items.slice(-5);
useEffect(() => {
  if (isRunning) {
    scrollToBottom();
  }
}, [items, isRunning]);
```

- [ ] **Step 6: 重跑 projection / component 测试**

Run: `node --test src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs src/components/chat-v2/components/AssistantRuntimeTurn.test.mjs`

Expected: PASS

- [ ] **Step 7: 提交这一段**

```bash
git add src/components/chat-v2/projection/projectInlineRuntimeActivity.ts \
  src/components/chat-v2/components/AssistantRuntimeTurn.ts \
  src/components/chat-v2/components/InlineRuntimeActivity.ts \
  src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs \
  src/components/chat-v2/components/AssistantRuntimeTurn.test.mjs
git commit -m "feat: project full runtime activity into assistant turn"
```

## Task 5: 清退 legacy 主路径，避免实时动态再次被旧消息样式分流

**Files:**
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
- Modify: `src/components/chat/hooks/useChatMessages.ts`
- Modify: `src/components/chat/view/ChatInterface.tsx`
- Test: `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`
- Test: `src/components/chat/hooks/useChatMessages.test.mjs`

- [ ] **Step 1: 写失败用例，锁定“有 AssistantTurn 时不再渲染 legacy assistant/tool 协议消息”**

```js
test("hides legacy assistant cluster when runtime turn is present", () => {
  const result = renderChatMessagesPane({
    runtimeTurn: makeRuntimeTurn(),
    messages: [makeLegacyAssistantMessage("<task-notification>done</task-notification>")],
  });

  expect(result.queryByText("<task-notification>")).toBeNull();
});
```

- [ ] **Step 2: 运行聊天渲染测试，确认当前页面仍会混渲染**

Run: `node --test src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs src/components/chat/hooks/useChatMessages.test.mjs`

Expected: FAIL，显示 legacy assistant cluster 仍在、协议文本仍泄漏。

- [ ] **Step 3: 在 `useChatMessages` 里继续过滤协议型 assistant 内容**

```ts
if (looksLikeProtocolNoise(content)) {
  return null;
}
```

- [ ] **Step 4: 在 `ChatMessagesPane` 中让 `AssistantRuntimeTurn` 成为唯一 assistant 主路径**

```tsx
{runtimeTurn ? (
  <AssistantRuntimeTurn turn={runtimeTurn} />
) : (
  renderLegacyMessagesOnlyForHistoryFallback()
)}
```

- [ ] **Step 5: 重跑聊天渲染测试**

Run: `node --test src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs src/components/chat/hooks/useChatMessages.test.mjs`

Expected: PASS

- [ ] **Step 6: 提交这一段**

```bash
git add src/components/chat/view/subcomponents/ChatMessagesPane.tsx \
  src/components/chat/hooks/useChatMessages.ts \
  src/components/chat/view/ChatInterface.tsx \
  src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs \
  src/components/chat/hooks/useChatMessages.test.mjs
git commit -m "refactor: route assistant rendering through runtime turn only"
```

## Task 6: 做数据库闭环与端到端验证

**Files:**
- Modify: `server/agent-v2/repository/agent-v2-repository.js`
- Modify: `server/agent-v2/repository/sqlite-agent-v2-repository.js`
- Test: `server/agent-v2/repository/agent-v2-repository.test.mjs`
- Test: `server/agent-v2/repository/sqlite-agent-v2-repository.test.mjs`
- Test: `server/database/init-compat.test.mjs`

- [ ] **Step 1: 写失败用例，锁定 run event 持久化后可完整回放 activity/body/status**

```js
test("rebuilds assistant turn from persisted run events", async () => {
  await repository.appendRunEvent({ type: "run.activity.appended", runId: "run-1", sessionId: "sess-1" });
  const events = await repository.listRunEvents("run-1");

  expect(events).toEqual([
    expect.objectContaining({ type: "run.activity.appended" }),
  ]);
});
```

- [ ] **Step 2: 运行 repository / db 测试**

Run: `node --test server/agent-v2/repository/agent-v2-repository.test.mjs server/agent-v2/repository/sqlite-agent-v2-repository.test.mjs server/database/init-compat.test.mjs`

Expected: PASS 或 FAIL；若 FAIL，先补齐 schema/读写字段直到通过。

- [ ] **Step 3: 运行收口后的重点测试集**

Run: `node --test server/agent-v2/runtime/claude-v2-event-translator.test.mjs server/agent-v2/application/create-agent-v2-services.test.mjs server/agent-v2/application/start-conversation-run.test.mjs server/agent-v2/application/continue-conversation-run.test.mjs src/components/chat-v2/store/createAgentEventStore.test.mjs src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs src/components/chat-v2/components/AssistantRuntimeTurn.test.mjs src/components/chat/view/agentV2Realtime.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs src/components/chat/hooks/useChatMessages.test.mjs`

Expected: PASS

- [ ] **Step 4: 运行类型检查**

Run: `npm run typecheck`

Expected: PASS

- [ ] **Step 5: 做两轮人工 smoke**

Run:

```bash
npm run dev
```

Manual expectations:

- 在当前项目新建会话，发送消息后，动态流从第一条事件开始实时追加
- 在 `html` 项目新建会话，消息仍留在当前项目上下文，不跳项目
- 运行中最多先显示最近 5 条，展开后能看到完整动态
- 回看刚完成的会话，历史态仍看到相同的 `AssistantTurn` 结构

- [ ] **Step 6: 提交验证收尾**

```bash
git add server/agent-v2/repository/agent-v2-repository.js \
  server/agent-v2/repository/sqlite-agent-v2-repository.js \
  server/agent-v2/repository/agent-v2-repository.test.mjs \
  server/agent-v2/repository/sqlite-agent-v2-repository.test.mjs \
  server/database/init-compat.test.mjs
git commit -m "test: verify realtime runtime event pipeline end to end"
```

## 自检

### Spec coverage

- “后端全部动态实时反馈到前端”：Task 1-4 覆盖
- “统一为单一 AssistantTurn”：Task 4-5 覆盖
- “历史与实时同构”：Task 3、Task 4、Task 6 覆盖
- “退出 legacy 多轨渲染”：Task 5 覆盖

### Placeholder scan

- 未使用 TBD/TODO
- 每个任务都有具体文件、命令和预期结果

### Type consistency

- 统一使用 `run.activity.appended`、`run.body.segment_appended`、status event 三类命名
- 前后端均围绕 `runId + sessionId` 与 `AssistantTurnViewModel` 对齐
