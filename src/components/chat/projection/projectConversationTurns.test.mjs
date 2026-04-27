import test from 'node:test';
import assert from 'node:assert/strict';

import { projectHistoricalChatMessages } from './projectHistoricalChatMessages.ts';
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
    pendingDecisionRequests: [],
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

test('projectConversationTurns extracts assistant text blocks from structured history content instead of stringifying them', () => {
  const markdownBody = [
    '# Vue.js 文档总结',
    '',
    '## 概述',
    'Vue.js 是一个渐进式 JavaScript 框架。',
  ].join('\n');

  const turns = projectConversationTurns({
    sessionId: 'sess-structured-history',
    historicalMessages: [
      {
        id: 'user-structured-1',
        sessionId: 'sess-structured-history',
        role: 'user',
        text: '总结 Vue 文档',
        timestamp: '2026-04-26T10:00:00.000Z',
        kind: 'message',
        type: 'message',
      },
      {
        id: 'assistant-structured-1',
        sessionId: 'sess-structured-history',
        role: 'assistant',
        text: '',
        content: [
          {
            type: 'text',
            text: markdownBody,
          },
        ],
        timestamp: '2026-04-26T10:00:05.000Z',
        kind: 'message',
        type: 'message',
      },
    ],
    transientMessages: [],
    realtimeEvents: [],
    pendingDecisionRequests: [],
    isLoading: false,
  });

  assert.equal(turns.length, 2);
  assert.equal(turns[1].kind, 'assistant');
  assert.deepEqual(
    turns[1].bodySegments.map((segment) => [segment.kind, segment.body]),
    [['final', markdownBody]],
  );
  assert.doesNotMatch(turns[1].bodySegments[0].body, /^\s*\[/);
});

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
          kind: 'assistant.message.delta',
          text: '第二轮回复',
        },
      },
    ],
    pendingDecisionRequests: [],
    isLoading: true,
  });

  const assistantTurns = turns.filter((turn) => turn.kind === 'assistant');
  assert.equal(assistantTurns.length, 2);
  assert.equal(assistantTurns[0].anchorMessageId, 'user-1');
  assert.equal(assistantTurns[0].bodySegments.at(-1)?.body, '第一轮长回复');
  assert.equal(assistantTurns[1].anchorMessageId, 'user-2');
  assert.equal(assistantTurns[1].bodySegments.at(-1)?.body, '第二轮回复');
});

test('projectConversationTurns dedupes a transient local user echo once canonical history catches up', () => {
  const userText = '请根据以下 Markdown 标注修改文件 `PRD-CodeLens-AI.md`。';
  const turns = projectConversationTurns({
    sessionId: 'sess-echo',
    historicalMessages: [
      {
        id: 'history-user-1',
        sessionId: 'sess-echo',
        role: 'user',
        text: userText,
        timestamp: '2026-04-24T04:08:10.000Z',
        kind: 'message',
        type: 'message',
      },
      {
        id: 'assistant-1',
        sessionId: 'sess-echo',
        role: 'assistant',
        text: '已读取文件内容。',
        timestamp: '2026-04-24T04:08:18.000Z',
        kind: 'message',
        type: 'message',
      },
    ],
    transientMessages: [
      {
        id: 'local-user-1',
        type: 'user',
        content: userText,
        timestamp: '2026-04-24T04:08:10.500Z',
        normalizedKind: 'text',
      },
    ],
    realtimeEvents: [],
    pendingDecisionRequests: [],
    isLoading: false,
  });

  const userTurns = turns.filter((turn) => turn.kind === 'user');
  assert.equal(userTurns.length, 1);
  assert.equal(userTurns[0].id, 'history-user-1');
});

