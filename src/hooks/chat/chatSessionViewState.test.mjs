import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveVisibleChatSessionId } from './chatSessionViewState.ts';

test('prefers the current session when one is active', () => {
  assert.equal(
    resolveVisibleChatSessionId({
      selectedSessionId: 'session-real-1',
      currentSessionId: 'session-old',
      pendingSessionId: null,
    }),
    'session-old',
  );
});

test('prefers a temporary new-session id over a stale selected session', () => {
  assert.equal(
    resolveVisibleChatSessionId({
      selectedSessionId: 'session-real-1',
      currentSessionId: 'new-session-123',
      pendingSessionId: null,
    }),
    'new-session-123',
  );
});

test('uses the pending session id while a new session is being rebound', () => {
  assert.equal(
    resolveVisibleChatSessionId({
      selectedSessionId: null,
      currentSessionId: null,
      pendingSessionId: 'session-real-new',
    }),
    'session-real-new',
  );
});

test('keeps a temporary new-session id visible for local-only first-turn state', () => {
  assert.equal(
    resolveVisibleChatSessionId({
      selectedSessionId: null,
      currentSessionId: 'new-session-123',
      pendingSessionId: null,
    }),
    'new-session-123',
  );
});

test('falls back to the selected session when no current or pending session exists', () => {
  assert.equal(
    resolveVisibleChatSessionId({
      selectedSessionId: 'existing-session-uuid',
      currentSessionId: null,
      pendingSessionId: null,
    }),
    'existing-session-uuid',
  );
});
