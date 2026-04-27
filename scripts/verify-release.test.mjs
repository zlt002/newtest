import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { hasBetterSqlite3Binary } from './verify-release.mjs';

test('hasBetterSqlite3Binary returns false when no native binary exists', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'verify-release-better-sqlite3-missing-'));
  const releaseRoot = path.join(tempRoot, 'release', 'windows-lite');

  await mkdir(path.join(releaseRoot, 'node_modules', 'better-sqlite3', 'lib'), { recursive: true });
  await writeFile(
    path.join(releaseRoot, 'node_modules', 'better-sqlite3', 'package.json'),
    '{"name":"better-sqlite3"}\n',
    'utf8'
  );

  assert.equal(await hasBetterSqlite3Binary(releaseRoot), false);

  await rm(tempRoot, { recursive: true, force: true });
});

test('hasBetterSqlite3Binary returns true when a native binary exists', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'verify-release-better-sqlite3-present-'));
  const releaseRoot = path.join(tempRoot, 'release', 'windows-lite');
  const bindingDir = path.join(
    releaseRoot,
    'node_modules',
    'better-sqlite3',
    'lib',
    'binding',
    'node-v137-win32-x64'
  );

  await mkdir(bindingDir, { recursive: true });
  await writeFile(path.join(bindingDir, 'better_sqlite3.node'), '', 'utf8');

  assert.equal(await hasBetterSqlite3Binary(releaseRoot), true);

  await rm(tempRoot, { recursive: true, force: true });
});
