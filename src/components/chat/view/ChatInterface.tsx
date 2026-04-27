// 旧聊天界面里的 V2 桥接层。
// 它把 chat 状态、实时消息、V2 事件流和会话壳组件拼到同一个页面里。
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type ChatInterfaceProps,
  type PendingDecisionRequest,
  isPendingQuestionRequest,
} from '../types/types';
import { useChatProviderState } from '@hooks/chat/useChatProviderState';
import { useChatSessionState } from '@hooks/chat/useChatSessionState';
import { useChatRealtimeHandlers } from '@hooks/chat/useChatRealtimeHandlers';
import { useChatComposerState } from '@hooks/chat/useChatComposerState';
import { resolveVisibleChatSessionId } from '@hooks/chat/chatSessionViewState';
import { useSessionStore } from '../../../stores/useSessionStore';
import { authenticatedFetch } from '../../../utils/api';
import { ComposerContextBar } from '../components/ComposerContextBar';
import { createAgentEventStore } from '../store/createAgentEventStore';
import { createSessionRealtimeStore } from '../store/createSessionRealtimeStore';
import { useAgentConversation } from '@hooks/chat/useAgentConversation';
import { useHistoricalAgentConversation } from '@hooks/chat/useHistoricalAgentConversation.ts';
import { mergeHistoricalChatMessages, projectHistoricalChatMessages } from '../projection/projectHistoricalChatMessages.ts';
import { projectHistoricalRunCards, projectLiveRunCards } from '../projection/projectRunCards.ts';
import { projectConversationTurns } from '../projection/projectConversationTurns.ts';
import { projectConversationRounds } from '../projection/projectConversationRounds.ts';
import type { AssistantCardViewModel } from '../types/conversationRound.ts';
import type { RunCard as RunCardModel } from '../types/runCard.ts';
import { historicalRunCardsCoverLiveRunCards } from './runCardCoverage.ts';
import type { ClaudeEffortLevel } from '../constants/thinkingModes';
import { createAgentV2RealtimeCoordinator } from './agentV2Realtime';
import { resolveAgentComposerState } from './agentComposerState';
import ChatComposer from './subcomponents/ChatComposer';
import ChatMessagesPane from './subcomponents/ChatMessagesPane';
import type { OutputFormatConfig } from '../types/transport.ts';
import type { RightPaneTarget } from '../../right-pane/types.ts';


type PendingViewSession = {
  sessionId: string | null;
  traceId: string | null;
  startedAt: number;
};

type PendingCompactWorkflow = {
  sourceSessionId: string | null;
  startedAt: number;
};

type PendingRealtimeCleanup = {
  sessionId: string;
  baselineMessageCount: number;
  baselineLastMessageId: string | null;
};

type HistoricalLoadAllUiState = {
  isLoadingAllMessages: boolean;
  loadAllJustFinished: boolean;
  showLoadAllOverlay: boolean;
};

function hasCompletedHistoricalAssistantReply(messages: Array<{ kind?: string | null; role?: string | null; text?: string | null; content?: string | null | unknown }>) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.kind === 'text' && message?.role === 'assistant') {
      return Boolean(String(message?.content || message?.text || '').trim());
    }
  }

  return false;
}

function mergeRunCards(historicalRunCards: RunCardModel[], liveRunCards: RunCardModel[]) {
  if (historicalRunCards.length === 0) {
    return liveRunCards;
  }

  if (liveRunCards.length === 0) {
    return historicalRunCards;
  }

  const merged = [...historicalRunCards];
  const anchorIndexById = new Map<string, number>();

  historicalRunCards.forEach((card, index) => {
    const anchorMessageId = String(card.anchorMessageId || '').trim();
    if (anchorMessageId) {
      anchorIndexById.set(anchorMessageId, index);
    }
  });

  for (const card of liveRunCards) {
    const anchorMessageId = String(card.anchorMessageId || '').trim();
    if (!anchorMessageId) {
      merged.push(card);
      continue;
    }

    const existingIndex = anchorIndexById.get(anchorMessageId);
    if (existingIndex == null) {
      anchorIndexById.set(anchorMessageId, merged.length);
      merged.push(card);
      continue;
    }

    merged[existingIndex] = card;
  }

  return merged;
}

