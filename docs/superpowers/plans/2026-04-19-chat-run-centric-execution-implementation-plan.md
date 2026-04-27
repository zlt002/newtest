# Chat Run-Centric Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前聊天区从“消息拼装 + 提前猜最终答案”的模型，重构为“一个用户问题 = 一个 run；默认时间线展示，完成后才提交正式结果”的模型。

**Architecture:** 先在数据层新增 run builder，把 store message 流切成稳定的 `AssistantRun[]`，并在协议消费层消除首屏独立 `Processing`、过早 `finalAnswer`、重复树节点等问题。UI 层改为默认单列 timeline，只对子代理和工具详情做局部展开，最后逐步淘汰旧 `ExecutionMessage/JobTree` 特判。

**Tech Stack:** React, TypeScript, Zustand-style session store hook, Node test runner, server JSONL/message history API

---

## 文件结构

### 新增

- `src/components/chat/run-state/runStateTypes.ts`
  run-centric 数据模型定义：`AssistantRun`、`RunEvent`、`RunCommittedAnswer`
- `src/components/chat/run-state/buildAssistantRuns.ts`
  从 `ChatMessage[]` 构建 `AssistantRun[]`
- `src/components/chat/run-state/buildAssistantRuns.test.mjs`
  run 分段、事件分类、结果提交规则测试
- `src/components/chat/run-state/runEventClassifier.ts`
  将消息映射为 timeline event 的纯函数
- `src/components/chat/run-state/runEventClassifier.test.mjs`
- `src/components/chat/run-state/runSegmentation.ts`
  run 生命周期切分与 completed/waiting/aborted 边界
- `src/components/chat/run-state/runSegmentation.test.mjs`
- `src/components/chat/run-view/components/RunContainer.tsx`
  单个 run 容器
- `src/components/chat/run-view/components/RunTimeline.tsx`
  时间线列表
- `src/components/chat/run-view/components/RunTimelineEvent.tsx`
  单个 timeline event
- `src/components/chat/run-view/components/RunCommittedAnswer.tsx`
  完成后展示的正式结果区
- `src/components/chat/run-view/components/RunContainer.test.mjs`
- `src/components/chat/run-view/components/RunTimeline.test.mjs`

### 修改

- `src/components/chat/hooks/useChatMessages.ts`
  从生成 `Execution Message` 改为生成基于 run 的 assistant 容器消息
- `src/components/chat/types/types.ts`
  为新 run 模型扩展消息类型字段
- `src/components/chat/view/subcomponents/MessageComponent.tsx`
  接入 `RunContainer`
