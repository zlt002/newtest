import test from 'node:test';
import assert from 'node:assert/strict';

import { rebindSessionSlotData } from './sessionStoreRebind.ts';
import { __testables__ } from './useSessionStore.ts';

test('rebindSessionSlotData keeps optimistic user messages ahead of target thinking messages', () => {
  const sourceSlot = {
    serverMessages: [],
    realtimeMessages: [
      {
        id: 'local-user-1',
        kind: 'text',
        role: 'user',
        content: '111',
      },
    ],
    fetchedAt: 0,
    total: 0,
    hasMore: false,
    offset: 0,
    tokenUsage: null,
    status: 'idle',
  };

  const targetSlot = {
    serverMessages: [],
    realtimeMessages: [
      {
        id: 'thinking-1',
        kind: 'thinking',
        content: 'Thinking...',
      },
    ],
    fetchedAt: 0,
    total: 0,
    hasMore: false,
    offset: 0,
    tokenUsage: null,
    status: 'idle',
  };

  const rebound = rebindSessionSlotData(sourceSlot, targetSlot);

  assert.deepEqual(
    rebound.realtimeMessages.map((message) => message.id),
    ['local-user-1', 'thinking-1'],
  );
});

test('rebindSessionSlotData de-duplicates messages by id while merging slots', () => {
  const sharedMessage = {
    id: 'shared-1',
    kind: 'thinking',
    content: 'Thinking...',
  };

  const rebound = rebindSessionSlotData(
    {
      serverMessages: [],
      realtimeMessages: [sharedMessage],
      fetchedAt: 1,
      total: 1,
      hasMore: false,
      offset: 1,
      tokenUsage: null,
      status: 'idle',
    },
    {
      serverMessages: [],
      realtimeMessages: [sharedMessage],
      fetchedAt: 2,
      total: 2,
      hasMore: false,
      offset: 2,
      tokenUsage: { used: 1 },
      status: 'streaming',
    },
  );

  assert.equal(rebound.realtimeMessages.length, 1);
  assert.equal(rebound.fetchedAt, 2);
  assert.deepEqual(rebound.tokenUsage, { used: 1 });
});

test('reconcileRealtimeMessages keeps unmatched realtime assistant text during server refresh', () => {
  const reconciled = __testables__.reconcileRealtimeMessages([
    {
      id: 'rt-1',
      kind: 'text',
      role: 'assistant',
      content: '份 PRD，我来创建一份新的。',
      timestamp: '2026-04-17T14:14:35.000Z',
    },
  ], [
    {
      id: 'srv-1',
      kind: 'tool_use',
      toolName: 'Write',
      toolId: 'tool-write-1',
      toolInput: { file_path: '/workspace/PRD.md' },
      timestamp: '2026-04-17T14:14:36.000Z',
    },
  ]);

  assert.equal(reconciled.length, 1);
  assert.equal(reconciled[0].id, 'rt-1');
});

test('reconcileRealtimeMessages drops realtime messages already represented by server history', () => {
  const reconciled = __testables__.reconcileRealtimeMessages([
    {
      id: 'rt-1',
      kind: 'text',
      role: 'assistant',
      content: '最终答案',
      timestamp: '2026-04-17T14:14:35.000Z',
    },
  ], [
    {
      id: 'srv-1',
      kind: 'text',
      role: 'assistant',
      content: '最终答案',
      timestamp: '2026-04-17T14:14:35.500Z',
    },
  ]);

  assert.equal(reconciled.length, 0);
});

test('reconcileRealtimeMessages drops expanded realtime skill prompt when server already has the raw slash input', () => {
  const expandedSkillPrompt = `Base directory for this skill: /Users/demo/.claude/skills/pm-brainstorming

# PM Brainstorming

这里是被展开的 skill prompt 全文。这里是被展开的 skill prompt 全文。这里是被展开的 skill prompt 全文。这里是被展开的 skill prompt 全文。
这里是被展开的 skill prompt 全文。这里是被展开的 skill prompt 全文。这里是被展开的 skill prompt 全文。这里是被展开的 skill prompt 全文。
这里是被展开的 skill prompt 全文。这里是被展开的 skill prompt 全文。这里是被展开的 skill prompt 全文。这里是被展开的 skill prompt 全文。`;

  const reconciled = __testables__.reconcileRealtimeMessages([
    {
      id: 'rt-user-1',
      kind: 'text',
      role: 'user',
      content: expandedSkillPrompt,
      timestamp: '2026-04-21T13:12:28.415Z',
    },
  ], [
    {
      id: 'srv-user-1',
      kind: 'text',
      role: 'user',
      content: '/pm-brainstorming',
      timestamp: '2026-04-21T13:12:28.369Z',
    },
  ]);

  assert.equal(reconciled.length, 0);
});