function buildFallbackRunCard(
  request: PendingDecisionRequest,
  sessionId: string | null,
): RunCardModel {
  const receivedAt = request.receivedAt instanceof Date
    ? request.receivedAt.toISOString()
    : new Date().toISOString();
  const kind = isPendingQuestionRequest(request) ? 'interactive_prompt' : 'permission_request';

  return {
    sessionId: request.sessionId || sessionId || '',
    anchorMessageId: '',
    cardStatus: 'waiting_for_input',
    headline: kind === 'interactive_prompt' ? '等待你的回答' : '等待授权',
    finalResponse: '',
    processItems: [],
    activeInteraction: {
      requestId: request.requestId,
      kind,
      toolName: request.toolName || 'UnknownTool',
      message: kind === 'interactive_prompt' ? '需要你的回答' : '需要你的授权',
      input: request.input,
      context: request.context,
      payload: null,
    },
    startedAt: receivedAt,
    updatedAt: receivedAt,
    completedAt: null,
    defaultExpanded: false,
    source: 'sdk-live',
  };
}

function mergePendingRequestsIntoRunCards(
  runCards: RunCardModel[],
  pendingDecisionRequests: PendingDecisionRequest[],
  sessionId: string | null,
) {
  if (!pendingDecisionRequests.length) {
    return runCards;
  }

  const pendingRequestIds = new Set(
    runCards
      .map((card) => card.activeInteraction?.requestId)
      .filter((requestId): requestId is string => Boolean(requestId)),
  );

  const fallbackCards = pendingDecisionRequests
    .filter((request) => {
      if (request.sessionId && sessionId && request.sessionId !== sessionId) {
        return false;
      }

      return !pendingRequestIds.has(request.requestId);
    })
    .map((request) => buildFallbackRunCard(request, sessionId));

  if (fallbackCards.length === 0) {
    return runCards;
  }

  return [...runCards, ...fallbackCards];
}

function hasVisibleAssistantSurface(assistantCard: AssistantCardViewModel) {
  if (assistantCard.activeInteraction) {
    return true;
  }

  if (assistantCard.processItems.length > 0) {
    return true;
  }

  if (assistantCard.responseSegments.some((segment) => Boolean(String(segment.body || '').trim()))) {
    return true;
  }

  return false;
}

function getActiveContextFilePath(target: RightPaneTarget | null | undefined) {
  if (!target || !('filePath' in target) || typeof target.filePath !== 'string') {
    return null;
  }

  const filePath = target.filePath.trim();
  return filePath || null;
}

function getActiveContextFileName(filePath: string | null) {
  if (!filePath) {
    return '';
  }

  const normalized = filePath.replace(/\\/g, '/');
  return normalized.split('/').pop() || filePath;
}

