# Chat Execution Message Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把所有 assistant 过程态与结果态统一收敛到一个 `Execution Message` 左侧容器中，消除同一会话内和同一项目内的多套 assistant 样式。

**Architecture:** 先在消息归一化层把分散的 `thinking / tool_use / Task / result / permission` 事件统一归并成 `Execution Message` 视图模型，再由单一渲染入口替换 `MessageComponent` 中现有的多分支渲染。保留现有 `JobTree` 作为子集能力，但把它收编到更通用的 `Execution Message` 模型和组件之下。

**Tech Stack:** React, TypeScript, node:test, Vite, 现有聊天消息归一化与渲染管线

---

## 文件结构

### 现有文件职责

- `src/components/chat/hooks/useChatMessages.ts`
  负责把 `NormalizedMessage[]` 转成 UI 使用的 `ChatMessage[]`，当前包含 `thinking / tool / orchestration / jobTree` 多种分支与折叠逻辑。
- `src/components/chat/types/types.ts`
  定义 `ChatMessage`、`OrchestrationState`、`jobTreeState` 等前端聊天视图模型。
- `src/components/chat/view/subcomponents/MessageComponent.tsx`
  当前 assistant 侧渲染的主分叉点，包含 `isTaskNotification`、`isJobTree`、`isOrchestrationCard`、普通 assistant、tool renderer 等多套 UI。
- `src/components/chat/job-tree/buildJobTreeFromMessages.ts`
  现有树构建器，已能处理一部分 `Task`/编排类消息。
- `src/components/chat/job-tree/components/JobTreeContainer.tsx`
  现有树状执行块渲染组件。

### 新增/调整边界

- 新建：`src/components/chat/execution-message/buildExecutionMessageState.ts`
  从 `ChatMessage[]` 构建通用 `Execution Message` 视图模型，吸收原有 `JobTree` 场景，同时覆盖普通直答与单/多工具场景。
- 新建：`src/components/chat/execution-message/executionMessageTypes.ts`
  定义 `ExecutionMessageState`、`ExecutionNode`、`ExecutionMode`。
- 新建：`src/components/chat/execution-message/components/ExecutionMessageContainer.tsx`
  assistant 统一左侧容器组件。
- 修改：`src/components/chat/hooks/useChatMessages.ts`
  由“补更多 `JobTree` 入口”改成“统一生成 `Execution Message` 消息”。
- 修改：`src/components/chat/types/types.ts`
  用 `isExecutionMessage` / `executionState` / `executionMode` 替代散乱的高层渲染入口。
- 修改：`src/components/chat/view/subcomponents/MessageComponent.tsx`
  assistant 渲染优先走 `ExecutionMessageContainer`，大幅减少多分支分流。
- 测试：
  - `src/components/chat/hooks/useChatMessages.test.mjs`
  - `src/components/chat/execution-message/buildExecutionMessageState.test.mjs`
  - `src/components/chat/execution-message/components/ExecutionMessageContainer.test.mjs`
  - `src/components/chat/view/subcomponents/MessageComponent.executionMessage.test.mjs`

---

### Task 1: 定义通用 Execution Message 视图模型

**Files:**
- Create: `src/components/chat/execution-message/executionMessageTypes.ts`
- Modify: `src/components/chat/types/types.ts`
- Test: `src/components/chat/execution-message/buildExecutionMessageState.test.mjs`

- [ ] **Step 1: 写失败测试，锁定统一容器需要的基础结构**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildExecutionMessageState } from './buildExecutionMessageState.ts';

test('buildExecutionMessageState creates one root container with header, tree nodes, and final answer slots', () => {
  const state = buildExecutionMessageState([
    {
      type: 'assistant',
      normalizedKind: 'thinking',
      isThinking: true,
      timestamp: '2026-04-19T10:00:00.000Z',
      content: '先理解用户问题。',
    },
    {
      type: 'assistant',
      normalizedKind: 'text',
      timestamp: '2026-04-19T10:00:01.000Z',
      content: '最终答案',
    },
  ]);

  assert.equal(state.mode, 'direct');
  assert.equal(state.root.kind, 'main_agent');
  assert.equal(state.root.children[0].kind, 'thinking');
  assert.equal(state.finalAnswer?.content, '最终答案');
});
```

- [ ] **Step 2: 运行测试，确认当前不存在该模型**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/execution-message/buildExecutionMessageState.test.mjs`

