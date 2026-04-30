import React, { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { RefObject } from 'react';
import RunCardView from '../../components/RunCard.tsx';
import RunCardInteraction from '../../components/RunCardInteraction.tsx';
import type { RunCard as RunCardModel } from '../../types/runCard.ts';
import type { ConversationTurn } from '../../types/conversationTurn.ts';
import type { ConversationRound } from '../../types/conversationRound.ts';
import { assistantTurnToRunCard } from '../../types/conversationTurn.ts';
import type { ChatMessage, PendingDecisionRequest } from '../../types/types';
import type { Project, ProjectSession } from '../../../../types/app';
import { getIntrinsicMessageKey } from '../../utils/messageKeys';
import MessageComponent from './MessageComponent';
import ProviderSelectionEmptyState from './ProviderSelectionEmptyState';
import { shouldRenderChatEmptyState } from './chatMessagesPaneState';

function getMessageIdentity(message: ChatMessage) {
  return String(message.id || message.messageId || '').trim();
}

function normalizeComparableText(value: unknown) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function isRichMarkdownContent(value: string) {
  const text = String(value || '');
  return /(^|\n)#{1,6}\s|\n[-*]\s|\n\d+\.\s|\n```|\|.+\||(^|\n)>\s/.test(text);
}

function collapseRedundantResponseMessages(responseMessages: RunCardModel['responseMessages']) {
  if (!Array.isArray(responseMessages) || responseMessages.length < 2) {
    return responseMessages;
  }

  const finalSegment = responseMessages[responseMessages.length - 1];
  const finalBody = String(finalSegment?.body || '').trim();
  if (!finalBody || finalSegment?.kind !== 'final' || !isRichMarkdownContent(finalBody)) {
    return responseMessages;
  }

  const normalizedFinalBody = normalizeComparableText(finalBody);
  const collapsed = responseMessages.filter((segment, index) => {
    if (index === responseMessages.length - 1) {
      return true;
    }

    const body = String(segment?.body || '').trim();
    if (!body) {
      return false;
    }

    const normalizedBody = normalizeComparableText(body);
    return !(
      normalizedFinalBody.startsWith(normalizedBody)
      || normalizedFinalBody.includes(normalizedBody)
    );
  });

  return collapsed.length === 0 ? [finalSegment] : collapsed;
}

function collapseRedundantPreviewItems(
  previewItems: RunCardModel['previewItems'],
  responseMessages: RunCardModel['responseMessages'],
) {
  if (!Array.isArray(previewItems) || previewItems.length === 0) {
    return previewItems;
  }

  const finalRichBodies = (Array.isArray(responseMessages) ? responseMessages : [])
    .filter((segment) => segment?.kind === 'final')
    .map((segment) => String(segment?.body || '').trim())
    .filter((body) => body && isRichMarkdownContent(body))
    .map((body) => normalizeComparableText(body));

  if (finalRichBodies.length === 0) {
    return previewItems;
  }

  return previewItems.filter((item) => {
    const body = normalizeComparableText(item?.body);
    if (!body) {
      return false;
    }

    return !finalRichBodies.some((finalBody) => (
      finalBody === body
      || finalBody.includes(body)
      || body.includes(finalBody)
    ));
  });
}

function isDuplicatedByStandaloneRunCard(message: ChatMessage, standaloneRunCards: RunCardModel[]) {
  const messageContent = normalizeComparableText(message.content);
  const messageTimestamp = parseChronologicalTimestamp(String(message.timestamp || ''));

  return standaloneRunCards.some((card) => {
    const finalResponse = normalizeComparableText(card.finalResponse);
    const cardStartedAt = getRunCardTimestamp({
      ...card,
      updatedAt: card.startedAt,
      completedAt: card.startedAt,
    });
    const cardCompletedAt = parseChronologicalTimestamp(card.completedAt)
      ?? parseChronologicalTimestamp(card.updatedAt)
      ?? parseChronologicalTimestamp(card.startedAt);

    if (cardCompletedAt == null) {
      return Boolean(finalResponse) && finalResponse === messageContent;
    }

    const lowerBound = cardStartedAt == null ? cardCompletedAt - 5_000 : cardStartedAt - 5_000;
    const upperBound = cardCompletedAt + 5_000;
    const withinCardWindow = messageTimestamp != null
      && messageTimestamp >= lowerBound
      && messageTimestamp <= upperBound;

    if (finalResponse && finalResponse === messageContent) {
      return messageTimestamp == null || withinCardWindow;
    }

    return Boolean(card.processItems.length > 0 && withinCardWindow);
  });
}

function buildLegacyProcessItem(message: ChatMessage, index: number): RunCardModel['processItems'][number] | null {
  const body = String(message.content || '').trim();
  if (!body) {
    return null;
  }

  if (message.isThinking) {
    return {
      id: getMessageIdentity(message) || `legacy-thinking-${index}`,
      timestamp: String(message.timestamp || ''),
      kind: 'thinking',
      title: 'Thinking',
      body,
    };
  }

  if (message.isTaskNotification) {
    return {
      id: getMessageIdentity(message) || `legacy-task-${index}`,
      timestamp: String(message.timestamp || ''),
      kind: 'subagent_progress',
      title: '阶段更新',
      body,
    };
  }

  return null;
}

function buildLegacyAssistantRunCardFromGroup(
  assistantMessages: ChatMessage[],
  anchorMessage: ChatMessage | null,
  existingStandaloneRunCards: RunCardModel[],
  isLoading: boolean,
): RunCardModel | null {
  if (assistantMessages.length === 0) {
    return null;
  }

  const processItems = assistantMessages
    .map((message, index) => buildLegacyProcessItem(message, index))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const responseCandidates = assistantMessages
    .filter((message) => message.type === 'assistant' && !message.isThinking && !message.isTaskNotification)
    .map((message) => ({
      id: getMessageIdentity(message) || 'legacy-assistant-response',
      timestamp: String(message.timestamp || ''),
      body: String(message.content || '').trim(),
      sessionId: String(message.sessionId || ''),
    }))
    .filter((message) => Boolean(message.body));

  if (processItems.length === 0 && responseCandidates.length === 0) {
    return null;
  }

  const responseMessages = responseCandidates.map((message, index) => ({
    id: message.id,
    timestamp: message.timestamp,
    kind: index === responseCandidates.length - 1 ? 'final' as const : 'phase' as const,
    body: message.body,
  }));
  const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
  const lastResponse = responseCandidates[responseCandidates.length - 1] || null;
  const finalResponse = lastResponse?.body || '';
  const anchorMessageId = anchorMessage ? getMessageIdentity(anchorMessage) : '';

  if (!anchorMessageId && isLoading && processItems.length === 0) {
    return null;
  }

  if (!anchorMessageId && finalResponse) {
    const duplicated = existingStandaloneRunCards.some((card) => (
      normalizeComparableText(card.finalResponse) === normalizeComparableText(finalResponse)
    ));
    if (duplicated) {
      return null;
    }
  }

  const normalizedResponseMessages = anchorMessageId && processItems.length === 0 && responseMessages.length > 0
    ? [responseMessages[responseMessages.length - 1]]
    : responseMessages;
  const cardStatus = isLoading && anchorMessageId
    ? 'running'
    : (isLoading && !finalResponse ? 'running' : 'completed');
  const startedAt = String(anchorMessage?.timestamp || assistantMessages[0]?.timestamp || '');
  const updatedAt = String(lastAssistantMessage?.timestamp || startedAt);

  return {
    sessionId: String(lastResponse?.sessionId || lastAssistantMessage?.sessionId || anchorMessage?.sessionId || ''),
    anchorMessageId,
    cardStatus,
    headline: cardStatus === 'running' ? '执行中' : '已完成',
    finalResponse,
    responseMessages: normalizedResponseMessages,
    processItems,
    previewItems: processItems.slice(-5),
    activeInteraction: null,
    startedAt,
    updatedAt,
    completedAt: cardStatus === 'running' ? null : updatedAt,
    defaultExpanded: false,
    source: 'fallback',
  };
}

function buildLegacyAssistantRunCards(
  messages: ChatMessage[],
  runCardsByAnchorMessageId: Map<string, RunCardModel>,
  standaloneRunCards: RunCardModel[],
  isLoading: boolean,
): RunCardModel[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  const synthesizedCards: RunCardModel[] = [];
  let currentAnchorMessage: ChatMessage | null = null;
  let currentAssistantGroup: ChatMessage[] = [];

  const flushAssistantGroup = () => {
    if (currentAssistantGroup.length === 0) {
      return;
    }

    const anchorMessageId = currentAnchorMessage ? getMessageIdentity(currentAnchorMessage) : '';
    if (anchorMessageId && runCardsByAnchorMessageId.has(anchorMessageId)) {
      currentAssistantGroup = [];
      return;
    }

    const card = buildLegacyAssistantRunCardFromGroup(
      currentAssistantGroup,
      currentAnchorMessage,
      [...standaloneRunCards, ...synthesizedCards.filter((item) => !item.anchorMessageId)],
      isLoading,
    );

    if (card) {
      synthesizedCards.push(card);
    }

    currentAssistantGroup = [];
  };

  for (const message of messages) {
    if (message.type === 'user') {
      flushAssistantGroup();
      currentAnchorMessage = message;
      continue;
    }

    if (message.type === 'assistant') {
      currentAssistantGroup.push(message);
      continue;
    }

    flushAssistantGroup();
    currentAnchorMessage = null;
  }

  flushAssistantGroup();
  return synthesizedCards;
}

function trimLegacyAssistantMessages(
  messages: ChatMessage[],
  hasRenderableRunCards: boolean,
  runCardsByAnchorMessageId: Map<string, RunCardModel>,
  standaloneRunCards: RunCardModel[],
) {
  if (!hasRenderableRunCards || messages.length === 0) {
    return messages;
  }

  let lastUserMessageId = '';

  return messages.filter((message) => {
    if (message.type === 'user') {
      lastUserMessageId = getMessageIdentity(message);
      return true;
    }

    if (message.type === 'error') {
      return true;
    }

    if (message.type !== 'assistant') {
      return true;
    }

    if (message.isThinking) {
      return false;
    }

    if (isDuplicatedByStandaloneRunCard(message, standaloneRunCards)) {
      return false;
    }

    return !lastUserMessageId || !runCardsByAnchorMessageId.has(lastUserMessageId);
  });
}

function buildTransientAssistantRunCard(
  chatMessages: ChatMessage[],
  runCardsByAnchorMessageId: Map<string, RunCardModel>,
  standaloneRunCards: RunCardModel[],
  isLoading: boolean,
): RunCardModel | null {
  if (!Array.isArray(chatMessages) || chatMessages.length === 0) {
    return null;
  }

  const trailingAssistantMessages: ChatMessage[] = [];
  for (let index = chatMessages.length - 1; index >= 0; index -= 1) {
    const message = chatMessages[index];

    if (message.type === 'assistant') {
      trailingAssistantMessages.unshift(message);
      continue;
    }

    if (message.type === 'user') {
      const anchorMessageId = getMessageIdentity(message);
      if (anchorMessageId && runCardsByAnchorMessageId.has(anchorMessageId)) {
        return null;
      }

      const visibleAssistantMessages = trailingAssistantMessages.filter((item) => {
        if (item.isThinking || item.isTaskNotification) {
          return false;
        }

        return Boolean(normalizeComparableText(item.content));
      });

      if (visibleAssistantMessages.length === 0) {
        return null;
      }

      const lastAssistantMessage = visibleAssistantMessages[visibleAssistantMessages.length - 1];
      const finalResponse = String(lastAssistantMessage.content || '').trim();
      const hasStandaloneDuplicate = standaloneRunCards.some((card) => (
        normalizeComparableText(card.finalResponse) === normalizeComparableText(finalResponse)
      ));
      if (hasStandaloneDuplicate) {
        return null;
      }

      return {
        sessionId: String(lastAssistantMessage.sessionId || message.sessionId || ''),
        anchorMessageId,
        cardStatus: isLoading ? 'running' : 'completed',
        headline: isLoading ? '执行中' : '已完成',
        finalResponse,
        responseMessages: [{
          id: String(lastAssistantMessage.id || lastAssistantMessage.messageId || 'transient-assistant-final'),
          timestamp: String(lastAssistantMessage.timestamp || ''),
          kind: 'final',
          body: finalResponse,
        }],
        processItems: [],
        activeInteraction: null,
        startedAt: String(message.timestamp || ''),
        updatedAt: String(lastAssistantMessage.timestamp || message.timestamp || ''),
        completedAt: isLoading ? null : String(lastAssistantMessage.timestamp || ''),
        defaultExpanded: false,
        source: 'sdk-live',
      };
    }

    return null;
  }

  return null;
}

function parseChronologicalTimestamp(value: string | null | undefined) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function getRunCardTimestamp(card: RunCardModel) {
  return parseChronologicalTimestamp(card.startedAt)
    ?? parseChronologicalTimestamp(card.updatedAt)
    ?? parseChronologicalTimestamp(card.completedAt);
}

interface ChatMessagesPaneProps {
  scrollContainerRef: RefObject<HTMLDivElement>;
  onScroll: () => void;
  onWheel: () => void;
  onTouchMove: () => void;
  isLoadingSessionMessages: boolean;
  chatMessages: ChatMessage[];
  selectedSession: ProjectSession | null;
  currentSessionId: string | null;
  claudeModel: string;
  isLoadingMoreMessages: boolean;
  hasMoreMessages: boolean;
  totalMessages: number;
  loadedCanonicalMessageCount: number;
  visibleMessages: ChatMessage[];
  loadEarlierMessages: () => void;
  loadAllMessages: () => void;
  allMessagesLoaded: boolean;
  isLoadingAllMessages: boolean;
  loadAllJustFinished: boolean;
  showLoadAllOverlay: boolean;
  createDiff: any;
  onFileOpen?: (filePath: string, diffInfo?: unknown) => void;
  onOpenUrl?: (url: string) => void;
  onShowSettings?: () => void;
  onGrantToolPermission: (suggestion: { entry: string; toolName: string }) => { success: boolean };
  handlePermissionDecision: (
    requestIds: string | string[],
    decision: { allow?: boolean; message?: string; rememberEntry?: string | null; updatedInput?: unknown },
  ) => void;
  pendingDecisionRequests?: PendingDecisionRequest[];
  autoExpandTools?: boolean;
  showRawParameters?: boolean;
  showThinking?: boolean;
  selectedProject: Project;
  isLoading: boolean;
  claudeStatus: { text: string; tokens: number; can_interrupt: boolean } | null;
  runCards?: RunCardModel[];
  conversationTurns?: ConversationTurn[];
  conversationRounds?: ConversationRound[];
}

function roundAssistantCardToRunCard(round: ConversationRound): RunCardModel {
  const { assistantCard } = round;
  const responseMessages = collapseRedundantResponseMessages(
    assistantCard.responseSegments.map((segment) => ({
      id: segment.id,
      timestamp: String(segment.timestamp || ''),
      kind: segment.kind,
      body: segment.body,
    })),
  );
  const finalResponse = [...assistantCard.responseSegments]
    .reverse()
    .find((segment) => segment.kind === 'final' && String(segment.body || '').trim())
    ?.body || '';

  return {
    sessionId: assistantCard.sessionId,
    anchorMessageId: assistantCard.anchorMessageId,
    cardStatus: assistantCard.status,
    headline: assistantCard.headline,
    finalResponse,
    responseMessages,
    processItems: assistantCard.processItems,
    previewItems: collapseRedundantPreviewItems(assistantCard.previewItems, responseMessages),
    activeInteraction: assistantCard.activeInteraction,
    startedAt: assistantCard.startedAt,
    updatedAt: assistantCard.updatedAt,
    completedAt: assistantCard.completedAt,
    defaultExpanded: assistantCard.source === 'sdk-live',
    source: assistantCard.source,
    runId: assistantCard.runId,
  };
}

function hasVisibleRoundAssistantSurface(round: ConversationRound) {
  const { assistantCard } = round;
  if (assistantCard.activeInteraction) {
    return true;
  }

  if (assistantCard.processItems.length > 0) {
    return true;
  }

  return assistantCard.responseSegments.some((segment) => Boolean(String(segment.body || '').trim()));
}

export default function ChatMessagesPane({
  scrollContainerRef,
  onScroll,
  onWheel,
  onTouchMove,
  isLoadingSessionMessages,
  chatMessages,
  selectedSession,
  currentSessionId,
  claudeModel,
  isLoadingMoreMessages,
  hasMoreMessages,
  totalMessages,
  loadedCanonicalMessageCount,
  visibleMessages,
  loadEarlierMessages,
  loadAllMessages,
  allMessagesLoaded,
  isLoadingAllMessages,
  loadAllJustFinished,
  showLoadAllOverlay,
  createDiff,
  onFileOpen,
  onOpenUrl,
  onShowSettings,
  onGrantToolPermission,
  handlePermissionDecision,
  pendingDecisionRequests = [],
  autoExpandTools,
  showRawParameters,
  showThinking,
  selectedProject,
  isLoading,
  claudeStatus,
  runCards = [],
  conversationTurns = [],
  conversationRounds = [],
}: ChatMessagesPaneProps) {
  const { t } = useTranslation('chat');
  const useConversationRounds = conversationRounds.length > 0;
  const hasAssistantConversationTurn = conversationTurns.some((turn) => turn.kind === 'assistant');
  const useConversationTurns = !useConversationRounds
    && conversationTurns.length > 0
    && (hasAssistantConversationTurn || runCards.length === 0);
  const pendingPermissionRequestIds = new Set(
    pendingDecisionRequests.map((request) => String(request.requestId || '').trim()).filter(Boolean),
  );
  const hasRenderableV2History = useConversationRounds || runCards.length > 0 || useConversationTurns;
  const showEmptyState = shouldRenderChatEmptyState({
    chatMessagesLength: chatMessages.length,
    hasRenderableV2History,
    isLoadingSessionMessages,
    isLoading,
  });
  const shouldShowEmptyState = showEmptyState && !hasRenderableV2History;
  const messageKeyMapRef = useRef<WeakMap<ChatMessage, string>>(new WeakMap());
  const allocatedKeysRef = useRef<Set<string>>(new Set());
  const generatedMessageKeyCounterRef = useRef(0);
  const runCardsByAnchorMessageId = new Map<string, RunCardModel>();
  const standaloneRunCards: RunCardModel[] = [];
  for (const card of runCards) {
    const anchorMessageId = String(card.anchorMessageId || '').trim();
    if (!anchorMessageId) {
      standaloneRunCards.push(card);
      continue;
    }

    runCardsByAnchorMessageId.set(anchorMessageId, card);
  }
  const synthesizedLegacyRunCards = useConversationTurns
    ? []
    : buildLegacyAssistantRunCards(
        chatMessages,
        runCardsByAnchorMessageId,
        standaloneRunCards,
        isLoading,
      );
  for (const card of synthesizedLegacyRunCards) {
    const anchorMessageId = String(card.anchorMessageId || '').trim();
    if (anchorMessageId) {
      if (!runCardsByAnchorMessageId.has(anchorMessageId)) {
        runCardsByAnchorMessageId.set(anchorMessageId, card);
      }
      continue;
    }

    standaloneRunCards.push(card);
  }
  const transientAssistantRunCard = useConversationTurns
    ? null
    : buildTransientAssistantRunCard(
        chatMessages,
        runCardsByAnchorMessageId,
        standaloneRunCards,
        isLoading,
      );
  if (transientAssistantRunCard) {
    const anchorMessageId = String(transientAssistantRunCard.anchorMessageId || '').trim();
    if (anchorMessageId) {
      runCardsByAnchorMessageId.set(anchorMessageId, transientAssistantRunCard);
    } else {
      standaloneRunCards.push(transientAssistantRunCard);
    }
  }
  const hasRenderableRunCards = runCardsByAnchorMessageId.size > 0 || standaloneRunCards.length > 0;
  const hasPrimaryAssistantTurn = runCardsByAnchorMessageId.size > 0;
  const renderedMessages = useConversationTurns
    ? []
    : trimLegacyAssistantMessages(
        visibleMessages,
        hasRenderableRunCards,
        runCardsByAnchorMessageId,
        standaloneRunCards,
      );
  const buildRunCardKey = useCallback((card: RunCardModel) => {
    const anchorMessageId = String(card.anchorMessageId || '').trim() || 'standalone';
    const sessionId = String(card.sessionId || '').trim();
    const source = String(card.source || '').trim() || 'run-card';
    const requestId = String(card.activeInteraction?.requestId || '').trim() || 'run-card';
    const stableSuffix = card.activeInteraction?.requestId
      ? requestId
      : `${String(card.cardStatus || '').trim() || 'run-card'}-${String(card.startedAt || '').trim() || 'run-card'}`;

    return `${anchorMessageId}-${sessionId}-${source}-${stableSuffix}`;
  }, []);
  standaloneRunCards.sort((left, right) => {
    const leftTime = getRunCardTimestamp(left);
    const rightTime = getRunCardTimestamp(right);
    if (leftTime != null && rightTime != null && leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    if (leftTime != null && rightTime == null) {
      return -1;
    }

    if (leftTime == null && rightTime != null) {
      return 1;
    }

    return String(left.sessionId || '').localeCompare(String(right.sessionId || ''));
  });
  const shouldShowLoadingPlaceholder = (
    isLoading
    && renderedMessages.length === 0
    && !isLoadingSessionMessages
    && !hasPrimaryAssistantTurn
    && !useConversationRounds
    && !useConversationTurns
  );
  const loadingText = String(claudeStatus?.text || '').trim() || t('claudeStatus.actions.thinking', { defaultValue: '思考中' });

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    (window as unknown as {
      __CCUI_CHAT_DEBUG__?: {
        renderingMode: 'conversationRounds' | 'conversationTurns' | 'legacy';
        turns: Array<Record<string, unknown>>;
        legacyMessages: Array<Record<string, unknown>>;
      };
    }).__CCUI_CHAT_DEBUG__ = {
      renderingMode: useConversationRounds
        ? 'conversationRounds'
        : (useConversationTurns ? 'conversationTurns' : 'legacy'),
      turns: conversationTurns.map((turn) => ({
        kind: turn.kind,
        id: turn.id,
        source: turn.source,
        timestamp: turn.kind === 'user' ? turn.timestamp : turn.startedAt || turn.updatedAt || turn.completedAt,
        anchorMessageId: turn.kind === 'assistant' ? turn.anchorMessageId : null,
        text: turn.kind === 'user'
          ? turn.content
          : turn.bodySegments.map((segment) => segment.body).filter(Boolean).join('\n\n'),
      })),
      legacyMessages: renderedMessages.map((message) => ({
        type: message.type,
        id: String(message.id || message.messageId || ''),
        timestamp: message.timestamp,
        text: message.content,
      })),
    };

    return () => {
      delete (window as unknown as { __CCUI_CHAT_DEBUG__?: unknown }).__CCUI_CHAT_DEBUG__;
    };
  }, [conversationTurns, renderedMessages, useConversationRounds, useConversationTurns]);

  // Keep keys stable across prepends so existing MessageComponent instances retain local state.
  const getMessageKey = useCallback((message: ChatMessage) => {
    const existingKey = messageKeyMapRef.current.get(message);
    if (existingKey) {
      return existingKey;
    }

    const intrinsicKey = getIntrinsicMessageKey(message);
    let candidateKey = intrinsicKey;

    if (!candidateKey || allocatedKeysRef.current.has(candidateKey)) {
      do {
        generatedMessageKeyCounterRef.current += 1;
        candidateKey = intrinsicKey
          ? `${intrinsicKey}-${generatedMessageKeyCounterRef.current}`
          : `message-generated-${generatedMessageKeyCounterRef.current}`;
      } while (allocatedKeysRef.current.has(candidateKey));
    }

    allocatedKeysRef.current.add(candidateKey);
    messageKeyMapRef.current.set(message, candidateKey);
    return candidateKey;
  }, []);
  const renderRunCardInteraction = useCallback((card: RunCardModel) => {
    const activeInteraction = card.activeInteraction;
    const requestId = String(activeInteraction?.requestId || '').trim();
    if (!requestId || !pendingPermissionRequestIds.has(requestId)) {
      return null;
    }

    return (
      <RunCardInteraction
        interaction={activeInteraction!}
        handlePermissionDecision={handlePermissionDecision}
        handleGrantToolPermission={onGrantToolPermission}
      />
    );
  }, [handlePermissionDecision, onGrantToolPermission, pendingPermissionRequestIds]);
  let standaloneRunCardIndex = 0;
  const renderStandaloneRunCard = (card: RunCardModel, index: number) => (
    <section
      key={buildRunCardKey(card) || `${card.anchorMessageId || 'standalone'}-${index}`}
      className="space-y-3"
      data-chat-v2-run-card-standalone="true"
    >
      <RunCardView
        card={card}
        interactionNode={renderRunCardInteraction(card)}
        onFileOpen={onFileOpen}
      />
    </section>
  );
  const renderConversationTurn = (turn: ConversationTurn) => {
    if (turn.kind === 'user') {
      const message: ChatMessage = {
        id: turn.id,
        messageId: turn.id,
        sessionId: turn.sessionId,
        type: 'user',
        content: turn.content,
        images: Array.isArray(turn.images) ? turn.images : [],
        timestamp: turn.timestamp,
        normalizedKind: 'text',
      };

      return (
        <section
          key={turn.id}
          data-chat-turn="true"
          data-chat-turn-kind={turn.kind}
          data-chat-turn-id={turn.id}
          data-chat-turn-source={turn.source}
        >
          <MessageComponent
            messageKey={turn.id}
            message={message}
            prevMessage={null}
            createDiff={createDiff}
            onFileOpen={onFileOpen}
            onOpenUrl={onOpenUrl}
            onShowSettings={onShowSettings}
            onGrantToolPermission={onGrantToolPermission}
            autoExpandTools={autoExpandTools}
            showRawParameters={showRawParameters}
            showThinking={showThinking}
            selectedProject={selectedProject}
            provider="claude"
          />
        </section>
      );
    }

    const card = assistantTurnToRunCard(turn);
    return (
      <section
        key={turn.id}
        data-chat-turn="true"
        data-chat-turn-kind={turn.kind}
        data-chat-turn-id={turn.id}
        data-chat-turn-source={turn.source}
        data-chat-turn-anchor-id={turn.anchorMessageId}
      >
        <RunCardView
          card={card}
          interactionNode={renderRunCardInteraction(card)}
          onFileOpen={onFileOpen}
        />
      </section>
    );
  };

  const renderConversationRound = (round: ConversationRound) => {
    const userMessage: ChatMessage = {
      id: round.userMessage.id,
      messageId: round.userMessage.id,
      sessionId: round.userMessage.sessionId,
      type: 'user',
      content: round.userMessage.content,
      images: Array.isArray(round.userMessage.images) ? round.userMessage.images : [],
      timestamp: round.userMessage.timestamp,
      normalizedKind: 'text',
    };
    const shouldRenderAssistantCard = hasVisibleRoundAssistantSurface(round);
    const assistantCard = shouldRenderAssistantCard ? roundAssistantCardToRunCard(round) : null;

    return (
      <React.Fragment key={round.id}>
        <section
          data-chat-round="true"
          data-chat-round-id={round.id}
          data-chat-round-user-id={round.userMessage.id}
        >
          <MessageComponent
            messageKey={round.userMessage.id}
            message={userMessage}
            prevMessage={null}
            createDiff={createDiff}
            onFileOpen={onFileOpen}
            onOpenUrl={onOpenUrl}
            onShowSettings={onShowSettings}
            onGrantToolPermission={onGrantToolPermission}
            autoExpandTools={autoExpandTools}
            showRawParameters={showRawParameters}
            showThinking={showThinking}
            selectedProject={selectedProject}
            provider="claude"
          />
        </section>
        {assistantCard ? (
          <section
            data-chat-round="true"
            data-chat-round-id={round.id}
            data-chat-round-assistant-id={round.assistantCard.id}
            data-chat-round-assistant-anchor-id={round.assistantCard.anchorMessageId}
          >
            <RunCardView
              card={assistantCard}
              interactionNode={renderRunCardInteraction(assistantCard)}
              onFileOpen={onFileOpen}
            />
          </section>
        ) : null}
      </React.Fragment>
    );
  };

  return (
    <div
      ref={scrollContainerRef}
      onScroll={onScroll}
      onWheel={onWheel}
      onTouchMove={onTouchMove}
      data-scroll-container="true"
      className="ui-scrollbar relative flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-0 py-3 sm:space-y-4 sm:p-4"
    >
      {isLoadingSessionMessages && chatMessages.length === 0 && runCards.length === 0 ? (
        <div className="mt-8 text-center text-gray-500 dark:text-gray-400">
          <div className="flex items-center justify-center space-x-2">
            <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-gray-400" />
            <p>{t('session.loading.sessionMessages')}</p>
          </div>
        </div>
      ) : shouldShowEmptyState ? (
        <ProviderSelectionEmptyState
          selectedSession={selectedSession}
          currentSessionId={currentSessionId}
          claudeModel={claudeModel}
        />
      ) : (
        <>
          {shouldShowLoadingPlaceholder && (
            <div
              data-chat-loading-placeholder="true"
              className="rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-600 shadow-sm"
            >
              {loadingText}
            </div>
          )}

          {useConversationRounds ? (
            conversationRounds.map((round) => renderConversationRound(round))
          ) : useConversationTurns ? (
            conversationTurns.map((turn) => renderConversationTurn(turn))
          ) : (
            <>
              {renderedMessages.map((message, index) => {
                const prevMessage = index > 0 ? renderedMessages[index - 1] : null;
                const messageKey = getMessageKey(message);
                const messageTimestamp = parseChronologicalTimestamp(String(message.timestamp || ''));
                const anchoredRunCard = message.type === 'user'
                  ? runCardsByAnchorMessageId.get(String(message.id || message.messageId || '').trim()) || null
                  : null;
                const standaloneBeforeMessage = [];

                while (standaloneRunCardIndex < standaloneRunCards.length) {
                  const candidate = standaloneRunCards[standaloneRunCardIndex];
                  const candidateTimestamp = getRunCardTimestamp(candidate);
                  if (messageTimestamp == null || candidateTimestamp == null || candidateTimestamp > messageTimestamp) {
                    break;
                  }

                  standaloneBeforeMessage.push(renderStandaloneRunCard(candidate, standaloneRunCardIndex));
                  standaloneRunCardIndex += 1;
                }

                return (
                  <React.Fragment key={messageKey}>
                    {standaloneBeforeMessage}
                    <MessageComponent
                      messageKey={messageKey}
                      message={message}
                      prevMessage={prevMessage}
                      createDiff={createDiff}
                      onFileOpen={onFileOpen}
                      onOpenUrl={onOpenUrl}
                      onShowSettings={onShowSettings}
                      onGrantToolPermission={onGrantToolPermission}
                      autoExpandTools={autoExpandTools}
                      showRawParameters={showRawParameters}
                      showThinking={showThinking}
                      selectedProject={selectedProject}
                      provider="claude"
                    />
                    {anchoredRunCard ? (
                      <RunCardView
                        key={buildRunCardKey(anchoredRunCard)}
                        card={anchoredRunCard}
                        interactionNode={renderRunCardInteraction(anchoredRunCard)}
                        onFileOpen={onFileOpen}
                      />
                    ) : null}
                  </React.Fragment>
                );
              })}

              {standaloneRunCardIndex < standaloneRunCards.length
                ? standaloneRunCards.slice(standaloneRunCardIndex).map((card, index) => (
                  renderStandaloneRunCard(card, standaloneRunCardIndex + index)
                ))
                : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
