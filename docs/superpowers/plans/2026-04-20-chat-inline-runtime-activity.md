# Chat Inline Runtime Activity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current chat-area split execution surfaces with one assistant-turn container that embeds a lightweight inline runtime activity feed above the final answer, while removing obsolete timeline/execution-panel primary-path UI.

**Architecture:** Keep `agentEventStore` as the runtime truth and project one new assistant-turn view model with three parts: header summary, inline activity feed, and final answer body. Migrate `ChatInterface` to render this single primary path for both active and historical runs, then remove the old `ConversationTimeline` / `RunExecutionPanel` primary-path wiring and legacy raw protocol leakage into normal chat bubbles.

**Tech Stack:** React, TypeScript, node:test, existing Claude Agent V2 event store/projection pipeline

---

## File Structure

### New / expanded runtime-turn projection

- Create: `src/components/chat-v2/projection/projectInlineRuntimeActivity.ts`
  Purpose: turn one run's raw V2 events into ordered feed lines for the inline activity region.
- Modify: `src/components/chat-v2/projection/projectRunExecution.ts`
  Purpose: extend execution summary to expose history/active presentation mode, header label inputs, and final-answer/body split.
- Modify: `src/components/chat-v2/hooks/useAgentConversation.ts`
  Purpose: expose `activeRunActivity`, `activeRunSummary`, and `historyPresentation` from the store without depending on `ConversationTimeline`.

### New primary assistant-turn UI

- Create: `src/components/chat-v2/components/InlineRuntimeActivity.tsx`
  Purpose: render the light inline scrolling dynamic-text block for all runtime events.
- Create: `src/components/chat-v2/components/AssistantRuntimeTurn.tsx`
  Purpose: render one assistant turn with header, inline activity, final answer, and recovery action row.
- Modify: `src/components/chat-v2/components/ComposerContextBar.ts`
  Purpose: reduce it to high-level state only so it complements the new inline activity block.
- Modify: `src/components/chat/view/ChatInterface.tsx`
  Purpose: switch the main chat path from timeline + run panel composition to one assistant runtime-turn path.

### Legacy leakage cleanup / compatibility

- Modify: `src/components/chat/hooks/useChatMessages.ts`
  Purpose: stop task/protocol leakage from being normalized into normal assistant bubble content on the new path.
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
  Purpose: ensure the primary rendering path does not reintroduce duplicate execution chrome above/below the assistant turn.
- Modify: `src/components/chat/view/agentV2Realtime.test.mjs`
  Purpose: update primary-path expectations away from `ConversationTimeline` / `RunExecutionPanel`.

### Removal / de-primary-path candidates

- Modify or delete later: `src/components/chat-v2/components/ConversationTimeline.ts`
- Modify or delete later: `src/components/chat-v2/components/RunExecutionPanel.ts`
- Modify or delete later: `src/components/chat-v2/view/AgentConversationShell.ts`
- Modify or delete later: `src/components/chat-v2/projection/projectConversationTimeline.ts`
- Evaluate de-primary-path: `src/components/chat-v2/projection/projectConversationStream.ts` and `src/components/chat-v2/components/stream-blocks/*`

### Tests

- Create: `src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs`
- Create: `src/components/chat-v2/components/AssistantRuntimeTurn.test.mjs`
- Modify: `src/components/chat-v2/projection/projectRunExecution.test.mjs`
- Modify: `src/components/chat-v2/components/ComposerContextBar.test.mjs`
- Modify: `src/components/chat/view/agentV2Realtime.test.mjs`
- Modify: `src/components/chat/hooks/useChatSessionState.test.mjs`
- Modify: `src/components/chat-v2/store/createAgentEventStore.test.mjs`

## Task 1: Add the inline activity projection model

**Files:**
- Create: `src/components/chat-v2/projection/projectInlineRuntimeActivity.ts`
- Create: `src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs`
- Modify: `src/components/chat-v2/projection/projectRunExecution.ts`
- Modify: `src/components/chat-v2/projection/projectRunExecution.test.mjs`

