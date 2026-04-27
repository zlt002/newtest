import path from 'node:path';

const IGNORED_DIRECTORY_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'subagents',
  'tool-results',
]);

const IGNORED_FILE_NAMES = new Set(['.DS_Store']);
const IGNORED_FILE_SUFFIXES = ['.tmp', '.swp'];

export function shouldIgnoreWatchedPath(filePath) {
  if (!filePath) {
    return false;
  }

  const normalizedPath = path.normalize(filePath);
  const segments = normalizedPath.split(path.sep).filter(Boolean);
  const baseName = path.basename(normalizedPath);

  if (IGNORED_FILE_NAMES.has(baseName)) {
    return true;
  }

  if (IGNORED_FILE_SUFFIXES.some((suffix) => baseName.endsWith(suffix))) {
    return true;
  }

  return segments.some((segment) => IGNORED_DIRECTORY_NAMES.has(segment));
}
