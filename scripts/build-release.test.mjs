import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
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
  'jszip',
  'mime-types',
  'multer',
  'node-fetch',
  'sqlite',
  'ws',
];

function runNode(scriptPath, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
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
    'node scripts/bump-release-version.mjs && npm run build && npm run release:windows-lite:x64 && node scripts/archive-release.mjs --target=x64'
  );
});

test('package.json exposes an arm64 Mac Lite zip script', async () => {
  const packageJson = JSON.parse(
    await readFile(path.resolve(process.cwd(), 'package.json'), 'utf8')
  );

  assert.equal(
    packageJson.scripts['release:mac-lite:arm64'],
    'LITE_DISTRIBUTION=mac LITE_TARGET_ARCH=arm64 node scripts/build-release.mjs && LITE_DISTRIBUTION=mac node scripts/prepare-release-node-modules.mjs && LITE_DISTRIBUTION=mac node scripts/prune-release-node-modules.mjs && LITE_DISTRIBUTION=mac node scripts/verify-release.mjs'
  );
  assert.equal(
    packageJson.scripts['release:mac-lite:arm64:zip'],
    'node scripts/bump-release-version.mjs && npm run build && npm run release:mac-lite:arm64 && LITE_DISTRIBUTION=mac node scripts/archive-release.mjs --target=arm64'
  );
});

test('project contains a Windows Lite launcher source directory', async () => {
  assert.ok(
    ['windows-lite', 'windows-lite2'].some((dirName) =>
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

  for (const dependency of ['react', 'react-dom', 'typescript', 'i18next']) {
    assert.ok(
      !(dependency in releasePackageJson.dependencies),
      `release package.json should not include ${dependency}`
    );
  }

  for (const releaseFile of ['start.vbs', 'stop.vbs', 'README.zh-CN.md']) {
    assert.ok(
      existsSync(path.resolve(process.cwd(), 'release/windows-lite', releaseFile)),
      `release root should contain ${releaseFile}`
    );
  }

  const releaseStartVbs = await readFile(path.resolve(process.cwd(), 'release/windows-lite/start.vbs'), 'utf8');
  assert.match(
    releaseStartVbs,
    /shell\.Run command, 0, False/,
    'Windows Lite start.vbs should keep the server window hidden'
  );
  assert.match(
    releaseStartVbs,
    /shell\.Run appUrl, 1, False/,
    'Windows Lite start.vbs should open the browser after the service is ready'
  );
  assert.match(
    releaseStartVbs,
    /Check logs\\server\.log/,
    'Windows Lite start.vbs should show a useful error if the service never becomes ready'
  );

  for (const releaseFile of ['start.cmd', 'stop.cmd']) {
    assert.ok(
      !existsSync(path.resolve(process.cwd(), 'release/windows-lite', releaseFile)),
      `release root should not contain ${releaseFile}`
    );
  }

  assert.ok(
    !existsSync(path.resolve(process.cwd(), 'release/windows-lite/windows-lite')),
    'release should not contain a nested windows-lite directory'
  );

  assert.ok(
    !existsSync(path.resolve(process.cwd(), 'release/windows-lite/better-sqlite3')),
    'release root should not contain the better-sqlite3 overlay source directory'
  );
});

test('build-release generates a Mac Lite runtime package', async () => {
  await runNode(path.resolve(process.cwd(), 'scripts/build-release.mjs'), {
    LITE_DISTRIBUTION: 'mac',
    LITE_TARGET_ARCH: 'arm64',
  });

  const releaseRoot = path.resolve(process.cwd(), 'release/mac-lite');
  const releasePackageJson = JSON.parse(
    await readFile(path.resolve(releaseRoot, 'package.json'), 'utf8')
  );

  assert.equal(releasePackageJson.name, 'cc-ui-mac-lite');
  assert.deepEqual(
    Object.keys(releasePackageJson.dependencies).sort(),
    [...RELEASE_RUNTIME_DEPENDENCIES].sort()
  );

  for (const releaseFile of ['start.command', 'stop.command', 'README.zh-CN.md']) {
    assert.ok(
      existsSync(path.resolve(releaseRoot, releaseFile)),
      `Mac Lite release root should contain ${releaseFile}`
    );
  }

  for (const releaseFile of ['start.command', 'stop.command']) {
    const mode = (await stat(path.resolve(releaseRoot, releaseFile))).mode & 0o777;
    assert.equal(mode, 0o755, `Mac Lite ${releaseFile} should be executable`);
  }

  for (const releaseFile of ['start.vbs', 'stop.vbs', 'better-sqlite3']) {
    assert.ok(
      !existsSync(path.resolve(releaseRoot, releaseFile)),
      `Mac Lite release root should not contain ${releaseFile}`
    );
  }
});
