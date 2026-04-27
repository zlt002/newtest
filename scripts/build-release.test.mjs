import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';

const RELEASE_RUNTIME_DEPENDENCIES = [
  '@anthropic-ai/claude-agent-sdk',
  '@octokit/rest',
  'better-sqlite3',
  'chokidar',
  'cors',
  'express',
  'gray-matter',
  'mime-types',
  'multer',
  'node-fetch',
  'sqlite',
  'ws',
];

function runNode(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${path.basename(scriptPath)} failed with code ${code ?? 'null'}${signal ? ` signal ${signal}` : ''}`));
    });
  });
}

test('package.json exposes an x64-only Windows Lite release script', async () => {
  const packageJson = JSON.parse(
    await readFile(path.resolve(process.cwd(), 'package.json'), 'utf8')
  );

  assert.equal(
    packageJson.scripts['release:windows-lite:x64'],
    'set "WINDOWS_LITE_TARGET_ARCH=x64" && node scripts/build-release.mjs && node scripts/prepare-release-node-modules.mjs && node scripts/prune-release-node-modules.mjs && node scripts/verify-release.mjs'
  );
});

test('package.json exposes an x64 Windows Lite zip script', async () => {
  const packageJson = JSON.parse(
    await readFile(path.resolve(process.cwd(), 'package.json'), 'utf8')
  );

  assert.equal(
    packageJson.scripts['release:windows-lite:x64:zip'],
    'npm run release:windows-lite:x64 && node scripts/archive-release.mjs --target=x64'
  );
});

test('project contains a Windows Lite launcher source directory', async () => {
  assert.ok(
    ['windows-lite', 'windows-lite2'].some((dirName) =>
      existsSync(path.resolve(process.cwd(), dirName, 'start.cmd')) &&
      existsSync(path.resolve(process.cwd(), dirName, 'start.vbs'))
    )
  );
});

test('build-release generates a runtime-only dependency whitelist', async () => {
  await runNode(path.resolve(process.cwd(), 'scripts/build-release.mjs'));

  const releasePackageJson = JSON.parse(
    await readFile(path.resolve(process.cwd(), 'release/windows-lite/package.json'), 'utf8')
  );

  assert.deepEqual(
    Object.keys(releasePackageJson.dependencies).sort(),
    [...RELEASE_RUNTIME_DEPENDENCIES].sort()
  );

  for (const dependency of ['@xterm/xterm', 'react', 'react-dom', 'typescript', 'i18next']) {
    assert.ok(
      !(dependency in releasePackageJson.dependencies),
      `release package.json should not include ${dependency}`
    );
  }

  for (const releaseFile of ['start.cmd', 'start.vbs', 'stop.cmd', 'stop.vbs', 'README.zh-CN.md']) {
    assert.ok(
      existsSync(path.resolve(process.cwd(), 'release/windows-lite', releaseFile)),
      `release root should contain ${releaseFile}`
    );
  }

  assert.ok(
    !existsSync(path.resolve(process.cwd(), 'release/windows-lite/windows-lite')),
    'release should not contain a nested windows-lite directory'
  );
});
