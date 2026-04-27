import test from 'node:test';
import assert from 'node:assert/strict';

import { createAgentV2RealtimeCoordinator } from './agentV2Realtime.ts';

test('submitRun sends chat_user_message for existing sessions', () => {
  const sent = [];
  const coordinator = createAgentV2RealtimeCoordinator({
    sendMessage(message) {
      sent.push(message);
    },
    appendEvent() {},
  });

  coordinator.submitRun({
    prompt: '继续总结改动',
    projectPath: '/workspace/demo',
    sessionId: 'sess-1',
    model: 'claude-opus-4-7',
    effort: 'high',
    permissionMode: 'bypassPermissions',
    sessionSummary: '已有摘要',
    images: [],
    toolsSettings: { allowedTools: ['Read'] },
    traceId: 'trace-1',
    contextFilePaths: ['/workspace/demo/src/App.tsx'],
  });

  assert.deepEqual(sent, [{
    type: 'chat_user_message',
    sessionId: 'sess-1',
    message: {
      role: 'user',
      content: '继续总结改动',
    },
    contextFilePaths: ['/workspace/demo/src/App.tsx'],
  }]);
});

test('submitRun sends chat_run_start for new sessions', () => {
  const sent = [];
  const coordinator = createAgentV2RealtimeCoordinator({
    sendMessage(message) {
      sent.push(message);
    },
    appendEvent() {},
  });

  coordinator.submitRun({
    prompt: '新会话开始',
    projectPath: '/workspace/demo',
    sessionId: null,
    model: 'claude-opus-4-7',
    effort: 'high',
    permissionMode: 'bypassPermissions',
    sessionSummary: null,
    images: [],
    toolsSettings: { allowedTools: ['Read'] },
    traceId: 'trace-new',
    contextFilePaths: ['/workspace/demo/src/App.tsx'],
  });

  assert.deepEqual(sent, [{
    type: 'chat_run_start',
    sessionId: null,
    projectPath: '/workspace/demo',
    model: 'claude-opus-4-7',
    permissionMode: 'bypassPermissions',
    traceId: 'trace-new',
    message: {
      role: 'user',
      content: '新会话开始',
    },
    contextFilePaths: ['/workspace/demo/src/App.tsx'],
  }]);
});