Expected: FAIL with module-not-found or missing export for `buildExecutionMessageState`

- [ ] **Step 3: 定义最小类型与占位构建器**

```ts
export type ExecutionMode = 'direct' | 'tool' | 'orchestration' | 'mixed';

export type ExecutionNodeKind =
  | 'main_agent'
  | 'thinking'
  | 'tool'
  | 'subagent_dispatch'
  | 'subagent'
  | 'warning'
  | 'waiting'
  | 'synthesis'
  | 'final_answer';

export interface ExecutionNode {
  id: string;
  kind: ExecutionNodeKind;
  title: string;
  status: 'queued' | 'running' | 'waiting' | 'completed' | 'failed';
  timestamp?: string | number | Date;
  children: ExecutionNode[];
  meta?: Record<string, unknown>;
}

export interface ExecutionMessageState {
  mode: ExecutionMode;
  title: string;
  status: 'queued' | 'running' | 'waiting' | 'completed' | 'failed';
  root: ExecutionNode;
  finalAnswer: { content: string; timestamp?: string | number | Date } | null;
}
```

- [ ] **Step 4: 在 `ChatMessage` 中增加统一入口字段**

```ts
export interface ChatMessage {
  type: string;
  content?: string;
  timestamp: string | number | Date;
  isExecutionMessage?: boolean;
  executionState?: ExecutionMessageState | null;
  executionMode?: ExecutionMode;
  // 其余旧字段暂时保留，供迁移期兼容
}
```

- [ ] **Step 5: 运行测试确认类型与构建器基础通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/execution-message/buildExecutionMessageState.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/execution-message/executionMessageTypes.ts \
  src/components/chat/execution-message/buildExecutionMessageState.ts \
  src/components/chat/execution-message/buildExecutionMessageState.test.mjs \
  src/components/chat/types/types.ts
git commit -m "feat: add execution message view model"
```

---

### Task 2: 把现有 JobTree 能力收编进 Execution Message 构建器

**Files:**
- Create: `src/components/chat/execution-message/buildExecutionMessageState.ts`
- Modify: `src/components/chat/job-tree/buildJobTreeFromMessages.ts`
- Test: `src/components/chat/execution-message/buildExecutionMessageState.test.mjs`

- [ ] **Step 1: 写失败测试，覆盖子代理与 Task 编排场景**

```js
test('buildExecutionMessageState maps orchestration and Task messages into one orchestration execution tree', () => {
  const state = buildExecutionMessageState([
    {
      type: 'assistant',
      normalizedKind: 'text',
      isOrchestrationCard: true,
      orchestrationState: {
        summary: '我来派一个子代理去思考人生。',
        taskTitles: ['思考人生'],
      },
      timestamp: '2026-04-19T10:10:00.000Z',
      content: '我来派一个子代理去思考人生。',
    },
    {
      type: 'assistant',
      normalizedKind: 'tool_use',
      isToolUse: true,
      toolName: 'Task',
      toolId: 'task-1',
      toolInput: { description: '思考人生' },
      timestamp: '2026-04-19T10:10:01.000Z',
    },
  ]);

  assert.equal(state.mode, 'orchestration');
  assert.equal(state.root.children[0].kind, 'thinking');
  assert.equal(state.root.children[1].kind, 'subagent_dispatch');
  assert.equal(state.root.children[1].children[0].title, '思考人生');
});
```

- [ ] **Step 2: 运行测试，确认当前还没有把 `JobTree` 数据迁移到通用模型**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/execution-message/buildExecutionMessageState.test.mjs`

Expected: FAIL with wrong `mode` or missing `subagent_dispatch` node

- [ ] **Step 3: 复用现有 `buildJobTreeFromMessages()` 作为编排子集能力**

