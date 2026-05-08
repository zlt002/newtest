import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { overlayWindowsLiteBetterSqlite3 } from './prepare-release-node-modules.mjs';

test('overlayWindowsLiteBetterSqlite3 replaces installed better-sqlite3 with the Windows Lite preset', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-lite-better-sqlite3-overlay-'));
  const sourceDir = path.join(tempRoot, 'windows-lite', 'better-sqlite3');
  const releaseDir = path.join(tempRoot, 'release', 'windows-lite');
  const installedDir = path.join(releaseDir, 'node_modules', 'better-sqlite3');

  await mkdir(path.join(sourceDir, 'build', 'Release'), { recursive: true });
  await mkdir(path.join(installedDir, 'build', 'Release'), { recursive: true });
  await writeFile(path.join(sourceDir, 'package.json'), '{"name":"better-sqlite3","preset":true}\n', 'utf8');
  await writeFile(path.join(sourceDir, 'build', 'Release', 'better_sqlite3.node'), 'windows preset', 'utf8');
  await writeFile(path.join(installedDir, 'package.json'), '{"name":"better-sqlite3","preset":false}\n', 'utf8');
  await writeFile(path.join(installedDir, 'old-native.node'), 'old binary', 'utf8');

  const overlaid = await overlayWindowsLiteBetterSqlite3({ projectRoot: tempRoot, releaseDir });

  assert.equal(overlaid, true);
  assert.equal(
    await readFile(path.join(installedDir, 'package.json'), 'utf8'),
    '{"name":"better-sqlite3","preset":true}\n'
  );
  assert.equal(
    await readFile(path.join(installedDir, 'build', 'Release', 'better_sqlite3.node'), 'utf8'),
    'windows preset'
  );
  assert.equal(existsSync(path.join(installedDir, 'old-native.node')), false);

  await rm(tempRoot, { recursive: true, force: true });
});

test('overlayWindowsLiteBetterSqlite3 leaves installed dependency untouched when no preset exists', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-lite-better-sqlite3-missing-'));
  const releaseDir = path.join(tempRoot, 'release', 'windows-lite');
  const installedDir = path.join(releaseDir, 'node_modules', 'better-sqlite3');

  await mkdir(installedDir, { recursive: true });
  await writeFile(path.join(installedDir, 'package.json'), '{"name":"better-sqlite3","preset":false}\n', 'utf8');

  const overlaid = await overlayWindowsLiteBetterSqlite3({ projectRoot: tempRoot, releaseDir });

  assert.equal(overlaid, false);
  assert.equal(
    await readFile(path.join(installedDir, 'package.json'), 'utf8'),
    '{"name":"better-sqlite3","preset":false}\n'
  );

  await rm(tempRoot, { recursive: true, force: true });
});

test('overlayWindowsLiteBetterSqlite3 does not replace better-sqlite3 for Mac Lite', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'mac-lite-better-sqlite3-skip-'));
  const sourceDir = path.join(tempRoot, 'windows-lite', 'better-sqlite3');
  const releaseDir = path.join(tempRoot, 'release', 'mac-lite');
  const installedDir = path.join(releaseDir, 'node_modules', 'better-sqlite3');

  await mkdir(sourceDir, { recursive: true });
  await mkdir(installedDir, { recursive: true });
  await writeFile(path.join(sourceDir, 'package.json'), '{"name":"better-sqlite3","preset":true}\n', 'utf8');
  await writeFile(path.join(installedDir, 'package.json'), '{"name":"better-sqlite3","preset":false}\n', 'utf8');

  const overlaid = await overlayWindowsLiteBetterSqlite3({
    projectRoot: tempRoot,
    releaseDir,
    distribution: 'mac',
  });

  assert.equal(overlaid, false);
  assert.equal(
    await readFile(path.join(installedDir, 'package.json'), 'utf8'),
    '{"name":"better-sqlite3","preset":false}\n'
  );

  await rm(tempRoot, { recursive: true, force: true });
});
