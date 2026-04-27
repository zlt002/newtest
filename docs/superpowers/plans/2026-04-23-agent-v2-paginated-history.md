# Agent V2 Paginated History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Agent V2 会话历史恢复“首屏只显示最新一页、向上滚动再加载更早消息”的真实分页体验，优先解决长会话首开卡顿。

**Architecture:** 保留当前 V2 页面上的 canonical history + realtime events + run cards 架构，只把 canonical history 数据源从“整段全量 history”改成“分页窗口”。后端 `/api/agent-v2/sessions/:id/history` 提供尾页优先的分页响应，前端 `useHistoricalAgentConversation` 管理已加载窗口并驱动 `ChatInterface` / `ChatMessagesPane` 的加载更多 UI。

**Tech Stack:** Express, Node test runner, React, TypeScript, authenticatedFetch, existing ChatInterface / ChatMessagesPane architecture

---

## File Map

### Backend

- Modify: `server/routes/agent-v2.js`
  - 为 `GET /api/agent-v2/sessions/:id/history` 解析 `limit` / `offset` / `full` 查询参数，并传递给 service。
- Modify: `server/agent-v2/history/session-history-service.js`
  - 为 official history 增加尾页优先分页、分页元信息和全量模式。
- Test: `server/routes/agent-v2.test.mjs`
  - 补充默认尾页、显式 offset、full 模式的路由回归。

### Frontend API / state

- Modify: `src/components/chat-v2/api/fetchSessionHistory.ts`
  - 新增分页请求参数、分页响应类型、页级缓存键与去重逻辑。
- Modify: `src/components/chat-v2/api/fetchSessionHistory.test.mjs`
  - 覆盖页级缓存、尾页请求、full 请求、abort。
- Modify: `src/components/chat-v2/hooks/useHistoricalAgentConversation.ts`
  - 从单次整段 history 改为分页窗口状态机。
- Modify: `src/components/chat-v2/hooks/useHistoricalAgentConversation.test.mjs`
  - 覆盖首屏尾页、prepend 更早页、refresh 尾页、切 session abort。

### Frontend view integration

- Modify: `src/components/chat/view/ChatInterface.tsx`
  - 把分页状态与加载函数从 V2 history hook 透传给消息面板。
- Modify: `src/components/chat/view/agentV2Realtime.test.mjs`
  - 更新源码契约断言，确保页面消费分页窗口而非整段 history。
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
  - 顶部提示、滚动加载更多、加载全部，统一接到 V2 history 分页状态。
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`
  - 覆盖 runCards 模式下的分页提示和加载交互。

## Task 1: Backend History Pagination Contract

**Files:**
- Modify: `server/agent-v2/history/session-history-service.js`
- Modify: `server/routes/agent-v2.js`
- Test: `server/routes/agent-v2.test.mjs`

- [ ] **Step 1: Write the failing backend route tests**

Add tests for default tail-page behavior, explicit offset paging, and full-history mode.

```js
test('GET /api/agent-v2/sessions/:id/history defaults to the latest page when limit is provided', async () => {
  const { app, close } = await createTestServer({
    services: {
      getSessionHistory: async ({ sessionId, limit, offset, full }) => ({
        sessionId,
        cwd: '/repo',
        metadata: { title: null, pinned: false, starred: false, lastViewedAt: null },
        messages: [{ id: 'msg-280' }, { id: 'msg-319' }],
        page: { offset, limit, returned: 40, total: 320, hasMore: true },
        diagnosticsSummary: { officialMessageCount: 320, debugLogAvailable: false },
        _observed: { limit, offset, full },
      }),
    },
  });

  try {
    const response = await fetch(`http://127.0.0.1:${app.port}/api/agent-v2/sessions/sess-1/history?limit=40`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.page.limit, 40);
    assert.equal(payload.page.total, 320);
  } finally {
    await close();
  }
});

