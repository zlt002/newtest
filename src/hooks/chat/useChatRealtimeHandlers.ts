import { useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import {
  type PendingDecisionRequest,
  getPendingRequestQuestions,
  isPendingQuestionRequest,
} from '@components/chat/types/types';
import type { SessionStore, NormalizedMessage } from '@stores/useSessionStore';
import { appendRealtimeLegacyMessage } from '@stores/useSessionStore';
import {
  markClientLatencyEvent,
  rebindClientLatencyTrace,
  summarizeClientLatencyTrace,
} from '@components/chat/utils/latencyTrace';
import type { AgentRealtimeEvent } from '@components/chat/projection/projectLiveSdkFeed';
import type { FileChangeEvent } from './chatFileChangeEvents';
import type { DraftPreviewEvent } from './chatDraftPreviewEvents';
import { collectUnseenDraftPreviewEvents } from './chatDraftPreviewEvents.js';
import { collectUnseenFileChangeEvents } from './chatRealtimeFileChangeEvents.js';
import {
  collectDraftPreviewEventsFromAgentV2Event,
  collectRealtimeEventsFromAgentV2Event,
  collectRealtimeEventsFromNormalizedMessage,
  collectRealtimeEventsFromPendingDecisionRequest,
  getAgentV2LatencyMarks,
  resolvePendingSessionHandoff,
  resolvePendingSessionTraceId,
  shouldAdoptSessionCreatedId,
  shouldConsumeAgentV2Event,
  shouldFinalizeActiveRunV2Event,
} from './useChatRealtimeHandlers.helpers';
import { syncCompletedSessionHistory } from './sessionCompletionSync.js';
import {
  resolveStreamingTargetSessionId,
  shouldAppendDeltaAsBackgroundRealtime,
} from './sessionStreamingRouting.js';
import { getUnseenSocketMessageEvents } from '@/contexts/socketMessageEvents';
import { useWebSocket } from '@/contexts/WebSocketContext';
import type { Project, ProjectSession, SessionProvider } from '@/types/app';

type PendingViewSession = {
  sessionId: string | null;
  traceId: string | null;
  startedAt: number;
};

type LatestChatMessage = {
  type?: string;
  kind?: string;
  data?: any;
  message?: any;
  delta?: string;
  sessionId?: string;
  session_id?: string;
  requestId?: string;
  toolName?: string;
  input?: unknown;
  context?: unknown;
  error?: string;
  tool?: any;
  toolId?: string;
  result?: any;
  exitCode?: number;
  isProcessing?: boolean;
  actualSessionId?: string;
  event?: string;
  status?: any;
  isNewSession?: boolean;
  resultText?: string;
  isError?: boolean;
  success?: boolean;
  reason?: string;
  provider?: string;
  content?: string;
  text?: string;
  tokens?: number;
  canInterrupt?: boolean;
  tokenBudget?: unknown;
  newSessionId?: string;
  aborted?: boolean;
  [key: string]: any;
};

interface UseChatRealtimeHandlersArgs {
  provider: SessionProvider;
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  currentSessionId: string | null;
  setCurrentSessionId: (sessionId: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setCanAbortSession: (canAbort: boolean) => void;
  setClaudeStatus: (status: { text: string; tokens: number; can_interrupt: boolean } | null) => void;
  setTokenBudget: (budget: Record<string, unknown> | null) => void;
  setPendingDecisionRequests: Dispatch<SetStateAction<PendingDecisionRequest[]>>;
  pendingViewSessionRef: MutableRefObject<PendingViewSession | null>;
  streamBufferRef: MutableRefObject<string>;
  streamTimerRef: MutableRefObject<number | null>;
  accumulatedStreamRef: MutableRefObject<string>;
  onSessionInactive?: (sessionId?: string | null) => void;
  onSessionProcessing?: (sessionId?: string | null) => void;
  onSessionNotProcessing?: (sessionId?: string | null) => void;
  onReplaceTemporarySession?: (sessionId?: string | null) => void;
  onNavigateToSession?: (sessionId: string) => void;
  onWebSocketReconnect?: () => void;
  onFileChangeEvent?: (event: FileChangeEvent) => void;
  onDraftPreviewEvent?: (event: DraftPreviewEvent) => void;
  sessionStore: SessionStore;
  agentEventStore?: {
    append: (event: any) => void;
    rebindSession?: (fromSessionId: string, toSessionId: string) => void;
  };
  agentRealtimeStore?: {
    append: (event: AgentRealtimeEvent) => void;
    rebindSession?: (fromSessionId: string, toSessionId: string) => void;
  };
}

const isTemporarySessionId = (sessionId: string | null | undefined) =>
  Boolean(sessionId && sessionId.startsWith('new-session-'));

function normalizePendingRequest(
  request: Partial<PendingDecisionRequest> & { toolName?: string; questions?: unknown },
  sessionId: string | null,
): PendingDecisionRequest {
  const questions = Array.isArray(request.questions)
    ? request.questions
    : getPendingRequestQuestions(request as PendingDecisionRequest);
  const kind = request.kind === 'interactive_prompt' || questions.length > 0
    ? 'interactive_prompt'
    : 'permission_request';
  const requestId = request.requestId
    ? String(request.requestId)
    : `pending_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    requestId,
    toolName: request.toolName || 'UnknownTool',
    input: request.input,
    context: request.context,
    sessionId: request.sessionId || sessionId,
    receivedAt: request.receivedAt instanceof Date ? request.receivedAt : new Date(),
    kind,
    ...(questions.length > 0 ? { questions } : {}),
  };
}

function isPendingDecisionRecoveryResponseType(type: string) {
  return type === 'pending-decisions-response' || type === 'pending-permissions-response';
}

function resolvePendingDecisionRecoveryRequests(
  msg: LatestChatMessage,
  sessionId: string | null,
): PendingDecisionRequest[] {
  const approvalRequests = Array.isArray(msg.approvals)
    ? msg.approvals.map((request: PendingDecisionRequest) =>
        normalizePendingRequest({ ...request, kind: 'permission_request' }, sessionId))
    : [];
  const questionRequests = Array.isArray(msg.questions)
    ? msg.questions.map((request: PendingDecisionRequest) =>
        normalizePendingRequest({ ...request, kind: 'interactive_prompt' }, sessionId))
    : [];
  const legacyRequests = Array.isArray(msg.data)
    ? msg.data.map((request: PendingDecisionRequest) => normalizePendingRequest(request, sessionId))
    : [];
  const nextRequests = [...approvalRequests, ...questionRequests];

  return nextRequests.length > 0 ? nextRequests : legacyRequests;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                              */
/* ------------------------------------------------------------------ */

export function useChatRealtimeHandlers({
  provider,
  selectedProject,
  selectedSession,
  currentSessionId,
  setCurrentSessionId,
  setIsLoading,
  setCanAbortSession,
  setClaudeStatus,
  setTokenBudget,
  setPendingDecisionRequests,
  pendingViewSessionRef,
  streamBufferRef,
  streamTimerRef,
  accumulatedStreamRef,
  onSessionInactive,
  onSessionProcessing,
  onSessionNotProcessing,
  onReplaceTemporarySession,
  onNavigateToSession,
  onWebSocketReconnect,
  onFileChangeEvent,
  onDraftPreviewEvent,
  sessionStore,
  agentEventStore,
  agentRealtimeStore,
}: UseChatRealtimeHandlersArgs) {
  const { clientLatencyTraceStore, messageEvents } = useWebSocket();
  const lastProcessedMessageEventIdRef = useRef(0);
  const pendingStreamSessionIdRef = useRef<string | null>(null);
  const pendingHandoffCandidateSessionIdRef = useRef<string | null>(null);
  const emittedFileChangeEventKeysRef = useRef<Set<string>>(new Set());
  const emittedDraftPreviewEventKeysRef = useRef<Set<string>>(new Set());
  const draftPreviewOperationCacheRef = useRef(new Map());

  const flushStreamToStore = (finalize = false) => {
    const streamSessionId = pendingStreamSessionIdRef.current;

    if (streamSessionId && accumulatedStreamRef.current) {
      markClientLatencyEvent(
        clientLatencyTraceStore,
        streamSessionId,
        'first_stream_delta_rendered',
      );
      sessionStore.updateStreaming(streamSessionId, accumulatedStreamRef.current, provider);
    }

    if (finalize && streamSessionId) {
      sessionStore.finalizeStreaming(streamSessionId);
      pendingStreamSessionIdRef.current = null;
    }
  };

  const finalizeActiveRun = (sessionId: string | null) => {
    if (streamTimerRef.current) {
      clearTimeout(streamTimerRef.current);
      streamTimerRef.current = null;
    }
    if (sessionId && !pendingStreamSessionIdRef.current) {
      pendingStreamSessionIdRef.current = sessionId;
    }
    flushStreamToStore(true);
    accumulatedStreamRef.current = '';
    streamBufferRef.current = '';

    setIsLoading(false);
    setCanAbortSession(false);
    setClaudeStatus(null);
    setPendingDecisionRequests([]);
    onSessionInactive?.(sessionId);
    onSessionNotProcessing?.(sessionId);

    if (sessionId && clientLatencyTraceStore.has(sessionId)) {
      const latencySummary = summarizeClientLatencyTrace(clientLatencyTraceStore, sessionId);
      console.log(
        '[ChatLatency]',
        `sessionId=${sessionId}`,
        JSON.stringify({
          durations: latencySummary.durations,
          missing: latencySummary.missing,
          metadata: latencySummary.metadata,
        }),
      );
      clientLatencyTraceStore.delete(sessionId);

      void syncCompletedSessionHistory({
        sessionId,
        provider,
        selectedProject,
        sessionStore,
      });
    }
  };

  useEffect(() => {
    const unseenEvents = getUnseenSocketMessageEvents(
      messageEvents,
      lastProcessedMessageEventIdRef.current,
    );

    if (unseenEvents.length === 0) return;

    for (const event of unseenEvents) {
      const latestMessage = event.data as LatestChatMessage;

      const activeViewSessionId =
        currentSessionId || pendingViewSessionRef.current?.sessionId || selectedSession?.id || null;

    /* ---------------------------------------------------------------- */
    /*  Legacy messages (no `kind` field) — handle and return           */
    /* ---------------------------------------------------------------- */

      const msg = latestMessage as any;

      if (shouldConsumeAgentV2Event(msg)) {
        const runtimeSessionId = typeof msg.sessionId === 'string' && msg.sessionId.trim()
          ? msg.sessionId.trim()
          : null;
        const eventType = typeof msg.type === 'string' ? msg.type : null;
        const eventTraceId = typeof msg.payload?.traceId === 'string' && msg.payload.traceId.trim()
          ? msg.payload.traceId.trim()
          : null;

        if (runtimeSessionId) {
          const pendingSessionId = pendingViewSessionRef.current?.sessionId || null;
          const previousTraceSessionId = isTemporarySessionId(currentSessionId)
            ? currentSessionId
            : isTemporarySessionId(activeViewSessionId)
              ? activeViewSessionId
              : null;
          const handoffTraceId = resolvePendingSessionTraceId({
            currentSessionId,
            activeViewSessionId,
            pendingTraceId: pendingViewSessionRef.current?.traceId || null,
          });

          const handoffResolution = resolvePendingSessionHandoff({
            currentSessionId,
            activeViewSessionId,
            pendingSessionId,
            pendingCandidateSessionId: pendingHandoffCandidateSessionIdRef.current,
            runtimeSessionId,
            eventType,
            eventTraceId,
            handoffTraceId,
            hasPendingSessionHandoff: Boolean(pendingViewSessionRef.current),
          });

          pendingHandoffCandidateSessionIdRef.current =
            handoffResolution.pendingCandidateSessionId;

          if (
            pendingViewSessionRef.current
            && handoffResolution.pendingSessionId
            && handoffResolution.pendingSessionId !== pendingSessionId
          ) {
            pendingViewSessionRef.current.sessionId = handoffResolution.pendingSessionId;
          }

          const shouldAdoptRuntimeSessionId = handoffResolution.shouldAdopt
            || shouldAdoptSessionCreatedId({
              currentSessionId,
              activeViewSessionId,
              pendingSessionId: pendingViewSessionRef.current?.sessionId || null,
              newSessionId: runtimeSessionId,
              eventType,
              eventTraceId,
              handoffTraceId,
              hasPendingSessionHandoff: Boolean(pendingViewSessionRef.current),
            });

          if (shouldAdoptRuntimeSessionId) {
            if (previousTraceSessionId && previousTraceSessionId !== runtimeSessionId) {
              rebindClientLatencyTrace(
                clientLatencyTraceStore,
                previousTraceSessionId,
                runtimeSessionId,
              );
              sessionStore.rebindSession(previousTraceSessionId, runtimeSessionId);
              agentEventStore?.rebindSession?.(previousTraceSessionId, runtimeSessionId);
              agentRealtimeStore?.rebindSession?.(previousTraceSessionId, runtimeSessionId);
              if (pendingStreamSessionIdRef.current === previousTraceSessionId) {
                pendingStreamSessionIdRef.current = runtimeSessionId;
              }
            }
            pendingHandoffCandidateSessionIdRef.current = null;
            sessionStorage.setItem('pendingSessionId', runtimeSessionId);
            if (pendingViewSessionRef.current) {
              pendingViewSessionRef.current.sessionId = runtimeSessionId;
              pendingViewSessionRef.current.traceId = null;
            }
            setCurrentSessionId(runtimeSessionId);
            if (!currentSessionId || currentSessionId.startsWith('new-session-')) {
              onReplaceTemporarySession?.(runtimeSessionId);
            }
            setPendingDecisionRequests((prev) =>
              prev.map((r) => (r.sessionId ? r : { ...r, sessionId: runtimeSessionId })),
            );
            onNavigateToSession?.(runtimeSessionId);
          }
        }

        if (onDraftPreviewEvent && runtimeSessionId) {
          const nextDraftPreviewEvents = collectDraftPreviewEventsFromAgentV2Event({
            event: {
              type: msg.type,
              sessionId: runtimeSessionId,
              timestamp: msg.timestamp,
              payload: msg.payload || {},
            },
            emittedKeys: emittedDraftPreviewEventKeysRef.current,
            draftOperationCache: draftPreviewOperationCacheRef.current,
          });

          for (const draftPreviewEvent of nextDraftPreviewEvents) {
            onDraftPreviewEvent(draftPreviewEvent);
          }
        }

        if (runtimeSessionId) {
          const agentV2LatencyMarks = getAgentV2LatencyMarks(msg);
          if (agentV2LatencyMarks.received) {
            markClientLatencyEvent(clientLatencyTraceStore, runtimeSessionId, agentV2LatencyMarks.received);
          }
        }

        agentEventStore?.append(msg);
        for (const realtimeEvent of collectRealtimeEventsFromAgentV2Event({
          eventId: msg.eventId,
          runId: msg.runId,
          sessionId: runtimeSessionId,
          timestamp: msg.timestamp,
          type: msg.type,
          payload: msg.payload || {},
        })) {
          agentRealtimeStore?.append(realtimeEvent);
        }
        if (runtimeSessionId) {
          const agentV2LatencyMarks = getAgentV2LatencyMarks(msg);
          if (agentV2LatencyMarks.rendered) {
            markClientLatencyEvent(clientLatencyTraceStore, runtimeSessionId, agentV2LatencyMarks.rendered);
          }
        }
        if (
          msg.type === 'run.completed'
          || msg.type === 'run.failed'
          || msg.type === 'run.aborted'
        ) {
          const payload = msg.payload || {};
          if (msg.type === 'run.completed' && payload.tokenUsage && typeof payload.tokenUsage === 'object' && !payload.isCompactOperation) {
            setTokenBudget(payload.tokenUsage as Record<string, unknown>);
          }

          const shouldFinalizeCurrentUi = shouldFinalizeActiveRunV2Event({
            eventSessionId: runtimeSessionId,
            currentSessionId,
            activeViewSessionId,
            pendingSessionId: pendingViewSessionRef.current?.sessionId || null,
          });

          if (!shouldFinalizeCurrentUi) {
            continue;
          }

          finalizeActiveRun(runtimeSessionId);
        }
        continue;
      }

      if (!msg.kind) {
      const messageType = String(msg.type || '');

        if (isPendingDecisionRecoveryResponseType(messageType)) {
          if (messageType !== 'pending-decisions-response') {
            const permSessionId = msg.sessionId;
            const isCurrentPermSession =
              permSessionId === currentSessionId || (selectedSession && permSessionId === selectedSession.id);
            if (permSessionId && !isCurrentPermSession) return;
            const resolvedRequests = resolvePendingDecisionRecoveryRequests(msg, permSessionId || null);
            setPendingDecisionRequests(resolvedRequests);
            for (const request of resolvedRequests) {
              for (const realtimeEvent of collectRealtimeEventsFromPendingDecisionRequest(
                request,
                permSessionId || null,
              )) {
                agentRealtimeStore?.append(realtimeEvent);
              }
            }
            continue;
          }
        }

        switch (messageType) {
        case 'websocket-reconnected':
          onWebSocketReconnect?.();
            continue;

        case 'pending-decisions-response': {
          const permSessionId = msg.sessionId;
          const isCurrentPermSession =
            permSessionId === currentSessionId || (selectedSession && permSessionId === selectedSession.id);
          if (permSessionId && !isCurrentPermSession) return;
          const resolvedRequests = resolvePendingDecisionRecoveryRequests(msg, permSessionId || null);
          setPendingDecisionRequests(resolvedRequests);
          for (const request of resolvedRequests) {
            for (const realtimeEvent of collectRealtimeEventsFromPendingDecisionRequest(
              request,
              permSessionId || null,
            )) {
              agentRealtimeStore?.append(realtimeEvent);
            }
          }
            continue;
        }

        case 'session-status': {
          const statusSessionId = msg.sessionId;
          if (!statusSessionId) return;

          const status = msg.status;
          if (status) {
            const statusInfo = {
              text: status.text || 'Working...',
              tokens: status.tokens || 0,
              can_interrupt: status.can_interrupt !== undefined ? status.can_interrupt : true,
            };
            setClaudeStatus(statusInfo);
            setIsLoading(true);
            setCanAbortSession(statusInfo.can_interrupt);
            agentRealtimeStore?.append({
              id: `session.status:${statusSessionId}:${event.id}`,
              type: 'session.status',
              sessionId: statusSessionId,
              timestamp: new Date().toISOString(),
              status: 'working',
              detail: statusInfo.text,
            });
            return;
          }

          // Legacy isProcessing format from check-session-status
          const isCurrentSession =
            statusSessionId === currentSessionId || (selectedSession && statusSessionId === selectedSession.id);

          if (msg.isProcessing) {
            onSessionProcessing?.(statusSessionId);
            if (isCurrentSession) { setIsLoading(true); setCanAbortSession(true); }
            agentRealtimeStore?.append({
              id: `session.status:${statusSessionId}:${event.id}:processing`,
              type: 'session.status',
              sessionId: statusSessionId,
              timestamp: new Date().toISOString(),
              status: 'processing',
            });
              continue;
          }
          onSessionInactive?.(statusSessionId);
          onSessionNotProcessing?.(statusSessionId);
          if (isCurrentSession) {
            setIsLoading(false);
            setCanAbortSession(false);
            setClaudeStatus(null);
          }
          agentRealtimeStore?.append({
            id: `session.status:${statusSessionId}:${event.id}:idle`,
            type: 'session.status',
            sessionId: statusSessionId,
            timestamp: new Date().toISOString(),
            status: 'idle',
          });
            continue;
        }

        case 'error': {
          console.error('[ChatRealtime] Legacy transport error:', msg.error || msg.content || 'unknown error');
          setIsLoading(false);
          setCanAbortSession(false);
          setClaudeStatus(null);
          continue;
        }

        default:
          // Unknown legacy message type — ignore
          continue;
        }
      }

      /* ---------------------------------------------------------------- */
      /*  NormalizedMessage handling (has `kind` field)                    */
      /* ---------------------------------------------------------------- */

      const sid = msg.sessionId || activeViewSessionId;

      if (msg.kind === 'thinking' && sid) {
        markClientLatencyEvent(clientLatencyTraceStore, sid, 'first_thinking_received');
      }

    // --- Streaming: buffer for performance ---
      if (msg.kind === 'stream_delta') {
      const text = msg.content || '';
      if (!text) return;
      const targetStreamSessionId = resolveStreamingTargetSessionId({
        streamSessionId: sid,
        activeViewSessionId,
      });
      if (sid) {
        pendingStreamSessionIdRef.current = targetStreamSessionId || sid;
        markClientLatencyEvent(clientLatencyTraceStore, sid, 'first_stream_delta_received');
      }
      streamBufferRef.current += text;
      accumulatedStreamRef.current += text;
      if (!streamTimerRef.current) {
        streamTimerRef.current = window.setTimeout(() => {
          streamTimerRef.current = null;
          flushStreamToStore();
        }, 100);
      }
      // Also route to store for non-active sessions
      if (shouldAppendDeltaAsBackgroundRealtime({
        streamSessionId: sid,
        activeViewSessionId,
      })) {
        appendRealtimeLegacyMessage(sessionStore, sid, msg as NormalizedMessage);
      }
        continue;
      }

      if (msg.kind === 'stream_end') {
      if (streamTimerRef.current) {
        clearTimeout(streamTimerRef.current);
        streamTimerRef.current = null;
      }
      if (sid && !pendingStreamSessionIdRef.current) {
        pendingStreamSessionIdRef.current = resolveStreamingTargetSessionId({
          streamSessionId: sid,
          activeViewSessionId,
        }) || sid;
      }
      flushStreamToStore(true);
      accumulatedStreamRef.current = '';
      streamBufferRef.current = '';
        continue;
      }

    // --- All other messages: route to store ---
      if (sid) {
      appendRealtimeLegacyMessage(sessionStore, sid, msg as NormalizedMessage);
      for (const realtimeEvent of collectRealtimeEventsFromNormalizedMessage(msg, sid)) {
        agentRealtimeStore?.append(realtimeEvent);
      }

      if (onFileChangeEvent && (msg.kind === 'tool_use' || msg.kind === 'tool_result')) {
        const nextEvents = collectUnseenFileChangeEvents(
          sessionStore.getMessages(sid),
          emittedFileChangeEventKeysRef.current,
        );

        for (const event of nextEvents) {
          onFileChangeEvent(event);
        }
      }

      if (onDraftPreviewEvent && (msg.kind === 'tool_use_partial' || msg.kind === 'tool_use' || msg.kind === 'tool_result')) {
        const nextDraftEvents = collectUnseenDraftPreviewEvents(
          sessionStore.getMessages(sid),
          emittedDraftPreviewEventKeysRef.current,
        );

        for (const event of nextDraftEvents) {
          onDraftPreviewEvent(event);
        }
      }
    }

    // --- UI side effects for specific kinds ---
      switch (msg.kind) {
      case 'error': {
        setIsLoading(false);
        setCanAbortSession(false);
        setClaudeStatus(null);
        onSessionInactive?.(sid);
        onSessionNotProcessing?.(sid);
          break;
      }

      case 'interactive_prompt':
      case 'permission_request': {
        const requestId = msg.requestId || `${msg.kind || 'permission_request'}_${Date.now()}`;
        const normalizedRequest = normalizePendingRequest({
          requestId,
          toolName: msg.toolName || 'UnknownTool',
          input: msg.input,
          context: msg.context,
          questions: msg.questions,
          sessionId: sid || null,
          kind: msg.kind === 'interactive_prompt' ? 'interactive_prompt' : 'permission_request',
          receivedAt: new Date(),
        }, sid || null);

        if (isPendingQuestionRequest(normalizedRequest)) {
          setPendingDecisionRequests((prev) => {
            if (prev.some((r: PendingDecisionRequest) => r.requestId === normalizedRequest.requestId)) {
              return prev;
            }
            return [...prev, normalizedRequest];
          });
          setIsLoading(true);
          setCanAbortSession(true);
          setClaudeStatus({ text: '等待你的回答', tokens: 0, can_interrupt: true });
          break;
        }

        if (!msg.requestId) break;
        setPendingDecisionRequests((prev) => {
          if (prev.some((r: PendingDecisionRequest) => r.requestId === msg.requestId)) return prev;
          return [...prev, {
            requestId: msg.requestId,
            toolName: msg.toolName || 'UnknownTool',
            input: msg.input,
            context: msg.context,
            sessionId: sid || null,
            receivedAt: new Date(),
            kind: 'permission_request',
          }];
        });
        setIsLoading(true);
        setCanAbortSession(true);
        setClaudeStatus({ text: '等待授权', tokens: 0, can_interrupt: true });
          break;
      }

      case 'permission_cancelled': {
        if (msg.requestId) {
          setPendingDecisionRequests((prev) => prev.filter((r: PendingDecisionRequest) => r.requestId !== msg.requestId));
        }
          break;
      }

      case 'status': {
        if (msg.text === 'token_budget' && msg.tokenBudget) {
          setTokenBudget(msg.tokenBudget as Record<string, unknown>);
        } else if (msg.text) {
          setClaudeStatus({
            text: msg.text,
            tokens: msg.tokens || 0,
            can_interrupt: msg.canInterrupt !== undefined ? msg.canInterrupt : true,
          });
          setIsLoading(true);
          setCanAbortSession(msg.canInterrupt !== false);
        }
          break;
      }

      // text, tool_use, tool_result, thinking, interactive_prompt, task_notification
      // → already routed to store above, no UI side effects needed
      default:
          break;
      }
    }

    lastProcessedMessageEventIdRef.current = unseenEvents[unseenEvents.length - 1].id;
  }, [
    messageEvents,
    provider,
    selectedProject,
    selectedSession,
    currentSessionId,
    clientLatencyTraceStore,
    setCurrentSessionId,
    setIsLoading,
    setCanAbortSession,
    setClaudeStatus,
    setTokenBudget,
    setPendingDecisionRequests,
    pendingViewSessionRef,
    streamBufferRef,
    streamTimerRef,
    accumulatedStreamRef,
    onSessionInactive,
    onSessionProcessing,
    onSessionNotProcessing,
    onReplaceTemporarySession,
    onNavigateToSession,
    onWebSocketReconnect,
    onFileChangeEvent,
    onDraftPreviewEvent,
    sessionStore,
    agentEventStore,
    agentRealtimeStore,
  ]);
}