test('projectConversationTurns does not create fallback assistant turns from projected official history messages', () => {
  const historicalMessages = [
    {
      id: 'session-screenshot-queue-1',
      sessionId: 'sess-screenshot',
      role: 'queue-operation',
      text: '321',
      content: '321',
      timestamp: '2026-04-26T08:54:49.310Z',
      kind: 'text',
      type: 'message',
    },
    {
      id: 'user-321',
      sessionId: 'sess-screenshot',
      role: 'user',
      text: '321',
      content: '321',
      timestamp: '2026-04-26T08:54:49.323Z',
      kind: 'text',
      type: 'message',
    },
    {
      id: 'thinking-321',
      sessionId: 'sess-screenshot',
      role: 'assistant',
      text: 'The user sent "321".',
      content: 'The user sent "321".',
      timestamp: '2026-04-26T08:54:52.201Z',
      kind: 'thinking',
      type: 'thinking',
    },
    {
      id: 'assistant-321',
      sessionId: 'sess-screenshot',
      role: 'assistant',
      text: '你好！看起来你发送了一个简短的消息。',
      content: '你好！看起来你发送了一个简短的消息。',
      timestamp: '2026-04-26T08:54:52.205Z',
      kind: 'text',
      type: 'message',
    },
    {
      id: 'session-screenshot-queue-2',
      sessionId: 'sess-screenshot',
      role: 'queue-operation',
      text: '123',
      content: '123',
      timestamp: '2026-04-26T08:54:55.966Z',
      kind: 'text',
      type: 'message',
    },
    {
      id: 'user-123',
      sessionId: 'sess-screenshot',
      role: 'user',
      text: '123',
      content: '123',
      timestamp: '2026-04-26T08:54:55.970Z',
      kind: 'text',
      type: 'message',
    },
    {
      id: 'thinking-123',
      sessionId: 'sess-screenshot',
      role: 'assistant',
      text: 'The user is just testing with "123".',
      content: 'The user is just testing with "123".',
      timestamp: '2026-04-26T08:54:58.308Z',
      kind: 'thinking',
      type: 'thinking',
    },
    {
      id: 'assistant-123',
      sessionId: 'sess-screenshot',
      role: 'assistant',
      text: '收到！有什么我可以帮忙的吗？',
      content: '收到！有什么我可以帮忙的吗？',
      timestamp: '2026-04-26T08:54:58.309Z',
      kind: 'text',
      type: 'message',
    },
  ];

  const turns = projectConversationTurns({
    sessionId: 'sess-screenshot',
    historicalMessages,
    transientMessages: projectHistoricalChatMessages(historicalMessages),
    realtimeEvents: [],
    pendingDecisionRequests: [],
    isLoading: false,
  });

  assert.deepEqual(
    turns.map((turn) => turn.kind === 'user'
      ? ['user', turn.id, turn.content]
      : ['assistant', turn.anchorMessageId, turn.bodySegments.at(-1)?.body || '', turn.activityItems.map((item) => item.kind).join(',')]),
    [
      ['user', 'user-321', '321'],
      ['assistant', 'user-321', '你好！看起来你发送了一个简短的消息。', 'thinking'],
      ['user', 'user-123', '123'],
      ['assistant', 'user-123', '收到！有什么我可以帮忙的吗？', 'thinking'],
    ],
  );
});

test('projectConversationTurns merges fallback assistant content into the canonical user anchor once history catches up', () => {
  const userText = '请根据以下 Markdown 标注修改文件 `PRD-CodeLens-AI.md`。';
  const assistantText = '已根据要求完成修改。';
  const turns = projectConversationTurns({
    sessionId: 'sess-fallback-merge',
    historicalMessages: [
      {
        id: 'history-user-1',
        sessionId: 'sess-fallback-merge',
        role: 'user',
        text: userText,
        timestamp: '2026-04-24T04:08:10.000Z',
        kind: 'message',
        type: 'message',
      },
      {
        id: 'history-assistant-1',
        sessionId: 'sess-fallback-merge',
        role: 'assistant',
        text: assistantText,
        timestamp: '2026-04-24T04:08:18.000Z',
        kind: 'message',
        type: 'message',
      },
    ],
    transientMessages: [
      {
        id: 'local-user-1',
        messageId: 'local-user-1',
        sessionId: 'sess-fallback-merge',
        type: 'user',
        content: userText,
        timestamp: '2026-04-24T04:08:10.500Z',
        normalizedKind: 'text',
      },
      {
        id: 'local-assistant-1',
        messageId: 'local-assistant-1',
        sessionId: 'sess-fallback-merge',
        type: 'assistant',
        content: assistantText,
        timestamp: '2026-04-24T04:08:18.500Z',
        normalizedKind: 'text',
      },
    ],
    realtimeEvents: [],
    pendingDecisionRequests: [],
    isLoading: false,
  });

  const assistantTurns = turns.filter((turn) => turn.kind === 'assistant');
  assert.equal(assistantTurns.length, 1);
  assert.equal(assistantTurns[0].anchorMessageId, 'history-user-1');
  assert.deepEqual(
    assistantTurns[0].bodySegments.map((segment) => segment.body),
    [assistantText],
  );
});

