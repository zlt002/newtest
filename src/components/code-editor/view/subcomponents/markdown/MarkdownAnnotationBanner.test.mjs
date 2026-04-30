import test from 'node:test';
import assert from 'node:assert/strict';

import MarkdownAnnotationBanner from './MarkdownAnnotationBanner.tsx';

test('banner defaults to a neutral remapping warning', () => {
  const element = MarkdownAnnotationBanner({ invalidCount: 2 });
  assert.equal(element.props.children, '有 2 条标注当前无法重新定位，可能是原文变更或选区映射偏移导致。');
});

test('banner shows a stronger message when the document content hash changed', () => {
  const element = MarkdownAnnotationBanner({ invalidCount: 1, isDocumentContentChanged: true });
  assert.equal(element.props.children, '当前文档内容已变更，有 1 条历史标注未能匹配。');
});
