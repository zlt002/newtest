# Runtime Single Assistant Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把聊天运行时主视图收口成“一个发送，一个回复卡”，让每个用户消息后面只跟一张 Claude 回复卡，并由这张卡承载阶段性回复、工具过程、子代理过程和交互状态。

**Architecture:** 保留现有 `conversationTurns`、`runCards`、`fallback` 的上游来源，但在进入渲染层前统一压成单一的 `ConversationRound[]`。`ChatInterface` 只负责收集历史、实时和待处理交互；新的 round 投影层负责合并和封口规则；`ChatMessagesPane` 只负责按固定顺序渲染 `user bubble -> assistant card`。

**Tech Stack:** React, TypeScript, Node test runner, Vite, Zustand-style session store

---

## 适用 spec

- [2026-04-26-runtime-single-assistant-card-design.md](/Users/zhanglt21/Desktop/accrnew/cc-ui/docs/superpowers/specs/2026-04-26-runtime-single-assistant-card-design.md)

## 文件结构

### 新增

- Create: `src/components/chat/types/conversationRound.ts`
  - 定义 `ConversationRound`、`AssistantCardViewModel`、`AssistantResponseSegment`
- Create: `src/components/chat/projection/projectConversationRounds.ts`
  - 统一把 user turn、assistant turn、run card、fallback 合并成 `ConversationRound[]`
- Create: `src/components/chat/projection/projectConversationRounds.test.mjs`
  - round 级别回归测试

### 修改

- Modify: `src/components/chat/projection/projectConversationTurns.ts`
  - 从“最终 UI 模型”降级为 round 投影内部 helper，继续提供稳定 user/assistant 轮次边界
- Modify: `src/components/chat/projection/projectRunCards.ts`
  - 明确输出可并入单一 assistant card 的 response/process 语义
- Modify: `src/components/chat/view/ChatInterface.tsx`
  - 改为把历史、实时、pending request 统一交给 `projectConversationRounds(...)`
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
  - 顶层只消费 `ConversationRound[]`，不再自行拼 `conversationTurns + runCards + fallback`
- Modify: `src/components/chat/components/RunCard.tsx`
  - 运行中默认展示最近 5 条过程，保留弹框查看全部过程
- Modify: `src/components/chat/view/agentV2Realtime.test.mjs`
  - 锁定 `ChatInterface` 数据交接和“完成但无 assistant surface 时的恢复”
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`
  - 锁定 UI 渲染约束

### 重点测试

- Test: `src/components/chat/projection/projectConversationRounds.test.mjs`
- Test: `src/components/chat/projection/projectConversationTurns.test.mjs`
- Test: `src/components/chat/projection/projectRunCards.test.mjs`
- Test: `src/components/chat/view/agentV2Realtime.test.mjs`
- Test: `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`
- Test: `src/hooks/chat/useChatRealtimeHandlers.test.mjs`

## Task 1: 定义单一 round 模型边界

**Files:**
- Create: `src/components/chat/types/conversationRound.ts`
- Test: `src/components/chat/projection/projectConversationRounds.test.mjs`

- [ ] **Step 1: 写一个失败测试，锁定 ConversationRound 的最小结构**

```js
test('projectConversationRounds emits one round with one user message and one assistant card', async () => {
  const rounds = projectConversationRounds({
    sessionId: 'sess-1',
    conversationTurns: [
      { kind: 'user', id: 'user-1', sessionId: 'sess-1', content: '111', timestamp: '2026-04-26T10:00:00.000Z', source: 'transient' },
      {
        kind: 'assistant',
        id: 'assistant-1',
        sessionId: 'sess-1',
        runId: 'run-1',
        anchorMessageId: 'user-1',
        status: 'running',
        headline: '执行中',
        activityItems: [],
        bodySegments: [],
        activeInteraction: null,
        startedAt: '2026-04-26T10:00:01.000Z',
        updatedAt: '2026-04-26T10:00:01.000Z',
        completedAt: null,
        source: 'sdk-live',
      },
    ],
  });

  assert.deepEqual(rounds, [{
    id: 'sess-1:user-1',
    sessionId: 'sess-1',
    userMessage: {
      id: 'user-1',
      sessionId: 'sess-1',
      content: '111',
      timestamp: '2026-04-26T10:00:00.000Z',
    },
    assistantCard: {
      id: 'assistant-1',
      sessionId: 'sess-1',
      runId: 'run-1',
      anchorMessageId: 'user-1',
      status: 'running',
      headline: '执行中',
      responseSegments: [],
      processItems: [],
      previewItems: [],
      activeInteraction: null,
      startedAt: '2026-04-26T10:00:01.000Z',
      updatedAt: '2026-04-26T10:00:01.000Z',
      completedAt: null,
      source: 'sdk-live',
    },
  }]);
});
```

- [ ] **Step 2: 运行测试，确认当前没有 round 投影实现**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/projection/projectConversationRounds.test.mjs`

