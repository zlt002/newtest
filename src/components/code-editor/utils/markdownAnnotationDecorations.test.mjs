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
    children: ['prefix ', createElement('strong', { key: 'strong' }, 'bold'), ' suffix'],
    annotations: [annotation],
    markdownSource: 'prefix **bold** suffix',
    sourceStartLine: 1,
    sourceStartColumn: 1,
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
