/**
 * Session-keyed message store.
 *
 * Holds per-session state in a Map keyed by sessionId.
 * Session switch = change activeSessionId pointer. No clearing. Old data stays.
 * WebSocket handler = store.appendRealtime(msg.sessionId, msg). One line.
 * No localStorage for messages. Backend JSONL is the source of truth.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import type { SessionProvider } from '../types/app';
import { fetchSessionHistory } from '../services/chatHistoryService.ts';
import { rebindSessionSlotData } from './sessionStoreRebind.ts';

// ─── NormalizedMessage (mirrors server/adapters/types.js) ────────────────────

export type MessageKind =
  | 'text'
  | 'tool_use'
  | 'tool_use_partial'
  | 'tool_result'
  | 'thinking'
  | 'stream_delta'
  | 'stream_end'
  | 'error'
  // Legacy transcript-only control kinds. Current V2 execution state no longer depends on them.
  | 'complete'
  | 'status'
  | 'permission_request'
  | 'permission_cancelled'
  | 'session_created'
  | 'interactive_prompt'
  | 'task_notification'
  | 'task_started'
  | 'task_progress'
  | 'result'
  | 'compact_boundary'
  | 'tool_progress'
  | 'tool_use_summary'
  | 'auth_status'
  | 'files_persisted'
  | 'hook_started'
  | 'hook_progress'
  | 'hook_response'
  | 'prompt_suggestion'
  | 'rate_limit'
  | 'session_status'
  | 'debug_ref'
  | 'agent_sdk_message'
  | 'tool_approval_request'
  | 'question_request';

export interface NormalizedMessage {
  id: string;
  sessionId: string;
  timestamp: string;
  provider: SessionProvider;
  kind: MessageKind;

  // kind-specific fields (flat for simplicity)
  role?: 'user' | 'assistant';
  content?: string;
  images?: Array<{ data: string; name: string }>;
  toolName?: string;
  toolInput?: unknown;
  toolId?: string;
  toolResult?: { content: string; isError: boolean; toolUseResult?: unknown } | null;
  isError?: boolean;
  text?: string;
  tokens?: number;
  canInterrupt?: boolean;
  tokenBudget?: unknown;
  requestId?: string;
  input?: unknown;
  context?: unknown;
  newSessionId?: string;
  status?: string;
  summary?: string;
  errors?: string[];
  structuredOutput?: unknown;
  resultSubtype?: string;
  exitCode?: number;
  usage?: Record<string, unknown> | null;
  modelUsage?: Record<string, unknown> | null;
  totalCostUsd?: number | null;
  elapsedTimeSeconds?: number | null;
  lastToolName?: string;
  outputFile?: string;
  taskType?: string;
  actualSessionId?: string;
  parentToolUseId?: string;
  subagentTools?: unknown[];
  isFinal?: boolean;
  metadata?: Record<string, unknown>;
  taskId?: string;
  toolUseIds?: string[];
  sdkMessage?: {
    sdkType: 'system' | 'assistant' | 'user' | 'stream_event' | 'result';
    payload: unknown;
  };
  questions?: Array<{
    question: string;
    header?: string;
    options: Array<{
      label: string;
      description?: string;
      preview?: string;
    }>;
    multiSelect?: boolean;
  }>;
  isCompactOperation?: boolean;
  // Cursor-specific ordering
  sequence?: number;
  rowid?: number;
}

// ─── Per-session slot ────────────────────────────────────────────────────────

export type SessionStatus = 'idle' | 'loading' | 'streaming' | 'error';

export interface SessionSlot {
  serverMessages: NormalizedMessage[];
  realtimeMessages: NormalizedMessage[];
  merged: NormalizedMessage[];
  /** @internal Cache-invalidation refs for computeMerged */
  _lastServerRef: NormalizedMessage[];
  _lastRealtimeRef: NormalizedMessage[];
  status: SessionStatus;
  fetchedAt: number;
  total: number;
  hasMore: boolean;
  offset: number;
  tokenUsage: unknown;
}

const EMPTY: NormalizedMessage[] = [];

function createEmptySlot(): SessionSlot {
  return {
    serverMessages: EMPTY,
    realtimeMessages: EMPTY,
    merged: EMPTY,
    _lastServerRef: EMPTY,
    _lastRealtimeRef: EMPTY,
    status: 'idle',
    fetchedAt: 0,
    total: 0,
    hasMore: false,
    offset: 0,
    tokenUsage: null,
  };
}

