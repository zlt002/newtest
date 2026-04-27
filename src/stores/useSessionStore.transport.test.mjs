import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { __testables__ } from './useSessionStore.ts';

const { mapTransportEventToNormalizedMessages, toNormalizedHistoryMessage } = __testables__;

test('preserves stream transport messages as agent_sdk_message envelopes', () => {
  const messages = mapTransportEventToNormalizedMessages({
    type: 'agent_sdk_message',
    sessionId: 'session-1',
    timestamp: '2026-04-25T00:00:00.000Z',
    sdkMessage: {
      sdkType: 'stream_event',
      payload: {
        event: {
          type: 'content_block_delta',
          delta: {
            text: 'hello',
          },
        },
      },
    },
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].kind, 'agent_sdk_message');
  assert.equal(messages[0].sdkMessage?.sdkType, 'stream_event');
  assert.equal(messages[0].sdkMessage?.payload?.event?.delta?.text, 'hello');
});

test('preserves result transport messages as agent_sdk_message envelopes', () => {
  const messages = mapTransportEventToNormalizedMessages({
    type: 'agent_sdk_message',
    sessionId: 'session-result',
    timestamp: '2026-04-25T00:00:00.000Z',
    sdkMessage: {
      sdkType: 'result',
      payload: {
        result: 'done',
        subtype: 'success',
        structured_output: { ok: true },
      },
    },
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].kind, 'agent_sdk_message');
  assert.equal(messages[0].sdkMessage?.sdkType, 'result');
  assert.equal(messages[0].sdkMessage?.payload?.result, 'done');
});

test('maps tool approval requests into dedicated normalized messages', () => {
  const messages = mapTransportEventToNormalizedMessages({
    type: 'tool_approval_request',
    sessionId: 'session-2',
    requestId: 'req-1',
    toolName: 'Bash',
    input: { command: 'npm test' },
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].kind, 'tool_approval_request');
  assert.equal(messages[0].toolName, 'Bash');
});

test('maps question requests into dedicated normalized messages', () => {
  const messages = mapTransportEventToNormalizedMessages({
    type: 'question_request',
    sessionId: 'session-3',
    requestId: 'req-2',
    questions: [{
      question: 'Which format?',
      options: [
        { label: 'Short' },
        { label: 'Long' },
      ],
    }],
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].kind, 'question_request');
  assert.equal(messages[0].questions?.[0]?.question, 'Which format?');
});

