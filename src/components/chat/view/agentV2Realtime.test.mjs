// 验证 realtime coordinator 会把 chat transport 消息按预期发给 WebSocket。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { createAgentV2RealtimeCoordinator } from './agentV2Realtime.ts';
import { createAgentEventStore } from '../store/createAgentEventStore.ts';
import {
  resolvePendingSessionHandoff,
  resolvePendingSessionTraceId,
  shouldAdoptSessionCreatedId,
  shouldCapturePendingSessionHandoffCandidate,
  shouldFinalizeActiveRunV2Event,
} from '../../../hooks/chat/useChatRealtimeHandlers.helpers.ts';

test('agentV2Realtime source no longer describes submit payloads as agent-run transport', async () => {
  const source = await readFile(new URL('./agentV2Realtime.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /agent-run/);
  assert.match(source, /chat_run_start|CLIENT_EVENT_TYPES\.CHAT_RUN_START/);
  assert.match(source, /chat_user_message|CLIENT_EVENT_TYPES\.CHAT_USER_MESSAGE/);
});

const chatInterfaceUrl = new URL('./ChatInterface.tsx', import.meta.url).href;
const tsxLoaderUrl = new URL('../../code-editor/view/subcomponents/tsx-loader.mjs', import.meta.url).href;

const chatInterfaceTranslationStubUrl = `data:text/javascript,${encodeURIComponent(`
export function useTranslation() {
  return {
    t(key, options) {
      return options && typeof options.defaultValue === 'string' ? options.defaultValue : key;
    },
  };
}
`)}`;

const chatMessagesPaneCaptureStubUrl = `data:text/javascript,${encodeURIComponent(`
import { createRequire } from 'node:module';

const require = createRequire(${JSON.stringify(chatInterfaceUrl)});
const React = require('react');

export default function ChatMessagesPane(props) {
  globalThis.__chatInterfaceCapturedPaneProps = props;
  return React.createElement('div', {
    'data-chat-messages-pane-stub': 'true',
    'data-visible-count': String(Array.isArray(props.visibleMessages) ? props.visibleMessages.length : 0),
  });
}
`)}`;

const chatComposerStubUrl = `data:text/javascript,${encodeURIComponent(`
import { createRequire } from 'node:module';

const require = createRequire(${JSON.stringify(chatInterfaceUrl)});
const React = require('react');

export default function ChatComposer() {
  return React.createElement('div', { 'data-chat-composer-stub': 'true' });
}
`)}`;

const authenticatedFetchStubUrl = `data:text/javascript,${encodeURIComponent(`
export async function authenticatedFetch() {
  return {
    ok: false,
    async json() {
      return {};
    },
  };
}
`)}`;

const composerContextBarStubUrl = `data:text/javascript,${encodeURIComponent(`
import { createRequire } from 'node:module';

const require = createRequire(${JSON.stringify(chatInterfaceUrl)});
const React = require('react');

export function ComposerContextBar() {
  return React.createElement('div', { 'data-composer-context-bar-stub': 'true' });
}
`)}`;

const agentEventStoreStubUrl = `data:text/javascript,${encodeURIComponent(`
export function createAgentEventStore() {
  return {
    subscribe() {
      return () => {};
    },
    append() {},
    listBySession() {
      return [];
    },
    listByRun() {
      return [];
    },
  };
}
`)}`;

const sessionRealtimeStoreStubUrl = `data:text/javascript,${encodeURIComponent(`
export function createSessionRealtimeStore() {
  return {
    subscribe() {
      return () => {};
    },
    listBySession() {
      return [];
    },
    clearSession() {},
  };
}
`)}`;

const useChatProviderStateStubUrl = `data:text/javascript,${encodeURIComponent(`
export function useChatProviderState() {
  return {
    provider: 'claude',
    claudeModel: 'claude-opus-4-1',
    permissionMode: 'default',
    pendingDecisionRequests: [],
    setPendingDecisionRequests() {},
    cyclePermissionMode() {},
  };
}
`)}`;

const useChatSessionStateStubUrl = `data:text/javascript,${encodeURIComponent(`
import { createRequire } from 'node:module';

const require = createRequire(${JSON.stringify(chatInterfaceUrl)});
const React = require('react');

export function useChatSessionState() {
  const fixture = globalThis.__chatInterfaceSessionStateFixture || {};

  return {
    chatMessages: fixture.chatMessages || [],
    addMessage() {},
    clearMessages() {},
    rewindMessages() {},
    isLoading: false,
    setIsLoading() {},
    currentSessionId: fixture.currentSessionId || 'session-1',
    setCurrentSessionId() {},
    isLoadingSessionMessages: false,
    canAbortSession: false,
    setCanAbortSession() {},
    isUserScrolledUp: false,
    setIsUserScrolledUp() {},
    tokenBudget: null,
    setTokenBudget() {},
    visibleMessageCount: fixture.visibleMessageCount ?? 1,
    visibleMessages: fixture.visibleMessages || [],
    claudeStatus: null,
    setClaudeStatus() {},
    createDiff() {
      return [];
    },
    scrollContainerRef: { current: null },
    scrollToBottom() {},
    scrollToBottomAndReset() {},
    handleScroll() {},
  };
}
`)}`;

const useChatRealtimeHandlersStubUrl = `data:text/javascript,${encodeURIComponent(`
export function useChatRealtimeHandlers() {}
`)}`;

const useChatComposerStateStubUrl = `data:text/javascript,${encodeURIComponent(`
import { createRequire } from 'node:module';

const require = createRequire(${JSON.stringify(chatInterfaceUrl)});
const React = require('react');

export function useChatComposerState() {
  return {
    input: '',
    textareaRef: { current: null },
    inputHighlightRef: { current: null },
    isTextareaExpanded: false,
    thinkingMode: 'normal',
    setThinkingMode() {},
    slashCommandsCount: 0,
    filteredCommands: [],
    frequentCommands: [],
    commandQuery: '',
    showCommandMenu: false,
    selectedCommandIndex: 0,
    resetCommandMenuState() {},
    handleCommandSelect() {},
    handleToggleCommandMenu() {},
    showFileDropdown: false,
    filteredFiles: [],
    selectedFileIndex: 0,
    renderInputWithMentions() {
      return '';
    },
    selectFile() {},
    attachedImages: [],
    setAttachedImages() {},
    uploadingImages: false,
    imageErrors: [],
    getRootProps() {
      return {};
    },
    getInputProps() {
      return {};
    },
    isDragActive: false,
    openImagePicker() {},
    handleSubmit() {},
    handleInputChange() {},
    handleKeyDown() {},
    handlePaste() {},
    handleTextareaClick() {},
    handleTextareaInput() {},
    syncInputOverlayScroll() {},
    handleClearInput() {},
    handleAbortSession() {},
    handleTranscript() {},
    appendExternalInput() {},
    handlePermissionDecision() {},
    handleGrantToolPermission() {
      return { success: true };
    },
    handleInputFocusChange() {},
    isInputFocused: false,
  };
}
`)}`;

const useSessionStoreStubUrl = `data:text/javascript,${encodeURIComponent(`
export function useSessionStore() {
  return {
    setActiveSession() {},
    getMessages() {
      return [];
    },
    appendRealtime() {},
    clearRealtime() {},
    fetchFromServer() {
      return Promise.resolve(null);
    },
    refreshFromServer() {
      return Promise.resolve();
    },
    has() {
      return false;
    },
    isStale() {
      return true;
    },
  };
}
`)}`;

const useAgentConversationStubUrl = `data:text/javascript,${encodeURIComponent(`
export function useAgentConversation() {
  return {
    execution: null,
    hasBlockingDecision: false,
  };
}
`)}`;

const chatSessionViewStateStubUrl = `data:text/javascript,${encodeURIComponent(`
export function resolveVisibleChatSessionId({
  selectedSessionId,
  currentSessionId,
  pendingSessionId,
}) {
  if (currentSessionId && currentSessionId.startsWith('new-session-')) {
    return currentSessionId;
  }

  if (selectedSessionId) {
    return selectedSessionId;
  }

  if (pendingSessionId) {
    return pendingSessionId;
  }

  return null;
}
`)}`;

const useHistoricalAgentConversationStubUrl = `data:text/javascript,${encodeURIComponent(`
export function useHistoricalAgentConversation() {
  const fixture = globalThis.__chatInterfaceHistoricalFixture || {};
  return {
    history: fixture.history || null,
    turns: fixture.history?.messages || [],
    isLoading: Boolean(fixture.isLoading),
    isLoadingOlder: Boolean(fixture.isLoadingOlder),
    hasMore: Boolean(fixture.hasMore),
    totalMessages: fixture.totalMessages || 0,
    error: fixture.error || null,
    refresh() {},
    async loadOlder() {},
    async loadAll() {},
  };
}
`)}`;

const historicalProjectionStubUrl = `data:text/javascript,${encodeURIComponent(`
export function projectHistoricalChatMessages(messages) {
  return Array.isArray(messages) ? messages : [];
}

export function mergeHistoricalChatMessages(historicalMessages, liveMessages) {
  const merged = [];
  const seenIds = new Set();

  for (const message of [...(historicalMessages || []), ...(liveMessages || [])]) {
    const messageId = String(message?.id || message?.messageId || '').trim();
    if (messageId && seenIds.has(messageId)) {
      continue;
    }
    if (messageId) {
      seenIds.add(messageId);
    }
    merged.push(message);
  }

  return merged;
}
`)}`;

const runCardProjectionStubUrl = `data:text/javascript,${encodeURIComponent(`
export function projectHistoricalRunCards() {
  return [];
}

export function projectLiveRunCards() {
  return [];
}
`)}`;

const conversationRoundsProjectionStubUrl = `data:text/javascript,${encodeURIComponent(`
export function projectConversationRounds({ sessionId, conversationTurns }) {
  return (conversationTurns || []).map((turn, index) => ({
    id: String(turn?.id || index),
    sessionId: String(sessionId || turn?.sessionId || ''),
    userMessage: {
      id: String(turn?.id || index),
      sessionId: String(turn?.sessionId || sessionId || ''),
      content: String(turn?.content || ''),
      timestamp: String(turn?.timestamp || ''),
    },
    assistantCard: {
      id: 'stub-assistant-card',
      sessionId: String(sessionId || turn?.sessionId || ''),
      runId: null,
      anchorMessageId: String(turn?.id || index),
      status: 'queued',
      headline: 'stub',
      responseSegments: [],
      processItems: [],
      previewItems: [],
      activeInteraction: null,
      startedAt: null,
      updatedAt: null,
      completedAt: null,
      source: 'fallback',
    },
  }));
}
`)}`;

const realtimeCoordinatorStubUrl = `data:text/javascript,${encodeURIComponent(`
export function createAgentV2RealtimeCoordinator() {
  return {
    submitRun() {},
    consumeEvent() {},
  };
}
`)}`;

const composerStateStubUrl = `data:text/javascript,${encodeURIComponent(`
export function resolveAgentComposerState() {
  return {
    status: 'idle',
    label: 'Idle',
  };
}
`)}`;

const chatInterfaceLoaderSource = `
import * as base from ${JSON.stringify(tsxLoaderUrl)};

const stubs = new Map([
  ['react-i18next', ${JSON.stringify(chatInterfaceTranslationStubUrl)}],
  ['@hooks/chat/useChatProviderState', ${JSON.stringify(useChatProviderStateStubUrl)}],
  ['@hooks/chat/useChatSessionState', ${JSON.stringify(useChatSessionStateStubUrl)}],
  ['@hooks/chat/useChatRealtimeHandlers', ${JSON.stringify(useChatRealtimeHandlersStubUrl)}],
  ['@hooks/chat/useChatComposerState', ${JSON.stringify(useChatComposerStateStubUrl)}],
  ['@hooks/chat/useAgentConversation', ${JSON.stringify(useAgentConversationStubUrl)}],
  ['@hooks/chat/chatSessionViewState', ${JSON.stringify(chatSessionViewStateStubUrl)}],
  ['@hooks/chat/useHistoricalAgentConversation.ts', ${JSON.stringify(useHistoricalAgentConversationStubUrl)}],
  ['${chatInterfaceUrl}::../hooks/useChatProviderState', ${JSON.stringify(useChatProviderStateStubUrl)}],
  ['${chatInterfaceUrl}::../hooks/useChatSessionState', ${JSON.stringify(useChatSessionStateStubUrl)}],
  ['${chatInterfaceUrl}::../hooks/useChatRealtimeHandlers', ${JSON.stringify(useChatRealtimeHandlersStubUrl)}],
  ['${chatInterfaceUrl}::../hooks/useChatComposerState', ${JSON.stringify(useChatComposerStateStubUrl)}],
  ['${chatInterfaceUrl}::@hooks/chat/chatSessionViewState', ${JSON.stringify(chatSessionViewStateStubUrl)}],
  ['${chatInterfaceUrl}::../../../stores/useSessionStore', ${JSON.stringify(useSessionStoreStubUrl)}],
  ['${chatInterfaceUrl}::./subcomponents/ChatMessagesPane', ${JSON.stringify(chatMessagesPaneCaptureStubUrl)}],
  ['${chatInterfaceUrl}::./subcomponents/ChatComposer', ${JSON.stringify(chatComposerStubUrl)}],
  ['${chatInterfaceUrl}::../../../utils/api', ${JSON.stringify(authenticatedFetchStubUrl)}],
  ['${chatInterfaceUrl}::../components/ComposerContextBar', ${JSON.stringify(composerContextBarStubUrl)}],
  ['${chatInterfaceUrl}::../store/createAgentEventStore', ${JSON.stringify(agentEventStoreStubUrl)}],
  ['${chatInterfaceUrl}::../store/createSessionRealtimeStore', ${JSON.stringify(sessionRealtimeStoreStubUrl)}],
  ['${chatInterfaceUrl}::../hooks/useAgentConversation', ${JSON.stringify(useAgentConversationStubUrl)}],
  ['${chatInterfaceUrl}::../hooks/useHistoricalAgentConversation.ts', ${JSON.stringify(useHistoricalAgentConversationStubUrl)}],
  ['${chatInterfaceUrl}::../projection/projectHistoricalChatMessages.ts', ${JSON.stringify(historicalProjectionStubUrl)}],
  ['${chatInterfaceUrl}::../projection/projectRunCards.ts', ${JSON.stringify(runCardProjectionStubUrl)}],
  ['${chatInterfaceUrl}::../projection/projectConversationRounds.ts', ${JSON.stringify(conversationRoundsProjectionStubUrl)}],
  ['${chatInterfaceUrl}::./agentV2Realtime', ${JSON.stringify(realtimeCoordinatorStubUrl)}],
  ['${chatInterfaceUrl}::./agentComposerState', ${JSON.stringify(composerStateStubUrl)}],
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

register(`data:text/javascript,${encodeURIComponent(chatInterfaceLoaderSource)}`, import.meta.url);

const { default: ChatInterface } = await import('./ChatInterface.tsx');

function renderChatInterfaceWithFixtures({ historicalFixture, sessionStateFixture }) {
  globalThis.__chatInterfaceHistoricalFixture = historicalFixture;
  globalThis.__chatInterfaceSessionStateFixture = sessionStateFixture;
  globalThis.__chatInterfaceCapturedPaneProps = null;

  renderToStaticMarkup(React.createElement(ChatInterface, {
    selectedProject: { id: 'project-1', name: 'demo', path: '/workspace/demo' },
    selectedSession: { id: 'session-1', title: 'Session 1' },
    ws: null,
    sendMessage() {},
    latestMessage: null,
    processingSessions: new Set(),
  }));

  return globalThis.__chatInterfaceCapturedPaneProps;
}

test('agent v2 realtime coordinator sends chat_user_message payload through websocket transport for existing sessions', () => {
  const sent = [];
  const coordinator = createAgentV2RealtimeCoordinator({
    sendMessage(message) {
      sent.push(message);
    },
    appendEvent() {},
  });

  coordinator.submitRun({
    prompt: '请帮我总结改动',
    projectPath: '/workspace/demo',
    sessionId: 'sess-1',
    model: 'claude-opus-4-7',
    effort: 'high',
    permissionMode: 'bypassPermissions',
    sessionSummary: '已有对话摘要',
    images: [],
    toolsSettings: { allowedTools: ['Read'] },
    traceId: 'trace-1',
  });

  assert.deepEqual(sent, [{
    type: 'chat_user_message',
    sessionId: 'sess-1',
    message: {
      role: 'user',
      content: '请帮我总结改动',
    },
  }]);
});

test('agent v2 realtime coordinator forwards outputFormat only for chat_run_start payloads', () => {
  const sent = [];
  const coordinator = createAgentV2RealtimeCoordinator({
    sendMessage(message) {
      sent.push(message);
    },
    appendEvent() {},
  });

  coordinator.submitRun({
    prompt: '按 schema 返回',
    projectPath: '/workspace/demo',
    sessionId: null,
    model: 'claude-opus-4-7',
    effort: 'high',
    permissionMode: 'bypassPermissions',
    sessionSummary: null,
    images: [],
    toolsSettings: {},
    traceId: 'trace-output-format-1',
    outputFormat: {
      type: 'json_schema',
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
        },
        required: ['title'],
      },
    },
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'chat_run_start');
  assert.deepEqual(sent[0].outputFormat, {
    type: 'json_schema',
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
      },
      required: ['title'],
    },
  });
});

test('ChatInterface wires the native scroll handler into ChatMessagesPane for history pagination', () => {
  const paneProps = renderChatInterfaceWithFixtures({
    historicalFixture: {
      messages: [],
      hasMore: true,
      totalMessages: 81,
      isLoadingOlder: false,
      loadOlder() {},
    },
    sessionStateFixture: {
      currentSessionId: 'session-1',
      chatMessages: [],
      visibleMessages: [],
      visibleMessageCount: 0,
    },
  });

  assert.equal(typeof paneProps?.onScroll, 'function');
  assert.equal(paneProps?.onScroll, paneProps?.onWheel);
  assert.equal(paneProps?.onScroll, paneProps?.onTouchMove);
});

test('agent v2 realtime coordinator forwards V2 run events without session_created bridging', () => {
  const consumed = [];
  const coordinator = createAgentV2RealtimeCoordinator({
    sendMessage() {},
    appendEvent(event) {
      consumed.push(event);
    },
  });

  const event = {
    eventId: 'evt-1',
    conversationId: 'conv-1',
    runId: 'run-1',
    sessionId: 'sess-1',
    sequence: 1,
    type: 'run.started',
    timestamp: '2026-04-19T12:00:00.000Z',
    payload: {},
  };

  coordinator.consumeEvent(event);

  assert.deepEqual(consumed, [event]);
});

test('agent v2 realtime coordinator stages an optimistic active run before websocket ack', () => {
  const store = createAgentEventStore();
  const sent = [];
  const coordinator = createAgentV2RealtimeCoordinator({
    sendMessage(message) {
      sent.push(message);
    },
    appendEvent(event) {
      store.append(event);
    },
  });

  coordinator.submitRun({
    prompt: '立即开始执行',
    projectPath: '/workspace/demo',
    sessionId: null,
    model: 'claude-opus-4-7',
    effort: 'max',
    permissionMode: 'bypassPermissions',
    sessionSummary: null,
    images: [],
    toolsSettings: { allowedTools: ['Read'] },
    traceId: 'new-session-123',
  });

  assert.deepEqual(sent, [{
    type: 'chat_run_start',
    sessionId: null,
    projectPath: '/workspace/demo',
    model: 'claude-opus-4-7',
    permissionMode: 'bypassPermissions',
    traceId: 'new-session-123',
    message: {
      role: 'user',
      content: '立即开始执行',
    },
  }]);

  const optimisticEvents = store.listBySession('new-session-123');

  assert.equal(sent.length, 1);
  assert.deepEqual(
    optimisticEvents.map((event) => [event.runId, event.type, event.sequence]),
    [
      ['optimistic:new-session-123', 'run.created', -1],
      ['optimistic:new-session-123', 'run.started', 0],
    ],
  );
});

test('agent event store merges the optimistic active run into the first realtime run for that session', () => {
  const store = createAgentEventStore();
  const coordinator = createAgentV2RealtimeCoordinator({
    sendMessage() {},
    appendEvent(event) {
      store.append(event);
    },
  });

  coordinator.submitRun({
    prompt: '继续执行',
    projectPath: '/workspace/demo',
    sessionId: 'sess-1',
    model: 'claude-opus-4-7',
    effort: 'medium',
    permissionMode: 'bypassPermissions',
    sessionSummary: null,
    images: [],
    toolsSettings: {},
    traceId: 'trace-1',
  });

  coordinator.consumeEvent({
    eventId: 'evt-1',
    conversationId: 'conv-1',
    runId: 'run-real-1',
    sessionId: 'sess-1',
    sequence: 1,
    type: 'assistant.message.delta',
    timestamp: '2026-04-20T12:00:01.000Z',
    payload: { text: '首个 token' },
  });

  assert.deepEqual(
    store.listByRun('run-real-1').map((event) => event.type),
    ['run.created', 'run.started', 'assistant.message.delta'],
  );
  assert.equal(store.listByRun('optimistic:trace-1').length, 0);
});

test('shouldAdoptSessionCreatedId does not let background V2 sessions hijack the current foreground session', () => {
  assert.equal(
    shouldAdoptSessionCreatedId({
      currentSessionId: 'sess-foreground',
      activeViewSessionId: 'sess-foreground',
      pendingSessionId: null,
      newSessionId: 'sess-background',
      eventType: 'run.started',
      eventTraceId: 'trace-background',
      handoffTraceId: null,
      hasPendingSessionHandoff: false,
    }),
    false,
  );

  assert.equal(
    shouldAdoptSessionCreatedId({
      currentSessionId: 'new-session-123',
      activeViewSessionId: 'new-session-123',
      pendingSessionId: null,
      newSessionId: 'sess-background',
      eventType: 'assistant.message.delta',
      eventTraceId: 'trace-background',
      handoffTraceId: 'new-session-123',
      hasPendingSessionHandoff: true,
    }),
    false,
  );
});

test('temp handoff keeps background run.started from becoming the adopt target', () => {
  assert.equal(shouldCapturePendingSessionHandoffCandidate('run.started'), false);
  assert.equal(
    resolvePendingSessionTraceId({
      currentSessionId: 'new-session-123',
      activeViewSessionId: 'new-session-123',
      pendingTraceId: null,
    }),
    'new-session-123',
  );
  assert.equal(
    resolvePendingSessionHandoff({
      currentSessionId: 'new-session-123',
      activeViewSessionId: 'new-session-123',
      pendingSessionId: null,
      pendingCandidateSessionId: null,
      runtimeSessionId: 'sess-background',
      eventType: 'run.started',
      eventTraceId: 'trace-background',
      handoffTraceId: 'new-session-123',
      hasPendingSessionHandoff: true,
    }).shouldAdopt,
    false,
  );
});

test('background run.started plus delta still cannot adopt when traceId does not match current temp handoff', () => {
  const started = resolvePendingSessionHandoff({
    currentSessionId: 'new-session-123',
    activeViewSessionId: 'new-session-123',
    pendingSessionId: null,
    pendingCandidateSessionId: null,
    runtimeSessionId: 'sess-background',
    eventType: 'run.started',
    eventTraceId: 'trace-background',
    handoffTraceId: 'new-session-123',
    hasPendingSessionHandoff: true,
  });

  const delta = resolvePendingSessionHandoff({
    currentSessionId: 'new-session-123',
    activeViewSessionId: 'new-session-123',
    pendingSessionId: started.pendingSessionId,
    pendingCandidateSessionId: started.pendingCandidateSessionId,
    runtimeSessionId: 'sess-background',
    eventType: 'assistant.message.delta',
    eventTraceId: 'trace-background',
    handoffTraceId: 'new-session-123',
    hasPendingSessionHandoff: true,
  });

  assert.equal(started.shouldAdopt, false);
  assert.equal(delta.pendingSessionId, null);
  assert.equal(delta.shouldAdopt, false);
});

test('pending handoff keeps submit trace even before currentSessionId switches to temporary session', () => {
  const handoffTraceId = resolvePendingSessionTraceId({
    currentSessionId: null,
    activeViewSessionId: null,
    pendingTraceId: 'new-session-123',
  });

  const started = resolvePendingSessionHandoff({
    currentSessionId: null,
    activeViewSessionId: null,
    pendingSessionId: null,
    pendingCandidateSessionId: null,
    runtimeSessionId: 'sess-background',
    eventType: 'run.started',
    eventTraceId: 'trace-background',
    handoffTraceId,
    hasPendingSessionHandoff: true,
  });

  const delta = resolvePendingSessionHandoff({
    currentSessionId: null,
    activeViewSessionId: null,
    pendingSessionId: started.pendingSessionId,
    pendingCandidateSessionId: started.pendingCandidateSessionId,
    runtimeSessionId: 'sess-background',
    eventType: 'assistant.message.delta',
    eventTraceId: 'trace-background',
    handoffTraceId,
    hasPendingSessionHandoff: true,
  });

  assert.equal(handoffTraceId, 'new-session-123');
  assert.equal(started.pendingSessionId, null);
  assert.equal(started.shouldAdopt, false);
  assert.equal(delta.pendingSessionId, null);
  assert.equal(delta.shouldAdopt, false);
});

test('temp handoff adopts the real session across run.started -> assistant.message.delta -> run.completed when traceId matches', () => {
  const started = resolvePendingSessionHandoff({
    currentSessionId: 'new-session-123',
    activeViewSessionId: 'new-session-123',
    pendingSessionId: null,
    pendingCandidateSessionId: null,
    runtimeSessionId: 'sess-real',
    eventType: 'run.started',
    eventTraceId: 'new-session-123',
    handoffTraceId: 'new-session-123',
    hasPendingSessionHandoff: true,
  });

  assert.equal(started.pendingSessionId, 'sess-real');
  assert.equal(started.shouldAdopt, true);

  const delta = resolvePendingSessionHandoff({
    currentSessionId: 'sess-real',
    activeViewSessionId: 'sess-real',
    pendingSessionId: started.pendingSessionId,
    pendingCandidateSessionId: started.pendingCandidateSessionId,
    runtimeSessionId: 'sess-real',
    eventType: 'assistant.message.delta',
    eventTraceId: 'new-session-123',
    handoffTraceId: 'new-session-123',
    hasPendingSessionHandoff: true,
  });

  assert.equal(delta.pendingSessionId, 'sess-real');
  assert.equal(delta.shouldAdopt, false);

  const completed = resolvePendingSessionHandoff({
    currentSessionId: 'sess-real',
    activeViewSessionId: 'sess-real',
    pendingSessionId: delta.pendingSessionId,
    pendingCandidateSessionId: delta.pendingCandidateSessionId,
    runtimeSessionId: 'sess-real',
    eventType: 'run.completed',
    eventTraceId: 'new-session-123',
    handoffTraceId: 'new-session-123',
    hasPendingSessionHandoff: true,
  });

  assert.equal(completed.shouldAdopt, false);
});

test('shouldFinalizeActiveRunV2Event ignores terminal events from background sessions', () => {
  assert.equal(
    shouldFinalizeActiveRunV2Event({
      eventSessionId: 'sess-background',
      currentSessionId: 'sess-foreground',
      activeViewSessionId: 'sess-foreground',
      pendingSessionId: null,
    }),
    false,
  );

  assert.equal(
    shouldFinalizeActiveRunV2Event({
      eventSessionId: 'sess-runtime',
      currentSessionId: 'new-session-123',
      activeViewSessionId: 'new-session-123',
      pendingSessionId: 'sess-runtime',
    }),
    true,
  );
});

test('ChatInterface switches the primary execution surface to conversationTurns', async () => {
  const source = await readFile(new URL('./ChatInterface.tsx', import.meta.url), 'utf8');

  assert.match(source, /projectHistoricalRunCards/);
  assert.match(source, /projectLiveRunCards/);
  assert.match(source, /projectConversationTurns/);
  assert.match(source, /projectConversationRounds/);
  assert.match(source, /const conversationTurns = React\.useMemo\(/);
  assert.match(source, /const conversationRounds = React\.useMemo\(/);
  assert.match(source, /const runCards = React\.useMemo\(/);
  assert.match(source, /const runCardsWithPendingFallback = React\.useMemo\(/);
  assert.match(source, /fallbackRunCards:\s*runCardsWithPendingFallback/);
  assert.match(source, /function mergeRunCards\(historicalRunCards: RunCardModel\[], liveRunCards: RunCardModel\[\]\)/);
  assert.match(source, /mergeRunCards\(historicalRunCards, liveRunCards\)/);
  assert.match(source, /conversationTurns=\{conversationTurns\}/);
  assert.match(source, /conversationRounds=\{conversationRounds\}/);
  assert.doesNotMatch(source, /runCards=\{hasAssistantConversationTurn \? \[\] : runCardsWithPendingFallback\}/);
  assert.doesNotMatch(source, /conversationStream=\{agentConversation\.stream\}/);
  assert.doesNotMatch(source, /AgentConversationShell/);
});

test('ChatInterface renders runCards for active V2 runs instead of the old execution panel pair', async () => {
  const source = await readFile(new URL('./ChatInterface.tsx', import.meta.url), 'utf8');

  assert.match(source, /eventVersion: agentEventVersion/);
  assert.doesNotMatch(source, /projectAssistantTurnsForSession/);
  assert.match(source, /const mergedVisibleMessages = React\.useMemo\(/);
  assert.match(source, /const renderableUserMessages = React\.useMemo\(/);
  assert.match(source, /const historicalRunCards = React\.useMemo\(/);
  assert.match(source, /const liveRunCards = React\.useMemo\(/);
  assert.match(source, /mergeRunCards\(historicalRunCards, liveRunCards\)/);
  assert.match(source, /transientMessages:\s*mergedChatMessages/);
  assert.doesNotMatch(source, /liveRunCards\.length > 0 \? liveRunCards : historicalRunCards/);
  assert.match(source, /const hasActiveExecution = agentConversation\.execution\?\.presentationMode === 'active'/);
  assert.match(source, /const previousHadActiveExecution = previousHadActiveExecutionRef\.current/);
  assert.match(source, /if \(previousHadActiveExecution && !hasActiveExecution && activeAgentSessionId\) \{/);
  assert.match(source, /historicalAgentConversation\.refresh\(\)/);
  assert.match(source, /pendingRealtimeCleanupSessionRef/);
  assert.match(source, /baselineMessageCount/);
  assert.match(source, /baselineLastMessageId/);
  assert.match(source, /historicalAgentConversation\.history\?\.sessionId/);
  assert.match(source, /const historyCaughtUp = hydratedMessageCount > pendingRealtimeCleanup\.baselineMessageCount/);
  assert.match(source, /historicalRunCardsCoverLiveRunCards\(historicalRunCards, liveRunCards\)/);
  assert.match(source, /agentRealtimeStoreRef\.current\.clearSession\(pendingRealtimeCleanup\.sessionId\)/);
  assert.match(source, /function hasCompletedHistoricalAssistantReply/);
  assert.match(source, /const staleRealtimeEvents = listAgentRealtimeEvents\(activeAgentSessionId\);/);
  assert.match(source, /if \(!historicalRunCardsCoverLiveRunCards\(historicalRunCards, liveRunCards\)\) \{\s*return;\s*\}/);
  assert.match(source, /agentRealtimeStoreRef\.current\.clearSession\(activeAgentSessionId\);/);
  assert.match(source, /agentRealtimeStoreRef/);
  assert.match(source, /chatMessages=\{mergedChatMessages\}/);
  assert.match(source, /visibleMessages=\{mergedVisibleMessages\}/);
  assert.match(source, /conversationTurns=\{conversationTurns\}/);
  assert.match(source, /conversationRounds=\{conversationRounds\}/);
  assert.doesNotMatch(source, /chatMessages=\{renderableChatMessages\}/);
  assert.doesNotMatch(source, /visibleMessages=\{renderableVisibleMessages\}/);
  assert.doesNotMatch(source, /AssistantRuntimeTurn/);
  assert.doesNotMatch(source, /projectLiveSdkFeed\(listAgentRealtimeEvents\(activeAgentSessionId\)\)/);
  assert.doesNotMatch(source, /realtimeBlocks=\{realtimeBlocks\}/);
  assert.doesNotMatch(source, /assistantTurns=\{renderedAssistantTurns\}/);
  assert.doesNotMatch(source, /runCards=\{hasAssistantConversationTurn \? \[\] : runCardsWithPendingFallback\}/);
  assert.match(source, /pendingDecisionRequests=\{pendingDecisionRequests\}/);
  assert.doesNotMatch(source, /handleGrantToolPermission=\{handleGrantToolPermission\}/);
  assert.doesNotMatch(source, /handleGrantToolPermission=/);
});

test('useAgentConversation recomputes when eventVersion changes', async () => {
  const source = await readFile(new URL('../../../hooks/chat/useAgentConversation.ts', import.meta.url), 'utf8');

  assert.match(source, /eventVersion = 0/);
  assert.doesNotMatch(source, /projectConversationStream/);
  assert.match(source, /}, \[eventVersion, sessionId, listEventsBySession, pendingDecisionRequests\]\);/);
});

test('ChatInterface keeps completed degraded execution warnings visible after run completion', async () => {
  const source = await readFile(new URL('./ChatInterface.tsx', import.meta.url), 'utf8');

  assert.match(source, /data-chat-v2-context-file-tag=/);
  assert.match(source, /contextBar=\{composerContextBar\}/);
});

test('ChatInterface only refreshes canonical history on websocket reconnect when catch-up is actually needed', async () => {
  const source = await readFile(new URL('./ChatInterface.tsx', import.meta.url), 'utf8');

  assert.match(source, /const shouldRefreshHistoryOnReconnect = hasActiveExecution \|\| Boolean\(pendingRealtimeCleanupSessionRef\.current\);/);
  assert.match(source, /if \(!selectedProject \|\| !selectedSession \|\| !shouldRefreshHistoryOnReconnect\) return;/);
  assert.match(source, /historicalAgentConversation\.refresh\(\);/);
});

test('ChatInterface force-refreshes canonical history once when a completed session still has no visible assistant surface', async () => {
  const source = await readFile(new URL('./ChatInterface.tsx', import.meta.url), 'utf8');

  assert.match(source, /const missingAssistantRecoveryRef = useRef<string \| null>\(null\);/);
  assert.match(source, /if \(composerState\.status !== 'completed'\) \{/);
  assert.match(source, /function hasVisibleAssistantSurface\(assistantCard:/);
  assert.match(source, /if \(assistantCard\.activeInteraction\) \{\s*return true;\s*\}/);
  assert.match(source, /if \(assistantCard\.processItems\.length > 0\) \{\s*return true;\s*\}/);
  assert.match(source, /assistantCard\.responseSegments\.some\(\(segment\) => Boolean\(String\(segment\.body \|\| ''\)\.trim\(\)\)\)/);
  assert.match(source, /const hasVisibleAssistantCard = conversationRounds\.some\(\(round\) => hasVisibleAssistantSurface\(round\.assistantCard\)\);/);
  assert.match(source, /hasVisibleAssistantCard[\s\S]*renderableUserMessages\.length === 0/);
  assert.match(source, /const recoveryKey = `\$\{activeAgentSessionId\}:\$\{latestRenderableUserMessageId \|\| 'no-user-id'\}:\$\{loadedCanonicalMessageCount\}`;/);
  assert.match(source, /historicalAgentConversation\.refresh\(\);/);
});

test('ChatInterface does not treat a headline-only assistant placeholder as visible assistant surface', async () => {
  const source = await readFile(new URL('./ChatInterface.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(
    source,
    /if \(!isPlaceholderSurface && String\(assistantCard\.headline \|\| ''\)\.trim\(\)\) \{\s*return true;\s*\}/,
  );
});

test('ChatInterface passes conversationRounds directly without a local ChatMessagesPane type shim', async () => {
  const source = await readFile(new URL('./ChatInterface.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /const ChatMessagesPaneWithRounds = ChatMessagesPane as React\.ComponentType/);
  assert.match(source, /<ChatMessagesPane/);
  assert.match(source, /conversationRounds=\{conversationRounds\}/);
});

test('ChatInterface does not immediately force-refresh canonical history when an active run flips to completed', async () => {
  const source = await readFile(new URL('./ChatInterface.tsx', import.meta.url), 'utf8');

  assert.match(source, /if \(previousHadActiveExecution && !hasActiveExecution && activeAgentSessionId\) \{/);
  assert.match(source, /pendingRealtimeCleanupSessionRef\.current = \{/);
  assert.match(source, /previousHadActiveExecutionRef\.current = hasActiveExecution;/);
  assert.doesNotMatch(
    source,
    /if \(previousHadActiveExecution && !hasActiveExecution && activeAgentSessionId\) \{[\s\S]{0,300}historicalAgentConversation\.refresh\(\);/,
  );
});

test('ChatInterface disables historical pagination props and keeps full-history count wired in', async () => {
  const source = await readFile(new URL('./ChatInterface.tsx', import.meta.url), 'utf8');

  assert.match(source, /const historicalAgentConversation = useHistoricalAgentConversation\(\{/);
  assert.match(source, /isLoadingMoreMessages=\{false\}/);
  assert.match(source, /hasMoreMessages=\{false\}/);
  assert.match(source, /totalMessages=\{historicalAgentConversation\.totalMessages\}/);
  assert.match(source, /loadEarlierMessages=\{\(\) => \{\}\}/);
  assert.match(source, /loadAllMessages=\{\(\) => \{\}\}/);
  assert.match(source, /allMessagesLoaded=\{false\}/);
  assert.match(source, /isLoadingAllMessages=\{false\}/);
  assert.match(source, /loadAllJustFinished=\{false\}/);
  assert.match(source, /showLoadAllOverlay=\{false\}/);
  assert.match(source, /const loadedCanonicalMessageCount = historicalAgentConversation\.history\?\.messages\.length \|\| 0;/);
  assert.match(source, /loadedCanonicalMessageCount=\{loadedCanonicalMessageCount\}/);
});

test('ChatInterface keeps the expanded historical page visible even when legacy visibleMessageCount is stale', () => {
  const paneProps = renderChatInterfaceWithFixtures({
    historicalFixture: {
      history: {
        sessionId: 'session-1',
        messages: [
          {
            id: 'history-1',
            messageId: 'history-1',
            type: 'user',
            content: '更早的第一条',
            timestamp: '2026-04-20T10:00:00.000Z',
          },
          {
            id: 'history-2',
            messageId: 'history-2',
            type: 'assistant',
            content: '更早的第二条',
            timestamp: '2026-04-20T10:00:01.000Z',
          },
          {
            id: 'history-3',
            messageId: 'history-3',
            type: 'user',
            content: 'loadOlder 后新增的一条',
            timestamp: '2026-04-20T10:00:02.000Z',
          },
        ],
      },
      hasMore: false,
      totalMessages: 9,
    },
    sessionStateFixture: {
      currentSessionId: 'session-1',
      visibleMessageCount: 1,
      visibleMessages: [
        {
          id: 'legacy-visible-only',
          messageId: 'legacy-visible-only',
          type: 'assistant',
          content: '旧窗口里只剩这一条',
          timestamp: '2026-04-20T10:00:03.000Z',
        },
      ],
      chatMessages: [
        {
          id: 'live-1',
          messageId: 'live-1',
          type: 'assistant',
          content: '最新实时回复',
          timestamp: '2026-04-20T10:00:04.000Z',
        },
      ],
    },
  });

  assert.ok(paneProps);
  assert.deepEqual(
    paneProps.visibleMessages.map((message) => message.id),
    ['history-1', 'history-2', 'history-3', 'live-1'],
  );
  assert.equal(paneProps.visibleMessages.length, 4);
  assert.equal(paneProps.totalMessages, 9);
});

test('ChatInterface passes the loaded canonical history count to the pane summary instead of the projected visible chat count', () => {
  const paneProps = renderChatInterfaceWithFixtures({
    historicalFixture: {
      history: {
        sessionId: 'session-1',
        messages: [
          {
            id: 'history-1',
            messageId: 'history-1',
            type: 'user',
            content: '第一条',
            timestamp: '2026-04-20T10:00:00.000Z',
          },
          {
            id: 'history-2',
            messageId: 'history-2',
            type: 'assistant',
            content: '第二条',
            timestamp: '2026-04-20T10:00:01.000Z',
          },
          {
            id: 'history-3',
            messageId: 'history-3',
            type: 'user',
            content: '第三条',
            timestamp: '2026-04-20T10:00:02.000Z',
          },
        ],
      },
      hasMore: false,
      totalMessages: 8,
    },
    sessionStateFixture: {
      currentSessionId: 'session-1',
      visibleMessageCount: 1,
      visibleMessages: [
        {
          id: 'legacy-visible-only',
          messageId: 'legacy-visible-only',
          type: 'assistant',
          content: '旧窗口里只剩这一条',
          timestamp: '2026-04-20T10:00:03.000Z',
        },
      ],
      chatMessages: [],
    },
  });

  assert.ok(paneProps);
  assert.equal(paneProps.loadedCanonicalMessageCount, 3);
  assert.equal(paneProps.totalMessages, 8);
  assert.equal(paneProps.hasMoreMessages, false);
});

test('ChatInterface no longer passes selected session store pagination props into ChatMessagesPane', async () => {
  const source = await readFile(new URL('./ChatInterface.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /isLoadingMoreMessages,\s*\n\s*hasMoreMessages,\s*\n\s*totalMessages,/);
  assert.doesNotMatch(source, /loadEarlierMessages,\s*\n\s*loadAllMessages,/);
  assert.doesNotMatch(source, /allMessagesLoaded,/);
  assert.doesNotMatch(source, /isLoadingMoreMessages=\{isLoadingMoreMessages\}/);
  assert.doesNotMatch(source, /hasMoreMessages=\{hasMoreMessages\}/);
  assert.doesNotMatch(source, /totalMessages=\{totalMessages\}/);
  assert.doesNotMatch(source, /loadEarlierMessages=\{loadEarlierMessages\}/);
  assert.doesNotMatch(source, /loadAllMessages=\{loadAllMessages\}/);
  assert.doesNotMatch(source, /allMessagesLoaded=\{allMessagesLoaded\}/);
  assert.doesNotMatch(source, /visibleMessageCount=\{historicalChatMessages\.length\}/);
  assert.doesNotMatch(source, /sessionMessagesCount=\{historicalChatMessages\.length\}/);
});

test('ChatInterface feeds ChatMessagesPane with projectConversationTurns as the main render source', async () => {
  const source = await readFile(new URL('./ChatInterface.tsx', import.meta.url), 'utf8');
  assert.match(source, /projectConversationTurns/);
  assert.match(source, /conversationTurns=\{conversationTurns\}/);
  assert.match(source, /projectConversationRounds/);
  assert.match(source, /conversationRounds=\{conversationRounds\}/);
});

test('ChatInterface resolves the visible active session id with the shared chatSessionViewState helper', async () => {
  const source = await readFile(new URL('./ChatInterface.tsx', import.meta.url), 'utf8');

  assert.match(source, /import \{ resolveVisibleChatSessionId \} from '@hooks\/chat\/chatSessionViewState';/);
  assert.match(source, /const activeAgentSessionId = resolveVisibleChatSessionId\(\{/);
  assert.match(source, /selectedSessionId: selectedSession\?\.id \|\| null,/);
  assert.match(source, /currentSessionId,/);
  assert.match(source, /pendingSessionId: pendingViewSessionRef\.current\?\.sessionId \|\| null,/);
  assert.doesNotMatch(source, /const activeAgentSessionId = currentSessionId \|\| pendingViewSessionRef\.current\?\.sessionId \|\| selectedSession\?\.id \|\| null;/);
});

test('ChatComposer exposes a V2 composer dock with explicit blocked state', async () => {
  const source = await readFile(new URL('./subcomponents/ChatComposer.tsx', import.meta.url), 'utf8');

  assert.match(source, /data-chat-v2-composer-dock/);
  assert.match(source, /data-chat-v2-composer-blocked/);
});
