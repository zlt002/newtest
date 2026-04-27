import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  WINDOWS_LITE_PUBLIC_ITEMS,
  WINDOWS_LITE_PRUNE_TARGETS,
  getWindowsLitePruneTargets,
  collectPrunableFiles,
} from './windows-lite-optimization.mjs';

test('windows-lite public whitelist keeps only runtime assets', () => {
  assert.deepEqual(
    WINDOWS_LITE_PUBLIC_ITEMS,
    ['favicon.png', 'favicon.svg', 'icons']
  );
});

test('windows-lite prune targets remove non-Windows ripgrep vendors', () => {
  const ripgrepTargets = WINDOWS_LITE_PRUNE_TARGETS.filter((target) =>
    target.includes('@anthropic-ai/claude-agent-sdk/vendor/ripgrep/')
  );

  assert.deepEqual(ripgrepTargets.sort(), [
    'node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/arm64-darwin',
    'node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/arm64-linux',
    'node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/x64-darwin',
    'node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/x64-linux',
  ]);
});

test('windows-lite x64 prune targets remove Windows arm64 ripgrep vendor only', () => {
  const ripgrepTargets = getWindowsLitePruneTargets('x64').filter((target) =>
    target.includes('@anthropic-ai/claude-agent-sdk/vendor/ripgrep/')
  );

  assert.ok(
    ripgrepTargets.includes('node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/arm64-win32')
  );
  assert.ok(
    !ripgrepTargets.includes('node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/x64-win32')
  );
});

test('collectPrunableFiles finds type and sourcemap files under node_modules', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'windows-lite-prune-'));
  const packageDir = path.join(tempRoot, 'node_modules', 'example-package');
  await mkdir(path.join(packageDir, 'nested'), { recursive: true });

  const keepFile = path.join(packageDir, 'index.js');
  const typeFile = path.join(packageDir, 'index.d.ts');
  const mapFile = path.join(packageDir, 'nested', 'index.js.map');

  await writeFile(keepFile, 'export const value = 1;\n', 'utf8');
  await writeFile(typeFile, 'export declare const value: number;\n', 'utf8');
  await writeFile(mapFile, '{}\n', 'utf8');

  const prunableFiles = await collectPrunableFiles(tempRoot);

  assert.deepEqual(
    prunableFiles
      .map((filePath) => path.relative(tempRoot, filePath).replaceAll('\\', '/'))
      .sort(),
    [
      'node_modules/example-package/index.d.ts',
      'node_modules/example-package/nested/index.js.map',
    ]
  );
});
