import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isClaudeSessionIdResumable,
  resolveClaudeResumeSessionId,
  shouldResumeClaudeSession,
} from './claude-session.js';

test('accepts UUID session ids for resume', () => {
  const sessionId = '550e8400-e29b-41d4-a716-446655440000';
  assert.equal(isClaudeSessionIdResumable(sessionId), true);
  assert.equal(resolveClaudeResumeSessionId({ sessionId, resume: true }), sessionId);
  assert.equal(shouldResumeClaudeSession({ sessionId, resume: true }), true);
});

test('treats temporary frontend session ids as non-resumable', () => {
  const sessionId = 'new-session-1712999999999';
  assert.equal(isClaudeSessionIdResumable(sessionId), false);
  assert.equal(resolveClaudeResumeSessionId({ sessionId, resume: true }), null);
  assert.equal(shouldResumeClaudeSession({ sessionId, resume: true }), false);
});

test('does not resume when resume flag is explicitly false', () => {
  const sessionId = '550e8400-e29b-41d4-a716-446655440000';
  assert.equal(resolveClaudeResumeSessionId({ sessionId, resume: false }), null);
  assert.equal(shouldResumeClaudeSession({ sessionId, resume: false }), false);
});

test('falls back to conversationId when sessionId is missing', () => {
  const sessionId = '550e8400-e29b-41d4-a716-446655440000';

  assert.equal(
    resolveClaudeResumeSessionId({ conversationId: sessionId, resume: true }),
    sessionId,
  );
  assert.equal(
    shouldResumeClaudeSession({ conversationId: sessionId, resume: true }),
    true,
  );
});

test('falls back to explicit alias when sessionId is temporary', () => {
  const sessionId = '550e8400-e29b-41d4-a716-446655440000';

  assert.equal(
    resolveClaudeResumeSessionId({
      sessionId: 'new-session-1712999999999',
      conversationId: sessionId,
      resume: true,
    }),
    sessionId,
  );
  assert.equal(
    shouldResumeClaudeSession({
      sessionId: 'new-session-1712999999999',
      conversationId: sessionId,
      resume: true,
    }),
    true,
  );
});

test('falls back to agentConversationId when no other resumable session id is present', () => {
  const sessionId = '550e8400-e29b-41d4-a716-446655440000';

  assert.equal(
    resolveClaudeResumeSessionId({
      agentConversationId: sessionId,
      resume: true,
    }),
    sessionId,
  );
  assert.equal(
    shouldResumeClaudeSession({
      agentConversationId: sessionId,
      resume: true,
    }),
    true,
  );
});

test('ignores arbitrary non-uuid session ids when resume flag is omitted', () => {
  const sessionId = 'ws-repro-trace';
  assert.equal(resolveClaudeResumeSessionId({ sessionId }), null);
  assert.equal(shouldResumeClaudeSession({ sessionId }), false);
});
