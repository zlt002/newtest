# Chat Run Card 统一改造实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让当前执行中、刚完成、历史回看三种 Claude 轮次统一成同一种 `Run Card` 结构，历史默认折叠过程，同时保留 official-history-first 与 sdk-live-first 的数据边界。

**Architecture:** 新增一个纯前端展示层的 `Run Card` view model，把 official history 与 sdk live 事件都投影成同一种卡片结构。页面不再并行直渲 `AssistantRuntimeTurn`、`realtimeBlocks`、独立交互 banner，而是只在 user message 后渲染一张 Claude `Run Card`，卡内包含最终回答、交互区和可折叠过程时间线。

**Tech Stack:** React、TypeScript、Node test runner、现有 chat-v2 projection/store 体系

---

### Task 1: 建立 Run Card 展示层模型与投影边界

**Files:**
- Create: `src/components/chat-v2/types/runCard.ts`
- Create: `src/components/chat-v2/projection/projectRunCards.ts`
- Create: `src/components/chat-v2/projection/projectRunCards.test.mjs`
- Modify: `src/components/chat-v2/projection/projectLiveSdkFeed.ts`
- Modify: `src/components/chat-v2/projection/projectHistoricalChatMessages.ts`

- [ ] **Step 1: 写一个失败测试，固定 `Run Card` 基础结构**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  projectHistoricalRunCards,
  projectLiveRunCards,
} from './projectRunCards.ts';

test('projectHistoricalRunCards 将 official history 投影成已完成且默认折叠过程的 Run Card', () => {
  const cards = projectHistoricalRunCards([
    {
      id: 'user-1',
      sessionId: 'sess-1',
      role: 'user',
      text: '请帮我总结需求',
      timestamp: '2026-04-23T05:00:00.000Z',
      kind: 'message',
      type: 'message',
    },
    {
      id: 'think-1',
      sessionId: 'sess-1',
      role: 'assistant',
      text: '我先梳理需求范围',
      timestamp: '2026-04-23T05:00:01.000Z',
      kind: 'thinking',
      type: 'thinking',
    },
    {
      id: 'assistant-1',
      sessionId: 'sess-1',
      role: 'assistant',
      text: '这是最终回答',
      timestamp: '2026-04-23T05:00:02.000Z',
      kind: 'message',
      type: 'message',
    },
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0].sessionId, 'sess-1');
  assert.equal(cards[0].cardStatus, 'completed');
  assert.equal(cards[0].finalResponse, '这是最终回答');
  assert.equal(cards[0].defaultExpanded, false);
  assert.deepEqual(cards[0].processItems.map((item) => item.kind), ['thinking']);
});

test('projectLiveRunCards 将 sdk live 事件投影成进行中 Run Card，并携带 processItems 与 activeInteraction', () => {
  const cards = projectLiveRunCards({
    sessionId: 'sess-1',
    anchoredUserMessages: [
      { messageId: 'user-1', content: '帮我规划一个需求', timestamp: '2026-04-23T05:00:00.000Z' },
    ],
    events: [
      {
        id: 'evt-1',
        sessionId: 'sess-1',
        timestamp: '2026-04-23T05:00:01.000Z',
        type: 'sdk.message',
        message: { kind: 'thinking', text: '先分析一下' },
      },
      {
        id: 'evt-2',
        sessionId: 'sess-1',
        timestamp: '2026-04-23T05:00:02.000Z',
        type: 'interaction.required',
        requestId: 'req-1',
        interaction: {
          kind: 'interactive_prompt',
          toolName: 'AskUserQuestion',
          message: '请确认背景描述',
          input: { question: '背景描述准确吗？' },
        },
      },
    ],
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0].cardStatus, 'waiting_for_input');
  assert.equal(cards[0].defaultExpanded, true);
  assert.equal(cards[0].activeInteraction?.requestId, 'req-1');
  assert.deepEqual(cards[0].processItems.map((item) => item.kind), ['thinking', 'interactive_prompt']);
});
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/projectRunCards.test.mjs
```

Expected:

```text
FAIL ... Cannot find module './projectRunCards.ts'
```

- [ ] **Step 3: 写最小类型定义与投影实现**

`src/components/chat-v2/types/runCard.ts`

```ts
export type RunCardStatus =
  | 'running'
  | 'waiting_for_input'
  | 'completed'
  | 'failed'
  | 'aborted';

