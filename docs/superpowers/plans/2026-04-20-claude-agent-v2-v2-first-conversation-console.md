# Claude Agent V2 V2-First Conversation Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the chat frontend into a V2-first conversation console where the main stream renders V2-native turn, task, decision, artifact, and recovery blocks, while the right pane stays context-focused.

**Architecture:** We will move the primary render model from legacy `ChatMessage[]` semantics to a V2 conversation stream projected from `agentEventStore`. The migration proceeds in slices: first introduce a V2-first stream projection layer, then replace standalone execution and banner concepts with in-stream blocks, then rewire the page shell and right-pane binding so execution remains in the main stream and contextual resources stay on the side.

**Tech Stack:** React, TypeScript, node:test, existing `chat` + `chat-v2` projection/store architecture, Tailwind utility classes

---

## File Structure

### New V2-first stream projection files

- Create: `src/components/chat-v2/types/conversationStream.ts`
- Create: `src/components/chat-v2/projection/projectConversationStream.ts`
- Create: `src/components/chat-v2/projection/projectConversationStream.test.mjs`
- Create: `src/components/chat-v2/projection/taskBlockGrouping.ts`
- Create: `src/components/chat-v2/projection/taskBlockGrouping.test.mjs`

### New stream rendering files

- Create: `src/components/chat-v2/components/ConversationStream.tsx`
- Create: `src/components/chat-v2/components/ConversationStream.test.mjs`
- Create: `src/components/chat-v2/components/stream-blocks/TurnBlock.tsx`
- Create: `src/components/chat-v2/components/stream-blocks/TaskBlock.tsx`
- Create: `src/components/chat-v2/components/stream-blocks/DecisionBlock.tsx`
- Create: `src/components/chat-v2/components/stream-blocks/ArtifactBlock.tsx`
- Create: `src/components/chat-v2/components/stream-blocks/RecoveryBlock.tsx`
- Create: `src/components/chat-v2/components/stream-blocks/StatusInline.tsx`
- Create: `src/components/chat-v2/components/stream-blocks/streamBlocks.test.mjs`

### Existing files to narrow or rewire

- Modify: `src/components/chat/view/ChatInterface.tsx`
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
- Modify: `src/components/chat/view/subcomponents/ChatComposer.tsx`
- Modify: `src/components/chat-v2/hooks/useAgentConversation.ts`
- Modify: `src/components/chat-v2/components/ConversationTimeline.ts`
- Modify: `src/components/chat-v2/components/RunExecutionPanel.ts`
- Modify: `src/components/chat/types/types.ts`

### Decision and context coordination files

- Create: `src/components/chat-v2/projection/contextSidecarBinding.ts`
- Create: `src/components/chat-v2/projection/contextSidecarBinding.test.mjs`
- Modify: `src/components/chat/view/subcomponents/PermissionRequestsBanner.tsx`
- Modify: `src/components/chat/view/subcomponents/InteractiveRequestsBanner.tsx`
- Modify: `src/components/chat/hooks/useChatMessages.ts`
- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.ts`

### Documentation

- Modify: `docs/superpowers/specs/2026-04-20-claude-agent-v2-v2-first-conversation-console-design.md`

## Task 1: Introduce the V2 Conversation Stream Projection Model

**Files:**
- Create: `src/components/chat-v2/types/conversationStream.ts`
- Create: `src/components/chat-v2/projection/projectConversationStream.ts`
- Create: `src/components/chat-v2/projection/projectConversationStream.test.mjs`
- Modify: `src/components/chat-v2/hooks/useAgentConversation.ts`

- [ ] **Step 1: Write the failing projection test for stream block output**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { projectConversationStream } from './projectConversationStream.ts';

test('projectConversationStream maps a run into turn and task-oriented blocks', () => {
  const blocks = projectConversationStream([
    {
      eventId: 'evt-1',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      timestamp: '2026-04-20T10:00:00.000Z',
      type: 'run.started',
      payload: {},
    },
    {
      eventId: 'evt-2',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 2,
      timestamp: '2026-04-20T10:00:01.000Z',
      type: 'sdk.task.started',
      payload: {
        taskId: 'task-1',
        description: 'Inspect repository layout',
      },
    },
    {
      eventId: 'evt-3',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 3,
      timestamp: '2026-04-20T10:00:02.000Z',
      type: 'assistant.message.completed',
      payload: {
        text: 'I checked the repository structure.',
      },
    },
  ]);

  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].kind, 'task');
  assert.equal(blocks[1].kind, 'turn');
});
```

