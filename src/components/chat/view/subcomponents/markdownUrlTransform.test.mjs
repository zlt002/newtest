import test from 'node:test';
import assert from 'node:assert/strict';
import { preserveMarkdownHref } from './markdownUrlTransform.ts';

test('preserveMarkdownHref 保留 file 协议绝对路径', () => {
  assert.equal(
    preserveMarkdownHref('file:///Users/demo/pmd-workspace/spec/req_1/prd.md'),
    'file:///Users/demo/pmd-workspace/spec/req_1/prd.md',
  );
});

test('preserveMarkdownHref 保持普通相对链接不变', () => {
  assert.equal(preserveMarkdownHref('prototype-contract-list.html'), 'prototype-contract-list.html');
});

test('preserveMarkdownHref 继续拦截危险协议', () => {
  assert.equal(preserveMarkdownHref('javascript:alert(1)'), '');
});