- `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
  去掉独立 `Processing` 壳，改为 run skeleton 占位
- `src/components/chat/hooks/useChatRealtimeHandlers.ts`
  调整 complete / waiting / reconnect 后的消费策略，使其符合 run 生命周期
- `src/stores/useSessionStore.ts`
  为 realtime merge 增加稳定排序/去重基础，减少前端纯到达顺序拼装
- `src/components/chat/execution-message/*`
  保留过渡期兼容，最后删除或降级为 wrapper
- `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`
- `src/components/chat/view/subcomponents/MessageComponent.jobTree.test.mjs`
- `src/components/chat/hooks/useChatMessages.test.mjs`

### 参考

- `docs/superpowers/specs/2026-04-19-chat-run-centric-execution-design.md`
- `src/stores/sessionStoreRebind.js`
- `src/components/chat/hooks/sessionCompletionSync.js`
- `src/components/chat/hooks/useChatSessionState.ts`

---

### Task 1: 定义 Run-Centric 数据模型

**Files:**
- Create: `src/components/chat/run-state/runStateTypes.ts`
- Test: `src/components/chat/run-state/buildAssistantRuns.test.mjs`

- [ ] **Step 1: 写一个失败测试，描述 run 最小结构**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAssistantRuns } from './buildAssistantRuns.ts';

test('buildAssistantRuns groups one user turn into one run with timeline and committed answer', () => {
  const runs = buildAssistantRuns([
    { type: 'assistant', isThinking: true, content: '我先看一下', timestamp: '2026-04-19T12:00:00.000Z' },
    { type: 'assistant', isToolUse: true, toolName: 'Read', toolInput: { file_path: '/tmp/a.md' }, timestamp: '2026-04-19T12:00:01.000Z' },
    { type: 'assistant', content: '已完成。', timestamp: '2026-04-19T12:00:02.000Z' },
  ]);

  assert.equal(runs.length, 1);
  assert.equal(runs[0].timeline.length, 2);
  assert.equal(runs[0].committedAnswer?.content, '已完成。');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/run-state/buildAssistantRuns.test.mjs`

Expected: FAIL，提示 `buildAssistantRuns` 或新类型不存在

- [ ] **Step 3: 定义最小数据模型**

```ts
export type RunStatus = 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'aborted';

export type RunEventKind =
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'status'
  | 'warning'
  | 'error'
  | 'subagent'
  | 'subagent_step'
  | 'permission'
  | 'text_note';

export interface RunEvent {
  id: string;
  kind: RunEventKind;
  title: string;
  status: 'queued' | 'running' | 'waiting' | 'completed' | 'failed';
  timestamp?: string | number | Date;
  meta?: Record<string, unknown>;
}

export interface RunCommittedAnswer {
  content: string;
  timestamp?: string | number | Date;
}

export interface AssistantRun {
  runId: string;
  status: RunStatus;
  startedAt?: string | number | Date;
  completedAt?: string | number | Date;
  timeline: RunEvent[];
  committedAnswer: RunCommittedAnswer | null;
}
```

- [ ] **Step 4: 创建 builder 壳函数**

```ts
import type { ChatMessage } from '../types/types.ts';
import type { AssistantRun } from './runStateTypes.ts';

export function buildAssistantRuns(_messages: ChatMessage[]): AssistantRun[] {
  return [];
}
```

- [ ] **Step 5: 再跑测试，确认仍然失败但进入下一步**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/run-state/buildAssistantRuns.test.mjs`

Expected: FAIL，断言长度不匹配

- [ ] **Step 6: 提交**

```bash
git add src/components/chat/run-state/runStateTypes.ts src/components/chat/run-state/buildAssistantRuns.ts src/components/chat/run-state/buildAssistantRuns.test.mjs
git commit -m "feat: scaffold chat run state model"
```

### Task 2: 实现事件分类器

**Files:**
- Create: `src/components/chat/run-state/runEventClassifier.ts`
- Create: `src/components/chat/run-state/runEventClassifier.test.mjs`
- Modify: `src/components/chat/run-state/buildAssistantRuns.ts`

- [ ] **Step 1: 写失败测试，区分 text_note 与 committed answer 候选**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyRunEvent } from './runEventClassifier.ts';

test('classifyRunEvent maps thinking and tool_use to timeline events', () => {
  assert.equal(classifyRunEvent({ type: 'assistant', isThinking: true, content: '想一下' }).kind, 'thinking');
  assert.equal(classifyRunEvent({ type: 'assistant', isToolUse: true, toolName: 'Read' }).kind, 'tool_call');
});

test('classifyRunEvent maps plain assistant text to text_note by default', () => {
  assert.equal(classifyRunEvent({ type: 'assistant', content: '我先说明一下' }).kind, 'text_note');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/run-state/runEventClassifier.test.mjs`

Expected: FAIL，提示 `classifyRunEvent` 不存在

- [ ] **Step 3: 实现最小分类器**

```ts
import type { ChatMessage } from '../types/types.ts';
import type { RunEvent } from './runStateTypes.ts';

export function classifyRunEvent(message: ChatMessage): RunEvent | null {
  if (message.isThinking) {
    return { id: 'thinking', kind: 'thinking', title: String(message.content || '').trim() || '思考中', status: 'running', timestamp: message.timestamp };
  }

  if (message.isToolUse) {
    return { id: String(message.toolId || message.toolName || 'tool'), kind: 'tool_call', title: String(message.toolName || '工具调用'), status: 'running', timestamp: message.timestamp };
  }

  if (message.type === 'assistant' && String(message.content || '').trim()) {
    return { id: `note-${String(message.timestamp || '')}`, kind: 'text_note', title: String(message.content || '').trim(), status: 'completed', timestamp: message.timestamp };
  }

  return null;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/run-state/runEventClassifier.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/chat/run-state/runEventClassifier.ts src/components/chat/run-state/runEventClassifier.test.mjs src/components/chat/run-state/buildAssistantRuns.ts
git commit -m "feat: classify chat messages into run timeline events"
```

### Task 3: 实现 run 生命周期切分

**Files:**
- Create: `src/components/chat/run-state/runSegmentation.ts`
- Create: `src/components/chat/run-state/runSegmentation.test.mjs`
- Modify: `src/components/chat/run-state/buildAssistantRuns.ts`

- [ ] **Step 1: 写失败测试，验证 complete 前后不会串 run**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { segmentAssistantRuns } from './runSegmentation.ts';

test('segmentAssistantRuns keeps events before complete in one run', () => {
  const runs = segmentAssistantRuns([
    { kind: 'thinking', timestamp: '2026-04-19T12:00:00.000Z' },
    { kind: 'tool_use', timestamp: '2026-04-19T12:00:01.000Z' },
    { kind: 'complete', timestamp: '2026-04-19T12:00:02.000Z' },
  ]);
  assert.equal(runs.length, 1);
});

test('segmentAssistantRuns starts a new run when new execution events appear after complete', () => {
  const runs = segmentAssistantRuns([
    { kind: 'thinking', timestamp: '2026-04-19T12:00:00.000Z' },
    { kind: 'complete', timestamp: '2026-04-19T12:00:01.000Z' },
    { kind: 'thinking', timestamp: '2026-04-19T12:00:02.000Z' },
  ]);
  assert.equal(runs.length, 2);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/run-state/runSegmentation.test.mjs`

Expected: FAIL

- [ ] **Step 3: 实现最小分段逻辑**

```ts
export function segmentAssistantRuns(messages) {
  const runs = [];
  let current = [];
  let closed = false;

  for (const message of messages) {
    const kind = String(message.kind || '');
    const startsExecution = ['thinking', 'tool_use', 'tool_result', 'text', 'permission_request', 'error'].includes(kind);

    if (closed && startsExecution) {
      runs.push(current);
      current = [];
      closed = false;
    }

    current.push(message);

    if (kind === 'complete' || kind === 'permission_request' || kind === 'error') {
      closed = true;
    }
  }

  if (current.length > 0) {
    runs.push(current);
  }

  return runs;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/run-state/runSegmentation.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/chat/run-state/runSegmentation.ts src/components/chat/run-state/runSegmentation.test.mjs src/components/chat/run-state/buildAssistantRuns.ts
git commit -m "feat: segment assistant message streams into runs"
```

### Task 4: 只在 run 完成后提交正式结果

**Files:**
- Modify: `src/components/chat/run-state/buildAssistantRuns.ts`
- Test: `src/components/chat/run-state/buildAssistantRuns.test.mjs`

- [ ] **Step 1: 写失败测试，确保中间说明文案不进入 committed answer**

```js
test('buildAssistantRuns only commits the final assistant text after the run completes', () => {
  const runs = buildAssistantRuns([
    { type: 'assistant', content: '我先说明一下', timestamp: '2026-04-19T12:01:00.000Z' },
    { type: 'assistant', isToolUse: true, toolName: 'Write', timestamp: '2026-04-19T12:01:01.000Z' },
    { type: 'assistant', content: '已创建文件。', timestamp: '2026-04-19T12:01:02.000Z' },
    { type: 'assistant', normalizedKind: 'complete', typeOverride: 'complete', timestamp: '2026-04-19T12:01:03.000Z' },
  ]);

  assert.equal(runs[0].committedAnswer?.content, '已创建文件。');
  assert.equal(runs[0].timeline.some(event => event.title === '我先说明一下'), true);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/run-state/buildAssistantRuns.test.mjs`

Expected: FAIL，committed answer 为空或错误

- [ ] **Step 3: 实现 committed answer 提交规则**

```ts
function extractCommittedAnswer(messages: ChatMessage[]) {
  const assistantTexts = messages.filter((message) =>
    message.type === 'assistant'
    && !message.isThinking
    && !message.isToolUse
    && String(message.content || '').trim(),
  );

  const last = assistantTexts.at(-1);
  if (!last) {
    return null;
  }

  return {
    content: String(last.content || '').trim(),
    timestamp: last.timestamp,
  };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/run-state/buildAssistantRuns.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/chat/run-state/buildAssistantRuns.ts src/components/chat/run-state/buildAssistantRuns.test.mjs
git commit -m "fix: only commit chat answers after run completion"
```

### Task 5: 接入 useChatMessages，生成 run 容器消息

**Files:**
- Modify: `src/components/chat/hooks/useChatMessages.ts`
- Modify: `src/components/chat/types/types.ts`
- Test: `src/components/chat/hooks/useChatMessages.test.mjs`

- [ ] **Step 1: 写失败测试，验证一个 assistant run 只渲染一个 run 消息**

```js
test('normalizedToChatMessages collapses assistant events into a single run message', () => {
  const messages = normalizedToChatMessages([
    { id: 'u1', sessionId: 's1', provider: 'claude', kind: 'text', role: 'user', content: '分析当前项目', timestamp: '2026-04-19T12:10:00.000Z' },
    { id: 'a1', sessionId: 's1', provider: 'claude', kind: 'thinking', content: '先看看', timestamp: '2026-04-19T12:10:01.000Z' },
    { id: 'a2', sessionId: 's1', provider: 'claude', kind: 'tool_use', toolName: 'Bash', toolInput: { command: 'ls' }, timestamp: '2026-04-19T12:10:02.000Z' },
  ]);

  assert.equal(messages.filter(message => message.isRunMessage).length, 1);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/hooks/useChatMessages.test.mjs`

Expected: FAIL

- [ ] **Step 3: 扩展消息类型并接入 run builder**

```ts
export interface ChatMessage {
  // ...
  isRunMessage?: boolean;
  assistantRun?: AssistantRun | null;
}
```

```ts
const runs = buildAssistantRuns(segmentMessages);
return runs.map(run => ({
  type: 'assistant',
  content: run.committedAnswer?.content || '',
  timestamp: run.startedAt || new Date(),
  isRunMessage: true,
  assistantRun: run,
}));
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/hooks/useChatMessages.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/chat/hooks/useChatMessages.ts src/components/chat/types/types.ts src/components/chat/hooks/useChatMessages.test.mjs
git commit -m "feat: emit run-centric assistant messages"
```

### Task 6: 用时间线容器替换当前 execution container

**Files:**
- Create: `src/components/chat/run-view/components/RunContainer.tsx`
- Create: `src/components/chat/run-view/components/RunTimeline.tsx`
- Create: `src/components/chat/run-view/components/RunTimelineEvent.tsx`
- Create: `src/components/chat/run-view/components/RunCommittedAnswer.tsx`
- Modify: `src/components/chat/view/subcomponents/MessageComponent.tsx`
- Test: `src/components/chat/run-view/components/RunContainer.test.mjs`
- Test: `src/components/chat/view/subcomponents/MessageComponent.jobTree.test.mjs`

- [ ] **Step 1: 写失败测试，验证运行中不出现结果区**

```js
test('RunContainer hides committed answer section while the run is still running', () => {
  const run = {
    runId: 'run-1',
    status: 'running',
    timeline: [{ id: 'e1', kind: 'thinking', title: '先分析目录', status: 'running' }],
    committedAnswer: null,
  };

  const markup = renderToStaticMarkup(React.createElement(RunContainer, { run }));
  assert.doesNotMatch(markup, /回答结果/);
  assert.match(markup, /先分析目录/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/run-view/components/RunContainer.test.mjs src/components/chat/view/subcomponents/MessageComponent.jobTree.test.mjs`

Expected: FAIL

- [ ] **Step 3: 实现最小时间线容器**

```tsx
export default function RunContainer({ run }) {
  return (
    <div data-run-message="true" className="space-y-4">
      <div className="rounded-2xl border border-blue-200/80 bg-blue-50/60 p-4">
        <div className="text-[11px] font-medium uppercase tracking-wide text-blue-700">主代理</div>
        <div className="mt-2 text-sm text-blue-900/80">
          {run.status === 'completed' ? '回答已生成' : '执行中'}
        </div>
      </div>
      <RunTimeline run={run} />
      {run.status === 'completed' && run.committedAnswer && (
        <RunCommittedAnswer answer={run.committedAnswer} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: 在 MessageComponent 中优先渲染 run**

```tsx
if (message.isRunMessage && message.assistantRun) {
  return <RunContainer run={message.assistantRun} />;
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/run-view/components/RunContainer.test.mjs src/components/chat/view/subcomponents/MessageComponent.jobTree.test.mjs`

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/components/chat/run-view/components/RunContainer.tsx src/components/chat/run-view/components/RunTimeline.tsx src/components/chat/run-view/components/RunTimelineEvent.tsx src/components/chat/run-view/components/RunCommittedAnswer.tsx src/components/chat/run-view/components/RunContainer.test.mjs src/components/chat/view/subcomponents/MessageComponent.tsx src/components/chat/view/subcomponents/MessageComponent.jobTree.test.mjs
git commit -m "feat: render assistant runs as timeline-first containers"
```

### Task 7: 移除首屏独立 Processing 壳

**Files:**
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
- Test: `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`

- [ ] **Step 1: 写失败测试，验证首屏 loading 使用 run skeleton**

```js
test('ChatMessagesPane renders a run skeleton instead of a standalone Processing pill', () => {
  const markup = renderPane({
    chatMessages: [],
    visibleMessages: [],
    isLoading: true,
    claudeStatus: { text: 'Processing', tokens: 0, can_interrupt: true },
  });

  assert.match(markup, /data-chat-loading-placeholder="true"/);
  assert.match(markup, /主代理/);
  assert.doesNotMatch(markup, />Processing</);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`

Expected: FAIL

- [ ] **Step 3: 用 run skeleton 替换旧占位**

```tsx
<div data-chat-loading-placeholder="true" className="mx-auto max-w-4xl px-3 sm:px-0">
  <div className="rounded-2xl border border-blue-200/80 bg-blue-50/60 p-4">
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-medium uppercase tracking-wide text-blue-700">主代理</span>
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">执行中</span>
    </div>
    <div className="mt-3 rounded-xl border border-blue-200/70 bg-white/70 px-3 py-3 text-sm text-blue-900/80">
      {loadingText}
    </div>
  </div>
</div>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/chat/view/subcomponents/ChatMessagesPane.tsx src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs
git commit -m "refactor: replace standalone processing placeholder with run skeleton"
```

### Task 8: 为 realtime 合并增加稳定顺序基础

**Files:**
- Modify: `src/stores/useSessionStore.ts`
- Create: `src/stores/useSessionStore.ordering.test.mjs`

- [ ] **Step 1: 写失败测试，验证 sequence/rowid/timestamp 排序**

```js
test('computeMerged keeps merged messages sorted by sequence, then rowid, then timestamp', () => {
  const merged = computeMerged(
    [{ id: 's1', kind: 'thinking', sequence: 2, timestamp: '2026-04-19T12:20:02.000Z' }],
    [{ id: 'r1', kind: 'tool_use', sequence: 1, timestamp: '2026-04-19T12:20:01.000Z' }],
  );

  assert.equal(merged[0].id, 'r1');
  assert.equal(merged[1].id, 's1');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/stores/useSessionStore.ordering.test.mjs`

Expected: FAIL

- [ ] **Step 3: 实现稳定排序函数并接入 computeMerged**

```ts
function compareMessageOrder(left: NormalizedMessage, right: NormalizedMessage) {
  const leftSequence = Number.isFinite(left.sequence) ? Number(left.sequence) : Number.POSITIVE_INFINITY;
  const rightSequence = Number.isFinite(right.sequence) ? Number(right.sequence) : Number.POSITIVE_INFINITY;
  if (leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }

  const leftRowid = Number.isFinite(left.rowid) ? Number(left.rowid) : Number.POSITIVE_INFINITY;
  const rightRowid = Number.isFinite(right.rowid) ? Number(right.rowid) : Number.POSITIVE_INFINITY;
  if (leftRowid !== rightRowid) {
    return leftRowid - rightRowid;
  }

  return new Date(left.timestamp || 0).getTime() - new Date(right.timestamp || 0).getTime();
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/stores/useSessionStore.ordering.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/stores/useSessionStore.ts src/stores/useSessionStore.ordering.test.mjs
git commit -m "fix: stabilize chat message ordering across realtime merges"
```

### Task 9: 清理旧 ExecutionMessage/JobTree 入口

**Files:**
- Modify: `src/components/chat/view/subcomponents/MessageComponent.tsx`
- Modify: `src/components/chat/hooks/useChatMessages.ts`
- Modify: `src/components/chat/execution-message/components/ExecutionMessageContainer.tsx`
- Test: `src/components/chat/hooks/useChatMessages.test.mjs`

- [ ] **Step 1: 写失败测试，验证 assistant 优先走 run 容器而不是旧 execution tree**

```js
test('normalizedToChatMessages no longer emits execution-message-first semantics for assistant runs', () => {
  const messages = normalizedToChatMessages([
    { id: 'u1', sessionId: 's1', provider: 'claude', kind: 'text', role: 'user', content: '分析当前项目', timestamp: '2026-04-19T12:30:00.000Z' },
    { id: 'a1', sessionId: 's1', provider: 'claude', kind: 'thinking', content: '先看一下', timestamp: '2026-04-19T12:30:01.000Z' },
  ]);

  assert.equal(messages[1].isRunMessage, true);
  assert.equal(Boolean(messages[1].executionState), false);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/hooks/useChatMessages.test.mjs`

Expected: FAIL

- [ ] **Step 3: 删掉主路径上的旧入口**

```ts
// MessageComponent only keeps legacy branches as fallback, never as primary assistant path.
if (message.isRunMessage && message.assistantRun) {
  return <RunContainer run={message.assistantRun} />;
}
```

- [ ] **Step 4: 跑聊天相关测试**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/run-state/buildAssistantRuns.test.mjs src/components/chat/run-view/components/RunContainer.test.mjs src/components/chat/hooks/useChatMessages.test.mjs src/components/chat/view/subcomponents/MessageComponent.jobTree.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/chat/view/subcomponents/MessageComponent.tsx src/components/chat/hooks/useChatMessages.ts src/components/chat/hooks/useChatMessages.test.mjs src/components/chat/execution-message/components/ExecutionMessageContainer.tsx
git commit -m "refactor: make run timeline the primary assistant rendering path"
```

---

## 自检

- Spec coverage:
  - run 生命周期：Task 1/3/4/8
  - timeline 优先：Task 2/6/7/9
  - 完成后才显示结果：Task 4/6
  - 去掉独立 Processing：Task 7
  - 稳定排序和重连/补发韧性：Task 8
- Placeholder scan:
  - 无 `TODO/TBD`
  - 每个任务都给了具体文件、测试、命令、提交点
- Type consistency:
  - 统一使用 `AssistantRun` / `RunEvent` / `RunCommittedAnswer`
  - 主路径字段为 `isRunMessage` / `assistantRun`

---

Plan complete and saved to `docs/superpowers/plans/2026-04-19-chat-run-centric-execution-implementation-plan.md`.

Two execution options:

1. Subagent-Driven（推荐） - 我按任务逐个派新子代理实现，中间 review，风险最低
2. Inline Execution - 我在当前会话里按计划直接连续实现