test('projectConversationTurns 在 realtime 和历史都未就绪时，仍会把最新瞬时 assistant 回复投影到屏幕上', () => {
  const turns = projectConversationTurns({
    sessionId: 'sess-transient',
    historicalMessages: [],
    transientMessages: [
      {
        id: 'user-transient-1',
        messageId: 'user-transient-1',
        sessionId: 'sess-transient',
        type: 'user',
        content: '你好',
        timestamp: '2026-04-24T04:20:00.000Z',
        normalizedKind: 'text',
      },
      {
        id: 'assistant-transient-1',
        messageId: 'assistant-transient-1',
        sessionId: 'sess-transient',
        type: 'assistant',
        content: '你好！请问有什么需要我帮忙的？',
        timestamp: '2026-04-24T04:20:02.000Z',
        normalizedKind: 'text',
      },
    ],
    realtimeEvents: [],
    pendingDecisionRequests: [],
    isLoading: false,
  });

  assert.equal(turns.length, 2);
  assert.equal(turns[0].kind, 'user');
  assert.equal(turns[1].kind, 'assistant');
  assert.equal(turns[1].anchorMessageId, 'user-transient-1');
  assert.equal(turns[1].source, 'fallback');
  assert.equal(turns[1].status, 'completed');
  assert.deepEqual(
    turns[1].bodySegments.map((segment) => [segment.kind, segment.body]),
    [['final', '你好！请问有什么需要我帮忙的？']],
  );
});

test('projectConversationTurns 在新的 user turn 到来但下一轮 assistant 尚未出现时，仍保留之前各轮瞬时 assistant 回复', () => {
  const turns = projectConversationTurns({
    sessionId: 'sess-transient-multi-round',
    historicalMessages: [],
    transientMessages: [
      {
        id: 'user-transient-1',
        messageId: 'user-transient-1',
        sessionId: 'sess-transient-multi-round',
        type: 'user',
        content: '第一问',
        timestamp: '2026-04-24T04:20:00.000Z',
        normalizedKind: 'text',
      },
      {
        id: 'assistant-transient-1',
        messageId: 'assistant-transient-1',
        sessionId: 'sess-transient-multi-round',
        type: 'assistant',
        content: '第一答',
        timestamp: '2026-04-24T04:20:02.000Z',
        normalizedKind: 'text',
      },
      {
        id: 'user-transient-2',
        messageId: 'user-transient-2',
        sessionId: 'sess-transient-multi-round',
        type: 'user',
        content: '第二问',
        timestamp: '2026-04-24T04:21:00.000Z',
        normalizedKind: 'text',
      },
      {
        id: 'assistant-transient-2',
        messageId: 'assistant-transient-2',
        sessionId: 'sess-transient-multi-round',
        type: 'assistant',
        content: '第二答',
        timestamp: '2026-04-24T04:21:02.000Z',
        normalizedKind: 'text',
      },
      {
        id: 'user-transient-3',
        messageId: 'user-transient-3',
        sessionId: 'sess-transient-multi-round',
        type: 'user',
        content: '第三问',
        timestamp: '2026-04-24T04:22:00.000Z',
        normalizedKind: 'text',
      },
    ],
    realtimeEvents: [],
    pendingDecisionRequests: [],
    isLoading: true,
  });

  assert.deepEqual(
    turns.map((turn) => turn.kind === 'user' ? ['user', turn.content] : ['assistant', turn.bodySegments.at(-1)?.body || '']),
    [
      ['user', '第一问'],
      ['assistant', '第一答'],
      ['user', '第二问'],
      ['assistant', '第二答'],
      ['user', '第三问'],
    ],
  );
});

test('projectConversationTurns merges live and historical assistant cards for the same user anchor', () => {
  const turns = projectConversationTurns({
    sessionId: 'sess-merge',
    historicalMessages: [
      {
        id: 'user-1',
        sessionId: 'sess-merge',
        role: 'user',
        text: '请修改 PRD 文档',
        timestamp: '2026-04-24T05:04:40.000Z',
        kind: 'message',
        type: 'message',
      },
      {
        id: 'tool-1',
        sessionId: 'sess-merge',
        role: 'tool',
        text: '{"file_path":"/tmp/PRD.md"}',
        timestamp: '2026-04-24T05:04:48.000Z',
        kind: 'tool_use',
        type: 'tool_use',
      },
      {
        id: 'assistant-1',
        sessionId: 'sess-merge',
        role: 'assistant',
        text: '已完成修改。',
        timestamp: '2026-04-24T05:05:02.000Z',
        kind: 'message',
        type: 'message',
      },
    ],
    transientMessages: [],
    realtimeEvents: [
      {
        id: 'evt-thinking',
        sessionId: 'sess-merge',
        runId: 'run-merge',
        timestamp: '2026-04-24T05:04:47.000Z',
        type: 'sdk.message',
        message: {
          kind: 'thinking',
          text: 'The user wants me to modify a specific section.',
        },
      },
      {
        id: 'evt-completed',
        sessionId: 'sess-merge',
        runId: 'run-merge',
        timestamp: '2026-04-24T05:05:03.000Z',
        type: 'session.status',
        status: 'completed',
        detail: 'done',
      },
    ],
    pendingDecisionRequests: [],
    isLoading: false,
  });

  const assistantTurns = turns.filter((turn) => turn.kind === 'assistant');
  assert.equal(assistantTurns.length, 1);
  assert.equal(assistantTurns[0].anchorMessageId, 'user-1');
  assert.equal(assistantTurns[0].source, 'mixed');
  assert.deepEqual(
    assistantTurns[0].activityItems.map((item) => item.id),
    ['evt-thinking', 'tool-1'],
  );
  assert.equal(assistantTurns[0].bodySegments.at(-1)?.body, '已完成修改。');
});

