import test from 'node:test';
import assert from 'node:assert/strict';

import { createSessionRealtimeStore } from './createSessionRealtimeStore.ts';

test('createSessionRealtimeStore overwrites events with the same id', () => {
  const store = createSessionRealtimeStore();

  store.append({
    id: 'evt-1',
    sessionId: 'sess-1',
    timestamp: '2026-04-22T10:00:00.000Z',
    type: 'thinking',
    title: 'Thinking',
    body: 'First',
    tone: 'neutral',
  });
  store.append({
    id: 'evt-1',
    sessionId: 'sess-1',
    timestamp: '2026-04-22T10:00:01.000Z',
    type: 'thinking',
    title: 'Thinking',
    body: 'Updated',
    tone: 'neutral',
  });

  assert.deepEqual(store.listBySession('sess-1').map((event) => event.body), ['Updated']);
});

test('createSessionRealtimeStore keeps events sorted by timestamp', () => {
  const store = createSessionRealtimeStore();

  store.append({
    id: 'evt-2',
    sessionId: 'sess-1',
    timestamp: '2026-04-22T10:00:02.000Z',
    type: 'thinking',
    title: 'Thinking',
    body: 'Later',
    tone: 'neutral',
  });
  store.append({
    id: 'evt-1',
    sessionId: 'sess-1',
    timestamp: '2026-04-22T10:00:01.000Z',
    type: 'thinking',
    title: 'Thinking',
    body: 'Earlier',
    tone: 'neutral',
  });

  assert.deepEqual(store.listBySession('sess-1').map((event) => event.id), ['evt-1', 'evt-2']);
});

test('createSessionRealtimeStore rebinds session visibility without losing ordering', () => {
  const store = createSessionRealtimeStore();

  store.append({
    id: 'evt-1',
    sessionId: 'temp-1',
    timestamp: '2026-04-22T10:00:01.000Z',
    type: 'thinking',
    title: 'Thinking',
    body: 'First',
    tone: 'neutral',
  });
  store.append({
    id: 'evt-2',
    sessionId: 'temp-1',
    timestamp: '2026-04-22T10:00:02.000Z',
    type: 'thinking',
    title: 'Thinking',
    body: 'Second',
    tone: 'neutral',
  });

  store.rebindSession('temp-1', 'sess-1');

  assert.deepEqual(store.listBySession('temp-1'), []);
  assert.deepEqual(store.listBySession('sess-1').map((event) => [event.id, event.body]), [
    ['evt-1', 'First'],
    ['evt-2', 'Second'],
  ]);
});

test('createSessionRealtimeStore clears stale realtime events for a completed session', () => {
  const store = createSessionRealtimeStore();

  store.append({
    id: 'evt-1',
    sessionId: 'sess-1',
    timestamp: '2026-04-22T10:00:01.000Z',
    type: 'thinking',
    title: 'Thinking',
    body: 'First',
    tone: 'neutral',
  });
  store.append({
    id: 'evt-2',
    sessionId: 'sess-2',
    timestamp: '2026-04-22T10:00:02.000Z',
    type: 'thinking',
    title: 'Thinking',
    body: 'Second',
    tone: 'neutral',
  });

  assert.equal(store.clearSession('sess-1'), 1);
  assert.deepEqual(store.listBySession('sess-1'), []);
  assert.deepEqual(store.listBySession('sess-2').map((event) => event.id), ['evt-2']);
});
