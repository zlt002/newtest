import test from 'node:test';
import assert from 'node:assert/strict';

import { createSessionHistoryService } from './session-history-service.js';

test('session history service returns a tail page and canonical total count from official reader output', async () => {
  const service = createSessionHistoryService({
    officialHistoryReader: {
      async readSession({ sessionId }) {
        assert.equal(sessionId, 'sess-canonical');
        return {
          sessionId,
          cwd: '/tmp/project',
          messages: [
            { id: 'msg-1', role: 'user', text: 'hello' },
            { id: 'msg-2', role: 'assistant', text: 'hi' },
          ],
          diagnostics: {
            officialMessageCount: 3,
            ignoredLineCount: 1,
          },
        };
      },
    },
    sessionNamesDb: {
      getName(sessionId, provider) {
        assert.equal(sessionId, 'sess-canonical');
        assert.equal(provider, 'claude');
        return '自定义标题';
      },
    },
    hasSessionLogs(sessionId) {
      assert.equal(sessionId, 'sess-canonical');
      return true;
    },
  });

  const history = await service.getSessionHistory({ sessionId: 'sess-canonical' });

  assert.deepEqual(history, {
    sessionId: 'sess-canonical',
    cwd: '/tmp/project',
    metadata: {
      title: '自定义标题',
      pinned: false,
      starred: false,
      lastViewedAt: null,
    },
    messages: [
      { id: 'msg-1', role: 'user', text: 'hello' },
      { id: 'msg-2', role: 'assistant', text: 'hi' },
    ],
    page: {
      offset: 0,
      limit: 40,
      returned: 2,
      total: 2,
      hasMore: false,
    },
    diagnosticsSummary: {
      officialMessageCount: 2,
      debugLogAvailable: true,
      agentMessageCount: 0,
      debugAugmentedCount: 0,
      historySourceCoverage: 'official-only',
    },
  });
});

test('session history service falls back to minimal local metadata and no debug logs by default', async () => {
  const service = createSessionHistoryService({
    officialHistoryReader: {
      async readSession({ sessionId }) {
        return {
          sessionId,
          cwd: null,
          messages: [],
          diagnostics: {
            officialMessageCount: 0,
          },
        };
      },
    },
    sessionNamesDb: {
      getName() {
        return null;
      },
    },
  });

  const history = await service.getSessionHistory({ sessionId: 'sess-empty' });

  assert.deepEqual(history, {
    sessionId: 'sess-empty',
    cwd: null,
    metadata: {
      title: null,
      pinned: false,
      starred: false,
      lastViewedAt: null,
    },
    messages: [],
    page: {
      offset: 0,
      limit: 40,
      returned: 0,
      total: 0,
      hasMore: false,
    },
    diagnosticsSummary: {
      officialMessageCount: 0,
      debugLogAvailable: false,
      agentMessageCount: 0,
      debugAugmentedCount: 0,
      historySourceCoverage: 'official-only',
    },
  });
});

test('session history service uses debugLog.hasSessionLogs when provided', async () => {
  const service = createSessionHistoryService({
    officialHistoryReader: {
      async readSession({ sessionId }) {
        return {
          sessionId,
          cwd: '/tmp/with-debug-log',
          messages: [{ id: 'msg-debug', role: 'assistant', text: 'ok' }],
          diagnostics: {
            officialMessageCount: 1,
          },
        };
      },
    },
    debugLog: {
      hasSessionLogs(sessionId) {
        assert.equal(sessionId, 'sess-debug');
        return false;
      },
    },
  });

  const history = await service.getSessionHistory({ sessionId: 'sess-debug' });

  assert.equal(history.diagnosticsSummary.debugLogAvailable, false);
  assert.equal(history.metadata.title, null);
  assert.deepEqual(history.page, {
    offset: 0,
    limit: 40,
    returned: 1,
    total: 1,
    hasMore: false,
  });
});

test('session history service exposes reconciliation diagnostics for enhanced canonical history', async () => {
  const service = createSessionHistoryService({
    officialHistoryReader: {
      async readSession({ sessionId }) {
        return {
          sessionId,
          cwd: '/tmp/project',
          messages: [
            { id: 'msg-1', role: 'user', text: 'hello', kind: 'text', source: 'session' },
            { id: 'msg-2', role: 'assistant', text: 'thinking', kind: 'thinking', source: 'agent' },
          ],
          diagnostics: {
            officialMessageCount: 3,
            ignoredLineCount: 1,
            agentMessageCount: 1,
            debugAugmentedCount: 0,
          },
        };
      },
    },
    hasSessionLogs() {
      return true;
    },
  });

  const history = await service.getSessionHistory({ sessionId: 'sess-diagnostics' });

  assert.deepEqual(history.diagnosticsSummary, {
    officialMessageCount: 2,
    debugLogAvailable: true,
    agentMessageCount: 1,
    debugAugmentedCount: 0,
    historySourceCoverage: 'official+agent',
  });
});

