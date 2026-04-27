import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildExpandedDirectoriesStorageKey,
  normalizeExpandedDirectories,
  serializeExpandedDirectories,
} from './expandedDirectoriesPersistence';

type UseExpandedDirectoriesResult = {
  expandedDirs: Set<string>;
  toggleDirectory: (path: string) => void;
  expandDirectories: (paths: string[]) => void;
  collapseAll: () => void;
};

export function useExpandedDirectories(projectName?: string | null): UseExpandedDirectoriesResult {
  const storageKey = useMemo(
    () => (projectName ? buildExpandedDirectoriesStorageKey(projectName) : null),
    [projectName],
  );
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set());
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(false);

    if (!storageKey) {
      setExpandedDirs(new Set());
      setHasHydrated(true);
      return;
    }

    try {
      setExpandedDirs(normalizeExpandedDirectories(localStorage.getItem(storageKey)));
    } catch {
      setExpandedDirs(new Set());
    }

    setHasHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !hasHydrated) {
      return;
    }

    try {
      localStorage.setItem(storageKey, serializeExpandedDirectories(expandedDirs));
    } catch {
      // Keep runtime state even when persistence fails.
    }
  }, [expandedDirs, hasHydrated, storageKey]);

  const toggleDirectory = useCallback((path: string) => {
    setExpandedDirs((previous) => {
      const next = new Set(previous);

      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }

      return next;
    });
  }, []);

  const expandDirectories = useCallback((paths: string[]) => {
    if (paths.length === 0) {
      return;
    }

    setExpandedDirs((previous) => {
      const next = new Set(previous);
      paths.forEach((path) => next.add(path));
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedDirs(new Set());
  }, []);

  return {
    expandedDirs,
    toggleDirectory,
    expandDirectories,
    collapseAll,
  };
}