test('projectConversationTurns 合并历史与 realtime 相同 assistant 文本时会去重，避免同一句话连续显示两次', () => {
  const turns = projectConversationTurns({
    sessionId: 'sess-duplicate-body',
    historicalMessages: [
      {
        id: 'user-1',
        sessionId: 'sess-duplicate-body',
        role: 'user',
        text: '继续源码探索',
        timestamp: '2026-04-24T05:15:00.000Z',
        kind: 'message',
        type: 'message',
      },
      {
        id: 'assistant-1',
        sessionId: 'sess-duplicate-body',
        role: 'assistant',
        text: '发现所有 8 个需求都尚未进行源码探索。由于 sales-data-dashboard 是刚创建的最新需求，让我们确认一下。',
        timestamp: '2026-04-24T05:15:02.000Z',
        kind: 'message',
        type: 'message',
      },
    ],
    transientMessages: [],
    realtimeEvents: [
      {
        id: 'evt-same-body',
        sessionId: 'sess-duplicate-body',
        runId: 'run-duplicate-body',
        timestamp: '2026-04-24T05:15:02.500Z',
        type: 'sdk.message',
        message: {
          kind: 'assistant.message.delta',
          text: '发现所有 8 个需求都尚未进行源码探索。由于 sales-data-dashboard 是刚创建的最新需求，让我们确认一下。',
        },
      },
    ],
    pendingDecisionRequests: [],
    isLoading: true,
  });

  const assistantTurn = turns.find((turn) => turn.kind === 'assistant');
  assert.equal(assistantTurn?.bodySegments.length, 1);
  assert.equal(
    assistantTurn?.bodySegments[0]?.body,
    '发现所有 8 个需求都尚未进行源码探索。由于 sales-data-dashboard 是刚创建的最新需求，让我们确认一下。',
  );
});

test('projectConversationTurns 合并历史与 realtime 的相同过程项时会去重，避免过程时间线出现两条一模一样的记录', () => {
  const turns = projectConversationTurns({
    sessionId: 'sess-duplicate-activity',
    historicalMessages: [
      {
        id: 'user-1',
        sessionId: 'sess-duplicate-activity',
        role: 'user',
        text: '222',
        timestamp: '2026-04-27T11:36:27.000Z',
        kind: 'message',
        type: 'message',
      },
      {
        id: 'thinking-history-1',
        sessionId: 'sess-duplicate-activity',
        role: 'assistant',
        text: 'The user sent "222" which seems like they are testing or just typing random characters. Let me just ask them what they need.',
        timestamp: '2026-04-27T11:36:30.000Z',
        kind: 'thinking',
        type: 'thinking',
      },
      {
        id: 'assistant-1',
        sessionId: 'sess-duplicate-activity',
        role: 'assistant',
        text: '你是想确认一下我在不在，还是对 PRD 有什么修改意见？随时说。',
        timestamp: '2026-04-27T11:36:31.000Z',
        kind: 'message',
        type: 'message',
      },
    ],
    transientMessages: [],
    realtimeEvents: [
      {
        id: 'thinking-live-1',
        sessionId: 'sess-duplicate-activity',
        runId: 'run-duplicate-activity',
        timestamp: '2026-04-27T11:36:30.100Z',
        type: 'sdk.message',
        message: {
          kind: 'thinking',
          text: 'The user sent "222" which seems like they are testing or just typing random characters. Let me just ask them what they need.',
        },
      },
      {
        id: 'evt-completed',
        sessionId: 'sess-duplicate-activity',
        runId: 'run-duplicate-activity',
        timestamp: '2026-04-27T11:36:31.100Z',
        type: 'session.status',
        status: 'completed',
        detail: 'done',
      },
    ],
    pendingDecisionRequests: [],
    isLoading: false,
  });

  const assistantTurn = turns.find((turn) => turn.kind === 'assistant');
  assert.equal(assistantTurn?.source, 'mixed');
  assert.deepEqual(
    assistantTurn?.activityItems.map((item) => item.body),
    ['The user sent "222" which seems like they are testing or just typing random characters. Let me just ask them what they need.'],
  );
});

