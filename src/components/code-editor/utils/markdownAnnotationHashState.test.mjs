import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isMarkdownAnnotationDocumentChanged,
  shouldCaptureLegacyAnnotationBaselineHash,
} from './markdownAnnotationHashState.ts';

test('captures a legacy baseline only when old annotations are fully matched', () => {
  assert.equal(
    shouldCaptureLegacyAnnotationBaselineHash({
      annotationCount: 2,
      invalidAnnotationCount: 0,
    }),
    true,
  );

  assert.equal(
    shouldCaptureLegacyAnnotationBaselineHash({
      annotationCount: 2,
      invalidAnnotationCount: 1,
    }),
    false,
  );
});

test('does not capture a legacy baseline when a stored hash or cached baseline already exists', () => {
  assert.equal(
    shouldCaptureLegacyAnnotationBaselineHash({
      storedFileHash: 'stored',
      annotationCount: 2,
      invalidAnnotationCount: 0,
    }),
    false,
  );

  assert.equal(
    shouldCaptureLegacyAnnotationBaselineHash({
      legacyBaselineHash: 'cached',
      annotationCount: 2,
      invalidAnnotationCount: 0,
    }),
    false,
  );
});

test('detects content changes from either a stored hash or a legacy baseline hash', () => {
  assert.equal(
    isMarkdownAnnotationDocumentChanged({
      storedFileHash: 'abc',
      contentHash: 'def',
    }),
    true,
  );

  assert.equal(
    isMarkdownAnnotationDocumentChanged({
      legacyBaselineHash: 'abc',
      contentHash: 'abc',
    }),
    false,
  );
});
