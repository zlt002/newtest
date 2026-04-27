import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  buildClaudeCodeChildEnv,
  parseNodeMajorVersion,
  prependPathEntry,
  resolveClaudeWorkingDirectory,
  resolvePreferredNodeCommand,
  resolvePreferredClaudeNodeBinDir,
  supportsClaudeCodeRuntime,
} from './claude-code-runtime.js';

test('parseNodeMajorVersion extracts the major component from semver strings', () => {
  assert.equal(parseNodeMajorVersion('v22.22.2'), 22);
  assert.equal(parseNodeMajorVersion('18.15.0'), 18);
  assert.equal(parseNodeMajorVersion('invalid'), null);
});

test('supportsClaudeCodeRuntime requires Node 20+ regardless of local polyfills', () => {
  assert.equal(supportsClaudeCodeRuntime({ nodeVersion: 'v18.15.0' }), false);
  assert.equal(supportsClaudeCodeRuntime({ nodeVersion: 'v22.22.2' }), true);
});

test('prependPathEntry prepends without duplicating the same bin directory', () => {
  const joined = prependPathEntry('/usr/bin:/bin', '/custom/bin', ':');
  assert.equal(joined, '/custom/bin:/usr/bin:/bin');

  const deduped = prependPathEntry('/custom/bin:/usr/bin', '/custom/bin', ':');
  assert.equal(deduped, '/custom/bin:/usr/bin');
});

test('resolvePreferredClaudeNodeBinDir prefers the current runtime when it is already compatible', () => {
  const runtimeDir = path.join(path.sep, 'runtime', 'bin');
  const runtimeNodePath = path.join(runtimeDir, process.platform === 'win32' ? 'node.exe' : 'node');
  const resolved = resolvePreferredClaudeNodeBinDir({
    currentNodeVersion: 'v22.22.2',
    currentExecPath: runtimeNodePath,
    runCommand: () => ({ status: 0, stdout: 'v22.22.2\n' }),
    fileExists: (targetPath) => targetPath === runtimeNodePath,
    resolveRealPath: (targetPath) => targetPath,
  });

  assert.equal(resolved, runtimeDir);
});

test('resolvePreferredClaudeNodeBinDir falls back to the claude sibling node when current runtime is too old', () => {
  const legacyDir = process.platform === 'win32' ? 'C:\\legacy\\bin' : '/legacy/bin';
  const modernDir = process.platform === 'win32' ? 'C:\\modern\\bin' : '/modern/bin';
  const legacyNodePath = path.join(legacyDir, process.platform === 'win32' ? 'node.exe' : 'node');
  const modernNodePath = path.join(modernDir, process.platform === 'win32' ? 'node.exe' : 'node');
  const claudeShimPath = process.platform === 'win32' ? 'C:\\shim\\claude.cmd' : '/shim/claude';
  const claudeRealPath = process.platform === 'win32'
    ? 'C:\\modern\\lib\\node_modules\\@anthropic-ai\\claude-code\\cli.js'
    : '/modern/lib/node_modules/@anthropic-ai/claude-code/cli.js';
  const resolved = resolvePreferredClaudeNodeBinDir({
    env: { PATH: [legacyDir, modernDir].join(path.delimiter) },
    currentNodeVersion: 'v18.15.0',
    currentExecPath: legacyNodePath,
    runCommand: (command, args) => {
      if (command === (process.platform === 'win32' ? 'where' : 'which')) {
        return { status: 0, stdout: `${claudeShimPath}\n` };
      }
      if (command === modernNodePath && args[0] === '-v') {
        return { status: 0, stdout: 'v22.22.2\n' };
      }
      return { status: 1, stdout: '', stderr: '' };
    },
    fileExists: (targetPath) => targetPath === modernNodePath,
    resolveRealPath: () => claudeRealPath,
  });

  assert.equal(resolved, modernDir);
});

test('buildClaudeCodeChildEnv prepends the preferred node bin directory into PATH', () => {
  const preferredNodeBinDir = path.join(path.sep, 'modern', 'bin');
  const originalPath = [path.join(path.sep, 'usr', 'bin'), path.join(path.sep, 'bin')].join(path.delimiter);
  const env = buildClaudeCodeChildEnv({ PATH: originalPath, HOME: '/tmp/home' }, preferredNodeBinDir);
  assert.equal(env.PATH, [preferredNodeBinDir, ...originalPath.split(path.delimiter)].join(path.delimiter));
  assert.equal(env.HOME, '/tmp/home');
});

test('resolveClaudeWorkingDirectory returns an absolute existing directory path', () => {
  const resolved = resolveClaudeWorkingDirectory({
    cwd: './demo',
    fallbackCwd: '/unused',
    statPath: (targetPath) => {
      assert.equal(targetPath, path.resolve('./demo'));
      return { isDirectory: () => true };
    },
  });

  assert.equal(resolved, path.resolve('./demo'));
});

test('resolveClaudeWorkingDirectory throws a clear error when the project path is missing', () => {
  assert.throws(
    () => resolveClaudeWorkingDirectory({
      cwd: '/missing/project',
      statPath: () => {
        const error = new Error('missing');
        error.code = 'ENOENT';
        throw error;
      },
    }),
    /Project path not found: .*\/missing\/project$/,
  );
});

test('resolvePreferredNodeCommand converts bare node into an absolute compatible runtime path', () => {
  const preferredNodeBinDir = path.join(path.sep, 'modern', 'bin');
  assert.equal(
    resolvePreferredNodeCommand('node', preferredNodeBinDir),
    path.join(preferredNodeBinDir, process.platform === 'win32' ? 'node.exe' : 'node'),
  );
  assert.equal(resolvePreferredNodeCommand('bun', preferredNodeBinDir), 'bun');
  assert.equal(resolvePreferredNodeCommand('node', null), 'node');
});
