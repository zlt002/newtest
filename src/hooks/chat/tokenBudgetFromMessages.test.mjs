import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveTokenBudgetFromMessages } from './tokenBudgetFromMessages.ts';

test('deriveTokenBudgetFromMessages uses result usage as the live context estimate', () => {
  const budget = deriveTokenBudgetFromMessages([
    {
      id: 'result-1',
      kind: 'result',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-22T10:00:00.000Z',
      usage: {
        input_tokens: 18000,
        cache_creation_input_tokens: 1200,
        cache_read_input_tokens: 800,
        output_tokens: 900,
      },
    },
  ], { total: 200000 });

  assert.deepEqual(budget, {
    used: 20000,
    total: 200000,
    percentage: 10,
    source: 'result_usage',
    compacted: false,
  });
});

test('deriveTokenBudgetFromMessages falls back to total_tokens when detailed context fields are missing', () => {
  const budget = deriveTokenBudgetFromMessages([
    {
      id: 'result-2',
      kind: 'result',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-22T10:00:00.000Z',
      usage: {
        total_tokens: 12345,
      },
    },
  ], { total: 160000 });

  assert.equal(budget?.used, 12345);
  assert.equal(budget?.source, 'result_usage');
});

test('deriveTokenBudgetFromMessages falls back to modelUsage camelCase token fields when usage lacks context totals', () => {
  const budget = deriveTokenBudgetFromMessages([
    {
      id: 'result-model-usage-1',
      kind: 'result',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-24T10:00:00.000Z',
      usage: {
        output_tokens: 900,
      },
      modelUsage: {
        sonnet: {
          inputTokens: 18000,
          cacheCreationInputTokens: 1200,
          cacheReadInputTokens: 800,
          outputTokens: 900,
        },
      },
    },
  ], { total: 200000 });

  assert.deepEqual(budget, {
    used: 20000,
    total: 200000,
    percentage: 10,
    source: 'result_usage',
    compacted: false,
  });
});

test('deriveTokenBudgetFromMessages drops immediately on compact boundary and records the pre-compact token count', () => {
  const budget = deriveTokenBudgetFromMessages([
    {
      id: 'result-before-compact',
      kind: 'result',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-22T10:00:00.000Z',
      usage: {
        input_tokens: 40000,
        cache_creation_input_tokens: 2000,
        cache_read_input_tokens: 1000,
      },
    },
    {
      id: 'compact-1',
      kind: 'compact_boundary',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-22T10:00:01.000Z',
      tokens: 43000,
      status: 'manual',
    },
  ], { total: 160000 });

  assert.deepEqual(budget, {
    used: 7740,
    total: 160000,
    percentage: 4.8,
    source: 'compact_boundary',
    compacted: true,
    lastCompactionPreTokens: 43000,
  });
});

test('deriveTokenBudgetFromMessages lets a later result usage replace the temporary compact baseline', () => {
  const budget = deriveTokenBudgetFromMessages([
    {
      id: 'result-before-compact',
      kind: 'result',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-22T10:00:00.000Z',
      usage: {
        input_tokens: 28000,
      },
    },
    {
      id: 'compact-2',
      kind: 'compact_boundary',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-22T10:00:01.000Z',
      tokens: 28000,
      status: 'manual',
    },
    {
      id: 'result-after-compact',
      kind: 'result',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-22T10:00:02.000Z',
      usage: {
        input_tokens: 6200,
        cache_creation_input_tokens: 300,
      },
    },
  ], { total: 160000 });

  assert.deepEqual(budget, {
    used: 6500,
    total: 160000,
    percentage: 4.1,
    source: 'result_usage',
    compacted: false,
    lastCompactionPreTokens: 28000,
  });
});

test('deriveTokenBudgetFromMessages returns null when no usable usage signal exists', () => {
  const budget = deriveTokenBudgetFromMessages([
    {
      id: 'status-1',
      kind: 'status',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-22T10:00:00.000Z',
      text: 'Working...',
    },
  ], { total: 160000 });

  assert.equal(budget, null);
});
