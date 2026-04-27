import test from 'node:test';
import assert from 'node:assert/strict';

import { MARKDOWN_ANNOTATION_OVERLAY_SELECTOR, isEventFromMarkdownAnnotationOverlay } from './markdownAnnotationOverlayGuards.ts';

test('能识别来自标注浮层内部的事件目标', () => {
  const child = {
    closest: (selector) => (
      selector === '[data-markdown-annotation-overlay="true"]'
        ? { nodeName: 'DIV' }
        : null
    ),
  };

  assert.equal(isEventFromMarkdownAnnotationOverlay(child), true);
});

test('普通预览内容节点不应被识别为标注浮层事件', () => {
  const content = {
    closest: () => null,
  };

  assert.equal(isEventFromMarkdownAnnotationOverlay(content), false);
  assert.equal(MARKDOWN_ANNOTATION_OVERLAY_SELECTOR, '[data-markdown-annotation-overlay="true"]');
});
