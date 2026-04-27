import { useCallback, useEffect, useRef, useState } from 'react';
import { getHookEditorData, updateHookSource } from '../api/hooksApi';
import type { HookEditorData, JsonValue } from '../types';

type UseHookEditorOptions = {
  sourceKind?: string;
  query?: string;
  initialData?: HookEditorData;
};

export function createHookEditorRequestGuard() {
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

export function useHookEditor({
  sourceKind,
  query = '',
  initialData,
}: UseHookEditorOptions = {}) {
  const [data, setData] = useState<HookEditorData | null>(initialData ?? null);
  const [isLoading, setIsLoading] = useState(!initialData);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const requestGuardRef = useRef(createHookEditorRequestGuard());

  const reload = useCallback(async () => {
    if (!sourceKind) {
      setData(null);
      setError('Missing hook source kind');
      setIsLoading(false);
      return;
    }

    const requestId = requestGuardRef.current.issue();

    try {
      setIsLoading(true);
      setError(null);
      const nextData = await getHookEditorData(sourceKind, query);

      if (!requestGuardRef.current.isCurrent(requestId)) {
        return;
      }

      setData(nextData);
    } catch (loadError) {
      if (!requestGuardRef.current.isCurrent(requestId)) {
        return;
      }

      setError(loadError instanceof Error ? loadError.message : 'Failed to load hook editor');
    } finally {
      if (requestGuardRef.current.isCurrent(requestId)) {
        setIsLoading(false);
      }
    }
  }, [query, sourceKind]);

  const saveHooks = useCallback(async (hooks: JsonValue | Record<string, unknown>) => {
    if (!sourceKind) {
      setError('Missing hook source kind');
      return null;
    }

    setIsSaving(true);
    setError(null);
    setSaveMessage(null);

    try {
      const result = await updateHookSource(sourceKind, hooks, query);
      setSaveMessage(`Saved ${result.sourceKind || sourceKind}`);
      await reload();
      return result;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save hook source');
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [query, reload, sourceKind]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    data,
    isLoading,
    isSaving,
    error,
    saveMessage,
    reload,
    saveHooks,
  };
}
