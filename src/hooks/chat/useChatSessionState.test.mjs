import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { register } from 'node:module';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

import { shouldPreserveTransientSessionState } from './transientSessionState.ts';
import { mergePendingUserMessage } from './pendingUserMessage.ts';
import {
  projectSelectedSessionHistoryUiState,
  resolveSelectedSessionHistoryId,
  shouldApplySelectedSessionHistoryResponse,
} from './selectedSessionHistoryBinding.ts';
import { syncCompletedSessionHistory } from './sessionCompletionSync.ts';

const useChatSessionStateUrl = new URL('./useChatSessionState.ts', import.meta.url).href;
const apiStubUrl = `data:text/javascript,${encodeURIComponent(`
export async function authenticatedFetch() {
  throw new Error('authenticatedFetch should not be called in useChatSessionState hook tests');
}
`)}`;

const loaderSource = `
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const stubs = new Map([
  ['${useChatSessionStateUrl}::../../../utils/api', ${JSON.stringify(apiStubUrl)}],
]);
const extensions = ['.tsx', '.ts', '.mts', '.jsx', '.js', '.mjs'];
const aliasRoots = new Map([
  ['@/', path.join(process.cwd(), 'src')],
  ['@components/', path.join(process.cwd(), 'src/components')],
  ['@hooks/', path.join(process.cwd(), 'src/hooks')],
  ['@services/', path.join(process.cwd(), 'src/services')],
  ['@stores/', path.join(process.cwd(), 'src/stores')],
  ['@utils/', path.join(process.cwd(), 'src/utils')],
  ['@types/', path.join(process.cwd(), 'src/types')],
  ['@constants/', path.join(process.cwd(), 'src/constants')],
  ['@views/', path.join(process.cwd(), 'src/views')],
]);

function maybeResolveAlias(specifier) {
  for (const [prefix, root] of aliasRoots) {
    if (!specifier.startsWith(prefix)) {
      continue;
    }

    const relativePath = specifier.slice(prefix.length);
    const basePath = path.join(root, relativePath);
    return pathToFileURL(basePath).href;
  }

  return null;
}

async function resolveWithExtensions(nextResolve, specifier, context) {
  const hasKnownExtension = /\\.[a-z]+$/i.test(specifier);
  if (hasKnownExtension) {
    try {
      return await nextResolve(specifier, context);
    } catch (error) {
      const withoutExtension = specifier.replace(/\\.[a-z]+$/i, '');
      for (const extension of extensions) {
        try {
          return await nextResolve(withoutExtension + extension, context);
        } catch {
          // Try the next extension.
        }
      }

      throw error;
    }
  }

  for (const extension of extensions) {
    try {
      return await nextResolve(specifier + extension, context);
    } catch {
      // Try the next extension.
    }
  }

  return nextResolve(specifier, context);
}

export async function resolve(specifier, context, nextResolve) {
  const contextual = stubs.get(String(context.parentURL || '') + '::' + specifier);
  if (contextual) {
    return {
      url: contextual,
      shortCircuit: true,
    };
  }

  const aliased = maybeResolveAlias(specifier);
  if (aliased) {
    return resolveWithExtensions(nextResolve, aliased, context);
  }

  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    return resolveWithExtensions(nextResolve, specifier, context);
  }

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && /\\.[a-z]+$/i.test(specifier)) {
      const withoutExtension = specifier.replace(/\\.[a-z]+$/i, '');
      for (const extension of extensions) {
        try {
          return await nextResolve(withoutExtension + extension, context);
        } catch {
          // Try the next extension.
        }
      }
    }

    throw error;
  }
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('data:text/javascript,')) {
    return {
      format: 'module',
      source: decodeURIComponent(url.slice('data:text/javascript,'.length)),
      shortCircuit: true,
    };
  }

  return nextLoad(url, context);
}
`;

register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);

const { useChatSessionState } = await import('./useChatSessionState.ts');

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  value: true,
  configurable: true,
});

class FakeNode {
  constructor(type, ownerDocument) {
    this.nodeType = type;
    this.ownerDocument = ownerDocument || this;
    this.childNodes = [];
    this.parentNode = null;
    this.textContent = '';
    this.nodeName = type === 1 ? 'DIV' : '#text';
    this.namespaceURI = 'http://www.w3.org/1999/xhtml';
    this.style = {};
    this.scrollHeight = 200;
    this.scrollTop = 0;
    this.clientHeight = 100;
    this.tagName = 'DIV';
  }

