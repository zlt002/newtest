// 验证事件 store 和 conversation store 可以一起构成稳定的回放事实源。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createAgentEventStore } from './createAgentEventStore.ts';
import { createConversationStore } from './createConversationStore.ts';
import { projectRunExecution } from '../projection/projectRunExecution.ts';

test('event store keeps events ordered by run sequence', () => {
  const store = createAgentEventStore();
  store.append({
    eventId: 'evt-2',
    runId: 'run-1',
    sessionId: 'sess-1',
    sequence: 2,
    type: 'run.body.segment_appended',
    timestamp: '2026-04-19T12:00:02.000Z',
    payload: { segment: { kind: 'text', text: 'world' } },
  });
  store.append({
    eventId: 'evt-1',
    runId: 'run-1',
    sessionId: 'sess-1',
    sequence: 1,
    type: 'run.started',
    timestamp: '2026-04-19T12:00:01.000Z',
    payload: {},
  });

  assert.deepEqual(store.listByRun('run-1').map((item) => item.sequence), [1, 2]);
});

test('event store notifies subscribers when events change', () => {
  const store = createAgentEventStore();
  let notifications = 0;
  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });

  store.append({
    eventId: 'evt-1',
    runId: 'run-1',
    sessionId: 'sess-1',
    sequence: 1,
    type: 'run.started',
    timestamp: '2026-04-19T12:00:01.000Z',
    payload: {},
  });

  unsubscribe();
  store.append({
    eventId: 'evt-2',
    runId: 'run-1',
    sessionId: 'sess-1',
    sequence: 2,
    type: 'run.completed',
    timestamp: '2026-04-19T12:00:02.000Z',
    payload: {},
  });

  assert.equal(notifications, 1);
});

test('createAgentEventStore remains the only source for active V2 run events', () => {
  const store = createAgentEventStore();
  store.append({
    eventId: 'evt-active-1',
    runId: 'run-1',
    sessionId: 'sess-1',
    sequence: 1,
    type: 'run.started',
    timestamp: '2026-04-20T12:00:00.000Z',
    payload: {},
  });

  assert.equal(store.listBySession('sess-1').length, 1);
  assert.equal(store.listBySession('sess-1')[0]?.type, 'run.started');
});

test('event store can group active V2 run events by sessionId without conversationId', () => {
  const store = createAgentEventStore();
  store.append({
    eventId: 'evt-session-only-1',
    runId: 'run-session-only-1',
    sessionId: 'sess-session-only-1',
    sequence: 1,
    type: 'run.started',
    timestamp: '2026-04-20T12:10:00.000Z',
    payload: {},
  });

  assert.equal(store.listBySession('sess-session-only-1').length, 1);
  assert.equal(store.listByRun('run-session-only-1')[0]?.eventId, 'evt-session-only-1');
});

test('run execution projection can rebuild one run summary directly from the event store', () => {
  const store = createAgentEventStore();
  store.append({ eventId: '1', runId: 'run-1', sessionId: 'sess-1', sequence: 1, type: 'run.started', timestamp: '2026-04-19T12:00:01.000Z', payload: {} });
  store.append({ eventId: '2', runId: 'run-1', sessionId: 'sess-1', sequence: 2, type: 'run.body.segment_appended', timestamp: '2026-04-19T12:00:02.000Z', payload: { segment: { kind: 'text', text: '你好' } } });
  store.append({ eventId: '3', runId: 'run-1', sessionId: 'sess-1', sequence: 3, type: 'run.completed', timestamp: '2026-04-19T12:00:03.000Z', payload: { result: '你好' } });

  const execution = projectRunExecution(store.listByRun('run-1'));
  assert.equal(execution.status, 'completed');
  assert.equal(execution.assistantText, '你好');
  assert.equal(execution.presentationMode, 'history');
});

test('hydrateSession deduplicates historical events within one session without disturbing other sessions', () => {
  const store = createAgentEventStore();
  store.append({
    eventId: 'old-1',
    runId: 'run-old',
    sessionId: 'sess-1',
    sequence: 1,
    type: 'run.started',
    timestamp: '2026-04-19T12:00:00.000Z',
    payload: {},
  });
  store.append({
    eventId: 'other-1',
    runId: 'run-other',
    sessionId: 'sess-2',
    sequence: 1,
    type: 'run.started',
    timestamp: '2026-04-19T12:00:00.000Z',
    payload: {},
  });

  store.hydrateSession('sess-1', [
    {
      eventId: 'new-1',
      runId: 'run-new',
      sessionId: 'sess-1',
      sequence: 1,
      type: 'run.started',
      timestamp: '2026-04-19T12:01:00.000Z',
      payload: {},
    },
    {
      eventId: 'new-2',
      runId: 'run-new',
      sessionId: 'sess-1',
      sequence: 2,
      type: 'run.body.segment_appended',
      timestamp: '2026-04-19T12:01:01.000Z',
      payload: { segment: { kind: 'text', text: '历史回答' } },
    },
    {
      eventId: 'new-2',
      runId: 'run-new',
      sessionId: 'sess-1',
      sequence: 2,
      type: 'run.body.segment_appended',
      timestamp: '2026-04-19T12:01:01.000Z',
      payload: { segment: { kind: 'text', text: '历史回答' } },
    },
  ]);

  assert.deepEqual(store.listBySession('sess-1').map((event) => event.eventId), ['new-1', 'new-2']);
  assert.deepEqual(store.listBySession('sess-2').map((event) => event.eventId), ['other-1']);
  assert.equal(store.listBySession('sess-1').filter((event) => event.eventId === 'new-2').length, 1);
});

test('conversation store derives run state from replayable events', () => {
  const store = createConversationStore();
  store.appendEvents([
    { eventId: '1', runId: 'run-1', sessionId: 'sess-1', sequence: 1, type: 'run.created', timestamp: '2026-04-19T12:00:00.000Z', payload: { userInput: 'Fix bug' } },
    { eventId: '2', runId: 'run-1', sessionId: 'sess-1', sequence: 2, type: 'run.started', timestamp: '2026-04-19T12:00:01.000Z', payload: {} },
    { eventId: '3', runId: 'run-1', sessionId: 'sess-1', sequence: 3, type: 'run.body.segment_appended', timestamp: '2026-04-19T12:00:02.000Z', payload: { segment: { kind: 'text', text: 'Working' } } },
    { eventId: '4', runId: 'run-1', sessionId: 'sess-1', sequence: 4, type: 'run.completed', timestamp: '2026-04-19T12:00:03.000Z', payload: { result: 'Working' } },
  ]);

  const runState = store.getRunState('run-1');
  assert.equal(runState?.userInput, 'Fix bug');
  assert.equal(runState?.assistantText, 'Working');
  assert.equal(runState?.status, 'completed');
});
