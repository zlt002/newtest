import { getWindowsLitePruneTargets, normalizeWindowsLiteTargetArch } from './windows-lite-optimization.mjs';

const RELEASE_ROOT = 'release/windows-lite';
const WINDOWS_LITE_TARGET_ARCH = normalizeWindowsLiteTargetArch(process.env.WINDOWS_LITE_TARGET_ARCH);

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

const REQUIRED_PATHS = [
  'dist/index.html',
  'server/index.js',
  'shared',
  'public',
  'start.cmd',
  'start.vbs',
  'stop.cmd',
  'stop.vbs',
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
  RELEASE_ROOT,
  RELEASE_RUNTIME_DEPENDENCIES,
  REQUIRED_PATHS,
  WINDOWS_LITE_TARGET_ARCH,
};