  appendChild(node) {
    this.childNodes.push(node);
    node.parentNode = this;
    return node;
  }

  removeChild(node) {
    const index = this.childNodes.indexOf(node);
    if (index >= 0) {
      this.childNodes.splice(index, 1);
    }
    node.parentNode = null;
    return node;
  }

  insertBefore(node, before) {
    const index = this.childNodes.indexOf(before);
    if (index >= 0) {
      this.childNodes.splice(index, 0, node);
    } else {
      this.childNodes.push(node);
    }
    node.parentNode = this;
    return node;
  }

  setAttribute() {}

  removeAttribute() {}

  addEventListener() {}

  removeEventListener() {}

  focus() {
    this.ownerDocument.activeElement = this;
  }
}

class FakeTextNode extends FakeNode {
  constructor(text, ownerDocument) {
    super(3, ownerDocument);
    this.textContent = text;
    this.nodeValue = text;
    this.nodeName = '#text';
  }
}

class FakeCommentNode extends FakeNode {
  constructor(text, ownerDocument) {
    super(8, ownerDocument);
    this.textContent = text;
    this.nodeValue = text;
    this.nodeName = '#comment';
  }
}

class FakeDocument extends FakeNode {
  constructor() {
    super(9);
    this.ownerDocument = this;
    this.documentElement = new FakeNode(1, this);
    this.body = new FakeNode(1, this);
    this.activeElement = this.body;
  }

  createElement() {
    return new FakeNode(1, this);
  }

  createElementNS() {
    return new FakeNode(1, this);
  }

  createTextNode(text) {
    return new FakeTextNode(text, this);
  }

  createComment(text) {
    return new FakeCommentNode(text, this);
  }
}

function FakeHTMLElement() {}

function FakeHTMLIFrameElement() {}

