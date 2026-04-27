import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const WINDOWS_LITE_PUBLIC_ITEMS = ['favicon.png', 'favicon.svg', 'icons'];

const WINDOWS_LITE_BASE_PRUNE_TARGETS = [
  'public/screenshots',
  'node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/arm64-darwin',
  'node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/arm64-linux',
  'node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/x64-darwin',
  'node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/x64-linux',
  'node_modules/@img/sharp-libvips-darwin-arm64',
  'node_modules/@openai',
  'node_modules/@xterm',
  'node_modules/bcrypt',
  'node_modules/fsevents',
  'node_modules/node-pty',
  'node_modules/sqlite3',
  'node_modules/typescript',
];

const WINDOWS_LITE_ARCH_PRUNE_TARGETS = {
  x64: [
    'node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/arm64-win32',
  ],
  arm64: [
    'node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/x64-win32',
  ],
  universal: [],
};

const PRUNABLE_NODE_MODULE_FILE_SUFFIXES = ['.d.ts', '.map'];

function normalizeWindowsLiteTargetArch(targetArch = 'universal') {
  return WINDOWS_LITE_ARCH_PRUNE_TARGETS[targetArch] ? targetArch : 'universal';
}

function getWindowsLitePruneTargets(targetArch = 'universal') {
  const normalizedTargetArch = normalizeWindowsLiteTargetArch(targetArch);
  return [
    ...WINDOWS_LITE_BASE_PRUNE_TARGETS,
    ...WINDOWS_LITE_ARCH_PRUNE_TARGETS[normalizedTargetArch],
  ];
}

const WINDOWS_LITE_PRUNE_TARGETS = getWindowsLitePruneTargets();

async function collectPrunableFiles(rootDir, currentDir = rootDir) {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = resolve(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectPrunableFiles(rootDir, absolutePath));
      continue;
    }

    const relativePath = absolutePath.slice(rootDir.length).replaceAll('\\', '/');
    if (!relativePath.includes('/node_modules/')) {
      continue;
    }

    if (PRUNABLE_NODE_MODULE_FILE_SUFFIXES.some((suffix) => absolutePath.endsWith(suffix))) {
      files.push(absolutePath);
    }
  }

  return files;
}

export {
  WINDOWS_LITE_PUBLIC_ITEMS,
  WINDOWS_LITE_PRUNE_TARGETS,
  getWindowsLitePruneTargets,
  normalizeWindowsLiteTargetArch,
  PRUNABLE_NODE_MODULE_FILE_SUFFIXES,
  collectPrunableFiles,
};
