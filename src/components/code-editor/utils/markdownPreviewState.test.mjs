import test from 'node:test';
import assert from 'node:assert/strict';

import { getDefaultMarkdownPreview, isMarkdownFileName } from './markdownPreviewState.ts';

test('识别 Markdown 文件扩展名', () => {
  assert.equal(isMarkdownFileName('README.md'), true);
  assert.equal(isMarkdownFileName('guide.markdown'), true);
  assert.equal(isMarkdownFileName('notes.txt'), false);
});

test('Markdown 文件默认打开可视化预览', () => {
  assert.equal(getDefaultMarkdownPreview('README.md'), true);
  assert.equal(getDefaultMarkdownPreview('guide.markdown'), true);
  assert.equal(getDefaultMarkdownPreview('notes.txt'), false);
});