test('projectConversationTurns 在历史已完成但 realtime 正等待审批时，不会额外生成第二个审批卡', () => {
  const turns = projectConversationTurns({
    sessionId: 'sess-approval-merge',
    historicalMessages: [
      {
        id: 'user-1',
        sessionId: 'sess-approval-merge',
        role: 'user',
        text: '请修改文件',
        timestamp: '2026-04-24T05:10:00.000Z',
        kind: 'message',
        type: 'message',
      },
      {
        id: 'assistant-1',
        sessionId: 'sess-approval-merge',
        role: 'assistant',
        text: '我先检查一下改动范围。',
        timestamp: '2026-04-24T05:10:02.000Z',
        kind: 'message',
        type: 'message',
      },
    ],
    transientMessages: [],
    realtimeEvents: [
      {
        id: 'evt-permission',
        sessionId: 'sess-approval-merge',
        runId: 'run-approval',
        timestamp: '2026-04-24T05:10:03.000Z',
        type: 'interaction.required',
        requestId: 'perm-1',
        interaction: {
          kind: 'permission',
          toolName: 'Edit',
          message: '是否允许修改文件？',
          input: { file_path: '/tmp/example.ts' },
        },
      },
    ],
    pendingDecisionRequests: [
      {
        requestId: 'perm-1',
        sessionId: 'sess-approval-merge',
        toolName: 'Edit',
        input: { file_path: '/tmp/example.ts' },
        context: '需要授权修改文件',
        receivedAt: new Date('2026-04-24T05:10:03.000Z'),
        kind: 'permission_request',
      },
    ],
    isLoading: true,
  });

  const assistantTurns = turns.filter((turn) => turn.kind === 'assistant');
  assert.equal(assistantTurns.length, 1);
  assert.equal(assistantTurns[0].status, 'waiting_for_input');
  assert.equal(assistantTurns[0].activeInteraction?.requestId, 'perm-1');
  assert.equal(assistantTurns[0].anchorMessageId, 'user-1');
  assert.equal(
    assistantTurns[0].activityItems.filter((item) => item.id === 'perm-1').length,
    1,
  );
});

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
    pendingDecisionRequests: [
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

test('projectConversationTurns treats question-shaped pending requests as interactive prompts without tool-name inference', () => {
  const turns = projectConversationTurns({
    sessionId: 'sess-question',
    historicalMessages: [],
    transientMessages: [],
    realtimeEvents: [],
    pendingDecisionRequests: [
      {
        requestId: 'question-1',
        sessionId: 'sess-question',
        toolName: 'CustomQuestionTool',
        input: {
          questions: [
            {
              question: '请选择处理方式',
              options: [{ label: '继续' }, { label: '停止' }],
            },
          ],
        },
        receivedAt: new Date('2026-04-24T06:00:00.000Z'),
      },
    ],
    isLoading: true,
  });

  const assistantTurn = turns.find((turn) => turn.kind === 'assistant');
  assert.equal(assistantTurn?.status, 'waiting_for_input');
  assert.equal(assistantTurn?.headline, '等待你的回答');
  assert.equal(assistantTurn?.activeInteraction?.kind, 'interactive_prompt');
  assert.equal(assistantTurn?.activeInteraction?.toolName, 'CustomQuestionTool');
});

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
    pendingDecisionRequests: [],
    isLoading: false,
  });

  const userTurns = turns.filter((turn) => turn.kind === 'user');
  assert.equal(userTurns.length, 1);
  assert.equal(userTurns[0].id, 'user-slash');
});