test('session history service treats debug log lookup failures as unavailable instead of failing history reads', async () => {
  const service = createSessionHistoryService({
    officialHistoryReader: {
      async readSession({ sessionId }) {
        return {
          sessionId,
          cwd: '/tmp/project',
          messages: [{ id: 'msg-1', role: 'assistant', text: 'hi' }],
          diagnostics: {
            officialMessageCount: 1,
          },
        };
      },
    },
    debugLog: {
      async hasSessionLogs() {
        throw new Error('db unavailable');
      },
    },
  });

  const history = await service.getSessionHistory({ sessionId: 'sess-debug-error' });

  assert.equal(history.diagnosticsSummary.debugLogAvailable, false);
  assert.equal(history.messages.length, 1);
  assert.deepEqual(history.page, {
    offset: 0,
    limit: 40,
    returned: 1,
    total: 1,
    hasMore: false,
  });
});

test('session history service rejects invalid pagination params even when called directly', async () => {
  let readCount = 0;
  const service = createSessionHistoryService({
    officialHistoryReader: {
      async readSession() {
        readCount += 1;
        return {
          sessionId: 'sess-invalid',
          cwd: null,
          messages: [],
          diagnostics: {
            officialMessageCount: 0,
          },
        };
      },
    },
  });

  await assert.rejects(() => service.getSessionHistory({ sessionId: 'sess-invalid', limit: 0 }), /limit must be a positive integer/);
  await assert.rejects(() => service.getSessionHistory({ sessionId: 'sess-invalid', offset: -1 }), /offset must be a non-negative integer/);
  await assert.rejects(() => service.getSessionHistory({ sessionId: 'sess-invalid', limit: '1abc' }), /limit must be a positive integer/);
  await assert.rejects(() => service.getSessionHistory({ sessionId: 'sess-invalid', offset: '3.7' }), /offset must be a non-negative integer/);

  assert.equal(readCount, 0);
});

test('session history service validates pagination params even in full mode', async () => {
  let readCount = 0;
  const service = createSessionHistoryService({
    officialHistoryReader: {
      async readSession() {
        readCount += 1;
        return {
          sessionId: 'sess-full-invalid',
          cwd: null,
          messages: [],
          diagnostics: {
            officialMessageCount: 0,
          },
        };
      },
    },
  });

  await assert.rejects(
    () => service.getSessionHistory({ sessionId: 'sess-full-invalid', full: true, limit: '1abc' }),
    /limit must be a positive integer/,
  );
  await assert.rejects(
    () => service.getSessionHistory({ sessionId: 'sess-full-invalid', full: true, offset: -1 }),
    /offset must be a non-negative integer/,
  );

  assert.equal(readCount, 0);
});

test('session history service returns an empty page when offset is beyond the available history', async () => {
  const service = createSessionHistoryService({
    officialHistoryReader: {
      async readSession() {
        return {
          sessionId: 'sess-overflow',
          cwd: '/tmp/project',
          messages: [
            { id: 'msg-1', role: 'user', text: 'hello' },
            { id: 'msg-2', role: 'assistant', text: 'hi' },
          ],
          diagnostics: {
            officialMessageCount: 2,
          },
        };
      },
    },
  });

  const history = await service.getSessionHistory({ sessionId: 'sess-overflow', offset: 999 });

  assert.deepEqual(history.page, {
    offset: 2,
    limit: 40,
    returned: 0,
    total: 2,
    hasMore: false,
  });
  assert.deepEqual(history.messages, []);
});

test('session history service uses hasMore to mean earlier history still exists before the current page', async () => {
  const service = createSessionHistoryService({
    officialHistoryReader: {
      async readSession() {
        return {
          sessionId: 'sess-has-more',
          cwd: '/tmp/project',
          messages: [
            { id: 'msg-1', role: 'user', text: 'hello' },
            { id: 'msg-2', role: 'assistant', text: 'hi' },
          ],
          diagnostics: {
            officialMessageCount: 2,
          },
        };
      },
    },
  });

  const history = await service.getSessionHistory({ sessionId: 'sess-has-more', limit: 1, offset: 1 });

  assert.deepEqual(history.page, {
    offset: 1,
    limit: 1,
    returned: 1,
    total: 2,
    hasMore: true,
  });
  assert.deepEqual(history.messages, [
    { id: 'msg-2', role: 'assistant', text: 'hi' },
  ]);
});