function installFakeDom() {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousNavigator = globalThis.navigator;
  const previousHTMLElement = globalThis.HTMLElement;
  const previousHTMLIFrameElement = globalThis.HTMLIFrameElement;
  const document = new FakeDocument();
  const container = new FakeNode(1, document);
  const windowValue = {
    document,
    addEventListener() {},
    removeEventListener() {},
    HTMLElement: FakeHTMLElement,
    HTMLIFrameElement: FakeHTMLIFrameElement,
  };

  Object.defineProperty(globalThis, 'document', {
    value: document,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'window', {
    value: windowValue,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'node' },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'HTMLElement', {
    value: FakeHTMLElement,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'HTMLIFrameElement', {
    value: FakeHTMLIFrameElement,
    configurable: true,
  });

  return {
    container,
    restore() {
      Object.defineProperty(globalThis, 'document', {
        value: previousDocument,
        configurable: true,
      });
      Object.defineProperty(globalThis, 'window', {
        value: previousWindow,
        configurable: true,
      });
      Object.defineProperty(globalThis, 'navigator', {
        value: previousNavigator,
        configurable: true,
      });
      Object.defineProperty(globalThis, 'HTMLElement', {
        value: previousHTMLElement,
        configurable: true,
      });
      Object.defineProperty(globalThis, 'HTMLIFrameElement', {
        value: previousHTMLIFrameElement,
        configurable: true,
      });
    },
  };
}

async function renderChatSessionStateHarness({
  sessionStore,
  selectedSession = { id: 'session-old-456', title: 'old session' },
  selectedProject = {
    name: 'demo-project',
    fullPath: '/workspace/demo-project',
    path: '/workspace/demo-project',
  },
} = {}) {
  const dom = installFakeDom();
  const pendingViewSessionRef = { current: null };
  const noop = () => {};
  const hookArgs = {
    selectedProject,
    selectedSession,
    ws: null,
    sendMessage: noop,
    autoScrollToBottom: false,
    externalMessageUpdate: 0,
    processingSessions: new Set(),
    resetStreamingState: noop,
    pendingViewSessionRef,
    sessionStore,
  };
  let currentResult = null;

  function Harness() {
    currentResult = useChatSessionState(hookArgs);
    return null;
  }

  const root = createRoot(dom.container);
  await act(async () => {
    root.render(React.createElement(Harness));
    await Promise.resolve();
  });

  return {
    getResult() {
      return currentResult;
    },
    async cleanup() {
      await act(async () => {
        root.unmount();
      });
      dom.restore();
    },
  };
}

test('useChatSessionState 在切回已存在会话时也会请求 reconnect 状态恢复', async () => {
  const sendCalls = [];
  const sessionStore = {
    setActiveSession() {},
    getMessages() { return []; },
    has() { return false; },
    isStale() { return false; },
  };
  const dom = installFakeDom();
  const pendingViewSessionRef = { current: null };
  const hookArgs = {
    selectedProject: {
      name: 'demo-project',
      fullPath: '/workspace/demo-project',
      path: '/workspace/demo-project',
    },
    selectedSession: { id: 'session-1', title: 'Session 1' },
    ws: {},
    sendMessage: (message) => {
      sendCalls.push(message);
    },
    autoScrollToBottom: false,
    externalMessageUpdate: 0,
    processingSessions: new Set(),
    resetStreamingState() {},
    pendingViewSessionRef,
    sessionStore,
    disableSelectedSessionServerHydration: true,
  };

  function Harness() {
    useChatSessionState(hookArgs);
    return null;
  }

  const root = createRoot(dom.container);

  await act(async () => {
    root.render(React.createElement(Harness));
    await Promise.resolve();
  });

  await act(async () => {
    hookArgs.selectedSession = { id: 'session-2', title: 'Session 2' };
    root.render(React.createElement(Harness));
    await Promise.resolve();
  });

  await act(async () => {
    root.unmount();
  });
  dom.restore();

  assert.deepEqual(sendCalls, [
    { type: 'chat_reconnect', sessionId: 'session-1', provider: 'claude' },
    { type: 'chat_reconnect', sessionId: 'session-2', provider: 'claude' },
  ]);
});

test('keeps the pending user message visible before any persisted user message exists', () => {
  const pendingUserMessage = {
    type: 'user',
    content: '111',
    timestamp: new Date('2026-04-13T23:24:11Z'),
  };

  const visibleMessages = mergePendingUserMessage(
    [
      {
        type: 'assistant',
        content: 'Thinking...',
        timestamp: new Date('2026-04-13T23:24:12Z'),
        isThinking: true,
      },
    ],
    pendingUserMessage,
  );

  assert.deepEqual(visibleMessages, [
    pendingUserMessage,
    {
      type: 'assistant',
      content: 'Thinking...',
      timestamp: new Date('2026-04-13T23:24:12Z'),
      isThinking: true,
    },
  ]);
});

test('drops the pending user message once the store already contains a user turn', () => {
  const pendingUserMessage = {
    type: 'user',
    content: '111',
    timestamp: new Date('2026-04-13T23:24:11Z'),
  };

  const persistedUserMessage = {
    type: 'user',
    content: '111',
    timestamp: new Date('2026-04-13T23:24:11Z'),
  };

  const visibleMessages = mergePendingUserMessage(
    [
      persistedUserMessage,
      {
        type: 'assistant',
        content: '你好',
        timestamp: new Date('2026-04-13T23:24:16Z'),
      },
    ],
    pendingUserMessage,
  );

  assert.deepEqual(visibleMessages, [
    persistedUserMessage,
    {
      type: 'assistant',
      content: '你好',
      timestamp: new Date('2026-04-13T23:24:16Z'),
    },
  ]);
});

test('syncCompletedSessionHistory 完成后只刷新服务端历史，不提前清空 realtime 回显', async () => {
  const calls = [];
  const sessionStore = {
    refreshFromServer: async (sessionId, options) => {
      calls.push({ type: 'refresh', sessionId, options });
    },
  };

  await syncCompletedSessionHistory({
    sessionId: 'session-1',
    provider: 'claude',
    selectedProject: {
      name: 'demo-project',
      fullPath: '/workspace/demo-project',
      path: '/workspace/demo-project',
    },
    sessionStore,
  });

  assert.deepEqual(calls, [
    {
      type: 'refresh',
      sessionId: 'session-1',
      options: {
        provider: 'claude',
        projectName: 'demo-project',
        projectPath: '/workspace/demo-project',
      },
    },
  ]);
});

test('syncCompletedSessionHistory 在 refresh 失败时保留 realtime 消息', async () => {
  const calls = [];
  const sessionStore = {
    refreshFromServer: async () => {
      calls.push({ type: 'refresh' });
      throw new Error('network failed');
    },
  };

  await syncCompletedSessionHistory({
    sessionId: 'session-1',
    provider: 'claude',
    selectedProject: {
      name: 'demo-project',
      fullPath: '/workspace/demo-project',
      path: '/workspace/demo-project',
    },
    sessionStore,
  });

  assert.deepEqual(calls, [{ type: 'refresh' }]);
});

test('syncCompletedSessionHistory 在服务端历史仍停在 thinking 时会重试，再用完整历史替换 realtime', async () => {
  const calls = [];
  let attempt = 0;
  const slots = [
    {
      serverMessages: [
        { kind: 'text', role: 'user', content: '321' },
        { kind: 'thinking', role: 'assistant', content: '思考中...' },
      ],
    },
    {
      serverMessages: [
        { kind: 'text', role: 'user', content: '321' },
        { kind: 'thinking', role: 'assistant', content: '思考中...' },
        { kind: 'text', role: 'assistant', content: '最终答复' },
      ],
    },
  ];

  const sessionStore = {
    refreshFromServer: async (sessionId, options) => {
      calls.push({ type: 'refresh', attempt, sessionId, options });
      attempt += 1;
    },
    getSessionSlot: () => slots[Math.min(Math.max(attempt - 1, 0), slots.length - 1)],
  };

  const waits = [];

  await syncCompletedSessionHistory({
    sessionId: 'session-1',
    provider: 'claude',
    selectedProject: {
      name: 'demo-project',
      fullPath: '/workspace/demo-project',
      path: '/workspace/demo-project',
    },
    sessionStore,
    wait: async (ms) => {
      waits.push(ms);
    },
  });

  assert.deepEqual(
    calls.map((call) => call.type),
    ['refresh', 'refresh'],
  );
  assert.deepEqual(waits, [150]);
});

test('临时新会话切换到真实 session 时应保留 loading 状态', () => {
  assert.equal(
    shouldPreserveTransientSessionState({
      currentSessionId: 'new-session-123',
      nextSessionId: 'session-real-123',
      pendingSessionId: 'session-real-123',
    }),
    true,
  );
});

test('普通会话切换到另一条已存在 session 时不应保留 loading 状态', () => {
  assert.equal(
    shouldPreserveTransientSessionState({
      currentSessionId: 'session-old-123',
      nextSessionId: 'session-other-456',
      pendingSessionId: null,
    }),
    false,
  );
});

test('activeSessionId 与 selectedSession.id 不一致时不应复用 selectedSession 的历史分页绑定', () => {
  assert.equal(
    resolveSelectedSessionHistoryId({
      activeSessionId: 'new-session-123',
      selectedSessionId: 'session-old-456',
    }),
    null,
  );
});

test('activeSessionId 与 selectedSession.id 一致时应保留 selectedSession 的历史分页绑定', () => {
  assert.equal(
    resolveSelectedSessionHistoryId({
      activeSessionId: 'session-old-456',
      selectedSessionId: 'session-old-456',
    }),
    'session-old-456',
  );
});

test('projectSelectedSessionHistoryUiState 在 detached view 下会抑制旧分页与 load-all 状态', () => {
  assert.deepEqual(
    projectSelectedSessionHistoryUiState({
      selectedSessionHistoryId: null,
      hasMoreMessages: true,
      totalMessages: 39,
      allMessagesLoaded: true,
      isLoadingAllMessages: true,
      loadAllJustFinished: true,
      showLoadAllOverlay: true,
    }),
    {
      hasMoreMessages: false,
      totalMessages: 0,
      allMessagesLoaded: false,
      isLoadingAllMessages: false,
      loadAllJustFinished: false,
      showLoadAllOverlay: false,
    },
  );
});

test('projectSelectedSessionHistoryUiState 在绑定 selectedSession 时保留历史状态', () => {
  assert.deepEqual(
    projectSelectedSessionHistoryUiState({
      selectedSessionHistoryId: 'session-old-456',
      hasMoreMessages: true,
      totalMessages: 39,
      allMessagesLoaded: true,
      isLoadingAllMessages: false,
      loadAllJustFinished: true,
      showLoadAllOverlay: false,
    }),
    {
      hasMoreMessages: true,
      totalMessages: 39,
      allMessagesLoaded: true,
      isLoadingAllMessages: false,
      loadAllJustFinished: true,
      showLoadAllOverlay: false,
    },
  );
});

test('shouldApplySelectedSessionHistoryResponse 只接受仍绑定到当前 selectedSession 的异步回包', () => {
  assert.equal(
    shouldApplySelectedSessionHistoryResponse({
      latestSelectedSessionHistoryId: 'session-old-456',
      requestSessionId: 'session-old-456',
    }),
    true,
  );
  assert.equal(
    shouldApplySelectedSessionHistoryResponse({
      latestSelectedSessionHistoryId: null,
      requestSessionId: 'session-old-456',
    }),
    false,
  );
  assert.equal(
    shouldApplySelectedSessionHistoryResponse({
      latestSelectedSessionHistoryId: 'session-new-789',
      requestSessionId: 'session-old-456',
    }),
    false,
  );
});

test('useChatSessionState 在运行时会在切到临时 new-session 后压制旧 selectedSession 的分页状态', async () => {
  const stableMessages = [];
  const sessionStore = {
    setActiveSession() {},
    appendRealtime() {},
    clearRealtime() {},
    getMessages() {
      return stableMessages;
    },
    has() {
      return false;
    },
    isStale() {
      return true;
    },
    async fetchFromServer() {
      return {
        hasMore: true,
        total: 39,
        serverMessages: [],
      };
    },
    async fetchMore() {
      return {
        hasMore: false,
        total: 40,
        serverMessages: [{}],
      };
    },
    async refreshFromServer() {},
  };

  const harness = await renderChatSessionStateHarness({ sessionStore });
  try {
    assert.equal(harness.getResult().hasMoreMessages, true);
    assert.equal(harness.getResult().totalMessages, 39);

    await act(async () => {
      harness.getResult().setCurrentSessionId('new-session-123');
      await Promise.resolve();
    });

    assert.equal(harness.getResult().hasMoreMessages, false);
    assert.equal(harness.getResult().totalMessages, 0);
    assert.equal(harness.getResult().allMessagesLoaded, false);
    assert.equal(harness.getResult().showLoadAllOverlay, false);
  } finally {
    await harness.cleanup();
  }
});

test('useChatSessionState 在 detached view 中会丢弃旧 selectedSession 的 load-all 回包并恢复顶部加载能力', async () => {
  let fetchFromServerCalls = 0;
  let fetchMoreCalls = 0;
  let resolveLoadAllResponse = null;
  const stableMessages = [];
  const sessionStore = {
    setActiveSession() {},
    appendRealtime() {},
    clearRealtime() {},
    getMessages() {
      return stableMessages;
    },
    has() {
      return false;
    },
    isStale() {
      return true;
    },
    fetchFromServer() {
      fetchFromServerCalls += 1;
      if (fetchFromServerCalls === 1) {
        return Promise.resolve({
          hasMore: true,
          total: 39,
          serverMessages: [],
        });
      }

      return new Promise((resolve) => {
        resolveLoadAllResponse = () => resolve({
          hasMore: false,
          total: 39,
          serverMessages: [],
        });
      });
    },
    async fetchMore() {
      fetchMoreCalls += 1;
      return {
        hasMore: false,
        total: 40,
        serverMessages: [{}],
      };
    },
    async refreshFromServer() {},
  };

  const harness = await renderChatSessionStateHarness({ sessionStore });
  try {
    const scrollContainer = new FakeNode(1, globalThis.document);
    const initialResult = harness.getResult();
    initialResult.scrollContainerRef.current = scrollContainer;

    let loadAllPromise;
    await act(async () => {
      loadAllPromise = initialResult.loadAllMessages();
      await Promise.resolve();
    });

    await act(async () => {
      harness.getResult().setCurrentSessionId('new-session-123');
      await Promise.resolve();
    });

    await act(async () => {
      resolveLoadAllResponse();
      await loadAllPromise;
    });

    assert.equal(harness.getResult().allMessagesLoaded, false);
    assert.equal(harness.getResult().showLoadAllOverlay, false);

    await act(async () => {
      harness.getResult().setCurrentSessionId('session-old-456');
      await Promise.resolve();
    });

    scrollContainer.scrollTop = 0;
    scrollContainer.scrollHeight = 200;
    scrollContainer.clientHeight = 100;

    await act(async () => {
      await harness.getResult().handleScroll();
    });

    assert.equal(fetchMoreCalls, 1);
  } finally {
    await harness.cleanup();
  }
});

test('useChatSessionState does not revive current execution state from legacy sessionStore alone', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/chat/useChatSessionState.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /sessionStore 只负责历史回放、缓存 transcript 和本地回显/);
  assert.match(source, /当前是否正在执行，必须由 V2 run events 与 execution projection 决定/);
  assert.doesNotMatch(source, /processingSessions\.has\(activeViewSessionId\)/);
  assert.match(source, /deriveTokenBudgetFromMessages/);
  assert.match(source, /if \(derivedTokenBudget\) \{\s*setTokenBudget\(/);
});

test('useChatSessionState keeps user image attachments when echoing local messages into the session store', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/chat/useChatSessionState.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /images:\s*msg\.images \|\| \[\],/);
});

