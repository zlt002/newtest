import test from 'node:test';
import assert from 'node:assert/strict';

import { RELEASE_RUNTIME_DEPENDENCIES } from './release-manifest.mjs';

test('windows lite runtime dependency whitelist includes better-sqlite3', () => {
  assert.ok(
    RELEASE_RUNTIME_DEPENDENCIES.includes('better-sqlite3'),
    'expected better-sqlite3 to be shipped in the Windows Lite runtime dependency whitelist'
  );
});

test('windows lite runtime dependency whitelist includes jszip', () => {
  assert.ok(
    RELEASE_RUNTIME_DEPENDENCIES.includes('jszip'),
    'expected jszip to be shipped because server/windows-lite-update.js imports it at runtime'
  );
});
