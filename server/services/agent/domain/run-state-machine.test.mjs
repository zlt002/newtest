// run 状态机的回归测试。
// 这里确认事件顺序推进出来的状态与预期一致。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAgentEventEnvelope,
  advanceRunState,
  RUN_STATES,
} from './run-state-machine.js';
import { createSessionRecord } from './session-record.js';

test('createAgentEventEnvelope builds a stable run event payload', () => {
  const event = createAgentEventEnvelope({
    runId: 'run-1',
    sessionId: 'sess-1',
    sequence: 3,
    type: 'assistant.message.delta',
    payload: { text: 'hello' },
  });

  assert.equal(event.runId, 'run-1');
  assert.equal(event.sequence, 3);
  assert.equal(event.type, 'assistant.message.delta');
  assert.equal(event.payload.text, 'hello');
  assert.ok(event.eventId);
  assert.ok(event.timestamp);
});

test('advanceRunState rejects illegal transitions after completion', () => {
  assert.equal(advanceRunState('queued', 'run.started'), 'starting');
  assert.equal(advanceRunState('starting', 'assistant.message.delta'), 'streaming');
  assert.equal(advanceRunState('streaming', 'run.completed'), 'completed');
  assert.throws(() => advanceRunState('completed', 'assistant.message.delta'));
});

test('run state machine exposes the full persisted lifecycle contract', () => {
  assert.deepEqual(RUN_STATES, [
    'queued',
    'starting',
    'streaming',
    'waiting_for_tool',
    'completing',
    'completed',
    'failed',
    'aborted',
  ]);

  assert.equal(advanceRunState('queued', 'run.started'), 'starting');
  assert.equal(advanceRunState('starting', 'assistant.message.started'), 'streaming');
  assert.equal(advanceRunState('streaming', 'tool.call.started'), 'waiting_for_tool');
  assert.equal(advanceRunState('waiting_for_tool', 'tool.call.completed'), 'streaming');
  assert.equal(advanceRunState('streaming', 'assistant.message.completed'), 'completing');
  assert.equal(advanceRunState('completing', 'run.completed'), 'completed');
});

test('createSessionRecord builds a stable session metadata record', () => {
  const session = createSessionRecord({
    id: 'sess-1',
    title: 'Workspace A',
    createdAt: '2026-04-19T00:00:00.000Z',
  });

  assert.deepEqual(session, {
    id: 'sess-1',
    title: 'Workspace A',
    createdAt: '2026-04-19T00:00:00.000Z',
  });
});
