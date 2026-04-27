// 验证继续已有 session 时，只会新建 run，而不会重建 session。
import test from 'node:test';
import assert from 'node:assert/strict';

import { createInMemoryAgentV2Repository } from '../test-support/in-memory-agent-v2-repository.js';
import { continueConversationRun } from './continue-conversation-run.js';

test('continueConversationRun prefers a live runtime session over resume', async () => {
  const repo = createInMemoryAgentV2Repository();
  await repo.createSession({ sessionId: 'sess-live', title: '继续会话' });

  const liveSession = { sessionId: 'sess-live' };
  const reconnectCalls = [];
  const runtime = {
    hasLiveSession(sessionId) {
      return sessionId === 'sess-live';
    },
    getLiveSession(sessionId) {
      return sessionId === 'sess-live' ? liveSession : null;
    },
    reconnectSessionWriter(sessionId, writer) {
      reconnectCalls.push({ sessionId, writer });
      return true;
    },
    resume() {
      throw new Error('resume should not be called for a live session');
    },
  };

  const writer = { send() {} };
  const result = await continueConversationRun({
    repo,
    runtime,
    sessionId: 'sess-live',
    prompt: 'follow up',
    model: 'claude-opus-4-7',
    writer,
  });

  assert.equal(result.session, liveSession);
  assert.equal(result.sessionId, 'sess-live');
  assert.deepEqual(reconnectCalls, [{ sessionId: 'sess-live', writer }]);
});

test('continueConversationRun resumes the session and creates a new run', async () => {
  const repo = createInMemoryAgentV2Repository();
  await repo.createSession({ sessionId: 'sess-existing', title: '继续会话' });
  const resumeCalls = [];

  const runtime = {
    resume(sessionId, options) {
      resumeCalls.push({ sessionId, options });
      return {
        sessionId,
        options,
      };
    },
  };

  const result = await continueConversationRun({
    repo,
    runtime,
    sessionId: 'sess-existing',
    prompt: 'follow up',
    model: 'claude-opus-4-7',
  });

  assert.equal(result.run.conversationId, undefined);
  assert.equal(result.run.sessionId, 'sess-existing');
  assert.equal(result.run.userInput, 'follow up');
  assert.equal(result.sessionId, 'sess-existing');
  assert.equal('mcpEnabled' in resumeCalls[0].options, false);
});

test('continueConversationRun continues from sessionId even when the repo has no session record', async () => {
  const repo = createInMemoryAgentV2Repository();
  const resumeCalls = [];

  const runtime = {
    resume(sessionId, options) {
      resumeCalls.push({ sessionId, options });
      return {
        sessionId,
        options,
      };
    },
  };

  const result = await continueConversationRun({
    repo,
    runtime,
    sessionId: 'sess-runtime-only',
    prompt: 'follow up',
    model: 'claude-opus-4-7',
  });

  assert.equal(result.run.sessionId, 'sess-runtime-only');
  assert.equal(result.sessionId, 'sess-runtime-only');
  assert.equal(result.session.sessionId, 'sess-runtime-only');
  assert.equal(result.sessionRecord, null);
  assert.equal(resumeCalls.length, 1);
  assert.equal(resumeCalls[0]?.sessionId, 'sess-runtime-only');
});

test('continueConversationRun can continue with only sessionId even when repo has no session record', async () => {
  const repo = {
    async createRun({ sessionId, userInput }) {
      return {
        id: 'run-without-session-record',
        sessionId,
        userInput,
        status: 'queued',
      };
    },
  };
  const resumeCalls = [];
  const runtime = {
    resume(sessionId, options) {
      resumeCalls.push({ sessionId, options });
      return {
        sessionId,
        options,
      };
    },
  };

  const result = await continueConversationRun({
    repo,
    runtime,
    sessionId: 'sess-runtime-truth',
    prompt: 'follow up without repo session',
    model: 'claude-opus-4-7',
  });

  assert.equal(result.run.id, 'run-without-session-record');
  assert.equal(result.run.sessionId, 'sess-runtime-truth');
  assert.equal(result.sessionId, 'sess-runtime-truth');
  assert.equal(result.sessionRecord, null);
  assert.equal(resumeCalls.length, 1);
  assert.equal(resumeCalls[0]?.sessionId, 'sess-runtime-truth');
});

test('continueConversationRun does not consult the repo session table when sessionId is already known', async () => {
  const runtime = {
    resume(sessionId, options) {
      return {
        sessionId,
        options,
      };
    },
  };

  const result = await continueConversationRun({
    repo: {
      async createRun({ sessionId, userInput }) {
        return {
          id: 'run-no-session-read',
          sessionId,
          userInput,
          status: 'queued',
        };
      },
      async getSession() {
        throw new Error('continueConversationRun should not read repo.getSession');
      },
    },
    runtime,
    sessionId: 'sess-no-session-read',
    prompt: 'follow up',
    model: 'claude-opus-4-7',
  });

  assert.equal(result.run.id, 'run-no-session-read');
  assert.equal(result.sessionId, 'sess-no-session-read');
  assert.equal(result.sessionRecord, null);
  assert.equal(result.session.sessionId, 'sess-no-session-read');
});
