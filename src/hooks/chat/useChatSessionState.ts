import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { ChatMessage } from '@components/chat/types/types';
import { CLIENT_EVENT_TYPES } from '@components/chat/types/transport';
import { createCachedDiffCalculator, type DiffCalculator } from '@components/chat/utils/messageTransforms';
import type { SessionStore, NormalizedMessage } from '@stores/useSessionStore';
import { resolveVisibleChatSessionId } from './chatSessionViewState';
import { mergePendingUserMessage } from './pendingUserMessage.js';
import {
  projectSelectedSessionHistoryUiState,
  resolveSelectedSessionHistoryId,
  shouldApplySelectedSessionHistoryResponse,
} from './selectedSessionHistoryBinding';
import {
  getProjectRequestIdentity,
  resolveProjectRequestName,
  resolveProjectRequestPath,
} from './projectRequestIdentity';
import { shouldPreserveTransientSessionState } from './transientSessionState';
import { normalizedToChatMessages } from './useChatMessages';
import { deriveTokenBudgetFromMessages } from './tokenBudgetFromMessages';
import type { Project, ProjectSession, SessionProvider } from '@/types/app';

const MESSAGES_PER_PAGE = 20;
const INITIAL_VISIBLE_MESSAGES = 100;

type PendingViewSession = {
  sessionId: string | null;
  traceId: string | null;
  startedAt: number;
};

interface UseChatSessionStateArgs {
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  ws: WebSocket | null;
  sendMessage: (message: unknown) => void;
  autoScrollToBottom?: boolean;
  externalMessageUpdate?: number;
  processingSessions?: Set<string>;
  resetStreamingState: () => void;
  pendingViewSessionRef: MutableRefObject<PendingViewSession | null>;
  sessionStore: SessionStore;
  disableSelectedSessionServerHydration?: boolean;
}

type AddMessageTargetSessionId = string | null | undefined;

interface ScrollRestoreState {
  height: number;
  top: number;
}

/* ------------------------------------------------------------------ */
/*  Helper: Convert a ChatMessage to a NormalizedMessage for the store */
/* ------------------------------------------------------------------ */