test('projectConversationTurns filters expanded skill prompts even after history refresh drops the raw slash command', () => {
  const turns = projectConversationTurns({
    sessionId: 'sess-skill-refresh',
    historicalMessages: [
      {
        id: 'user-expanded',
        sessionId: 'sess-skill-refresh',
        role: 'user',
        text: 'Base directory for this skill: /Users/demo/.claude/skills/gen-image\nFull expanded instructions...',
        timestamp: '2026-04-24T05:00:01.000Z',
        kind: 'message',
        type: 'message',
      },
      {
        id: 'assistant-1',
        sessionId: 'sess-skill-refresh',
        role: 'assistant',
        text: '我会继续处理图片生成。',
        timestamp: '2026-04-24T05:00:02.000Z',
        kind: 'message',
        type: 'message',
      },
    ],
    transientMessages: [],
    realtimeEvents: [],
    pendingDecisionRequests: [],
    isLoading: false,
  });

  assert.equal(turns.some((turn) => turn.kind === 'user'), false);
  const assistantTurn = turns.find((turn) => turn.kind === 'assistant');
  assert.equal(assistantTurn?.anchorMessageId, '');
  assert.equal(assistantTurn?.bodySegments.at(-1)?.body, '我会继续处理图片生成。');
});

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
    pendingDecisionRequests: [],
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

test('projectConversationTurns does not let an older anchored assistant turn absorb text that lands after the next user turn starts', () => {
  const turns = projectConversationTurns({
    sessionId: 'sess-anchor-window',
    historicalMessages: [
      {
        id: 'history-user-1',
        sessionId: 'sess-anchor-window',
        role: 'user',
        text: '11111111',
        timestamp: '2026-04-26T09:40:31.000Z',
        kind: 'message',
        type: 'message',
      },
      {
        id: 'history-assistant-1',
        sessionId: 'sess-anchor-window',
        role: 'assistant',
        text: '你好！有什么我可以帮助你的吗？',
        timestamp: '2026-04-26T09:40:33.000Z',
        kind: 'message',
        type: 'message',
      },
    ],
    transientMessages: [
      {
        id: 'local-user-2',
        messageId: 'local-user-2',
        sessionId: 'sess-anchor-window',
        type: 'user',
        content: '222',
        timestamp: '2026-04-26T09:40:40.000Z',
        normalizedKind: 'text',
      },
    ],
    realtimeEvents: [
      {
        id: 'evt-old-run-start',
        runId: 'run-misanchored',
        sessionId: 'sess-anchor-window',
        timestamp: '2026-04-26T09:40:34.000Z',
        type: 'session.status',
        status: 'starting',
        detail: 'run started before the new user echo became visible',
      },
      {
        id: 'evt-old-run-delta',
        runId: 'run-misanchored',
        sessionId: 'sess-anchor-window',
        timestamp: '2026-04-26T09:40:40.500Z',
        type: 'sdk.message',
        message: {
          kind: 'assistant.message.delta',
          text: '222',
        },
      },
    ],
    pendingDecisionRequests: [],
    isLoading: true,
  });

  const assistantTurns = turns.filter((turn) => turn.kind === 'assistant');
  assert.equal(assistantTurns.length, 1);
  assert.deepEqual(
    assistantTurns[0].bodySegments.map((segment) => segment.body),
    ['你好！有什么我可以帮助你的吗？'],
  );
});

test('projectConversationTurns does not project the previous assistant reply onto the next user turn when the next run only has a starting status', () => {
  const turns = projectConversationTurns({
    sessionId: 'sess-starting-only',
    historicalMessages: [
      {
        id: 'history-user-1',
        sessionId: 'sess-starting-only',
        role: 'user',
        text: '123',
        timestamp: '2026-04-26T13:44:36.000Z',
        kind: 'message',
        type: 'message',
      },
      {
        id: 'history-assistant-1',
        sessionId: 'sess-starting-only',
        role: 'assistant',
        text: '你好！有什么我可以帮助你的吗？',
        timestamp: '2026-04-26T13:44:38.000Z',
        kind: 'message',
        type: 'message',
      },
    ],
    transientMessages: [
      {
        id: 'local-user-2',
        messageId: 'local-user-2',
        sessionId: 'sess-starting-only',
        type: 'user',
        content: '321',
        timestamp: '2026-04-26T13:44:41.000Z',
        normalizedKind: 'text',
      },
    ],
    realtimeEvents: [
      {
        id: 'evt-run-1-completed',
        runId: 'run-1',
        sessionId: 'sess-starting-only',
        timestamp: '2026-04-26T13:44:39.000Z',
        type: 'session.status',
        status: 'completed',
        detail: 'first run completed',
      },
      {
        id: 'evt-run-2-starting',
        runId: 'run-2',
        sessionId: 'sess-starting-only',
        timestamp: '2026-04-26T13:44:41.000Z',
        type: 'session.status',
        status: 'starting',
        detail: 'second run started',
      },
    ],
    pendingDecisionRequests: [],
    isLoading: true,
  });

  const userTurns = turns.filter((turn) => turn.kind === 'user');
  const assistantTurns = turns.filter((turn) => turn.kind === 'assistant');

  assert.deepEqual(userTurns.map((turn) => turn.content), ['123', '321']);
  assert.equal(assistantTurns.length, 2);
  assert.equal(assistantTurns[0].anchorMessageId, 'history-user-1');
  assert.deepEqual(
    assistantTurns[0].bodySegments.map((segment) => segment.body),
    ['你好！有什么我可以帮助你的吗？'],
  );
  assert.equal(assistantTurns[1].anchorMessageId, 'local-user-2');
  assert.deepEqual(assistantTurns[1].bodySegments, []);
  assert.deepEqual(
    assistantTurns[1].activityItems.map((item) => item.body),
    ['starting\n\nsecond run started'],
  );
});

