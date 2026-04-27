import test from 'node:test';
import assert from 'node:assert/strict';

import { __testables__ } from './useSessionStore.ts';

test('computeMerged orders messages by stable sequence-like fields before falling back to timestamp', () => {
  const merged = __testables__.computeMerged(
    [
      {
        id: 'srv-2',
        kind: 'text',
        role: 'assistant',
        content: 'B',
        sequence: 2,
      },
      {
        id: 'srv-1',
        kind: 'text',
        role: 'assistant',
        content: 'A',
        sequence: 1,
      },
    ],
    [
      {
        id: 'rt-3',
        kind: 'text',
        role: 'assistant',
        content: 'C',
        timestamp: '2026-04-19T12:00:03.000Z',
      },
    ],
  );

  assert.deepEqual(
    merged.map(message => message.id),
    ['srv-1', 'srv-2', 'rt-3'],
  );
});

test('computeMerged keeps only one copy when realtime and server messages represent the same content', () => {
  const merged = __testables__.computeMerged(
    [
      {
        id: 'srv-final',
        kind: 'text',
        role: 'assistant',
        content: '最终答案',
        timestamp: '2026-04-19T12:00:00.500Z',
      },
    ],
    [
      {
        id: 'rt-final',
        kind: 'text',
        role: 'assistant',
        content: '最终答案',
        timestamp: '2026-04-19T12:00:00.000Z',
      },
    ],
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'srv-final');
});

test('computeMerged preserves legitimate repeated realtime events with different ids', () => {
  const merged = __testables__.computeMerged(
    [],
    [
      {
        id: 'rt-1',
        kind: 'thinking',
        role: 'assistant',
        content: '思考中',
        timestamp: '2026-04-19T12:00:00.000Z',
      },
      {
        id: 'rt-2',
        kind: 'thinking',
        role: 'assistant',
        content: '思考中',
        timestamp: '2026-04-19T12:00:01.000Z',
      },
    ],
  );

  assert.deepEqual(
    merged.map(message => message.id),
    ['rt-1', 'rt-2'],
  );
});

test('computeMerged keeps original source order when sequence and rowid cannot be compared safely', () => {
  const merged = __testables__.computeMerged(
    [
      {
        id: 'srv-seq',
        kind: 'text',
        role: 'assistant',
        content: 'server',
        sequence: 10,
      },
    ],
    [
      {
        id: 'rt-rowid',
        kind: 'text',
        role: 'assistant',
        content: 'realtime',
        rowid: 1,
      },
    ],
  );

  assert.deepEqual(
    merged.map(message => message.id),
    ['srv-seq', 'rt-rowid'],
  );
});

test('reconcileRealtimeMessages drops legacy stream_delta when server history already has the canonical assistant text', () => {
  const reconciled = __testables__.reconcileRealtimeMessages(
    [
      {
        id: 'rt-stream-1',
        kind: 'stream_delta',
        role: 'assistant',
        content: '最终答案',
        timestamp: '2026-04-26T10:00:00.000Z',
      },
    ],
    [
      {
        id: 'srv-text-1',
        kind: 'text',
        role: 'assistant',
        content: '最终答案',
        timestamp: '2026-04-26T10:00:00.500Z',
      },
    ],
  );

  assert.equal(reconciled.length, 0);
});

test('reconcileRealtimeMessages drops legacy tool_use_partial when server history already has the canonical tool_use', () => {
  const reconciled = __testables__.reconcileRealtimeMessages(
    [
      {
        id: 'rt-tool-partial-1',
        kind: 'tool_use_partial',
        toolName: 'Read',
        toolInput: { file_path: '/tmp/demo.ts' },
        timestamp: '2026-04-26T10:00:00.000Z',
      },
    ],
    [
      {
        id: 'srv-tool-1',
        kind: 'tool_use',
        toolName: 'Read',
        toolInput: { file_path: '/tmp/demo.ts' },
        timestamp: '2026-04-26T10:00:00.500Z',
      },
    ],
  );

  assert.equal(reconciled.length, 0);
});
