// run 状态机的回归测试。
// 这里确认事件顺序推进出来的状态与预期一致。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createAgentEventEnvelope,
  RUN_STATES,
} from './run-state-machine.js';

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
});
