import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchSessionHistory } from './chatHistoryService.ts';

test('fetchSessionHistory preserves toolInput, toolId and isError fields from canonical history messages', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      sessionId: 'sess-history',
      cwd: '/workspace/demo',
      metadata: {
        title: null,
        pinned: false,
        starred: false,
        lastViewedAt: null,
      },
      messages: [
        {
          id: 'tool-1',
          sessionId: 'sess-history',
          role: 'assistant',
          kind: 'tool_use',
          type: 'tool_use',
          timestamp: '2026-04-26T15:00:00.000Z',
          toolName: 'Read',
          toolInput: {
            file_path: '/workspace/demo/PRD_CodeReview_AI.md',
          },
          toolId: 'toolu_1',
        },
        {
          id: 'result-1',
          sessionId: 'sess-history',
          role: 'tool',
          kind: 'tool_result',
          type: 'tool_result',
          timestamp: '2026-04-26T15:00:01.000Z',
          text: 'done',
          toolId: 'toolu_1',
          isError: false,
        },
      ],
      diagnosticsSummary: {
        officialMessageCount: 2,
        debugLogAvailable: false,
        agentMessageCount: 0,
        debugAugmentedCount: 0,
        historySourceCoverage: 'official-only',
      },
      page: {
        offset: 0,
        limit: null,
        returned: 2,
        total: 2,
        hasMore: false,
      },
    }),
  });

  try {
    const history = await fetchSessionHistory('sess-history', { force: true, full: true });

    assert.deepEqual(history.messages[0].toolInput, {
      file_path: '/workspace/demo/PRD_CodeReview_AI.md',
    });
    assert.equal(history.messages[0].toolId, 'toolu_1');
    assert.equal(history.messages[1].toolId, 'toolu_1');
    assert.equal(history.messages[1].isError, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
