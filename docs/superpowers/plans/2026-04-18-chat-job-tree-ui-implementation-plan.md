# Chat Job Tree UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把聊天区从“消息流 + Thinking/处理中补丁”升级为“以主代理为根节点的 Job Tree”，统一展示主代理阶段、子代理执行、权限等待、告警回退与最终答案。

**Architecture:** 保留现有 `NormalizedMessage[] -> ChatMessage[]` 的基础链路，但在 chat 层新增一套专用的 Job Tree 视图模型，把主代理阶段、子代理、工具历史和最终答案映射到同一个树状容器中。`useChatMessages.ts` 负责把一段 Claude 执行链路收敛成一个合成的 `JobTree` 消息，`MessageComponent` 只负责渲染这个稳定消息类型；输入区和底部浮层中的“处理中 / Thinking / 等待权限”状态被回收到树节点内显示。

**Tech Stack:** React、TypeScript、现有 chat hooks/store、Node test runner、Tailwind CSS

---

## File Structure

本次改造按“视图模型 / 树组件 / 页面入口 / 测试”四层拆分，优先复用现有消息归并逻辑，不改后端协议。

- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/types/types.ts`
  - 职责：补充 Job Tree 所需的节点类型、阶段状态、权限等待与完整日志入口类型。
- Create: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/job-tree/jobTreeTypes.ts`
  - 职责：定义 Job Tree 专用节点结构，避免继续把树模型塞进松散的 `ChatMessage` 扩展字段。
- Create: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/job-tree/buildJobTreeFromMessages.ts`
  - 职责：把一段 Claude 执行相关 `ChatMessage[]` 映射为一个 `JobTreeViewModel`，聚合主代理阶段、子代理、权限等待、最终答案与完整日志。
- Create: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/job-tree/buildJobTreeFromMessages.test.mjs`
  - 职责：覆盖“主代理包含子代理”“完成后保留过程”“等待权限进入树内”“最终答案成为最后节点”等核心规则。
- Create: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/job-tree/components/JobTreeContainer.tsx`
  - 职责：根容器，渲染主代理头部、树状缩进、总状态、完成度和最终答案区域。
- Create: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/job-tree/components/JobTreeNode.tsx`
  - 职责：统一渲染主代理阶段节点、子代理节点、告警节点、权限等待节点与最终答案节点。
- Create: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/job-tree/components/JobTreeToolHistory.tsx`
  - 职责：提供子代理内工具历史和整棵树底部完整执行日志入口。
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/hooks/useChatMessages.ts`
  - 职责：继续负责 NormalizedMessage 归并，并把一组编排卡/子代理卡/最终答案收敛成一个合成 `JobTree` 消息，减少页面层拼装。
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/view/subcomponents/MessageComponent.tsx`
  - 职责：在 Claude 执行链路命中 Job Tree 时切换到 `JobTreeContainer`，普通消息仍走原分支。
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
  - 职责：移除底部独立 `AssistantThinkingIndicator`，避免树外再出现第二套运行态 UI。
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/view/subcomponents/ChatComposer.tsx`
  - 职责：移除或降级 `ClaudeStatus` 的主状态职责，只保留发送/中止控制，不再承担主进度展示。
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/hooks/useChatRealtimeHandlers.ts`
  - 职责：把等待权限、处理中、完成等实时状态同步成树可消费的消息或会话态，而不是只写到输入区状态。
- Test: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/view/subcomponents/MessageComponent.test.mjs`
  - 职责：覆盖 Job Tree 渲染入口切换。
- Test: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/view/subcomponents/claudeStatusText.test.mjs`
  - 职责：若 `ClaudeStatus` 被降级/删除，需要同步清理或调整测试边界。

---

### Task 1: 定义 Job Tree 领域模型，建立“主代理包含子代理”的单根树结构

**Files:**
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/types/types.ts`
- Create: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/job-tree/jobTreeTypes.ts`
- Test: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/job-tree/buildJobTreeFromMessages.test.mjs`

- [ ] **Step 1: 写失败测试，锁定根节点只有一个主代理，子代理挂在“派发任务”下**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJobTreeFromMessages } from './buildJobTreeFromMessages.ts';