Expected: FAIL，报 `Cannot find module ... projectConversationRounds.ts` 或 `projectConversationRounds is not a function`

- [ ] **Step 3: 新增类型定义文件**

```ts
import type { RunCardInteraction, RunCardProcessItem } from './runCard.ts';

export type AssistantResponseSegment = {
  id: string;
  kind: 'phase' | 'final';
  body: string;
  timestamp: string | null;
};

export type AssistantCardViewModel = {
  id: string;
  sessionId: string;
  runId: string | null;
  anchorMessageId: string;
  status: 'queued' | 'starting' | 'running' | 'waiting_for_input' | 'completed' | 'failed' | 'aborted';
  headline: string;
  responseSegments: AssistantResponseSegment[];
  processItems: RunCardProcessItem[];
  previewItems: RunCardProcessItem[];
  activeInteraction: RunCardInteraction | null;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  source: 'official-history' | 'sdk-live' | 'mixed' | 'fallback';
};

export type ConversationRound = {
  id: string;
  sessionId: string;
  userMessage: {
    id: string;
    sessionId: string;
    content: string;
    timestamp: string;
  };
  assistantCard: AssistantCardViewModel;
};
```

- [ ] **Step 4: 新增最小 round 投影实现**

```ts
import type { ConversationTurn } from '../types/conversationTurn.ts';
import type { ConversationRound, AssistantCardViewModel } from '../types/conversationRound.ts';
import { assistantTurnToRunCard } from '../types/conversationTurn.ts';

type ProjectConversationRoundsInput = {
  sessionId: string | null;
  conversationTurns: ConversationTurn[];
};

function previewLastFive(processItems: AssistantCardViewModel['processItems']) {
  return processItems.slice(-5);
}

export function projectConversationRounds({
  sessionId,
  conversationTurns,
}: ProjectConversationRoundsInput): ConversationRound[] {
  const rounds: ConversationRound[] = [];
  let currentRound: ConversationRound | null = null;

  for (const turn of conversationTurns) {
    if (turn.kind === 'user') {
      currentRound = {
        id: `${sessionId || turn.sessionId}:${turn.id}`,
        sessionId: sessionId || turn.sessionId,
        userMessage: {
          id: turn.id,
          sessionId: turn.sessionId,
          content: turn.content,
          timestamp: turn.timestamp,
        },
        assistantCard: {
          id: `${sessionId || turn.sessionId}:pending:${turn.id}`,
          sessionId: sessionId || turn.sessionId,
          runId: null,
          anchorMessageId: turn.id,
          status: 'queued',
          headline: '正在启动',
          responseSegments: [],
          processItems: [],
          previewItems: [],
          activeInteraction: null,
          startedAt: turn.timestamp,
          updatedAt: turn.timestamp,
          completedAt: null,
          source: 'fallback',
        },
      };
      rounds.push(currentRound);
      continue;
    }

    if (!currentRound || currentRound.userMessage.id !== turn.anchorMessageId) {
      continue;
    }

    const card = assistantTurnToRunCard(turn);
    currentRound.assistantCard = {
      id: turn.id,
      sessionId: turn.sessionId,
      runId: turn.runId,
      anchorMessageId: turn.anchorMessageId,
      status: turn.status,
      headline: turn.headline,
      responseSegments: turn.bodySegments,
      processItems: turn.activityItems,
      previewItems: previewLastFive(turn.activityItems),
      activeInteraction: turn.activeInteraction,
      startedAt: turn.startedAt,
      updatedAt: turn.updatedAt,
      completedAt: turn.completedAt,
      source: turn.source,
    };
  }

  return rounds;
}
```

