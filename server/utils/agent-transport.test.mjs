import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createTransportError,
  createTransportQuestionRequest,
  createTransportSdkMessage,
  createTransportToolApprovalRequest,
} from './agent-transport.js';

test('wraps SDK messages in the new transport envelope', () => {
  const event = createTransportSdkMessage(
    { type: 'result', result: 'done', subtype: 'success' },
    { sessionId: 'session-1' },
  );

  assert.equal(event.type, 'agent_sdk_message');
  assert.equal(event.sessionId, 'session-1');
  assert.equal(event.sdkMessage.sdkType, 'result');
  assert.equal(event.sdkMessage.payload.result, 'done');
});

test('creates a dedicated tool approval request event', () => {
  const event = createTransportToolApprovalRequest({
    sessionId: 'session-2',
    requestId: 'req-1',
    toolName: 'Bash',
    input: { command: 'npm test' },
  });

  assert.equal(event.type, 'tool_approval_request');
  assert.equal(event.requestId, 'req-1');
  assert.equal(event.toolName, 'Bash');
  assert.deepEqual(event.input, { command: 'npm test' });
});

test('creates a dedicated question request event', () => {
  const event = createTransportQuestionRequest({
    sessionId: 'session-3',
    requestId: 'req-2',
    questions: [{
      question: 'Which format?',
      options: [
        { label: 'Summary', description: 'Brief' },
        { label: 'Detailed', description: 'Full' },
      ],
    }],
  });

  assert.equal(event.type, 'question_request');
  assert.equal(event.requestId, 'req-2');
  assert.equal(event.questions.length, 1);
  assert.equal(event.questions[0].question, 'Which format?');
});

test('normalizes string errors into the transport error shape', () => {
  const event = createTransportError('boom', { sessionId: 'session-4' });

  assert.equal(event.type, 'agent_error');
  assert.equal(event.error.message, 'boom');
  assert.equal(event.sessionId, 'session-4');
});
