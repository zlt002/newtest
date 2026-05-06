import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMarkdownFileTarget } from './markdownFileLink.ts';

test('resolveMarkdownFileTarget 识别 file 协议并还原本地文件路径', () => {
  assert.deepEqual(
    resolveMarkdownFileTarget('file:///Users/zhanglt21/Desktop/prd/pmd-workspace/spec/req_1/prototype-contract-list.html'),
    {
      filePath: '/Users/zhanglt21/Desktop/prd/pmd-workspace/spec/req_1/prototype-contract-list.html',
      fileName: 'prototype-contract-list.html',
    },
  );
});

test('resolveMarkdownFileTarget 忽略普通网页链接', () => {
  assert.equal(resolveMarkdownFileTarget('https://example.com/demo'), null);
});
