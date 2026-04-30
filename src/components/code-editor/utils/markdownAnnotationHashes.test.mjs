import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStableTextHash } from './markdownAnnotationHashes.ts';

test('buildStableTextHash returns a stable hash for the same content', () => {
  assert.equal(buildStableTextHash('银发守护'), buildStableTextHash('银发守护'));
});

test('buildStableTextHash returns different hashes for different content', () => {
  assert.notEqual(buildStableTextHash('银发守护'), buildStableTextHash('邻里帮'));
});
