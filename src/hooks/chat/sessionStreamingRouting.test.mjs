import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveStreamingTargetSessionId,
  shouldAppendDeltaAsBackgroundRealtime,
} from './sessionStreamingRouting.ts';

test('resolveStreamingTargetSessionId 在当前可见会话还是临时 id 时，继续把流式内容记到临时会话里', () => {
  assert.equal(
    resolveStreamingTargetSessionId({
      streamSessionId: '4957a5c3-6285-408d-9659-447dcbccd35c',
      activeViewSessionId: 'new-session-1713408037000',
    }),
    'new-session-1713408037000',
  );
});

test('resolveStreamingTargetSessionId 在普通会话中使用真实 session id', () => {
  assert.equal(
    resolveStreamingTargetSessionId({
      streamSessionId: '4957a5c3-6285-408d-9659-447dcbccd35c',
      activeViewSessionId: '4957a5c3-6285-408d-9659-447dcbccd35c',
    }),
    '4957a5c3-6285-408d-9659-447dcbccd35c',
  );
});

test('shouldAppendDeltaAsBackgroundRealtime 仅对真正后台会话的流式增量返回 true', () => {
  assert.equal(
    shouldAppendDeltaAsBackgroundRealtime({
      streamSessionId: '4957a5c3-6285-408d-9659-447dcbccd35c',
      activeViewSessionId: 'new-session-1713408037000',
    }),
    false,
  );

  assert.equal(
    shouldAppendDeltaAsBackgroundRealtime({
      streamSessionId: 'session-background',
      activeViewSessionId: 'session-foreground',
    }),
    true,
  );
});