- [ ] **Step 5: 运行测试，确认 round 基础模型通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/projection/projectConversationRounds.test.mjs`

Expected: PASS，输出 `1 passed`

- [ ] **Step 6: 提交 round 模型基础**

```bash
git add src/components/chat/types/conversationRound.ts src/components/chat/projection/projectConversationRounds.ts src/components/chat/projection/projectConversationRounds.test.mjs
git commit -m "feat: add conversation round projection model"
```

## Task 2: 把运行中累加、封口和预览规则收进 round 投影

**Files:**
- Modify: `src/components/chat/projection/projectConversationRounds.ts`
- Modify: `src/components/chat/projection/projectConversationTurns.ts`
- Test: `src/components/chat/projection/projectConversationRounds.test.mjs`
- Test: `src/components/chat/projection/projectConversationTurns.test.mjs`

- [ ] **Step 1: 写失败测试，锁定阶段性回复累加和最近 5 条过程预览**

```js
test('projectConversationRounds accumulates phase responses into one assistant card and previews only the latest five process items', () => {
  const rounds = projectConversationRounds({
    sessionId: 'sess-2',
    conversationTurns: [
      { kind: 'user', id: 'user-1', sessionId: 'sess-2', content: '帮我做事', timestamp: '2026-04-26T10:10:00.000Z', source: 'transient' },
      {
        kind: 'assistant',
        id: 'assistant-1',
        sessionId: 'sess-2',
        runId: 'run-2',
        anchorMessageId: 'user-1',
        status: 'running',
        headline: '执行中',
        activityItems: Array.from({ length: 7 }, (_, index) => ({
          id: `item-${index + 1}`,
          timestamp: `2026-04-26T10:10:0${index}.000Z`,
          kind: 'session_status',
          title: '会话状态',
          body: `状态 ${index + 1}`,
        })),
        bodySegments: [
          { id: 'seg-1', timestamp: '2026-04-26T10:10:02.000Z', kind: 'phase', body: '先看第一步' },
          { id: 'seg-2', timestamp: '2026-04-26T10:10:04.000Z', kind: 'phase', body: '现在做第二步' },
        ],
        activeInteraction: null,
        startedAt: '2026-04-26T10:10:01.000Z',
        updatedAt: '2026-04-26T10:10:07.000Z',
        completedAt: null,
        source: 'sdk-live',
      },
    ],
  });

  assert.equal(rounds[0].assistantCard.responseSegments.length, 2);
  assert.deepEqual(rounds[0].assistantCard.previewItems.map((item) => item.id), [
    'item-3', 'item-4', 'item-5', 'item-6', 'item-7',
  ]);
});
```

- [ ] **Step 2: 写失败测试，锁定下一轮开始时上一轮封口**

```js
test('projectConversationRounds does not let an earlier assistant card absorb content after the next user turn starts', () => {
  const rounds = projectConversationRounds({
    sessionId: 'sess-3',
    conversationTurns: [
      { kind: 'user', id: 'user-1', sessionId: 'sess-3', content: '111', timestamp: '2026-04-26T10:20:00.000Z', source: 'transient' },
      {
        kind: 'assistant',
        id: 'assistant-1',
        sessionId: 'sess-3',
        runId: 'run-3',
        anchorMessageId: 'user-1',
        status: 'completed',
        headline: '已完成',
        activityItems: [],
        bodySegments: [{ id: 'seg-1', timestamp: '2026-04-26T10:20:02.000Z', kind: 'final', body: '第一轮回复' }],
        activeInteraction: null,
        startedAt: '2026-04-26T10:20:01.000Z',
        updatedAt: '2026-04-26T10:20:02.000Z',
        completedAt: '2026-04-26T10:20:02.000Z',
        source: 'mixed',
      },
      { kind: 'user', id: 'user-2', sessionId: 'sess-3', content: '222', timestamp: '2026-04-26T10:20:03.000Z', source: 'transient' },
    ],
  });

  assert.equal(rounds.length, 2);
  assert.equal(rounds[0].assistantCard.responseSegments.at(-1)?.body, '第一轮回复');
  assert.equal(rounds[1].assistantCard.anchorMessageId, 'user-2');
});
```

- [ ] **Step 3: 运行测试，确认当前最小实现不足**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/projection/projectConversationRounds.test.mjs src/components/chat/projection/projectConversationTurns.test.mjs`

