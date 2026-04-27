# Claude UI Message Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Claude Agent SDK 的原始消息流收敛成“编排卡 + 子代理卡 + 最终答案卡 + 诊断层”的稳定 UI，消除顶层工具刷屏、重复错误红框和重复结果展示。

**Architecture:** 保留现有 `NormalizedMessage -> ChatMessage` 的总体链路，但在 `useChatMessages.ts` 增加一层更强的 UI 领域映射，把 `Task` 子代理及其内部工具过程统一归并到子代理卡片中。`MessageComponent.tsx` 继续作为主聊天渲染入口，但只渲染收敛后的卡片；原始工具细节和重复中间失败被降级到子代理卡片折叠区域或完全隐藏。最终 assistant 汇总与 usage/cost 仍由 `result` 驱动，但与子代理原始内容解耦。

**Tech Stack:** React、TypeScript、现有 chat hooks/store、Claude Agent SDK 事件映射、Node test runner

---

## File Structure

本次实现聚焦在以下文件边界：

- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/hooks/useChatMessages.ts`
  - 职责：把 `NormalizedMessage[]` 转成高层 `ChatMessage[]`
  - 本轮负责新增编排卡/子代理卡/错误降噪/最终答案去重逻辑
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/types/types.ts`
  - 职责：补充主聊天卡片和子代理卡片所需的类型
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/tools/components/SubagentContainer.tsx`
  - 职责：把子代理卡片改成真正的“过程 + warning + 结果摘要”容器
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/tools/components/subagentProgressView.ts`
  - 职责：将子代理状态、最近步骤、warning、结果摘要整理成视图模型
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/view/subcomponents/MessageComponent.tsx`
  - 职责：主聊天流只渲染收敛后的内容；为编排卡、最终答案卡和 usage 卡选择正确展示层级
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/tools/ToolRenderer.tsx`
  - 职责：保证 `Task` 永远走子代理卡片，不再与普通工具结果共享过多视觉语义
- Test: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/hooks/useChatMessages.test.mjs`
  - 职责：覆盖主聊天流瘦身、warning 降级、最终答案去重、编排卡生成
- Test: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/tools/components/subagentProgressView.test.mjs`
  - 职责：覆盖子代理卡片状态、warning、结果摘要视图模型

必要时新增一个小型 helper 文件：

- Create: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/hooks/chatOrchestrationPresentation.ts`
  - 职责：从 assistant + Task 序列提取“编排卡”所需的名字、数量和说明

---

### Task 1: 为聊天流引入“编排卡 / 子代理卡 / 最终答案卡”的类型骨架

**Files:**
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/types/types.ts`
- Test: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/hooks/useChatMessages.test.mjs`

- [ ] **Step 1: 写一个失败测试，表达“Task 序列应被提升为编排卡”**

```js
test('normalizedToChatMessages folds assistant preface plus two Task tool uses into one orchestration card', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'assistant-preface',
      kind: 'text',
      role: 'assistant',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-17T17:33:55.000Z',
      content: '我来为你创建两个子代理，分别调研佛山的经济和天气情况。',
    },
    {
      id: 'task-1',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-17T17:33:56.000Z',
      toolName: 'Task',
      toolId: 'task-tool-1',
      toolInput: { description: '调研佛山经济情况', prompt: '...' },
    },
    {
      id: 'task-2',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-17T17:33:57.000Z',
      toolName: 'Task',
      toolId: 'task-tool-2',
      toolInput: { description: '调研佛山天气气候', prompt: '...' },
    },
  ]);

  assert.equal(chatMessages[0].type, 'assistant');
  assert.equal(chatMessages[0].isOrchestrationCard, true);
  assert.deepEqual(chatMessages[0].orchestrationState?.taskTitles, ['调研佛山经济情况', '调研佛山天气气候']);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/hooks/useChatMessages.test.mjs
```

Expected:

- FAIL，提示 `isOrchestrationCard` / `orchestrationState` 相关字段不存在，或序列仍然被渲染成普通 assistant 文本 + 两个 `Task` 卡。

- [ ] **Step 3: 在类型定义里补足编排卡和子代理 warning 需要的字段**

```ts
export interface SubagentWarningState {
  kind: string;
  message: string;
}

export interface OrchestrationState {
  summary: string;
  taskTitles: string[];
}

export interface ChatMessage {
  // 现有字段...
  isOrchestrationCard?: boolean;
  orchestrationState?: OrchestrationState | null;
}

export interface SubagentProgressState {
  // 现有字段...
  warnings?: SubagentWarningState[];
  resultPreview?: string | null;
}
```

- [ ] **Step 4: 跑测试确认类型改动不破坏现有测试**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/hooks/useChatMessages.test.mjs
```

