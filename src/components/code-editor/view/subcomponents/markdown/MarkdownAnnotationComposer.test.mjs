import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const tsxLoaderUrl = new URL('../tsx-loader.mjs', import.meta.url).href;

register(tsxLoaderUrl, import.meta.url);

const { default: MarkdownAnnotationComposer } = await import('./MarkdownAnnotationComposer.tsx');

function renderComposer(overrides = {}) {
  return renderToStaticMarkup(
    React.createElement(MarkdownAnnotationComposer, {
      isOpen: true,
      position: { x: 12, y: 24 },
      selectedText: '默认选中文本',
      note: '',
      onNoteChange: () => {},
      onSave: () => {},
      onCancel: () => {},
      ...overrides,
    }),
  );
}

test('MarkdownAnnotationComposer 对长选中文本默认折叠并提供查看全部入口', () => {
  const markup = renderComposer({
    selectedText: '第一行\n第二行\n第三行\n第四行',
  });

  assert.match(markup, /line-clamp-3/);
  assert.match(markup, />查看全部</);
});

test('MarkdownAnnotationComposer 对短选中文本不显示查看全部入口', () => {
  const markup = renderComposer({
    selectedText: '短文本',
  });

  assert.doesNotMatch(markup, />查看全部</);
});