test('projectConversationTurns drops fallback assistant content whose timestamp is older than its anchor user even if local message order is stale', () => {
  const turns = projectConversationTurns({
    sessionId: 'sess-stale-local-order',
    historicalMessages: [
      {
        id: 'history-user-1',
        sessionId: 'sess-stale-local-order',
        role: 'user',
        text: '123',
        timestamp: '2026-04-26T13:44:36.000Z',
        kind: 'message',
        type: 'message',
      },
      {
        id: 'history-assistant-1',
        sessionId: 'sess-stale-local-order',
        role: 'assistant',
        text: '你好！有什么我可以帮助你的吗？',
        timestamp: '2026-04-26T13:44:38.000Z',
        kind: 'message',
        type: 'message',
      },
    ],
    transientMessages: [
      {
        id: 'local-user-1',
        messageId: 'local-user-1',
        sessionId: 'sess-stale-local-order',
        type: 'user',
        content: '123',
        timestamp: '2026-04-26T13:44:36.000Z',
        normalizedKind: 'text',
      },
      {
        id: 'local-user-2',
        messageId: 'local-user-2',
        sessionId: 'sess-stale-local-order',
        type: 'user',
        content: '321',
        timestamp: '2026-04-26T13:44:41.000Z',
        normalizedKind: 'text',
      },
      {
        id: 'stale-assistant-after-new-user',
        messageId: 'stale-assistant-after-new-user',
        sessionId: 'sess-stale-local-order',
        type: 'assistant',
        content: '你好！有什么我可以帮助你的吗？',
        timestamp: '2026-04-26T13:44:38.000Z',
        normalizedKind: 'text',
      },
    ],
    realtimeEvents: [
      {
        id: 'evt-run-2-starting',
        runId: 'run-2',
        sessionId: 'sess-stale-local-order',
        timestamp: '2026-04-26T13:44:41.000Z',
        type: 'session.status',
        status: 'starting',
        detail: 'second run started',
      },
    ],
    pendingDecisionRequests: [],
    isLoading: true,
  });

  const assistantTurns = turns.filter((turn) => turn.kind === 'assistant');
  assert.equal(assistantTurns.length, 2);
  assert.equal(assistantTurns[0].anchorMessageId, 'history-user-1');
  assert.deepEqual(
    assistantTurns[0].bodySegments.map((segment) => segment.body),
    ['你好！有什么我可以帮助你的吗？'],
  );
  assert.equal(assistantTurns[1].anchorMessageId, 'local-user-2');
  assert.deepEqual(assistantTurns[1].bodySegments, []);
  assert.deepEqual(
    assistantTurns[1].activityItems.map((item) => item.body),
    ['starting\n\nsecond run started'],
  );
});

