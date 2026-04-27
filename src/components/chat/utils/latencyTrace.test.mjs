import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createClientLatencyTraceStore,
  markClientLatencyEvent,
  rebindClientLatencyTrace,
  summarizeClientLatencyTrace,
} from './latencyTrace.ts';

test('client trace keeps marks when temporary session is rebound to the real session id', () => {
  const store = createClientLatencyTraceStore();

  markClientLatencyEvent(store, 'new-session-1', 'send_clicked', 10, { provider: 'claude' });
  markClientLatencyEvent(store, 'new-session-1', 'first_thinking_received', 40);
  rebindClientLatencyTrace(store, 'new-session-1', 'session-real-1');
  markClientLatencyEvent(store, 'session-real-1', 'first_stream_delta_received', 90);

  assert.equal(store.has('new-session-1'), false);
  assert.equal(store.has('session-real-1'), true);

  const summary = summarizeClientLatencyTrace(store, 'session-real-1');
  assert.equal(summary.durations.sendToThinking, 30);
  assert.equal(summary.durations.thinkingToFirstStreamDelta, 50);
});

test('client trace rebinding preserves marks that already exist on the real session id', () => {
  const store = createClientLatencyTraceStore();

  markClientLatencyEvent(store, 'temp-session', 'send_clicked', 10);
  markClientLatencyEvent(store, 'real-session', 'complete_received', 90);
  rebindClientLatencyTrace(store, 'temp-session', 'real-session');

  const trace = store.get('real-session');
  assert.equal(trace?.marks.send_clicked, 10);
  assert.equal(trace?.marks.complete_received, 90);
});

test('client trace rebinding keeps existing marks on the destination session when mark names conflict', () => {
  const store = createClientLatencyTraceStore();

  markClientLatencyEvent(store, 'temp-session', 'send_clicked', 10);
  markClientLatencyEvent(store, 'real-session', 'send_clicked', 5);
  markClientLatencyEvent(store, 'real-session', 'complete_received', 90);
  rebindClientLatencyTrace(store, 'temp-session', 'real-session');

  const trace = store.get('real-session');
  assert.equal(trace?.marks.send_clicked, 10);
  assert.equal(trace?.marks.complete_received, 90);
});

test('client summary computes latency segments from the recorded marks', () => {
  const store = createClientLatencyTraceStore();

  markClientLatencyEvent(store, 'sess-2', 'send_clicked', 1);
  markClientLatencyEvent(store, 'sess-2', 'first_thinking_received', 11);
  markClientLatencyEvent(store, 'sess-2', 'first_stream_delta_received', 26);

  const summary = summarizeClientLatencyTrace(store, 'sess-2');
  assert.equal(summary.durations.sendToThinking, 10);
  assert.equal(summary.durations.thinkingToFirstStreamDelta, 15);
});

test('client summary reports missing render mark until the first stream delta is flushed', () => {
  const store = createClientLatencyTraceStore();

  markClientLatencyEvent(store, 'sess-3', 'send_clicked', 1);
  markClientLatencyEvent(store, 'sess-3', 'first_thinking_received', 9);
  markClientLatencyEvent(store, 'sess-3', 'first_stream_delta_received', 25);

  const summary = summarizeClientLatencyTrace(store, 'sess-3');
  assert.ok(summary.missing.includes('streamDeltaToRendered'));
});

test('client summary returns a metadata copy that does not mutate the store record', () => {
  const store = createClientLatencyTraceStore();

  markClientLatencyEvent(store, 'sess-4', 'send_clicked', 1, { provider: 'claude' });

  const summary = summarizeClientLatencyTrace(store, 'sess-4');
  summary.metadata.provider = 'mutated';
  summary.metadata.extra = 'local-only';

  const trace = store.get('sess-4');
  assert.equal(trace?.metadata.provider, 'claude');
  assert.equal(trace?.metadata.extra, undefined);
});