```ts
import { buildJobTreeFromMessages } from '../job-tree/buildJobTreeFromMessages.ts';

function buildOrchestrationExecutionState(messages: ChatMessage[]): ExecutionMessageState {
  const jobTree = buildJobTreeFromMessages(messages);
  return {
    mode: 'orchestration',
    title: '执行过程',
    status: jobTree.root.status,
    root: mapJobTreeRootToExecutionNode(jobTree.root),
    finalAnswer: extractFinalAnswerFromMessages(messages),
  };
}
```

- [ ] **Step 4: 添加 `JobTree -> ExecutionNode` 映射**

```ts
function mapJobTreeRootToExecutionNode(root: JobTreeNode): ExecutionNode {
  return {
    id: root.id,
    kind: root.kind === 'main_agent' ? 'main_agent' : 'subagent_dispatch',
    title: root.title,
    status: root.status,
    timestamp: root.timestamp,
    children: (root.children || []).map(mapJobTreeChild),
  };
}
```

- [ ] **Step 5: 运行测试，确认编排能力能进入统一模型**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/execution-message/buildExecutionMessageState.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/execution-message/buildExecutionMessageState.ts \
  src/components/chat/execution-message/buildExecutionMessageState.test.mjs \
  src/components/chat/job-tree/buildJobTreeFromMessages.ts
git commit -m "feat: adapt job trees into execution message state"
```

---

### Task 3: 让普通直答和单/多工具链路也进入统一容器

**Files:**
- Modify: `src/components/chat/execution-message/buildExecutionMessageState.ts`
- Modify: `src/components/chat/hooks/useChatMessages.ts`
- Test: `src/components/chat/execution-message/buildExecutionMessageState.test.mjs`
- Test: `src/components/chat/hooks/useChatMessages.test.mjs`

- [ ] **Step 1: 写失败测试，覆盖普通直答**

```js
test('buildExecutionMessageState maps thinking and final text into one direct execution container', () => {
  const state = buildExecutionMessageState([
    {
      type: 'assistant',
      normalizedKind: 'thinking',
      isThinking: true,
      timestamp: '2026-04-19T10:20:00.000Z',
      content: '先想一想。',
    },
    {
      type: 'assistant',
      normalizedKind: 'text',
      timestamp: '2026-04-19T10:20:01.000Z',
      content: '最终答案',
    },
  ]);

  assert.equal(state.mode, 'direct');
  assert.equal(state.root.children[0].kind, 'thinking');
  assert.equal(state.root.children[1].kind, 'final_answer');
});
```

- [ ] **Step 2: 写失败测试，覆盖单工具场景**

```js
test('buildExecutionMessageState maps thinking, tool_use, and final text into one tool execution container', () => {
  const state = buildExecutionMessageState([
    {
      type: 'assistant',
      normalizedKind: 'thinking',
      isThinking: true,
      timestamp: '2026-04-19T10:21:00.000Z',
      content: '先查看目录。',
    },
    {
      type: 'assistant',
      normalizedKind: 'tool_use',
      isToolUse: true,
      toolName: 'Bash',
      toolInput: 'ls /Users/example/project',
      timestamp: '2026-04-19T10:21:01.000Z',
      content: '',
    },
    {
      type: 'assistant',
      normalizedKind: 'text',
      timestamp: '2026-04-19T10:21:02.000Z',
      content: '这是一个前端项目。',
    },
  ]);

  assert.equal(state.mode, 'tool');
  assert.equal(state.root.children[1].kind, 'tool');
  assert.equal(state.finalAnswer?.content, '这是一个前端项目。');
});
```

- [ ] **Step 3: 在构建器中加入非编排场景推断**

```ts
function detectExecutionMode(messages: ChatMessage[]): ExecutionMode {
  const hasTask = messages.some((message) => message.toolName === 'Task');
  const hasTool = messages.some((message) => message.isToolUse);
  if (hasTask) return 'orchestration';
  if (hasTool) return 'tool';
  return 'direct';
}
```

- [ ] **Step 4: 在 `useChatMessages()` 中把 assistant turn 收敛为 `Execution Message`**

```ts
const executionState = buildExecutionMessageState(segment);
collapsed.push({
  ...anchorMessage,
  type: 'assistant',
  content: executionState.finalAnswer?.content || '',
  isExecutionMessage: true,
  executionState,
  executionMode: executionState.mode,
  isJobTree: false,
  isOrchestrationCard: false,
  isThinking: false,
  isToolUse: false,
});
```

- [ ] **Step 5: 更新 `useChatMessages` 测试，确保普通直答和单工具不再散成多块**

```js
test('normalizedToChatMessages collapses thinking and final assistant text into one execution message', () => {
  const chatMessages = normalizedToChatMessages([
    { id: 'thinking-1', kind: 'thinking', provider: 'claude', sessionId: 's1', timestamp: '2026-04-19T10:30:00.000Z', content: '先想一想。' },
    { id: 'answer-1', kind: 'text', role: 'assistant', provider: 'claude', sessionId: 's1', timestamp: '2026-04-19T10:30:01.000Z', content: '最终答案' },
  ]);

  assert.equal(chatMessages.length, 1);
  assert.equal(chatMessages[0].isExecutionMessage, true);
  assert.equal(chatMessages[0].executionMode, 'direct');
});
```

- [ ] **Step 6: 运行测试，确认三类主场景统一收口**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/execution-message/buildExecutionMessageState.test.mjs src/components/chat/hooks/useChatMessages.test.mjs`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/chat/execution-message/buildExecutionMessageState.ts \
  src/components/chat/execution-message/buildExecutionMessageState.test.mjs \
  src/components/chat/hooks/useChatMessages.ts \
  src/components/chat/hooks/useChatMessages.test.mjs
