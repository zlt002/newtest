import { useCallback, useEffect, useRef, useState } from 'react';
import { getHookExecutionDetail, getHookExecutions } from '../api/hooksApi';
import type { HookExecutionDetail, HookExecutionSummary } from '../types';

type UseHookExecutionsOptions = {
  hookId?: string;
  query?: string;
  initialData?: HookExecutionSummary[] | HookExecutionDetail;
};

export function createHookExecutionsRequestGuard() {
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

export function useHookExecutions({
  hookId,
  query = '',
  initialData,
}: UseHookExecutionsOptions = {}) {
  const isDetailMode = Boolean(hookId);
  const [data, setData] = useState<HookExecutionSummary[] | HookExecutionDetail | null>(initialData ?? null);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const requestGuardRef = useRef(createHookExecutionsRequestGuard());

  const reload = useCallback(async () => {
    const requestId = requestGuardRef.current.issue();

    try {
      setIsLoading(true);
      setError(null);

      const nextData = hookId
        ? await getHookExecutionDetail(hookId, query)
        : await getHookExecutions(query);

      if (!requestGuardRef.current.isCurrent(requestId)) {
        return;
      }

      setData(nextData);
    } catch (loadError) {
      if (!requestGuardRef.current.isCurrent(requestId)) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : 'Failed to load hook executions');
    } finally {
      if (requestGuardRef.current.isCurrent(requestId)) {
        setIsLoading(false);
      }
    }
  }, [hookId, query]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    data,
    isLoading,
    error,
    reload,
    isDetailMode,
  };
}
