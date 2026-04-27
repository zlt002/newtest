import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendSocketMessageEvent,
  getUnseenSocketMessageEvents,
} from './socketMessageEvents.ts';

test('appendSocketMessageEvent 保留快速到达的连续消息顺序', () => {
  let events = [];
  events = appendSocketMessageEvent(events, { type: 'session_created' }, 1, 10);
  events = appendSocketMessageEvent(events, { kind: 'thinking' }, 2, 10);
  events = appendSocketMessageEvent(events, { kind: 'complete' }, 3, 10);

  assert.deepEqual(
    events.map((event) => event.id),
    [1, 2, 3],
  );
  assert.deepEqual(
    events.map((event) => event.data),
    [{ type: 'session_created' }, { kind: 'thinking' }, { kind: 'complete' }],
  );
});

test('appendSocketMessageEvent 超过上限时仅裁剪最旧事件', () => {
  let events = [];

  for (let index = 1; index <= 4; index += 1) {
    events = appendSocketMessageEvent(events, { index }, index, 3);
  }

  assert.deepEqual(events.map((event) => event.id), [2, 3, 4]);
});

test('getUnseenSocketMessageEvents 返回自上次游标之后的全部事件', () => {
  const events = [
    { id: 3, data: { type: 'a' } },
    { id: 4, data: { type: 'b' } },
    { id: 5, data: { type: 'c' } },
  ];

  assert.deepEqual(
    getUnseenSocketMessageEvents(events, 3).map((event) => event.id),
    [4, 5],
  );
});
