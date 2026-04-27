import { useCallback, useEffect, useRef, useState } from 'react';
import { getHookSourceDetail } from '../api/hooksApi';
import type { HookSourceDetailResponse } from '../types';

type UseHookSourceDetailOptions = {
  sourceId?: string;
  query?: string;
  initialData?: HookSourceDetailResponse;
};

export function createHookSourceDetailRequestGuard() {
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

export function useHookSourceDetail({
  sourceId,
  query = '',
  initialData,
}: UseHookSourceDetailOptions = {}) {
  const [data, setData] = useState<HookSourceDetailResponse | null>(initialData ?? null);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const requestGuardRef = useRef(createHookSourceDetailRequestGuard());

  const reload = useCallback(async () => {
    if (!sourceId) {
      setData(null);
      setError('Missing hook source id');
      setIsLoading(false);
      return;
    }

    const requestId = requestGuardRef.current.issue();

    try {
      setIsLoading(true);
      setError(null);
      const nextData = await getHookSourceDetail(sourceId, query);
      if (!requestGuardRef.current.isCurrent(requestId)) {
        return;
      }
      setData(nextData);
    } catch (loadError) {
      if (!requestGuardRef.current.isCurrent(requestId)) {
        return;
      }
      setError(loadError instanceof Error ? loadError.message : 'Failed to load hook source detail');
    } finally {
      if (requestGuardRef.current.isCurrent(requestId)) {
        setIsLoading(false);
      }
    }
  }, [query, sourceId]);

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
