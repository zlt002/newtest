# Chat UI Rendering Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将聊天主视图收敛为唯一的 `UserTurn + AssistantTurn` 渲染模型，消除 legacy message、历史 RunCard、实时 RunCard、transient fallback 混合导致的替换、重复和老样式泄漏。

**Architecture:** 新增 `projectConversationTurns(...)` 作为主 UI 唯一投影出口，统一消费 canonical history、transient messages、realtime events 和 pending requests。`ChatInterface` 只向 `ChatMessagesPane` 传 `ConversationTurn[]`，`ChatMessagesPane` 只负责渲染 turn，不再自行裁剪 assistant 或合成 RunCard。现有 `RunCard` 先作为 `AssistantTurn` 的视觉承载组件复用，后续再清理旧 helper。

**Tech Stack:** React、TypeScript、Node test runner、现有 `chat-v2` projection/store/types、现有 tsx loader 测试工具。

---

## File Structure

- Create: `src/components/chat-v2/types/conversationTurn.ts`
  - Defines `ConversationTurn`, `UserTurnViewModel`, `AssistantTurnViewModel`, `RuntimeActivityItem`, and helpers for converting assistant turns to existing `RunCard`.
- Create: `src/components/chat-v2/projection/projectConversationTurns.ts`
  - Single projection entry point for main chat UI.
  - Internally may reuse `projectHistoricalRunCards(...)`, `projectLiveRunCards(...)`, and `projectHistoricalChatMessages(...)`, but only this file returns top-level chat turns.
- Test: `src/components/chat-v2/projection/projectConversationTurns.test.mjs`
  - Covers identity, historical/live merge, multi-round stability, protocol noise filtering, pending interactions.
- Modify: `src/components/chat-v2/types/runCard.ts`
  - Allows `source: 'mixed' | 'fallback'` during migration, or narrows conversion so `RunCard` remains compatible.
- Modify: `src/components/chat-v2/components/RunCard.tsx`
  - Minimal change only if needed to accept migrated source/status data. Keep visual behavior stable.
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
  - Replaces `chatMessages + visibleMessages + runCards` main path with `conversationTurns`.
  - Removes or disables `trimLegacyAssistantMessages(...)` and `buildTransientAssistantRunCard(...)` from the main path.
- Test: `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`
  - Verifies pane renders only turns and does not call legacy assistant/tool main path for assistant turns.
- Modify: `src/components/chat/view/ChatInterface.tsx`
  - Computes `conversationTurns` using the single projection and passes it to `ChatMessagesPane`.
  - Stops passing `runCardsWithPendingFallback` as the main render source.
- Test: `src/components/chat/view/agentV2Realtime.test.mjs`
  - Updates source-level guards to require `projectConversationTurns`.
- Modify: `src/components/chat/view/agentComposerState.ts`
  - Clamps composer label to short status text.
- Test: `src/components/chat/view/agentComposerState.test.mjs`
  - Covers long assistant text not leaking into composer status.
- Modify: `src/components/chat/tools/README.md`
  - Documents that `ToolRenderer` is no longer the default main chat rendering path.

---

### Task 1: Define Conversation Turn Types

**Files:**
- Create: `src/components/chat-v2/types/conversationTurn.ts`
- Modify: `src/components/chat-v2/types/runCard.ts`
- Test: `src/components/chat-v2/projection/projectConversationTurns.test.mjs`

- [ ] **Step 1: Write the failing type/projection smoke test**

Create `src/components/chat-v2/projection/projectConversationTurns.test.mjs` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { projectConversationTurns } from './projectConversationTurns.ts';