test('GET /api/agent-v2/sessions/:id/history forwards explicit offset paging parameters', async () => {
  let seen = null;
  const { app, close } = await createTestServer({
    services: {
      getSessionHistory: async (args) => {
        seen = args;
        return {
          sessionId: args.sessionId,
          cwd: null,
          metadata: { title: null, pinned: false, starred: false, lastViewedAt: null },
          messages: [],
          page: { offset: 240, limit: 40, returned: 40, total: 320, hasMore: true },
          diagnosticsSummary: { officialMessageCount: 320, debugLogAvailable: false },
        };
      },
    },
  });

  try {
    await fetch(`http://127.0.0.1:${app.port}/api/agent-v2/sessions/sess-1/history?limit=40&offset=240`);
    assert.deepEqual(seen, { sessionId: 'sess-1', limit: 40, offset: 240, full: false });
  } finally {
    await close();
  }
});

test('GET /api/agent-v2/sessions/:id/history supports full history mode', async () => {
  let seen = null;
  const { app, close } = await createTestServer({
    services: {
      getSessionHistory: async (args) => {
        seen = args;
        return {
          sessionId: args.sessionId,
          cwd: null,
          metadata: { title: null, pinned: false, starred: false, lastViewedAt: null },
          messages: [{ id: 'msg-1' }, { id: 'msg-320' }],
          page: { offset: 0, limit: null, returned: 320, total: 320, hasMore: false },
          diagnosticsSummary: { officialMessageCount: 320, debugLogAvailable: true },
        };
      },
    },
  });

  try {
    await fetch(`http://127.0.0.1:${app.port}/api/agent-v2/sessions/sess-1/history?full=1`);
    assert.deepEqual(seen, { sessionId: 'sess-1', limit: null, offset: 0, full: true });
  } finally {
    await close();
  }
});
```

- [ ] **Step 2: Run the backend route tests to verify they fail**

Run: `node --test server/routes/agent-v2.test.mjs`

Expected: FAIL because `agent-v2` route does not yet parse or forward `limit`, `offset`, and `full`.

- [ ] **Step 3: Implement the route query parsing**

Update `server/routes/agent-v2.js` so the route forwards parsed pagination arguments.

```js
  const getSessionHistory = async ({ sessionId, limit, offset, full }) => {
    return services.getSessionHistory({ sessionId, limit, offset, full });
  };

  router.get('/sessions/:id/history', async (req, res, next) => {
    try {
      const limit = req.query.limit !== undefined && req.query.limit !== ''
        ? Number.parseInt(String(req.query.limit), 10)
        : undefined;
      const offset = req.query.offset !== undefined && req.query.offset !== ''
        ? Number.parseInt(String(req.query.offset), 10)
        : undefined;
      const full = req.query.full === '1' || req.query.full === 'true';

      const history = await getSessionHistory({
        sessionId: req.params.id,
        limit: Number.isFinite(limit) ? limit : undefined,
        offset: Number.isFinite(offset) ? offset : undefined,
        full,
      });
      res.json(history);
    } catch (error) {
      next(error);
    }
  });
```

- [ ] **Step 4: Implement service-layer tail-page pagination**

Update `server/agent-v2/history/session-history-service.js` to slice the official messages and emit `page`.

```js
function resolvePagination({ total, limit, offset, full }) {
  if (full || limit === null) {
    return { offset: 0, limit: null, returned: total, hasMore: false };
  }

  const normalizedLimit = Number.isFinite(limit) && limit > 0 ? limit : 40;
  const normalizedOffset = Number.isFinite(offset)
    ? Math.max(0, Math.min(offset, Math.max(total - 1, 0)))
    : Math.max(total - normalizedLimit, 0);
  const returned = Math.max(0, Math.min(normalizedLimit, total - normalizedOffset));

  return {
    offset: normalizedOffset,
    limit: normalizedLimit,
    returned,
    hasMore: normalizedOffset > 0,
  };
}

    async getSessionHistory({ sessionId, limit, offset, full = false }) {
      const normalizedSessionId = String(sessionId || '').trim();
      const officialHistory = typeof officialHistoryReader?.readSession === 'function'
        ? await officialHistoryReader.readSession({ sessionId: normalizedSessionId })
        : null;
      const allMessages = Array.isArray(officialHistory?.messages) ? officialHistory.messages : [];
      const total = allMessages.length;
      const page = resolvePagination({ total, limit: full ? null : limit, offset: full ? 0 : offset, full });
      const messages = page.limit === null
        ? allMessages
        : allMessages.slice(page.offset, page.offset + page.returned);

      return {
        sessionId: normalizedSessionId,
        cwd: officialHistory?.cwd ?? null,
        metadata: {
          title,
          pinned: false,
          starred: false,
          lastViewedAt: null,
        },
        messages,
        page: {
          offset: page.offset,
          limit: page.limit,
          returned: messages.length,
          total,
          hasMore: page.hasMore,
        },
        diagnosticsSummary: {
          officialMessageCount: total,
          debugLogAvailable: await resolveDebugLogAvailability({
            sessionId: normalizedSessionId,
            debugLog,
            hasSessionLogs,
          }),
        },
      };
    },