Expected: FAIL，提示 previewItems 或 round 封口断言不满足

- [ ] **Step 4: 扩展 round 投影输入，明确上游来源**

```ts
type ProjectConversationRoundsInput = {
  sessionId: string | null;
  conversationTurns: ConversationTurn[];
  fallbackRunCards?: Array<{
    anchorMessageId: string;
    sessionId: string;
    cardStatus: string;
    headline: string;
    responseMessages?: Array<{ id: string; kind: 'phase' | 'final'; body: string; timestamp: string }>;
    processItems: AssistantCardViewModel['processItems'];
    activeInteraction: AssistantCardViewModel['activeInteraction'];
    startedAt: string | null;
    updatedAt: string | null;
    completedAt: string | null;
    source: AssistantCardViewModel['source'];
  }>;
};
```

- [ ] **Step 5: 在投影里实现单卡累加和 fallback 只补入当前轮**

```ts
function toAssistantCardFromFallback(card, currentCard) {
  if (!card || currentCard.anchorMessageId !== card.anchorMessageId) {
    return currentCard;
  }

  return {
    ...currentCard,
    status: card.cardStatus === 'waiting_for_input' ? 'waiting_for_input' : currentCard.status,
    headline: card.headline || currentCard.headline,
    responseSegments: Array.isArray(card.responseMessages) && card.responseMessages.length > 0
      ? card.responseMessages
      : currentCard.responseSegments,
    processItems: card.processItems.length > 0 ? card.processItems : currentCard.processItems,
    previewItems: previewLastFive(card.processItems.length > 0 ? card.processItems : currentCard.processItems),
    activeInteraction: card.activeInteraction || currentCard.activeInteraction,
    startedAt: card.startedAt || currentCard.startedAt,
    updatedAt: card.updatedAt || currentCard.updatedAt,
    completedAt: card.completedAt || currentCard.completedAt,
    source: currentCard.source === card.source ? currentCard.source : 'mixed',
  };
}
```

