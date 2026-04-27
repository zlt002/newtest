import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

export function parseNodeMajorVersion(version = '') {
  const match = /^v?(\d+)/.exec(String(version).trim());
  return match ? Number.parseInt(match[1], 10) : null;
}

export function supportsClaudeCodeRuntime({
  nodeVersion = process.version,
} = {}) {
  const major = parseNodeMajorVersion(nodeVersion);
  return major !== null && major >= 20;
}

export function prependPathEntry(pathValue = '', entry, delimiter = path.delimiter) {
  if (!entry) {
    return pathValue;
  }

  const parts = String(pathValue || '')
    .split(delimiter)
    .filter(Boolean)
    .filter((value) => value !== entry);

  return [entry, ...parts].join(delimiter);
}

function resolveCommandPath(commandName, runCommand, env) {
  const whichCommand = process.platform === 'win32' ? 'where' : 'which';
  const result = runCommand(whichCommand, [commandName], {
    encoding: 'utf8',
    env,
  });

  if (result.status !== 0) {
    return null;
  }

  const firstLine = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine || null;
}

function findNodeBinaryForClaudePath(claudeRealPath, fileExists) {
  const nodeBinaryName = process.platform === 'win32' ? 'node.exe' : 'node';
  let currentDir = path.dirname(claudeRealPath);

  for (let depth = 0; depth < 8; depth += 1) {
    const siblingNodePath = path.join(currentDir, nodeBinaryName);
    if (fileExists(siblingNodePath)) {
      return siblingNodePath;
    }

    const binNodePath = path.join(currentDir, 'bin', nodeBinaryName);
    if (fileExists(binNodePath)) {
      return binNodePath;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return null;
}

export function resolvePreferredClaudeNodeBinDir({
  env = process.env,
  currentNodeVersion = process.version,
  currentExecPath = process.execPath,
  runCommand = spawnSync,
  fileExists = existsSync,
  resolveRealPath = realpathSync,
} = {}) {
  const candidates = [];

  if (supportsClaudeCodeRuntime({ nodeVersion: currentNodeVersion })) {
    candidates.push(path.dirname(currentExecPath));
  }

  const claudePath = resolveCommandPath('claude', runCommand, env);
  if (claudePath) {
    try {
      const resolvedClaudePath = resolveRealPath(claudePath);
      const siblingNodePath = findNodeBinaryForClaudePath(resolvedClaudePath, fileExists);
      if (siblingNodePath) {
        const versionResult = runCommand(siblingNodePath, ['-v'], { encoding: 'utf8', env });
        if (versionResult.status === 0) {
          candidates.push(path.dirname(siblingNodePath));
        }
      }
    } catch {
      // Ignore resolution failures and fall back to the existing environment.
    }
  }

  for (const candidate of candidates) {
    const nodeBinaryName = process.platform === 'win32' ? 'node.exe' : 'node';
    const nodeBinaryPath = path.join(candidate, nodeBinaryName);
    if (!fileExists(nodeBinaryPath)) {
      continue;
    }

    const versionResult = runCommand(nodeBinaryPath, ['-v'], { encoding: 'utf8', env });
    if (versionResult.status !== 0) {
      continue;
    }

    if (supportsClaudeCodeRuntime({ nodeVersion: versionResult.stdout.trim() })) {
      return candidate;
    }
  }

  return null;
}

export function buildClaudeCodeChildEnv(baseEnv = process.env, preferredNodeBinDir = null) {
  if (!preferredNodeBinDir) {
    return { ...baseEnv };
  }

  return {
    ...baseEnv,
    PATH: prependPathEntry(baseEnv.PATH || '', preferredNodeBinDir),
  };
}

export function resolveClaudeWorkingDirectory({
  cwd,
  fallbackCwd = process.cwd(),
  statPath = statSync,
} = {}) {
  const candidate = cwd || fallbackCwd;
  const resolvedPath = path.resolve(candidate);

  let stats;
  try {
    stats = statPath(resolvedPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Project path not found: ${resolvedPath}`);
    }
    throw error;
  }

  if (!stats?.isDirectory?.()) {
    throw new Error(`Project path is not a directory: ${resolvedPath}`);
  }

  return resolvedPath;
}

export function resolvePreferredNodeCommand(command, preferredNodeBinDir) {
  if (!preferredNodeBinDir || command !== 'node') {
    return command;
  }

  return path.join(preferredNodeBinDir, process.platform === 'win32' ? 'node.exe' : 'node');
}