function chatMessageToNormalized(
  msg: ChatMessage,
  sessionId: string,
  provider: SessionProvider,
): NormalizedMessage | null {
  const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const ts = msg.timestamp instanceof Date
    ? msg.timestamp.toISOString()
    : typeof msg.timestamp === 'number'
      ? new Date(msg.timestamp).toISOString()
      : String(msg.timestamp);
  const base = { id, sessionId, timestamp: ts, provider };

  if (msg.isToolUse) {
    return {
      ...base,
      kind: 'tool_use',
      toolName: msg.toolName,
      toolInput: msg.toolInput,
      toolId: msg.toolId || id,
    } as NormalizedMessage;
  }
  if (msg.isThinking) {
    return { ...base, kind: 'thinking', content: msg.content || '' } as NormalizedMessage;
  }
  if (msg.isInteractivePrompt) {
    return { ...base, kind: 'interactive_prompt', content: msg.content || '' } as NormalizedMessage;
  }
  if ((msg as any).isTaskNotification) {
    return {
      ...base,
      kind: 'task_notification',
      status: (msg as any).taskStatus || 'completed',
      summary: msg.content || '',
    } as NormalizedMessage;
  }
  if (msg.type === 'error') {
    return { ...base, kind: 'error', content: msg.content || '' } as NormalizedMessage;
  }
  return {
    ...base,
    kind: 'text',
    role: msg.type === 'user' ? 'user' : 'assistant',
    content: msg.content || '',
    images: msg.images || [],
  } as NormalizedMessage;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                              */
/* ------------------------------------------------------------------ */

export function useChatSessionState({
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
  disableSelectedSessionServerHydration = false,
}: UseChatSessionStateArgs) {
  const selectedProjectRequestKey = getProjectRequestIdentity(selectedProject);
  const selectedProjectName = resolveProjectRequestName(selectedProject);
  const selectedProjectPath = resolveProjectRequestPath(selectedProject);
  const [isLoading, setIsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(selectedSession?.id || null);
  const [isLoadingSessionMessages, setIsLoadingSessionMessages] = useState(false);
  const [isLoadingMoreMessages, setIsLoadingMoreMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [totalMessages, setTotalMessages] = useState(0);
  const [canAbortSession, setCanAbortSession] = useState(false);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [tokenBudget, setTokenBudget] = useState<Record<string, unknown> | null>(null);
  const [visibleMessageCount, setVisibleMessageCount] = useState(INITIAL_VISIBLE_MESSAGES);
  const [claudeStatus, setClaudeStatus] = useState<{ text: string; tokens: number; can_interrupt: boolean } | null>(null);
  const [allMessagesLoaded, setAllMessagesLoaded] = useState(false);
  const [isLoadingAllMessages, setIsLoadingAllMessages] = useState(false);
  const [loadAllJustFinished, setLoadAllJustFinished] = useState(false);
  const [showLoadAllOverlay, setShowLoadAllOverlay] = useState(false);
  const [viewHiddenCount, setViewHiddenCount] = useState(0);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [searchTarget, setSearchTarget] = useState<{ timestamp?: string; uuid?: string; snippet?: string } | null>(null);
  const searchScrollActiveRef = useRef(false);
  const isLoadingSessionRef = useRef(false);
  const isLoadingMoreRef = useRef(false);
  const allMessagesLoadedRef = useRef(false);
  const topLoadLockRef = useRef(false);
  const pendingScrollRestoreRef = useRef<ScrollRestoreState | null>(null);
  const pendingInitialScrollRef = useRef(true);
  const messagesOffsetRef = useRef(0);
  const scrollPositionRef = useRef({ height: 0, top: 0 });
  const loadAllFinishedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadAllOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLoadedSessionKeyRef = useRef<string | null>(null);
  const sessionLoadRequestIdRef = useRef(0);
  const selectedSessionHistoryIdRef = useRef<string | null>(null);

  const createDiff = useMemo<DiffCalculator>(() => createCachedDiffCalculator(), []);

  /* ---------------------------------------------------------------- */
  /*  Derive chatMessages from the store                              */
  /* ---------------------------------------------------------------- */
  // sessionStore 只负责历史回放、缓存 transcript 和本地回显。
  // 当前是否正在执行，必须由 V2 run events 与 execution projection 决定。

  const activeSessionId = resolveVisibleChatSessionId({
    selectedSessionId: selectedSession?.id || null,
    currentSessionId,
    pendingSessionId: pendingViewSessionRef.current?.sessionId || null,
  });
  const selectedSessionHistoryId = resolveSelectedSessionHistoryId({
    activeSessionId,
    selectedSessionId: selectedSession?.id || null,
  });
  const selectedSessionHistoryUiState = projectSelectedSessionHistoryUiState({
    selectedSessionHistoryId,
    hasMoreMessages,
    totalMessages,
    allMessagesLoaded,
    isLoadingAllMessages,
    loadAllJustFinished,
    showLoadAllOverlay,
  });
  const [pendingUserMessage, setPendingUserMessage] = useState<ChatMessage | null>(null);

  useEffect(() => {
    sessionStore.setActiveSession(activeSessionId);
  }, [activeSessionId, sessionStore]);

  useEffect(() => {
    selectedSessionHistoryIdRef.current = selectedSessionHistoryId;
  }, [selectedSessionHistoryId]);

  useEffect(() => {
    if (!activeSessionId || !pendingUserMessage) {
      return;
    }

    const normalized = chatMessageToNormalized(pendingUserMessage, activeSessionId, 'claude');
    if (normalized) {
      sessionStore.appendRealtime(activeSessionId, normalized);
    }
    setPendingUserMessage(null);
  }, [activeSessionId, pendingUserMessage, sessionStore]);

  const storeMessages = activeSessionId ? sessionStore.getMessages(activeSessionId) : [];

  // Reset viewHiddenCount when store messages change
  const prevStoreLenRef = useRef(0);
  if (storeMessages.length !== prevStoreLenRef.current) {
    prevStoreLenRef.current = storeMessages.length;
    if (viewHiddenCount > 0) setViewHiddenCount(0);
  }

  const chatMessages = useMemo(() => {
    const all = normalizedToChatMessages(storeMessages, {
      suppressInStreamDecisions: true,
    });
    // Keep the locally echoed user turn visible until the real user message arrives in the store.
    const mergedWithPending = mergePendingUserMessage(all, pendingUserMessage);
    if (viewHiddenCount > 0 && viewHiddenCount < mergedWithPending.length) return mergedWithPending.slice(0, -viewHiddenCount);
    return mergedWithPending;
  }, [storeMessages, viewHiddenCount, pendingUserMessage]);

  const derivedTokenBudget = useMemo(
    () =>
      deriveTokenBudgetFromMessages(
        storeMessages,
        {
          total:
            Number.parseInt(
              (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_CONTEXT_WINDOW || '',
              10,
            ) || 160000,
        },
      ),
    [storeMessages],
  );

  useEffect(() => {
    if (derivedTokenBudget) {
      setTokenBudget((derivedTokenBudget as unknown) as Record<string, unknown>);
    }
  }, [derivedTokenBudget]);

  /* ---------------------------------------------------------------- */
  /*  addMessage / clearMessages / rewindMessages                     */
  /* ---------------------------------------------------------------- */

  const addMessage = useCallback((msg: ChatMessage, targetSessionId?: AddMessageTargetSessionId) => {
    const resolvedSessionId = targetSessionId || activeSessionId;
    if (!resolvedSessionId) {
      // No session yet — show as pending until the backend creates one
      setPendingUserMessage(msg);
      return;
    }
    const normalized = chatMessageToNormalized(msg, resolvedSessionId, 'claude');
    if (normalized) {
      sessionStore.appendRealtime(resolvedSessionId, normalized);
    }
  }, [activeSessionId, sessionStore]);

  const clearMessages = useCallback(() => {
    if (!activeSessionId) return;
    sessionStore.clearRealtime(activeSessionId);
  }, [activeSessionId, sessionStore]);

  const rewindMessages = useCallback((count: number) => setViewHiddenCount(count), []);

  const scrollToBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, []);

  const scrollToBottomAndReset = useCallback(() => {
    scrollToBottom();
    if (allMessagesLoaded) {
      setVisibleMessageCount(INITIAL_VISIBLE_MESSAGES);
      setAllMessagesLoaded(false);
      allMessagesLoadedRef.current = false;
    }
  }, [allMessagesLoaded, scrollToBottom]);

  const isNearBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return false;
    const { scrollTop, scrollHeight, clientHeight } = container;
    return scrollHeight - scrollTop - clientHeight < 50;
  }, []);

  const loadOlderMessages = useCallback(
    async (container: HTMLDivElement) => {
      if (!container || isLoadingMoreRef.current || isLoadingMoreMessages) return false;
      if (allMessagesLoadedRef.current) return false;
      if (!hasMoreMessages || !selectedSessionHistoryId || !selectedProjectName || !selectedProjectPath) return false;
      const requestSessionId = selectedSessionHistoryId;

      const sessionProvider = 'claude';

      isLoadingMoreRef.current = true;
      const previousScrollHeight = container.scrollHeight;
      const previousScrollTop = container.scrollTop;

      try {
        const slot = await sessionStore.fetchMore(requestSessionId, {
          provider: sessionProvider as SessionProvider,
          projectName: selectedProjectName,
          projectPath: selectedProjectPath,
          limit: MESSAGES_PER_PAGE,
        });
        if (!shouldApplySelectedSessionHistoryResponse({
          latestSelectedSessionHistoryId: selectedSessionHistoryIdRef.current,
          requestSessionId,
        })) {
          return false;
        }
        if (!slot || slot.serverMessages.length === 0) return false;

        pendingScrollRestoreRef.current = { height: previousScrollHeight, top: previousScrollTop };
        setHasMoreMessages(slot.hasMore);
        setTotalMessages(slot.total);
        setVisibleMessageCount((prev) => prev + MESSAGES_PER_PAGE);
        return true;
      } finally {
        isLoadingMoreRef.current = false;
      }
    },
    [hasMoreMessages, isLoadingMoreMessages, selectedProjectName, selectedProjectPath, selectedSessionHistoryId, sessionStore],
  );

  const handleScroll = useCallback(async () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const nearBottom = isNearBottom();
    setIsUserScrolledUp(!nearBottom);

    if (!allMessagesLoadedRef.current) {
      const scrolledNearTop = container.scrollTop < 100;
      if (!scrolledNearTop) { topLoadLockRef.current = false; return; }
      if (topLoadLockRef.current) {
        if (container.scrollTop > 20) topLoadLockRef.current = false;
        return;
      }
      const didLoad = await loadOlderMessages(container);
      if (didLoad) topLoadLockRef.current = true;
    }
  }, [isNearBottom, loadOlderMessages]);

  useLayoutEffect(() => {
    if (!pendingScrollRestoreRef.current || !scrollContainerRef.current) return;
    const { height, top } = pendingScrollRestoreRef.current;
    const container = scrollContainerRef.current;
    const newScrollHeight = container.scrollHeight;
    container.scrollTop = top + Math.max(newScrollHeight - height, 0);
    pendingScrollRestoreRef.current = null;
  }, [chatMessages.length]);

  // Reset scroll/pagination state on session change
  useEffect(() => {
    if (!searchScrollActiveRef.current) {
      pendingInitialScrollRef.current = true;
      setVisibleMessageCount(INITIAL_VISIBLE_MESSAGES);
    }
    topLoadLockRef.current = false;
    pendingScrollRestoreRef.current = null;
    setIsUserScrolledUp(false);
  }, [selectedProject?.name, selectedSession?.id]);

  // Initial scroll to bottom
  useEffect(() => {
    if (!pendingInitialScrollRef.current || !scrollContainerRef.current || isLoadingSessionMessages) return;
    if (chatMessages.length === 0) { pendingInitialScrollRef.current = false; return; }
    pendingInitialScrollRef.current = false;
    if (!searchScrollActiveRef.current) setTimeout(() => scrollToBottom(), 200);
  }, [chatMessages.length, isLoadingSessionMessages, scrollToBottom]);

  // Main session loading effect — store-based
  useEffect(() => {
    if (!selectedSession || !selectedProjectName || !selectedProjectPath) {
      sessionLoadRequestIdRef.current += 1;
      resetStreamingState();
      pendingViewSessionRef.current = null;
      setPendingUserMessage(null);
      setIsLoadingSessionMessages(false);
      setClaudeStatus(null);
      setCanAbortSession(false);
      setIsLoading(false);
      setCurrentSessionId(null);
      messagesOffsetRef.current = 0;
      setHasMoreMessages(false);
      setTotalMessages(0);
      setTokenBudget(null);
      lastLoadedSessionKeyRef.current = null;
      return;
    }

    if (disableSelectedSessionServerHydration) {
      const sessionChanged = currentSessionId !== null && currentSessionId !== selectedSession.id;
      const shouldPreserveTransientState = shouldPreserveTransientSessionState({
        currentSessionId,
        nextSessionId: selectedSession.id,
        pendingSessionId: pendingViewSessionRef.current?.sessionId || null,
      });

      if (sessionChanged && !shouldPreserveTransientState) {
        resetStreamingState();
        pendingViewSessionRef.current = null;
        setClaudeStatus(null);
        setCanAbortSession(false);
        setTokenBudget(null);
        setIsLoading(false);
      }

      messagesOffsetRef.current = 0;
      setHasMoreMessages(false);
      setTotalMessages(0);
      setVisibleMessageCount(INITIAL_VISIBLE_MESSAGES);
      setAllMessagesLoaded(false);
      allMessagesLoadedRef.current = false;
      setIsLoadingAllMessages(false);
      setLoadAllJustFinished(false);
      setShowLoadAllOverlay(false);
      setViewHiddenCount(0);
      setIsLoadingSessionMessages(false);
      setCurrentSessionId(selectedSession.id);
      lastLoadedSessionKeyRef.current = null;

      if (ws) {
        sendMessage({
          type: CLIENT_EVENT_TYPES.CHAT_RECONNECT,
          sessionId: selectedSession.id,
          provider: 'claude',
        });
      }

      return;
    }

    const provider = 'claude';
    const sessionKey = `${selectedSession.id}:${selectedProjectName}:${provider}`;
    const requestId = sessionLoadRequestIdRef.current + 1;
    sessionLoadRequestIdRef.current = requestId;

    // Skip if already loaded and fresh
    if (lastLoadedSessionKeyRef.current === sessionKey && sessionStore.has(selectedSession.id) && !sessionStore.isStale(selectedSession.id)) {
      return;
    }

    const sessionChanged = currentSessionId !== null && currentSessionId !== selectedSession.id;
    const shouldPreserveTransientState = shouldPreserveTransientSessionState({
      currentSessionId,
      nextSessionId: selectedSession.id,
      pendingSessionId: pendingViewSessionRef.current?.sessionId || null,
    });
    if (sessionChanged) {
      if (!shouldPreserveTransientState) {
        resetStreamingState();
        pendingViewSessionRef.current = null;
        setClaudeStatus(null);
        setCanAbortSession(false);
      }
    }

    // Reset pagination/scroll state
    messagesOffsetRef.current = 0;
    setHasMoreMessages(false);
    setTotalMessages(0);
    setVisibleMessageCount(INITIAL_VISIBLE_MESSAGES);
    setAllMessagesLoaded(false);
    allMessagesLoadedRef.current = false;
    setIsLoadingAllMessages(false);
    setLoadAllJustFinished(false);
    setShowLoadAllOverlay(false);
    setViewHiddenCount(0);
    if (loadAllOverlayTimerRef.current) clearTimeout(loadAllOverlayTimerRef.current);
    if (loadAllFinishedTimerRef.current) clearTimeout(loadAllFinishedTimerRef.current);

    if (sessionChanged && !shouldPreserveTransientState) {
      setTokenBudget(null);
      setIsLoading(false);
    }

    setCurrentSessionId(selectedSession.id);

    // Check session status
    if (ws) {
      sendMessage({ type: CLIENT_EVENT_TYPES.CHAT_RECONNECT, sessionId: selectedSession.id, provider });
    }

    lastLoadedSessionKeyRef.current = sessionKey;

    // Fetch from server → store updates → chatMessages re-derives automatically
    setIsLoadingSessionMessages(true);
    const requestSessionId = selectedSession.id;
    sessionStore.fetchFromServer(requestSessionId, {
      provider: provider as SessionProvider,
      projectName: selectedProjectName,
      projectPath: selectedProjectPath,
      limit: MESSAGES_PER_PAGE,
      offset: 0,
    }).then(slot => {
      if (sessionLoadRequestIdRef.current !== requestId) {
        return;
      }
      if (slot) {
        setHasMoreMessages(slot.hasMore);
        setTotalMessages(slot.total);
        if (slot.tokenUsage) setTokenBudget(slot.tokenUsage as Record<string, unknown>);
      }
      setIsLoadingSessionMessages(false);
    }).catch(() => {
      if (sessionLoadRequestIdRef.current !== requestId) {
        return;
      }
      setIsLoadingSessionMessages(false);
    });
  }, [
    disableSelectedSessionServerHydration,
    pendingViewSessionRef,
    resetStreamingState,
    selectedProjectName,
    selectedProjectPath,
    selectedProjectRequestKey,
    selectedSession?.id,
    sendMessage,
    ws,
    sessionStore,
  ]);

  // External message update (e.g. WebSocket reconnect, background refresh)
  useEffect(() => {
    if (
      disableSelectedSessionServerHydration
      || !externalMessageUpdate
      || !selectedSession
      || !selectedProjectName
      || !selectedProjectPath
    ) return;

    const reloadExternalMessages = async () => {
      try {
        // Skip store refresh during active streaming
        if (!isLoading) {
          const requestSessionId = selectedSession.id;
          await sessionStore.refreshFromServer(requestSessionId, {
            provider: 'claude' as SessionProvider,
            projectName: selectedProjectName,
            projectPath: selectedProjectPath,
          });

          if (Boolean(autoScrollToBottom) && isNearBottom()) {
            setTimeout(() => scrollToBottom(), 200);
          }
        }
      } catch (error) {
        console.error('Error reloading messages from external update:', error);
      }
    };

    reloadExternalMessages();
  }, [
    autoScrollToBottom,
    disableSelectedSessionServerHydration,
    externalMessageUpdate,
    isNearBottom,
    scrollToBottom,
    selectedProjectName,
    selectedProjectPath,
    selectedSession,
    sessionStore,
    isLoading,
  ]);

  // Search navigation target
  useEffect(() => {
    const session = selectedSession as Record<string, unknown> | null;
    const targetSnippet = session?.__searchTargetSnippet;
    const targetTimestamp = session?.__searchTargetTimestamp;
    if (typeof targetSnippet === 'string' && targetSnippet) {
      searchScrollActiveRef.current = true;
      setSearchTarget({
        snippet: targetSnippet,
        timestamp: typeof targetTimestamp === 'string' ? targetTimestamp : undefined,
      });
    }
  }, [selectedSession]);

  useEffect(() => {
    if (selectedSession?.id) pendingViewSessionRef.current = null;
  }, [pendingViewSessionRef, selectedSession?.id]);

  // Scroll to search target
  useEffect(() => {
    if (!searchTarget || chatMessages.length === 0 || isLoadingSessionMessages) return;

    const target = searchTarget;
    setSearchTarget(null);

    const scrollToTarget = async () => {
      if (!allMessagesLoadedRef.current && selectedSession && selectedProjectName && selectedProjectPath) {
        if (disableSelectedSessionServerHydration) {
          setVisibleMessageCount(Infinity);
        } else {
          const sessionProvider = 'claude';
          try {
            // Load all messages into the store for search navigation
            const requestSessionId = selectedSession.id;
            const slot = await sessionStore.fetchFromServer(requestSessionId, {
              provider: sessionProvider as SessionProvider,
              projectName: selectedProjectName,
              projectPath: selectedProjectPath,
              limit: null,
              offset: 0,
            });
            if (slot) {
              setHasMoreMessages(false);
              setTotalMessages(slot.total);
              messagesOffsetRef.current = slot.total;
              setVisibleMessageCount(Infinity);
              setAllMessagesLoaded(true);
              allMessagesLoadedRef.current = true;
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          } catch {
            // Fall through and scroll in current messages
          }
        }
      }
      setVisibleMessageCount(Infinity);

      const findAndScroll = (retriesLeft: number) => {
        const container = scrollContainerRef.current;
        if (!container) return;

        let targetElement: Element | null = null;

        if (target.snippet) {
          const cleanSnippet = target.snippet.replace(/^\.{3}/, '').replace(/\.{3}$/, '').trim();
          const searchPhrase = cleanSnippet.slice(0, 80).toLowerCase().trim();
          if (searchPhrase.length >= 10) {
            const messageElements = container.querySelectorAll('.chat-message');
            for (const el of messageElements) {
              const text = (el.textContent || '').toLowerCase();
              if (text.includes(searchPhrase)) { targetElement = el; break; }
            }
          }
        }

        if (!targetElement && target.timestamp) {
          const targetDate = new Date(target.timestamp).getTime();
          const messageElements = container.querySelectorAll('[data-message-timestamp]');
          let closestDiff = Infinity;
          for (const el of messageElements) {
            const ts = el.getAttribute('data-message-timestamp');
            if (!ts) continue;
            const diff = Math.abs(new Date(ts).getTime() - targetDate);
            if (diff < closestDiff) { closestDiff = diff; targetElement = el; }
          }
        }

        if (targetElement) {
          targetElement.scrollIntoView({ block: 'center', behavior: 'smooth' });
          targetElement.classList.add('search-highlight-flash');
          setTimeout(() => targetElement?.classList.remove('search-highlight-flash'), 4000);
          searchScrollActiveRef.current = false;
        } else if (retriesLeft > 0) {
          setTimeout(() => findAndScroll(retriesLeft - 1), 200);
        } else {
          searchScrollActiveRef.current = false;
        }
      };

      setTimeout(() => findAndScroll(15), 150);
    };

    scrollToTarget();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMessages.length, disableSelectedSessionServerHydration, isLoadingSessionMessages, searchTarget]);

  const visibleMessages = useMemo(() => {
    if (chatMessages.length <= visibleMessageCount) return chatMessages;
    return chatMessages.slice(-visibleMessageCount);
  }, [chatMessages, visibleMessageCount]);

  useEffect(() => {
    if (!autoScrollToBottom && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      scrollPositionRef.current = { height: container.scrollHeight, top: container.scrollTop };
    }
  });

  useEffect(() => {
    if (!scrollContainerRef.current || chatMessages.length === 0) return;
    if (isLoadingMoreRef.current || isLoadingMoreMessages || pendingScrollRestoreRef.current) return;
    if (searchScrollActiveRef.current) return;

    if (autoScrollToBottom) {
      if (!isUserScrolledUp) setTimeout(() => scrollToBottom(), 50);
      return;
    }

    const container = scrollContainerRef.current;
    const prevHeight = scrollPositionRef.current.height;
    const prevTop = scrollPositionRef.current.top;
    const newHeight = container.scrollHeight;
    const heightDiff = newHeight - prevHeight;
    if (heightDiff > 0 && prevTop > 0) container.scrollTop = prevTop + heightDiff;
  }, [autoScrollToBottom, chatMessages.length, isLoadingMoreMessages, isUserScrolledUp, scrollToBottom]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // "Load all" overlay
  const prevLoadingRef = useRef(false);
  useEffect(() => {
    const wasLoading = prevLoadingRef.current;
    prevLoadingRef.current = isLoadingMoreMessages;

    if (wasLoading && !isLoadingMoreMessages && hasMoreMessages) {
      if (loadAllOverlayTimerRef.current) clearTimeout(loadAllOverlayTimerRef.current);
      setShowLoadAllOverlay(true);
      loadAllOverlayTimerRef.current = setTimeout(() => setShowLoadAllOverlay(false), 2000);
    }
    if (!hasMoreMessages && !isLoadingMoreMessages) {
      if (loadAllOverlayTimerRef.current) clearTimeout(loadAllOverlayTimerRef.current);
      setShowLoadAllOverlay(false);
    }
    return () => { if (loadAllOverlayTimerRef.current) clearTimeout(loadAllOverlayTimerRef.current); };
  }, [isLoadingMoreMessages, hasMoreMessages]);

  const loadAllMessages = useCallback(async () => {
    if (disableSelectedSessionServerHydration) {
      setVisibleMessageCount(Infinity);
      setHasMoreMessages(false);
      setAllMessagesLoaded(true);
      allMessagesLoadedRef.current = true;
      setShowLoadAllOverlay(false);
      return;
    }
    if (!selectedSessionHistoryId || !selectedProjectName || !selectedProjectPath) return;
    if (isLoadingAllMessages) return;
    const sessionProvider = 'claude';

    const requestSessionId = selectedSessionHistoryId;
    allMessagesLoadedRef.current = true;
    isLoadingMoreRef.current = true;
    setIsLoadingAllMessages(true);
    setShowLoadAllOverlay(true);

    const container = scrollContainerRef.current;
    const previousScrollHeight = container ? container.scrollHeight : 0;
    const previousScrollTop = container ? container.scrollTop : 0;

    try {
      const slot = await sessionStore.fetchFromServer(requestSessionId, {
        provider: sessionProvider as SessionProvider,
        projectName: selectedProjectName,
        projectPath: selectedProjectPath,
        limit: null,
        offset: 0,
      });

      if (!shouldApplySelectedSessionHistoryResponse({
        latestSelectedSessionHistoryId: selectedSessionHistoryIdRef.current,
        requestSessionId,
      })) {
        allMessagesLoadedRef.current = false;
        setShowLoadAllOverlay(false);
        setLoadAllJustFinished(false);
        return;
      }

      if (slot) {
        if (container) {
          pendingScrollRestoreRef.current = { height: previousScrollHeight, top: previousScrollTop };
        }

        setHasMoreMessages(false);
        setTotalMessages(slot.total);
        messagesOffsetRef.current = slot.total;
        setVisibleMessageCount(Infinity);
        setAllMessagesLoaded(true);

        setLoadAllJustFinished(true);
        if (loadAllFinishedTimerRef.current) clearTimeout(loadAllFinishedTimerRef.current);
        loadAllFinishedTimerRef.current = setTimeout(() => { setLoadAllJustFinished(false); setShowLoadAllOverlay(false); }, 1000);
      } else {
        allMessagesLoadedRef.current = false;
        setShowLoadAllOverlay(false);
      }
    } catch (error) {
      console.error('Error loading all messages:', error);
      allMessagesLoadedRef.current = false;
      setShowLoadAllOverlay(false);
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingAllMessages(false);
    }
  }, [disableSelectedSessionServerHydration, selectedSessionHistoryId, selectedProjectName, selectedProjectPath, isLoadingAllMessages, sessionStore]);

  const loadEarlierMessages = useCallback(() => {
    setVisibleMessageCount((prev) => prev + 100);
  }, []);

  return {
    chatMessages,
    addMessage,
    clearMessages,
    rewindMessages,
    isLoading,
    setIsLoading,
    currentSessionId,
    setCurrentSessionId,
    isLoadingSessionMessages,
    isLoadingMoreMessages,
    hasMoreMessages: selectedSessionHistoryUiState.hasMoreMessages,
    totalMessages: selectedSessionHistoryUiState.totalMessages,
    canAbortSession,
    setCanAbortSession,
    isUserScrolledUp,
    setIsUserScrolledUp,
    tokenBudget,
    setTokenBudget,
    visibleMessageCount,
    visibleMessages,
    loadEarlierMessages,
    loadAllMessages,
    allMessagesLoaded: selectedSessionHistoryUiState.allMessagesLoaded,
    isLoadingAllMessages: selectedSessionHistoryUiState.isLoadingAllMessages,
    loadAllJustFinished: selectedSessionHistoryUiState.loadAllJustFinished,
    showLoadAllOverlay: selectedSessionHistoryUiState.showLoadAllOverlay,
    claudeStatus,
    setClaudeStatus,
    createDiff,
    scrollContainerRef,
    scrollToBottom,
    scrollToBottomAndReset,
    isNearBottom,
    handleScroll,
  };
}
