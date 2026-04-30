import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const chatMessagesPaneUrl = new URL('./ChatMessagesPane.tsx', import.meta.url).href;
const tsxLoaderUrl = new URL('../../../code-editor/view/subcomponents/tsx-loader.mjs', import.meta.url).href;

const reactI18nextStubUrl = `data:text/javascript,${encodeURIComponent(`
export function useTranslation() {
  return {
    t(key, options) {
      if (key === 'session.messages.showingOf') {
        return 'showing ' + String(options?.shown ?? '') + ' of ' + String(options?.total ?? '');
      }
      if (key === 'session.messages.scrollToLoad') {
        return 'scroll to load';
      }
      if (key === 'session.messages.clickToLoad') {
        return 'click to load more';
      }
      if (key === 'session.messages.loadEarlier') {
        return 'Load earlier';
      }
      if (key === 'session.messages.loadAll') {
        return 'Load all';
      }
      if (key === 'session.messages.loadingAll') {
        return 'Loading all';
      }
      if (key === 'session.messages.allLoaded') {
        return 'All loaded';
      }
      if (key === 'session.messages.perfWarning') {
        return 'Performance warning';
      }
      return options && typeof options.defaultValue === 'string' ? options.defaultValue : key;
    },
  };
}
`)}`;

const messageComponentStubUrl = `data:text/javascript,${encodeURIComponent(`
import { createRequire } from 'node:module';

const require = createRequire(${JSON.stringify(chatMessagesPaneUrl)});
const React = require('react');

export default function MessageComponent({ message }) {
  return React.createElement(
    'div',
    {
      className: 'chat-message ' + String(message?.type || ''),
      'data-message-component': 'true',
      'data-message-images': String(Array.isArray(message?.images) ? message.images.length : 0),
    },
    String(message?.content || '')
  );
}
`)}`;

const emptyStateStubUrl = `data:text/javascript,${encodeURIComponent(`
import { createRequire } from 'node:module';

const require = createRequire(${JSON.stringify(chatMessagesPaneUrl)});
const React = require('react');

export default function ProviderSelectionEmptyState() {
  return React.createElement('div', { 'data-empty-state': 'true' }, 'EMPTY_STATE');
}
`)}`;

const thinkingIndicatorStubUrl = `data:text/javascript,${encodeURIComponent(`
import { createRequire } from 'node:module';

const require = createRequire(${JSON.stringify(chatMessagesPaneUrl)});
const React = require('react');

export default function AssistantThinkingIndicator() {
  return React.createElement(
    'div',
    {
      className: 'chat-message assistant',
      'data-thinking-indicator': 'true',
    },
    'Thinking...'
  );
}
`)}`;

const runCardStubUrl = `data:text/javascript,${encodeURIComponent(`
import { createRequire } from 'node:module';

const require = createRequire(${JSON.stringify(chatMessagesPaneUrl)});
const React = require('react');

export default function RunCard({ card, interactionNode }) {
  return React.createElement(
    'div',
    {
      'data-run-card': 'true',
      'data-run-card-anchor': String(card?.anchorMessageId || ''),
      'data-run-card-response-count': String(Array.isArray(card?.responseMessages) ? card.responseMessages.length : 0),
      'data-run-card-response-bodies': Array.isArray(card?.responseMessages)
        ? card.responseMessages.map((item) => String(item?.body || '')).join(' || ')
        : '',
      'data-run-card-process-count': String(Array.isArray(card?.processItems) ? card.processItems.length : 0),
      'data-run-card-process-preview-count': String(Array.isArray(card?.previewItems) ? card.previewItems.length : 0),
      'data-run-card-process-preview': Array.isArray(card?.previewItems)
        ? card.previewItems.map((item) => String(item?.body || '')).join(' | ')
        : '',
    },
    String(card?.headline || '') + ' :: ' + String(card?.finalResponse || ''),
    interactionNode,
  );
}
`)}`;

const runCardInteractionStubUrl = `data:text/javascript,${encodeURIComponent(`
import { createRequire } from 'node:module';

const require = createRequire(${JSON.stringify(chatMessagesPaneUrl)});
const React = require('react');

export default function RunCardInteraction() {
  return React.createElement('div', { 'data-run-card-interaction': 'true' }, 'RUN_CARD_INTERACTION');
}
`)}`;

const loaderSource = `
import * as base from ${JSON.stringify(tsxLoaderUrl)};

const stubs = new Map([
  ['react-i18next', ${JSON.stringify(reactI18nextStubUrl)}],
  ['${chatMessagesPaneUrl}::./MessageComponent', ${JSON.stringify(messageComponentStubUrl)}],
  ['${chatMessagesPaneUrl}::./ProviderSelectionEmptyState', ${JSON.stringify(emptyStateStubUrl)}],
  ['${chatMessagesPaneUrl}::./AssistantThinkingIndicator', ${JSON.stringify(thinkingIndicatorStubUrl)}],
  ['${chatMessagesPaneUrl}::../../components/RunCard.tsx', ${JSON.stringify(runCardStubUrl)}],
  ['${chatMessagesPaneUrl}::../../components/RunCardInteraction.tsx', ${JSON.stringify(runCardInteractionStubUrl)}],
]);

export async function resolve(specifier, context, nextResolve) {
  const direct = stubs.get(specifier);
  if (direct) {
    return {
      url: direct,
      shortCircuit: true,
    };
  }

  const contextual = stubs.get(String(context.parentURL || '') + '::' + specifier);
  if (contextual) {
    return {
      url: contextual,
      shortCircuit: true,
    };
  }

  return base.resolve(specifier, context, nextResolve);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('data:text/javascript,')) {
    return {
      format: 'module',
      source: decodeURIComponent(url.slice('data:text/javascript,'.length)),
      shortCircuit: true,
    };
  }

  return base.load(url, context, nextLoad);
}
`;

register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);

const { default: ChatMessagesPane } = await import('./ChatMessagesPane.tsx');

function createAssistantTurn(id, text, anchorUserMessageIndex = null) {
  return {
    id,
    anchorUserMessageIndex,
    node: React.createElement('div', { key: id, 'data-primary-turn': 'true' }, text),
  };
}

function renderPane(overrides = {}) {
  const message = {
    type: 'assistant',
    content: '现有消息仍然正常渲染',
    timestamp: '2026-04-18T10:00:00.000Z',
  };

  const props = {
    scrollContainerRef: { current: null },
    onScroll: () => {},
    onWheel: () => {},
    onTouchMove: () => {},
    isLoadingSessionMessages: false,
    chatMessages: [message],
    selectedSession: null,
    currentSessionId: 'session-1',
    claudeModel: 'sonnet',
    isLoadingMoreMessages: false,
    hasMoreMessages: false,
    totalMessages: 1,
    loadedCanonicalMessageCount: 1,
    visibleMessageCount: 1,
    visibleMessages: [message],
    loadEarlierMessages: () => {},
    loadAllMessages: () => {},
    allMessagesLoaded: false,
    isLoadingAllMessages: false,
    loadAllJustFinished: false,
    showLoadAllOverlay: false,
    createDiff: () => [],
    onGrantToolPermission: () => ({ success: true }),
    handlePermissionDecision: () => {},
    pendingDecisionRequests: [],
    selectedProject: {
      id: 'project-1',
      name: 'demo',
      path: '/demo',
    },
    isLoading: true,
    claudeStatus: {
      text: 'Claude 正在准备首轮回复',
      tokens: 0,
      can_interrupt: true,
    },
    ...overrides,
  };

  return renderToStaticMarkup(React.createElement(ChatMessagesPane, props));
}

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