Expected:

- 仍有 FAIL，但失败点从类型缺失收敛到尚未实现编排卡映射逻辑。

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/types/types.ts src/components/chat/hooks/useChatMessages.test.mjs
git commit -m "refactor: add orchestration and subagent warning chat types"
```

---

### Task 2: 在 `useChatMessages` 中收敛主聊天流，只保留编排卡、Task 卡和最终答案

**Files:**
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/hooks/useChatMessages.ts`
- Optionally Create: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/hooks/chatOrchestrationPresentation.ts`
- Test: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/hooks/useChatMessages.test.mjs`

- [ ] **Step 1: 为“顶层工具刷屏”和“中间失败降级”写失败测试**

```js
test('normalizedToChatMessages suppresses child WebSearch and WebFetch messages from the top-level chat stream', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'child-search',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-17T17:34:01.000Z',
      toolName: 'WebSearch',
      toolId: 'child-tool-1',
      parentToolUseId: 'task-tool-1',
      toolInput: { query: '佛山 GDP' },
    },
    {
      id: 'task-tool',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-17T17:34:02.000Z',
      toolName: 'Task',
      toolId: 'task-tool-1',
      toolInput: { description: '调研佛山经济情况', prompt: '...' },
      toolResult: { isError: false, content: '完成' },
    },
  ]);

  assert.equal(chatMessages.length, 1);
  assert.equal(chatMessages[0].toolName, 'Task');
});

test('normalizedToChatMessages converts recoverable WebFetch safety failures into subagent warnings instead of top-level errors', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'fetch-error',
      kind: 'tool_result',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-17T17:34:03.000Z',
      toolId: 'child-fetch-1',
      parentToolUseId: 'task-tool-1',
      isError: true,
      content: 'Unable to verify if domain en.wikipedia.org is safe to fetch.',
    },
    {
      id: 'task-tool',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-17T17:34:04.000Z',
      toolName: 'Task',
      toolId: 'task-tool-1',
      toolInput: { description: '调研佛山天气气候', prompt: '...' },
      toolResult: { isError: false, content: '完成' },
    },
  ]);

  assert.equal(chatMessages.length, 1);
  assert.equal(chatMessages[0].type, 'assistant');
  assert.equal(chatMessages[0].subagentState?.progress?.warnings?.length, 1);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/hooks/useChatMessages.test.mjs
```

Expected:

- FAIL，说明当前逻辑仍会把部分中间消息留在顶层，warning 也未正确聚合。

- [ ] **Step 3: 实现编排卡提取和顶层消息瘦身**

如果创建 helper，内容像这样：

```ts
export function extractOrchestrationCard(messages: NormalizedMessage[], index: number) {
  const current = messages[index];
  if (!current || current.kind !== 'text' || current.role !== 'assistant') return null;

  const nextTasks = messages.slice(index + 1, index + 4).filter(
    (msg) => msg.kind === 'tool_use' && String(msg.toolName || '') === 'Task',
  );

  if (nextTasks.length === 0) return null;

  return {
    summary: `已派发 ${nextTasks.length} 个子代理`,
    taskTitles: nextTasks.map((task) => String((task.toolInput as any)?.description || '未命名任务')),
  };
}
```

在 `useChatMessages.ts` 中新增/修改逻辑：

```ts
const RECOVERABLE_SUBAGENT_ERROR_PATTERNS = [
  /Unable to verify if domain .* is safe to fetch/i,
  /Sibling tool call errored/i,
];

function isRecoverableSubagentError(message: NormalizedMessage) {
  const content = String(message.content || message.toolResult?.content || '');
  return RECOVERABLE_SUBAGENT_ERROR_PATTERNS.some((pattern) => pattern.test(content));
}

function shouldHideChildToolFromMainStream(message: NormalizedMessage, subagentTaskToolIds: Set<string>) {
  if (!shouldSuppressSubagentNotification(message, subagentTaskToolIds)) return false;
  return true;
}
```

并在主循环里：

- assistant 编排说明优先映射成 `isOrchestrationCard`
- 子代理内部 `tool_use/tool_result/tool_progress` 一律不推入主聊天流
- 可恢复错误不再生成顶层 `error`

- [ ] **Step 4: 让 `Task` 卡片附带 warning 与结果摘要**

在 `buildSubagentProgressMap()` / `buildSubagentChildToolsMap()` 里增加 warning/resultPreview 聚合：

