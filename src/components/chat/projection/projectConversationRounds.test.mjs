import test from 'node:test';
import assert from 'node:assert/strict';

import { projectConversationRounds } from './projectConversationRounds.ts';

test('projectConversationRounds emits one round with one user message and one assistant card', async () => {
  const rounds = projectConversationRounds({
    sessionId: 'sess-1',
    conversationTurns: [
      {
        kind: 'user',
        id: 'user-1',
        sessionId: 'sess-1',
        content: '111',
        timestamp: '2026-04-26T10:00:00.000Z',
        source: 'transient',
      },
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

  assert.equal(rounds.length, 1);
  assert.deepEqual(rounds[0].userMessage, {
    id: 'user-1',
    sessionId: 'sess-1',
    content: '111',
    images: [],
    timestamp: '2026-04-26T10:00:00.000Z',
  });
  assert.equal(rounds[0].assistantCard.id, 'assistant-1');
  assert.equal(rounds[0].assistantCard.anchorMessageId, 'user-1');
});

test('projectConversationRounds preserves user images on the round user message', () => {
  const rounds = projectConversationRounds({
    sessionId: 'sess-image-round',
    conversationTurns: [
      {
        kind: 'user',
        id: 'user-image-1',
        sessionId: 'sess-image-round',
        content: '图片内容是啥呢',
        images: [
          {
            name: 'capture.png',
            data: 'data:image/png;base64,QUJD',
          },
        ],
        timestamp: '2026-04-26T10:00:00.000Z',
        source: 'transient',
      },
    ],
  });

  assert.equal(rounds.length, 1);
  assert.deepEqual(rounds[0].userMessage, {
    id: 'user-image-1',
    sessionId: 'sess-image-round',
    content: '图片内容是啥呢',
    images: [
      {
        name: 'capture.png',
        data: 'data:image/png;base64,QUJD',
      },
    ],
    timestamp: '2026-04-26T10:00:00.000Z',
  });
});

test('projectConversationRounds accumulates phase responses into one assistant card and previews only the latest five process items', () => {
  const rounds = projectConversationRounds({
    sessionId: 'sess-accumulate',
    conversationTurns: [
      {
        kind: 'user',
        id: 'user-1',
        sessionId: 'sess-accumulate',
        content: '开始',
        timestamp: '2026-04-26T10:00:00.000Z',
        source: 'transient',
      },
      {
        kind: 'assistant',
        id: 'assistant-1-phase-1',
        sessionId: 'sess-accumulate',
        runId: 'run-1',
        anchorMessageId: 'user-1',
        status: 'running',
        headline: '执行中',
        activityItems: [
          {
            id: 'process-1',
            timestamp: '2026-04-26T10:00:01.000Z',
            kind: 'status',
            title: '步骤 1',
            body: '处理 1',
            tone: 'neutral',
          },
          {
            id: 'process-2',
            timestamp: '2026-04-26T10:00:02.000Z',
            kind: 'status',
            title: '步骤 2',
            body: '处理 2',
            tone: 'neutral',
          },
          {
            id: 'process-3',
            timestamp: '2026-04-26T10:00:03.000Z',
            kind: 'status',
            title: '步骤 3',
            body: '处理 3',
            tone: 'neutral',
          },
        ],
        bodySegments: [
          {
            id: 'segment-1',
            timestamp: '2026-04-26T10:00:01.500Z',
            kind: 'phase',
            body: '第一阶段',
          },
        ],
        activeInteraction: null,
        startedAt: '2026-04-26T10:00:01.000Z',
        updatedAt: '2026-04-26T10:00:03.000Z',
        completedAt: null,
        source: 'sdk-live',
      },
      {
        kind: 'assistant',
        id: 'assistant-1-phase-2',
        sessionId: 'sess-accumulate',
        runId: 'run-1',
        anchorMessageId: 'user-1',
        status: 'completed',
        headline: '已完成',
        activityItems: [
          {
            id: 'process-4',
            timestamp: '2026-04-26T10:00:04.000Z',
            kind: 'status',
            title: '步骤 4',
            body: '处理 4',
            tone: 'neutral',
          },
          {
            id: 'process-5',
            timestamp: '2026-04-26T10:00:05.000Z',
            kind: 'status',
            title: '步骤 5',
            body: '处理 5',
            tone: 'neutral',
          },
          {
            id: 'process-6',
            timestamp: '2026-04-26T10:00:06.000Z',
            kind: 'status',
            title: '步骤 6',
            body: '处理 6',
            tone: 'neutral',
          },
        ],
        bodySegments: [
          {
            id: 'segment-2',
            timestamp: '2026-04-26T10:00:05.500Z',
            kind: 'final',
            body: '最终回复',
          },
        ],
        activeInteraction: null,
        startedAt: '2026-04-26T10:00:01.000Z',
        updatedAt: '2026-04-26T10:00:06.000Z',
        completedAt: '2026-04-26T10:00:06.000Z',
        source: 'sdk-live',
      },
    ],
  });

  assert.equal(rounds.length, 1);
  assert.deepEqual(
    rounds[0].assistantCard.responseSegments.map((segment) => [segment.kind, segment.body]),
    [
      ['phase', '第一阶段'],
      ['final', '最终回复'],
    ],
  );
  assert.deepEqual(
    rounds[0].assistantCard.processItems.map((item) => item.id),
    ['process-1', 'process-2', 'process-3', 'process-4', 'process-5', 'process-6'],
  );
  assert.deepEqual(
    rounds[0].assistantCard.previewItems.map((item) => item.id),
    ['process-2', 'process-3', 'process-4', 'process-5', 'process-6'],
  );
});

test('projectConversationRounds merges fallback run card content into the same round when only the user turn exists', () => {
  const rounds = projectConversationRounds({
    sessionId: 'sess-fallback',
    conversationTurns: [
      {
        kind: 'user',
        id: 'user-1',
        sessionId: 'sess-fallback',
        content: '帮我继续',
        timestamp: '2026-04-26T10:00:00.000Z',
        source: 'transient',
      },
    ],
    fallbackRunCards: [
      {
        sessionId: 'sess-fallback',
        anchorMessageId: 'user-1',
        cardStatus: 'starting',
        headline: '执行中',
        finalResponse: '已经接上 fallback 内容',
        responseMessages: [
          {
            id: 'fallback-final',
            timestamp: '2026-04-26T10:00:02.000Z',
            kind: 'final',
            body: '已经接上 fallback 内容',
          },
        ],
        processItems: [
          {
            id: 'fallback-process-1',
            timestamp: '2026-04-26T10:00:01.000Z',
            kind: 'thinking',
            title: 'Thinking',
            body: '正在恢复执行上下文',
          },
        ],
        previewItems: [
          {
            id: 'fallback-process-1',
            timestamp: '2026-04-26T10:00:01.000Z',
            kind: 'thinking',
            title: 'Thinking',
            body: '正在恢复执行上下文',
          },
        ],
        activeInteraction: null,
        startedAt: '2026-04-26T10:00:01.000Z',
        updatedAt: '2026-04-26T10:00:02.000Z',
        completedAt: null,
        defaultExpanded: false,
        source: 'fallback',
        runId: 'run-fallback-1',
      },
    ],
  });

  assert.equal(rounds.length, 1);
  assert.equal(rounds[0].assistantCard.status, 'starting');
  assert.equal(rounds[0].assistantCard.headline, '执行中');
  assert.equal(rounds[0].assistantCard.source, 'fallback');
  assert.deepEqual(
    rounds[0].assistantCard.responseSegments.map((segment) => [segment.kind, segment.body]),
    [['final', '已经接上 fallback 内容']],
  );
  assert.deepEqual(
    rounds[0].assistantCard.processItems.map((item) => item.body),
    ['正在恢复执行上下文'],
  );
});

test('projectConversationRounds does not let an earlier assistant card absorb content after the next user turn starts', () => {
  const rounds = projectConversationRounds({
    sessionId: 'sess-close',
    conversationTurns: [
      {
        kind: 'user',
        id: 'user-1',
        sessionId: 'sess-close',
        content: '第一问',
        timestamp: '2026-04-26T10:00:00.000Z',
        source: 'official-history',
      },
      {
        kind: 'assistant',
        id: 'assistant-1',
        sessionId: 'sess-close',
        runId: 'run-1',
        anchorMessageId: 'user-1',
        status: 'completed',
        headline: '已完成',
        activityItems: [],
        bodySegments: [
          {
            id: 'segment-1',
            timestamp: '2026-04-26T10:00:01.000Z',
            kind: 'final',
            body: '第一答',
          },
        ],
        activeInteraction: null,
        startedAt: '2026-04-26T10:00:01.000Z',
        updatedAt: '2026-04-26T10:00:01.000Z',
        completedAt: '2026-04-26T10:00:01.000Z',
        source: 'official-history',
      },
      {
        kind: 'user',
        id: 'user-2',
        sessionId: 'sess-close',
        content: '第二问',
        timestamp: '2026-04-26T10:01:00.000Z',
        source: 'official-history',
      },
      {
        kind: 'assistant',
        id: 'assistant-2',
        sessionId: 'sess-close',
        runId: 'run-2',
        anchorMessageId: 'user-2',
        status: 'running',
        headline: '执行中',
        activityItems: [],
        bodySegments: [
          {
            id: 'segment-2',
            timestamp: '2026-04-26T10:01:01.000Z',
            kind: 'phase',
            body: '第二轮阶段回复',
          },
        ],
        activeInteraction: null,
        startedAt: '2026-04-26T10:01:01.000Z',
        updatedAt: '2026-04-26T10:01:01.000Z',
        completedAt: null,
        source: 'sdk-live',
      },
      {
        kind: 'assistant',
        id: 'assistant-1-late',
        sessionId: 'sess-close',
        runId: 'run-1',
        anchorMessageId: 'user-1',
        status: 'completed',
        headline: '已完成',
        activityItems: [],
        bodySegments: [
          {
            id: 'segment-3',
            timestamp: '2026-04-26T10:01:02.000Z',
            kind: 'final',
            body: '迟到内容',
          },
        ],
        activeInteraction: null,
        startedAt: '2026-04-26T10:00:01.000Z',
        updatedAt: '2026-04-26T10:01:02.000Z',
        completedAt: '2026-04-26T10:01:02.000Z',
        source: 'sdk-live',
      },
    ],
  });

  assert.equal(rounds.length, 2);
  assert.deepEqual(
    rounds[0].assistantCard.responseSegments.map((segment) => segment.body),
    ['第一答'],
  );
  assert.deepEqual(
    rounds[1].assistantCard.responseSegments.map((segment) => segment.body),
    ['第二轮阶段回复'],
  );
});

test('projectConversationRounds does not merge fallback content that lands after the next user turn', () => {
  const rounds = projectConversationRounds({
    sessionId: 'sess-fallback-window',
    conversationTurns: [
      {
        kind: 'user',
        id: 'user-1',
        sessionId: 'sess-fallback-window',
        content: '第一问',
        timestamp: '2026-04-26T10:00:00.000Z',
        source: 'official-history',
      },
      {
        kind: 'user',
        id: 'user-2',
        sessionId: 'sess-fallback-window',
        content: '第二问',
        timestamp: '2026-04-26T10:01:00.000Z',
        source: 'official-history',
      },
    ],
    fallbackRunCards: [
      {
        sessionId: 'sess-fallback-window',
        anchorMessageId: 'user-1',
        cardStatus: 'completed',
        headline: '已完成',
        finalResponse: '这条 fallback 太晚了',
        responseMessages: [
          {
            id: 'fallback-final-late',
            timestamp: '2026-04-26T10:01:02.000Z',
            kind: 'final',
            body: '这条 fallback 太晚了',
          },
        ],
        processItems: [
          {
            id: 'fallback-process-late',
            timestamp: '2026-04-26T10:01:01.000Z',
            kind: 'thinking',
            title: 'Thinking',
            body: '晚到的处理过程',
          },
        ],
        previewItems: [
          {
            id: 'fallback-process-late',
            timestamp: '2026-04-26T10:01:01.000Z',
            kind: 'thinking',
            title: 'Thinking',
            body: '晚到的处理过程',
          },
        ],
        activeInteraction: {
          requestId: 'fallback-interaction-late',
          kind: 'interactive_prompt',
          toolName: 'AskUser',
          message: '晚到的交互',
        },
        startedAt: '2026-04-26T10:00:01.000Z',
        updatedAt: '2026-04-26T10:01:03.000Z',
        completedAt: '2026-04-26T10:01:03.000Z',
        defaultExpanded: false,
        source: 'fallback',
        runId: 'run-fallback-window-1',
      },
    ],
  });

  assert.equal(rounds.length, 2);
  assert.deepEqual(rounds[0].assistantCard.responseSegments, []);
  assert.deepEqual(rounds[0].assistantCard.processItems, []);
  assert.equal(rounds[0].assistantCard.activeInteraction, null);
  assert.equal(rounds[0].assistantCard.completedAt, null);
});

test('projectConversationRounds does not merge fallback content that predates its anchor user', () => {
  const rounds = projectConversationRounds({
    sessionId: 'sess-pre-anchor-fallback',
    conversationTurns: [
      {
        kind: 'user',
        id: 'user-1',
        sessionId: 'sess-pre-anchor-fallback',
        content: '123',
        timestamp: '2026-04-26T13:44:36.000Z',
        source: 'official-history',
      },
      {
        kind: 'assistant',
        id: 'assistant-1',
        sessionId: 'sess-pre-anchor-fallback',
        runId: 'run-1',
        anchorMessageId: 'user-1',
        status: 'completed',
        headline: '已完成',
        activityItems: [],
        bodySegments: [
          {
            id: 'segment-1',
            timestamp: '2026-04-26T13:44:38.000Z',
            kind: 'final',
            body: '你好！有什么我可以帮助你的吗？',
          },
        ],
        activeInteraction: null,
        startedAt: '2026-04-26T13:44:36.000Z',
        updatedAt: '2026-04-26T13:44:38.000Z',
        completedAt: '2026-04-26T13:44:38.000Z',
        source: 'official-history',
      },
      {
        kind: 'user',
        id: 'user-2',
        sessionId: 'sess-pre-anchor-fallback',
        content: '321',
        timestamp: '2026-04-26T13:44:41.000Z',
        source: 'transient',
      },
    ],
    fallbackRunCards: [
      {
        sessionId: 'sess-pre-anchor-fallback',
        anchorMessageId: 'user-2',
        cardStatus: 'starting',
        headline: '执行中',
        finalResponse: '你好！有什么我可以帮助你的吗？',
        responseMessages: [
          {
            id: 'fallback-stale-final',
            timestamp: '2026-04-26T13:44:38.500Z',
            kind: 'final',
            body: '你好！有什么我可以帮助你的吗？',
          },
        ],
        processItems: [
          {
            id: 'fallback-starting',
            timestamp: '2026-04-26T13:44:41.000Z',
            kind: 'session_status',
            title: '会话状态',
            body: 'starting\n\nsecond run started',
            tone: 'neutral',
          },
        ],
        previewItems: [
          {
            id: 'fallback-starting',
            timestamp: '2026-04-26T13:44:41.000Z',
            kind: 'session_status',
            title: '会话状态',
            body: 'starting\n\nsecond run started',
            tone: 'neutral',
          },
        ],
        activeInteraction: null,
        startedAt: '2026-04-26T13:44:41.000Z',
        updatedAt: '2026-04-26T13:44:41.000Z',
        completedAt: null,
        defaultExpanded: true,
        source: 'sdk-live',
        runId: 'run-2',
      },
    ],
  });

  assert.equal(rounds.length, 2);
  assert.equal(rounds[1].userMessage.id, 'user-2');
  assert.deepEqual(rounds[1].assistantCard.responseSegments, []);
  assert.deepEqual(
    rounds[1].assistantCard.processItems.map((item) => item.body),
    ['starting\n\nsecond run started'],
  );
});
