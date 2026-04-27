import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMarkdownCodeBlock,
  shouldRenderMermaidBlock,
} from './mermaidCodeBlock.ts';

test('parseMarkdownCodeBlock 识别 mermaid fenced code block', () => {
  assert.deepEqual(
    parseMarkdownCodeBlock({
      inline: false,
      className: 'language-mermaid',
      rawContent: 'flowchart TD\nA-->B\n',
    }),
    {
      rawContent: 'flowchart TD\nA-->B\n',
      looksMultiline: true,
      shouldRenderInline: false,
      language: 'mermaid',
    },
  );
});

test('shouldRenderMermaidBlock 仅在非 inline 且语言为 mermaid 时返回 true', () => {
  assert.equal(shouldRenderMermaidBlock({
    inline: false,
    className: 'language-mermaid',
    rawContent: 'flowchart TD\nA-->B\n',
  }), true);

  assert.equal(shouldRenderMermaidBlock({
    inline: true,
    className: 'language-mermaid',
    rawContent: 'flowchart TD\nA-->B\n',
  }), false);

  assert.equal(shouldRenderMermaidBlock({
    inline: false,
    className: 'language-ts',
    rawContent: 'const a = 1;\n',
  }), false);
});