- [ ] **Step 2: Run the focused projection test and verify it fails**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/projectConversationStream.test.mjs`

Expected: FAIL with `Cannot find module` for `projectConversationStream.ts` or missing export errors.

- [ ] **Step 3: Create the stream block type model**

```ts
import type { AgentEventEnvelope } from './agentEvents.ts';

export type ConversationStreamBlock =
  | ConversationTurnBlock
  | ConversationTaskBlock
  | ConversationDecisionBlock
  | ConversationArtifactBlock
  | ConversationRecoveryBlock
  | ConversationStatusInlineBlock;

export type ConversationTurnBlock = {
  id: string;
  kind: 'turn';
  runId: string;
  timestamp: string;
  userText: string | null;
  assistantText: string;
  events: AgentEventEnvelope[];
};

export type ConversationTaskBlock = {
  id: string;
  kind: 'task';
  runId: string;
  timestamp: string;
  title: string;
  status: 'running' | 'completed' | 'failed';
  summary: string;
  eventIds: string[];
  events: AgentEventEnvelope[];
};

export type ConversationDecisionBlock = {
  id: string;
  kind: 'decision';
  runId: string;
  timestamp: string;
  decisionKind: 'interactive_prompt' | 'permission_request';
  title: string;
  state: 'pending' | 'answered' | 'approved' | 'denied';
  payload: Record<string, unknown>;
  events: AgentEventEnvelope[];
};

export type ConversationArtifactBlock = {
  id: string;
  kind: 'artifact';
  runId: string;
  timestamp: string;
  title: string;
  filePath: string | null;
  artifactKind: 'file' | 'diff' | 'preview' | 'resource';
  events: AgentEventEnvelope[];
};

export type ConversationRecoveryBlock = {
  id: string;
  kind: 'recovery';
  runId: string;
  timestamp: string;
  title: string;
  message: string;
  canRetry: boolean;
  canStartNewSession: boolean;
  events: AgentEventEnvelope[];
};

export type ConversationStatusInlineBlock = {
  id: string;
  kind: 'status_inline';
  runId: string;
  timestamp: string;
  label: string;
  events: AgentEventEnvelope[];
};
```

- [ ] **Step 4: Implement the initial stream projection**

```ts
import type { AgentEventEnvelope } from '../types/agentEvents.ts';
import type { ConversationStreamBlock } from '../types/conversationStream.ts';

export function projectConversationStream(events: AgentEventEnvelope[]): ConversationStreamBlock[] {
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
  const blocks: ConversationStreamBlock[] = [];
  let assistantText = '';

  for (const event of ordered) {
    if (event.type === 'assistant.message.delta' || event.type === 'assistant.message.completed') {
      const text = typeof event.payload.text === 'string' ? event.payload.text : '';
      assistantText = text || assistantText;
    }

    if (event.type === 'assistant.message.completed') {
      blocks.push({
        id: `turn-${event.runId}-${event.eventId}`,
        kind: 'turn',
        runId: event.runId,
        timestamp: event.timestamp,
        userText: null,
        assistantText,
        events: [event],
      });
      continue;
    }

    if (event.type === 'sdk.task.started') {
      blocks.push({
        id: `task-${event.runId}-${event.eventId}`,
        kind: 'task',
        runId: event.runId,
        timestamp: event.timestamp,
        title: String(event.payload.description || 'Background task'),
        status: 'running',
        summary: '',
        eventIds: [event.eventId],
        events: [event],
      });
    }
  }

  return blocks;
}
```

- [ ] **Step 5: Connect the new projection into `useAgentConversation` without replacing existing consumers yet**

```ts
import { projectConversationStream } from '../projection/projectConversationStream.ts';