test('useChatMessages suppresses expanded skill prompts through shared protocol noise filtering', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/chat/useChatMessages.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /isExpandedSkillPromptContent/);
  assert.doesNotMatch(source, /function hasNearbyRawSlashUserMessage/);
  assert.match(source, /if \(isExpandedSkillPromptContent\(content\)\) \{\s*break;\s*\}/);
});

test('useChatSessionState ignores stale session history responses after the user leaves that session', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/chat/useChatSessionState.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /const sessionLoadRequestIdRef = useRef\(0\);/);
  assert.match(source, /sessionLoadRequestIdRef\.current \+= 1;/);
  assert.match(source, /const requestId = sessionLoadRequestIdRef\.current \+ 1;/);
  assert.match(source, /sessionLoadRequestIdRef\.current = requestId;/);
  assert.match(source, /if \(sessionLoadRequestIdRef\.current !== requestId\) \{\s*return;\s*\}/);
  assert.match(source, /setHasMoreMessages\(slot\.hasMore\);/);
  assert.match(source, /setTotalMessages\(slot\.total\);/);
});

test('useChatSessionState clears session loading state when switching into a draft new-session view', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/chat/useChatSessionState.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  const branchSnippet = source.slice(
    source.indexOf('if (!selectedSession || !selectedProjectName || !selectedProjectPath) {'),
    source.indexOf('const provider = \'claude\';'),
  );

  assert.match(branchSnippet, /setIsLoadingSessionMessages\(false\);/);
});