test('buildJobTreeFromMessages nests subagents under the main-agent dispatch node', () => {
  const tree = buildJobTreeFromMessages([
    {
      type: 'assistant',
      content: '我来同时派发两个子代理去调研佛山的经济和天气。',
      timestamp: '2026-04-18T10:00:00.000Z',
      isOrchestrationCard: true,
      orchestrationState: {
        summary: '已派发 2 个子代理',
        taskTitles: ['调研佛山经济情况', '调研佛山天气情况'],
      },
    },
    {
      type: 'assistant',
      timestamp: '2026-04-18T10:00:02.000Z',
      isToolUse: true,
      toolName: 'Task',
      toolInput: { description: '调研佛山经济情况' },
      isSubagentContainer: true,
      subagentState: {
        childTools: [],
        currentToolIndex: -1,
        isComplete: false,
        progress: { status: 'running' },
      },
    },
    {
      type: 'assistant',
      timestamp: '2026-04-18T10:00:03.000Z',
      isToolUse: true,
      toolName: 'Task',
      toolInput: { description: '调研佛山天气情况' },
      isSubagentContainer: true,
      subagentState: {
        childTools: [],
        currentToolIndex: -1,
        isComplete: false,
        progress: { status: 'running' },
      },
    },
  ]);

  assert.equal(tree.root.kind, 'main_agent');
  assert.equal(tree.root.children[1].kind, 'dispatch');
  assert.deepEqual(
    tree.root.children[1].children.map(node => node.title),
    ['调研佛山经济情况', '调研佛山天气情况'],
  );
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/job-tree/buildJobTreeFromMessages.test.mjs
```

Expected:

- FAIL，提示 `buildJobTreeFromMessages` 文件或导出不存在。

- [ ] **Step 3: 在 `jobTreeTypes.ts` 和 `types.ts` 中定义树节点与阶段枚举**

```ts
export type JobTreeStatus = 'queued' | 'running' | 'waiting' | 'synthesizing' | 'completed' | 'failed';

export type JobTreeNodeKind =
  | 'main_agent'
  | 'planning'
  | 'dispatch'
  | 'subagent'
  | 'subagent_step'
  | 'warning'
  | 'permission_wait'
  | 'synthesis'
  | 'final_answer'
  | 'full_log';

export interface JobTreeNode {
  id: string;
  kind: JobTreeNodeKind;
  title: string;
  status: JobTreeStatus;
  timestamp?: string | number | Date;
  children: JobTreeNode[];
  meta?: Record<string, unknown>;
}

export interface JobTreeViewModel {
  root: JobTreeNode;
  fullLogEntries: ChatMessage[];
}
```

- [ ] **Step 4: 创建最小 `buildJobTreeFromMessages.ts` 骨架，让测试从“缺文件”推进到“断言失败”**

```ts
import type { ChatMessage } from '../types/types';
import type { JobTreeViewModel } from './jobTreeTypes';

export function buildJobTreeFromMessages(messages: ChatMessage[]): JobTreeViewModel {
  return {
    root: {
      id: 'main-agent',
      kind: 'main_agent',
      title: '主代理',
      status: 'queued',
      children: [],
    },
    fullLogEntries: messages,
  };
}
```

- [ ] **Step 5: 跑测试确认进入真实断言失败**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/job-tree/buildJobTreeFromMessages.test.mjs
```

Expected:

- FAIL，断言显示 `dispatch` 或子代理节点尚未正确生成。

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/types/types.ts src/components/chat/job-tree/jobTreeTypes.ts src/components/chat/job-tree/buildJobTreeFromMessages.ts src/components/chat/job-tree/buildJobTreeFromMessages.test.mjs
git commit -m "refactor: add chat job tree domain model"
```

---

### Task 2: 在 `useChatMessages` 中合成单条 JobTree 消息，统一“规划 / 派发 / 汇总 / 最终答案”

**Files:**
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/hooks/useChatMessages.ts`
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/job-tree/buildJobTreeFromMessages.ts`
- Test: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/hooks/useChatMessages.test.mjs`
- Test: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/job-tree/buildJobTreeFromMessages.test.mjs`

- [ ] **Step 1: 写失败测试，要求 `useChatMessages` 把编排链路折叠成一条 `JobTree` 消息**

```js
test('normalizedToChatMessages collapses orchestration subagents and final answer into one job tree message', () => {
  const chatMessages = normalizedToChatMessages([
    {
      type: 'assistant',
      content: '已派发 2 个子代理',
      timestamp: '2026-04-18T10:00:00.000Z',
      isOrchestrationCard: true,
      orchestrationState: { summary: '已派发 2 个子代理', taskTitles: ['经济', '天气'] },
    },
    {
      type: 'assistant',
      content: '两个子代理已完成调研，以下是结果汇总。',
      timestamp: '2026-04-18T10:02:00.000Z',
    },
  ]);

  assert.equal(chatMessages.length, 1);
  assert.equal(chatMessages[0].isJobTree, true);
  assert.equal(chatMessages[0].jobTreeState?.root.kind, 'main_agent');
  assert.equal(chatMessages[0].jobTreeState?.root.children.at(-1)?.kind, 'synthesis');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/job-tree/buildJobTreeFromMessages.test.mjs
```

Expected:

- FAIL，`isJobTree` / `jobTreeState` 不存在，或链路仍然被拆成多条普通消息。

- [ ] **Step 3: 在 `types.ts` 中为合成消息补充 JobTree 字段**

```ts
export interface ChatMessage {
  // 现有字段...
  isJobTree?: boolean;
  jobTreeState?: JobTreeViewModel | null;
  rolePhase?: 'planning' | 'dispatch' | 'synthesis' | 'final_answer';
  runtimeState?: 'running' | 'waiting_permission' | 'completed' | 'failed';
}
```

- [ ] **Step 4: 在 `useChatMessages.ts` 中稳定产出主代理阶段信号，避免页面层二次猜测**

```ts
const chatMessage: ChatMessage = {
  type: msg.role === 'user' ? 'user' : 'assistant',
  content,
  timestamp: msg.timestamp,
  isThinking: msg.kind === 'thinking',
  isToolUse: msg.kind === 'tool_use',
  toolName: msg.toolName,
  toolInput: msg.toolInput,
  toolResult,
  toolId: msg.toolId,
  rolePhase: msg.kind === 'thinking'
    ? 'planning'
    : msg.kind === 'tool_use' && msg.toolName === 'Task'
      ? 'dispatch'
      : 'final_answer',
};
```

- [ ] **Step 5: 在 `buildJobTreeFromMessages.ts` 中生成固定主阶段节点**

```ts
const planningNode: JobTreeNode = {
  id: 'planning',
  kind: 'planning',
  title: '规划任务',
  status: hasStarted ? 'completed' : 'queued',
  children: [],
};

const dispatchNode: JobTreeNode = {
  id: 'dispatch',
  kind: 'dispatch',
  title: '派发任务',
  status: hasSubagents ? (allSubagentsComplete ? 'completed' : 'running') : 'queued',
  children: subagentNodes,
};

const synthesisNode: JobTreeNode = {
  id: 'synthesis',
  kind: 'synthesis',
  title: '汇总子结果',
  status: hasFinalAnswer ? 'completed' : hasSubagents ? 'synthesizing' : 'queued',
  children: hasFinalAnswer ? [finalAnswerNode] : [],
};
```

- [ ] **Step 6: 在 `useChatMessages.ts` 中把整段链路收敛成一条合成消息**

```ts
const jobTreeState = buildJobTreeFromMessages(executionSlice);

converted.push({
  type: 'assistant',
  timestamp: executionSlice[0]?.timestamp || new Date().toISOString(),
  isJobTree: true,
  jobTreeState,
  content: '',
});
```

- [ ] **Step 7: 补一条失败测试，保证完成后过程树仍保留**

```js
test('buildJobTreeFromMessages keeps planning, dispatch, and synthesis nodes after completion', () => {
  const tree = buildJobTreeFromMessages(createCompletedConversationMessages());
  assert.deepEqual(
    tree.root.children.map(node => node.kind),
    ['planning', 'dispatch', 'synthesis'],
  );
  assert.equal(tree.root.status, 'completed');
});
```

- [ ] **Step 8: 跑相关测试确认通过**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/hooks/useChatMessages.test.mjs src/components/chat/job-tree/buildJobTreeFromMessages.test.mjs
```

Expected:

- PASS，主代理阶段节点和最终答案节点都已稳定生成。

- [ ] **Step 9: Commit**

```bash
git add src/components/chat/hooks/useChatMessages.ts src/components/chat/job-tree/buildJobTreeFromMessages.ts src/components/chat/hooks/useChatMessages.test.mjs src/components/chat/job-tree/buildJobTreeFromMessages.test.mjs
git commit -m "feat: build main-agent job tree stages from chat messages"
```

---

### Task 3: 把子代理步骤、告警、回退和工具历史挂进树中，保留透明优先但默认折叠原始日志

**Files:**
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/job-tree/buildJobTreeFromMessages.ts`
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/tools/components/SubagentContainer.tsx`
- Create: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/job-tree/components/JobTreeToolHistory.tsx`
- Test: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/job-tree/buildJobTreeFromMessages.test.mjs`
- Test: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/tools/components/subagentProgressView.test.mjs`

- [ ] **Step 1: 写失败测试，要求子代理默认显示步骤和 warning，但完整日志折叠**

```js
test('buildJobTreeFromMessages exposes subagent steps and warnings while keeping raw tool history separate', () => {
  const tree = buildJobTreeFromMessages(createSubagentWithWarningsMessages());
  const subagent = tree.root.children[1].children[0];

  assert.equal(subagent.kind, 'subagent');
  assert.equal(subagent.children[0].kind, 'subagent_step');
  assert.equal(subagent.children[1].kind, 'warning');
  assert.ok(Array.isArray(tree.fullLogEntries));
  assert.equal(tree.fullLogEntries.length > 0, true);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/job-tree/buildJobTreeFromMessages.test.mjs
```

Expected:

- FAIL，子代理步骤节点或 warning 节点尚未正确生成。

- [ ] **Step 3: 在树构建器中把 `subagentState.progress.timeline` 和 `warnings` 展开为子节点**

```ts
const timelineChildren = (message.subagentState?.progress?.timeline || []).map((event, index) => ({
  id: `${subagentId}-step-${index}`,
  kind: 'subagent_step',
  title: event.label,
  status: event.status === 'completed' ? 'completed' : 'running',
  timestamp: event.timestamp,
  children: [],
}));

const warningChildren = (message.subagentState?.progress?.warnings || []).map((warning, index) => ({
  id: `${subagentId}-warning-${index}`,
  kind: 'warning',
  title: warning.message,
  status: 'running',
  children: [],
  meta: { warningKind: warning.kind, recoverable: true },
}));
```

- [ ] **Step 4: 让 `SubagentContainer.tsx` 退居为树节点内容片段，而不是独立主视觉容器**

```tsx
return (
  <div className="space-y-2 rounded-lg border border-slate-200 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-950/30">
    <div className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
      <span>{description}</span>
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        {progressView.status.label}
      </span>
    </div>
    <div className="space-y-1">
      {progressView.visibleTimeline.map(item => (
        <div key={item.label} className="text-xs text-slate-600 dark:text-slate-300">
          {item.label}
        </div>
      ))}
    </div>
  </div>
);
```

- [ ] **Step 5: 新增 `JobTreeToolHistory.tsx`，提供两个日志入口**

```tsx
export function JobTreeToolHistory({ entries, title }: { entries: ChatMessage[]; title: string }) {
  return (
    <details className="rounded-md border border-slate-200 bg-slate-50/80 p-2 dark:border-slate-800 dark:bg-slate-950/30">
      <summary className="cursor-pointer text-xs font-medium text-slate-600 dark:text-slate-300">
        {title}
      </summary>
      <div className="mt-2 space-y-2 text-xs text-slate-500 dark:text-slate-400">
        {entries.map((entry, index) => (
          <div key={`${entry.timestamp}-${index}`}>{entry.toolName || entry.content}</div>
        ))}
      </div>
    </details>
  );
}
```

- [ ] **Step 6: 跑相关测试确认通过**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/job-tree/buildJobTreeFromMessages.test.mjs src/components/chat/tools/components/subagentProgressView.test.mjs
```

Expected:

- PASS，子代理步骤和 warning 可见，原始工具日志仍折叠在独立入口中。

- [ ] **Step 7: Commit**

```bash
git add src/components/chat/job-tree/buildJobTreeFromMessages.ts src/components/chat/tools/components/SubagentContainer.tsx src/components/chat/job-tree/components/JobTreeToolHistory.tsx src/components/chat/job-tree/buildJobTreeFromMessages.test.mjs src/components/chat/tools/components/subagentProgressView.test.mjs
git commit -m "feat: render subagent steps warnings and tool history in job tree"
```

---

### Task 4: 把等待权限、处理中和完成状态从输入区回收到 Job Tree，消除第二套运行态 UI

**Files:**
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/hooks/useChatRealtimeHandlers.ts`
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/view/subcomponents/ChatComposer.tsx`
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/job-tree/buildJobTreeFromMessages.ts`
- Test: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/job-tree/buildJobTreeFromMessages.test.mjs`
- Test: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/view/subcomponents/claudeStatusText.test.mjs`

- [ ] **Step 1: 写失败测试，要求等待权限出现在树节点里，而不是只能靠 composer status 感知**

```js
test('buildJobTreeFromMessages marks the main-agent tree as waiting when permission approval is pending', () => {
  const tree = buildJobTreeFromMessages(createPermissionWaitingMessages());
  assert.equal(tree.root.status, 'waiting');
  assert.equal(tree.root.children.some(node => node.kind === 'permission_wait'), true);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/job-tree/buildJobTreeFromMessages.test.mjs
```

Expected:

- FAIL，树模型尚未消费等待权限状态。

- [ ] **Step 3: 在 `useChatRealtimeHandlers.ts` 中把等待权限和完成状态同步为树可用信号**

```ts
if (message.type === 'permission_request') {
  appendRealtimeMessage({
    type: 'assistant',
    timestamp: new Date().toISOString(),
    content: '等待你的确认',
    runtimeState: 'waiting_permission',
    permissionRequest: message.request,
  });
}

if (message.type === 'complete') {
  appendRealtimeMessage({
    type: 'assistant',
    timestamp: new Date().toISOString(),
    content: '',
    runtimeState: 'completed',
  });
}
```

- [ ] **Step 4: 在树构建器中把 runtime waiting/completed 状态映射到根节点和权限节点**

```ts
if (message.runtimeState === 'waiting_permission') {
  permissionNode = {
    id: 'permission-wait',
    kind: 'permission_wait',
    title: '等待你的确认',
    status: 'waiting',
    children: [],
    meta: { request: message.permissionRequest },
  };
  root.status = 'waiting';
}
```

- [ ] **Step 5: 移除 `ChatMessagesPane` 底部独立 `AssistantThinkingIndicator`，并把 `ClaudeStatus` 降级为控制栏附属信息**

```tsx
{/* 删除这一段，避免树外再次出现运行态 */}
{isLoading && <AssistantThinkingIndicator selectedProvider="claude" />}
```

```tsx
<ClaudeStatus
  status={claudeStatus}
  compact
  ariaLabel="会话控制状态"
/>
```

- [ ] **Step 6: 跑相关测试与页面测试**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/job-tree/buildJobTreeFromMessages.test.mjs src/components/chat/view/subcomponents/claudeStatusText.test.mjs
```

Expected:

- PASS，等待权限进入树内，底部不再单独出现第二套“处理中 / Thinking”视觉。

- [ ] **Step 7: Commit**

```bash
git add src/components/chat/hooks/useChatRealtimeHandlers.ts src/components/chat/view/subcomponents/ChatMessagesPane.tsx src/components/chat/view/subcomponents/ChatComposer.tsx src/components/chat/job-tree/buildJobTreeFromMessages.ts src/components/chat/job-tree/buildJobTreeFromMessages.test.mjs src/components/chat/view/subcomponents/claudeStatusText.test.mjs
git commit -m "refactor: move runtime processing states into chat job tree"
```

---

### Task 5: 在消息渲染入口接入 Job Tree 组件，统一运行态与完成态的渲染

**Files:**
- Create: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/job-tree/components/JobTreeContainer.tsx`
- Create: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/job-tree/components/JobTreeNode.tsx`
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/view/subcomponents/MessageComponent.tsx`
- Test: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/view/subcomponents/MessageComponent.test.mjs`

- [ ] **Step 1: 写失败测试，要求合成后的 `JobTree` 消息渲染成树，而不是旧的“已派发 N 个子代理”块**

```js
test('MessageComponent renders JobTreeContainer for a synthesized job tree message', async () => {
  const message = createJobTreeChatMessage();
  const screen = renderMessageComponent({ message });
  assert.match(screen.container.textContent || '', /主代理/);
  assert.match(screen.container.textContent || '', /派发任务/);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/subcomponents/MessageComponent.test.mjs
```

Expected:

- FAIL，`MessageComponent` 仍在渲染旧编排卡文案。

- [ ] **Step 3: 创建 `JobTreeNode.tsx`，统一树节点缩进、连接线、状态徽标与展开逻辑**

```tsx
export function JobTreeNode({ node, depth = 0 }: { node: JobTreeNodeModel; depth?: number }) {
  return (
    <div className="relative pl-4" style={{ marginLeft: depth * 16 }}>
      {depth > 0 && <div className="absolute left-1 top-0 h-full w-px bg-slate-200 dark:bg-slate-800" />}
      <div className="flex items-start gap-2">
        <span className="mt-1 h-2 w-2 rounded-full bg-blue-500" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{node.title}</div>
          {node.meta?.summary && (
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{String(node.meta.summary)}</div>
          )}
        </div>
      </div>
      <div className="mt-2 space-y-2">
        {node.children.map(child => <JobTreeNode key={child.id} node={child} depth={depth + 1} />)}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 创建 `JobTreeContainer.tsx`，渲染根节点头部、总状态、完整日志入口和最终答案**

```tsx
export function JobTreeContainer({ tree }: { tree: JobTreeViewModel }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/50">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">{tree.root.title}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{tree.root.meta?.statusText}</div>
        </div>
      </header>
      <JobTreeNode node={tree.root} />
      <JobTreeToolHistory entries={tree.fullLogEntries} title="完整执行日志" />
    </section>
  );
}
```

- [ ] **Step 5: 在 `MessageComponent.tsx` 中切换到 Job Tree 渲染分支**

```tsx
if (message.isJobTree && message.jobTreeState) {
  return <JobTreeContainer tree={message.jobTreeState} />;
}
```

- [ ] **Step 6: 跑消息渲染测试**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/subcomponents/MessageComponent.test.mjs src/components/chat/job-tree/buildJobTreeFromMessages.test.mjs
```

Expected:

- PASS，聊天区的执行链路改为单个树容器，完成态仍保留完整过程。

- [ ] **Step 7: Commit**

```bash
git add src/components/chat/job-tree/components/JobTreeContainer.tsx src/components/chat/job-tree/components/JobTreeNode.tsx src/components/chat/view/subcomponents/MessageComponent.tsx src/components/chat/view/subcomponents/MessageComponent.test.mjs src/components/chat/job-tree/buildJobTreeFromMessages.test.mjs
git commit -m "feat: render chat execution as a unified job tree"
```

---

### Task 6: 端到端回归并清理旧的过程态碎片，确认视觉和行为闭环

**Files:**
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/view/subcomponents/ClaudeStatus.tsx`
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/view/subcomponents/AssistantThinkingIndicator.tsx`
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/view/subcomponents/MessageComponent.tsx`
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/job-tree/components/JobTreeContainer.tsx`
- Test: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/job-tree/buildJobTreeFromMessages.test.mjs`
- Test: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/view/subcomponents/MessageComponent.test.mjs`

- [ ] **Step 1: 写一条最终回归测试，覆盖“运行中 -> 权限等待 -> 完成”全过程只使用一套树状 UI**

```js
test('conversation execution keeps a single job-tree container through running waiting and completed states', () => {
  const trees = [
    buildJobTreeFromMessages(createRunningConversationMessages()),
    buildJobTreeFromMessages(createPermissionWaitingMessages()),
    buildJobTreeFromMessages(createCompletedConversationMessages()),
  ];

  assert.equal(trees.every(tree => tree.root.kind === 'main_agent'), true);
  assert.deepEqual(trees.map(tree => tree.root.status), ['running', 'waiting', 'completed']);
});
```

- [ ] **Step 2: 跑测试确认失败或存在旧碎片依赖**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/job-tree/buildJobTreeFromMessages.test.mjs src/components/chat/view/subcomponents/MessageComponent.test.mjs
```

Expected:

- 若仍失败，通常是旧 `ClaudeStatus` / `AssistantThinkingIndicator` 的渲染或状态依赖没有完全回收。

- [ ] **Step 3: 清理旧 UI 碎片，让残留组件退化为可复用附属件或删除无用分支**

```tsx
// ClaudeStatus.tsx
if (!status || compact) {
  return null;
}
```

```tsx
// AssistantThinkingIndicator.tsx
export default function AssistantThinkingIndicator() {
  return null;
}
```

- [ ] **Step 4: 跑完整验证**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/hooks/useChatMessages.test.mjs src/components/chat/job-tree/buildJobTreeFromMessages.test.mjs src/components/chat/view/subcomponents/MessageComponent.test.mjs src/components/chat/tools/components/subagentProgressView.test.mjs src/components/chat/view/subcomponents/claudeStatusText.test.mjs
npm run typecheck
```

Expected:

- 所有相关测试 PASS。
- `npm run typecheck` 通过，无新增类型错误。

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/view/subcomponents/ClaudeStatus.tsx src/components/chat/view/subcomponents/AssistantThinkingIndicator.tsx src/components/chat/view/subcomponents/MessageComponent.tsx src/components/chat/job-tree/components/JobTreeContainer.tsx src/components/chat/job-tree/buildJobTreeFromMessages.test.mjs src/components/chat/view/subcomponents/MessageComponent.test.mjs
git commit -m "refactor: remove fragmented processing ui in favor of job tree"
```