export function useAgentConversation(args) {
  const events = args.listAgentConversationEvents(args.conversationId);
  const timeline = projectConversationTimeline(events);
  const activeRunId = timeline.at(-1)?.runId || null;
  const activeRunEvents = activeRunId
    ? events.filter((event) => event.runId === activeRunId)
    : [];
  const execution = activeRunEvents.length > 0 ? projectRunExecution(activeRunEvents) : null;
  const stream = projectConversationStream(events);

  return {
    timeline,
    activeRunEvents,
    execution,
    stream,
  };
}
```

- [ ] **Step 6: Run focused tests and verify the new projection contract passes**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/projectConversationStream.test.mjs src/components/chat-v2/projection/projectRunExecution.test.mjs src/components/chat-v2/components/ConversationTimeline.test.mjs`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/chat-v2/types/conversationStream.ts src/components/chat-v2/projection/projectConversationStream.ts src/components/chat-v2/projection/projectConversationStream.test.mjs src/components/chat-v2/hooks/useAgentConversation.ts
git commit -m "feat: add v2 conversation stream projection"
```

## Task 2: Add Task Block Grouping for Mixed Expansion

**Files:**
- Create: `src/components/chat-v2/projection/taskBlockGrouping.ts`
- Create: `src/components/chat-v2/projection/taskBlockGrouping.test.mjs`
- Modify: `src/components/chat-v2/projection/projectConversationStream.ts`

- [ ] **Step 1: Write a failing test for grouping long execution chains into one task block**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { groupTaskBlockEvents } from './taskBlockGrouping.ts';

test('groupTaskBlockEvents groups contiguous task and tool progress into one task block model', () => {
  const groups = groupTaskBlockEvents([
    { eventId: 'evt-1', type: 'sdk.task.started', payload: { taskId: 'task-1', description: 'Analyze codebase' } },
    { eventId: 'evt-2', type: 'sdk.task.progress', payload: { taskId: 'task-1', description: 'Reading files' } },
    { eventId: 'evt-3', type: 'sdk.tool.progress', payload: { taskId: 'task-1', toolName: 'Read' } },
    { eventId: 'evt-4', type: 'sdk.task.notification', payload: { taskId: 'task-1', status: 'completed', summary: 'Done' } },
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].title, 'Analyze codebase');
  assert.equal(groups[0].status, 'completed');
});
```

- [ ] **Step 2: Run the grouping test and verify it fails**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/taskBlockGrouping.test.mjs`

Expected: FAIL with missing module or missing function errors.

- [ ] **Step 3: Implement the grouping helper with explicit expansion defaults**

```ts
import type { AgentEventEnvelope } from '../types/agentEvents.ts';

export function groupTaskBlockEvents(events: AgentEventEnvelope[]) {
  if (events.length === 0) {
    return [];
  }

  const titleEvent = events.find((event) => event.type === 'sdk.task.started');
  const notification = [...events].reverse().find((event) => event.type === 'sdk.task.notification');
  const status = notification?.payload?.status === 'failed'
    ? 'failed'
    : notification?.payload?.status === 'completed'
      ? 'completed'
      : 'running';

  return [{
    title: String(titleEvent?.payload?.description || 'Task'),
    status,
    summary: String(notification?.payload?.summary || ''),
    defaultExpanded: status !== 'completed' || events.some((event) => event.type === 'sdk.files.persisted'),
    steps: events.slice(-4).map((event) => ({
      eventId: event.eventId,
      type: event.type,
      label: String(event.payload.description || event.payload.summary || event.type),
    })),
    events,
  }];
}
```

- [ ] **Step 4: Update the conversation stream projection to emit grouped task blocks instead of one-block-per-event**

```ts
import { groupTaskBlockEvents } from './taskBlockGrouping.ts';

