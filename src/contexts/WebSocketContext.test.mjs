import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dispatchSocketMessage,
  flushQueuedSocketMessages,
} from './socketSendQueue.ts';

test('dispatchSocketMessage sends immediately when socket is open', () => {
  const sent = [];
  const queue = [];
  const socket = {
    readyState: 1,
    send(payload) {
      sent.push(payload);
    },
  };

  const result = dispatchSocketMessage({
    socket,
    message: {
      type: 'chat_run_start',
      sessionId: null,
      projectPath: '/workspace/demo',
      message: { role: 'user', content: 'hello' },
    },
    queue,
    logger: { warn() {} },
  });

  assert.deepEqual(result, { status: 'sent' });
  assert.deepEqual(queue, []);
  assert.deepEqual(sent, [
    JSON.stringify({
      type: 'chat_run_start',
      sessionId: null,
      projectPath: '/workspace/demo',
      message: { role: 'user', content: 'hello' },
    }),
  ]);
});

test('dispatchSocketMessage queues message when socket is not connected and flushes on reconnect', () => {
  const warnings = [];
  const queue = [];

  const result = dispatchSocketMessage({
    socket: null,
    message: {
      type: 'chat_user_message',
      sessionId: 'sess-1',
      message: { role: 'user', content: 'queued-message' },
    },
    queue,
    logger: {
      warn(message) {
        warnings.push(message);
      },
    },
  });

  assert.deepEqual(result, { status: 'queued' });
  assert.equal(queue.length, 1);
  assert.deepEqual(warnings, ['WebSocket not connected, message queued']);

  const sent = [];
  const socket = {
    readyState: 1,
    send(payload) {
      sent.push(payload);
    },
  };

  const flushed = flushQueuedSocketMessages(socket, queue);

  assert.equal(flushed, 1);
  assert.deepEqual(queue, []);
  assert.deepEqual(sent, [
    JSON.stringify({
      type: 'chat_user_message',
      sessionId: 'sess-1',
      message: { role: 'user', content: 'queued-message' },
    }),
  ]);
});

test('flushQueuedSocketMessages does nothing for non-open socket', () => {
  const queue = [JSON.stringify({
    type: 'chat_user_message',
    sessionId: 'sess-keep',
    message: { role: 'user', content: 'keep-me' },
  })];
  const socket = {
    readyState: 0,
    send() {
      throw new Error('should not send while socket is not open');
    },
  };

  const flushed = flushQueuedSocketMessages(socket, queue);

  assert.equal(flushed, 0);
  assert.equal(queue.length, 1);
});
