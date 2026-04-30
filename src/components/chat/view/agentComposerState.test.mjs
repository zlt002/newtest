import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveAgentComposerState } from './agentComposerState.ts';

test('有活跃的 V2 execution 时，顶部状态跟随 execution 而不是旧 completed 文案', () => {
  assert.deepEqual(
    resolveAgentComposerState({
      isLoading: false,
      claudeStatusText: null,
      execution: {
        status: 'streaming',
        assistantText: '正在分析项目结构',
      },
    }),
    {
      status: 'streaming',
      label: '正在接收回复',
    },
  );
});

test('没有活跃 execution 时，顶部状态回退到旧 loading 状态', () => {
  assert.deepEqual(
    resolveAgentComposerState({
      isLoading: true,
      claudeStatusText: '处理中',
      hasConversationHistory: false,
      execution: null,
    }),
    {
      status: 'streaming',
      label: '处理中',
    },
  );
});

test('活跃 execution 不把完整 assistant 正文塞进 composer 状态条', () => {
  const longAssistantText = '这是第一段完整回复。'.repeat(20);

  assert.deepEqual(
    resolveAgentComposerState({
      isLoading: false,
      claudeStatusText: null,
      hasConversationHistory: true,
      execution: {
        status: 'streaming',
        assistantText: longAssistantText,
      },
    }),
    {
      status: 'streaming',
      label: '正在接收回复',
    },
  );
});

test('空白新会话在未开始时显示 idle，而不是 completed', () => {
  assert.deepEqual(
    resolveAgentComposerState({
      isLoading: false,
      claudeStatusText: null,
      hasConversationHistory: false,
      execution: null,
    }),
    {
      status: 'idle',
      label: '发送消息开始对话',
    },
  );
});

test('已有历史对话但当前空闲时显示 completed', () => {
  assert.deepEqual(
    resolveAgentComposerState({
      isLoading: false,
      claudeStatusText: null,
      hasConversationHistory: true,
      execution: null,
    }),
    {
      status: 'completed',
      label: '准备开始下一轮',
    },
  );
});