export type RunCardProcessItem = {
  id: string;
  timestamp: string;
  kind:
    | 'thinking'
    | 'tool_use'
    | 'tool_result'
    | 'interactive_prompt'
    | 'permission_request'
    | 'session_status'
    | 'compact_boundary'
    | 'debug_ref'
    | 'notice';
  title: string;
  body: string;
  tone?: 'neutral' | 'warning' | 'danger' | 'success';
  payload?: unknown;
};

export type RunCardInteraction = {
  requestId: string;
  kind: 'interactive_prompt' | 'permission_request';
  toolName?: string | null;
  message?: string | null;
  input?: unknown;
  context?: unknown;
  payload?: unknown;
};

export type RunCard = {
  sessionId: string;
  anchorMessageId: string;
  cardStatus: RunCardStatus;
  headline: string;
  finalResponse: string;
  processItems: RunCardProcessItem[];
  activeInteraction: RunCardInteraction | null;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  defaultExpanded: boolean;
  source: 'official-history' | 'sdk-live';
};
```

`src/components/chat-v2/projection/projectRunCards.ts`

```ts
import type { CanonicalSessionMessage } from '../types/sessionHistory.ts';
import type { AgentRealtimeEvent } from './projectLiveSdkFeed.ts';
import type { RunCard, RunCardInteraction, RunCardProcessItem } from '../types/runCard.ts';