const taskEvents = ordered.filter((event) =>
  event.type === 'sdk.task.started'
  || event.type === 'sdk.task.progress'
  || event.type === 'sdk.task.notification'
  || event.type === 'sdk.tool.progress'
  || event.type === 'sdk.hook.progress'
);

for (const group of groupTaskBlockEvents(taskEvents)) {
  blocks.push({
    id: `task-${group.events[0].runId}-${group.events[0].eventId}`,
    kind: 'task',
    runId: group.events[0].runId,
    timestamp: group.events[0].timestamp,
    title: group.title,
    status: group.status,
    summary: group.summary,
    eventIds: group.events.map((event) => event.eventId),
    events: group.events,
  });
}
```

- [ ] **Step 5: Run focused grouping and projection tests**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/taskBlockGrouping.test.mjs src/components/chat-v2/projection/projectConversationStream.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/chat-v2/projection/taskBlockGrouping.ts src/components/chat-v2/projection/taskBlockGrouping.test.mjs src/components/chat-v2/projection/projectConversationStream.ts
git commit -m "feat: group v2 execution into task blocks"
```

## Task 3: Build the Unified Conversation Stream Renderer

**Files:**
- Create: `src/components/chat-v2/components/ConversationStream.tsx`
- Create: `src/components/chat-v2/components/ConversationStream.test.mjs`
- Create: `src/components/chat-v2/components/stream-blocks/TurnBlock.tsx`
- Create: `src/components/chat-v2/components/stream-blocks/TaskBlock.tsx`
- Create: `src/components/chat-v2/components/stream-blocks/DecisionBlock.tsx`
- Create: `src/components/chat-v2/components/stream-blocks/ArtifactBlock.tsx`
- Create: `src/components/chat-v2/components/stream-blocks/RecoveryBlock.tsx`
- Create: `src/components/chat-v2/components/stream-blocks/StatusInline.tsx`
- Create: `src/components/chat-v2/components/stream-blocks/streamBlocks.test.mjs`
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`

- [ ] **Step 1: Write a failing renderer test for mixed turn and task block output**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ConversationStream } from './ConversationStream.tsx';

test('ConversationStream renders turn and task blocks in one timeline', () => {
  const markup = renderToStaticMarkup(
    React.createElement(ConversationStream, {
      blocks: [
        { id: 'turn-1', kind: 'turn', runId: 'run-1', timestamp: '2026-04-20T10:00:00.000Z', userText: 'Inspect repo', assistantText: 'I am checking it now.', events: [] },
        { id: 'task-1', kind: 'task', runId: 'run-1', timestamp: '2026-04-20T10:00:01.000Z', title: 'Inspect repository layout', status: 'running', summary: 'Reading files', eventIds: [], events: [] },
      ],
    }),
  );

  assert.match(markup, /Inspect repo/);
  assert.match(markup, /Inspect repository layout/);
});
```

- [ ] **Step 2: Run the renderer tests and verify they fail**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/components/ConversationStream.test.mjs src/components/chat-v2/components/stream-blocks/streamBlocks.test.mjs`

Expected: FAIL with missing component files.

- [ ] **Step 3: Implement the stream renderer and block switch**

```tsx
import React from 'react';
import type { ConversationStreamBlock } from '../types/conversationStream.ts';
import { TurnBlock } from './stream-blocks/TurnBlock.tsx';
import { TaskBlock } from './stream-blocks/TaskBlock.tsx';
import { DecisionBlock } from './stream-blocks/DecisionBlock.tsx';
import { ArtifactBlock } from './stream-blocks/ArtifactBlock.tsx';
import { RecoveryBlock } from './stream-blocks/RecoveryBlock.tsx';
import { StatusInline } from './stream-blocks/StatusInline.tsx';