- [ ] **Step 1: Write the failing projection tests for feed lines and history mode**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { projectInlineRuntimeActivity } from './projectInlineRuntimeActivity.ts';
import { projectRunExecution } from './projectRunExecution.ts';

test('projectInlineRuntimeActivity maps raw V2 events into ordered feed lines', () => {
  const lines = projectInlineRuntimeActivity([
    {
      eventId: 'evt-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'run.started',
      timestamp: '2026-04-20T12:00:00.000Z',
      payload: {},
    },
    {
      eventId: 'evt-2',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 2,
      type: 'sdk.system.init',
      timestamp: '2026-04-20T12:00:01.000Z',
      payload: { cwd: '/workspace/html' },
    },
    {
      eventId: 'evt-3',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 3,
      type: 'assistant.message.delta',
      timestamp: '2026-04-20T12:00:02.000Z',
      payload: { text: '正在汇总结果' },
    },
  ]);

  assert.deepEqual(lines.map((line) => line.kind), [
    'run',
    'system',
    'assistant',
  ]);
  assert.equal(lines[1].summary.includes('/workspace/html'), true);
});

test('projectRunExecution exposes active vs history presentation mode', () => {
  const active = projectRunExecution([
    {
      eventId: 'evt-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'run.started',
      timestamp: '2026-04-20T12:00:00.000Z',
      payload: {},
    },
  ]);

  const history = projectRunExecution([
    {
      eventId: 'evt-1',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'run.started',
      timestamp: '2026-04-20T12:00:00.000Z',
      payload: {},
    },
    {
      eventId: 'evt-2',
      runId: 'run-1',
      sessionId: 'sess-1',
      sequence: 2,
      type: 'run.completed',
      timestamp: '2026-04-20T12:00:05.000Z',
      payload: { result: 'done' },
    },
  ]);

  assert.equal(active.presentationMode, 'active');
  assert.equal(history.presentationMode, 'history');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs src/components/chat-v2/projection/projectRunExecution.test.mjs`
Expected: FAIL because `projectInlineRuntimeActivity.ts` does not exist yet and `presentationMode` is not returned.

- [ ] **Step 3: Implement the new projection and extend run summary**

```ts
// src/components/chat-v2/projection/projectInlineRuntimeActivity.ts
import type { AgentEventEnvelope } from '../types/agentEvents.ts';

export type InlineRuntimeActivityLine = {
  eventId: string;
  timestamp: string;
  kind: 'run' | 'system' | 'task' | 'tool' | 'assistant' | 'result' | 'raw';
  label: string;
  summary: string;
};

function summarizeEvent(event: AgentEventEnvelope): InlineRuntimeActivityLine {
  if (event.type === 'run.started') {
    return { eventId: event.eventId, timestamp: event.timestamp, kind: 'run', label: 'run.started', summary: 'Run started' };
  }
  if (event.type === 'sdk.system.init') {
    return {
      eventId: event.eventId,
      timestamp: event.timestamp,
      kind: 'system',
      label: 'sdk.system.init',
      summary: `cwd=${String(event.payload.cwd || '')}`.trim(),
    };
  }
  if (event.type.startsWith('sdk.task.')) {
    return {
      eventId: event.eventId,
      timestamp: event.timestamp,
      kind: 'task',
      label: event.type,
      summary: String(event.payload.summary || event.payload.description || event.payload.status || ''),
    };
  }
  if (event.type.startsWith('tool.call.')) {
    return {
      eventId: event.eventId,
      timestamp: event.timestamp,
      kind: 'tool',
      label: event.type,
      summary: String(event.payload.toolName || event.payload.toolId || ''),
    };
  }
  if (event.type === 'assistant.message.delta') {
    return {
      eventId: event.eventId,
      timestamp: event.timestamp,
      kind: 'assistant',
      label: event.type,
      summary: String(event.payload.text || ''),
    };
  }
  if (event.type === 'run.completed' || event.type === 'run.failed' || event.type === 'run.aborted') {
    return {
      eventId: event.eventId,
      timestamp: event.timestamp,
      kind: 'result',
      label: event.type,
      summary: String(event.payload.result || event.payload.error || ''),
    };
  }
  return {
    eventId: event.eventId,
    timestamp: event.timestamp,
    kind: 'raw',
    label: event.type,
    summary: JSON.stringify(event.payload),
  };
}

export function projectInlineRuntimeActivity(events: AgentEventEnvelope[]) {
  return [...events]
    .sort((a, b) => a.sequence - b.sequence)
    .map(summarizeEvent);
}
```

```ts
// inside projectRunExecution.ts return value
return {
  status,
  assistantText,
  error,
  failureSubtype,
  canStartNewSession: failureSubtype === 'error_during_execution',
  presentationMode: terminalReached ? 'history' : 'active',
  events: orderedEvents,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs src/components/chat-v2/projection/projectRunExecution.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/chat-v2/projection/projectInlineRuntimeActivity.ts \
  src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs \
  src/components/chat-v2/projection/projectRunExecution.ts \
  src/components/chat-v2/projection/projectRunExecution.test.mjs
git commit -m "feat: add inline runtime activity projection"
```

## Task 2: Build the new assistant-turn UI and wire it into ChatInterface

**Files:**
- Create: `src/components/chat-v2/components/InlineRuntimeActivity.tsx`
- Create: `src/components/chat-v2/components/AssistantRuntimeTurn.tsx`
- Create: `src/components/chat-v2/components/AssistantRuntimeTurn.test.mjs`
- Modify: `src/components/chat-v2/hooks/useAgentConversation.ts`
- Modify: `src/components/chat/view/ChatInterface.tsx`
- Modify: `src/components/chat-v2/components/ComposerContextBar.ts`
- Modify: `src/components/chat-v2/components/ComposerContextBar.test.mjs`

- [ ] **Step 1: Write the failing UI tests for inline activity and unified assistant turn**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AssistantRuntimeTurn } from './AssistantRuntimeTurn.tsx';

test('AssistantRuntimeTurn renders header, activity area, and final answer together', () => {
  const markup = renderToStaticMarkup(
    React.createElement(AssistantRuntimeTurn, {
      summary: {
        status: 'completed',
        assistantText: '佛山经济增长稳定。',
        error: null,
        failureSubtype: null,
        canStartNewSession: false,
        presentationMode: 'history',
        events: [],
      },
      activity: [
        {
          eventId: 'evt-1',
          timestamp: '2026-04-20T12:00:00.000Z',
          kind: 'tool',
          label: 'tool.call.started',
          summary: 'WebSearch',
        },
      ],
      onStartNewSession: null,
    }),
  );

  assert.match(markup, /data-chat-v2-assistant-turn="true"/);
  assert.match(markup, /data-chat-v2-inline-activity="true"/);
  assert.match(markup, /佛山经济增长稳定/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/components/chat-v2/components/AssistantRuntimeTurn.test.mjs src/components/chat-v2/components/ComposerContextBar.test.mjs`
Expected: FAIL because the new component does not exist and the old composer bar expectations are too narrow.

- [ ] **Step 3: Implement the new UI components and switch ChatInterface primary path**

```tsx
// src/components/chat-v2/components/InlineRuntimeActivity.tsx
import React, { useMemo } from 'react';

export function InlineRuntimeActivity({ lines, expanded = false }) {
  const visible = expanded ? lines : lines.slice(-5);

  return (
    <div
      data-chat-v2-inline-activity="true"
      className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-[12px] leading-5 text-neutral-500"
    >
      <div className={`overflow-auto ${expanded ? 'max-h-80' : 'max-h-52'}`}>
        {visible.map((line) => (
          <div key={line.eventId} className="grid grid-cols-[72px_110px_1fr] gap-2 py-1">
            <span className="text-neutral-400">{new Date(line.timestamp).toLocaleTimeString()}</span>
            <span className="text-neutral-500">{line.label}</span>
            <span className="text-neutral-600 break-all">{line.summary}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

```tsx
// src/components/chat-v2/components/AssistantRuntimeTurn.tsx
import React from 'react';
import { InlineRuntimeActivity } from './InlineRuntimeActivity.tsx';

export function AssistantRuntimeTurn({ summary, activity, onStartNewSession }) {
  return (
    <section data-chat-v2-assistant-turn="true" className="space-y-3">
      <div className="text-xs text-neutral-500">{summary.status}</div>
      <InlineRuntimeActivity lines={activity} expanded={summary.presentationMode === 'active'} />
      {summary.assistantText ? (
        <div className="text-sm leading-7 text-neutral-900">{summary.assistantText}</div>
      ) : null}
      {summary.canStartNewSession && onStartNewSession ? (
        <button data-chat-v2-new-session="true" onClick={onStartNewSession}>新建会话</button>
      ) : null}
    </section>
  );
}
```

```tsx
// inside ChatInterface.tsx, replace the old timeline + run panel block
const conversationTimeline = agentConversation.execution ? (
  <AssistantRuntimeTurn
    summary={agentConversation.execution}
    activity={agentConversation.activeRunActivity}
    onStartNewSession={selectedProject && onStartNewSession ? () => onStartNewSession(selectedProject) : null}
  />
) : null;
```

```ts
// inside useAgentConversation.ts
const activeRunActivity = activeRunEvents.length > 0
  ? projectInlineRuntimeActivity(activeRunEvents)
  : [];

return {
  stream,
  timeline,
  activeRunEvents,
  activeRunActivity,
  execution,
  hasBlockingDecision,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/components/chat-v2/components/AssistantRuntimeTurn.test.mjs src/components/chat-v2/components/ComposerContextBar.test.mjs src/components/chat/view/agentV2Realtime.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/chat-v2/components/InlineRuntimeActivity.tsx \
  src/components/chat-v2/components/AssistantRuntimeTurn.tsx \
  src/components/chat-v2/components/AssistantRuntimeTurn.test.mjs \
  src/components/chat-v2/hooks/useAgentConversation.ts \
  src/components/chat/view/ChatInterface.tsx \
  src/components/chat-v2/components/ComposerContextBar.ts \
  src/components/chat-v2/components/ComposerContextBar.test.mjs \
  src/components/chat/view/agentV2Realtime.test.mjs
git commit -m "feat: render assistant runtime activity inline in chat"
```

## Task 3: Stop raw protocol leakage from entering normal message bubbles

**Files:**
- Modify: `src/components/chat/hooks/useChatMessages.ts`
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
- Modify: `src/components/chat/hooks/useChatSessionState.test.mjs`

- [ ] **Step 1: Write the failing tests for raw protocol isolation**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizedToChatMessages } from './useChatMessages';

test('task notification tags do not surface as normal assistant bubble content on the primary path', () => {
  const messages = normalizedToChatMessages([
    {
      id: 'msg-1',
      sessionId: 'sess-1',
      timestamp: '2026-04-20T12:00:00.000Z',
      provider: 'claude',
      kind: 'text',
      role: 'assistant',
      content: '<task-notification><task-id>task-1</task-id></task-notification>',
    },
  ]);

  assert.equal(messages.some((msg) => String(msg.content || '').includes('<task-notification>')), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/components/chat/hooks/useChatSessionState.test.mjs`
Expected: FAIL because raw structured task text is still eligible to leak into normal assistant content.

- [ ] **Step 3: Implement the minimal isolation**

```js
// inside normalizedToChatMessages / assistant text path
const looksLikeRuntimeProtocol =
  typeof message.content === 'string'
  && (
    message.content.includes('<task-notification>')
    || message.content.includes('<tool-use-id>')
    || message.content.includes('<output-file>')
  );

if (looksLikeRuntimeProtocol) {
  return [];
}
```

```tsx
// ChatMessagesPane.tsx
// keep the normal transcript focused on user + final assistant content
// and rely on AssistantRuntimeTurn for execution/process display
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/components/chat/hooks/useChatSessionState.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/hooks/useChatMessages.ts \
  src/components/chat/view/subcomponents/ChatMessagesPane.tsx \
  src/components/chat/hooks/useChatSessionState.test.mjs
git commit -m "fix: keep runtime protocol out of assistant message bubbles"
```

## Task 4: Remove old primary-path execution UI and clean obsolete components

**Files:**
- Modify or delete: `src/components/chat-v2/components/ConversationTimeline.ts`
- Modify or delete: `src/components/chat-v2/components/RunExecutionPanel.ts`
- Modify or delete: `src/components/chat-v2/view/AgentConversationShell.ts`
- Modify or delete: `src/components/chat-v2/projection/projectConversationTimeline.ts`
- Modify: `src/components/chat-v2/store/createAgentEventStore.test.mjs`
- Modify: `src/components/chat-v2/components/ConversationTimeline.test.mjs`
- Modify: `src/components/chat-v2/components/RunExecutionPanel.test.mjs`
- Modify: `src/components/chat-v2/view/AgentConversationShell.test.mjs`

- [ ] **Step 1: Write or adjust failing tests to reflect the new primary path**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('ChatInterface no longer renders ConversationTimeline or RunExecutionPanel in the primary path', async () => {
  const source = await readFile(new URL('../../chat/view/ChatInterface.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /ConversationTimeline items=/);
  assert.doesNotMatch(source, /RunExecutionPanel/);
  assert.match(source, /AssistantRuntimeTurn/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/components/chat/view/agentV2Realtime.test.mjs src/components/chat-v2/view/AgentConversationShell.test.mjs`
Expected: FAIL because the old primary-path references still exist.

- [ ] **Step 3: Remove old primary-path wiring and delete dead code where safe**

```ts
// ChatInterface.tsx imports
import { AssistantRuntimeTurn } from '../../chat-v2/components/AssistantRuntimeTurn.tsx';
// remove ConversationTimeline and RunExecutionPanel imports
```

```bash
git rm src/components/chat-v2/components/ConversationTimeline.ts
git rm src/components/chat-v2/components/ConversationTimeline.test.mjs
git rm src/components/chat-v2/components/RunExecutionPanel.ts
git rm src/components/chat-v2/components/RunExecutionPanel.test.mjs
git rm src/components/chat-v2/view/AgentConversationShell.ts
git rm src/components/chat-v2/view/AgentConversationShell.test.mjs
git rm src/components/chat-v2/projection/projectConversationTimeline.ts
```

- [ ] **Step 4: Run focused tests and full typecheck**

Run: `node --test src/components/chat/view/agentV2Realtime.test.mjs src/components/chat-v2/components/AssistantRuntimeTurn.test.mjs src/components/chat-v2/projection/projectInlineRuntimeActivity.test.mjs src/components/chat/hooks/useChatSessionState.test.mjs`
Expected: PASS

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Run full test suite and commit**

Run: `npm test`
Expected: PASS with no failures

```bash
git add -A
git commit -m "refactor: inline runtime activity into assistant turn"
```

## Self-Review

### Spec coverage

- One assistant turn container: covered by Task 2 and Task 4
- Inline activity within main chat area: covered by Task 1 and Task 2
- Full realtime backend feedback preserved: covered by Task 1 and Task 2
- Raw protocol removed from normal chat bubbles: covered by Task 3
- Same structure for active and history modes: covered by Task 1 and Task 2
- Cleanup of obsolete presentation components: covered by Task 4

### Placeholder scan

- No `TODO` / `TBD`
- Each task includes exact files, commands, and concrete code snippets
- Cleanup candidates are turned into explicit delete/modify steps in Task 4

### Type consistency

- New naming is consistent around `InlineRuntimeActivity`, `AssistantRuntimeTurn`, `activeRunActivity`, and `presentationMode`
- The old `ConversationTimeline` / `RunExecutionPanel` path is consistently replaced rather than partially coexisting

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-20-chat-inline-runtime-activity.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
