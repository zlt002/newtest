import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildExpandedDirectoriesStorageKey,
  normalizeExpandedDirectories,
  serializeExpandedDirectories,
} from './expandedDirectoriesPersistence.ts';

test('buildExpandedDirectoriesStorageKey namespaces values by project name', () => {
  assert.equal(
    buildExpandedDirectoriesStorageKey('demo-project'),
    'fileTree.expandedDirectories.demo-project',
  );
});

test('serializeExpandedDirectories stores sorted unique directory paths', () => {
  const serialized = serializeExpandedDirectories(
    new Set(['/b', '/a', '/a']),
  );

  assert.equal(serialized, JSON.stringify(['/a', '/b']));
});

test('normalizeExpandedDirectories restores a set of directory paths from storage', () => {
  const restored = normalizeExpandedDirectories(JSON.stringify(['/a', '/b']));

  assert.deepEqual(Array.from(restored), ['/a', '/b']);
});

test('normalizeExpandedDirectories falls back to an empty set for invalid values', () => {
  assert.deepEqual(Array.from(normalizeExpandedDirectories('{"bad":true}')), []);
  assert.deepEqual(Array.from(normalizeExpandedDirectories('not-json')), []);
  assert.deepEqual(Array.from(normalizeExpandedDirectories(null)), []);
});
