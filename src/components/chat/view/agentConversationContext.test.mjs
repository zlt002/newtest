// 验证 V2 conversation 上下文切换判断不会误复用旧 conversationId。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getAgentConversationSelection,
  shouldResetAgentConversationId,
} from './agentConversationContext.ts';

test('切换项目时需要清掉旧的 agent conversation', () => {
  assert.equal(
    shouldResetAgentConversationId({
      previousSelection: {
        projectKey: '/workspace/cloudcli',
        sessionId: 'session-cloudcli',
      },
      nextSelection: {
        projectKey: '/workspace/html',
        sessionId: null,
      },
    }),
    true,
  );
});

test('同项目点新建会话时需要清掉旧的 agent conversation', () => {
  assert.equal(
    shouldResetAgentConversationId({
      previousSelection: {
        projectKey: '/workspace/html',
        sessionId: 'session-old',
      },
      nextSelection: {
        projectKey: '/workspace/html',
        sessionId: null,
      },
    }),
    true,
  );
});

test('同一个项目和会话不需要重置 agent conversation', () => {
  const selection = getAgentConversationSelection({
    selectedProject: {
      name: 'html',
      fullPath: '/workspace/html',
    },
    selectedSession: {
      id: 'session-1',
    },
  });

  assert.equal(
    shouldResetAgentConversationId({
      previousSelection: selection,
      nextSelection: selection,
    }),
    false,
  );
});
