import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';

import { createReleaseArchive, getDefaultArchiveName } from './archive-release.mjs';

test('getDefaultArchiveName returns the x64 archive filename', () => {
  assert.equal(
    getDefaultArchiveName('x64'),
    'cc-ui-windows-lite-x64.zip'
  );
});

test('getDefaultArchiveName returns the arm64 Mac Lite archive filename', () => {
  assert.equal(
    getDefaultArchiveName('arm64', 'mac'),
    'cc-ui-mac-lite-arm64.zip'
  );
});

test('createReleaseArchive writes a zip file for the release directory', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-lite-archive-'));
  const releaseDir = path.join(tempRoot, 'release', 'windows-lite');
  const outputFile = path.join(tempRoot, 'cc-ui-windows-lite-x64.zip');

  await mkdir(releaseDir, { recursive: true });
  await writeFile(path.join(releaseDir, 'package.json'), '{"name":"test"}\n', 'utf8');
  await writeFile(path.join(releaseDir, 'start.vbs'), 'CreateObject("WScript.Shell")\r\n', 'utf8');

  await createReleaseArchive({ releaseDir, outputFile });

  assert.ok(existsSync(outputFile));

  const archiveBuffer = await readFile(outputFile);
  assert.ok(archiveBuffer.length > 0);

  await rm(tempRoot, { recursive: true, force: true });
});

test('createReleaseArchive stores macOS command launchers as executable files', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'mac-lite-archive-'));
  const releaseDir = path.join(tempRoot, 'release', 'mac-lite');
  const outputFile = path.join(tempRoot, 'cc-ui-mac-lite-arm64.zip');

  await mkdir(releaseDir, { recursive: true });
  await writeFile(path.join(releaseDir, 'package.json'), '{"name":"test"}\n', 'utf8');
  await writeFile(path.join(releaseDir, 'start.command'), '#!/bin/bash\n', 'utf8');
  await writeFile(path.join(releaseDir, 'stop.command'), '#!/bin/bash\n', 'utf8');

  await createReleaseArchive({ releaseDir, outputFile });

  const zip = await JSZip.loadAsync(await readFile(outputFile));

  assert.equal(zip.file('mac-lite/start.command')?.unixPermissions, 0o100755);
  assert.equal(zip.file('mac-lite/stop.command')?.unixPermissions, 0o100755);

  await rm(tempRoot, { recursive: true, force: true });
});