git commit -m "feat: unify direct and tool flows into execution messages"
```

---

### Task 4: 实现统一 Execution Message 容器组件

**Files:**
- Create: `src/components/chat/execution-message/components/ExecutionMessageContainer.tsx`
- Create: `src/components/chat/execution-message/components/ExecutionMessageContainer.test.mjs`
- Modify: `src/components/chat/job-tree/components/JobTreeContainer.tsx`

- [ ] **Step 1: 写失败测试，锁定统一外层容器**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import ExecutionMessageContainer from './ExecutionMessageContainer.tsx';

test('ExecutionMessageContainer renders one shared assistant shell for header, tree, and final answer', () => {
  const html = renderToStaticMarkup(
    React.createElement(ExecutionMessageContainer, {
      message: {
        type: 'assistant',
        content: '最终答案',
        timestamp: '2026-04-19T11:00:00.000Z',
      },
      state: {
        mode: 'direct',
        title: '执行过程',
        status: 'completed',
        root: {
          id: 'main-agent',
          kind: 'main_agent',
          title: '主代理',
          status: 'completed',
          children: [],
        },
        finalAnswer: { content: '最终答案' },
      },
    }),
  );

  assert.match(html, /执行过程/);
  assert.match(html, /主代理/);
  assert.match(html, /最终答案/);
});
```