```ts
if (message.kind === 'tool_result' && message.isError && isRecoverableSubagentError(message)) {
  const progress = getProgress(parentToolId);
  const warnings = progress.warnings || (progress.warnings = []);
  warnings.push({
    kind: 'recoverable_error',
    message: normalizeWarningMessage(message),
  });
}

if (message.kind === 'tool_result' && !message.isError && String(message.content || '').trim()) {
  progress.resultPreview = summarizeToolResult(String(message.content));
}
```

- [ ] **Step 5: 跑测试确认通过**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/hooks/useChatMessages.test.mjs
```

Expected:

- PASS，尤其是新增的编排卡、warning 聚合和顶层瘦身用例全部通过。

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/hooks/useChatMessages.ts src/components/chat/hooks/useChatMessages.test.mjs src/components/chat/types/types.ts src/components/chat/hooks/chatOrchestrationPresentation.ts
git commit -m "refactor: collapse Claude task orchestration into stable chat cards"
```

---

### Task 3: 重构子代理卡片，把过程、warning 和结果摘要放进单一容器

**Files:**
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/tools/components/SubagentContainer.tsx`
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/tools/components/subagentProgressView.ts`
- Test: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/tools/components/subagentProgressView.test.mjs`

- [ ] **Step 1: 写一个失败测试，要求 `SubagentProgressView` 输出 warning、摘要和状态**

```js
test('buildSubagentProgressView exposes warning and result preview for successful fallback tasks', () => {
  const view = buildSubagentProgressView(
    {
      status: 'completed',
      currentToolName: 'Bash',
      usage: { totalTokens: 22043, toolUses: 23, durationMs: 336399 },
      warnings: [{ kind: 'recoverable_error', message: '部分外部站点抓取失败，已切换备用方式' }],
      resultPreview: '佛山是广东省 GDP 第三的城市，家电、陶瓷和装备制造发达。',
      timeline: [{ kind: 'tool_progress', label: '切换到命令行兜底', status: 'in_progress' }],
    },
    true,
    false,
  );

  assert.equal(view.status.label, '已完成');
  assert.equal(view.warningItems.length, 1);
  assert.equal(view.resultPreview, '佛山是广东省 GDP 第三的城市，家电、陶瓷和装备制造发达。');
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/tools/components/subagentProgressView.test.mjs
```

Expected:

- FAIL，说明当前视图模型还没有 warning/resultPreview 字段。

- [ ] **Step 3: 扩展 `buildSubagentProgressView()` 返回结构**

```ts
return {
  status,
  activeToolLabel,
  latestEvent,
  outputFileName,
  warningItems: progress?.warnings || [],
  resultPreview: progress?.resultPreview || '',
};
```

- [ ] **Step 4: 在 `SubagentContainer.tsx` 中增加 warning 和结果摘要区域**

目标结构：

```tsx
{progressView.warningItems.length > 0 && (
  <div className="mt-2 rounded-md border border-amber-200/70 bg-amber-50/70 p-2 text-[11px] text-amber-800 dark:border-amber-800/60 dark:bg-amber-900/20 dark:text-amber-200">
    <div className="mb-1 font-medium">注意</div>
    <ul className="space-y-1">
      {progressView.warningItems.map((warning, index) => (
        <li key={`${warning.kind}-${index}`}>{warning.message}</li>
      ))}
    </ul>
  </div>
)}

{progressView.resultPreview && (
  <div className="mt-2 rounded-md border border-gray-200/70 bg-white/80 p-2 text-[11px] text-gray-600 dark:border-gray-700 dark:bg-gray-950/20 dark:text-gray-300">
    <div className="mb-1 font-medium text-gray-700 dark:text-gray-200">结果摘要</div>
    <div className="line-clamp-4 whitespace-pre-wrap break-words">{progressView.resultPreview}</div>
  </div>
)}
```

并在“View tool history”中保留原始 child tools，但默认折叠。

- [ ] **Step 5: 跑测试确认通过**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/tools/components/subagentProgressView.test.mjs
```

Expected:

- PASS，warning 与 result preview 视图模型正确输出。

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/tools/components/SubagentContainer.tsx src/components/chat/tools/components/subagentProgressView.ts src/components/chat/tools/components/subagentProgressView.test.mjs
git commit -m "feat: add warning and result summary sections to subagent cards"
```

---

### Task 4: 收紧主聊天渲染层，只让主聊天渲染编排卡、Task 卡和最终答案

**Files:**
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/view/subcomponents/MessageComponent.tsx`
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/tools/ToolRenderer.tsx`
- Test: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/hooks/useChatMessages.test.mjs`

- [ ] **Step 1: 写一个失败测试，覆盖“编排卡文案不应再以普通 assistant 文本出现”**

```js
test('normalizedToChatMessages shows orchestration cards instead of raw assistant prefaces for Task spawning', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'assistant-preface',
      kind: 'text',
      role: 'assistant',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-17T17:35:00.000Z',
      content: '我来为你创建两个子代理，分别调研佛山的经济和天气情况。',
    },
    {
      id: 'task-1',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-17T17:35:01.000Z',
      toolName: 'Task',
      toolId: 'task-tool-1',
      toolInput: { description: '调研佛山经济情况', prompt: '...' },
    },
  ]);

  assert.equal(chatMessages.some((msg) => msg.type === 'assistant' && msg.content?.includes('创建两个子代理')), false);
  assert.equal(chatMessages[0].isOrchestrationCard, true);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/hooks/useChatMessages.test.mjs
```

Expected:

- FAIL，说明当前主聊天流里仍存在原始 assistant 前导语。

- [ ] **Step 3: 在 `MessageComponent.tsx` 中加入编排卡渲染分支**

```tsx
{message.isOrchestrationCard ? (
  <div className="rounded-lg border border-sky-200/70 bg-sky-50/70 p-3 text-sm text-sky-900 dark:border-sky-800/60 dark:bg-sky-950/20 dark:text-sky-100">
    <div className="mb-2 font-medium">{message.orchestrationState?.summary}</div>
    <ul className="space-y-1 text-xs text-sky-800 dark:text-sky-200">
      {message.orchestrationState?.taskTitles.map((title) => (
        <li key={title}>• {title}</li>
      ))}
    </ul>
  </div>
) : message.isToolUse ? (
  // 现有分支
)}
```

- [ ] **Step 4: 在 `ToolRenderer.tsx` 中保持 `Task` 唯一路径**

确保 `Task` 永远只走：

```tsx
if (isSubagentContainer && subagentState) {
  if (mode === 'result') return null;
  return <SubagentContainer ... />;
}
```

同时不为 `Task` 渲染额外的普通结果卡片。

- [ ] **Step 5: 跑测试确认通过**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/hooks/useChatMessages.test.mjs
```

Expected:

- PASS，编排卡与 Task 卡路径稳定，原始 assistant 编排说明不再露出。

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/view/subcomponents/MessageComponent.tsx src/components/chat/tools/ToolRenderer.tsx src/components/chat/hooks/useChatMessages.test.mjs
git commit -m "feat: render orchestration cards and keep Task as the only subagent surface"
```

---

### Task 5: 收口最终答案与 usage/cost，避免重复原始报告

**Files:**
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/hooks/useChatMessages.ts`
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/view/subcomponents/MessageComponent.tsx`
- Test: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/chat/hooks/useChatMessages.test.mjs`

- [ ] **Step 1: 写一个失败测试，要求最终 assistant 汇总出现一次，且不重复插入子代理原始报告**

```js
test('normalizedToChatMessages keeps the final assistant summary once and leaves raw subagent reports inside Task cards', () => {
  const chatMessages = normalizedToChatMessages([
    {
      id: 'task-tool',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-17T17:36:00.000Z',
      toolName: 'Task',
      toolId: 'task-tool-1',
      toolInput: { description: '调研佛山天气气候', prompt: '...' },
      toolResult: {
        isError: false,
        content: '完整天气调研报告全文......',
      },
    },
    {
      id: 'assistant-summary',
      kind: 'text',
      role: 'assistant',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-17T17:36:01.000Z',
      content: '两个子代理已完成调研，以下是佛山的调研结果汇总：...',
    },
    {
      id: 'result-summary',
      kind: 'result',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-17T17:36:02.000Z',
      content: '两个子代理已完成调研，以下是佛山的调研结果汇总：...',
      isError: false,
      totalCostUsd: 0.1234,
    },
  ]);

  const assistantSummaries = chatMessages.filter((msg) => msg.type === 'assistant' && String(msg.content || '').includes('两个子代理已完成调研'));
  assert.equal(assistantSummaries.length, 1);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/hooks/useChatMessages.test.mjs
```

Expected:

- FAIL，说明最终 summary 和 result 之间仍可能重复。

- [ ] **Step 3: 在 `useChatMessages.ts` 中增强最终答案去重规则**

思路：

```ts
function isLikelyFinalSummary(text: string) {
  return /已完成调研|汇总|总结/i.test(text);
}

if (msg.kind === 'result') {
  // 保持现有 buildResultMessageContent
  // 但如果上一条 assistant 已是等价最终总结，跳过
}

if (msg.kind === 'text' && msg.role === 'assistant') {
  // 如果后续紧接一个等价 result，总结文本只保留一份
}
```

- [ ] **Step 4: 在 `MessageComponent.tsx` 中把 usage/cost 固定在最终答案底部**

保留现有 usage 卡，但确保：

- 仅对最终 assistant 汇总显示
- 不对编排卡或中间过程卡显示

可通过判断：

```tsx
const shouldShowUsageSummary = message.type === 'assistant'
  && !message.isToolUse
  && !message.isThinking
  && !message.isOrchestrationCard
  && (formattedUsageCost || modelUsageEntries.length > 0);
```

- [ ] **Step 5: 跑测试确认通过**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/hooks/useChatMessages.test.mjs
```

Expected:

- PASS，最终汇总只出现一次，usage/cost 只挂在最终答案位置。

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/hooks/useChatMessages.ts src/components/chat/view/subcomponents/MessageComponent.tsx src/components/chat/hooks/useChatMessages.test.mjs
git commit -m "refactor: dedupe final Claude summaries and keep usage on final answers"
```

---

### Task 6: 全量验证与文档对齐

**Files:**
- Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/docs/superpowers/plans/2026-04-17-claude-ui-message-architecture.md`
- Optionally Modify: `/Users/zhanglt21/Desktop/ccui0414/cc-ui/docs/superpowers/specs/2026-04-17-claude-ui-message-architecture-design.md`

- [ ] **Step 1: 跑定向测试**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test \
  src/components/chat/hooks/useChatMessages.test.mjs \
  src/components/chat/tools/components/subagentProgressView.test.mjs
```

Expected:

- PASS

- [ ] **Step 2: 跑类型检查**

Run:

```bash
npm run typecheck
```

Expected:

- 如果仍卡在既有 `grapesjs` 缺依赖问题，记录为“已有阻塞，不属于本任务新增问题”
- 不应新增新的类型错误

- [ ] **Step 3: 跑全量测试**

Run:

```bash
npm test
```

Expected:

- PASS

- [ ] **Step 4: 手动验证关键场景**

在 UI 中手动复现：

1. `帮我派发一个经济子代理和一个天气子代理去调研下佛山`
2. 观察主聊天流

验收标准：

- 不再出现顶层 `WebSearch / Parameters`
- 不再出现顶层 `WebFetch / Parameters`
- 中间抓取失败不再刷一排红框
- 会看到一张编排卡 + 两张子代理卡 + 一张最终汇总
- 子代理卡里能看到 warning、最近过程、tokens、tools、duration

- [ ] **Step 5: 更新计划勾选状态并写简短结果说明**

在本计划文件最上方或每个任务下补充：

```md
- 完成日期
- 验证命令
- 是否有遗留阻塞
```

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/hooks/useChatMessages.ts \
  src/components/chat/types/types.ts \
  src/components/chat/tools/components/SubagentContainer.tsx \
  src/components/chat/tools/components/subagentProgressView.ts \
  src/components/chat/view/subcomponents/MessageComponent.tsx \
  src/components/chat/tools/ToolRenderer.tsx \
  src/components/chat/hooks/useChatMessages.test.mjs \
  src/components/chat/tools/components/subagentProgressView.test.mjs \
  docs/superpowers/plans/2026-04-17-claude-ui-message-architecture.md
git commit -m "refactor: streamline Claude task chat architecture"
```

---

## Self-Review

### Spec coverage

本计划覆盖了 spec 中的核心要求：

- 主聊天流收敛到编排卡 / 子代理卡 / 最终答案卡
- `Task` 成为唯一子代理顶层载体
- `WebSearch/WebFetch/Bash` 降级到子代理卡片过程层
- 中间失败降级为 warning
- usage/cost 收口到子代理卡片头部和最终答案底部

未纳入本轮计划的内容：

- LangSmith 诊断抽屉
- 更复杂的调试层 UI

这些与 spec 一致，属于后续 phase。

### Placeholder scan

- 没有 `TODO` / `TBD`
- 所有任务都明确了文件、测试、命令和预期结果

### Type consistency

- 统一使用：
  - `isOrchestrationCard`
  - `orchestrationState`
  - `warnings`
  - `resultPreview`
- 与现有 `subagentState.progress` 结构兼容，不引入第二套平行命名

## Execution Handoff

Plan complete and saved to `/Users/zhanglt21/Desktop/ccui0414/cc-ui/docs/superpowers/plans/2026-04-17-claude-ui-message-architecture.md`. Two execution options:

**1. Subagent-Driven (recommended)** - 我派发一个全新的子代理按 task 执行，task 间做 review，收敛更稳

**2. Inline Execution** - 我在当前会话里按这个 plan 直接连续实现，阶段性给你汇报

**你想选哪种方式？**