test('RunCard source includes dark theme classes for assistant card surfaces rendered inside ChatMessagesPane', async () => {
  const source = await readFile(new URL('../../components/RunCard.tsx', import.meta.url), 'utf8');

  assert.match(source, /dark:border-neutral-800/);
  assert.match(source, /dark:bg-neutral-900/);
  assert.match(source, /dark:text-neutral-100/);
  assert.match(source, /dark:bg-neutral-950/);
});

test('ChatMessagesPane renders each conversation round as one user bubble plus one assistant card', () => {
  const markup = renderPane({
    chatMessages: [
      {
        type: 'assistant',
        content: '旧路径不该参与 round 主渲染',
        timestamp: '2026-04-24T04:00:05.000Z',
      },
    ],
    visibleMessages: [
      {
        type: 'assistant',
        content: '旧路径不该参与 round 主渲染',
        timestamp: '2026-04-24T04:00:05.000Z',
      },
    ],
    isLoading: false,
    conversationTurns: [
      {
        kind: 'user',
        id: 'turn-user-1',
        sessionId: 'sess-rounds',
        content: 'round user from turns',
        timestamp: '2026-04-24T04:00:00.000Z',
        source: 'official-history',
      },
      {
        kind: 'assistant',
        id: 'turn-assistant-1',
        sessionId: 'sess-rounds',
        runId: null,
        anchorMessageId: 'turn-user-1',
        status: 'completed',
        headline: 'turn assistant',
        activityItems: [],
        bodySegments: [{
          id: 'turn-assistant-1-final',
          timestamp: '2026-04-24T04:00:01.000Z',
          kind: 'final',
          body: 'turn assistant body',
        }],
        activeInteraction: null,
        startedAt: '2026-04-24T04:00:00.000Z',
        updatedAt: '2026-04-24T04:00:01.000Z',
        completedAt: '2026-04-24T04:00:01.000Z',
        source: 'official-history',
      },
    ],
    conversationRounds: [
      {
        id: 'round-1',
        sessionId: 'sess-rounds',
        userMessage: {
          id: 'round-user-1',
          sessionId: 'sess-rounds',
          content: 'round user',
          timestamp: '2026-04-24T04:00:00.000Z',
        },
        assistantCard: {
          id: 'round-card-1',
          sessionId: 'sess-rounds',
          runId: null,
          anchorMessageId: 'round-user-1',
          status: 'completed',
          headline: 'round headline',
          responseSegments: [{
            id: 'round-card-1-final',
            kind: 'final',
            body: 'round final response',
            timestamp: '2026-04-24T04:00:01.000Z',
          }],
          processItems: [],
          previewItems: [],
          activeInteraction: null,
          startedAt: '2026-04-24T04:00:00.000Z',
          updatedAt: '2026-04-24T04:00:01.000Z',
          completedAt: '2026-04-24T04:00:01.000Z',
          source: 'official-history',
        },
      },
    ],
  });

  assert.equal((markup.match(/data-message-component="true"/g) || []).length, 1);
  assert.equal((markup.match(/data-run-card="true"/g) || []).length, 1);
  assert.match(markup, /round user/);
  assert.match(markup, /round headline :: round final response/);
  assert.doesNotMatch(markup, /turn assistant body/);
  assert.doesNotMatch(markup, /旧路径不该参与 round 主渲染/);
});

test('ChatMessagesPane passes round user images through to MessageComponent', () => {
  const markup = renderPane({
    chatMessages: [],
    visibleMessages: [],
    isLoading: false,
    conversationRounds: [
      {
        id: 'round-image-1',
        sessionId: 'sess-round-image',
        userMessage: {
          id: 'round-image-user-1',
          sessionId: 'sess-round-image',
          content: '图片内容是啥呢',
          images: [
            {
              name: 'capture.png',
              data: 'data:image/png;base64,QUJD',
            },
          ],
          timestamp: '2026-04-24T04:00:00.000Z',
        },
        assistantCard: {
          id: 'round-image-card-1',
          sessionId: 'sess-round-image',
          runId: null,
          anchorMessageId: 'round-image-user-1',
          status: 'starting',
          headline: '执行中',
          responseSegments: [],
          processItems: [],
          previewItems: [],
          activeInteraction: null,
          startedAt: '2026-04-24T04:00:00.000Z',
          updatedAt: '2026-04-24T04:00:00.000Z',
          completedAt: null,
          source: 'sdk-live',
        },
      },
    ],
  });

  assert.match(markup, /data-message-images="1"/);
});

test('ChatMessagesPane renders the assistant card from a fallback-completed round without needing legacy runCards', () => {
  const markup = renderPane({
    chatMessages: [
      {
        type: 'assistant',
        content: '旧 runCards 主路径不该再兜底',
        timestamp: '2026-04-24T04:00:05.000Z',
      },
    ],
    visibleMessages: [
      {
        type: 'assistant',
        content: '旧 runCards 主路径不该再兜底',
        timestamp: '2026-04-24T04:00:05.000Z',
      },
    ],
    runCards: [],
    isLoading: false,
    conversationRounds: [
      {
        id: 'round-fallback',
        sessionId: 'sess-round-fallback',
        userMessage: {
          id: 'round-fallback-user',
          sessionId: 'sess-round-fallback',
          content: 'fallback user',
          timestamp: '2026-04-24T04:00:00.000Z',
        },
        assistantCard: {
          id: 'round-fallback-card',
          sessionId: 'sess-round-fallback',
          runId: 'run-fallback-1',
          anchorMessageId: 'round-fallback-user',
          status: 'starting',
          headline: '执行中',
          responseSegments: [{
            id: 'round-fallback-card-final',
            kind: 'final',
            body: 'fallback round final response',
            timestamp: '2026-04-24T04:00:01.000Z',
          }],
          processItems: [{
            id: 'round-fallback-process-1',
            timestamp: '2026-04-24T04:00:00.500Z',
            kind: 'thinking',
            title: 'Thinking',
            body: '恢复中的过程预览',
          }],
          previewItems: [{
            id: 'round-fallback-process-1',
            timestamp: '2026-04-24T04:00:00.500Z',
            kind: 'thinking',
            title: 'Thinking',
            body: '恢复中的过程预览',
          }],
          activeInteraction: null,
          startedAt: '2026-04-24T04:00:00.000Z',
          updatedAt: '2026-04-24T04:00:01.000Z',
          completedAt: null,
          source: 'fallback',
        },
      },
    ],
  });

  assert.equal((markup.match(/data-message-component="true"/g) || []).length, 1);
  assert.equal((markup.match(/data-run-card="true"/g) || []).length, 1);
  assert.match(markup, /fallback user/);
  assert.match(markup, /执行中 :: fallback round final response/);
  assert.match(markup, /data-run-card-process-preview="恢复中的过程预览"/);
  assert.doesNotMatch(markup, /旧 runCards 主路径不该再兜底/);
});

test('ChatMessagesPane does not render an empty fallback pending assistant card for a round that only has the user history', () => {
  const markup = renderPane({
    chatMessages: [],
    visibleMessages: [],
    isLoading: false,
    conversationRounds: [
      {
        id: 'round-user-only-history',
        sessionId: 'sess-user-only-history',
        userMessage: {
          id: 'round-user-only-history-user',
          sessionId: 'sess-user-only-history',
          content: '/cost',
          timestamp: '2026-04-26T12:23:55.000Z',
        },
        assistantCard: {
          id: 'sess-user-only-history:pending:round-user-only-history-user',
          sessionId: 'sess-user-only-history',
          runId: null,
          anchorMessageId: 'round-user-only-history-user',
          status: 'queued',
          headline: '正在启动',
          responseSegments: [],
          processItems: [],
          previewItems: [],
          activeInteraction: null,
          startedAt: '2026-04-26T12:23:55.000Z',
          updatedAt: '2026-04-26T12:23:55.000Z',
          completedAt: null,
          source: 'fallback',
        },
      },
    ],
  });

  assert.match(markup, />\/cost</);
  assert.equal((markup.match(/data-run-card="true"/g) || []).length, 0);
  assert.doesNotMatch(markup, /正在启动 ::/);
});