export function ConversationStream({ blocks, onSelectBlock }) {
  return (
    <div data-chat-v2-conversation-stream="true" className="space-y-4">
      {blocks.map((block) => {
        switch (block.kind) {
          case 'turn':
            return <TurnBlock key={block.id} block={block} onSelect={onSelectBlock} />;
          case 'task':
            return <TaskBlock key={block.id} block={block} onSelect={onSelectBlock} />;
          case 'decision':
            return <DecisionBlock key={block.id} block={block} onSelect={onSelectBlock} />;
          case 'artifact':
            return <ArtifactBlock key={block.id} block={block} onSelect={onSelectBlock} />;
          case 'recovery':
            return <RecoveryBlock key={block.id} block={block} onSelect={onSelectBlock} />;
          case 'status_inline':
            return <StatusInline key={block.id} block={block} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
```

- [ ] **Step 4: Implement `TaskBlock` with mixed expansion behavior**

```tsx
import React, { useState } from 'react';

export function TaskBlock({ block, onSelect }) {
  const [expanded, setExpanded] = useState(block.defaultExpanded);

  return (
    <section
      data-chat-v2-task-block="true"
      className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4"
      onClick={() => onSelect?.(block)}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-neutral-100">{block.title}</div>
          <div className="text-xs text-neutral-400">{block.summary || block.status}</div>
        </div>
        <button type="button" className="text-xs text-neutral-300" onClick={(event) => { event.stopPropagation(); setExpanded((value) => !value); }}>
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>
      {expanded ? (
        <div className="mt-3 space-y-2 text-xs text-neutral-300">
          {block.steps.map((step) => (
            <div key={step.eventId}>{step.label}</div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 5: Update `ChatMessagesPane` to render the new stream above the legacy message map**

```tsx
{conversationStream?.length ? (
  <ConversationStream
    blocks={conversationStream}
    onSelectBlock={onSelectConversationBlock}
  />
) : null}
```

- [ ] **Step 6: Run focused rendering tests**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/components/ConversationStream.test.mjs src/components/chat-v2/components/stream-blocks/streamBlocks.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/chat-v2/components/ConversationStream.tsx src/components/chat-v2/components/ConversationStream.test.mjs src/components/chat-v2/components/stream-blocks src/components/chat/view/subcomponents/ChatMessagesPane.tsx
git commit -m "feat: render v2 conversation stream blocks"
```

## Task 4: Move Decision and Recovery UX Into the Main Stream

**Files:**
- Modify: `src/components/chat/hooks/useChatMessages.ts`
- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.ts`
- Modify: `src/components/chat/view/subcomponents/PermissionRequestsBanner.tsx`
- Modify: `src/components/chat/view/subcomponents/InteractiveRequestsBanner.tsx`
- Modify: `src/components/chat-v2/projection/projectConversationStream.ts`
- Modify: `src/components/chat-v2/components/stream-blocks/DecisionBlock.tsx`
- Modify: `src/components/chat-v2/components/stream-blocks/RecoveryBlock.tsx`

- [ ] **Step 1: Write a failing projection test for decision blocks**

```js
test('projectConversationStream emits decision blocks for interactive and permission checkpoints', () => {
  const blocks = projectConversationStream([
    {
      eventId: 'evt-1',
      conversationId: 'conv-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      timestamp: '2026-04-20T10:00:00.000Z',
      type: 'sdk.event.unsupported',
      payload: {},
    },
  ], [
    {
      id: 'msg-1',
      sessionId: 'sess-1',
      timestamp: '2026-04-20T10:00:01.000Z',
      provider: 'claude',
      kind: 'interactive_prompt',
      requestId: 'req-1',
      toolName: 'AskUserQuestion',
      input: { questions: [{ question: 'Continue?', header: 'Flow', options: [{ label: 'Yes', description: 'Proceed' }, { label: 'No', description: 'Stop' }] }] },
    },
  ]);

  assert.equal(blocks.some((block) => block.kind === 'decision'), true);
});
```

- [ ] **Step 2: Run the decision tests and verify they fail**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/projectConversationStream.test.mjs`

Expected: FAIL because decision blocks are not yet projected from decision state.

- [ ] **Step 3: Project interactive prompts and permission requests into stream-level decision blocks**

```ts
function buildDecisionBlocks(messages) {
  return messages
    .filter((message) => message.kind === 'interactive_prompt' || message.kind === 'permission_request')
    .map((message) => ({
      id: `decision-${message.requestId}`,
      kind: 'decision',
      runId: String(message.runId || 'active-run'),
      timestamp: message.timestamp,
      decisionKind: message.kind,
      title: message.kind === 'interactive_prompt' ? 'Claude needs your input' : 'Permission required',
      state: 'pending',
      payload: {
        toolName: message.toolName,
        input: message.input,
      },
      events: [],
    }));
}
```

- [ ] **Step 4: Convert banner components into compatibility wrappers that render nothing when in-stream decision rendering is enabled**

```tsx
export default function PermissionRequestsBanner({ inStreamRenderingEnabled }) {
  if (inStreamRenderingEnabled) {
    return null;
  }
  return null;
}
```

- [ ] **Step 5: Render recovery blocks from failure states with explicit next actions**

```tsx
export function RecoveryBlock({ block, onRetry, onStartNewSession, onSelect }) {
  return (
    <section data-chat-v2-recovery-block="true" className="rounded-2xl border border-red-900/70 bg-red-950/40 p-4">
      <div className="text-sm font-semibold text-red-100">{block.title}</div>
      <div className="mt-1 text-sm text-red-200">{block.message}</div>
      <div className="mt-3 flex gap-2">
        {block.canRetry ? <button type="button" onClick={() => onRetry?.(block)}>Retry</button> : null}
        {block.canStartNewSession ? <button type="button" onClick={() => onStartNewSession?.(block)}>New session</button> : null}
        <button type="button" onClick={() => onSelect?.(block)}>Inspect context</button>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Run focused decision and recovery tests**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/projectConversationStream.test.mjs src/components/chat-v2/components/stream-blocks/streamBlocks.test.mjs src/components/chat/hooks/useChatRealtimeHandlers.test.mjs`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/chat-v2/projection/projectConversationStream.ts src/components/chat-v2/components/stream-blocks/DecisionBlock.tsx src/components/chat-v2/components/stream-blocks/RecoveryBlock.tsx src/components/chat/view/subcomponents/PermissionRequestsBanner.tsx src/components/chat/view/subcomponents/InteractiveRequestsBanner.tsx src/components/chat/hooks/useChatMessages.ts src/components/chat/hooks/useChatRealtimeHandlers.ts
git commit -m "feat: move v2 decisions and recovery into stream"
```

## Task 5: Rebuild the Page Shell Around the V2-First Stream

**Files:**
- Modify: `src/components/chat/view/ChatInterface.tsx`
- Modify: `src/components/chat/view/subcomponents/ChatComposer.tsx`
- Modify: `src/components/chat-v2/components/ConversationTimeline.ts`
- Modify: `src/components/chat-v2/components/RunExecutionPanel.ts`
- Modify: `src/components/chat-v2/components/ComposerContextBar.tsx`
- Modify: `src/components/chat-v2/hooks/useAgentConversation.ts`
- Modify: `src/components/chat/view/agentV2Realtime.test.mjs`

- [ ] **Step 1: Write a failing shell test that expects the new stream to be the primary surface**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('ChatInterface uses ConversationStream as the primary V2 surface', async () => {
  const source = await readFile(new URL('./ChatInterface.tsx', import.meta.url), 'utf8');

  assert.match(source, /ConversationStream/);
  assert.doesNotMatch(source, /React\.createElement\(AgentConversationShell/);
});
```

- [ ] **Step 2: Run the shell test and verify it fails**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/agentV2Realtime.test.mjs src/components/chat-v2/components/ConversationTimeline.test.mjs`

Expected: FAIL because `AgentConversationShell` is still the dominant V2 render path.

- [ ] **Step 3: Restructure `ChatInterface` so the V2 conversation stream is passed into the message pane as the primary render input**

```tsx
const {
  stream: conversationStream,
  execution,
  timeline,
} = useAgentConversation({
  conversationId: agentConversationId,
  listAgentConversationEvents,
  version: agentEventVersion,
});

<ChatMessagesPane
  conversationStream={conversationStream}
  conversationTimeline={timeline.length > 0 ? <ConversationTimeline items={timeline} /> : null}
  activeRunSummary={execution}
  ...
/>
```

- [ ] **Step 4: Update `ChatComposer` to behave like a V2-aware composer dock instead of a generic chat footer**

```tsx
const isBlockedOnDecision = pendingPermissionRequests.length > 0;
const isFailed = composerState?.status === 'failed';

{isFailed ? (
  <div className="mx-auto mb-3 max-w-4xl rounded-2xl border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-100">
    {composerState.error}
  </div>
) : null}

<form data-chat-v2-composer-dock="true" ...>
```

- [ ] **Step 5: Demote `RunExecutionPanel` into a compatibility wrapper used only in tests or fallback mode**

```tsx
export function RunExecutionPanel(props) {
  return props.summary
    ? <div data-chat-v2-run-panel-fallback="true">{props.summary.status}</div>
    : null;
}
```

- [ ] **Step 6: Run page-shell focused tests**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/agentV2Realtime.test.mjs src/components/chat-v2/components/ConversationTimeline.test.mjs src/components/chat-v2/components/ComposerContextBar.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/chat/view/ChatInterface.tsx src/components/chat/view/subcomponents/ChatComposer.tsx src/components/chat-v2/components/ConversationTimeline.ts src/components/chat-v2/components/RunExecutionPanel.ts src/components/chat-v2/components/ComposerContextBar.tsx src/components/chat-v2/hooks/useAgentConversation.ts src/components/chat/view/agentV2Realtime.test.mjs
git commit -m "feat: make v2 conversation stream the primary shell"
```

## Task 6: Bind Stream Selection to the Right Pane Context Model

**Files:**
- Create: `src/components/chat-v2/projection/contextSidecarBinding.ts`
- Create: `src/components/chat-v2/projection/contextSidecarBinding.test.mjs`
- Modify: `src/components/chat/view/ChatInterface.tsx`
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
- Modify: `src/components/chat-v2/components/stream-blocks/ArtifactBlock.tsx`
- Modify: `src/components/chat-v2/components/stream-blocks/TaskBlock.tsx`

- [ ] **Step 1: Write a failing test for mapping selected stream blocks into sidecar context**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveContextSidecarBinding } from './contextSidecarBinding.ts';

test('resolveContextSidecarBinding prefers artifact file paths for artifact blocks', () => {
  const binding = resolveContextSidecarBinding({
    kind: 'artifact',
    filePath: '/workspace/demo/README.md',
    artifactKind: 'file',
  });

  assert.deepEqual(binding, {
    target: 'file',
    filePath: '/workspace/demo/README.md',
  });
});
```

- [ ] **Step 2: Run the sidecar binding test and verify it fails**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/contextSidecarBinding.test.mjs`

Expected: FAIL with missing module errors.

- [ ] **Step 3: Implement the sidecar binding resolver**

```ts
export function resolveContextSidecarBinding(block) {
  if (!block) {
    return null;
  }

  if (block.kind === 'artifact' && block.filePath) {
    return {
      target: 'file',
      filePath: block.filePath,
    };
  }

  if (block.kind === 'task') {
    return {
      target: 'task_context',
      runId: block.runId,
      eventIds: block.eventIds,
    };
  }

  if (block.kind === 'recovery') {
    return {
      target: 'recovery_context',
      runId: block.runId,
    };
  }

  return null;
}
```

- [ ] **Step 4: Add selected block state to `ChatInterface` and wire it into right-pane callbacks**

```tsx
const [selectedConversationBlock, setSelectedConversationBlock] = useState(null);
const selectedContextBinding = resolveContextSidecarBinding(selectedConversationBlock);

const handleSelectConversationBlock = (block) => {
  setSelectedConversationBlock(block);
  if (selectedContextBinding?.target === 'file' && selectedContextBinding.filePath) {
    onFileOpen?.(selectedContextBinding.filePath);
  }
};
```

- [ ] **Step 5: Pass block selection from the main stream renderer**

```tsx
<ConversationStream
  blocks={conversationStream}
  onSelectBlock={handleSelectConversationBlock}
/>
```

- [ ] **Step 6: Run focused context-binding tests**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/contextSidecarBinding.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs src/components/right-pane/utils/rightPaneTargetIdentity.test.mjs`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/chat-v2/projection/contextSidecarBinding.ts src/components/chat-v2/projection/contextSidecarBinding.test.mjs src/components/chat/view/ChatInterface.tsx src/components/chat/view/subcomponents/ChatMessagesPane.tsx src/components/chat-v2/components/stream-blocks/ArtifactBlock.tsx src/components/chat-v2/components/stream-blocks/TaskBlock.tsx
git commit -m "feat: bind v2 stream selection to context sidecar"
```

## Task 7: Final Cleanup, Compatibility Narrowing, and Verification

**Files:**
- Modify: `src/components/chat-v2/components/RunExecutionPanel.test.mjs`
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`
- Modify: `src/components/chat/view/subcomponents/chat-request-split.test.mjs`
- Modify: `docs/superpowers/specs/2026-04-20-claude-agent-v2-v2-first-conversation-console-design.md`

- [ ] **Step 1: Write a regression test ensuring standalone banners are no longer the primary decision surface**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('decision banners are compatibility wrappers rather than primary rendering surfaces', async () => {
  const permissionSource = await readFile(new URL('./PermissionRequestsBanner.tsx', import.meta.url), 'utf8');
  const interactiveSource = await readFile(new URL('./InteractiveRequestsBanner.tsx', import.meta.url), 'utf8');

  assert.match(permissionSource, /inStreamRenderingEnabled/);
  assert.match(interactiveSource, /inStreamRenderingEnabled/);
});
```

- [ ] **Step 2: Run the cleanup regression tests and verify they fail before compatibility narrowing**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/subcomponents/chat-request-split.test.mjs src/components/chat-v2/components/RunExecutionPanel.test.mjs`

Expected: FAIL if banners and standalone run panel still own primary UX assumptions.

- [ ] **Step 3: Narrow compatibility components and refresh the design doc progress note**

```md
## Implementation Status

- V2-first stream projection: implemented
- task blocks: implemented
- in-stream decision blocks: implemented
- context sidecar binding: implemented
- standalone execution panel: compatibility fallback only
```

- [ ] **Step 4: Run the full frontend-focused verification set**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat-v2/projection/projectConversationStream.test.mjs src/components/chat-v2/projection/taskBlockGrouping.test.mjs src/components/chat-v2/projection/contextSidecarBinding.test.mjs src/components/chat-v2/components/ConversationStream.test.mjs src/components/chat-v2/components/stream-blocks/streamBlocks.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs src/components/chat/hooks/useChatRealtimeHandlers.test.mjs src/components/chat/hooks/useChatMessages.test.mjs src/components/chat/view/subcomponents/chat-request-split.test.mjs src/components/chat/view/agentV2Realtime.test.mjs`

Expected: PASS

- [ ] **Step 5: Run the whole repository verification**

Run: `npm test`

Expected: PASS

Run: `npm run typecheck`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/chat-v2/components/RunExecutionPanel.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs src/components/chat/view/subcomponents/chat-request-split.test.mjs docs/superpowers/specs/2026-04-20-claude-agent-v2-v2-first-conversation-console-design.md
git commit -m "test: verify v2-first conversation console migration"
```

## Final Verification

After all seven tasks land, run the whole verification set once:

Run: `npm test`
Expected: PASS

Run: `npm run typecheck`
Expected: PASS

Run: `git diff --check`
Expected: PASS

Run: `git status --short`
Expected: only the intended plan, spec, and implementation changes remain.
