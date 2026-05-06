import type { FileTreeNode, FileTreeSortConfig } from '../types/types';

const fileTreeCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

const MISSING_SORT_VALUE = Number.NEGATIVE_INFINITY;

function compareNames(a: FileTreeNode, b: FileTreeNode): number {
  return fileTreeCollator.compare(a.name, b.name);
}

function compareSizes(a: FileTreeNode, b: FileTreeNode): number {
  return (a.size ?? MISSING_SORT_VALUE) - (b.size ?? MISSING_SORT_VALUE);
}

function getModifiedTimestamp(value: string | undefined): number {
  if (!value) {
    return MISSING_SORT_VALUE;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? MISSING_SORT_VALUE : timestamp;
}

function compareModifiedTimes(a: FileTreeNode, b: FileTreeNode): number {
  return getModifiedTimestamp(a.modified) - getModifiedTimestamp(b.modified);
}

function compareFileTreeNodes(
  a: FileTreeNode,
  b: FileTreeNode,
  sortConfig: FileTreeSortConfig,
): number {
  const directionMultiplier = sortConfig.direction === 'asc' ? 1 : -1;
  const primaryResult =
    sortConfig.key === 'name'
      ? compareNames(a, b)
      : sortConfig.key === 'size'
        ? compareSizes(a, b)
        : compareModifiedTimes(a, b);

  if (primaryResult !== 0) {
    return primaryResult * directionMultiplier;
  }

  return compareNames(a, b);
}

export function sortFileTree(
  items: FileTreeNode[],
  sortConfig: FileTreeSortConfig,
): FileTreeNode[] {
  return [...items]
    .sort((a, b) => compareFileTreeNodes(a, b, sortConfig))
    .map((item) => {
      if (item.type !== 'directory' || !item.children) {
        return item;
      }

      return {
        ...item,
        children: sortFileTree(item.children, sortConfig),
      };
    });
}