test('ChatMessagesPane round assistant card main list only consumes previewItems', () => {
  const processItems = Array.from({ length: 7 }, (_, index) => ({
    id: `item-${index + 1}`,
    timestamp: `2026-04-24T04:00:0${index}.000Z`,
    kind: 'thinking',
    title: `Step ${index + 1}`,
    body: `process ${index + 1}`,
  }));
  const markup = renderPane({
    chatMessages: [],
    visibleMessages: [],
    isLoading: false,
    conversationRounds: [
      {
        id: 'round-preview',
        sessionId: 'sess-round-preview',
        userMessage: {
          id: 'round-preview-user',
          sessionId: 'sess-round-preview',
          content: 'show preview only',
          timestamp: '2026-04-24T04:00:00.000Z',
        },
        assistantCard: {
          id: 'round-preview-card',
          sessionId: 'sess-round-preview',
          runId: null,
          anchorMessageId: 'round-preview-user',
          status: 'running',
          headline: '处理中',
          responseSegments: [],
          processItems,
          previewItems: processItems.slice(-5),
          activeInteraction: null,
          startedAt: '2026-04-24T04:00:00.000Z',
          updatedAt: '2026-04-24T04:00:06.000Z',
          completedAt: null,
          source: 'sdk-live',
        },
      },
    ],
  });

  assert.match(markup, /data-run-card-process-count="7"/);
  assert.match(markup, /data-run-card-process-preview-count="5"/);
  assert.match(markup, /data-run-card-process-preview="process 3 \| process 4 \| process 5 \| process 6 \| process 7"/);
});

test('ChatMessagesPane falls back to legacy messages plus runCards when conversationTurns only contain user turns', () => {
  const markup = renderPane({
    isLoading: false,
    chatMessages: [
      {
        type: 'user',
        content: '123',
        id: 'user-gap-1',
        messageId: 'user-gap-1',
        timestamp: '2026-04-25T10:00:00.000Z',
      },
    ],
    visibleMessages: [
      {
        type: 'user',
        content: '123',
        id: 'user-gap-1',
        messageId: 'user-gap-1',
        timestamp: '2026-04-25T10:00:00.000Z',
      },
    ],
    conversationTurns: [
      {
        kind: 'user',
        id: 'user-gap-1',
        sessionId: 'sess-gap',
        content: '123',
        timestamp: '2026-04-25T10:00:00.000Z',
        source: 'transient',
      },
    ],
    runCards: [
      {
        sessionId: 'sess-gap',
        anchorMessageId: 'user-gap-1',
        cardStatus: 'completed',
        headline: '已完成',
        finalResponse: '补出来的回复',
        processItems: [],
        activeInteraction: null,
        startedAt: '2026-04-25T10:00:00.000Z',
        updatedAt: '2026-04-25T10:00:02.000Z',
        completedAt: '2026-04-25T10:00:02.000Z',
        defaultExpanded: false,
        source: 'sdk-live',
      },
    ],
  });

  assert.match(markup, /data-message-component="true"[^>]*>123/);
  assert.match(markup, /data-run-card="true"/);
  assert.match(markup, /已完成 :: 补出来的回复/);
});

test('ChatMessagesPane keeps legacy transient RunCard builder out of the conversationTurns path', async () => {
  const source = await readFile(new URL('./ChatMessagesPane.tsx', import.meta.url), 'utf8');
  assert.match(source, /conversationRounds = \[\]/);
  assert.match(source, /assistantTurnToRunCard/);
  assert.match(source, /buildTransientAssistantRunCard/);
});