function ChatInterface({
  selectedProject,
  selectedSession,
  ws,
  sendMessage,
  latestMessage,
  onFileOpen,
  onOpenUrl,
  onInputFocusChange,
  onSessionActive,
  onSessionInactive,
  onSessionProcessing,
  onSessionNotProcessing,
  processingSessions,
  onReplaceTemporarySession,
  onNavigateToSession,
  onStartNewSession,
  onShowSettings,
  autoExpandTools,
  showRawParameters,
  showThinking,
  autoScrollToBottom,
  sendByCtrlEnter,
  externalMessageUpdate,
  onTaskClick,
  onComposerAppendReady,
  onFileChangeEvent,
  onDraftPreviewEvent,
  activeContextTarget = null,
}: ChatInterfaceProps) {
  const { t } = useTranslation('chat');
  const [observabilityStatus, setObservabilityStatus] = useState<{
    enabled: boolean;
    provider: string | null;
    projectName: string | null;
    dashboardUrl: string | null;
  } | null>(null);

  const sessionStore = useSessionStore();
  // V2 事件 store 只保存原始事件，UI 需要时再做投影。
  const agentEventStoreRef = useRef(createAgentEventStore());
  const agentRealtimeStoreRef = useRef(createSessionRealtimeStore<any>());
  const [agentEventVersion, setAgentEventVersion] = useState(0);
  const [agentRealtimeVersion, setAgentRealtimeVersion] = useState(0);
  const [historicalLoadAllUiState, setHistoricalLoadAllUiState] = useState<HistoricalLoadAllUiState>({
    isLoadingAllMessages: false,
    loadAllJustFinished: false,
    showLoadAllOverlay: false,
  });
  const streamBufferRef = useRef('');
  const streamTimerRef = useRef<number | null>(null);
  const accumulatedStreamRef = useRef('');
  const pendingViewSessionRef = useRef<PendingViewSession | null>(null);
  const pendingCompactWorkflowRef = useRef<PendingCompactWorkflow | null>(null);
  const pendingCompactionSeedRef = useRef<string | null>(null);
  const pendingRealtimeCleanupSessionRef = useRef<PendingRealtimeCleanup | null>(null);
  const missingAssistantRecoveryRef = useRef<string | null>(null);
  const previousHadActiveExecutionRef = useRef(false);
  const historicalLoadAllOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historicalLoadAllFinishedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousHistoricalLoadingOlderRef = useRef(false);
  const pendingHistoricalLoadAllRef = useRef(false);
  const historicalLoadAllObservedLoadingRef = useRef(false);

  const clearHistoricalLoadAllTimers = useCallback(() => {
    if (historicalLoadAllOverlayTimerRef.current) {
      clearTimeout(historicalLoadAllOverlayTimerRef.current);
      historicalLoadAllOverlayTimerRef.current = null;
    }

    if (historicalLoadAllFinishedTimerRef.current) {
      clearTimeout(historicalLoadAllFinishedTimerRef.current);
      historicalLoadAllFinishedTimerRef.current = null;
    }
  }, []);

  const resetStreamingState = useCallback(() => {
    if (streamTimerRef.current) {
      clearTimeout(streamTimerRef.current);
      streamTimerRef.current = null;
    }
    streamBufferRef.current = '';
    accumulatedStreamRef.current = '';
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadObservabilityStatus = async () => {
      try {
        const response = await authenticatedFetch('/api/observability/status');
        if (!response.ok) {
          return;
        }

        const payload = await response.json();
        if (!cancelled) {
          setObservabilityStatus({
            enabled: Boolean(payload?.enabled),
            provider: payload?.provider || null,
            projectName: payload?.projectName || null,
            dashboardUrl: payload?.dashboardUrl || null,
          });
        }
      } catch {
        if (!cancelled) {
          setObservabilityStatus(null);
        }
      }
    };

    void loadObservabilityStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  const {
    provider,
    claudeModel,
    setClaudeModel,
    permissionMode,
    pendingDecisionRequests,
    setPendingDecisionRequests,
    cyclePermissionMode,
  } = useChatProviderState({
    selectedSession,
  });

  useEffect(() => {
    return agentEventStoreRef.current.subscribe(() => {
      setAgentEventVersion((value) => value + 1);
    });
  }, []);

  useEffect(() => {
    return agentRealtimeStoreRef.current.subscribe(() => {
      setAgentRealtimeVersion((value) => value + 1);
    });
  }, []);

  const {
    chatMessages,
    addMessage,
    clearMessages,
    rewindMessages,
    isLoading,
    setIsLoading,
    currentSessionId,
    setCurrentSessionId,
    isLoadingSessionMessages,
    canAbortSession,
    setCanAbortSession,
    isUserScrolledUp,
    setIsUserScrolledUp,
    tokenBudget,
    setTokenBudget,
    claudeStatus,
    setClaudeStatus,
    createDiff,
    scrollContainerRef,
    scrollToBottom,
    scrollToBottomAndReset,
    handleScroll,
  } = useChatSessionState({
    selectedProject,
    selectedSession,
    ws,
    sendMessage,
    autoScrollToBottom,
    externalMessageUpdate,
    processingSessions,
    resetStreamingState,
    pendingViewSessionRef,
    sessionStore,
    disableSelectedSessionServerHydration: Boolean(selectedSession?.id),
  });

  const handleCompactWorkflowStart = useCallback((sourceSessionId: string | null) => {
    if (!sourceSessionId) {
      pendingCompactWorkflowRef.current = null;
      return;
    }

    pendingCompactWorkflowRef.current = {
      sourceSessionId,
      startedAt: Date.now(),
    };
  }, []);

  const agentRealtimeCoordinatorRef = useRef(createAgentV2RealtimeCoordinator({
    sendMessage,
    appendEvent: (event) => {
      agentEventStoreRef.current.append(event);
    },
  }));

  useEffect(() => {
    agentRealtimeCoordinatorRef.current = createAgentV2RealtimeCoordinator({
      sendMessage,
      appendEvent: (event) => {
        agentEventStoreRef.current.append(event);
      },
    });
  }, [sendMessage]);

  const listAgentSessionEvents = useCallback(
    (sessionId: string) => agentEventStoreRef.current.listBySession(sessionId),
    [],
  );
  const listAgentRealtimeEvents = useCallback(
    (sessionId: string) => agentRealtimeStoreRef.current.listBySession(sessionId),
    [],
  );
  const submitAgentRun = useCallback(async ({
    prompt,
    projectPath,
    sessionId,
    model,
    effort,
    permissionMode,
    sessionSummary,
    images,
    toolsSettings,
    traceId,
    outputFormat,
    contextFilePaths,
  }: {
    prompt: string;
    projectPath: string;
    sessionId: string | null;
    model: string;
    effort?: ClaudeEffortLevel;
    permissionMode: string;
    sessionSummary: string | null;
    images: unknown[];
    toolsSettings: Record<string, unknown>;
    traceId: string;
    outputFormat?: OutputFormatConfig;
    contextFilePaths?: string[];
  }) => {
    // 最终由 realtime coordinator 负责把输入打包成 chat transport 消息。
    agentRealtimeCoordinatorRef.current.submitRun({
      prompt,
      projectPath,
      sessionId,
      model,
      effort,
      permissionMode,
      sessionSummary,
      images,
      toolsSettings,
      traceId,
      outputFormat,
      contextFilePaths,
    });
  }, []);

  const {
    input,
    textareaRef,
    inputHighlightRef,
    isTextareaExpanded,
    thinkingMode,
    setThinkingMode,
    slashCommandsCount,
    filteredCommands,
    frequentCommands,
    commandQuery,
    showCommandMenu,
    selectedCommandIndex,
    resetCommandMenuState,
    handleCommandSelect,
    handleToggleCommandMenu,
    showFileDropdown,
    filteredFiles,
    selectedFileIndex,
    renderInputWithMentions,
    selectFile,
    attachedImages,
    setAttachedImages,
    uploadingImages,
    imageErrors,
    getRootProps,
    getInputProps,
    isDragActive,
    openImagePicker,
    handleSubmit,
    handleInputChange,
    handleKeyDown,
    handlePaste,
    handleTextareaClick,
    handleTextareaInput,
    syncInputOverlayScroll,
    handleClearInput,
    handleAbortSession,
    handleTranscript,
    appendExternalInput,
    handlePermissionDecision,
    handleGrantToolPermission,
    handleInputFocusChange,
    isInputFocused,
    isContextFileEnabled,
    setIsContextFileEnabled,
  } = useChatComposerState({
    selectedProject,
    selectedSession,
    currentSessionId,
    setCurrentSessionId,
    provider,
    permissionMode,
    cyclePermissionMode,
    claudeModel,
    setClaudeModel,
    isLoading,
    canAbortSession,
    tokenBudget,
    chatMessages,
    sendMessage,
    sendByCtrlEnter,
    onSessionActive,
    onSessionProcessing,
    onNavigateToSession,
    onCompactWorkflowStart: handleCompactWorkflowStart,
    onInputFocusChange,
    onFileOpen,
    activeContextFilePath: getActiveContextFilePath(activeContextTarget),
    onShowSettings,
    pendingCompactionSeedRef,
    pendingViewSessionRef,
    scrollToBottom,
    addMessage,
    clearMessages,
    rewindMessages,
    setIsLoading,
    setCanAbortSession,
    setClaudeStatus,
    setIsUserScrolledUp,
    pendingDecisionRequests,
    setPendingDecisionRequests,
    submitAgentRun,
  });

  const activeAgentSessionId = resolveVisibleChatSessionId({
    selectedSessionId: selectedSession?.id || null,
    currentSessionId,
    pendingSessionId: pendingViewSessionRef.current?.sessionId || null,
  });

  const historicalAgentConversation = useHistoricalAgentConversation({
    sessionId: activeAgentSessionId,
  });
  const historicalChatMessages = React.useMemo(
    () => projectHistoricalChatMessages(historicalAgentConversation.history?.messages || []),
    [historicalAgentConversation.history?.messages],
  );
  const mergedChatMessages = React.useMemo(
    () => mergeHistoricalChatMessages(historicalChatMessages, chatMessages),
    [chatMessages, historicalChatMessages],
  );
  const mergedVisibleMessages = React.useMemo(() => mergedChatMessages, [mergedChatMessages]);
  const loadedCanonicalMessageCount = historicalAgentConversation.history?.messages.length || 0;
  const renderableUserMessages = React.useMemo(
    () => mergedChatMessages.filter((message) => message.type === 'user'),
    [mergedChatMessages],
  );

  const historicalRunCards = React.useMemo(
    () => projectHistoricalRunCards(historicalAgentConversation.history?.messages || []),
    [historicalAgentConversation.history?.messages],
  );
  const liveRunCards = React.useMemo(() => {
    if (!activeAgentSessionId) {
      return [];
    }

    const realtimeEvents = listAgentRealtimeEvents(activeAgentSessionId);
    if (realtimeEvents.length === 0) {
      return [];
    }

    const anchoredUserMessages = renderableUserMessages.map((message) => ({
      messageId: String(message.id || message.messageId || '').trim(),
      content: String(message.content || ''),
      timestamp: String(message.timestamp || ''),
    })).filter((message) => Boolean(message.messageId));

    return projectLiveRunCards({
      sessionId: activeAgentSessionId,
      anchoredUserMessages,
      events: realtimeEvents,
    });
  }, [activeAgentSessionId, agentRealtimeVersion, listAgentRealtimeEvents, renderableUserMessages]);
  const runCards = React.useMemo(
    () => mergeRunCards(historicalRunCards, liveRunCards),
    [historicalRunCards, liveRunCards],
  );
  const runCardsWithPendingFallback = React.useMemo(
    () => mergePendingRequestsIntoRunCards(runCards, pendingDecisionRequests, activeAgentSessionId),
    [activeAgentSessionId, pendingDecisionRequests, runCards],
  );
  const conversationTurns = React.useMemo(
    () => {
      const realtimeEvents = activeAgentSessionId
        ? listAgentRealtimeEvents(activeAgentSessionId)
        : [];

      return projectConversationTurns({
        sessionId: activeAgentSessionId,
        historicalMessages: historicalAgentConversation.history?.messages || [],
        transientMessages: mergedChatMessages,
        realtimeEvents,
        pendingDecisionRequests,
        isLoading,
      });
    },
    [
      activeAgentSessionId,
      agentRealtimeVersion,
      historicalAgentConversation.history?.messages,
      isLoading,
      listAgentRealtimeEvents,
      mergedChatMessages,
      pendingDecisionRequests,
    ],
  );
  const conversationRounds = React.useMemo(
    () => projectConversationRounds({
      sessionId: activeAgentSessionId,
      conversationTurns,
      fallbackRunCards: runCardsWithPendingFallback,
    }),
    [activeAgentSessionId, conversationTurns, runCardsWithPendingFallback],
  );
  const hasVisibleAssistantCard = conversationRounds.some((round) => hasVisibleAssistantSurface(round.assistantCard));

  const agentConversation = useAgentConversation({
    eventVersion: agentEventVersion,
    sessionId: activeAgentSessionId,
    listEventsBySession: listAgentSessionEvents,
    pendingDecisionRequests,
  });
  const hasActiveExecution = agentConversation.execution?.presentationMode === 'active';
  useEffect(() => {
    previousHadActiveExecutionRef.current = false;
    pendingRealtimeCleanupSessionRef.current = null;
    missingAssistantRecoveryRef.current = null;
  }, [activeAgentSessionId]);
  useEffect(() => {
    const previousHadActiveExecution = previousHadActiveExecutionRef.current;
    if (previousHadActiveExecution && !hasActiveExecution && activeAgentSessionId) {
      const baselineMessages = historicalAgentConversation.history?.messages || [];
      pendingRealtimeCleanupSessionRef.current = {
        sessionId: activeAgentSessionId,
        baselineMessageCount: baselineMessages.length,
        baselineLastMessageId: baselineMessages[baselineMessages.length - 1]?.id || null,
      };
    }

    previousHadActiveExecutionRef.current = hasActiveExecution;
  }, [
    activeAgentSessionId,
    hasActiveExecution,
    historicalAgentConversation.history?.messages,
    historicalAgentConversation.refresh,
  ]);
  useEffect(() => {
    const pendingRealtimeCleanup = pendingRealtimeCleanupSessionRef.current;
    const hydratedMessages = historicalAgentConversation.history?.messages || [];
    const hydratedHistorySessionId = historicalAgentConversation.history?.sessionId || null;
    const hydratedMessageCount = hydratedMessages.length;
    const hydratedLastMessageId = hydratedMessages[hydratedMessages.length - 1]?.id || null;
    if (
      !pendingRealtimeCleanup
      || hasActiveExecution
      || historicalAgentConversation.isLoading
      || historicalAgentConversation.error
      || hydratedHistorySessionId !== pendingRealtimeCleanup.sessionId
    ) {
      return;
    }

    const historyCaughtUp = hydratedMessageCount > pendingRealtimeCleanup.baselineMessageCount
      || hydratedLastMessageId !== pendingRealtimeCleanup.baselineLastMessageId;
    if (!historyCaughtUp) {
      return;
    }

    if (!historicalRunCardsCoverLiveRunCards(historicalRunCards, liveRunCards)) {
      return;
    }

    agentRealtimeStoreRef.current.clearSession(pendingRealtimeCleanup.sessionId);
    pendingRealtimeCleanupSessionRef.current = null;
  }, [
    historicalRunCards,
    hasActiveExecution,
    historicalAgentConversation.error,
    historicalAgentConversation.history,
    historicalAgentConversation.isLoading,
    liveRunCards,
  ]);
  useEffect(() => {
    if (
      !activeAgentSessionId
      || hasActiveExecution
      || agentConversation.hasBlockingDecision
      || historicalAgentConversation.isLoading
      || historicalAgentConversation.error
      || historicalAgentConversation.history?.sessionId !== activeAgentSessionId
      || pendingRealtimeCleanupSessionRef.current
    ) {
      return;
    }

    const hydratedMessages = historicalAgentConversation.history?.messages || [];
    if (!hasCompletedHistoricalAssistantReply(hydratedMessages)) {
      return;
    }

    const staleRealtimeEvents = listAgentRealtimeEvents(activeAgentSessionId);
    if (staleRealtimeEvents.length === 0) {
      return;
    }

    if (!historicalRunCardsCoverLiveRunCards(historicalRunCards, liveRunCards)) {
      return;
    }

    agentRealtimeStoreRef.current.clearSession(activeAgentSessionId);
  }, [
    activeAgentSessionId,
    agentConversation.hasBlockingDecision,
    hasActiveExecution,
    historicalRunCards,
    historicalAgentConversation.error,
    historicalAgentConversation.history,
    historicalAgentConversation.isLoading,
    liveRunCards,
    listAgentRealtimeEvents,
  ]);
  const shouldRefreshHistoryOnReconnect = hasActiveExecution || Boolean(pendingRealtimeCleanupSessionRef.current);
  const composerState = resolveAgentComposerState({
    isLoading,
    claudeStatusText: String(claudeStatus?.text || '').trim() || null,
    execution: agentConversation.execution,
  });
  useEffect(() => {
    if (!activeAgentSessionId) {
      return;
    }

    if (composerState.status !== 'completed') {
      return;
    }

    if (
      hasVisibleAssistantCard
      || renderableUserMessages.length === 0
      || historicalAgentConversation.isLoading
      || historicalAgentConversation.error
      || agentConversation.hasBlockingDecision
    ) {
      return;
    }

    const latestRenderableUserMessageId = String(
      renderableUserMessages[renderableUserMessages.length - 1]?.id
      || renderableUserMessages[renderableUserMessages.length - 1]?.messageId
      || '',
    ).trim();
    const recoveryKey = `${activeAgentSessionId}:${latestRenderableUserMessageId || 'no-user-id'}:${loadedCanonicalMessageCount}`;
    if (missingAssistantRecoveryRef.current === recoveryKey) {
      return;
    }

    missingAssistantRecoveryRef.current = recoveryKey;
    historicalAgentConversation.refresh();
  }, [
    activeAgentSessionId,
    agentConversation.hasBlockingDecision,
    composerState.status,
    hasVisibleAssistantCard,
    historicalAgentConversation.error,
    historicalAgentConversation.isLoading,
    historicalAgentConversation.refresh,
    loadedCanonicalMessageCount,
    renderableUserMessages,
  ]);

  useEffect(() => {
    clearHistoricalLoadAllTimers();
    previousHistoricalLoadingOlderRef.current = false;
    pendingHistoricalLoadAllRef.current = false;
    historicalLoadAllObservedLoadingRef.current = false;
    setHistoricalLoadAllUiState({
      isLoadingAllMessages: false,
      loadAllJustFinished: false,
      showLoadAllOverlay: false,
    });
  }, [activeAgentSessionId, clearHistoricalLoadAllTimers]);

  useEffect(() => {
    const previousWasLoadingOlder = previousHistoricalLoadingOlderRef.current;
    previousHistoricalLoadingOlderRef.current = historicalAgentConversation.isLoadingOlder;

    if (
      previousWasLoadingOlder
      && !historicalAgentConversation.isLoadingOlder
      && historicalAgentConversation.hasMore
      && !historicalLoadAllUiState.isLoadingAllMessages
    ) {
      clearHistoricalLoadAllTimers();
      setHistoricalLoadAllUiState((current) => ({
        ...current,
        loadAllJustFinished: false,
        showLoadAllOverlay: true,
      }));
      historicalLoadAllOverlayTimerRef.current = setTimeout(() => {
        setHistoricalLoadAllUiState((current) => ({
          ...current,
          showLoadAllOverlay: false,
        }));
      }, 2000);
      return;
    }

    if (!historicalAgentConversation.hasMore && !historicalLoadAllUiState.isLoadingAllMessages) {
      clearHistoricalLoadAllTimers();
      setHistoricalLoadAllUiState((current) => ({
        ...current,
        showLoadAllOverlay: false,
      }));
    }
  }, [
    clearHistoricalLoadAllTimers,
    historicalAgentConversation.hasMore,
    historicalAgentConversation.isLoadingOlder,
    historicalLoadAllUiState.isLoadingAllMessages,
  ]);

  useEffect(() => {
    if (!pendingHistoricalLoadAllRef.current) {
      return;
    }

    if (historicalAgentConversation.isLoading) {
      historicalLoadAllObservedLoadingRef.current = true;
      return;
    }

    if (!historicalLoadAllObservedLoadingRef.current) {
      return;
    }

    pendingHistoricalLoadAllRef.current = false;
    historicalLoadAllObservedLoadingRef.current = false;
    clearHistoricalLoadAllTimers();

    if (historicalAgentConversation.hasMore) {
      setHistoricalLoadAllUiState({
        isLoadingAllMessages: false,
        loadAllJustFinished: false,
        showLoadAllOverlay: false,
      });
      return;
    }

    setHistoricalLoadAllUiState({
      isLoadingAllMessages: false,
      loadAllJustFinished: true,
      showLoadAllOverlay: false,
    });

    historicalLoadAllFinishedTimerRef.current = setTimeout(() => {
      setHistoricalLoadAllUiState((current) => ({
        ...current,
        loadAllJustFinished: false,
      }));
    }, 1000);
  }, [
    clearHistoricalLoadAllTimers,
    historicalAgentConversation.hasMore,
    historicalAgentConversation.isLoading,
  ]);

  const handleLoadAllHistoricalMessages = useCallback(async () => {
    if (historicalLoadAllUiState.isLoadingAllMessages) {
      return;
    }

    clearHistoricalLoadAllTimers();
    pendingHistoricalLoadAllRef.current = true;
    historicalLoadAllObservedLoadingRef.current = false;
    setHistoricalLoadAllUiState({
      isLoadingAllMessages: true,
      loadAllJustFinished: false,
      showLoadAllOverlay: true,
    });

    await historicalAgentConversation.loadAll();
  }, [clearHistoricalLoadAllTimers, historicalAgentConversation, historicalLoadAllUiState.isLoadingAllMessages]);

  const chatV2ContextBar = (
    <ComposerContextBar
      status={composerState.status}
      label={composerState.label}
      blockedOnDecision={agentConversation.hasBlockingDecision}
    />
  );
  const activeContextFilePath = getActiveContextFilePath(activeContextTarget);
  const activeContextFileName = getActiveContextFileName(activeContextFilePath);
  const contextFileBar = activeContextFilePath ? (
    <div
      data-chat-v2-context-file-tag={activeContextFilePath}
      className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/80 px-3 py-2 text-xs text-foreground"
    >
      <span className="text-muted-foreground">上下文文件</span>
      <button
        type="button"
        onClick={() => setIsContextFileEnabled((value) => !value)}
        className={`rounded-full border px-2 py-0.5 transition-colors ${
          isContextFileEnabled
            ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
            : 'border-border/70 bg-muted/50 text-muted-foreground'
        }`}
      >
        {isContextFileEnabled ? '开启' : '关闭'}
      </button>
      <span className="truncate font-medium" title={activeContextFilePath}>
        {activeContextFileName}
      </span>
    </div>
  ) : null;
  const composerContextBar = activeContextFilePath ? (
    <div className="space-y-2">
      {contextFileBar}
      {chatV2ContextBar}
    </div>
  ) : chatV2ContextBar;

  // On WebSocket reconnect, re-fetch the current session's messages from the server
  // so missed streaming events are shown. Also reset isLoading.
  const handleWebSocketReconnect = useCallback(async () => {
    if (!selectedProject || !selectedSession || !shouldRefreshHistoryOnReconnect) return;
    historicalAgentConversation.refresh();
    setIsLoading(false);
    setCanAbortSession(false);
  }, [
    historicalAgentConversation,
    selectedProject,
    selectedSession,
    setIsLoading,
    setCanAbortSession,
    shouldRefreshHistoryOnReconnect,
  ]);

  useChatRealtimeHandlers({
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
    onWebSocketReconnect: handleWebSocketReconnect,
    onFileChangeEvent,
    onDraftPreviewEvent,
    sessionStore,
    agentEventStore: {
      append(event) {
        agentRealtimeCoordinatorRef.current.consumeEvent(event);
      },
      rebindSession(fromSessionId, toSessionId) {
        agentEventStoreRef.current.rebindSession(fromSessionId, toSessionId);
      },
    },
    agentRealtimeStore: {
      append(event) {
        agentRealtimeStoreRef.current.append(event);
      },
      rebindSession(fromSessionId, toSessionId) {
        agentRealtimeStoreRef.current.rebindSession(fromSessionId, toSessionId);
      },
    },
  });

  useEffect(() => {
    if (!isLoading || !canAbortSession) {
      return;
    }

    const handleGlobalEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.repeat || event.defaultPrevented) {
        return;
      }

      event.preventDefault();
      handleAbortSession();
    };

    document.addEventListener('keydown', handleGlobalEscape, { capture: true });
    return () => {
      document.removeEventListener('keydown', handleGlobalEscape, { capture: true });
    };
  }, [canAbortSession, handleAbortSession, isLoading]);

  useEffect(() => {
    return () => {
      resetStreamingState();
    };
  }, [resetStreamingState]);

  useEffect(() => {
    onComposerAppendReady?.(appendExternalInput);

    return () => {
      onComposerAppendReady?.(null);
    };
  }, [appendExternalInput, onComposerAppendReady]);

  if (!selectedProject) {
    const selectedProviderLabel = t('messageTypes.claude');

    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p className="text-sm">
            {t('projectSelection.startChatWithProvider', {
              provider: selectedProviderLabel,
              defaultValue: 'Select a project to start chatting with {{provider}}',
            })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col">
        <ChatMessagesPane
          scrollContainerRef={scrollContainerRef}
          onScroll={handleScroll}
          onWheel={handleScroll}
          onTouchMove={handleScroll}
          isLoadingSessionMessages={isLoadingSessionMessages}
          chatMessages={mergedChatMessages}
          selectedSession={selectedSession}
          currentSessionId={currentSessionId}
          claudeModel={claudeModel}
          isLoadingMoreMessages={false}
          hasMoreMessages={false}
          totalMessages={historicalAgentConversation.totalMessages}
          loadedCanonicalMessageCount={loadedCanonicalMessageCount}
          visibleMessages={mergedVisibleMessages}
          loadEarlierMessages={() => {}}
          loadAllMessages={() => {}}
          allMessagesLoaded={false}
          isLoadingAllMessages={false}
          loadAllJustFinished={false}
          showLoadAllOverlay={false}
          createDiff={createDiff}
          onFileOpen={onFileOpen}
          onOpenUrl={onOpenUrl}
          onShowSettings={onShowSettings}
          onGrantToolPermission={handleGrantToolPermission}
          autoExpandTools={autoExpandTools}
          showRawParameters={showRawParameters}
          showThinking={showThinking}
          selectedProject={selectedProject}
          isLoading={isLoading}
          claudeStatus={claudeStatus}
          conversationTurns={conversationTurns}
          conversationRounds={conversationRounds}
          handlePermissionDecision={handlePermissionDecision}
          pendingDecisionRequests={pendingDecisionRequests}
        />

        <ChatComposer
          pendingDecisionRequests={pendingDecisionRequests}
          isLoading={isLoading}
          onAbortSession={handleAbortSession}
          provider="claude"
          permissionMode={permissionMode}
          onModeSwitch={cyclePermissionMode}
          claudeModel={claudeModel}
          setClaudeModel={setClaudeModel}
          thinkingMode={thinkingMode}
          setThinkingMode={setThinkingMode}
          tokenBudget={tokenBudget}
          observabilityStatus={observabilityStatus}
          observabilitySessionId={currentSessionId}
          composerStatus={composerState.status}
          composerLabel={composerState.label}
          slashCommandsCount={slashCommandsCount}
          onToggleCommandMenu={handleToggleCommandMenu}
          hasInput={Boolean(input.trim())}
          onClearInput={handleClearInput}
          isUserScrolledUp={isUserScrolledUp}
          hasMessages={mergedChatMessages.length > 0}
          onScrollToBottom={scrollToBottomAndReset}
          onSubmit={handleSubmit}
          isDragActive={isDragActive}
          attachedImages={attachedImages}
          onRemoveImage={(index) =>
            setAttachedImages((previous) =>
              previous.filter((_, currentIndex) => currentIndex !== index),
            )
          }
          uploadingImages={uploadingImages}
          imageErrors={imageErrors}
          showFileDropdown={showFileDropdown}
          filteredFiles={filteredFiles}
          selectedFileIndex={selectedFileIndex}
          onSelectFile={selectFile}
          filteredCommands={filteredCommands}
          selectedCommandIndex={selectedCommandIndex}
          onCommandSelect={handleCommandSelect}
          onCloseCommandMenu={resetCommandMenuState}
          isCommandMenuOpen={showCommandMenu}
          frequentCommands={commandQuery ? [] : frequentCommands}
          getRootProps={getRootProps as (...args: unknown[]) => Record<string, unknown>}
          getInputProps={getInputProps as (...args: unknown[]) => Record<string, unknown>}
          openImagePicker={openImagePicker}
          inputHighlightRef={inputHighlightRef}
          renderInputWithMentions={renderInputWithMentions}
          textareaRef={textareaRef}
          input={input}
          onInputChange={handleInputChange}
          onTextareaClick={handleTextareaClick}
          onTextareaKeyDown={handleKeyDown}
          onTextareaPaste={handlePaste}
          onTextareaScrollSync={syncInputOverlayScroll}
          onTextareaInput={handleTextareaInput}
          onInputFocusChange={handleInputFocusChange}
          isInputFocused={isInputFocused}
          placeholder={t('input.placeholder', {
            provider: t('messageTypes.claude'),
          })}
          isTextareaExpanded={isTextareaExpanded}
          sendByCtrlEnter={sendByCtrlEnter}
          onTranscript={handleTranscript}
          contextBar={composerContextBar}
        />
      </div>
    </>
  );
}

export default React.memo(ChatInterface);
