import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatMarkdownAnnotationsForChat,
  formatMarkdownAnnotationPromptItemsForChat,
} from './markdownAnnotationPrompt.ts';

test('formats markdown annotations into a chat-ready revision prompt', () => {
  const prompt = formatMarkdownAnnotationsForChat({
    fileName: 'prd.md',
    filePath: 'docs/prd.md',
    annotations: [
      {
        id: 'annotation-1',
        startLine: 3,
        startColumn: 1,
        endLine: 3,
        endColumn: 8,
        selectedText: '旧标题',
        note: '改成更明确的标题',
        quoteHash: 'hash-1',
        createdAt: '2026-04-15T00:00:00.000Z',
        updatedAt: '2026-04-15T00:00:00.000Z',
      },
    ],
  });

  assert.match(prompt, /请根据以下 Markdown 标注修改文件 `prd\.md`。/);
  assert.match(prompt, /文件路径：`docs\/prd\.md`/);
  assert.match(prompt, /范围：3:1-3:8/);
  assert.match(prompt, /选中文本："""旧标题"""/);
  assert.match(prompt, /标注说明：改成更明确的标题/);
});

test('formats unsaved annotation draft content into a chat-ready revision prompt', () => {
  const prompt = formatMarkdownAnnotationPromptItemsForChat({
    fileName: 'prd.md',
    filePath: 'docs/prd.md',
    annotations: [
      {
        startLine: 8,
        startColumn: 3,
        endLine: 8,
        endColumn: 10,
        selectedText: '旧描述',
        note: '这里补充具体的交付范围',
      },
    ],
  });

  assert.match(prompt, /范围：8:3-8:10/);
  assert.match(prompt, /选中文本："""旧描述"""/);
  assert.match(prompt, /标注说明：这里补充具体的交付范围/);
});
