import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createReleaseArchive, getDefaultArchiveName } from './archive-release.mjs';

test('getDefaultArchiveName returns the x64 archive filename', () => {
  assert.equal(
    getDefaultArchiveName('x64'),
    'cloudcli-windows-lite-x64.zip'
  );
});

test('createReleaseArchive writes a zip file for the release directory', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-lite-archive-'));
  const releaseDir = path.join(tempRoot, 'release', 'windows-lite');
  const outputFile = path.join(tempRoot, 'cloudcli-windows-lite-x64.zip');

  await mkdir(releaseDir, { recursive: true });
  await writeFile(path.join(releaseDir, 'package.json'), '{"name":"test"}\n', 'utf8');
  await writeFile(path.join(releaseDir, 'start.cmd'), '@echo off\r\n', 'utf8');

  await createReleaseArchive({ releaseDir, outputFile });

  assert.ok(existsSync(outputFile));

  const archiveBuffer = await readFile(outputFile);
  assert.ok(archiveBuffer.length > 0);

  await rm(tempRoot, { recursive: true, force: true });
});
