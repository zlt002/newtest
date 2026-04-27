import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMarkdownAnnotationHighlightSegments,
  countInvalidMarkdownAnnotations,
  resolveMarkdownAnnotationMatch,
} from './markdownAnnotationHighlights.ts';

const annotation = {
  id: 'annotation-1',
  startLine: 4,
  startColumn: 7,
  endLine: 4,
  endColumn: 12,
  selectedText: 'world',
  note: 'clarify wording',
  quoteHash: 'hash-world',
  createdAt: '2026-04-15T00:00:00.000Z',
  updatedAt: '2026-04-15T00:00:00.000Z',
};

test('resolveMarkdownAnnotationMatch returns offsets for a valid node-local annotation', () => {
  assert.deepEqual(
    resolveMarkdownAnnotationMatch({
      annotation,
      sourceText: 'hello world',
      sourceStartLine: 4,
      sourceStartColumn: 1,
    }),
    {
      annotation,
      startOffset: 6,
      endOffset: 11,
    },
  );
});

test('resolveMarkdownAnnotationMatch returns null when the saved text no longer matches', () => {
  assert.equal(
    resolveMarkdownAnnotationMatch({
      annotation,
      sourceText: 'hello there',
      sourceStartLine: 4,
      sourceStartColumn: 1,
    }),
    null,
  );
});

test('buildMarkdownAnnotationHighlightSegments splits text around matched annotations', () => {
  assert.deepEqual(
    buildMarkdownAnnotationHighlightSegments({
      annotations: [annotation],
      sourceText: 'hello world',
      sourceStartLine: 4,
      sourceStartColumn: 1,
    }),
    [
      {
        text: 'hello ',
        annotations: [],
      },
      {
        text: 'world',
        annotations: [annotation],
      },
    ],
  );
});

test('countInvalidMarkdownAnnotations counts annotations that cannot be remapped onto any safe node', () => {
  assert.equal(
    countInvalidMarkdownAnnotations({
      annotations: [
        annotation,
        {
          ...annotation,
          id: 'annotation-2',
          selectedText: 'missing',
          note: 'stale',
        },
      ],
      sourceNodes: [
        {
          sourceText: 'hello world',
          sourceStartLine: 4,
          sourceStartColumn: 1,
        },
      ],
    }),
    1,
  );
});