- [ ] **Step 2: 运行测试，确认容器组件不存在**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/execution-message/components/ExecutionMessageContainer.test.mjs`

Expected: FAIL with module-not-found

- [ ] **Step 3: 实现统一容器，先复用现有树渲染**

```tsx
export default function ExecutionMessageContainer({ message, state }: ExecutionMessageContainerProps) {
  return (
    <section className="rounded-2xl border border-blue-200/70 bg-blue-50/50 p-4">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-blue-700">{state.title}</div>
          <div className="text-xs text-slate-500">{state.status}</div>
        </div>
      </header>

      <div className="space-y-3">
        <ExecutionTree state={state} />
        {state.finalAnswer?.content ? (
          <div className="rounded-xl bg-white/80 p-3 text-sm text-slate-800">
            {state.finalAnswer.content}
          </div>
        ) : null}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: 让原有 `JobTreeContainer` 降级为内部子树组件，而不是外层块**

```tsx
// JobTreeContainer 只负责节点树，不再负责 assistant 外层消息壳子。
export default function JobTreeContainer({ state }: JobTreeContainerProps) {
  return <ExecutionTreeNodes root={state.root} />;
}
```

- [ ] **Step 5: 运行测试，确认统一容器存在且可渲染**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/execution-message/components/ExecutionMessageContainer.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/execution-message/components/ExecutionMessageContainer.tsx \
  src/components/chat/execution-message/components/ExecutionMessageContainer.test.mjs \
  src/components/chat/job-tree/components/JobTreeContainer.tsx
git commit -m "feat: add unified execution message container"
```

---

### Task 5: 用 Execution Message 替换 MessageComponent 中的多分支渲染

**Files:**
- Modify: `src/components/chat/view/subcomponents/MessageComponent.tsx`
- Create: `src/components/chat/view/subcomponents/MessageComponent.executionMessage.test.mjs`
- Test: `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`

- [ ] **Step 1: 写失败测试，要求 assistant 统一优先走 Execution Message**

```js
test('MessageComponent renders assistant execution messages through one unified container', async () => {
  const markup = renderToStaticMarkup(
    React.createElement(MessageComponent, {
      messageKey: 'msg-1',
      message: {
        type: 'assistant',
        content: '最终答案',
        timestamp: '2026-04-19T11:10:00.000Z',
        isExecutionMessage: true,
        executionMode: 'tool',
        executionState: {
          mode: 'tool',
          title: '执行过程',
          status: 'completed',
          root: { id: 'main-agent', kind: 'main_agent', title: '主代理', status: 'completed', children: [] },
          finalAnswer: { content: '最终答案' },
        },
      },
      prevMessage: null,
      createDiff: () => [],
    }),
  );

  assert.match(markup, /执行过程/);
  assert.doesNotMatch(markup, /Claude 编排/);
});
```

- [ ] **Step 2: 运行测试，确认旧分支仍在主导渲染**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/subcomponents/MessageComponent.executionMessage.test.mjs`

Expected: FAIL with missing execution render path

- [ ] **Step 3: 在 `MessageComponent` 中把 assistant 渲染优先级收敛成统一入口**

```tsx
{message.type === 'user' ? (
  <UserBubble ... />
) : message.isExecutionMessage && message.executionState ? (
  <ExecutionMessageContainer
    message={message}
    state={message.executionState}
    onOpenUrl={onOpenUrl}
  />
) : (
  <AssistantFallbackMessage ... />
)}
```

- [ ] **Step 4: 删除 assistant 高层分叉对外层样式的主导权**

```tsx
// 删除或弱化这些高层分支：message.isTaskNotification / message.isJobTree / message.isOrchestrationCard
// 它们只作为 ExecutionMessage 内部节点数据，不再决定左侧外层容器。
```

- [ ] **Step 5: 运行渲染测试，确认 assistant 侧只剩统一入口**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/subcomponents/MessageComponent.executionMessage.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/view/subcomponents/MessageComponent.tsx \
  src/components/chat/view/subcomponents/MessageComponent.executionMessage.test.mjs \
  src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs
git commit -m "refactor: route assistant rendering through execution messages"
```

---

### Task 6: 增加 fallback 容器，禁止退回多套旧样式

**Files:**
- Modify: `src/components/chat/execution-message/buildExecutionMessageState.ts`
- Modify: `src/components/chat/hooks/useChatMessages.ts`
- Test: `src/components/chat/execution-message/buildExecutionMessageState.test.mjs`

- [ ] **Step 1: 写失败测试，覆盖无法可靠分类的 assistant 历史消息**

```js
test('buildExecutionMessageState still returns one fallback execution container for ambiguous assistant flows', () => {
  const state = buildExecutionMessageState([
    {
      type: 'assistant',
      normalizedKind: 'hook_response',
      timestamp: '2026-04-19T11:20:00.000Z',
      content: 'Hook: 已同步状态。',
    },
  ]);

  assert.equal(state.mode, 'mixed');
  assert.equal(state.root.kind, 'main_agent');
  assert.equal(state.root.children.length >= 1, true);
});
```

- [ ] **Step 2: 运行测试，确认目前 ambiguous 流仍可能退回旧样式**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/execution-message/buildExecutionMessageState.test.mjs`

Expected: FAIL with null state or missing fallback node

- [ ] **Step 3: 添加 fallback 逻辑**

```ts
function buildFallbackExecutionState(messages: ChatMessage[]): ExecutionMessageState {
  return {
    mode: 'mixed',
    title: '执行过程',
    status: 'running',
    root: {
      id: 'main-agent',
      kind: 'main_agent',
      title: '主代理',
      status: 'running',
      children: messages.map((message, index) => ({
        id: `fallback-${index + 1}`,
        kind: message.isThinking ? 'thinking' : 'tool',
        title: String(message.content || message.toolName || '执行步骤'),
        status: 'completed',
        timestamp: message.timestamp,
        children: [],
      })),
    },
    finalAnswer: extractFinalAnswerFromMessages(messages),
  };
}
```

- [ ] **Step 4: 运行测试，确认 fallback 也进入统一容器**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/execution-message/buildExecutionMessageState.test.mjs`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/execution-message/buildExecutionMessageState.ts \
  src/components/chat/execution-message/buildExecutionMessageState.test.mjs \
  src/components/chat/hooks/useChatMessages.ts
git commit -m "feat: add execution message fallback container"
```

---

### Task 7: 全量验证与迁移收尾

**Files:**
- Modify: `src/components/chat/hooks/useChatMessages.test.mjs`
- Modify: `src/components/chat/job-tree/components/JobTreeContainer.test.mjs`
- Modify: `src/components/chat/view/subcomponents/MessageComponent.jobTree.test.mjs`
- Test: `src/components/chat/view/subcomponents/MessageComponent.executionMessage.test.mjs`

- [ ] **Step 1: 更新旧测试，避免继续把旧样式当作正确行为**

```js
assert.equal(chatMessages[0].isExecutionMessage, true);
assert.equal(chatMessages[0].isJobTree, undefined);
assert.equal(chatMessages[0].isOrchestrationCard, undefined);
```

- [ ] **Step 2: 跑聊天相关全量测试**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/hooks/useChatMessages.test.mjs src/components/chat/execution-message/buildExecutionMessageState.test.mjs src/components/chat/execution-message/components/ExecutionMessageContainer.test.mjs src/components/chat/job-tree/components/JobTreeContainer.test.mjs src/components/chat/view/subcomponents/MessageComponent.executionMessage.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`

Expected: PASS with all chat execution tests green

- [ ] **Step 3: 跑类型检查**

Run: `npx tsc --noEmit -p tsconfig.json`

Expected: no new TypeScript errors; only pre-existing repo errors are acceptable if already documented

- [ ] **Step 4: 手动验证三类真实会话**

Run:

```bash
open 'http://localhost:5173/session/d62cdb1d-1a93-45b6-85d1-50a156855fe6'
open 'http://localhost:5173/session/9cb8ecbb-087f-40bf-9800-3b7f9da76c54'
open 'http://localhost:5173/session/ff634e88-6cc8-4e94-9246-9e3c8a5d5f97'
```

Expected:

- 普通直答：单一 assistant 执行容器
- 单工具分析：单一 assistant 执行容器
- 单子代理：单一 assistant 执行容器

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/hooks/useChatMessages.test.mjs \
  src/components/chat/execution-message/buildExecutionMessageState.test.mjs \
  src/components/chat/execution-message/components/ExecutionMessageContainer.test.mjs \
  src/components/chat/job-tree/components/JobTreeContainer.test.mjs \
  src/components/chat/view/subcomponents/MessageComponent.executionMessage.test.mjs \
  src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs
git commit -m "test: finalize execution message unification coverage"
```

---

## 自检

### Spec coverage

- 统一外层容器：Task 1、Task 4、Task 5
- 普通直答适配：Task 3
- 单工具/多工具适配：Task 3
- 子代理/Task 适配：Task 2
- fallback 不能回旧样式：Task 6
- 运行中与完成后同一容器：Task 3、Task 5、Task 7

没有发现缺失 spec 要求的任务。

### Placeholder scan

- 无 `TBD` / `TODO`
- 每个任务都给出了文件、命令、测试或代码片段
- 没有“写测试”但不提供测试内容的空步骤

### Type consistency

- 统一使用 `isExecutionMessage`
- 统一使用 `executionState`
- 统一使用 `executionMode`
- 状态枚举统一为 `queued | running | waiting | completed | failed`

---

Plan complete and saved to `docs/superpowers/plans/2026-04-19-chat-execution-message-unification-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