test('useChatSessionState suppresses stale selectedSession paging stats in detached views', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/chat/useChatSessionState.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /projectSelectedSessionHistoryUiState/);
  assert.match(
    source,
    /const selectedSessionHistoryId = resolveSelectedSessionHistoryId\(\{\s*activeSessionId,\s*selectedSessionId: selectedSession\?\.id \|\| null,\s*\}\);/,
  );
  assert.match(source, /const selectedSessionHistoryUiState = projectSelectedSessionHistoryUiState\(\{/);
  assert.match(source, /hasMoreMessages:\s*selectedSessionHistoryUiState\.hasMoreMessages,/);
  assert.match(source, /totalMessages:\s*selectedSessionHistoryUiState\.totalMessages,/);
});

test('useChatSessionState suppresses stale load-all derived state in detached views', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/chat/useChatSessionState.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /allMessagesLoaded:\s*selectedSessionHistoryUiState\.allMessagesLoaded,/);
  assert.match(source, /isLoadingAllMessages:\s*selectedSessionHistoryUiState\.isLoadingAllMessages,/);
  assert.match(source, /loadAllJustFinished:\s*selectedSessionHistoryUiState\.loadAllJustFinished,/);
  assert.match(source, /showLoadAllOverlay:\s*selectedSessionHistoryUiState\.showLoadAllOverlay,/);
});

