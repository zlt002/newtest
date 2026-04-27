import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveComposerSubmitTarget } from './chatComposerSessionTarget.ts';

test('selectedSessionId 与 currentSessionId 一致时继续当前 session', () => {
  assert.deepEqual(
    resolveComposerSubmitTarget({
      selectedSessionId: 'session-1',
      currentSessionId: 'session-1',
    }),
    {
      mode: 'continue',
      sessionId: 'session-1',
    },
  );
});

test('selectedSessionId 在 currentSessionId 不一致时仍应继续当前选中的会话', () => {
  assert.deepEqual(
    resolveComposerSubmitTarget({
      selectedSessionId: 'session-1',
      currentSessionId: 'session-stale',
    }),
    {
      mode: 'continue',
      sessionId: 'session-1',
    },
  );
});

test('selectedSessionId 存在而 currentSessionId 为空时也应继续当前选中的会话', () => {
  assert.deepEqual(
    resolveComposerSubmitTarget({
      selectedSessionId: 'session-1',
      currentSessionId: null,
    }),
    {
      mode: 'continue',
      sessionId: 'session-1',
    },
  );
});

test('临时新会话应优先于任何已选中的旧会话', () => {
  assert.deepEqual(
    resolveComposerSubmitTarget({
      selectedSessionId: 'session-1',
      currentSessionId: 'new-session-123',
    }),
    {
      mode: 'new',
      sessionId: 'new-session-123',
    },
  );
});

test('新会话草稿阶段应继续使用临时 session id', () => {
  assert.deepEqual(
    resolveComposerSubmitTarget({
      selectedSessionId: null,
      currentSessionId: 'new-session-123',
    }),
    {
      mode: 'new',
      sessionId: 'new-session-123',
    },
  );
});

test('未选中会话时，不应复用旧的真实 session id', () => {
  assert.deepEqual(
    resolveComposerSubmitTarget({
      selectedSessionId: null,
      currentSessionId: 'real-session-from-cloudcli',
    }),
    {
      mode: 'new-conversation',
      sessionId: null,
    },
  );
});

test('已选中会话但没有 conversation 绑定时，也应继续当前 session', () => {
  assert.deepEqual(
    resolveComposerSubmitTarget({
      selectedSessionId: 'session-1',
      currentSessionId: 'session-1',
    }),
    {
      mode: 'continue',
      sessionId: 'session-1',
    },
  );
});