test('projectConversationTurns projects one user turn and one assistant turn from canonical history', () => {
  const turns = projectConversationTurns({
    sessionId: 'sess-1',
    historicalMessages: [
      {
        id: 'user-1',
        sessionId: 'sess-1',
        role: 'user',
        text: '请总结这段代码',
        timestamp: '2026-04-24T01:00:00.000Z',
        kind: 'message',
        type: 'message',
      },
      {
        id: 'assistant-1',
        sessionId: 'sess-1',
        role: 'assistant',
        text: '这是总结结果',
        timestamp: '2026-04-24T01:00:01.000Z',
        kind: 'message',
        type: 'message',
      },
    ],
    transientMessages: [],
    realtimeEvents: [],
    pendingPermissionRequests: [],
    isLoading: false,
  });

  assert.equal(turns.length, 2);
  assert.equal(turns[0].kind, 'user');
  assert.equal(turns[0].content, '请总结这段代码');
  assert.equal(turns[1].kind, 'assistant');
  assert.equal(turns[1].anchorMessageId, 'user-1');
  assert.equal(turns[1].status, 'completed');
  assert.deepEqual(
    turns[1].bodySegments.map((segment) => [segment.kind, segment.body]),
    [['final', '这是总结结果']],
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/projectConversationTurns.test.mjs
```

Expected: FAIL with `Cannot find module './projectConversationTurns.ts'`.

- [ ] **Step 3: Add conversation turn types**

Create `src/components/chat-v2/types/conversationTurn.ts`:

```ts
import type {
  RunCard,
  RunCardInteraction,
  RunCardProcessItem,
  RunCardResponseMessage,
  RunCardStatus,
} from './runCard.ts';

export type ConversationTurn = UserTurnViewModel | AssistantTurnViewModel;

export type UserTurnViewModel = {
  kind: 'user';
  id: string;
  sessionId: string;
  content: string;
  timestamp: string;
};

export type AssistantTurnSource = 'official-history' | 'sdk-live' | 'mixed' | 'fallback';

export type RuntimeActivityItem = RunCardProcessItem;

export type AssistantBodySegment = RunCardResponseMessage;

export type AssistantTurnViewModel = {
  kind: 'assistant';
  id: string;
  sessionId: string;
  runId: string | null;
  anchorMessageId: string;
  status: RunCardStatus;
  headline: string;
  activityItems: RuntimeActivityItem[];
  bodySegments: AssistantBodySegment[];
  activeInteraction: RunCardInteraction | null;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  source: AssistantTurnSource;
};

export function assistantTurnToRunCard(turn: AssistantTurnViewModel): RunCard {
  const finalSegment = [...turn.bodySegments]
    .reverse()
    .find((segment) => segment.kind === 'final' && String(segment.body || '').trim());

  return {
    sessionId: turn.sessionId,
    anchorMessageId: turn.anchorMessageId,
    cardStatus: turn.status,
    headline: turn.headline,
    finalResponse: finalSegment?.body || '',
    responseMessages: turn.bodySegments,
    processItems: turn.activityItems,
    activeInteraction: turn.activeInteraction,
    startedAt: turn.startedAt,
    updatedAt: turn.updatedAt,
    completedAt: turn.completedAt,
    defaultExpanded: turn.source === 'sdk-live',
    source: turn.source,
  };
}
```

- [ ] **Step 4: Widen RunCard source for migration**

Modify `src/components/chat-v2/types/runCard.ts`:

```ts
export type RunCardSource =
  | 'official-history'
  | 'sdk-live'
  | 'mixed'
  | 'fallback';
```

Then replace the `RunCard.source` field:

```ts
  source: RunCardSource;
```

- [ ] **Step 5: Add minimal projection implementation**

Create `src/components/chat-v2/projection/projectConversationTurns.ts`:

```ts
import type { ChatMessage, PendingPermissionRequest } from '../../chat/types/types';
import type { AgentRealtimeEvent } from './projectLiveSdkFeed.ts';
import { projectHistoricalChatMessages } from './projectHistoricalChatMessages.ts';
import { projectHistoricalRunCards } from './projectRunCards.ts';
import type { CanonicalSessionMessage } from '../types/sessionHistory.ts';
import type {
  AssistantTurnViewModel,
  ConversationTurn,
  UserTurnViewModel,
} from '../types/conversationTurn.ts';

type ProjectConversationTurnsInput = {
  sessionId: string | null;
  historicalMessages: CanonicalSessionMessage[];
  transientMessages: ChatMessage[];
  realtimeEvents: AgentRealtimeEvent[];
  pendingPermissionRequests: PendingPermissionRequest[];
  isLoading: boolean;
};

function getMessageId(message: ChatMessage) {
  return String(message.id || message.messageId || '').trim();
}

function toUserTurn(message: ChatMessage): UserTurnViewModel | null {
  const id = getMessageId(message);
  const content = String(message.content || '').trim();
  if (!id || !content) {
    return null;
  }

  return {
    kind: 'user',
    id,
    sessionId: String(message.sessionId || ''),
    content,
    timestamp: String(message.timestamp || ''),
  };
}

function toAssistantTurn(card: ReturnType<typeof projectHistoricalRunCards>[number]): AssistantTurnViewModel {
  const responseMessages = Array.isArray(card.responseMessages) ? card.responseMessages : [];
  const bodySegments = responseMessages.length > 0
    ? responseMessages
    : String(card.finalResponse || '').trim()
      ? [{
          id: `${card.anchorMessageId || card.sessionId || 'assistant'}-final`,
          timestamp: card.completedAt || card.updatedAt || card.startedAt || '',
          kind: 'final' as const,
          body: String(card.finalResponse || '').trim(),
        }]
      : [];

  return {
    kind: 'assistant',
    id: `${card.sessionId || 'session'}:${card.anchorMessageId || card.startedAt || card.updatedAt || 'assistant'}`,
    sessionId: card.sessionId,
    runId: null,
    anchorMessageId: card.anchorMessageId,
    status: card.cardStatus,
    headline: card.headline,
    activityItems: card.processItems,
    bodySegments,
    activeInteraction: card.activeInteraction,
    startedAt: card.startedAt,
    updatedAt: card.updatedAt,
    completedAt: card.completedAt,
    source: card.source,
  };
}

export function projectConversationTurns({
  historicalMessages,
  transientMessages,
}: ProjectConversationTurnsInput): ConversationTurn[] {
  const historicalChatMessages = projectHistoricalChatMessages(historicalMessages);
  const historicalUserTurns = historicalChatMessages
    .filter((message) => message.type === 'user')
    .map(toUserTurn)
    .filter((turn): turn is UserTurnViewModel => Boolean(turn));

  const transientUserTurns = transientMessages
    .filter((message) => message.type === 'user')
    .map(toUserTurn)
    .filter((turn): turn is UserTurnViewModel => Boolean(turn));

  const userTurnsById = new Map<string, UserTurnViewModel>();
  for (const turn of [...historicalUserTurns, ...transientUserTurns]) {
    userTurnsById.set(turn.id, turn);
  }

  const assistantTurns = projectHistoricalRunCards(historicalMessages).map(toAssistantTurn);
  const turns: ConversationTurn[] = [...userTurnsById.values(), ...assistantTurns];

  return turns.sort((left, right) => {
    const leftTime = Date.parse(String(left.timestamp || ('startedAt' in left ? left.startedAt : '') || ''));
    const rightTime = Date.parse(String(right.timestamp || ('startedAt' in right ? right.startedAt : '') || ''));
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return 0;
  });
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/projectConversationTurns.test.mjs
```

Expected: PASS for the smoke test.

- [ ] **Step 7: Run existing RunCard projection tests**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/projectRunCards.test.mjs
```

Expected: PASS. If TypeScript complains about `RunCard.source`, confirm `RunCardSource` includes existing values and migration values.

- [ ] **Step 8: Commit**

```bash
git add src/components/chat-v2/types/conversationTurn.ts src/components/chat-v2/types/runCard.ts src/components/chat-v2/projection/projectConversationTurns.ts src/components/chat-v2/projection/projectConversationTurns.test.mjs
git commit -m "feat: add unified conversation turn projection"
```

---

### Task 2: Add Live, Pending, and Multi-Round Merge Rules

**Files:**
- Modify: `src/components/chat-v2/projection/projectConversationTurns.ts`
- Test: `src/components/chat-v2/projection/projectConversationTurns.test.mjs`

- [ ] **Step 1: Add a regression test for second-round stability**

Append to `src/components/chat-v2/projection/projectConversationTurns.test.mjs`:

```js
test('projectConversationTurns keeps the first assistant turn when a second round starts', () => {
  const turns = projectConversationTurns({
    sessionId: 'sess-2',
    historicalMessages: [
      {
        id: 'user-1',
        sessionId: 'sess-2',
        role: 'user',
        text: '第一轮，请返回很多内容',
        timestamp: '2026-04-24T02:00:00.000Z',
        kind: 'message',
        type: 'message',
      },
      {
        id: 'assistant-1',
        sessionId: 'sess-2',
        role: 'assistant',
        text: '第一轮长回复',
        timestamp: '2026-04-24T02:00:05.000Z',
        kind: 'message',
        type: 'message',
      },
      {
        id: 'user-2',
        sessionId: 'sess-2',
        role: 'user',
        text: '111',
        timestamp: '2026-04-24T02:01:00.000Z',
        kind: 'message',
        type: 'message',
      },
    ],
    transientMessages: [],
    realtimeEvents: [
      {
        id: 'evt-2-start',
        sessionId: 'sess-2',
        runId: 'run-2',
        timestamp: '2026-04-24T02:01:01.000Z',
        type: 'sdk.message',
        message: {
          kind: 'stream_delta',
          text: '第二轮回复',
        },
      },
    ],
    pendingPermissionRequests: [],
    isLoading: true,
  });

  const assistantTurns = turns.filter((turn) => turn.kind === 'assistant');
  assert.equal(assistantTurns.length, 2);
  assert.equal(assistantTurns[0].anchorMessageId, 'user-1');
  assert.equal(assistantTurns[0].bodySegments.at(-1)?.body, '第一轮长回复');
  assert.equal(assistantTurns[1].anchorMessageId, 'user-2');
  assert.equal(assistantTurns[1].bodySegments.at(-1)?.body, '第二轮回复');
});
```

- [ ] **Step 2: Add a pending request merge test**

Append:

```js
test('projectConversationTurns attaches pending permission request to the active assistant turn', () => {
  const turns = projectConversationTurns({
    sessionId: 'sess-permission',
    historicalMessages: [
      {
        id: 'user-1',
        sessionId: 'sess-permission',
        role: 'user',
        text: '请修改文件',
        timestamp: '2026-04-24T03:00:00.000Z',
        kind: 'message',
        type: 'message',
      },
    ],
    transientMessages: [],
    realtimeEvents: [
      {
        id: 'evt-run',
        sessionId: 'sess-permission',
        runId: 'run-permission',
        timestamp: '2026-04-24T03:00:01.000Z',
        type: 'sdk.message',
        message: {
          kind: 'thinking',
          text: '准备修改文件',
        },
      },
    ],
    pendingPermissionRequests: [
      {
        requestId: 'perm-1',
        sessionId: 'sess-permission',
        toolName: 'Edit',
        input: { file_path: '/tmp/example.ts' },
        context: '需要授权修改文件',
        receivedAt: new Date('2026-04-24T03:00:02.000Z'),
      },
    ],
    isLoading: true,
  });

  const assistantTurn = turns.find((turn) => turn.kind === 'assistant');
  assert.equal(assistantTurn?.status, 'waiting_for_input');
  assert.equal(assistantTurn?.activeInteraction?.requestId, 'perm-1');
  assert.equal(assistantTurn?.activityItems.at(-1)?.kind, 'permission_request');
});
```

- [ ] **Step 3: Add live projection helpers**

Modify `src/components/chat-v2/projection/projectConversationTurns.ts` by importing live projection:

```ts
import { projectHistoricalRunCards, projectLiveRunCards } from './projectRunCards.ts';
```

Add helpers below `toAssistantTurn(...)`:

```ts
function getTurnTime(turn: ConversationTurn) {
  const value = turn.kind === 'user'
    ? turn.timestamp
    : turn.startedAt || turn.updatedAt || turn.completedAt || '';
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function getAssistantIdentity(turn: AssistantTurnViewModel) {
  if (turn.runId) {
    return `${turn.sessionId}:run:${turn.runId}`;
  }
  if (turn.anchorMessageId) {
    return `${turn.sessionId}:anchor:${turn.anchorMessageId}`;
  }
  return `${turn.sessionId}:assistant:${turn.id}`;
}

function mergeBodySegments(left: AssistantTurnViewModel, right: AssistantTurnViewModel) {
  const byId = new Map(left.bodySegments.map((segment) => [segment.id, segment]));
  for (const segment of right.bodySegments) {
    if (!byId.has(segment.id)) {
      byId.set(segment.id, segment);
    }
  }
  return [...byId.values()];
}

function mergeActivityItems(left: AssistantTurnViewModel, right: AssistantTurnViewModel) {
  const byId = new Map(left.activityItems.map((item) => [item.id, item]));
  for (const item of right.activityItems) {
    if (!byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()];
}

function mergeAssistantTurn(left: AssistantTurnViewModel, right: AssistantTurnViewModel): AssistantTurnViewModel {
  const rightIsTerminal = right.status === 'completed' || right.status === 'failed' || right.status === 'aborted';
  return {
    ...left,
    ...right,
    status: rightIsTerminal ? right.status : left.status === 'completed' ? left.status : right.status,
    bodySegments: mergeBodySegments(left, right),
    activityItems: mergeActivityItems(left, right),
    activeInteraction: right.activeInteraction || left.activeInteraction,
    source: left.source === right.source ? left.source : 'mixed',
  };
}

function toAnchors(userTurns: UserTurnViewModel[]) {
  return userTurns.map((turn) => ({
    messageId: turn.id,
    content: turn.content,
    timestamp: turn.timestamp,
  }));
}
```

- [ ] **Step 4: Project live RunCards into assistant turns**

In `projectConversationTurns(...)`, after building `userTurnsById`, replace assistant turn creation with:

```ts
  const userTurns = [...userTurnsById.values()];
  const historicalAssistantTurns = projectHistoricalRunCards(historicalMessages).map(toAssistantTurn);
  const liveAssistantTurns = sessionId
    ? projectLiveRunCards({
        sessionId,
        anchoredUserMessages: toAnchors(userTurns),
        events: realtimeEvents,
      }).map((card) => ({
        ...toAssistantTurn(card),
        runId: realtimeEvents.find((event) => String(event.runId || '').trim())?.runId || null,
      }))
    : [];

  const assistantTurnsByIdentity = new Map<string, AssistantTurnViewModel>();
  for (const turn of [...historicalAssistantTurns, ...liveAssistantTurns]) {
    const identity = getAssistantIdentity(turn);
    const existing = assistantTurnsByIdentity.get(identity);
    assistantTurnsByIdentity.set(identity, existing ? mergeAssistantTurn(existing, turn) : turn);
  }

  const turns: ConversationTurn[] = [...userTurns, ...assistantTurnsByIdentity.values()];
```

Then replace the sort implementation with:

```ts
  return turns.sort((left, right) => {
    const leftTime = getTurnTime(left);
    const rightTime = getTurnTime(right);
    if (leftTime != null && rightTime != null && leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    if (left.kind === 'user' && right.kind === 'assistant') {
      return -1;
    }
    if (left.kind === 'assistant' && right.kind === 'user') {
      return 1;
    }
    return 0;
  });
```

- [ ] **Step 5: Add pending request merge**

Add helper:

```ts
function pendingRequestToInteraction(request: PendingPermissionRequest) {
  const kind = request.kind === 'interactive_prompt' || request.toolName === 'AskUserQuestion'
    ? 'interactive_prompt'
    : 'permission_request';

  return {
    requestId: request.requestId,
    kind,
    toolName: request.toolName || 'UnknownTool',
    message: kind === 'interactive_prompt' ? '需要你的回答' : '需要你的授权',
    input: request.input,
    context: request.context,
    payload: null,
  } as const;
}

function attachPendingRequests(
  assistantTurns: AssistantTurnViewModel[],
  pendingPermissionRequests: PendingPermissionRequest[],
  sessionId: string | null,
) {
  if (pendingPermissionRequests.length === 0) {
    return assistantTurns;
  }

  const nextTurns = [...assistantTurns];

  for (const request of pendingPermissionRequests) {
    if (request.sessionId && sessionId && request.sessionId !== sessionId) {
      continue;
    }

    const interaction = pendingRequestToInteraction(request);
    const targetIndex = nextTurns.findIndex((turn) => (
      turn.sessionId === (request.sessionId || sessionId || turn.sessionId)
      && (turn.status === 'running' || turn.status === 'waiting_for_input')
    ));
    const receivedAt = request.receivedAt instanceof Date
      ? request.receivedAt.toISOString()
      : new Date().toISOString();

    if (targetIndex >= 0) {
      const target = nextTurns[targetIndex];
      nextTurns[targetIndex] = {
        ...target,
        status: 'waiting_for_input',
        activeInteraction: interaction,
        updatedAt: receivedAt,
        activityItems: [
          ...target.activityItems,
          {
            id: request.requestId,
            timestamp: receivedAt,
            kind: interaction.kind,
            title: interaction.toolName || interaction.kind,
            body: String(interaction.message || ''),
            tone: 'warning',
          },
        ],
      };
      continue;
    }

    nextTurns.push({
      kind: 'assistant',
      id: `${request.sessionId || sessionId || 'session'}:pending:${request.requestId}`,
      sessionId: request.sessionId || sessionId || '',
      runId: null,
      anchorMessageId: '',
      status: 'waiting_for_input',
      headline: interaction.kind === 'interactive_prompt' ? '等待你的回答' : '等待授权',
      activityItems: [{
        id: request.requestId,
        timestamp: receivedAt,
        kind: interaction.kind,
        title: interaction.toolName || interaction.kind,
        body: String(interaction.message || ''),
        tone: 'warning',
      }],
      bodySegments: [],
      activeInteraction: interaction,
      startedAt: receivedAt,
      updatedAt: receivedAt,
      completedAt: null,
      source: 'fallback',
    });
  }

  return nextTurns;
}
```

Apply it before building `turns`:

```ts
  const assistantTurns = attachPendingRequests(
    [...assistantTurnsByIdentity.values()],
    pendingPermissionRequests,
    sessionId,
  );

  const turns: ConversationTurn[] = [...userTurns, ...assistantTurns];
```

- [ ] **Step 6: Run projection tests**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/projectConversationTurns.test.mjs
```

Expected: PASS, including second-round and pending request tests.

- [ ] **Step 7: Run existing projection tests**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/projectRunCards.test.mjs src/components/chat-v2/projection/projectHistoricalChatMessages.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/chat-v2/projection/projectConversationTurns.ts src/components/chat-v2/projection/projectConversationTurns.test.mjs
git commit -m "fix: merge live and pending chat turns safely"
```

---

### Task 3: Render Assistant Turns Through ChatMessagesPane

**Files:**
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
- Test: `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`

- [ ] **Step 1: Add a component test for turn-only rendering**

Append to `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`:

```js
test('ChatMessagesPane renders conversationTurns without legacy assistant MessageComponent', () => {
  const markup = renderPane({
    chatMessages: [],
    visibleMessages: [],
    isLoading: false,
    conversationTurns: [
      {
        kind: 'user',
        id: 'user-1',
        sessionId: 'sess-turns',
        content: '第一轮',
        timestamp: '2026-04-24T04:00:00.000Z',
      },
      {
        kind: 'assistant',
        id: 'assistant-1',
        sessionId: 'sess-turns',
        runId: null,
        anchorMessageId: 'user-1',
        status: 'completed',
        headline: '已完成',
        activityItems: [],
        bodySegments: [{
          id: 'assistant-1-final',
          timestamp: '2026-04-24T04:00:01.000Z',
          kind: 'final',
          body: '第一轮回复',
        }],
        activeInteraction: null,
        startedAt: '2026-04-24T04:00:00.000Z',
        updatedAt: '2026-04-24T04:00:01.000Z',
        completedAt: '2026-04-24T04:00:01.000Z',
        source: 'official-history',
      },
    ],
  });

  assert.match(markup, /第一轮/);
  assert.match(markup, /第一轮回复/);
  assert.doesNotMatch(markup, /data-message-component="true"[^>]*>第一轮回复/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs
```

Expected: FAIL because `conversationTurns` is not a supported prop or assistant turns are not rendered.

- [ ] **Step 3: Add `conversationTurns` prop and imports**

Modify `src/components/chat/view/subcomponents/ChatMessagesPane.tsx` imports:

```ts
import type { ConversationTurn } from '../../../chat-v2/types/conversationTurn.ts';
import { assistantTurnToRunCard } from '../../../chat-v2/types/conversationTurn.ts';
```

Add to `ChatMessagesPaneProps`:

```ts
  conversationTurns?: ConversationTurn[];
```

Add to function parameters:

```ts
  conversationTurns = [],
```

- [ ] **Step 4: Render conversationTurns before legacy path**

Inside `ChatMessagesPane`, after `renderStandaloneRunCard`, add:

```tsx
  const renderConversationTurn = (turn: ConversationTurn) => {
    if (turn.kind === 'user') {
      const message: ChatMessage = {
        id: turn.id,
        messageId: turn.id,
        sessionId: turn.sessionId,
        type: 'user',
        content: turn.content,
        timestamp: turn.timestamp,
        normalizedKind: 'text',
      };

      return (
        <MessageComponent
          key={turn.id}
          messageKey={turn.id}
          message={message}
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
      );
    }

    const card = assistantTurnToRunCard(turn);
    return (
      <RunCardView
        key={turn.id}
        card={card}
        interactionNode={renderRunCardInteraction(card)}
      />
    );
  };
```

Then in the JSX branch before `renderedMessages.map(...)`, add:

```tsx
          {conversationTurns.length > 0 ? (
            conversationTurns.map((turn) => renderConversationTurn(turn))
          ) : (
            <>
```

Wrap the existing `renderedMessages.map(...)` block and trailing standalone cards with the closing fragment:

```tsx
            </>
          )}
```

The `shouldShowLoadingPlaceholder` block remains before this conditional so empty running sessions still show feedback before the first turn exists.

- [ ] **Step 5: Run the pane test**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs
```

Expected: PASS for the new test and existing tests. If existing tests assert legacy behavior, keep legacy behavior active when `conversationTurns.length === 0`.

- [ ] **Step 6: Add source-level guard against transient assistant RunCard on new path**

Append to `ChatMessagesPane.test.mjs`:

```js
test('ChatMessagesPane keeps legacy transient RunCard builder out of the conversationTurns path', async () => {
  const source = await readFile(new URL('./ChatMessagesPane.tsx', import.meta.url), 'utf8');
  assert.match(source, /conversationTurns\.length > 0/);
  assert.match(source, /assistantTurnToRunCard/);
  assert.match(source, /buildTransientAssistantRunCard/);
});
```

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs
```

Expected: PASS. This guard confirms the new path exists while legacy builder remains only for fallback.

- [ ] **Step 7: Commit**

```bash
git add src/components/chat/view/subcomponents/ChatMessagesPane.tsx src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs
git commit -m "feat: render unified conversation turns in chat pane"
```

---

### Task 4: Feed Conversation Turns From ChatInterface

**Files:**
- Modify: `src/components/chat/view/ChatInterface.tsx`
- Test: `src/components/chat/view/agentV2Realtime.test.mjs`

- [ ] **Step 1: Add source-level test for single projection**

Append to `src/components/chat/view/agentV2Realtime.test.mjs`:

```js
test('ChatInterface feeds ChatMessagesPane with projectConversationTurns as the main render source', async () => {
  const source = await readFile(new URL('./ChatInterface.tsx', import.meta.url), 'utf8');
  assert.match(source, /projectConversationTurns/);
  assert.match(source, /conversationTurns=\{conversationTurns\}/);
});
```

- [ ] **Step 2: Run the source test to verify it fails**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/agentV2Realtime.test.mjs
```

Expected: FAIL because `projectConversationTurns` is not imported or used.

- [ ] **Step 3: Import the unified projection**

Modify `src/components/chat/view/ChatInterface.tsx` imports:

```ts
// @ts-ignore -- Node test runner resolves explicit .ts extensions for direct execution.
import { projectConversationTurns } from '../../chat-v2/projection/projectConversationTurns.ts';
```

- [ ] **Step 4: Compute conversationTurns**

After `runCardsWithPendingFallback`, add:

```ts
  const conversationTurns = React.useMemo(
    () => {
      const realtimeEvents = activeAgentSessionId
        ? listAgentRealtimeEvents(activeAgentSessionId)
        : [];

      return projectConversationTurns({
        sessionId: activeAgentSessionId,
        historicalMessages: historicalAgentConversation.history?.messages || [],
        transientMessages: chatMessages,
        realtimeEvents,
        pendingPermissionRequests,
        isLoading,
      });
    },
    [
      activeAgentSessionId,
      agentRealtimeVersion,
      chatMessages,
      historicalAgentConversation.history?.messages,
      isLoading,
      listAgentRealtimeEvents,
      pendingPermissionRequests,
    ],
  );
```

- [ ] **Step 5: Pass conversationTurns to ChatMessagesPane**

In the `ChatMessagesPane` JSX props, add:

```tsx
          conversationTurns={conversationTurns}
```

Keep existing `chatMessages`, `visibleMessages`, and `runCards` props during this task so fallback tests remain green. The new pane path will prefer `conversationTurns` when non-empty.

- [ ] **Step 6: Run ChatInterface source tests**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/agentV2Realtime.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Run pane and projection tests together**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/projectConversationTurns.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs src/components/chat/view/agentV2Realtime.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/chat/view/ChatInterface.tsx src/components/chat/view/agentV2Realtime.test.mjs
git commit -m "feat: feed chat pane with unified conversation turns"
```

---

### Task 5: Prevent Composer Status From Showing Assistant Body

**Files:**
- Modify: `src/components/chat/view/agentComposerState.ts`
- Test: `src/components/chat/view/agentComposerState.test.mjs`

- [ ] **Step 1: Add failing test for long assistant text leakage**

Append to `src/components/chat/view/agentComposerState.test.mjs`:

```js
test('活跃 execution 不把完整 assistant 正文塞进 composer 状态条', () => {
  const longAssistantText = '这是第一段完整回复。'.repeat(20);

  assert.deepEqual(
    resolveAgentComposerState({
      isLoading: false,
      claudeStatusText: null,
      execution: {
        status: 'streaming',
        assistantText: longAssistantText,
      },
    }),
    {
      status: 'streaming',
      label: '正在接收回复',
    },
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/agentComposerState.test.mjs
```

Expected: FAIL because current implementation returns `execution.assistantText`.

- [ ] **Step 3: Replace label derivation with short status mapping**

Modify `src/components/chat/view/agentComposerState.ts`:

```ts
function labelForExecutionStatus(status: string, fallback: string | null) {
  switch (status) {
    case 'queued':
      return '排队中';
    case 'starting':
      return '正在启动';
    case 'streaming':
    case 'completing':
      return '正在接收回复';
    case 'waiting_for_tool':
      return '等待工具结果';
    default:
      return fallback || '处理中';
  }
}
```

Then replace:

```ts
  const executionText = String(execution?.assistantText || '').trim();
```

with:

```ts
  const shortStatusLabel = labelForExecutionStatus(executionStatus, claudeStatusText);
```

And replace the active execution return:

```ts
    return {
      status,
      label: shortStatusLabel,
    };
```

- [ ] **Step 4: Update existing expectation**

In the first existing test in `agentComposerState.test.mjs`, replace expected label:

```js
      label: '正在接收回复',
```

- [ ] **Step 5: Run composer tests**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/agentComposerState.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/view/agentComposerState.ts src/components/chat/view/agentComposerState.test.mjs
git commit -m "fix: keep composer status labels short"
```

---

### Task 6: Add Protocol Noise and Old Tool Style Regression Tests

**Files:**
- Modify: `src/components/chat-v2/projection/projectConversationTurns.test.mjs`
- Modify: `src/components/chat-v2/projection/projectConversationTurns.ts`
- Modify: `src/components/chat/tools/README.md`

- [ ] **Step 1: Add expanded skill prompt regression test**

Append to `projectConversationTurns.test.mjs`:

```js
test('projectConversationTurns filters expanded skill prompt user echoes', () => {
  const turns = projectConversationTurns({
    sessionId: 'sess-skill',
    historicalMessages: [
      {
        id: 'user-slash',
        sessionId: 'sess-skill',
        role: 'user',
        text: '/graphify query',
        timestamp: '2026-04-24T05:00:00.000Z',
        kind: 'message',
        type: 'message',
      },
      {
        id: 'user-expanded',
        sessionId: 'sess-skill',
        role: 'user',
        text: 'Base directory for this skill: /Users/demo/.codex/skills/graphify\nFull expanded instructions...',
        timestamp: '2026-04-24T05:00:01.000Z',
        kind: 'message',
        type: 'message',
      },
      {
        id: 'assistant-1',
        sessionId: 'sess-skill',
        role: 'assistant',
        text: '我会按 graphify 执行',
        timestamp: '2026-04-24T05:00:02.000Z',
        kind: 'message',
        type: 'message',
      },
    ],
    transientMessages: [],
    realtimeEvents: [],
    pendingPermissionRequests: [],
    isLoading: false,
  });

  const userTurns = turns.filter((turn) => turn.kind === 'user');
  assert.equal(userTurns.length, 1);
  assert.equal(userTurns[0].id, 'user-slash');
});
```

- [ ] **Step 2: Add WebFetch/Skill process regression test**

Append:

```js
test('projectConversationTurns keeps WebFetch and Skill failures inside assistant activity', () => {
  const turns = projectConversationTurns({
    sessionId: 'sess-tools',
    historicalMessages: [
      {
        id: 'user-1',
        sessionId: 'sess-tools',
        role: 'user',
        text: '查资料',
        timestamp: '2026-04-24T06:00:00.000Z',
        kind: 'message',
        type: 'message',
      },
      {
        id: 'webfetch-error',
        sessionId: 'sess-tools',
        role: 'tool',
        text: 'Unable to verify if domain example.com is safe to fetch.',
        timestamp: '2026-04-24T06:00:01.000Z',
        kind: 'tool_result',
        type: 'tool_result',
        toolName: 'WebFetch',
      },
      {
        id: 'skill-error',
        sessionId: 'sess-tools',
        role: 'tool',
        text: 'Skill failed to load.',
        timestamp: '2026-04-24T06:00:02.000Z',
        kind: 'tool_result',
        type: 'tool_result',
        toolName: 'Skill',
      },
      {
        id: 'assistant-1',
        sessionId: 'sess-tools',
        role: 'assistant',
        text: '已完成资料整理',
        timestamp: '2026-04-24T06:00:03.000Z',
        kind: 'message',
        type: 'message',
      },
    ],
    transientMessages: [],
    realtimeEvents: [],
    pendingPermissionRequests: [],
    isLoading: false,
  });

  const assistantTurn = turns.find((turn) => turn.kind === 'assistant');
  assert.equal(assistantTurn?.bodySegments.at(-1)?.body, '已完成资料整理');
  assert.deepEqual(
    assistantTurn?.activityItems.map((item) => item.kind),
    ['tool_result', 'tool_result'],
  );
  assert.equal(turns.some((turn) => turn.kind === 'assistant' && /Parameters|Details/.test(turn.headline)), false);
});
```

- [ ] **Step 3: Run tests**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/projectConversationTurns.test.mjs
```

Expected: PASS. If the WebFetch/Skill test fails because `projectHistoricalRunCards(...)` does not carry `toolName`, keep this test focused on activity containment and do not add top-level tool rendering.

- [ ] **Step 4: Document ToolRenderer boundary**

Modify `src/components/chat/tools/README.md` near the top:

```md
## Chat V2 Boundary

The default chat transcript no longer renders top-level tool cards through `ToolRenderer`.
Main chat rendering is owned by `projectConversationTurns(...)` and `AssistantTurn`/`RunCard` UI.
ToolRenderer remains available for focused tool detail views and diagnostic surfaces, but tool input,
tool result, and tool errors must enter the main chat as assistant-turn activity items first.
```

- [ ] **Step 5: Run source search to verify README text**

Run:

```bash
rg -n "Chat V2 Boundary|projectConversationTurns|assistant-turn activity" src/components/chat/tools/README.md
```

Expected: finds the new boundary section.

- [ ] **Step 6: Commit**

```bash
git add src/components/chat-v2/projection/projectConversationTurns.test.mjs src/components/chat-v2/projection/projectConversationTurns.ts src/components/chat/tools/README.md
git commit -m "test: guard chat turn protocol and tool boundaries"
```

---

### Task 7: Retire Legacy Main-Path Props From ChatMessagesPane

**Files:**
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
- Modify: `src/components/chat/view/ChatInterface.tsx`
- Test: `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`
- Test: `src/components/chat/view/agentV2Realtime.test.mjs`

- [ ] **Step 1: Add source-level guard for legacy helpers not being used on main path**

Append to `ChatMessagesPane.test.mjs`:

```js
test('ChatMessagesPane main path is conversationTurns-first', async () => {
  const source = await readFile(new URL('./ChatMessagesPane.tsx', import.meta.url), 'utf8');
  assert.match(source, /conversationTurns\.length > 0/);
  assert.doesNotMatch(source, /const transientAssistantRunCard = buildTransientAssistantRunCard\(\s*chatMessages,/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs
```

Expected: FAIL while transient builder still runs unconditionally.

- [ ] **Step 3: Gate legacy helper computation**

In `ChatMessagesPane.tsx`, add:

```ts
  const useConversationTurns = conversationTurns.length > 0;
```

Change transient builder setup so it does not run when `useConversationTurns` is true:

```ts
  const transientAssistantRunCard = useConversationTurns
    ? null
    : buildTransientAssistantRunCard(
        chatMessages,
        runCardsByAnchorMessageId,
        standaloneRunCards,
        isLoading,
      );
```

Change rendered messages setup:

```ts
  const renderedMessages = useConversationTurns
    ? []
    : trimLegacyAssistantMessages(
        visibleMessages,
        hasRenderableRunCards,
        runCardsByAnchorMessageId,
        standaloneRunCards,
      );
```

Change the JSX conditional from:

```tsx
          {conversationTurns.length > 0 ? (
```

to:

```tsx
          {useConversationTurns ? (
```

- [ ] **Step 4: Stop passing runCards as the primary source from ChatInterface**

In `ChatInterface.tsx`, keep computing `runCardsWithPendingFallback` only if legacy fallback tests still need it, but pass an empty array when `conversationTurns.length > 0`:

```tsx
          runCards={conversationTurns.length > 0 ? [] : runCardsWithPendingFallback}
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs src/components/chat/view/agentV2Realtime.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Run projection and composer tests**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/projectConversationTurns.test.mjs src/components/chat/view/agentComposerState.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/chat/view/subcomponents/ChatMessagesPane.tsx src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs src/components/chat/view/ChatInterface.tsx src/components/chat/view/agentV2Realtime.test.mjs
git commit -m "refactor: make conversation turns the chat main path"
```

---

### Task 8: Final Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run all touched unit tests**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/projectConversationTurns.test.mjs src/components/chat-v2/projection/projectRunCards.test.mjs src/components/chat-v2/projection/projectHistoricalChatMessages.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs src/components/chat/view/agentV2Realtime.test.mjs src/components/chat/view/agentComposerState.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run lint on touched source files**

Run:

```bash
npx eslint src/components/chat-v2/projection/projectConversationTurns.ts src/components/chat-v2/types/conversationTurn.ts src/components/chat-v2/types/runCard.ts src/components/chat/view/subcomponents/ChatMessagesPane.tsx src/components/chat/view/ChatInterface.tsx src/components/chat/view/agentComposerState.ts
```

Expected: PASS with no errors.

- [ ] **Step 3: Search for forbidden main-path patterns**

Run:

```bash
rg -n "buildTransientAssistantRunCard\\(|trimLegacyAssistantMessages\\(|conversationTurns=\\{|projectConversationTurns|assistantText" src/components/chat/view src/components/chat-v2
```

Expected:

- `conversationTurns={` appears in `ChatInterface.tsx`.
- `projectConversationTurns` appears in projection tests and `ChatInterface.tsx`.
- `buildTransientAssistantRunCard(` and `trimLegacyAssistantMessages(` may remain in `ChatMessagesPane.tsx`, but are gated behind `useConversationTurns ? null` or `useConversationTurns ? []`.
- `assistantText` may remain as an input field in `agentComposerState.ts`, but not as the returned label.

- [ ] **Step 4: Commit verification-only changes if any test snapshots or docs changed**

If no files changed, skip this commit. If `projectConversationTurns.test.mjs` or `ChatMessagesPane.test.mjs` was adjusted during verification:

```bash
git add src/components/chat-v2/projection/projectConversationTurns.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs
git commit -m "test: verify unified chat rendering path"
```

Expected: either no commit needed or one small verification commit.
