import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import MarkdownCodeBlock from './MarkdownCodeBlock.tsx';

test('可以在 fenced code block 中渲染标注高亮', () => {
  const html = renderToStaticMarkup(
    createElement(MarkdownCodeBlock, {
      inline: false,
      className: 'language-ts',
      markdownContent: '```ts\nconst alpha = 1;\nconst beta = 2;\n```',
      annotations: [{
        id: 'annotation-code-block',
        startLine: 2,
        startColumn: 7,
        endLine: 3,
        endColumn: 11,
        selectedText: 'alpha = 1;\nconst beta',
        note: '跨代码行',
        quoteHash: 'hash-code-block',
        createdAt: '2026-04-30T00:00:00.000Z',
        updatedAt: '2026-04-30T00:00:00.000Z',
      }],
      node: {
        position: {
          start: { line: 1, column: 1 },
          end: { line: 4, column: 4 },
        },
      },
    }, 'const alpha = 1;\nconst beta = 2;\n'),
  );

  assert.match(html, /<mark/);
  assert.match(html, /alpha = 1;/);
  assert.match(html, /const beta/);
});