test('ChatMessagesPane main path is conversationTurns-first', async () => {
  const source = await readFile(new URL('./ChatMessagesPane.tsx', import.meta.url), 'utf8');
  assert.match(source, /const useConversationRounds = conversationRounds\.length > 0;/);
  assert.doesNotMatch(source, /const transientAssistantRunCard = buildTransientAssistantRunCard\(\s*chatMessages,/);
});

test('ChatMessagesPane does not render an extra standalone thinking indicator when loading with visible messages', () => {
  const markup = renderPane();

  assert.match(markup, /现有消息仍然正常渲染/);
  assert.equal((markup.match(/data-message-component="true"/g) || []).length, 1);
  assert.doesNotMatch(markup, /Thinking\.\.\./);
  assert.doesNotMatch(markup, /data-thinking-indicator="true"/);
  assert.equal((markup.match(/chat-message assistant/g) || []).length, 1);
});

test('ChatMessagesPane renders a loading placeholder instead of leaving the first turn blank', () => {
  const markup = renderPane({
    chatMessages: [],
    visibleMessages: [],
  });

  assert.match(markup, /data-chat-loading-placeholder="true"/);
  assert.match(markup, /Claude 正在准备首轮回复/);
  assert.match(markup, /bg-white/);
  assert.doesNotMatch(markup, /bg-neutral-950/);
  assert.doesNotMatch(markup, /data-empty-state="true"/);
  assert.equal((markup.match(/data-message-component="true"/g) || []).length, 0);
});

test('ChatMessagesPane no longer renders paginated history helper copy', () => {
  const markup = renderPane({
    isLoading: false,
    hasMoreMessages: true,
    totalMessages: 8,
    loadedCanonicalMessageCount: 6,
    visibleMessageCount: 3,
    chatMessages: [
      {
        type: 'user',
        content: '最早一条',
        timestamp: '2026-04-20T10:00:00.000Z',
      },
      {
        type: 'assistant',
        content: '第二条',
        timestamp: '2026-04-20T10:00:01.000Z',
      },
      {
        type: 'user',
        content: '第三条',
        timestamp: '2026-04-20T10:00:02.000Z',
      },
    ],
    visibleMessages: [
      {
        type: 'user',
        content: '最早一条',
        timestamp: '2026-04-20T10:00:00.000Z',
      },
      {
        type: 'assistant',
        content: '第二条',
        timestamp: '2026-04-20T10:00:01.000Z',
      },
      {
        type: 'user',
        content: '第三条',
        timestamp: '2026-04-20T10:00:02.000Z',
      },
    ],
  });

  assert.doesNotMatch(markup, /showing 6 of 8/);
  assert.doesNotMatch(markup, /scroll to load/);
  assert.doesNotMatch(markup, /Load earlier/);
  assert.doesNotMatch(markup, /Load all/);
});

test('ChatMessagesPane no longer renders load-all helper or performance warning', () => {
  const loadingMarkup = renderPane({
    isLoading: false,
    hasMoreMessages: true,
    totalMessages: 12,
    isLoadingAllMessages: true,
    showLoadAllOverlay: true,
  });

  assert.doesNotMatch(loadingMarkup, /Loading all/);
  assert.doesNotMatch(loadingMarkup, /disabled=""/);

  const finishedMarkup = renderPane({
    isLoading: false,
    hasMoreMessages: false,
    totalMessages: 12,
    allMessagesLoaded: true,
    loadAllJustFinished: true,
    showLoadAllOverlay: false,
  });

  assert.doesNotMatch(finishedMarkup, /All loaded/);
  assert.doesNotMatch(finishedMarkup, /Performance warning/);
  assert.doesNotMatch(finishedMarkup, /Loading all/);
});

test('ChatMessagesPane does not render legacy assistant or realtime surfaces when runCards are absent', () => {
  const markup = renderPane({
    isLoading: false,
    chatMessages: [
      {
        type: 'user',
        content: '先看这一轮',
        timestamp: '2026-04-20T10:00:00.000Z',
      },
      {
        type: 'assistant',
        content: '旧 assistant surface 不应再出现',
        timestamp: '2026-04-20T10:00:01.000Z',
      },
    ],
    visibleMessages: [
      {
        type: 'user',
        content: '先看这一轮',
        timestamp: '2026-04-20T10:00:00.000Z',
      },
      {
        type: 'assistant',
        content: '旧 assistant surface 不应再出现',
        timestamp: '2026-04-20T10:00:01.000Z',
      },
    ],
    assistantTurns: [createAssistantTurn('turn-1', 'PRIMARY_TURN', 0)],
    realtimeBlocks: [
      {
        id: 'block-1',
        type: 'thinking',
        timestamp: '2026-04-20T10:00:02.000Z',
        title: 'Thinking',
        body: 'Working...',
        tone: 'neutral',
      },
    ],
  });

  assert.match(markup, /先看这一轮/);
  assert.doesNotMatch(markup, /PRIMARY_TURN/);
  assert.doesNotMatch(markup, /data-primary-turn="true"/);
  assert.doesNotMatch(markup, /data-chat-v2-realtime-feed="true"/);
});

test('ChatMessagesPane upgrades legacy assistant-only history into a RunCard when no v2 turns are available', () => {
  const markup = renderPane({
    isLoading: false,
    chatMessages: [
      {
        type: 'user',
        content: '请帮我整理一下',
        id: 'legacy-user-1',
        messageId: 'legacy-user-1',
        sessionId: 'legacy-session-1',
        timestamp: '2026-04-20T10:00:00.000Z',
      },
      {
        type: 'assistant',
        content: '这是旧历史里的回答',
        id: 'legacy-assistant-1',
        messageId: 'legacy-assistant-1',
        sessionId: 'legacy-session-1',
        timestamp: '2026-04-20T10:00:01.000Z',
      },
    ],
    visibleMessages: [
      {
        type: 'user',
        content: '请帮我整理一下',
        id: 'legacy-user-1',
        messageId: 'legacy-user-1',
        sessionId: 'legacy-session-1',
        timestamp: '2026-04-20T10:00:00.000Z',
      },
      {
        type: 'assistant',
        content: '这是旧历史里的回答',
        id: 'legacy-assistant-1',
        messageId: 'legacy-assistant-1',
        sessionId: 'legacy-session-1',
        timestamp: '2026-04-20T10:00:01.000Z',
      },
    ],
    conversationTurns: [],
    conversationRounds: [],
    runCards: [],
  });

  assert.match(markup, /data-message-component="true"[^>]*>请帮我整理一下/);
  assert.match(markup, /data-run-card="true"/);
  assert.match(markup, /已完成 :: 这是旧历史里的回答/);
  assert.doesNotMatch(markup, /data-message-component="true"[^>]*>这是旧历史里的回答/);
});

test('ChatMessagesPane upgrades anchorless legacy assistant history into a standalone RunCard', () => {
  const markup = renderPane({
    isLoading: false,
    chatMessages: [
      {
        type: 'assistant',
        content: '思考中...',
        id: 'legacy-thinking-1',
        messageId: 'legacy-thinking-1',
        sessionId: 'legacy-session-2',
        timestamp: '2026-04-20T10:00:00.000Z',
        normalizedKind: 'thinking',
        isThinking: true,
      },
      {
        type: 'assistant',
        content: '这是没有 user 锚点的旧回答',
        id: 'legacy-assistant-2',
        messageId: 'legacy-assistant-2',
        sessionId: 'legacy-session-2',
        timestamp: '2026-04-20T10:00:03.000Z',
      },
    ],
    visibleMessages: [
      {
        type: 'assistant',
        content: '思考中...',
        id: 'legacy-thinking-1',
        messageId: 'legacy-thinking-1',
        sessionId: 'legacy-session-2',
        timestamp: '2026-04-20T10:00:00.000Z',
        normalizedKind: 'thinking',
        isThinking: true,
      },
      {
        type: 'assistant',
        content: '这是没有 user 锚点的旧回答',
        id: 'legacy-assistant-2',
        messageId: 'legacy-assistant-2',
        sessionId: 'legacy-session-2',
        timestamp: '2026-04-20T10:00:03.000Z',
      },
    ],
    conversationTurns: [],
    conversationRounds: [],
    runCards: [],
  });

  assert.match(markup, /data-run-card="true"/);
  assert.match(markup, /已完成 :: 这是没有 user 锚点的旧回答/);
  assert.doesNotMatch(markup, /data-message-component="true"[^>]*>思考中\.\.\./);
  assert.doesNotMatch(markup, /data-message-component="true"[^>]*>这是没有 user 锚点的旧回答/);
});

test('ChatMessagesPane renders only one run card per user anchor and suppresses the legacy assistant surface when runCards are present', () => {
  const markup = renderPane({
    isLoading: false,
    chatMessages: [
      {
        type: 'user',
        content: '请继续执行',
        id: 'user-1',
        messageId: 'user-1',
        timestamp: '2026-04-20T10:00:00.000Z',
      },
      {
        type: 'assistant',
        content: '历史回答不应继续显示',
        id: 'assistant-1',
        messageId: 'assistant-1',
        timestamp: '2026-04-20T10:00:01.000Z',
      },
    ],
    visibleMessages: [
      {
        type: 'user',
        content: '请继续执行',
        id: 'user-1',
        messageId: 'user-1',
        timestamp: '2026-04-20T10:00:00.000Z',
      },
      {
        type: 'assistant',
        content: '历史回答不应继续显示',
        id: 'assistant-1',
        messageId: 'assistant-1',
        timestamp: '2026-04-20T10:00:01.000Z',
      },
    ],
    runCards: [
      {
        sessionId: 'sess-1',
        anchorMessageId: 'user-1',
        cardStatus: 'completed',
        headline: '历史卡',
        finalResponse: '历史回答',
        processItems: [],
        activeInteraction: null,
        startedAt: '2026-04-20T10:00:00.000Z',
        updatedAt: '2026-04-20T10:00:01.000Z',
        completedAt: '2026-04-20T10:00:01.000Z',
        defaultExpanded: false,
        source: 'official-history',
      },
      {
        sessionId: 'sess-1',
        anchorMessageId: 'user-1',
        cardStatus: 'running',
        headline: '实时卡',
        finalResponse: '实时回答',
        processItems: [],
        activeInteraction: null,
        startedAt: '2026-04-20T10:00:00.000Z',
        updatedAt: '2026-04-20T10:00:02.000Z',
        completedAt: null,
        defaultExpanded: false,
        source: 'sdk-live',
      },
    ],
    assistantTurns: [createAssistantTurn('turn-1', 'PRIMARY_TURN', 0)],
    realtimeBlocks: [
      {
        id: 'block-1',
        type: 'thinking',
        timestamp: '2026-04-22T10:00:00.000Z',
        title: 'Thinking',
        body: 'Working...',
        tone: 'neutral',
      },
    ],
  });

  assert.equal((markup.match(/data-run-card="true"/g) || []).length, 1);
  assert.match(markup, /data-run-card-anchor="user-1"/);
  assert.match(markup, /实时卡 :: 实时回答/);
  assert.doesNotMatch(markup, /历史卡 :: 历史回答/);
  assert.doesNotMatch(markup, /data-primary-turn="true"/);
  assert.doesNotMatch(markup, /data-chat-v2-realtime-feed="true"/);
});

test('ChatMessagesPane synthesizes a fallback run card for the latest transient assistant reply when live run events are not ready yet', () => {
  const markup = renderPane({
    isLoading: false,
    claudeStatus: null,
    chatMessages: [
      {
        type: 'user',
        content: '你好',
        id: 'user-live-1',
        messageId: 'user-live-1',
        timestamp: '2026-04-23T13:00:00.000Z',
      },
      {
        type: 'assistant',
        content: '你好！请问有什么需要我帮忙的？',
        id: 'assistant-live-1',
        messageId: 'assistant-live-1',
        timestamp: '2026-04-23T13:00:02.000Z',
      },
    ],
    visibleMessages: [
      {
        type: 'user',
        content: '你好',
        id: 'user-live-1',
        messageId: 'user-live-1',
        timestamp: '2026-04-23T13:00:00.000Z',
      },
      {
        type: 'assistant',
        content: '你好！请问有什么需要我帮忙的？',
        id: 'assistant-live-1',
        messageId: 'assistant-live-1',
        timestamp: '2026-04-23T13:00:02.000Z',
      },
    ],
    runCards: [],
  });

  assert.match(markup, /data-run-card="true"/);
  assert.match(markup, /data-run-card-anchor="user-live-1"/);
  assert.match(markup, /data-run-card-response-count="1"/);
  assert.match(markup, /已完成 :: 你好！请问有什么需要我帮忙的？/);
  assert.doesNotMatch(markup, /data-message-component="true">你好！请问有什么需要我帮忙的？<\/div>/);
});

test('ChatMessagesPane fallback run card keeps only the latest assistant reply as正文，以避免运行时和历史视图分段不一致', () => {
  const markup = renderPane({
    isLoading: false,
    claudeStatus: null,
    chatMessages: [
      {
        type: 'user',
        content: '帮我读一下文档',
        id: 'user-live-2',
        messageId: 'user-live-2',
        timestamp: '2026-04-23T13:10:00.000Z',
      },
      {
        type: 'assistant',
        content: '我来帮你通过 Context7 查询 Claude Agent SDK 的文档。',
        id: 'assistant-live-2a',
        messageId: 'assistant-live-2a',
        timestamp: '2026-04-23T13:10:02.000Z',
      },
      {
        type: 'assistant',
        content: '找到了 Claude Code 的文档，让我查询 Agent SDK 相关内容。',
        id: 'assistant-live-2b',
        messageId: 'assistant-live-2b',
        timestamp: '2026-04-23T13:10:03.000Z',
      },
      {
        type: 'assistant',
        content: '以下是 Claude Agent SDK 文档的核心内容总结：',
        id: 'assistant-live-2c',
        messageId: 'assistant-live-2c',
        timestamp: '2026-04-23T13:10:05.000Z',
      },
    ],
    visibleMessages: [
      {
        type: 'user',
        content: '帮我读一下文档',
        id: 'user-live-2',
        messageId: 'user-live-2',
        timestamp: '2026-04-23T13:10:00.000Z',
      },
      {
        type: 'assistant',
        content: '我来帮你通过 Context7 查询 Claude Agent SDK 的文档。',
        id: 'assistant-live-2a',
        messageId: 'assistant-live-2a',
        timestamp: '2026-04-23T13:10:02.000Z',
      },
      {
        type: 'assistant',
        content: '找到了 Claude Code 的文档，让我查询 Agent SDK 相关内容。',
        id: 'assistant-live-2b',
        messageId: 'assistant-live-2b',
        timestamp: '2026-04-23T13:10:03.000Z',
      },
      {
        type: 'assistant',
        content: '以下是 Claude Agent SDK 文档的核心内容总结：',
        id: 'assistant-live-2c',
        messageId: 'assistant-live-2c',
        timestamp: '2026-04-23T13:10:05.000Z',
      },
    ],
    runCards: [],
  });

  assert.match(markup, /data-run-card-anchor="user-live-2"/);
  assert.match(markup, /data-run-card-response-count="1"/);
  assert.match(markup, /已完成 :: 以下是 Claude Agent SDK 文档的核心内容总结：/);
});

test('ChatMessagesPane collapses a plain-text prefix segment when the final segment already contains the same rich markdown body', () => {
  const markup = renderPane({
    conversationRounds: [
      {
        id: 'round-markdown-prefix',
        sessionId: 'sess-markdown-prefix',
        userMessage: {
          id: 'user-markdown-prefix',
          sessionId: 'sess-markdown-prefix',
          content: '帮我总结 Claude Agent SDK',
          timestamp: '2026-04-26T10:30:00.000Z',
        },
        assistantCard: {
          id: 'assistant-markdown-prefix',
          sessionId: 'sess-markdown-prefix',
          runId: 'run-markdown-prefix',
          anchorMessageId: 'user-markdown-prefix',
          status: 'completed',
          headline: '已完成',
          responseSegments: [
            {
              id: 'seg-prefix',
              kind: 'phase',
              body: '我先来查找 Claude Agent SDK 的文档库。',
              timestamp: '2026-04-26T10:30:02.000Z',
            },
            {
              id: 'seg-final',
              kind: 'final',
              body: '我先来查找 Claude Agent SDK 的文档库。\n\n## Claude Agent SDK 总结\n\n- 支持 Python 和 TypeScript',
              timestamp: '2026-04-26T10:30:05.000Z',
            },
          ],
          processItems: [],
          previewItems: [],
          activeInteraction: null,
          startedAt: '2026-04-26T10:30:01.000Z',
          updatedAt: '2026-04-26T10:30:05.000Z',
          completedAt: '2026-04-26T10:30:05.000Z',
          source: 'official-history',
        },
      },
    ],
  });

  assert.match(markup, /data-run-card-response-count="1"/);
  assert.match(markup, /data-run-card-response-bodies="我先来查找 Claude Agent SDK 的文档库。[\s\S]*Claude Agent SDK 总结/);
});

test('ChatMessagesPane collapses an earlier summary segment when the final markdown already contains the same summary later in the body', () => {
  const markup = renderPane({
    conversationRounds: [
      {
        id: 'round-markdown-contained-summary',
        sessionId: 'sess-markdown-contained-summary',
        userMessage: {
          id: 'user-markdown-contained-summary',
          sessionId: 'sess-markdown-contained-summary',
          content: '帮我写一个 PRD',
          timestamp: '2026-04-26T18:15:50.000Z',
        },
        assistantCard: {
          id: 'assistant-markdown-contained-summary',
          sessionId: 'sess-markdown-contained-summary',
          runId: 'run-markdown-contained-summary',
          anchorMessageId: 'user-markdown-contained-summary',
          status: 'completed',
          headline: '已完成',
          responseSegments: [
            {
              id: 'seg-summary',
              kind: 'phase',
              body: '已完成。文档路径：PRD-智能会议纪要助手.md',
              timestamp: '2026-04-26T18:17:07.000Z',
            },
            {
              id: 'seg-final',
              kind: 'final',
              body: [
                '我来编写一份产品需求文档。',
                '',
                '`已完成。文档路径：PRD-智能会议纪要助手.md`',
                '',
                '产品选择了 `智能会议纪要助手（MeetNote）`，核心思路是解决会议场景下"记不住、理不清、分不开"的痛点。文档包含：',
                '',
                '- 产品定位：AI 语音转写 + 自动纪要生成 + 待办追踪',
                '- 功能模块：12 个功能点，按 P0/P1/P2 分级',
              ].join('\n'),
              timestamp: '2026-04-26T18:17:08.000Z',
            },
          ],
          processItems: [],
          previewItems: [],
          activeInteraction: null,
          startedAt: '2026-04-26T18:16:00.000Z',
          updatedAt: '2026-04-26T18:17:08.000Z',
          completedAt: '2026-04-26T18:17:08.000Z',
          source: 'official-history',
        },
      },
    ],
  });

  assert.match(markup, /data-run-card-response-count="1"/);
  assert.match(markup, /data-run-card-response-bodies="我来编写一份产品需求文档。[\s\S]*PRD-智能会议纪要助手\.md/);
});

test('ChatMessagesPane hides a redundant process preview when it duplicates the final markdown response', () => {
  const duplicatedMarkdown = [
    '# Claude Agent SDK 总结',
    '',
    '## 核心能力',
    '- 会话管理',
    '- 工具调用',
    '',
    '```ts',
    'const answer = "ok";',
    '```',
  ].join('\n');

  const markup = renderPane({
    chatMessages: [],
    visibleMessages: [],
    isLoading: false,
    conversationRounds: [
      {
        id: 'round-markdown-preview-dup',
        sessionId: 'sess-markdown-preview-dup',
        userMessage: {
          id: 'round-markdown-preview-dup-user',
          sessionId: 'sess-markdown-preview-dup',
          content: '第二轮',
          timestamp: '2026-04-26T02:00:00.000Z',
        },
        assistantCard: {
          id: 'round-markdown-preview-dup-card',
          sessionId: 'sess-markdown-preview-dup',
          runId: null,
          anchorMessageId: 'round-markdown-preview-dup-user',
          status: 'completed',
          headline: '已完成',
          responseSegments: [{
            id: 'round-markdown-preview-dup-card-final',
            kind: 'final',
            body: duplicatedMarkdown,
            timestamp: '2026-04-26T02:00:05.000Z',
          }],
          processItems: [{
            id: 'round-markdown-preview-dup-process',
            timestamp: '2026-04-26T02:00:04.000Z',
            kind: 'thinking',
            title: 'Thinking',
            body: duplicatedMarkdown,
          }],
          previewItems: [{
            id: 'round-markdown-preview-dup-process',
            timestamp: '2026-04-26T02:00:04.000Z',
            kind: 'thinking',
            title: 'Thinking',
            body: duplicatedMarkdown,
          }],
          activeInteraction: null,
          startedAt: '2026-04-26T02:00:00.000Z',
          updatedAt: '2026-04-26T02:00:05.000Z',
          completedAt: '2026-04-26T02:00:05.000Z',
          source: 'mixed',
        },
      },
    ],
  });

  assert.match(markup, /data-run-card-response-count="1"/);
  assert.match(markup, /data-run-card-response-bodies="# Claude Agent SDK 总结/);
  assert.match(markup, /data-run-card-process-count="1"/);
  assert.match(markup, /data-run-card-process-preview-count="0"/);
});

test('ChatMessagesPane keeps historical assistant answers that are not covered by any anchored run card', () => {
  const markup = renderPane({
    isLoading: false,
    chatMessages: [
      {
        type: 'user',
        content: "/graphify query 'IT资产报废'",
        id: 'user-1',
        messageId: 'user-1',
        timestamp: '2026-04-20T10:00:00.000Z',
      },
      {
        type: 'assistant',
        content: '文档已生成。以下是核心结论：',
        id: 'assistant-1',
        messageId: 'assistant-1',
        timestamp: '2026-04-20T10:00:08.000Z',
      },
      {
        type: 'user',
        content: '/compact',
        id: 'user-2',
        messageId: 'user-2',
        timestamp: '2026-04-20T10:00:10.000Z',
      },
    ],
    visibleMessages: [
      {
        type: 'user',
        content: "/graphify query 'IT资产报废'",
        id: 'user-1',
        messageId: 'user-1',
        timestamp: '2026-04-20T10:00:00.000Z',
      },
      {
        type: 'assistant',
        content: '文档已生成。以下是核心结论：',
        id: 'assistant-1',
        messageId: 'assistant-1',
        timestamp: '2026-04-20T10:00:08.000Z',
      },
      {
        type: 'user',
        content: '/compact',
        id: 'user-2',
        messageId: 'user-2',
        timestamp: '2026-04-20T10:00:10.000Z',
      },
    ],
    runCards: [
      {
        sessionId: 'sess-1',
        anchorMessageId: 'user-2',
        cardStatus: 'completed',
        headline: '压缩完成',
        finalResponse: '',
        processItems: [],
        activeInteraction: null,
        startedAt: '2026-04-20T10:00:10.000Z',
        updatedAt: '2026-04-20T10:00:11.000Z',
        completedAt: '2026-04-20T10:00:11.000Z',
        defaultExpanded: false,
        source: 'official-history',
      },
    ],
  });

  assert.match(markup, /文档已生成。以下是核心结论：/);
  assert.match(markup, /压缩完成 :: /);
});

test('ChatMessagesPane hides orphan historical thinking rows when standalone run cards already carry the process view', () => {
  const markup = renderPane({
    isLoading: false,
    chatMessages: [
      {
        type: 'assistant',
        content: '思考中...',
        id: 'thinking-1',
        messageId: 'thinking-1',
        timestamp: '2026-04-20T10:00:01.000Z',
        normalizedKind: 'thinking',
        isThinking: true,
      },
      {
        type: 'assistant',
        content: '最终结论',
        id: 'assistant-1',
        messageId: 'assistant-1',
        timestamp: '2026-04-20T10:00:08.000Z',
      },
    ],
    visibleMessages: [
      {
        type: 'assistant',
        content: '思考中...',
        id: 'thinking-1',
        messageId: 'thinking-1',
        timestamp: '2026-04-20T10:00:01.000Z',
        normalizedKind: 'thinking',
        isThinking: true,
      },
      {
        type: 'assistant',
        content: '最终结论',
        id: 'assistant-1',
        messageId: 'assistant-1',
        timestamp: '2026-04-20T10:00:08.000Z',
      },
    ],
    runCards: [
      {
        sessionId: 'sess-1',
        anchorMessageId: '',
        cardStatus: 'completed',
        headline: '已完成',
        finalResponse: '最终结论',
        processItems: [
          {
            id: 'thinking-1',
            timestamp: '2026-04-20T10:00:01.000Z',
            kind: 'thinking',
            title: 'Thinking',
            body: '思考中...',
          },
        ],
        activeInteraction: null,
        startedAt: '2026-04-20T10:00:01.000Z',
        updatedAt: '2026-04-20T10:00:08.000Z',
        completedAt: '2026-04-20T10:00:08.000Z',
        defaultExpanded: false,
        source: 'official-history',
      },
    ],
  });

  assert.match(markup, /已完成 :: 最终结论/);
  assert.doesNotMatch(markup, /data-message-component="true">思考中\.\.\.</);
});

test('ChatMessagesPane hides duplicate assistant answers when a standalone historical run card already renders the same final response', () => {
  const markup = renderPane({
    isLoading: false,
    chatMessages: [
      {
        type: 'assistant',
        content: '文档已生成。以下是核心结论： IT 资产报废申请选择设备时，只允许选择以下类型的设备明细。',
        id: 'assistant-duplicate-1',
        messageId: 'assistant-duplicate-1',
        timestamp: '2026-04-20T12:03:51.000Z',
      },
    ],
    visibleMessages: [
      {
        type: 'assistant',
        content: '文档已生成。以下是核心结论： IT 资产报废申请选择设备时，只允许选择以下类型的设备明细。',
        id: 'assistant-duplicate-1',
        messageId: 'assistant-duplicate-1',
        timestamp: '2026-04-20T12:03:51.000Z',
      },
    ],
    runCards: [
      {
        sessionId: 'sess-1',
        anchorMessageId: '',
        cardStatus: 'completed',
        headline: '已完成',
        finalResponse: '文档已生成。以下是核心结论： IT 资产报废申请选择设备时，只允许选择以下类型的设备明细。',
        processItems: [
          {
            id: 'thinking-1',
            timestamp: '2026-04-20T12:02:39.000Z',
            kind: 'thinking',
            title: 'Thinking',
            body: '现在我已经完成了代码分析，找到了 IT 资产报废申请选择设备的校验逻辑。',
          },
        ],
        activeInteraction: null,
        startedAt: '2026-04-20T12:02:39.000Z',
        updatedAt: '2026-04-20T12:03:51.000Z',
        completedAt: '2026-04-20T12:03:51.000Z',
        defaultExpanded: false,
        source: 'official-history',
      },
    ],
  });

  assert.match(markup, /已完成 :: 文档已生成。以下是核心结论： IT 资产报废申请选择设备时，只允许选择以下类型的设备明细。/);
  assert.equal((markup.match(/data-message-component="true"/g) || []).length, 0);
});

test('ChatMessagesPane hides interim assistant progress copy when a standalone historical run card already covers the same time window', () => {
  const markup = renderPane({
    isLoading: false,
    chatMessages: [
      {
        type: 'assistant',
        content: '现在我已经完成了代码分析，找到了 IT 资产报废申请选择设备的校验逻辑。接下来生成 MD 文档。',
        id: 'assistant-progress-1',
        messageId: 'assistant-progress-1',
        timestamp: '2026-04-20T12:03:51.000Z',
      },
      {
        type: 'assistant',
        content: '文档已生成。以下是核心结论： IT 资产报废申请选择设备时，只允许选择以下类型的设备明细。',
        id: 'assistant-final-1',
        messageId: 'assistant-final-1',
        timestamp: '2026-04-20T12:04:16.000Z',
      },
    ],
    visibleMessages: [
      {
        type: 'assistant',
        content: '现在我已经完成了代码分析，找到了 IT 资产报废申请选择设备的校验逻辑。接下来生成 MD 文档。',
        id: 'assistant-progress-1',
        messageId: 'assistant-progress-1',
        timestamp: '2026-04-20T12:03:51.000Z',
      },
      {
        type: 'assistant',
        content: '文档已生成。以下是核心结论： IT 资产报废申请选择设备时，只允许选择以下类型的设备明细。',
        id: 'assistant-final-1',
        messageId: 'assistant-final-1',
        timestamp: '2026-04-20T12:04:16.000Z',
      },
    ],
    runCards: [
      {
        sessionId: 'sess-1',
        anchorMessageId: '',
        cardStatus: 'completed',
        headline: '已完成',
        finalResponse: '文档已生成。以下是核心结论： IT 资产报废申请选择设备时，只允许选择以下类型的设备明细。',
        processItems: [
          {
            id: 'thinking-1',
            timestamp: '2026-04-20T12:03:34.000Z',
            kind: 'thinking',
            title: 'Thinking',
            body: 'Now let me read the enum.',
          },
          {
            id: 'tool-1',
            timestamp: '2026-04-20T12:03:35.000Z',
            kind: 'tool_use',
            title: 'tool_use',
            body: 'Read InvAssetStyleEnum.java',
          },
        ],
        activeInteraction: null,
        startedAt: '2026-04-20T12:03:34.000Z',
        updatedAt: '2026-04-20T12:04:16.000Z',
        completedAt: '2026-04-20T12:04:16.000Z',
        defaultExpanded: false,
        source: 'official-history',
      },
    ],
  });

  assert.match(markup, /已完成 :: 文档已生成。以下是核心结论： IT 资产报废申请选择设备时，只允许选择以下类型的设备明细。/);
  assert.doesNotMatch(markup, /assistant-progress-1/);
  assert.doesNotMatch(markup, /现在我已经完成了代码分析/);
});

test('ChatMessagesPane does not render historical tool_result copy as right-side user bubbles after refresh', () => {
  const markup = renderPane({
    isLoading: false,
    chatMessages: [
      {
        type: 'user',
        content: '帮我调研佛山',
        id: 'user-1',
        messageId: 'user-1',
        timestamp: '2026-04-23T10:00:00.000Z',
      },
    ],
    visibleMessages: [
      {
        type: 'user',
        content: '帮我调研佛山',
        id: 'user-1',
        messageId: 'user-1',
        timestamp: '2026-04-23T10:00:00.000Z',
      },
    ],
    runCards: [
      {
        sessionId: 'sess-1',
        anchorMessageId: '',
        cardStatus: 'completed',
        headline: '已完成',
        finalResponse: '最终汇总',
        processItems: [
          {
            id: 'tr1',
            timestamp: '2026-04-23T10:00:05.000Z',
            kind: 'tool_result',
            title: 'tool_result',
            body: '由于网络工具暂时无法使用，我将基于已有知识继续整理结果。',
          },
        ],
        activeInteraction: null,
        startedAt: '2026-04-23T10:00:00.000Z',
        updatedAt: '2026-04-23T10:00:06.000Z',
        completedAt: '2026-04-23T10:00:06.000Z',
        defaultExpanded: false,
        source: 'official-history',
      },
    ],
  });

  assert.equal((markup.match(/class="chat-message user"/g) || []).length, 1);
  assert.match(markup, /帮我调研佛山/);
  assert.doesNotMatch(markup, /由于网络工具暂时无法使用/);
});

test('ChatMessagesPane uses a stable run card key that does not depend on updatedAt', async () => {
  const source = await readFile(new URL('./ChatMessagesPane.tsx', import.meta.url), 'utf8');
  const buildRunCardKeyStart = source.indexOf('const buildRunCardKey = useCallback((card: RunCardModel) => {');
  const buildRunCardKeyEnd = source.indexOf('standaloneRunCards.sort((left, right) => {');
  const buildRunCardKeySource = buildRunCardKeyStart >= 0 && buildRunCardKeyEnd > buildRunCardKeyStart
    ? source.slice(buildRunCardKeyStart, buildRunCardKeyEnd)
    : source;

  assert.match(source, /const buildRunCardKey = useCallback\(\(card: RunCardModel\) => \{/);
  assert.match(source, /const source = String\(card\.source \|\| ''\)\.trim\(\) \|\| 'run-card';/);
  assert.match(source, /const requestId = String\(card\.activeInteraction\?\.requestId \|\| ''\)\.trim\(\) \|\| 'run-card';/);
  assert.match(source, /key=\{buildRunCardKey\(anchoredRunCard\)\}/);
  assert.match(source, /key=\{buildRunCardKey\(card\) \|\| `\$\{card\.anchorMessageId \|\| 'standalone'\}-\$\{index\}`\}/);
  assert.doesNotMatch(buildRunCardKeySource, /updatedAt/);
});

test('ChatMessagesPane binds the native scroll event so prepended history can load on drag and keyboard scrolls', async () => {
  const source = await readFile(new URL('./ChatMessagesPane.tsx', import.meta.url), 'utf8');

  assert.match(source, /interface ChatMessagesPaneProps \{[\s\S]*onScroll: \(\) => void;/);
  assert.match(source, /export default function ChatMessagesPane\(\{[\s\S]*onScroll,/);
  assert.match(source, /<div[\s\S]*onScroll=\{onScroll\}/);
});

test('ChatMessagesPane injects the interaction node into the active run card', () => {
  const markup = renderPane({
    pendingDecisionRequests: [
      {
        requestId: 'request-1',
        toolName: 'AskUserQuestion',
        input: { questions: [] },
        context: null,
        sessionId: 'sess-1',
        receivedAt: new Date('2026-04-20T10:00:00.000Z'),
        kind: 'interactive_prompt',
      },
    ],
    chatMessages: [
      {
        type: 'user',
        content: '请继续执行',
        id: 'user-1',
        messageId: 'user-1',
        timestamp: '2026-04-20T10:00:00.000Z',
      },
    ],
    visibleMessages: [
      {
        type: 'user',
        content: '请继续执行',
        id: 'user-1',
        messageId: 'user-1',
        timestamp: '2026-04-20T10:00:00.000Z',
      },
    ],
    runCards: [
      {
        sessionId: 'sess-1',
        anchorMessageId: 'user-1',
        cardStatus: 'waiting_for_input',
        headline: '等待你的回答',
        finalResponse: '',
        processItems: [],
        activeInteraction: {
          requestId: 'request-1',
          kind: 'interactive_prompt',
          toolName: 'AskUserQuestion',
          message: '需要回答一个问题',
          input: { questions: [] },
          context: null,
          payload: null,
        },
        startedAt: '2026-04-20T10:00:00.000Z',
        updatedAt: '2026-04-20T10:00:01.000Z',
        completedAt: null,
        defaultExpanded: false,
        source: 'sdk-live',
      },
    ],
  });

  assert.match(markup, /data-run-card="true"/);
  assert.match(markup, /data-run-card-interaction="true"/);
  assert.match(markup, /RUN_CARD_INTERACTION/);
});

test('ChatMessagesPane does not inject an interaction node into a card whose requestId no longer matches the pending requests', () => {
  const markup = renderPane({
    pendingDecisionRequests: [
      {
        requestId: 'request-current',
        toolName: 'AskUserQuestion',
        input: { questions: [] },
        context: null,
        sessionId: 'sess-1',
        receivedAt: new Date('2026-04-20T10:00:00.000Z'),
        kind: 'interactive_prompt',
      },
    ],
    chatMessages: [
      {
        type: 'user',
        content: '请继续执行',
        id: 'user-1',
        messageId: 'user-1',
        timestamp: '2026-04-20T10:00:00.000Z',
      },
    ],
    visibleMessages: [
      {
        type: 'user',
        content: '请继续执行',
        id: 'user-1',
        messageId: 'user-1',
        timestamp: '2026-04-20T10:00:00.000Z',
      },
    ],
    runCards: [
      {
        sessionId: 'sess-1',
        anchorMessageId: 'user-1',
        cardStatus: 'waiting_for_input',
        headline: '等待你的回答',
        finalResponse: '',
        processItems: [],
        activeInteraction: {
          requestId: 'request-stale',
          kind: 'interactive_prompt',
          toolName: 'AskUserQuestion',
          message: '旧请求',
          input: { questions: [] },
          context: null,
          payload: null,
        },
        startedAt: '2026-04-20T10:00:00.000Z',
        updatedAt: '2026-04-20T10:00:01.000Z',
        completedAt: null,
        defaultExpanded: false,
        source: 'sdk-live',
      },
    ],
  });

  assert.match(markup, /data-run-card="true"/);
  assert.doesNotMatch(markup, /data-run-card-interaction="true"/);
  assert.doesNotMatch(markup, /RUN_CARD_INTERACTION/);
});

test('ChatMessagesPane renders a standalone run card interaction when the request has no matching anchor card yet', () => {
  const markup = renderPane({
    pendingDecisionRequests: [
      {
        requestId: 'request-current',
        toolName: 'AskUserQuestion',
        input: { questions: [] },
        context: null,
        sessionId: 'sess-1',
        receivedAt: new Date('2026-04-20T10:00:00.000Z'),
        kind: 'interactive_prompt',
      },
    ],
    chatMessages: [],
    visibleMessages: [],
    runCards: [
      {
        sessionId: 'sess-1',
        anchorMessageId: '',
        cardStatus: 'waiting_for_input',
        headline: '等待你的回答',
        finalResponse: '',
        processItems: [],
        activeInteraction: {
          requestId: 'request-current',
          kind: 'interactive_prompt',
          toolName: 'AskUserQuestion',
          message: '需要回答一个问题',
          input: { questions: [] },
          context: null,
          payload: null,
        },
        startedAt: '2026-04-20T10:00:00.000Z',
        updatedAt: '2026-04-20T10:00:01.000Z',
        completedAt: null,
        defaultExpanded: false,
        source: 'sdk-live',
      },
    ],
  });

  assert.match(markup, /data-chat-v2-run-card-standalone="true"/);
  assert.match(markup, /data-run-card-interaction="true"/);
  assert.match(markup, /RUN_CARD_INTERACTION/);
});

test('ChatMessagesPane renders a standalone fallback card for permission requests without an anchor', () => {
  const markup = renderPane({
    pendingDecisionRequests: [
      {
        requestId: 'perm-1',
        toolName: 'FileWrite',
        input: { path: '/tmp/example.txt' },
        context: null,
        sessionId: 'sess-1',
        receivedAt: new Date('2026-04-20T10:00:00.000Z'),
        kind: 'permission_request',
      },
    ],
    chatMessages: [],
    visibleMessages: [],
    runCards: [
      {
        sessionId: 'sess-1',
        anchorMessageId: '',
        cardStatus: 'waiting_for_input',
        headline: '等待授权',
        finalResponse: '',
        processItems: [],
        activeInteraction: {
          requestId: 'perm-1',
          kind: 'permission_request',
          toolName: 'FileWrite',
          message: '需要你的授权',
          input: { path: '/tmp/example.txt' },
          context: null,
          payload: null,
        },
        startedAt: '2026-04-20T10:00:00.000Z',
        updatedAt: '2026-04-20T10:00:01.000Z',
        completedAt: null,
        defaultExpanded: false,
        source: 'sdk-live',
      },
    ],
  });

  assert.match(markup, /data-chat-v2-run-card-standalone="true"/);
  assert.match(markup, /等待授权/);
  assert.match(markup, /data-run-card-interaction="true"/);
});

test('ChatMessagesPane keeps standalone historical run cards in chronological order instead of pinning them to the bottom', () => {
  const markup = renderPane({
    isLoading: false,
    chatMessages: [
      {
        type: 'user',
        content: '第一条问题',
        id: 'user-1',
        messageId: 'user-1',
        timestamp: '2026-04-20T10:00:00.000Z',
      },
      {
        type: 'user',
        content: '第二条问题',
        id: 'user-2',
        messageId: 'user-2',
        timestamp: '2026-04-20T10:00:10.000Z',
      },
    ],
    visibleMessages: [
      {
        type: 'user',
        content: '第一条问题',
        id: 'user-1',
        messageId: 'user-1',
        timestamp: '2026-04-20T10:00:00.000Z',
      },
      {
        type: 'user',
        content: '第二条问题',
        id: 'user-2',
        messageId: 'user-2',
        timestamp: '2026-04-20T10:00:10.000Z',
      },
    ],
    runCards: [
      {
        sessionId: 'sess-1',
        anchorMessageId: '',
        cardStatus: 'completed',
        headline: '已完成',
        finalResponse: '夹在中间的历史回答',
        processItems: [],
        activeInteraction: null,
        startedAt: '2026-04-20T10:00:05.000Z',
        updatedAt: '2026-04-20T10:00:06.000Z',
        completedAt: '2026-04-20T10:00:06.000Z',
        defaultExpanded: false,
        source: 'official-history',
      },
    ],
  });

  const firstUserIndex = markup.indexOf('第一条问题');
  const standaloneCardIndex = markup.indexOf('已完成 :: 夹在中间的历史回答');
  const secondUserIndex = markup.indexOf('第二条问题');

  assert.notEqual(firstUserIndex, -1);
  assert.notEqual(standaloneCardIndex, -1);
  assert.notEqual(secondUserIndex, -1);
  assert.ok(firstUserIndex < standaloneCardIndex);
  assert.ok(standaloneCardIndex < secondUserIndex);
});

test('ChatMessagesPane precomputes visible user message indexes instead of rescanning the rendered list per row', async () => {
  const source = await readFile(new URL('./ChatMessagesPane.tsx', import.meta.url), 'utf8');

  assert.match(source, /const renderedMessages = useConversationTurns/);
  assert.match(source, /: trimLegacyAssistantMessages\(/);
  assert.match(source, /runCards\.length > 0/);
  assert.match(source, /runCardsByAnchorMessageId/);
  assert.match(source, /standaloneRunCards/);
  assert.match(source, /renderedMessages\.map\(\(message, index\) => \{/);
  assert.doesNotMatch(source, /ConversationStream/);
  assert.doesNotMatch(source, /assistantTurns/);
  assert.doesNotMatch(source, /realtimeBlocks/);
});