test('useChatSessionState blocks old selectedSession history loads in detached views', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/chat/useChatSessionState.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(
    source,
    /if \(!hasMoreMessages \|\| !selectedSessionHistoryId \|\| !selectedProjectName \|\| !selectedProjectPath\) return false;/,
  );
  assert.match(source, /const requestSessionId = selectedSessionHistoryId;/);
  assert.match(source, /await sessionStore\.fetchMore\(requestSessionId, \{/);
  assert.match(source, /shouldApplySelectedSessionHistoryResponse\(\{/);
  assert.match(source, /if \(!selectedSessionHistoryId \|\| !selectedProjectName \|\| !selectedProjectPath\) return;/);
});

test('useChatSessionState requests reconnect status through shared chat transport constants', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/chat/useChatSessionState.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /CLIENT_EVENT_TYPES\.CHAT_RECONNECT/);
  assert.doesNotMatch(source, /type:\s*'check-session-status'/);
});

test('useChatSessionState does not auto-hydrate selected sessions from legacy messages endpoint anymore', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/chat/useChatSessionState.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /disableSelectedSessionServerHydration\?: boolean;/);
  assert.match(source, /if \(disableSelectedSessionServerHydration\) \{/);
  assert.doesNotMatch(source, /sessionStore\.fetchFromServer\(selectedSession\.id,/);
  assert.doesNotMatch(source, /sessionStore\.refreshFromServer\(selectedSession\.id,/);
});
