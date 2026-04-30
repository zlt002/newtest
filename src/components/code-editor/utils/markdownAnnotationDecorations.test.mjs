import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement, isValidElement } from 'react';

import { decorateMarkdownAnnotationChildren } from './markdownAnnotationDecorations.tsx';

const annotation = {
  id: 'annotation-1',
  startLine: 1,
  startColumn: 10,
  endLine: 1,
  endColumn: 14,
  selectedText: 'bold',
  note: '强调这里',
  quoteHash: 'hash-bold',
  createdAt: '2026-04-15T00:00:00.000Z',
  updatedAt: '2026-04-15T00:00:00.000Z',
};

test('可以在嵌套的 strong 文本中插入高亮节点', () => {
  const decorated = decorateMarkdownAnnotationChildren({
    content: 'prefix **bold** suffix',
    children: ['prefix ', createElement('strong', { key: 'strong' }, 'bold'), ' suffix'],
    annotations: [annotation],
    markdownSource: 'prefix **bold** suffix',
    sourceStartLine: 1,
    sourceStartColumn: 1,
    sourceEndLine: 1,
    sourceEndColumn: 23,
    focusedAnnotationId: null,
    onActivate: null,
  });

  const parts = Array.isArray(decorated) ? decorated : [decorated];
  const strongNode = parts.find((part) => isValidElement(part) && part.type === 'strong');

  assert.ok(isValidElement(strongNode));
  const strongChildren = Array.isArray(strongNode.props.children)
    ? strongNode.props.children
    : [strongNode.props.children];
  const highlightNode = strongChildren.find((child) => isValidElement(child) && child.props.text === 'bold');

  assert.ok(isValidElement(highlightNode));
  assert.equal(highlightNode.props.text, 'bold');
});

test('可以高亮跨多个相邻列表项落在当前列表项内的文本片段', () => {
  const decorated = decorateMarkdownAnnotationChildren({
    content: '- 第一项内容\n- 第二项内容',
    children: ['第二项内容'],
    annotations: [{
      id: 'annotation-cross-list-items',
      startLine: 1,
      startColumn: 5,
      endLine: 2,
      endColumn: 6,
      selectedText: '第一项内容\n第二项',
      note: '跨列表项',
      quoteHash: 'hash-cross-list-items',
      createdAt: '2026-04-30T00:00:00.000Z',
      updatedAt: '2026-04-30T00:00:00.000Z',
    }],
    markdownSource: '- 第二项内容',
    sourceStartLine: 2,
    sourceStartColumn: 1,
    sourceEndLine: 2,
    sourceEndColumn: 8,
    focusedAnnotationId: null,
    onActivate: null,
  });

  const parts = Array.isArray(decorated) ? decorated.flat(Infinity) : [decorated];
  const highlightNode = parts.find((part) => isValidElement(part) && part.props.text === '第二项');

  assert.ok(isValidElement(highlightNode));
  assert.equal(highlightNode.props.text, '第二项');
});

test('可以高亮跨多个相邻表格单元格落在当前单元格内的文本片段', () => {
  const decorated = decorateMarkdownAnnotationChildren({
    content: '| 第一格 | 第二格 |',
    children: ['第二格'],
    annotations: [{
      id: 'annotation-cross-table-cells',
      startLine: 1,
      startColumn: 5,
      endLine: 1,
      endColumn: 11,
      selectedText: '格 第二',
      note: '跨表格单元格',
      quoteHash: 'hash-cross-table-cells',
      createdAt: '2026-04-30T00:00:00.000Z',
      updatedAt: '2026-04-30T00:00:00.000Z',
    }],
    markdownSource: '| 第二格 |',
    sourceStartLine: 1,
    sourceStartColumn: 7,
    sourceEndLine: 1,
    sourceEndColumn: 14,
    focusedAnnotationId: null,
    onActivate: null,
  });

  const parts = Array.isArray(decorated) ? decorated.flat(Infinity) : [decorated];
  const highlightNode = parts.find((part) => isValidElement(part) && part.props.text === '第二');

  assert.ok(isValidElement(highlightNode));
  assert.equal(highlightNode.props.text, '第二');
});
