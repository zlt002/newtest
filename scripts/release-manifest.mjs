import { getWindowsLitePruneTargets, normalizeWindowsLiteTargetArch } from './windows-lite-optimization.mjs';

const LITE_DISTRIBUTION = process.env.LITE_DISTRIBUTION === 'mac' ? 'mac' : 'windows';
const LITE_TARGET_ARCH = process.env.LITE_TARGET_ARCH || process.env.WINDOWS_LITE_TARGET_ARCH || 'universal';
const RELEASE_ROOT = LITE_DISTRIBUTION === 'mac' ? 'release/mac-lite' : 'release/windows-lite';
const WINDOWS_LITE_TARGET_ARCH = normalizeWindowsLiteTargetArch(LITE_TARGET_ARCH);

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

const REQUIRED_PATHS = [
  'dist/index.html',
  'server/index.js',
  'shared',
  'public',
  ...(LITE_DISTRIBUTION === 'mac' ? ['start.command', 'stop.command'] : ['start.vbs', 'stop.vbs']),
  'README.zh-CN.md',
  'package.json',
  'package-lock.json',
  'node_modules',
];

const FORBIDDEN_PATHS = ['src', 'docs', '.git', '.github', 'tests', 'test', '__tests__'];

const PRUNE_TARGETS = getWindowsLitePruneTargets(WINDOWS_LITE_TARGET_ARCH);

export {
  FORBIDDEN_PATHS,
  PRUNE_TARGETS,
  LITE_DISTRIBUTION,
  LITE_TARGET_ARCH,
  RELEASE_ROOT,
  RELEASE_RUNTIME_DEPENDENCIES,
  REQUIRED_PATHS,
  WINDOWS_LITE_TARGET_ARCH,
};
