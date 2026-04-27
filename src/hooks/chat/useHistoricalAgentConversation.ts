import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSessionHistory, type SessionHistoryResponse } from '@services/chatHistoryService';

type HistoricalAgentConversationState = {
  history: SessionHistoryResponse | null;
  turns: SessionHistoryResponse['messages'];
  isLoading: boolean;
  isLoadingOlder: boolean;
  hasMore: boolean;
  totalMessages: number;
  error: Error | null;
  refresh: () => void;
  loadOlder: () => Promise<void>;
  loadAll: () => Promise<void>;
};

type HistoricalAgentConversationProps = {
  sessionId: string | null;
  enabled?: boolean;
};

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function useHistoricalAgentConversation({
  sessionId,
  enabled = true,
}: HistoricalAgentConversationProps): HistoricalAgentConversationState {
  const [history, setHistory] = useState<SessionHistoryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const sessionAbortControllerRef = useRef<AbortController | null>(null);
  const loadingGenerationRef = useRef(0);
  const loadingCountRef = useRef(0);

  const turns = history?.messages || [];
  const hasMore = false;
  const totalMessages = history?.messages.length || 0;

  const getActiveSignal = useCallback(() => {
    return sessionAbortControllerRef.current?.signal || null;
  }, []);

  const beginLoading = useCallback(() => {
    const generation = loadingGenerationRef.current;
    loadingCountRef.current += 1;
    setIsLoading(true);
    return generation;
  }, []);

  const endLoading = useCallback((generation: number) => {
    if (generation !== loadingGenerationRef.current) {
      return;
    }

    loadingCountRef.current = Math.max(loadingCountRef.current - 1, 0);
    setIsLoading(loadingCountRef.current > 0);
  }, []);

  useEffect(() => {
    sessionAbortControllerRef.current?.abort();
    loadingGenerationRef.current += 1;
    loadingCountRef.current = 0;

    if (!enabled || !sessionId) {
      sessionAbortControllerRef.current = null;
      setHistory(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const abortController = new AbortController();
    sessionAbortControllerRef.current = abortController;
    const loadingGeneration = beginLoading();
    setHistory(null);
    setError(null);

    void fetchSessionHistory(sessionId, {
      force: false,
      full: true,
      signal: abortController.signal,
    })
      .then((nextHistory) => {
        if (abortController.signal.aborted) {
          return;
        }

        setHistory(nextHistory);
      })
      .catch((nextError: unknown) => {
        if (abortController.signal.aborted || isAbortError(nextError)) {
          return;
        }

        setError(nextError instanceof Error ? nextError : new Error('Failed to hydrate session history'));
        setHistory(null);
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          endLoading(loadingGeneration);
        }
      });

    return () => {
      abortController.abort();
      if (sessionAbortControllerRef.current === abortController) {
        sessionAbortControllerRef.current = null;
      }
    };
  }, [beginLoading, enabled, endLoading, sessionId]);

  const loadOlder = useCallback(async () => {}, []);

  const loadAll = useCallback(async () => {}, []);

  const refresh = useCallback(() => {
    if (!enabled || !sessionId) {
      return;
    }

    const signal = getActiveSignal();
    if (!signal) {
      return;
    }

    const loadingGeneration = beginLoading();
    setError(null);

    void fetchSessionHistory(sessionId, {
      force: true,
      full: true,
      signal,
    })
      .then((nextHistory) => {
        if (signal.aborted) {
          return;
        }
        setHistory(nextHistory as SessionHistoryResponse);
      })
      .catch((nextError: unknown) => {
        if (!signal.aborted && !isAbortError(nextError)) {
          setError(nextError instanceof Error ? nextError : new Error('Failed to hydrate session history'));
        }
      })
      .finally(() => {
        if (!signal.aborted) {
          endLoading(loadingGeneration);
        }
      });
  }, [beginLoading, enabled, endLoading, getActiveSignal, sessionId]);

  return {
    history,
    turns,
    isLoading,
    isLoadingOlder: false,
    hasMore,
    totalMessages,
    error,
    refresh,
    loadOlder,
    loadAll,
  };
}
