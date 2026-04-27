import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildChatMessageIdentity,
  getToolUseLeadText,
} from './chatMessagePresentation.ts';

test('buildChatMessageIdentity preserves normalized message ids for stable chat message keys', () => {
  assert.deepEqual(
    buildChatMessageIdentity({
      id: 'assistant-1',
      kind: 'text',
      timestamp: '2026-04-16T10:00:00.000Z',
    }),
    {
      id: 'assistant-1',
      messageId: 'assistant-1',
    },
  );
});

test('getToolUseLeadText stays empty when no explicit assistant preface exists', () => {
  assert.equal(
    getToolUseLeadText({
      displayText: undefined,
      content: '',
      toolName: 'Edit',
    }),
    '',
  );
});

test('getToolUseLeadText returns display text when present', () => {
  assert.equal(
    getToolUseLeadText({
      displayText: '正在修改 login.html',
      content: '',
      toolName: 'Edit',
    }),
    '正在修改 login.html',
  );
});
