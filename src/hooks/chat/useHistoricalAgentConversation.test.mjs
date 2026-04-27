import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  value: true,
  configurable: true,
});

const hookUrl = new URL('./useHistoricalAgentConversation.ts', import.meta.url).href;
const fetchSessionHistoryStubUrl = `data:text/javascript,${encodeURIComponent(`
export async function fetchSessionHistory(...args) {
  return globalThis.__TEST_FETCH_SESSION_HISTORY__(...args);
}
`)}`;

const loaderSource = `
const stubs = new Map([
  ['@services/chatHistoryService', ${JSON.stringify(fetchSessionHistoryStubUrl)}],
  ['${hookUrl}::@services/chatHistoryService', ${JSON.stringify(fetchSessionHistoryStubUrl)}],
]);
const extensions = ['.tsx', '.ts', '.mts', '.jsx', '.js', '.mjs'];

export async function resolve(specifier, context, nextResolve) {
  const contextual = stubs.get(String(context.parentURL || '') + '::' + specifier);
  if (contextual) {
    return { url: contextual, shortCircuit: true };
  }

  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const hasKnownExtension = /\\.[a-z]+$/i.test(specifier);
    if (!hasKnownExtension) {
      for (const extension of extensions) {
        try {
          return await nextResolve(specifier + extension, context);
        } catch {}
      }
    }
  }

  return nextResolve(specifier, context);
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

const { useHistoricalAgentConversation } = await import('./useHistoricalAgentConversation.ts');

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

  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  Object.defineProperty(globalThis, 'window', { value: windowValue, configurable: true });
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node' }, configurable: true });
  Object.defineProperty(globalThis, 'HTMLElement', { value: FakeHTMLElement, configurable: true });
  Object.defineProperty(globalThis, 'HTMLIFrameElement', { value: FakeHTMLIFrameElement, configurable: true });

  return {
    container,
    restore() {
      Object.defineProperty(globalThis, 'document', { value: previousDocument, configurable: true });
      Object.defineProperty(globalThis, 'window', { value: previousWindow, configurable: true });
      Object.defineProperty(globalThis, 'navigator', { value: previousNavigator, configurable: true });
      Object.defineProperty(globalThis, 'HTMLElement', { value: previousHTMLElement, configurable: true });
      Object.defineProperty(globalThis, 'HTMLIFrameElement', { value: previousHTMLIFrameElement, configurable: true });
    },
  };
}

function createHistoryResponse({
  sessionId = 'sess-1',
  messages = [],
} = {}) {
  return {
    sessionId,
    cwd: '/workspace/demo',
    metadata: {
      title: null,
      pinned: false,
      starred: false,
      lastViewedAt: null,
    },
    diagnosticsSummary: {
      officialMessageCount: messages.length,
      debugLogAvailable: false,
    },
    messages,
    page: {
      offset: 0,
      limit: null,
      returned: messages.length,
      total: messages.length,
      hasMore: false,
    },
  };
}

function createMessage(id, text) {
  return {
    id,
    sessionId: 'sess-1',
    role: 'assistant',
    text,
    timestamp: `2026-04-23T00:00:0${id.slice(-1)}.000Z`,
    kind: 'text',
    type: 'text',
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

async function waitFor(assertion, { attempts = 20 } = {}) {
  let lastError = null;
  for (let index = 0; index < attempts; index += 1) {
    try {
      await act(async () => {
        await flush();
      });
      assertion();
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function renderHistoricalHookHarness(initialProps) {
  const dom = installFakeDom();
  const propsRef = { current: initialProps };
  let currentResult = null;

  function Harness() {
    currentResult = useHistoricalAgentConversation(propsRef.current);
    return null;
  }

  const root = createRoot(dom.container);
  await act(async () => {
    root.render(React.createElement(Harness));
    await flush();
  });

  return {
    getResult() {
      return currentResult;
    },
    async rerender(nextProps) {
      propsRef.current = nextProps;
      await act(async () => {
        root.render(React.createElement(Harness));
        await flush();
      });
    },
    async cleanup() {
      await act(async () => {
        root.unmount();
      });
      dom.restore();
    },
  };
}

test('首屏直接全量加载历史，不再请求分页窗口', async () => {
  const calls = [];
  globalThis.__TEST_FETCH_SESSION_HISTORY__ = async (sessionId, options = {}) => {
    calls.push({ sessionId, options });
    return createHistoryResponse({
      sessionId,
      messages: [createMessage('m1', '第一条'), createMessage('m2', '第二条')],
    });
  };

  const harness = await renderHistoricalHookHarness({ sessionId: 'sess-1' });

  try {
    await waitFor(() => {
      const result = harness.getResult();
      assert.equal(result.isLoading, false);
      assert.equal(result.isLoadingOlder, false);
      assert.equal(result.hasMore, false);
      assert.equal(result.totalMessages, 2);
      assert.deepEqual(result.turns.map((message) => message.id), ['m1', 'm2']);
    });

    assert.deepEqual(calls, [
      {
        sessionId: 'sess-1',
        options: {
          force: false,
          full: true,
          signal: calls[0].options.signal,
        },
      },
    ]);
  } finally {
    await harness.cleanup();
    delete globalThis.__TEST_FETCH_SESSION_HISTORY__;
  }
});

test('loadOlder() 与 loadAll() 在全量模式下为空操作，不会再次请求', async () => {
  const calls = [];
  globalThis.__TEST_FETCH_SESSION_HISTORY__ = async (sessionId, options = {}) => {
    calls.push({ sessionId, options });
    return createHistoryResponse({
      sessionId,
      messages: [createMessage('m1', '第一条')],
    });
  };

  const harness = await renderHistoricalHookHarness({ sessionId: 'sess-1' });

  try {
    await waitFor(() => {
      assert.equal(harness.getResult().isLoading, false);
    });

    await harness.getResult().loadOlder();
    await harness.getResult().loadAll();
    await act(async () => {
      await flush();
    });

    assert.equal(calls.length, 1);
  } finally {
    await harness.cleanup();
    delete globalThis.__TEST_FETCH_SESSION_HISTORY__;
  }
});

test('refresh() 会使用 full=true 强制刷新整段历史', async () => {
  const calls = [];
  globalThis.__TEST_FETCH_SESSION_HISTORY__ = async (sessionId, options = {}) => {
    calls.push({ sessionId, options });
    return createHistoryResponse({
      sessionId,
      messages: calls.length === 1
        ? [createMessage('m1', '旧历史')]
        : [createMessage('m1', '旧历史'), createMessage('m2', '新历史')],
    });
  };

  const harness = await renderHistoricalHookHarness({ sessionId: 'sess-1' });

  try {
    await waitFor(() => {
      assert.deepEqual(harness.getResult().history.messages.map((message) => message.id), ['m1']);
    });

    await act(async () => {
      harness.getResult().refresh();
      await flush();
    });

    await waitFor(() => {
      assert.deepEqual(harness.getResult().history.messages.map((message) => message.id), ['m1', 'm2']);
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[1].options.force, true);
    assert.equal(calls[1].options.full, true);
  } finally {
    await harness.cleanup();
    delete globalThis.__TEST_FETCH_SESSION_HISTORY__;
  }
});

test('切换 session 时会 abort 旧请求，并只保留新 session 的结果', async () => {
  const sessionA = deferred();
  const sessionB = deferred();
  const aborted = [];

  globalThis.__TEST_FETCH_SESSION_HISTORY__ = (sessionId, options = {}) => {
    const target = sessionId === 'sess-a' ? sessionA : sessionB;
    options.signal?.addEventListener('abort', () => {
      aborted.push(sessionId);
      target.reject(new DOMException('The operation was aborted.', 'AbortError'));
    }, { once: true });
    return target.promise;
  };

  const harness = await renderHistoricalHookHarness({ sessionId: 'sess-a' });

  try {
    await harness.rerender({ sessionId: 'sess-b' });

    sessionB.resolve(createHistoryResponse({
      sessionId: 'sess-b',
      messages: [createMessage('m9', 'b-newest')],
    }));

    await waitFor(() => {
      const result = harness.getResult();
      assert.equal(result.history.sessionId, 'sess-b');
      assert.deepEqual(result.history.messages.map((message) => message.id), ['m9']);
    });

    assert.deepEqual(aborted, ['sess-a']);
  } finally {
    await harness.cleanup();
    delete globalThis.__TEST_FETCH_SESSION_HISTORY__;
  }
});
