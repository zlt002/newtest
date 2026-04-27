import { useCallback, useEffect, useRef, useState } from 'react';
import { getEffectiveHooks, getHookExecutions, getHooksOverview } from '../api/hooksApi';
import type { HooksOverviewPageData } from '../types';

type UseHooksOverviewOptions = {
  query?: string;
  initialData?: HooksOverviewPageData;
};

export function createHooksOverviewRequestGuard() {
  let latestRequestId = 0;

  return {
    issue() {
      latestRequestId += 1;
      return latestRequestId;
    },
    isCurrent(requestId: number) {
      return requestId === latestRequestId;
    },
  };
}

export function useHooksOverview({ query = '', initialData }: UseHooksOverviewOptions = {}) {
  const [data, setData] = useState<HooksOverviewPageData | null>(initialData ?? null);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const requestGuardRef = useRef(createHooksOverviewRequestGuard());

  const reload = useCallback(async () => {
    const requestId = requestGuardRef.current.issue();

    try {
      setIsLoading(true);
      setError(null);

      const [overview, effective, recentExecutions] = await Promise.all([
        getHooksOverview(query),
        getEffectiveHooks(query),
        getHookExecutions(query),
      ]);

      if (!requestGuardRef.current.isCurrent(requestId)) {
        return;
      }

      setData({
        ...overview,
        effective,
        recentExecutions,
      });
    } catch (loadError) {
      if (!requestGuardRef.current.isCurrent(requestId)) {
        return;
      }
      setError(loadError instanceof Error ? loadError.message : 'Failed to load hooks overview');
    } finally {
      if (requestGuardRef.current.isCurrent(requestId)) {
        setIsLoading(false);
      }
    }
  }, [query]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    data,
    isLoading,
    error,
    reload,
  };
}
