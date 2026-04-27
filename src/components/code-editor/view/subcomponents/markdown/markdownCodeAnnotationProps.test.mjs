import test from 'node:test';
import assert from 'node:assert/strict';

import { getMarkdownCodeAnnotationProps } from './markdownCodeAnnotationProps.ts';

test('行内 code 不应被标记为禁用标注', () => {
  assert.deepEqual(
    getMarkdownCodeAnnotationProps({ shouldRenderInline: true }),
    {},
  );
});

test('代码块不应再被标记为禁用标注', () => {
  assert.deepEqual(
    getMarkdownCodeAnnotationProps({ shouldRenderInline: false }),
    {},
  );
});