test('useSessionStore fetches canonical history through agent-v2 history service instead of legacy messages endpoint', async () => {
  const sourcePath = path.join(process.cwd(), 'src/stores/useSessionStore.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /fetchSessionHistory/);
  assert.doesNotMatch(source, /\/api\/sessions\/\$\{encodeURIComponent\(sessionId\)\}\/messages/);
});

test('toNormalizedHistoryMessage keeps split transport decision kinds from canonical history', () => {
  const questionMessage = toNormalizedHistoryMessage({
    id: 'history-question-1',
    sessionId: 'session-history-1',
    role: 'assistant',
    text: '选择执行方式',
    timestamp: '2026-04-26T00:00:00.000Z',
    kind: 'question_request',
    type: 'question_request',
  }, 'claude');

  const approvalMessage = toNormalizedHistoryMessage({
    id: 'history-approval-1',
    sessionId: 'session-history-1',
    role: 'assistant',
    text: '请授权 Bash',
    timestamp: '2026-04-26T00:00:01.000Z',
    kind: 'tool_approval_request',
    type: 'tool_approval_request',
    toolName: 'Bash',
  }, 'claude');

  assert.equal(questionMessage.kind, 'question_request');
  assert.equal(approvalMessage.kind, 'tool_approval_request');
});

test('toNormalizedHistoryMessage no longer preserves legacy interaction kinds from canonical history', () => {
  const interactivePromptMessage = toNormalizedHistoryMessage({
    id: 'history-interactive-1',
    sessionId: 'session-history-2',
    role: 'assistant',
    text: '旧交互问题',
    timestamp: '2026-04-26T00:00:00.000Z',
    kind: 'interactive_prompt',
    type: 'interactive_prompt',
  }, 'claude');

  const permissionRequestMessage = toNormalizedHistoryMessage({
    id: 'history-permission-1',
    sessionId: 'session-history-2',
    role: 'assistant',
    text: '旧权限请求',
    timestamp: '2026-04-26T00:00:01.000Z',
    kind: 'permission_request',
    type: 'permission_request',
    toolName: 'Bash',
  }, 'claude');

  assert.equal(interactivePromptMessage.kind, 'text');
  assert.equal(permissionRequestMessage.kind, 'text');
});

test('toNormalizedHistoryMessage downgrades legacy stream_delta history into canonical assistant text', () => {
  const streamDeltaMessage = toNormalizedHistoryMessage({
    id: 'history-stream-1',
    sessionId: 'session-history-3',
    role: 'assistant',
    text: '流式残影',
    timestamp: '2026-04-26T00:00:02.000Z',
    kind: 'stream_delta',
    type: 'stream_delta',
  }, 'claude');

  assert.equal(streamDeltaMessage.kind, 'text');
  assert.equal(streamDeltaMessage.role, 'assistant');
  assert.equal(streamDeltaMessage.content, '流式残影');
});

test('toNormalizedHistoryMessage downgrades legacy tool_use_partial history into canonical tool_use', () => {
  const toolUsePartialMessage = toNormalizedHistoryMessage({
    id: 'history-tool-partial-1',
    sessionId: 'session-history-3',
    role: 'assistant',
    text: '',
    timestamp: '2026-04-26T00:00:03.000Z',
    kind: 'tool_use_partial',
    type: 'tool_use_partial',
    toolName: 'Read',
  }, 'claude');

  assert.equal(toolUsePartialMessage.kind, 'tool_use');
  assert.equal(toolUsePartialMessage.toolName, 'Read');
});

test('toNormalizedHistoryMessage downgrades transcript-only control history kinds into plain text', () => {
  const streamEndMessage = toNormalizedHistoryMessage({
    id: 'history-stream-end-1',
    sessionId: 'session-history-4',
    role: 'assistant',
    text: '',
    timestamp: '2026-04-26T00:00:04.000Z',
    kind: 'stream_end',
    type: 'stream_end',
  }, 'claude');

  const completeMessage = toNormalizedHistoryMessage({
    id: 'history-complete-1',
    sessionId: 'session-history-4',
    role: 'assistant',
    text: '',
    timestamp: '2026-04-26T00:00:05.000Z',
    kind: 'complete',
    type: 'complete',
  }, 'claude');

  const sessionCreatedMessage = toNormalizedHistoryMessage({
    id: 'history-session-created-1',
    sessionId: 'session-history-4',
    role: 'assistant',
    text: '',
    timestamp: '2026-04-26T00:00:06.000Z',
    kind: 'session_created',
    type: 'session_created',
  }, 'claude');

  assert.equal(streamEndMessage.kind, 'text');
  assert.equal(completeMessage.kind, 'text');
  assert.equal(sessionCreatedMessage.kind, 'text');
});

test('toNormalizedHistoryMessage preserves canonical session_status and debug_ref history kinds', () => {
  const sessionStatusMessage = toNormalizedHistoryMessage({
    id: 'history-session-status-1',
    sessionId: 'session-history-5',
    role: 'tool',
    text: 'still active',
    timestamp: '2026-04-26T00:00:07.000Z',
    kind: 'session_status',
    type: 'session_status',
    content: { status: 'running', detail: 'still active' },
  }, 'claude');

  const debugRefMessage = toNormalizedHistoryMessage({
    id: 'history-debug-ref-1',
    sessionId: 'session-history-5',
    role: 'tool',
    text: null,
    timestamp: '2026-04-26T00:00:08.000Z',
    kind: 'debug_ref',
    type: 'debug_ref',
    content: { label: 'sdk_debug_log#99', path: '/tmp/debug.log' },
  }, 'claude');

  assert.equal(sessionStatusMessage.kind, 'session_status');
  assert.equal(debugRefMessage.kind, 'debug_ref');
});
