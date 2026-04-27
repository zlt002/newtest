import test from 'node:test';
import assert from 'node:assert/strict';

import { collectUnseenDraftPreviewEvents } from './chatDraftPreviewEvents.ts';

function createToolUseMessage(overrides = {}) {
  return {
    id: 'tool-use-1',
    sessionId: 'session-1',
    timestamp: '2026-04-17T09:00:00.000Z',
    provider: 'claude',
    kind: 'tool_use',
    toolName: 'Edit',
    toolId: 'tool-1',
    toolInput: {
      file_path: '/workspace/demo/PRD.md',
      old_string: '旧内容',
      new_string: '新内容',
      replace_all: false,
    },
    ...overrides,
  };
}

function createToolResultMessage(overrides = {}) {
  return {
    id: 'tool-result-1',
    sessionId: 'session-1',
    timestamp: '2026-04-17T09:00:01.000Z',
    provider: 'claude',
    kind: 'tool_result',
    toolId: 'tool-1',
    content: 'Updated successfully.',
    isError: false,
    ...overrides,
  };
}

test('collectUnseenDraftPreviewEvents 为 Edit 先发 delta，再在成功后发 committed', () => {
  const emittedKeys = new Set();
  const events = collectUnseenDraftPreviewEvents(
    [createToolUseMessage(), createToolResultMessage()],
    emittedKeys,
  );

  assert.deepEqual(
    events.map((event) => event.type),
    ['file_change_preview_delta', 'file_change_preview_committed'],
  );
  assert.equal(events[0].operation.oldText, '旧内容');
  assert.equal(events[0].operation.newText, '新内容');
});

test('collectUnseenDraftPreviewEvents 在失败时发 discarded', () => {
  const emittedKeys = new Set();
  const events = collectUnseenDraftPreviewEvents(
    [
      createToolUseMessage(),
      createToolResultMessage({
        isError: true,
        content: 'String to replace not found',
      }),
    ],
    emittedKeys,
  );

  assert.deepEqual(
    events.map((event) => event.type),
    ['file_change_preview_delta', 'file_change_preview_discarded'],
  );
});

test('collectUnseenDraftPreviewEvents 支持 Write 直接覆盖全文', () => {
  const emittedKeys = new Set();
  const events = collectUnseenDraftPreviewEvents(
    [
      createToolUseMessage({
        toolName: 'Write',
        toolInput: {
          file_path: '/workspace/demo/README.md',
          content: '# 标题\n\n新的内容',
        },
      }),
    ],
    emittedKeys,
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'file_change_preview_delta');
  assert.equal(events[0].operation.mode, 'write');
  assert.equal(events[0].operation.newText, '# 标题\n\n新的内容');
});

test('collectUnseenDraftPreviewEvents 支持 tool_use_partial 提前生成草稿预览事件', () => {
  const emittedKeys = new Set();
  const events = collectUnseenDraftPreviewEvents(
    [
      createToolUseMessage({
        kind: 'tool_use_partial',
        timestamp: '2026-04-17T09:00:00.100Z',
        toolName: 'Write',
        toolInput: {
          file_path: '/workspace/demo/PRD.md',
          content: '# 新 PRD\n\n第一段',
        },
      }),
    ],
    emittedKeys,
  );

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'file_change_preview_delta');
  assert.equal(events[0].operation.mode, 'write');
  assert.equal(events[0].operation.newText, '# 新 PRD\n\n第一段');
});