function normalizeSignatureText(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isUserTextMessage(message: NormalizedMessage): boolean {
  return message.kind === 'text' && message.role === 'user';
}

function hasNearbyServerUserMessage(
  realtimeMessage: NormalizedMessage,
  server: NormalizedMessage[],
): boolean {
  if (!isUserTextMessage(realtimeMessage)) {
    return false;
  }

  const realtimeContent = String(realtimeMessage.content || '').trim();
  if (!realtimeContent) {
    return false;
  }

  const realtimeTimestamp = Date.parse(realtimeMessage.timestamp);
  if (!Number.isFinite(realtimeTimestamp)) {
    return false;
  }

  return server.some((serverMessage) => {
    if (!isUserTextMessage(serverMessage)) {
      return false;
    }

    const serverTimestamp = Date.parse(serverMessage.timestamp);
    if (!Number.isFinite(serverTimestamp) || Math.abs(serverTimestamp - realtimeTimestamp) > 5_000) {
      return false;
    }

    const serverContent = String(serverMessage.content || '').trim();
    if (!serverContent) {
      return false;
    }

    if (normalizeSignatureText(serverContent) === normalizeSignatureText(realtimeContent)) {
      return true;
    }

    return realtimeContent.length >= 200 && realtimeContent.length - serverContent.length >= 100;
  });
}

type MessageOrderKind = 'sequence' | 'rowid' | 'timestamp' | 'none';

function getMessageOrderDescriptor(message: NormalizedMessage): { kind: MessageOrderKind; value: number | null } {
  const sequence = toFiniteNumber(message.sequence);
  if (sequence !== null) {
    return { kind: 'sequence', value: sequence };
  }

  const rowid = toFiniteNumber(message.rowid);
  if (rowid !== null) {
    return { kind: 'rowid', value: rowid };
  }

  const timestamp = Date.parse(message.timestamp);
  if (Number.isFinite(timestamp)) {
    return { kind: 'timestamp', value: timestamp };
  }

  return { kind: 'none', value: null };
}

function getMessageSignature(message: NormalizedMessage): string {
  const signatureKind = message.kind === 'stream_delta'
    ? 'text'
    : message.kind === 'tool_use_partial'
      ? 'tool_use'
      : message.kind;

  switch (message.kind) {
    case 'text':
    case 'stream_delta':
    case 'thinking':
      return `${signatureKind}:${message.role || ''}:${normalizeSignatureText(message.content)}`;
    case 'tool_use':
    case 'tool_use_partial':
      return `${signatureKind}:${message.toolName || ''}:${normalizeSignatureText(
        (message.toolInput as { file_path?: string } | null)?.file_path,
      )}`;
    case 'tool_result':
      return `${signatureKind}:${message.toolId || ''}:${normalizeSignatureText(message.content)}`;
    case 'result':
      return `${signatureKind}:${normalizeSignatureText(message.content)}:${normalizeSignatureText(
        JSON.stringify(message.structuredOutput ?? null),
      )}`;
    default:
      return `${signatureKind}:${normalizeSignatureText(message.content)}:${message.toolId || ''}:${message.taskId || ''}`;
  }
}

function dedupeMessagesById(messages: NormalizedMessage[]): NormalizedMessage[] {
  const seenIds = new Set<string>();
  const deduped: NormalizedMessage[] = [];

  for (const message of messages) {
    if (message.id && seenIds.has(message.id)) {
      continue;
    }

    if (message.id) {
      seenIds.add(message.id);
    }
    deduped.push(message);
  }

  return deduped;
}

function sortMessagesByStableOrder(messages: NormalizedMessage[]): NormalizedMessage[] {
  return messages
    .map((message, index) => ({
      message,
      index,
      order: getMessageOrderDescriptor(message),
    }))
    .sort((a, b) => {
      if (a.order.kind === b.order.kind && a.order.value !== null && b.order.value !== null) {
        if (a.order.value !== b.order.value) {
          return a.order.value - b.order.value;
        }
      }
      return a.index - b.index;
    })
    .map(item => item.message);
}

function normalizeMessages(messages: NormalizedMessage[]): NormalizedMessage[] {
  return sortMessagesByStableOrder(dedupeMessagesById(messages));
}

export function appendRealtimeLegacyMessage(
  sessionStore: { appendRealtime: (sessionId: string, msg: NormalizedMessage) => void },
  sessionId: string,
  msg: NormalizedMessage,
) {
  sessionStore.appendRealtime(sessionId, msg);
}

function reconcileRealtimeMessages(
  realtime: NormalizedMessage[],
  server: NormalizedMessage[],
): NormalizedMessage[] {
  if (realtime.length === 0 || server.length === 0) {
    return realtime;
  }

  const serverIds = new Set(server.map(message => message.id).filter(Boolean));
  const serverSignatures = new Set(server.map(getMessageSignature));

  return realtime.filter(message => {
    if (serverIds.has(message.id)) {
      return false;
    }
    if (hasNearbyServerUserMessage(message, server)) {
      return false;
    }
    return !serverSignatures.has(getMessageSignature(message));
  });
}

/**
 * Compute merged messages with stable ordering and source-aware dedupe.
 * Server messages take priority (they're the persisted source of truth).
 * Realtime messages that aren't yet in server stay (in-flight streaming).
 */
function computeMerged(server: NormalizedMessage[], realtime: NormalizedMessage[]): NormalizedMessage[] {
  const normalizedServer = normalizeMessages(server);
  const extraRealtime = reconcileRealtimeMessages(realtime, normalizedServer);
  if (extraRealtime.length === 0) return normalizedServer;
  if (normalizedServer.length === 0) return normalizeMessages(extraRealtime);
  return normalizeMessages([...normalizedServer, ...extraRealtime]);
}

/**
 * Recompute slot.merged only when the input arrays have actually changed
 * (by reference). Returns true if merged was recomputed.
 */
function recomputeMergedIfNeeded(slot: SessionSlot): boolean {
  if (slot.serverMessages === slot._lastServerRef && slot.realtimeMessages === slot._lastRealtimeRef) {
    return false;
  }
  slot._lastServerRef = slot.serverMessages;
  slot._lastRealtimeRef = slot.realtimeMessages;
  slot.merged = computeMerged(slot.serverMessages, slot.realtimeMessages);
  return true;
}

function toNormalizedHistoryMessage(
  message: {
    id: string;
    sessionId: string | null;
    role: 'user' | 'assistant' | 'tool';
    text: string | null;
    timestamp: string;
    kind: string | null;
    type: string | null;
    toolName?: string | null;
    content?: unknown;
  },
  provider: SessionProvider,
): NormalizedMessage {
  const rawKind = typeof message.kind === 'string' && message.kind.trim()
    ? message.kind.trim()
    : typeof message.type === 'string' && message.type.trim()
      ? message.type.trim()
      : null;

  const canonicalHistoryKind = rawKind === 'stream_delta'
    ? 'text'
    : rawKind === 'tool_use_partial'
      ? 'tool_use'
      : rawKind === 'stream_end' || rawKind === 'complete' || rawKind === 'session_created'
        ? 'text'
      : rawKind;

  const normalizedKind = canonicalHistoryKind === 'text'
    || canonicalHistoryKind === 'tool_use'
    || canonicalHistoryKind === 'tool_result'
    || canonicalHistoryKind === 'thinking'
    || canonicalHistoryKind === 'error'
    || canonicalHistoryKind === 'status'
    || canonicalHistoryKind === 'permission_cancelled'
    || canonicalHistoryKind === 'task_notification'
    || canonicalHistoryKind === 'task_started'
    || canonicalHistoryKind === 'task_progress'
    || canonicalHistoryKind === 'result'
    || canonicalHistoryKind === 'compact_boundary'
    || canonicalHistoryKind === 'tool_progress'
    || canonicalHistoryKind === 'tool_use_summary'
    || canonicalHistoryKind === 'auth_status'
    || canonicalHistoryKind === 'files_persisted'
    || canonicalHistoryKind === 'hook_started'
    || canonicalHistoryKind === 'hook_progress'
    || canonicalHistoryKind === 'hook_response'
    || canonicalHistoryKind === 'prompt_suggestion'
    || canonicalHistoryKind === 'rate_limit'
    || canonicalHistoryKind === 'session_status'
    || canonicalHistoryKind === 'debug_ref'
    || canonicalHistoryKind === 'agent_sdk_message'
    || canonicalHistoryKind === 'tool_approval_request'
    || canonicalHistoryKind === 'question_request'
      ? canonicalHistoryKind
      : (message.role === 'tool' ? 'tool_result' : 'text');

  const content = typeof message.text === 'string'
    ? message.text
    : typeof message.content === 'string'
      ? message.content
      : '';

  return {
    id: String(message.id || `${message.sessionId || 'session'}:${message.timestamp}`),
    sessionId: String(message.sessionId || ''),
    timestamp: typeof message.timestamp === 'string' ? message.timestamp : new Date().toISOString(),
    provider,
    kind: normalizedKind,
    role: message.role === 'user' || message.role === 'assistant' ? message.role : undefined,
    content,
    toolName: typeof message.toolName === 'string' ? message.toolName : undefined,
  };
}

function applyHistoryToSlot(
  slot: SessionSlot,
  history: Awaited<ReturnType<typeof fetchSessionHistory>>,
  provider: SessionProvider,
  opts: { appendOlder?: boolean } = {},
) {
  const messages = history.messages.map((message) => toNormalizedHistoryMessage(message, provider));

  if (opts.appendOlder) {
    slot.serverMessages = [...messages, ...slot.serverMessages];
  } else {
    slot.serverMessages = messages;
  }

  slot.total = history.page.total;
  slot.hasMore = Boolean(history.page.hasMore);
  slot.offset = history.page.offset + history.page.returned;
  slot.fetchedAt = Date.now();
}

// ─── Stale threshold ─────────────────────────────────────────────────────────

const STALE_THRESHOLD_MS = 30_000;

const MAX_REALTIME_MESSAGES = 500;

function createNormalizedTransportMessage(
  sessionId: string,
  kind: MessageKind,
  fields: Partial<NormalizedMessage> = {},
): NormalizedMessage {
  return {
    id: fields.id || `${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sessionId,
    timestamp: fields.timestamp || new Date().toISOString(),
    provider: (fields.provider || 'claude') as SessionProvider,
    kind,
    ...fields,
  };
}

export function mapTransportEventToNormalizedMessages(event: Record<string, any>): NormalizedMessage[] {
  if (!event || typeof event !== 'object') {
    return [];
  }

  const sessionId = typeof event.sessionId === 'string' && event.sessionId
    ? event.sessionId
    : typeof event.session_id === 'string' && event.session_id
      ? event.session_id
      : '';

  if (!sessionId) {
    return [];
  }

  if (event.type === 'agent_sdk_message' && event.sdkMessage) {
    return [createNormalizedTransportMessage(sessionId, 'agent_sdk_message', {
      sdkMessage: event.sdkMessage,
      timestamp: event.timestamp,
    })];
  }

  if (event.type === 'tool_approval_request') {
    return [createNormalizedTransportMessage(sessionId, 'tool_approval_request', {
      requestId: event.requestId,
      toolName: event.toolName,
      input: event.input,
      timestamp: event.timestamp,
    })];
  }

  if (event.type === 'question_request') {
    return [createNormalizedTransportMessage(sessionId, 'question_request', {
      requestId: event.requestId,
      questions: Array.isArray(event.questions) ? event.questions : [],
      timestamp: event.timestamp,
    })];
  }

  if (event.type === 'agent_error') {
    return [createNormalizedTransportMessage(sessionId, 'error', {
      content: event.error?.details
        ? `${event.error.message}\n${event.error.details}`
        : event.error?.message || 'Unknown agent error',
      timestamp: event.timestamp,
    })];
  }

  return [];
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useSessionStore() {
  const storeRef = useRef(new Map<string, SessionSlot>());
  const activeSessionIdRef = useRef<string | null>(null);
  // Bump to force re-render — only when the active session's data changes
  const [, setTick] = useState(0);
  const notify = useCallback((sessionId: string) => {
    if (sessionId === activeSessionIdRef.current) {
      setTick(n => n + 1);
    }
  }, []);

  const setActiveSession = useCallback((sessionId: string | null) => {
    activeSessionIdRef.current = sessionId;
  }, []);

  const getSlot = useCallback((sessionId: string): SessionSlot => {
    const store = storeRef.current;
    if (!store.has(sessionId)) {
      store.set(sessionId, createEmptySlot());
    }
    return store.get(sessionId)!;
  }, []);

  const has = useCallback((sessionId: string) => storeRef.current.has(sessionId), []);

  /**
   * Fetch messages from the unified endpoint and populate serverMessages.
   */
  const fetchFromServer = useCallback(async (
    sessionId: string,
    opts: {
      provider?: SessionProvider;
      projectName?: string;
      projectPath?: string;
      limit?: number | null;
      offset?: number;
    } = {},
  ) => {
    const slot = getSlot(sessionId);
    slot.status = 'loading';
    notify(sessionId);

    try {
      const history = await fetchSessionHistory(sessionId, {
        full: opts.limit === null || opts.limit === undefined,
        limit: opts.limit ?? null,
        offset: opts.offset ?? 0,
        force: true,
      });

      applyHistoryToSlot(slot, history, opts.provider || 'claude');
      slot.status = 'idle';
      recomputeMergedIfNeeded(slot);

      notify(sessionId);
      return slot;
    } catch (error) {
      console.error(`[SessionStore] fetch failed for ${sessionId}:`, error);
      slot.status = 'error';
      notify(sessionId);
      return slot;
    }
  }, [getSlot, notify]);

  /**
   * Load older (paginated) messages and prepend to serverMessages.
   */
  const fetchMore = useCallback(async (
    sessionId: string,
    opts: {
      provider?: SessionProvider;
      projectName?: string;
      projectPath?: string;
      limit?: number;
    } = {},
  ) => {
    const slot = getSlot(sessionId);
    if (!slot.hasMore) return slot;

    const limit = opts.limit ?? 20;

    try {
      const history = await fetchSessionHistory(sessionId, {
        limit,
        offset: slot.offset,
        force: true,
      });
      applyHistoryToSlot(slot, history, opts.provider || 'claude', { appendOlder: true });
      recomputeMergedIfNeeded(slot);
      notify(sessionId);
      return slot;
    } catch (error) {
      console.error(`[SessionStore] fetchMore failed for ${sessionId}:`, error);
      return slot;
    }
  }, [getSlot, notify]);

  /**
   * Append a realtime (WebSocket) message to the correct session slot.
   * This works regardless of which session is actively viewed.
   */
  const appendRealtime = useCallback((sessionId: string, msg: NormalizedMessage) => {
    const slot = getSlot(sessionId);
    let updated = normalizeMessages([...slot.realtimeMessages, msg]);
    if (updated.length > MAX_REALTIME_MESSAGES) {
      updated = updated.slice(-MAX_REALTIME_MESSAGES);
    }
    slot.realtimeMessages = updated;
    recomputeMergedIfNeeded(slot);
    notify(sessionId);
  }, [getSlot, notify]);

  /**
   * Append multiple realtime messages at once (batch).
   */
  const appendRealtimeBatch = useCallback((sessionId: string, msgs: NormalizedMessage[]) => {
    if (msgs.length === 0) return;
    const slot = getSlot(sessionId);
    let updated = normalizeMessages([...slot.realtimeMessages, ...msgs]);
    if (updated.length > MAX_REALTIME_MESSAGES) {
      updated = updated.slice(-MAX_REALTIME_MESSAGES);
    }
    slot.realtimeMessages = updated;
    recomputeMergedIfNeeded(slot);
    notify(sessionId);
  }, [getSlot, notify]);

  /**
   * Re-fetch serverMessages from the unified endpoint (e.g., on projects_updated).
   */
  const refreshFromServer = useCallback(async (
    sessionId: string,
    opts: {
      provider?: SessionProvider;
      projectName?: string;
      projectPath?: string;
    } = {},
  ) => {
    const slot = getSlot(sessionId);
    try {
      const history = await fetchSessionHistory(sessionId, {
        full: true,
        force: true,
      });

      applyHistoryToSlot(slot, history, opts.provider || 'claude');
      slot.realtimeMessages = normalizeMessages(
        reconcileRealtimeMessages(slot.realtimeMessages, slot.serverMessages),
      );
      recomputeMergedIfNeeded(slot);
      notify(sessionId);
    } catch (error) {
      console.error(`[SessionStore] refresh failed for ${sessionId}:`, error);
    }
  }, [getSlot, notify]);

  /**
   * Update session status.
   */
  const setStatus = useCallback((sessionId: string, status: SessionStatus) => {
    const slot = getSlot(sessionId);
    slot.status = status;
    notify(sessionId);
  }, [getSlot, notify]);

  /**
   * Check if a session's data is stale (>30s old).
   */
  const isStale = useCallback((sessionId: string) => {
    const slot = storeRef.current.get(sessionId);
    if (!slot) return true;
    return Date.now() - slot.fetchedAt > STALE_THRESHOLD_MS;
  }, []);

  /**
   * Update or create a streaming message (accumulated text so far).
   * Uses a well-known ID so subsequent calls replace the same message.
   */
  const updateStreaming = useCallback((sessionId: string, accumulatedText: string, msgProvider: SessionProvider) => {
    const slot = getSlot(sessionId);
    const streamId = `__streaming_${sessionId}`;
    const msg: NormalizedMessage = {
      id: streamId,
      sessionId,
      timestamp: new Date().toISOString(),
      provider: msgProvider,
      kind: 'stream_delta',
      content: accumulatedText,
    };
    const idx = slot.realtimeMessages.findIndex(m => m.id === streamId);
    if (idx >= 0) {
      slot.realtimeMessages = [...slot.realtimeMessages];
      slot.realtimeMessages[idx] = msg;
    } else {
      slot.realtimeMessages = [...slot.realtimeMessages, msg];
    }
    slot.realtimeMessages = normalizeMessages(slot.realtimeMessages);
    recomputeMergedIfNeeded(slot);
    notify(sessionId);
  }, [getSlot, notify]);

  /**
   * Finalize streaming: convert the streaming message to a regular text message.
   * The well-known streaming ID is replaced with a unique text message ID.
   */
  const finalizeStreaming = useCallback((sessionId: string) => {
    const slot = storeRef.current.get(sessionId);
    if (!slot) return;
    const streamId = `__streaming_${sessionId}`;
    const idx = slot.realtimeMessages.findIndex(m => m.id === streamId);
    if (idx >= 0) {
      const stream = slot.realtimeMessages[idx];
      slot.realtimeMessages = [...slot.realtimeMessages];
      slot.realtimeMessages[idx] = {
        ...stream,
        id: `text_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        kind: 'text',
        role: 'assistant',
      };
      slot.realtimeMessages = normalizeMessages(slot.realtimeMessages);
      recomputeMergedIfNeeded(slot);
      notify(sessionId);
    }
  }, [notify]);

  /**
   * Clear realtime messages for a session (e.g., after stream completes and server fetch catches up).
   */
  const clearRealtime = useCallback((sessionId: string) => {
    const slot = storeRef.current.get(sessionId);
    if (slot) {
      slot.realtimeMessages = [];
      recomputeMergedIfNeeded(slot);
      notify(sessionId);
    }
  }, [notify]);

  /**
   * Get merged messages for a session (for rendering).
   */
  const getMessages = useCallback((sessionId: string): NormalizedMessage[] => {
    return storeRef.current.get(sessionId)?.merged ?? [];
  }, []);

  /**
   * Get session slot (for status, pagination info, etc.).
   */
  const getSessionSlot = useCallback((sessionId: string): SessionSlot | undefined => {
    return storeRef.current.get(sessionId);
  }, []);

  const rebindSession = useCallback((fromSessionId: string, toSessionId: string) => {
    if (!fromSessionId || !toSessionId || fromSessionId === toSessionId) {
      return;
    }

    const store = storeRef.current;
    const sourceSlot = store.get(fromSessionId);
    if (!sourceSlot) {
      return;
    }

    const targetSlot = getSlot(toSessionId);
    const reboundSlot = rebindSessionSlotData(sourceSlot, targetSlot) as SessionSlot;
    reboundSlot._lastServerRef = EMPTY;
    reboundSlot._lastRealtimeRef = EMPTY;
    recomputeMergedIfNeeded(reboundSlot);

    store.set(toSessionId, reboundSlot);
    store.delete(fromSessionId);

    if (activeSessionIdRef.current === fromSessionId) {
      activeSessionIdRef.current = toSessionId;
    }

    notify(fromSessionId);
    notify(toSessionId);
  }, [getSlot, notify]);

  return useMemo(() => ({
    getSlot,
    has,
    fetchFromServer,
    fetchMore,
    appendRealtime,
    appendRealtimeBatch,
    refreshFromServer,
    setActiveSession,
    setStatus,
    isStale,
    updateStreaming,
    finalizeStreaming,
    clearRealtime,
    getMessages,
    getSessionSlot,
    rebindSession,
  }), [
    getSlot, has, fetchFromServer, fetchMore,
    appendRealtime, appendRealtimeBatch, refreshFromServer,
    setActiveSession, setStatus, isStale, updateStreaming, finalizeStreaming,
    clearRealtime, getMessages, getSessionSlot, rebindSession,
  ]);
}

export type SessionStore = ReturnType<typeof useSessionStore>;

export const __testables__ = {
  getMessageSignature,
  reconcileRealtimeMessages,
  computeMerged,
  mapTransportEventToNormalizedMessages,
  toNormalizedHistoryMessage,
};