test('projectConversationTurns drops assistant content that predates its anchor user even when live run cards were mis-anchored forward', () => {
  const turns = projectConversationTurns({
    sessionId: 'sess-pre-anchor-live',
    historicalMessages: [
      {
        id: 'history-user-1',
        sessionId: 'sess-pre-anchor-live',
        role: 'user',
        text: '123',
        timestamp: '2026-04-26T13:44:36.000Z',
        kind: 'message',
        type: 'message',
      },
      {
        id: 'history-assistant-1',
        sessionId: 'sess-pre-anchor-live',
        role: 'assistant',
        text: '你好！有什么我可以帮助你的吗？',
        timestamp: '2026-04-26T13:44:38.000Z',
        kind: 'message',
        type: 'message',
      },
    ],
    transientMessages: [
      {
        id: 'local-user-2',
        messageId: 'local-user-2',
        sessionId: 'sess-pre-anchor-live',
        type: 'user',
        content: '321',
        timestamp: '2026-04-26T13:44:41.000Z',
        normalizedKind: 'text',
      },
    ],
    realtimeEvents: [
      {
        id: 'evt-run-2-starting',
        runId: 'run-2',
        sessionId: 'sess-pre-anchor-live',
        timestamp: '2026-04-26T13:44:41.000Z',
        type: 'session.status',
        status: 'starting',
        detail: 'second run started',
      },
      {
        id: 'evt-run-2-stale-delta',
        runId: 'run-2',
        sessionId: 'sess-pre-anchor-live',
        timestamp: '2026-04-26T13:44:38.500Z',
        type: 'sdk.message',
        message: {
          kind: 'assistant.message.delta',
          text: '你好！有什么我可以帮助你的吗？',
        },
      },
    ],
    pendingDecisionRequests: [],
    isLoading: true,
  });

  const assistantTurns = turns.filter((turn) => turn.kind === 'assistant');
  assert.equal(assistantTurns.length, 2);
  assert.equal(assistantTurns[1].anchorMessageId, 'local-user-2');
  assert.deepEqual(assistantTurns[1].bodySegments, []);
  assert.deepEqual(
    assistantTurns[1].activityItems.map((item) => item.body),
    ['starting\n\nsecond run started'],
  );
});

test('projectConversationTurns dedupes repeated fallback assistant text and keeps the next user turn out of the previous assistant card', () => {
  const turns = projectConversationTurns({
    sessionId: 'sess-screenshot-regression',
    historicalMessages: [
      {
        id: 'history-user-1',
        sessionId: 'sess-screenshot-regression',
        role: 'user',
        text: '123',
        timestamp: '2026-04-26T17:24:39.000Z',
        kind: 'message',
        type: 'message',
      },
      {
        id: 'history-assistant-1',
        sessionId: 'sess-screenshot-regression',
        role: 'assistant',
        text: '你好！有什么我可以帮你的吗？',
        timestamp: '2026-04-26T17:24:41.000Z',
        kind: 'message',
        type: 'message',
      },
      {
        id: 'history-user-2',
        sessionId: 'sess-screenshot-regression',
        role: 'user',
        text: '321',
        timestamp: '2026-04-26T17:24:44.000Z',
        kind: 'message',
        type: 'message',
      },
    ],
    transientMessages: [
      {
        id: 'history-user-1',
        messageId: 'history-user-1',
        sessionId: 'sess-screenshot-regression',
        type: 'user',
        content: '123',
        timestamp: '2026-04-26T17:24:39.000Z',
        normalizedKind: 'text',
      },
      {
        id: 'history-assistant-1',
        messageId: 'history-assistant-1',
        sessionId: 'sess-screenshot-regression',
        type: 'assistant',
        content: '你好！有什么我可以帮你的吗？',
        timestamp: '2026-04-26T17:24:41.000Z',
        normalizedKind: 'text',
      },
      {
        id: 'history-user-2',
        messageId: 'history-user-2',
        sessionId: 'sess-screenshot-regression',
        type: 'user',
        content: '321',
        timestamp: '2026-04-26T17:24:44.000Z',
        normalizedKind: 'text',
      },
      {
        id: 'local-assistant-2a',
        messageId: 'local-assistant-2a',
        sessionId: 'sess-screenshot-regression',
        type: 'assistant',
        content: '有什么我可以帮你的吗？',
        timestamp: '2026-04-26T17:24:46.000Z',
        normalizedKind: 'text',
      },
      {
        id: 'local-assistant-2b',
        messageId: 'local-assistant-2b',
        sessionId: 'sess-screenshot-regression',
        type: 'assistant',
        content: '有什么我可以帮你的吗？',
        timestamp: '2026-04-26T17:24:46.100Z',
        normalizedKind: 'text',
      },
      {
        id: 'local-user-3',
        messageId: 'local-user-3',
        sessionId: 'sess-screenshot-regression',
        type: 'user',
        content: '567',
        timestamp: '2026-04-26T17:24:52.000Z',
        normalizedKind: 'text',
      },
    ],
    realtimeEvents: [],
    pendingDecisionRequests: [],
    isLoading: true,
  });

  const userTurns = turns.filter((turn) => turn.kind === 'user');
  const assistantTurns = turns.filter((turn) => turn.kind === 'assistant');

  assert.deepEqual(userTurns.map((turn) => turn.content), ['123', '321', '567']);
  assert.equal(assistantTurns.length, 2);
  assert.equal(assistantTurns[1].anchorMessageId, 'history-user-2');
  assert.deepEqual(
    assistantTurns[1].bodySegments.map((segment) => segment.body),
    ['有什么我可以帮你的吗？'],
  );
});
