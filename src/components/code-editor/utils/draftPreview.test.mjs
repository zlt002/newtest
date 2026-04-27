import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyDraftPreviewOperation,
  applyDraftPreviewOperations,
  getFirstDraftPreviewAnchorLine,
} from './draftPreview.ts';

test('applyDraftPreviewOperation 对 Edit 只替换首个命中块', () => {
  assert.equal(
    applyDraftPreviewOperation('A A A', {
      toolId: 'tool-1',
      filePath: '/demo/file.md',
      timestamp: '2026-04-17T09:00:00.000Z',
      source: 'Edit',
      mode: 'replace',
      oldText: 'A',
      newText: 'B',
      replaceAll: false,
      status: 'pending',
      lineRange: null,
    }),
    'B A A',
  );
});

test('applyDraftPreviewOperation 对 Write 直接覆盖全文', () => {
  assert.equal(
    applyDraftPreviewOperation('旧内容', {
      toolId: 'tool-2',
      filePath: '/demo/file.md',
      timestamp: '2026-04-17T09:00:00.000Z',
      source: 'Write',
      mode: 'write',
      newText: '新内容',
      status: 'pending',
      lineRange: null,
    }),
    '新内容',
  );
});

test('applyDraftPreviewOperations 按时间顺序叠加多个编辑块', () => {
  assert.equal(
    applyDraftPreviewOperations('标题\n旧段落\n结尾', [
      {
        toolId: 'tool-2',
        filePath: '/demo/file.md',
        timestamp: '2026-04-17T09:00:02.000Z',
        source: 'Edit',
        mode: 'replace',
        oldText: '结尾',
        newText: '新结尾',
        replaceAll: false,
        status: 'pending',
        lineRange: null,
      },
      {
        toolId: 'tool-1',
        filePath: '/demo/file.md',
        timestamp: '2026-04-17T09:00:01.000Z',
        source: 'Edit',
        mode: 'replace',
        oldText: '旧段落',
        newText: '新段落',
        replaceAll: false,
        status: 'pending',
        lineRange: null,
      },
    ]),
    '标题\n新段落\n新结尾',
  );
});

test('getFirstDraftPreviewAnchorLine 返回最终文档里最靠前的改动位置，而不是最早事件时间', () => {
  assert.equal(
    getFirstDraftPreviewAnchorLine('新的尾部\n中段\n新的开头', [
      {
        toolId: 'tool-2',
        filePath: '/demo/file.md',
        timestamp: '2026-04-17T09:00:02.000Z',
        source: 'Edit',
        mode: 'replace',
        oldText: '开头',
        newText: '新的开头',
        replaceAll: false,
        status: 'pending',
        lineRange: null,
      },
      {
        toolId: 'tool-1',
        filePath: '/demo/file.md',
        timestamp: '2026-04-17T09:00:01.000Z',
        source: 'Edit',
        mode: 'replace',
        oldText: '尾部',
        newText: '新的尾部',
        replaceAll: false,
        status: 'pending',
        lineRange: null,
      },
    ]),
    1,
  );
});

test('getFirstDraftPreviewAnchorLine 优先使用显式 lineRange', () => {
  assert.equal(
    getFirstDraftPreviewAnchorLine('第一段\n第二段\n第三段', [
      {
        toolId: 'tool-1',
        filePath: '/demo/file.md',
        timestamp: '2026-04-17T09:00:01.000Z',
        source: 'Edit',
        mode: 'replace',
        oldText: '第三段',
        newText: '新的第三段',
        replaceAll: false,
        status: 'pending',
        lineRange: { startLine: 3, endLine: 3 },
      },
      {
        toolId: 'tool-2',
        filePath: '/demo/file.md',
        timestamp: '2026-04-17T09:00:02.000Z',
        source: 'Edit',
        mode: 'replace',
        oldText: '第二段',
        newText: '新的第二段',
        replaceAll: false,
        status: 'pending',
        lineRange: { startLine: 2, endLine: 2 },
      },
    ]),
    2,
  );
});