- [ ] **Step 6: 运行测试，确认累加和封口规则通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/projection/projectConversationRounds.test.mjs src/components/chat/projection/projectConversationTurns.test.mjs`

Expected: PASS，输出 round 测试和 turn 测试全部通过

- [ ] **Step 7: 提交 round 投影规则**

```bash
git add src/components/chat/projection/projectConversationRounds.ts src/components/chat/projection/projectConversationRounds.test.mjs src/components/chat/projection/projectConversationTurns.ts src/components/chat/projection/projectConversationTurns.test.mjs
git commit -m "feat: enforce single assistant card round rules"
```

## Task 3: 收口 ChatInterface，只把统一 round 模型交给渲染层

**Files:**
- Modify: `src/components/chat/view/ChatInterface.tsx`
- Modify: `src/components/chat/view/agentV2Realtime.test.mjs`

- [ ] **Step 1: 写失败测试，锁定 ChatInterface 不再把多套主渲染模型直接交给 pane**

```js
test('ChatInterface passes conversationRounds as the primary render source', async () => {
  const source = await readFile(new URL('./ChatInterface.tsx', import.meta.url), 'utf8');

  assert.match(source, /projectConversationRounds/);
  assert.match(source, /const conversationRounds = React\\.useMemo\\(/);
  assert.match(source, /conversationRounds=\\{conversationRounds\\}/);
  assert.doesNotMatch(source, /runCards=\\{conversationTurns\\.length > 0 \\? \\[\\] : runCardsWithPendingFallback\\}/);
});
```

- [ ] **Step 2: 运行测试，确认当前仍走混合交接**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/agentV2Realtime.test.mjs`

Expected: FAIL，断言仍命中旧 `runCards + conversationTurns` 交接

- [ ] **Step 3: 在 ChatInterface 中计算统一 round 列表**

```ts
import { projectConversationRounds } from '../projection/projectConversationRounds.ts';

const fallbackRunCardsForRounds = hasAssistantConversationTurn ? [] : runCardsWithPendingFallback;

const conversationRounds = React.useMemo(
  () => projectConversationRounds({
    sessionId: activeAgentSessionId,
    conversationTurns,
    fallbackRunCards: fallbackRunCardsForRounds,
  }),
  [activeAgentSessionId, conversationTurns, fallbackRunCardsForRounds],
);
```

- [ ] **Step 4: 把“完成但无 assistant surface”的恢复条件改为 round 语义**

```ts
const hasVisibleAssistantCard = conversationRounds.some((round) => (
  round.assistantCard.responseSegments.length > 0
  || round.assistantCard.processItems.length > 0
  || Boolean(round.assistantCard.activeInteraction)
));

if (
  !activeAgentSessionId
  || composerState.status !== 'completed'
  || hasVisibleAssistantCard
  || historicalAgentConversation.isLoading
  || historicalAgentConversation.error
  || agentConversation.hasBlockingDecision
) {
  return;
}
```

- [ ] **Step 5: 运行测试，确认交接逻辑通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/agentV2Realtime.test.mjs`

Expected: PASS，关于 round 主交接和恢复逻辑的断言通过

- [ ] **Step 6: 提交 ChatInterface 收口**

```bash
git add src/components/chat/view/ChatInterface.tsx src/components/chat/view/agentV2Realtime.test.mjs
git commit -m "refactor: route chat runtime through conversation rounds"
```

## Task 4: 简化 ChatMessagesPane，只渲染 round 列表

**Files:**
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`

- [ ] **Step 1: 写失败测试，锁定顶层渲染输出固定为 user bubble -> assistant card**

```js
test('ChatMessagesPane renders each round as one user bubble followed by one assistant card', () => {
  const markup = renderPane({
    isLoading: false,
    conversationRounds: [
      {
        id: 'round-1',
        sessionId: 'sess-1',
        userMessage: {
          id: 'user-1',
          sessionId: 'sess-1',
          content: '111',
          timestamp: '2026-04-26T10:30:00.000Z',
        },
        assistantCard: {
          id: 'assistant-1',
          sessionId: 'sess-1',
          runId: 'run-1',
          anchorMessageId: 'user-1',
          status: 'completed',
          headline: '已完成',
          responseSegments: [
            { id: 'seg-1', kind: 'final', body: '你好，有什么我可以帮你的吗？', timestamp: '2026-04-26T10:30:02.000Z' },
          ],
          processItems: [],
          previewItems: [],
          activeInteraction: null,
          startedAt: '2026-04-26T10:30:01.000Z',
          updatedAt: '2026-04-26T10:30:02.000Z',
          completedAt: '2026-04-26T10:30:02.000Z',
          source: 'mixed',
        },
      },
    ],
  });

  assert.match(markup, /data-message-component=\"true\"[^>]*>111/);
  assert.equal((markup.match(/data-run-card=\"true\"/g) || []).length, 1);
  assert.match(markup, /已完成 :: 你好，有什么我可以帮你的吗？/);
});
```

- [ ] **Step 2: 写失败测试，锁定运行中主卡只显示最近 5 条过程**

```js
test('ChatMessagesPane passes previewItems to the assistant card instead of full processItems in the main list', () => {
  const markup = renderPane({
    isLoading: false,
    conversationRounds: [
      {
        id: 'round-2',
        sessionId: 'sess-2',
        userMessage: {
          id: 'user-2',
          sessionId: 'sess-2',
          content: '222',
          timestamp: '2026-04-26T10:40:00.000Z',
        },
        assistantCard: {
          id: 'assistant-2',
          sessionId: 'sess-2',
          runId: 'run-2',
          anchorMessageId: 'user-2',
          status: 'running',
          headline: '执行中',
          responseSegments: [],
          processItems: Array.from({ length: 6 }, (_, index) => ({
            id: `full-${index + 1}`,
            timestamp: `2026-04-26T10:40:0${index}.000Z`,
            kind: 'session_status',
            title: '会话状态',
            body: `状态 ${index + 1}`,
          })),
          previewItems: Array.from({ length: 5 }, (_, index) => ({
            id: `preview-${index + 2}`,
            timestamp: `2026-04-26T10:40:0${index + 1}.000Z`,
            kind: 'session_status',
            title: '会话状态',
            body: `状态 ${index + 2}`,
          })),
          activeInteraction: null,
          startedAt: '2026-04-26T10:40:01.000Z',
          updatedAt: '2026-04-26T10:40:06.000Z',
          completedAt: null,
          source: 'sdk-live',
        },
      },
    ],
  });

  assert.doesNotMatch(markup, /状态 1/);
});
```

- [ ] **Step 3: 运行测试，确认 pane 仍自行拼多套模型**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`

Expected: FAIL，现有实现仍依赖 `conversationTurns`、`runCards` 和 legacy message 裁剪

- [ ] **Step 4: 给 ChatMessagesPane 增加 `conversationRounds` 输入并改主渲染**

```ts
import type { ConversationRound } from '../../types/conversationRound.ts';

interface ChatMessagesPaneProps {
  // ...
  conversationRounds?: ConversationRound[];
}

const useConversationRounds = conversationRounds.length > 0;

const renderConversationRound = (round: ConversationRound) => (
  <React.Fragment key={round.id}>
    <MessageComponent
      messageKey={round.userMessage.id}
      message={{
        id: round.userMessage.id,
        messageId: round.userMessage.id,
        sessionId: round.userMessage.sessionId,
        type: 'user',
        content: round.userMessage.content,
        timestamp: round.userMessage.timestamp,
        normalizedKind: 'text',
      }}
      prevMessage={null}
      createDiff={createDiff}
      onFileOpen={onFileOpen}
      onOpenUrl={onOpenUrl}
      onShowSettings={onShowSettings}
      onGrantToolPermission={onGrantToolPermission}
      autoExpandTools={autoExpandTools}
      showRawParameters={showRawParameters}
      showThinking={showThinking}
      selectedProject={selectedProject}
      provider="claude"
    />
    <RunCardView
      card={{
        sessionId: round.assistantCard.sessionId,
        anchorMessageId: round.assistantCard.anchorMessageId,
        cardStatus: round.assistantCard.status,
        headline: round.assistantCard.headline,
        finalResponse: round.assistantCard.responseSegments.at(-1)?.body || '',
        responseMessages: round.assistantCard.responseSegments,
        processItems: round.assistantCard.previewItems,
        activeInteraction: round.assistantCard.activeInteraction,
        startedAt: round.assistantCard.startedAt,
        updatedAt: round.assistantCard.updatedAt,
        completedAt: round.assistantCard.completedAt,
        defaultExpanded: round.assistantCard.status === 'running' || round.assistantCard.status === 'starting',
        source: round.assistantCard.source,
      }}
      interactionNode={renderRunCardInteraction({
        sessionId: round.assistantCard.sessionId,
        anchorMessageId: round.assistantCard.anchorMessageId,
        cardStatus: round.assistantCard.status,
        headline: round.assistantCard.headline,
        finalResponse: round.assistantCard.responseSegments.at(-1)?.body || '',
        responseMessages: round.assistantCard.responseSegments,
        processItems: round.assistantCard.processItems,
        activeInteraction: round.assistantCard.activeInteraction,
        startedAt: round.assistantCard.startedAt,
        updatedAt: round.assistantCard.updatedAt,
        completedAt: round.assistantCard.completedAt,
        defaultExpanded: round.assistantCard.status === 'running' || round.assistantCard.status === 'starting',
        source: round.assistantCard.source,
      })}
    />
  </React.Fragment>
);
```

- [ ] **Step 5: 暂时保留旧 props 但让其只作为空场景兜底**

```ts
const shouldUseLegacyPath = !useConversationRounds && conversationTurns.length === 0 && runCards.length === 0;
```

要求：

- round 存在时，旧 `conversationTurns + runCards + fallback` 不再参与顶层列表拼装
- 旧路径只用于极少量老测试和空数据态兜底

- [ ] **Step 6: 运行测试，确认 pane 渲染规则通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`

Expected: PASS，关于“一发一回”和过程预览的断言通过

- [ ] **Step 7: 提交 pane 简化**

```bash
git add src/components/chat/view/subcomponents/ChatMessagesPane.tsx src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs
git commit -m "refactor: render chat runtime from conversation rounds"
```

## Task 5: 补齐刷新恢复和子代理/交互回归

**Files:**
- Modify: `src/components/chat/projection/projectRunCards.ts`
- Modify: `src/components/chat/components/RunCard.tsx`
- Modify: `src/components/chat/projection/projectRunCards.test.mjs`
- Modify: `src/hooks/chat/useChatRealtimeHandlers.test.mjs`
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`

- [ ] **Step 1: 写失败测试，锁定子代理过程仍进入同一张卡**

```js
test('projectConversationRounds keeps subagent progress inside the same assistant card process list', () => {
  const rounds = projectConversationRounds({
    sessionId: 'sess-subagent',
    conversationTurns: [
      { kind: 'user', id: 'user-1', sessionId: 'sess-subagent', content: '帮我分析', timestamp: '2026-04-26T11:00:00.000Z', source: 'transient' },
      {
        kind: 'assistant',
        id: 'assistant-1',
        sessionId: 'sess-subagent',
        runId: 'run-subagent',
        anchorMessageId: 'user-1',
        status: 'running',
        headline: '执行中',
        activityItems: [
          { id: 'task-1', timestamp: '2026-04-26T11:00:02.000Z', kind: 'subagent_progress', title: '子代理进度', body: 'worker A started' },
        ],
        bodySegments: [],
        activeInteraction: null,
        startedAt: '2026-04-26T11:00:01.000Z',
        updatedAt: '2026-04-26T11:00:02.000Z',
        completedAt: null,
        source: 'sdk-live',
      },
    ],
  });

  assert.equal(rounds[0].assistantCard.processItems[0].kind, 'subagent_progress');
});
```

- [ ] **Step 2: 写失败测试，锁定 waiting-for-input 不再长出第二块主展示面**

```js
test('ChatMessagesPane renders interactive waiting state inside the same assistant card', () => {
  const markup = renderPane({
    isLoading: false,
    conversationRounds: [
      {
        id: 'round-waiting',
        sessionId: 'sess-waiting',
        userMessage: {
          id: 'user-1',
          sessionId: 'sess-waiting',
          content: '继续',
          timestamp: '2026-04-26T11:10:00.000Z',
        },
        assistantCard: {
          id: 'assistant-1',
          sessionId: 'sess-waiting',
          runId: 'run-waiting',
          anchorMessageId: 'user-1',
          status: 'waiting_for_input',
          headline: '等待你的回答',
          responseSegments: [],
          processItems: [],
          previewItems: [],
          activeInteraction: {
            requestId: 'req-1',
            kind: 'interactive_prompt',
            toolName: 'AskUserQuestion',
            message: '请确认',
            input: null,
            context: null,
            payload: null,
          },
          startedAt: '2026-04-26T11:10:01.000Z',
          updatedAt: '2026-04-26T11:10:02.000Z',
          completedAt: null,
          source: 'mixed',
        },
      },
    ],
  });

  assert.equal((markup.match(/data-run-card=\"true\"/g) || []).length, 1);
  assert.equal((markup.match(/data-run-card-interaction=\"true\"/g) || []).length, 1);
});
```

- [ ] **Step 3: 运行测试，确认子代理和 waiting 语义未回退**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/projection/projectRunCards.test.mjs src/hooks/chat/useChatRealtimeHandlers.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`

Expected: FAIL，如果当前实现仍把 waiting/request 作为平行展示面

- [ ] **Step 4: 调整 RunCard 主列表与弹框的职责边界**

```ts
const processPreviewItems = useMemo(
  () => card.processItems.slice(-5),
  [card.processItems],
);

const timelineItems = useMemo(
  () => card.fullProcessItems || card.processItems,
  [card.fullProcessItems, card.processItems],
);
```

要求：

- 主卡显示最近 5 条
- 弹框时间线读取完整过程
- 子代理过程和 waiting interaction 仍属于同一张 card

- [ ] **Step 5: 运行完整回归**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/projection/projectConversationRounds.test.mjs src/components/chat/projection/projectConversationTurns.test.mjs src/components/chat/projection/projectRunCards.test.mjs src/hooks/chat/useChatRealtimeHandlers.test.mjs src/components/chat/view/agentV2Realtime.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs && npm run typecheck`

Expected:

- Node tests: 全部 PASS
- `npm run typecheck`: exit `0`

- [ ] **Step 6: 提交刷新恢复与交互收口**

```bash
git add src/components/chat/projection/projectRunCards.ts src/components/chat/components/RunCard.tsx src/components/chat/projection/projectRunCards.test.mjs src/hooks/chat/useChatRealtimeHandlers.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs src/components/chat/projection/projectConversationRounds.ts src/components/chat/projection/projectConversationRounds.test.mjs
git commit -m "fix: keep runtime chat to one assistant card per user turn"
```

## 自检

### Spec coverage

- “一个发送，一个回复卡”：Task 1、Task 3、Task 4 覆盖
- “阶段性回复累加到同一卡”：Task 2 覆盖
- “运行中默认最多展示 5 条过程，可弹框查看更多”：Task 2、Task 5 覆盖
- “子代理、工具、交互都归到同一卡”：Task 2、Task 5 覆盖
- “下一轮消息出现时上一轮封口”：Task 2 覆盖
- “刷新前后同构”：Task 3、Task 5 覆盖
- “无正文时卡不消失”：Task 1、Task 3 覆盖

### Placeholder scan

- 本计划没有使用 `TODO`、`TBD`、`implement later`、`add appropriate error handling` 这类占位表述
- 每个代码步骤都给出示例代码
- 每个验证步骤都给出具体命令和预期

### Type consistency

- 统一使用 `ConversationRound`、`AssistantCardViewModel`、`AssistantResponseSegment`
- round 渲染路径统一使用 `conversationRounds`
- 不再在后续任务中引入第二套命名