```

- [ ] **Step 5: Run backend tests to verify they pass**

Run: `node --test server/routes/agent-v2.test.mjs`

Expected: PASS, including new history pagination tests.

- [ ] **Step 6: Commit backend pagination contract**

```bash
git add server/routes/agent-v2.js server/agent-v2/history/session-history-service.js server/routes/agent-v2.test.mjs
git commit -m "feat: paginate agent v2 session history"
```

## Task 2: Frontend History API Paging

**Files:**
- Modify: `src/components/chat-v2/api/fetchSessionHistory.ts`
- Test: `src/components/chat-v2/api/fetchSessionHistory.test.mjs`

- [ ] **Step 1: Write the failing API tests for page-aware requests and cache keys**

```js
test('fetchSessionHistory requests the latest page when limit is provided without offset', async () => {
  const originalFetch = global.fetch;
  const seen = [];

  global.fetch = async (url) => {
    seen.push(url);
    return {
      ok: true,
      async json() {
        return {
          sessionId: 'sess-page',
          cwd: '/tmp/project',
          metadata: {},
          messages: [],
          page: { offset: 280, limit: 40, returned: 40, total: 320, hasMore: true },
          diagnosticsSummary: { officialMessageCount: 320, debugLogAvailable: false },
        };
      },
    };
  };

  try {
    await fetchSessionHistory('sess-page', { force: true, limit: 40 });
    assert.equal(seen[0], '/api/agent-v2/sessions/sess-page/history?limit=40');
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetchSessionHistory caches pages separately by session, offset, and limit', async () => {
  const originalFetch = global.fetch;
  let callCount = 0;

  global.fetch = async () => {
    callCount += 1;
    return {
      ok: true,
      async json() {
        return {
          sessionId: 'sess-page-cache',
          cwd: null,
          metadata: {},
          messages: [],
          page: { offset: 240, limit: 40, returned: 40, total: 320, hasMore: true },
          diagnosticsSummary: { officialMessageCount: 320, debugLogAvailable: false },
        };
      },
    };
  };

  try {
    await fetchSessionHistory('sess-page-cache', { force: true, limit: 40, offset: 240 });
    await fetchSessionHistory('sess-page-cache', { limit: 40, offset: 240 });
    await fetchSessionHistory('sess-page-cache', { force: true, limit: 40, offset: 200 });

    assert.equal(callCount, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetchSessionHistory supports full history mode', async () => {
  const originalFetch = global.fetch;
  const seen = [];

  global.fetch = async (url) => {
    seen.push(url);
    return {
      ok: true,
      async json() {
        return {
          sessionId: 'sess-full',
          cwd: null,
          metadata: {},
          messages: [],
          page: { offset: 0, limit: null, returned: 320, total: 320, hasMore: false },
          diagnosticsSummary: { officialMessageCount: 320, debugLogAvailable: false },
        };
      },
    };
  };

  try {
    await fetchSessionHistory('sess-full', { force: true, full: true });
    assert.equal(seen[0], '/api/agent-v2/sessions/sess-full/history?full=1');
  } finally {
    global.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Run the API tests to verify they fail**

Run: `node --test src/components/chat-v2/api/fetchSessionHistory.test.mjs`

Expected: FAIL because `fetchSessionHistory()` does not yet accept page arguments or generate page-aware URLs/cache keys.

- [ ] **Step 3: Implement page-aware request options and response typing**

```ts
type FetchSessionHistoryOptions = {
  force?: boolean;
  signal?: AbortSignal;
  limit?: number;
  offset?: number;
  full?: boolean;
};

type SessionHistoryCacheEntry = {
  expiresAt: number;
  history: SessionHistoryResponse;
};

function getSessionHistoryCacheKey(sessionId: string, options: FetchSessionHistoryOptions) {
  const limit = options.full ? 'full' : String(options.limit ?? 'default');
  const offset = options.full ? '0' : String(options.offset ?? 'tail');
  return `${sessionId}::${limit}::${offset}`;
}
```

- [ ] **Step 4: Implement URL construction and page-level cache/dedupe**

```ts
  const normalizedSessionId = String(sessionId || '').trim();
  const cacheKey = getSessionHistoryCacheKey(normalizedSessionId, options);

  const params = new URLSearchParams();
  if (options.full) {
    params.set('full', '1');
  } else {
    if (Number.isFinite(options.limit)) {
      params.set('limit', String(options.limit));
    }
    if (Number.isFinite(options.offset)) {
      params.set('offset', String(options.offset));
    }
  }

  const requestUrl = `/api/agent-v2/sessions/${encodeURIComponent(normalizedSessionId)}/history${params.toString() ? `?${params.toString()}` : ''}`;
```

Keep the existing `signal` bypass for shared in-flight dedupe, but apply it at page-key granularity.

- [ ] **Step 5: Run the API tests to verify they pass**

Run: `node --test src/components/chat-v2/api/fetchSessionHistory.test.mjs`

Expected: PASS, including new page-aware cache and full-mode tests.

- [ ] **Step 6: Commit frontend history API paging**

```bash
git add src/components/chat-v2/api/fetchSessionHistory.ts src/components/chat-v2/api/fetchSessionHistory.test.mjs
git commit -m "feat: add paginated agent v2 history api client"
```

## Task 3: useHistoricalAgentConversation Pagination State Machine

**Files:**
- Modify: `src/components/chat-v2/hooks/useHistoricalAgentConversation.ts`
- Test: `src/components/chat-v2/hooks/useHistoricalAgentConversation.test.mjs`

- [ ] **Step 1: Write the failing hook tests**

```js
test('useHistoricalAgentConversation loads only the latest page on first bind', async () => {
  const calls = [];
  mockFetchSessionHistory(async (_sessionId, options) => {
    calls.push(options);
    return {
      sessionId: 'sess-1',
      cwd: null,
      metadata: {},
      messages: [{ id: 'msg-280' }, { id: 'msg-319' }],
      page: { offset: 280, limit: 40, returned: 40, total: 320, hasMore: true },
      diagnosticsSummary: { officialMessageCount: 320, debugLogAvailable: false },
    };
  });

  const harness = renderHook(() => useHistoricalAgentConversation({ sessionId: 'sess-1' }));
  await harness.waitFor(() => harness.getResult().history?.messages.length === 2);

  assert.deepEqual(calls[0], { force: false, signal: calls[0].signal, limit: 40 });
  assert.equal(harness.getResult().hasMore, true);
  assert.equal(harness.getResult().totalMessages, 320);
});

test('useHistoricalAgentConversation prepends older pages when loadOlder is called', async () => {
  mockFetchSessionHistory(sequence([
    {
      sessionId: 'sess-1',
      cwd: null,
      metadata: {},
      messages: [{ id: 'msg-280' }, { id: 'msg-319' }],
      page: { offset: 280, limit: 40, returned: 40, total: 320, hasMore: true },
      diagnosticsSummary: { officialMessageCount: 320, debugLogAvailable: false },
    },
    {
      sessionId: 'sess-1',
      cwd: null,
      metadata: {},
      messages: [{ id: 'msg-240' }, { id: 'msg-279' }],
      page: { offset: 240, limit: 40, returned: 40, total: 320, hasMore: true },
      diagnosticsSummary: { officialMessageCount: 320, debugLogAvailable: false },
    },
  ]));

  const harness = renderHook(() => useHistoricalAgentConversation({ sessionId: 'sess-1' }));
  await harness.waitFor(() => harness.getResult().history?.messages.length === 2);
  await harness.act(() => harness.getResult().loadOlder());

  assert.deepEqual(
    harness.getResult().history.messages.map((message) => message.id),
    ['msg-240', 'msg-279', 'msg-280', 'msg-319'],
  );
});

test('useHistoricalAgentConversation refreshes the latest page without discarding older loaded pages', async () => {
  // initial latest page, older page, refreshed latest page
});
```

- [ ] **Step 2: Run the hook tests to verify they fail**

Run: `node --test src/components/chat-v2/hooks/useHistoricalAgentConversation.test.mjs`

Expected: FAIL because the hook currently exposes only `history`, `isLoading`, `error`, and `refresh`.

- [ ] **Step 3: Introduce paginated history state**

Refactor hook state to track page metadata and window state.

```ts
type HistoricalAgentConversationState = {
  history: SessionHistoryResponse | null;
  turns: AssistantTurn[];
  isLoading: boolean;
  isLoadingOlder: boolean;
  hasMore: boolean;
  totalMessages: number;
  error: Error | null;
  refresh: () => void;
  loadOlder: () => Promise<void>;
  loadAll: () => Promise<void>;
};

const DEFAULT_HISTORY_PAGE_SIZE = 40;
```

- [ ] **Step 4: Implement first-page load, prepend older pages, and latest-page refresh merge**

Use a helper merge function that preserves order and dedupes by `message.id`.

```ts
function mergeHistoryMessages(pages: CanonicalSessionMessage[][]) {
  const seen = new Set();
  const merged = [];

  for (const pageMessages of pages) {
    for (const message of pageMessages) {
      const messageId = String(message.id || '').trim();
      if (!messageId || seen.has(messageId)) {
        continue;
      }
      seen.add(messageId);
      merged.push(message);
    }
  }

  return merged;
}

const [loadedPages, setLoadedPages] = useState([]);

const loadOlder = useCallback(async () => {
  if (!sessionId || isLoadingOlder || !loadedPages[0]?.page?.hasMore) {
    return;
  }

  const firstPage = loadedPages[0];
  const nextOffset = Math.max(0, firstPage.page.offset - firstPage.page.limit);
  const nextPage = await fetchSessionHistory(sessionId, { force: true, offset: nextOffset, limit: firstPage.page.limit });

  setLoadedPages((pages) => [nextPage, ...pages]);
}, [isLoadingOlder, loadedPages, sessionId]);
```

`refresh()` should re-fetch the latest loaded page and replace only the tail page entry.

- [ ] **Step 5: Run the hook tests to verify they pass**

Run: `node --test src/components/chat-v2/hooks/useHistoricalAgentConversation.test.mjs`

Expected: PASS, including prepend and refresh merge behavior.

- [ ] **Step 6: Commit the paginated history hook**

```bash
git add src/components/chat-v2/hooks/useHistoricalAgentConversation.ts src/components/chat-v2/hooks/useHistoricalAgentConversation.test.mjs
git commit -m "feat: paginate historical agent conversation state"
```

## Task 4: Wire Paginated History Into ChatInterface

**Files:**
- Modify: `src/components/chat/view/ChatInterface.tsx`
- Test: `src/components/chat/view/agentV2Realtime.test.mjs`

- [ ] **Step 1: Write the failing ChatInterface source-contract tests**

```js
test('ChatInterface reads hasMore and totalMessages from historicalAgentConversation paging state', async () => {
  const source = await readFile(new URL('./ChatInterface.tsx', import.meta.url), 'utf8');

  assert.match(source, /historicalAgentConversation\.hasMore/);
  assert.match(source, /historicalAgentConversation\.totalMessages/);
  assert.match(source, /historicalAgentConversation\.loadOlder/);
  assert.match(source, /historicalAgentConversation\.loadAll/);
});

test('ChatInterface no longer uses selected session store pagination state for the V2 history surface', async () => {
  const source = await readFile(new URL('./ChatInterface.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /hasMoreMessages:\s*selectedSessionHistoryUiState\.hasMoreMessages/);
});
```

- [ ] **Step 2: Run the ChatInterface tests to verify they fail**

Run: `node --test src/components/chat/view/agentV2Realtime.test.mjs`

Expected: FAIL because `ChatInterface` still passes old `useChatSessionState` paging props down to `ChatMessagesPane`.

- [ ] **Step 3: Rebind paging props to historicalAgentConversation**

Update `ChatInterface.tsx` so the V2 canonical history hook owns the paging props consumed by the pane.

```tsx
          isLoadingMoreMessages={historicalAgentConversation.isLoadingOlder}
          hasMoreMessages={historicalAgentConversation.hasMore}
          totalMessages={historicalAgentConversation.totalMessages}
          sessionMessagesCount={renderableChatMessages.length}
          loadEarlierMessages={historicalAgentConversation.loadOlder}
          loadAllMessages={historicalAgentConversation.loadAll}
          allMessagesLoaded={!historicalAgentConversation.hasMore}
```

Keep `visibleMessageCount` / `visibleMessages` for legacy local echo trimming, but let V2 canonical pagination state drive the “older history” UI.

- [ ] **Step 4: Preserve reconnect and realtime cleanup behavior with paginated history**

Ensure these existing checks still read from the paginated `history.messages` window:

```tsx
      const baselineMessages = historicalAgentConversation.history?.messages || [];
      const hydratedMessages = historicalAgentConversation.history?.messages || [];
      const hydratedHistorySessionId = historicalAgentConversation.history?.sessionId || null;
```

Do not reintroduce immediate full refresh on active-to-completed transition.

- [ ] **Step 5: Run the ChatInterface tests to verify they pass**

Run: `node --test src/components/chat/view/agentV2Realtime.test.mjs`

Expected: PASS, including existing run-card and reconnect tests.

- [ ] **Step 6: Commit ChatInterface pagination wiring**

```bash
git add src/components/chat/view/ChatInterface.tsx src/components/chat/view/agentV2Realtime.test.mjs
git commit -m "feat: wire paginated v2 history into chat interface"
```

## Task 5: Restore Top-Load UX In ChatMessagesPane

**Files:**
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
- Test: `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`

- [ ] **Step 1: Write the failing pane tests**

```js
test('ChatMessagesPane shows the top paging indicator for runCards when more canonical history is available', () => {
  const markup = renderPane({
    runCards: [{ anchorMessageId: 'user-1', source: 'official-history', state: 'completed' }],
    hasMoreMessages: true,
    totalMessages: 320,
    sessionMessagesCount: 40,
  });

  assert.match(markup, /显示 40 \/ 320 条消息/);
  assert.match(markup, /向上滚动以加载更多/);
});

test('ChatMessagesPane calls loadEarlierMessages when the user reaches the top in runCards mode', async () => {
  let called = 0;
  const { container } = renderInteractivePane({
    runCards: [{ anchorMessageId: 'user-1', source: 'official-history', state: 'completed' }],
    hasMoreMessages: true,
    loadEarlierMessages: async () => { called += 1; },
  });

  fireScroll(container, { scrollTop: 0 });
  await flushPromises();

  assert.equal(called, 1);
});
```

- [ ] **Step 2: Run the pane tests to verify they fail**

Run: `node --test src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`

Expected: FAIL if the runCards path bypasses the existing top-load prompts or does not exercise the V2 load function.

- [ ] **Step 3: Keep the top indicators and load-all affordance active in runCards mode**

Make sure the pane still renders the existing top banner and load-all overlay while using V2 paging props.

```tsx
          {hasMoreMessages && !isLoadingMoreMessages && !allMessagesLoaded && (
            <div className="border-b border-gray-200 py-2 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              {totalMessages > 0 && (
                <span>
                  {t('session.messages.showingOf', { shown: sessionMessagesCount, total: totalMessages })}{' '}
                  <span className="text-xs">{t('session.messages.scrollToLoad')}</span>
                </span>
              )}
            </div>
          )}
```

Keep this block outside the legacy-only branch so it appears for runCards too.

- [ ] **Step 4: Verify the pane still supports full load and warning states**

Retain:

```tsx
          {(showLoadAllOverlay || isLoadingAllMessages || loadAllJustFinished) && (
            // existing overlay button
          )}

          {allMessagesLoaded && (
            <div className="border-b border-amber-200 bg-amber-50 py-1.5 text-center text-xs text-amber-600 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
              {t('session.messages.perfWarning')}
            </div>
          )}
```

The only behavior change should be that these now reflect V2 history paging state.

- [ ] **Step 5: Run the pane tests to verify they pass**

Run: `node --test src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`

Expected: PASS, including runCards-specific pagination assertions.

- [ ] **Step 6: Commit pane UX wiring**

```bash
git add src/components/chat/view/subcomponents/ChatMessagesPane.tsx src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs
git commit -m "feat: restore paginated history ui for v2 chat pane"
```

## Task 6: End-to-End Regression Pass

**Files:**
- Verify: `server/routes/agent-v2.test.mjs`
- Verify: `src/components/chat-v2/api/fetchSessionHistory.test.mjs`
- Verify: `src/components/chat-v2/hooks/useHistoricalAgentConversation.test.mjs`
- Verify: `src/components/chat/view/agentV2Realtime.test.mjs`
- Verify: `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`

- [ ] **Step 1: Run the focused backend and frontend regression suite**

Run:

```bash
node --test server/routes/agent-v2.test.mjs
node --experimental-strip-types --experimental-specifier-resolution=node --test \
  src/components/chat-v2/api/fetchSessionHistory.test.mjs \
  src/components/chat-v2/hooks/useHistoricalAgentConversation.test.mjs \
  src/components/chat/view/agentV2Realtime.test.mjs \
  src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs
```

Expected: All tests PASS.

- [ ] **Step 2: Run a manual smoke check in local dev**

Verify in browser:

- Open a 300KB+ 长会话时，Network 首屏只看到分页后的 `history?limit=40`。
- 初始页面直接落在最新消息附近。
- 向上滚动时触发更早页请求，顶部显示“向上滚动以加载更多”。
- 点击“加载全部消息”后显示“全部消息已加载”与性能提醒。
- 活跃运行结束后不会额外立刻再打一条 full history。

- [ ] **Step 3: Commit final verification notes**

```bash
git add server/routes/agent-v2.js \
  server/agent-v2/history/session-history-service.js \
  server/routes/agent-v2.test.mjs \
  src/components/chat-v2/api/fetchSessionHistory.ts \
  src/components/chat-v2/api/fetchSessionHistory.test.mjs \
  src/components/chat-v2/hooks/useHistoricalAgentConversation.ts \
  src/components/chat-v2/hooks/useHistoricalAgentConversation.test.mjs \
  src/components/chat/view/ChatInterface.tsx \
  src/components/chat/view/agentV2Realtime.test.mjs \
  src/components/chat/view/subcomponents/ChatMessagesPane.tsx \
  src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs
git commit -m "feat: add paginated agent v2 session history"
```

## Self-Review

### Spec coverage

- Backend pagination contract: covered by Task 1.
- Frontend page API and cache semantics: covered by Task 2.
- Paginated history hook state and merge behavior: covered by Task 3.
- ChatInterface integration with run cards and reconnect cleanup: covered by Task 4.
- 顶部提示、上滑加载更多、加载全部 UI：covered by Task 5.
- Regression and manual smoke verification: covered by Task 6.

### Placeholder scan

- No `TODO` / `TBD`.
- Each task contains target files, commands, and example code.
- “Load all” protocol ambiguity from the spec is resolved here by using `full=1`.

### Type consistency

- Backend route and service both use `{ sessionId, limit, offset, full }`.
- Frontend API and hook both use `limit`, `offset`, `full`.
- Hook public state consistently uses `isLoadingOlder`, `hasMore`, `totalMessages`, `loadOlder`, `loadAll`, `refresh`.
