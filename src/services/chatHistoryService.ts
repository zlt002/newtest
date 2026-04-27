import { authenticatedFetch } from '../utils/api.ts';
import type {
  CanonicalSessionMessage,
  SessionHistoryResponse as BaseSessionHistoryResponse,
} from '../components/chat/types/sessionHistory.ts';

const SESSION_HISTORY_CACHE_TTL_MS = 5 * 1000;

type FetchSessionHistoryOptions = {
  force?: boolean;
  full?: boolean;
  limit?: number | null;
  offset?: number | null;
  signal?: AbortSignal;
};

type SessionHistoryPage = {
  offset: number;
  limit: number | null;
  returned: number;
  total: number;
  hasMore: boolean;
};

export type SessionHistoryResponse = BaseSessionHistoryResponse & {
  page: SessionHistoryPage;
};

type SessionHistoryCacheEntry = {
  expiresAt: number;
  history: SessionHistoryResponse;
};

const sessionHistoryCache = new Map<string, SessionHistoryCacheEntry>();
const sessionHistoryRequests = new Map<string, Promise<SessionHistoryResponse>>();

function createAbortError(): Error {
  if (typeof DOMException === 'function') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }

  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function toPageLimitParam(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value > 0
    ? value
    : null;
}

function toPageOffsetParam(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function getSessionHistoryRequestKey(sessionId: string, options: FetchSessionHistoryOptions): string {
  if (options.full) {
    return `${sessionId}::full=1`;
  }

  const limit = toPageLimitParam(options.limit);
  const offset = toPageOffsetParam(options.offset);
  return `${sessionId}::limit=${limit}::offset=${offset}`;
}

function buildSessionHistoryRequestUrl(sessionId: string, options: FetchSessionHistoryOptions): string {
  const path = `/api/agent-v2/sessions/${encodeURIComponent(sessionId)}/history`;
  const searchParams = new URLSearchParams();

  if (options.full) {
    searchParams.set('full', '1');
  } else {
    const limit = toPageLimitParam(options.limit);
    if (limit !== null) {
      searchParams.set('limit', String(limit));
    }

    const offset = toPageOffsetParam(options.offset);
    if (offset !== null) {
      searchParams.set('offset', String(offset));
    }
  }

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

function normalizeSessionHistoryPage(page: unknown, sessionId: string): SessionHistoryPage {
  if (!page || typeof page !== 'object' || Array.isArray(page)) {
    throw new Error(`fetchSessionHistory expected response.page for session ${sessionId}`);
  }

  const record = page as Record<string, unknown>;

  if (typeof record.hasMore !== 'boolean') {
    throw new Error(`fetchSessionHistory expected response.page.hasMore to be boolean for session ${sessionId}`);
  }

  const limit = record.limit;
  if (limit !== null && typeof limit === 'number' && (!Number.isInteger(limit) || limit < 0)) {
    throw new Error(`fetchSessionHistory expected response.page.limit to be null or a non-negative integer for session ${sessionId}`);
  }

  const offset = record.offset;
  if (typeof offset !== 'number' || !Number.isInteger(offset) || offset < 0) {
    throw new Error(`fetchSessionHistory expected response.page.offset to be a non-negative integer for session ${sessionId}`);
  }

  const returned = record.returned;
  if (typeof returned !== 'number' || !Number.isInteger(returned) || returned < 0) {
    throw new Error(`fetchSessionHistory expected response.page.returned to be a non-negative integer for session ${sessionId}`);
  }

  const total = record.total;
  if (typeof total !== 'number' || !Number.isInteger(total) || total < 0) {
    throw new Error(`fetchSessionHistory expected response.page.total to be a non-negative integer for session ${sessionId}`);
  }

  return {
    offset: offset as number,
    limit: limit as number | null,
    returned: returned as number,
    total: total as number,
    hasMore: record.hasMore,
  };
}

function waitForSessionHistoryRequest(
  request: Promise<SessionHistoryResponse>,
  signal?: AbortSignal,
): Promise<SessionHistoryResponse> {
  if (!signal) {
    return request;
  }

  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }

  return Promise.race([
    request,
    new Promise<SessionHistoryResponse>((_, reject) => {
      const onAbort = () => reject(createAbortError());
      signal.addEventListener('abort', onAbort, { once: true });
      void request.then(
        () => signal.removeEventListener('abort', onAbort),
        () => signal.removeEventListener('abort', onAbort),
      );
    }),
  ]);
}

function normalizeRole(role: unknown): CanonicalSessionMessage['role'] {
  return role === 'user' || role === 'assistant' ? role : 'tool';
}

function normalizeMessage(
  message: Record<string, unknown>,
  index: number,
  sessionId: string,
): CanonicalSessionMessage {
  const rawId = typeof message.id === 'string' && message.id.trim()
    ? message.id.trim()
    : typeof message.uuid === 'string' && message.uuid.trim()
      ? message.uuid.trim()
      : `${sessionId}-message-${index}`;

  return {
    id: rawId,
    sessionId: typeof message.sessionId === 'string' && message.sessionId.trim()
      ? message.sessionId.trim()
      : sessionId,
    role: normalizeRole(message.role),
    text: typeof message.text === 'string' ? message.text : null,
    timestamp: typeof message.timestamp === 'string' ? message.timestamp : '',
    kind: typeof message.kind === 'string'
      ? message.kind
      : typeof message.type === 'string'
        ? message.type
        : null,
    type: typeof message.type === 'string' ? message.type : null,
    toolName: typeof message.toolName === 'string'
      ? message.toolName
      : typeof message.tool_name === 'string'
        ? message.tool_name
        : null,
    toolInput: Object.prototype.hasOwnProperty.call(message, 'toolInput')
      ? message.toolInput
      : Object.prototype.hasOwnProperty.call(message, 'tool_input')
        ? message.tool_input
        : undefined,
    toolId: typeof message.toolId === 'string'
      ? message.toolId
      : typeof message.tool_id === 'string'
        ? message.tool_id
        : null,
    isError: typeof message.isError === 'boolean'
      ? message.isError
      : typeof message.is_error === 'boolean'
        ? message.is_error
        : undefined,
    content: message.content,
  };
}

function normalizeSessionHistoryResponse(payload: unknown, fallbackSessionId: string): SessionHistoryResponse {
  const record = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const sessionId = typeof record.sessionId === 'string' && record.sessionId.trim()
    ? record.sessionId.trim()
    : fallbackSessionId;
  const rawMessages = Array.isArray(record.messages) ? record.messages : [];
  const metadata = record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
    ? record.metadata as Record<string, unknown>
    : {};
  const diagnosticsSummary = record.diagnosticsSummary && typeof record.diagnosticsSummary === 'object' && !Array.isArray(record.diagnosticsSummary)
    ? record.diagnosticsSummary as Record<string, unknown>
    : {};

  return {
    sessionId,
    cwd: typeof record.cwd === 'string' ? record.cwd : null,
    metadata: {
      title: typeof metadata.title === 'string' ? metadata.title : null,
      pinned: Boolean(metadata.pinned),
      starred: Boolean(metadata.starred),
      lastViewedAt: typeof metadata.lastViewedAt === 'string' ? metadata.lastViewedAt : null,
    },
    messages: rawMessages
      .filter((message) => message && typeof message === 'object' && !Array.isArray(message))
      .map((message, index) => normalizeMessage(message as Record<string, unknown>, index, sessionId)),
    diagnosticsSummary: {
      officialMessageCount: Number.isFinite(diagnosticsSummary.officialMessageCount)
        ? Number(diagnosticsSummary.officialMessageCount)
        : 0,
      debugLogAvailable: Boolean(diagnosticsSummary.debugLogAvailable),
      agentMessageCount: Number.isFinite(diagnosticsSummary.agentMessageCount)
        ? Number(diagnosticsSummary.agentMessageCount)
        : 0,
      debugAugmentedCount: Number.isFinite(diagnosticsSummary.debugAugmentedCount)
        ? Number(diagnosticsSummary.debugAugmentedCount)
        : 0,
      historySourceCoverage: typeof diagnosticsSummary.historySourceCoverage === 'string'
        ? diagnosticsSummary.historySourceCoverage
        : null,
    },
    page: normalizeSessionHistoryPage(record.page, sessionId),
  };
}

export async function fetchSessionHistory(
  sessionId: string,
  options: FetchSessionHistoryOptions = {},
): Promise<SessionHistoryResponse> {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) {
    throw new Error('fetchSessionHistory requires a sessionId');
  }

  if (!options.force) {
    const cacheKey = getSessionHistoryRequestKey(normalizedSessionId, options);
    const cachedHistory = sessionHistoryCache.get(cacheKey);
    if (cachedHistory && cachedHistory.expiresAt > Date.now()) {
      return cachedHistory.history;
    }
  }

  const requestKey = getSessionHistoryRequestKey(normalizedSessionId, options);

  if (!options.force) {
    const existingRequest = sessionHistoryRequests.get(requestKey);
    if (existingRequest) {
      return waitForSessionHistoryRequest(existingRequest, options.signal);
    }
  }

  const request = (async () => {
    const response = await authenticatedFetch(
      buildSessionHistoryRequestUrl(normalizedSessionId, options),
      { method: 'GET' },
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch session history (${response.status})`);
    }

    const history = normalizeSessionHistoryResponse(await response.json(), normalizedSessionId);
    sessionHistoryCache.set(requestKey, {
      expiresAt: Date.now() + SESSION_HISTORY_CACHE_TTL_MS,
      history,
    });
    return history;
  })();

  void request.then(
    () => sessionHistoryRequests.delete(requestKey),
    () => sessionHistoryRequests.delete(requestKey),
  );
  sessionHistoryRequests.set(requestKey, request);

  return await waitForSessionHistoryRequest(request, options.signal);
}
