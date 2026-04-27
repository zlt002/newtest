import test from 'node:test';
import assert from 'node:assert/strict';

import MarkdownAnnotationHighlight from './MarkdownAnnotationHighlight.tsx';

const annotation = {
  id: 'annotation-1',
  startLine: 1,
  startColumn: 1,
  endLine: 1,
  endColumn: 4,
  selectedText: '测试',
  note: '需要修改',
  quoteHash: 'abcd1234',
  createdAt: '2026-04-15T00:00:00.000Z',
  updatedAt: '2026-04-15T00:00:00.000Z',
};

test('高亮区域可点击时应把首条标注 id 透出给回调', () => {
  const calls = [];
  const element = MarkdownAnnotationHighlight({
    text: '测试',
    annotations: [annotation],
    onActivate: (annotationId) => {
      calls.push(annotationId);
    },
  });

  assert.equal(typeof element.props.onClick, 'function');
  element.props.onClick();
  assert.deepEqual(calls, ['annotation-1']);
});
