const FILE_TREE_EXPANDED_DIRECTORIES_STORAGE_PREFIX = 'fileTree.expandedDirectories';

export const buildExpandedDirectoriesStorageKey = (projectName: string): string =>
  `${FILE_TREE_EXPANDED_DIRECTORIES_STORAGE_PREFIX}.${projectName}`;

export const serializeExpandedDirectories = (paths: Set<string>): string =>
  JSON.stringify(Array.from(new Set(paths)).sort((left, right) => left.localeCompare(right)));

export const normalizeExpandedDirectories = (raw: string | null): Set<string> => {
  if (!raw) {
    return new Set();
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    return new Set(parsed.filter((value): value is string => typeof value === 'string' && value.length > 0));
  } catch {
    return new Set();
  }
};