function toText(value: unknown) {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value == null) {
    return '';
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function projectHistoricalRunCards(messages: CanonicalSessionMessage[]): RunCard[] {
  const cards: RunCard[] = [];
  let currentUserMessage: CanonicalSessionMessage | null = null;
  let processItems: RunCardProcessItem[] = [];
  let finalResponse = '';

  const flush = (assistantMessage: CanonicalSessionMessage | null) => {
    if (!currentUserMessage || !assistantMessage) {
      return;
    }
    cards.push({
      sessionId: assistantMessage.sessionId,
      anchorMessageId: currentUserMessage.id,
      cardStatus: 'completed',
      headline: '已完成',
      finalResponse,
      processItems,
      activeInteraction: null,
      startedAt: currentUserMessage.timestamp,
      updatedAt: assistantMessage.timestamp,
      completedAt: assistantMessage.timestamp,
      defaultExpanded: false,
      source: 'official-history',
    });
  };

  let pendingAssistantMessage: CanonicalSessionMessage | null = null;

  for (const message of messages) {
    if (message.role === 'user') {
      if (pendingAssistantMessage) {
        flush(pendingAssistantMessage);
      }
      currentUserMessage = message;
      processItems = [];
      finalResponse = '';
      pendingAssistantMessage = null;
      continue;
    }

    if (!currentUserMessage) {
      continue;
    }

    const normalizedKind = String(message.kind || message.type || '').trim();
    if (normalizedKind === 'thinking') {
      processItems.push({
        id: message.id,
        timestamp: message.timestamp,
        kind: 'thinking',
        title: 'Thinking',
        body: toText(message.text),
      });
      continue;
    }

    if (normalizedKind === 'tool_use' || normalizedKind === 'tool_result' || normalizedKind === 'interactive_prompt') {
      processItems.push({
        id: message.id,
        timestamp: message.timestamp,
        kind: normalizedKind as RunCardProcessItem['kind'],
        title: normalizedKind,
        body: toText(message.content ?? message.text),
      });
      continue;
    }

    if (message.role === 'assistant') {
      finalResponse = toText(message.text || message.content);
      pendingAssistantMessage = message;
    }
  }

  if (pendingAssistantMessage) {
    flush(pendingAssistantMessage);
  }

  return cards;
}

export function projectLiveRunCards({
  sessionId,
  anchoredUserMessages,
  events,
}: {
  sessionId: string;
  anchoredUserMessages: Array<{ messageId: string; content: string; timestamp: string }>;
  events: AgentRealtimeEvent[];
}): RunCard[] {
  const anchor = anchoredUserMessages[anchoredUserMessages.length - 1];
  if (!anchor) {
    return [];
  }

  const processItems: RunCardProcessItem[] = [];
  let activeInteraction: RunCardInteraction | null = null;
  let finalResponse = '';
  let cardStatus: RunCard['cardStatus'] = 'running';

  for (const event of events) {
    if (event.type === 'sdk.message') {
      const kind = String(event.message.kind || '').trim();
      if (kind === 'delta' || kind === 'stream_delta') {
        finalResponse = toText(event.message.text || event.message.payload);
      }
      processItems.push({
        id: event.id,
        timestamp: event.timestamp,
        kind: (kind === 'delta' || kind === 'stream_delta' ? 'notice' : kind) as RunCardProcessItem['kind'],
        title: kind || 'sdk.message',
        body: toText(event.message.text || event.message.input || event.message.output || event.message.payload),
      });
      continue;
    }

    if (event.type === 'interaction.required') {
      activeInteraction = {
        requestId: event.requestId,
        kind: event.interaction.kind,
        toolName: event.interaction.toolName,
        message: event.interaction.message,
        input: event.interaction.input,
        context: event.interaction.context,
        payload: event.interaction.payload,
      };
      cardStatus = 'waiting_for_input';
      processItems.push({
        id: event.id,
        timestamp: event.timestamp,
        kind: event.interaction.kind,
        title: event.interaction.toolName || event.interaction.kind,
        body: toText(event.interaction.message || event.interaction.input || event.interaction.payload),
        tone: 'warning',
      });
      continue;
    }
  }

  return [{
    sessionId,
    anchorMessageId: anchor.messageId,
    cardStatus,
    headline: cardStatus === 'waiting_for_input' ? '等待你的回答' : '执行中',
    finalResponse,
    processItems,
    activeInteraction,
    startedAt: anchor.timestamp,
    updatedAt: events[events.length - 1]?.timestamp || anchor.timestamp,
    completedAt: null,
    defaultExpanded: true,
    source: 'sdk-live',
  }];
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/projectRunCards.test.mjs
```

Expected:

```text
# pass 2
```

- [ ] **Step 5: Commit**

```bash
git add src/components/chat-v2/types/runCard.ts src/components/chat-v2/projection/projectRunCards.ts src/components/chat-v2/projection/projectRunCards.test.mjs
git commit -m "feat: add run card projection model"
```

### Task 2: 用统一 Run Card 替换页面上的并行 assistant surface

**Files:**
- Create: `src/components/chat-v2/components/RunCard.tsx`
- Create: `src/components/chat-v2/components/RunCardProcessTimeline.tsx`
- Create: `src/components/chat-v2/components/RunCard.test.mjs`
- Modify: `src/components/chat/view/ChatInterface.tsx`
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
- Modify: `src/components/chat/view/agentV2Realtime.test.mjs`

- [ ] **Step 1: 写失败测试，固定“一条 user turn 只对应一张 assistant Run Card”**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('ChatInterface 使用 unified run cards 替代 assistantTurns + realtimeBlocks 双轨直渲', async () => {
  const source = await readFile(new URL('./ChatInterface.tsx', import.meta.url), 'utf8');

  assert.match(source, /projectHistoricalRunCards/);
  assert.match(source, /projectLiveRunCards/);
  assert.match(source, /runCards=/);
  assert.doesNotMatch(source, /assistantTurns=\{renderedAssistantTurns\}/);
  assert.doesNotMatch(source, /realtimeBlocks=\{realtimeBlocks\}/);
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/agentV2Realtime.test.mjs
```

Expected:

```text
FAIL ... Expected source to match /projectHistoricalRunCards/
```

- [ ] **Step 3: 实现 `RunCard` 组件和页面接线**

`src/components/chat-v2/components/RunCard.tsx`

```tsx
import React, { useState } from 'react';
import type { RunCard as RunCardModel } from '../types/runCard.ts';
import { RunCardProcessTimeline } from './RunCardProcessTimeline.tsx';

export function RunCard({
  card,
  interactionNode = null,
}: {
  card: RunCardModel;
  interactionNode?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(card.defaultExpanded);

  return (
    <article data-chat-run-card="true" className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <header className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-neutral-900">Claude</div>
          <div className="text-xs text-neutral-500">{card.headline}</div>
        </div>
        <button
          type="button"
          data-chat-run-card-toggle="true"
          className="text-xs text-blue-600"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? '收起过程' : '查看过程'}
        </button>
      </header>

      <div data-chat-run-card-body="true" className="whitespace-pre-wrap text-sm leading-7 text-neutral-800">
        {card.finalResponse || card.headline}
      </div>

      {interactionNode}

      {expanded ? <RunCardProcessTimeline items={card.processItems} /> : null}
    </article>
  );
}
```

`src/components/chat-v2/components/RunCardProcessTimeline.tsx`

```tsx
import React from 'react';
import type { RunCardProcessItem } from '../types/runCard.ts';

export function RunCardProcessTimeline({ items }: { items: RunCardProcessItem[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section data-chat-run-card-process="true" className="space-y-2 border-t border-neutral-200 pt-3">
      {items.map((item) => (
        <div key={item.id} className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-500">{item.title}</div>
          <div className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">{item.body}</div>
        </div>
      ))}
    </section>
  );
}
```

`src/components/chat/view/ChatInterface.tsx` 中把：

```tsx
const historicalChatMessages = React.useMemo(
  () => projectHistoricalChatMessages(historicalAgentConversation.history?.messages || []),
  [historicalAgentConversation.history?.messages],
);
const mergedChatMessages = React.useMemo(
  () => mergeHistoricalChatMessages(historicalChatMessages, chatMessages),
  [chatMessages, historicalChatMessages],
);
const assistantTurns = historicalAgentConversation.turns;
const realtimeBlocks = React.useMemo(() => {
  if (!activeAgentSessionId) {
    return [];
  }

  return projectLiveSdkFeed(listAgentRealtimeEvents(activeAgentSessionId));
}, [activeAgentSessionId, agentRealtimeVersion, listAgentRealtimeEvents]);
```

替换为：

```tsx
const historicalRunCards = React.useMemo(
  () => projectHistoricalRunCards(historicalAgentConversation.history?.messages || []),
  [historicalAgentConversation.history?.messages],
);
const liveRunCards = React.useMemo(() => {
  if (!activeAgentSessionId) {
    return [];
  }

  return projectLiveRunCards({
    sessionId: activeAgentSessionId,
    anchoredUserMessages: chatMessages
      .filter((message) => message.type === 'user')
      .map((message) => ({
        messageId: String(message.messageId || message.id),
        content: String(message.content || ''),
        timestamp: String(message.timestamp || ''),
      })),
    events: listAgentRealtimeEvents(activeAgentSessionId),
  });
}, [activeAgentSessionId, agentRealtimeVersion, chatMessages, listAgentRealtimeEvents]);

const runCards = liveRunCards.length > 0 ? liveRunCards : historicalRunCards;
const mergedChatMessages = chatMessages.filter((message) => message.type === 'user' || message.type === 'error');
```

并把 `ChatMessagesPane` 参数改成 `runCards={runCards}`。

- [ ] **Step 4: 运行测试，确认通过**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/agentV2Realtime.test.mjs src/components/chat-v2/components/RunCard.test.mjs
```

Expected:

```text
# pass
```

- [ ] **Step 5: Commit**

```bash
git add src/components/chat-v2/components/RunCard.tsx src/components/chat-v2/components/RunCardProcessTimeline.tsx src/components/chat-v2/components/RunCard.test.mjs src/components/chat/view/ChatInterface.tsx src/components/chat/view/subcomponents/ChatMessagesPane.tsx src/components/chat/view/agentV2Realtime.test.mjs
git commit -m "feat: render assistant turns as unified run cards"
```

### Task 3: 把 AskUser/权限交互收进同一张卡，消除三重展示

**Files:**
- Create: `src/components/chat-v2/components/RunCardInteraction.tsx`
- Modify: `src/components/chat/view/subcomponents/ChatComposer.tsx`
- Modify: `src/components/chat/view/subcomponents/InteractiveRequestsBanner.tsx`
- Modify: `src/components/chat/view/subcomponents/PermissionRequestsBanner.tsx`
- Modify: `src/components/chat/view/subcomponents/chat-request-split.test.mjs`
- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.ts`

- [ ] **Step 1: 写失败测试，固定 AskUser 只保留一个可操作入口**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('ChatComposer 不再为 assistant turn 所有的 AskUserQuestion 渲染独立 banner', async () => {
  const source = await readFile(new URL('./ChatComposer.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /<InteractiveRequestsBanner/);
  assert.match(source, /interactionNode/);
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/subcomponents/chat-request-split.test.mjs
```

Expected:

```text
FAIL ... found <InteractiveRequestsBanner
```

- [ ] **Step 3: 把交互面板迁入 `RunCard`**

`src/components/chat-v2/components/RunCardInteraction.tsx`

```tsx
import React from 'react';
import type { PendingPermissionRequest } from '../../chat/types/types.ts';
import InteractiveRequestsBanner from '../../chat/view/subcomponents/InteractiveRequestsBanner.tsx';
import PermissionRequestsBanner from '../../chat/view/subcomponents/PermissionRequestsBanner.tsx';

export function RunCardInteraction({
  pendingPermissionRequests,
  handlePermissionDecision,
  handleGrantToolPermission,
}: {
  pendingPermissionRequests: PendingPermissionRequest[];
  handlePermissionDecision: (
    requestIds: string | string[],
    decision: { allow?: boolean; message?: string; rememberEntry?: string | null; updatedInput?: unknown },
  ) => void;
  handleGrantToolPermission: (suggestion: { entry: string; toolName: string }) => { success: boolean };
}) {
  if (pendingPermissionRequests.length === 0) {
    return null;
  }

  return (
    <div data-chat-run-card-interaction="true" className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50/50 p-3">
      <InteractiveRequestsBanner
        pendingPermissionRequests={pendingPermissionRequests}
        inStreamRenderingEnabled={false}
        handlePermissionDecision={handlePermissionDecision}
      />
      <PermissionRequestsBanner
        pendingPermissionRequests={pendingPermissionRequests}
        handlePermissionDecision={handlePermissionDecision}
        handleGrantToolPermission={handleGrantToolPermission}
      />
    </div>
  );
}
```

`src/components/chat/view/subcomponents/ChatComposer.tsx` 中删除：

```tsx
<InteractiveRequestsBanner ... />
<PermissionRequestsBanner ... />
```

并保留“输入被阻塞”的顶部提示文案即可。

同时在 `ChatInterface.tsx` 里为当前活跃 run card 注入：

```tsx
interactionNode={
  <RunCardInteraction
    pendingPermissionRequests={pendingPermissionRequests}
    handlePermissionDecision={handlePermissionDecision}
    handleGrantToolPermission={handleGrantToolPermission}
  />
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/subcomponents/chat-request-split.test.mjs src/components/chat/view/agentV2Realtime.test.mjs
```

Expected:

```text
# pass
```

- [ ] **Step 5: Commit**

```bash
git add src/components/chat-v2/components/RunCardInteraction.tsx src/components/chat/view/subcomponents/ChatComposer.tsx src/components/chat/view/subcomponents/InteractiveRequestsBanner.tsx src/components/chat/view/subcomponents/PermissionRequestsBanner.tsx src/components/chat/view/subcomponents/chat-request-split.test.mjs src/components/chat/hooks/useChatRealtimeHandlers.ts src/components/chat/view/ChatInterface.tsx
git commit -m "feat: embed ask-user and permission UI inside run card"
```

### Task 4: 让历史态与当前态共享同一张卡，并默认折叠过程

**Files:**
- Modify: `src/components/chat-v2/hooks/useHistoricalAgentConversation.ts`
- Modify: `src/components/chat-v2/api/fetchSessionHistory.test.mjs`
- Modify: `src/components/chat-v2/projection/projectRunCards.ts`
- Modify: `src/components/chat-v2/projection/projectHistoricalChatMessages.test.mjs`
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`

- [ ] **Step 1: 写失败测试，固定历史会话也走 `Run Card` 且默认折叠过程**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { projectHistoricalRunCards } from './projectRunCards.ts';

test('历史态 Run Card 默认折叠过程，但保留 thinking/tool/use 作为 processItems', () => {
  const cards = projectHistoricalRunCards([
    {
      id: 'user-1',
      sessionId: 'sess-1',
      role: 'user',
      text: '历史问题',
      timestamp: '2026-04-23T05:00:00.000Z',
      kind: 'message',
      type: 'message',
    },
    {
      id: 'tool-1',
      sessionId: 'sess-1',
      role: 'assistant',
      content: [{ type: 'text', text: '读取文件成功' }],
      timestamp: '2026-04-23T05:00:01.000Z',
      kind: 'tool_result',
      type: 'tool_result',
    },
    {
      id: 'assistant-1',
      sessionId: 'sess-1',
      role: 'assistant',
      text: '历史最终回答',
      timestamp: '2026-04-23T05:00:02.000Z',
      kind: 'message',
      type: 'message',
    },
  ]);

  assert.equal(cards[0].defaultExpanded, false);
  assert.deepEqual(cards[0].processItems.map((item) => item.kind), ['tool_result']);
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/projectHistoricalChatMessages.test.mjs src/components/chat-v2/projection/projectRunCards.test.mjs
```

Expected:

```text
FAIL ... processItems missing tool_result
```

- [ ] **Step 3: 扩展历史投影，覆盖完整过程节点**

在 `src/components/chat-v2/projection/projectRunCards.ts` 中把历史投影补齐：

```ts
if (normalizedKind === 'tool_use' || normalizedKind === 'tool_result' || normalizedKind === 'interactive_prompt' || normalizedKind === 'permission_request' || normalizedKind === 'compact_boundary') {
  processItems.push({
    id: message.id,
    timestamp: message.timestamp,
    kind: normalizedKind as RunCardProcessItem['kind'],
    title: normalizedKind,
    body: toText(message.content ?? message.text),
  });
  continue;
}
```

并在 `ChatMessagesPane.tsx` 中确保历史态不再单独展示 assistant 文本消息列表，只保留：

```tsx
const renderedMessages = visibleMessages.filter((message) => message.type === 'user' || message.type === 'error');
```

- [ ] **Step 4: 运行测试，确认通过**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/projectHistoricalChatMessages.test.mjs src/components/chat-v2/projection/projectRunCards.test.mjs src/components/chat/view/agentV2Realtime.test.mjs
```

Expected:

```text
# pass
```

- [ ] **Step 5: Commit**

```bash
git add src/components/chat-v2/hooks/useHistoricalAgentConversation.ts src/components/chat-v2/api/fetchSessionHistory.test.mjs src/components/chat-v2/projection/projectRunCards.ts src/components/chat-v2/projection/projectHistoricalChatMessages.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.tsx
git commit -m "feat: align historical playback with unified run cards"
```

### Task 5: 回归收口与删除重复展示链

**Files:**
- Modify: `src/components/chat/view/agentV2Realtime.test.mjs`
- Modify: `src/components/chat/view/subcomponents/chat-request-split.test.mjs`
- Modify: `src/components/chat-v2/projection/projectLiveSdkFeed.test.mjs`
- Modify: `src/components/chat-v2/components/AssistantRuntimeTurn.test.mjs`
- Modify: `src/components/chat/view/ChatInterface.tsx`

- [ ] **Step 1: 写失败测试，固定“一个 user turn 只配一张 assistant card”**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('ChatMessagesPane 不再并行渲染 assistantTurns 与 raw realtime feed 双轨 assistant surface', async () => {
  const source = await readFile(new URL('./subcomponents/ChatMessagesPane.tsx', import.meta.url), 'utf8');

  assert.match(source, /runCards/);
  assert.doesNotMatch(source, /assistantTurns = \[\]/);
  assert.doesNotMatch(source, /realtimeBlocks = \[\]/);
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/agentV2Realtime.test.mjs
```

Expected:

```text
FAIL ... source still contains assistantTurns or realtimeBlocks
```

- [ ] **Step 3: 删除剩余重复 surface 接线**

在 `src/components/chat/view/ChatInterface.tsx` 中删除以下页面级通路：

```tsx
assistantTurns={renderedAssistantTurns}
realtimeBlocks={realtimeBlocks}
conversationStream={agentConversation.stream}
contextBar={shouldShowAssistantRuntimeTurn ? null : chatV2ContextBar}
```

并改成：

```tsx
runCards={runCards}
contextBar={chatV2ContextBar}
```

同时在 `ChatMessagesPane.tsx` 中移除：

```tsx
{visibleUserMessages.length > 0 ? standaloneAssistantTurns : null}
{visibleUserMessages.length === 0 ? assistantTurns.map((turn) => turn.node) : null}
{realtimeBlocks.length > 0 && (...)}
```

改为：

```tsx
{runCards.map((card) => (
  <RunCard key={`${card.sessionId}:${card.anchorMessageId}:${card.updatedAt || 'pending'}`} card={card} />
))}
```

- [ ] **Step 4: 运行全量相关回归测试**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test \
  src/components/chat-v2/projection/projectRunCards.test.mjs \
  src/components/chat-v2/projection/projectLiveSdkFeed.test.mjs \
  src/components/chat-v2/projection/projectHistoricalChatMessages.test.mjs \
  src/components/chat-v2/components/RunCard.test.mjs \
  src/components/chat/view/agentV2Realtime.test.mjs \
  src/components/chat/view/subcomponents/chat-request-split.test.mjs \
  src/components/chat/hooks/useChatSessionState.test.mjs
```

Expected:

```text
# fail 0
```

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/view/ChatInterface.tsx src/components/chat/view/subcomponents/ChatMessagesPane.tsx src/components/chat/view/agentV2Realtime.test.mjs src/components/chat/view/subcomponents/chat-request-split.test.mjs src/components/chat-v2/projection/projectLiveSdkFeed.test.mjs src/components/chat-v2/components/AssistantRuntimeTurn.test.mjs
git commit -m "refactor: unify chat assistant surfaces into run cards"
```

## 自检记录

### 1. Spec coverage

已覆盖的 spec 要点：

1. 单轨 `Run Card` 展示模型：Task 1、Task 2
2. 当前进行中 / 等待输入 / 已完成 / 历史回看统一结构：Task 2、Task 3、Task 4
3. 历史默认折叠过程：Task 1、Task 4
4. `AskUserQuestion` 只保留一个可操作入口：Task 3
5. 保持 official-history-first 与 sdk-live-first：Task 1、Task 4
6. 删除重复 surface：Task 5

未发现缺口。

### 2. Placeholder scan

已检查本计划，不包含：

- TBD
- TODO
- “类似 Task N”
- “自己补错误处理”
- 没有代码块的实现步骤

### 3. Type consistency

计划中统一使用以下命名：

- `RunCard`
- `RunCardProcessItem`
- `RunCardInteraction`
- `projectHistoricalRunCards`
- `projectLiveRunCards`
- `RunCardProcessTimeline`
- `RunCardInteraction`

未发现前后命名冲突。
