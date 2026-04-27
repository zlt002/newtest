import { authenticatedFetch } from '../../../utils/api.js';
import type {
  HookEditorData,
  HookExecutionDetail,
  EffectiveHooksResponse,
  HookExecutionSummary,
  HookSourceDetailResponse,
  HooksOverviewResponse,
  JsonValue,
} from '../types';

const buildHooksApiPath = (path: string, query = '') => {
  const normalizedQuery = query.trim().replace(/^\?/, '');
  return normalizedQuery ? `${path}?${normalizedQuery}` : path;
};

const parseJson = async <T>(response: Response): Promise<T> => response.json() as Promise<T>;

const getErrorMessage = async (response: Response, fallback: string) => {
  try {
    const payload = (await response.json()) as { error?: string; message?: string };
    return payload.error || payload.message || fallback;
  } catch {
    return fallback;
  }
};

type HooksApiRequestOptions = {
  method?: 'GET' | 'PUT';
  query?: string;
  body?: JsonValue | Record<string, unknown>;
  fallbackError?: string;
};

async function requestHooksApi<T>(
  path: string,
  {
    method = 'GET',
    query = '',
    body,
    fallbackError = 'Failed to load hooks data',
  }: HooksApiRequestOptions = {},
) {
  const response = await authenticatedFetch(buildHooksApiPath(path, query), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, fallbackError));
  }

  return parseJson<T>(response);
}

export function getHooksOverview(query = '') {
  return requestHooksApi<HooksOverviewResponse>('/api/hooks/overview', {
    query,
    fallbackError: 'Failed to load hooks overview',
  });
}

export function getEffectiveHooks(query = '') {
  return requestHooksApi<EffectiveHooksResponse>('/api/hooks/effective', {
    query,
    fallbackError: 'Failed to load effective hooks',
  });
}

export function getHookExecutions(query = '') {
  return requestHooksApi<HookExecutionSummary[]>('/api/hooks/events', {
    query,
    fallbackError: 'Failed to load recent hook executions',
  });
}

export function getHookExecutionDetail(hookId: string, query = '') {
  return requestHooksApi<HookExecutionDetail>(`/api/hooks/events/${encodeURIComponent(hookId)}`, {
    query,
    fallbackError: 'Failed to load hook execution detail',
  });
}

export function getHookSourceDetail(sourceId: string, query = '') {
  return requestHooksApi<HookSourceDetailResponse>(`/api/hooks/sources/${encodeURIComponent(sourceId)}`, {
    query,
    fallbackError: 'Failed to load hook source detail',
  });
}

export function getHookEditorData(sourceKind: string, query = '') {
  return requestHooksApi<HookEditorData>(
    `/api/hooks/sources/${encodeURIComponent(resolveHookEditorSourceId(sourceKind, query))}`,
    {
      query,
      fallbackError: 'Failed to load hook editor data',
    },
  );
}

export function updateHookSource(sourceKind: string, hooks: JsonValue | Record<string, unknown>, query = '') {
  return requestHooksApi<{ sourceId?: string; sourceKind?: string; path?: string | null }>(
    `/api/hooks/${encodeURIComponent(sourceKind)}`,
    {
      method: 'PUT',
      query,
      body: { hooks },
      fallbackError: 'Failed to update hook source',
    },
  );
}

export function resolveHookEditorSourceId(sourceKind: string, query = '') {
  if (sourceKind !== 'session-memory') {
    return sourceKind;
  }

  const params = new URLSearchParams(query);
  const sessionId = params.get('sessionId');
  return sessionId ? `session-memory:${sessionId}` : sourceKind;
}
