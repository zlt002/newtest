import {
  type ChatMessage,
  type PendingDecisionRequest,
  isPendingQuestionRequest,
} from '../../chat/types/types.ts';
import type { RunCardInteraction, RunCard } from '../types/runCard.ts';
import type { CanonicalSessionMessage } from '../types/sessionHistory.ts';
import type {
  AssistantTurnViewModel,
  ConversationTurn,
  UserTurnViewModel,
  UserTurnSource,
} from '../types/conversationTurn.ts';
import type { AgentRealtimeEvent } from './projectLiveSdkFeed.ts';
import { projectHistoricalChatMessages } from './projectHistoricalChatMessages.ts';
import { projectHistoricalRunCards, projectLiveRunCards } from './projectRunCards.ts';

type ProjectConversationTurnsInput = {
  sessionId: string | null;
  historicalMessages: CanonicalSessionMessage[];
  transientMessages: ChatMessage[];
  realtimeEvents: AgentRealtimeEvent[];
  pendingDecisionRequests: PendingDecisionRequest[];
  isLoading: boolean;
};

function getMessageId(message: ChatMessage) {
  return String(message.id || message.messageId || '').trim();
}

function toUserTurn(message: ChatMessage, source: UserTurnSource): UserTurnViewModel | null {
  const id = getMessageId(message);
  const content = String(message.content || '').trim();
  const images = Array.isArray(message.images) ? message.images : [];
  if (!id || (!content && images.length === 0)) {
    return null;
  }

  return {
    kind: 'user',
    id,
    sessionId: String(message.sessionId || ''),
    content,
    images,
    timestamp: String(message.timestamp || ''),
    source,
  };
}

function normalizeUserTurnSignature(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function isSameUserTurn(left: UserTurnViewModel, right: UserTurnViewModel) {
  const leftContent = normalizeUserTurnSignature(left.content);
  const rightContent = normalizeUserTurnSignature(right.content);
  if (!leftContent || leftContent !== rightContent) {
    return false;
  }

  const leftTimestamp = Date.parse(String(left.timestamp || ''));
  const rightTimestamp = Date.parse(String(right.timestamp || ''));
  if (!Number.isFinite(leftTimestamp) || !Number.isFinite(rightTimestamp)) {
    return false;
  }

  return Math.abs(leftTimestamp - rightTimestamp) <= 5_000;
}

function toAssistantTurn(card: RunCard): AssistantTurnViewModel {
  const responseMessages = Array.isArray(card.responseMessages) ? card.responseMessages : [];
  const finalResponse = String(card.finalResponse || '').trim();
  const bodySegments = responseMessages.length > 0
    ? responseMessages
    : finalResponse
      ? [{
          id: `${card.anchorMessageId || card.sessionId || 'assistant'}-final`,
          timestamp: card.completedAt || card.updatedAt || card.startedAt || '',
          kind: 'final' as const,
          body: finalResponse,
        }]
      : [];

  return {
    kind: 'assistant',
    id: `${card.sessionId || 'session'}:${card.anchorMessageId || card.startedAt || card.updatedAt || 'assistant'}`,
    sessionId: card.sessionId,
    runId: null,
    anchorMessageId: card.anchorMessageId,
    status: card.cardStatus,
    headline: card.headline,
    activityItems: card.processItems,
    bodySegments,
    activeInteraction: card.activeInteraction,
    startedAt: card.startedAt,
    updatedAt: card.updatedAt,
    completedAt: card.completedAt,
    source: card.source,
  };
}

function normalizeComparableText(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function buildTransientAssistantFallbackTurnForGroup(
  userMessage: ChatMessage | null,
  anchorTurn: UserTurnViewModel | null,
  assistantMessages: ChatMessage[],
): AssistantTurnViewModel | null {
  if (!userMessage) {
    return null;
  }

  const anchorMessageId = anchorTurn?.id || getMessageId(userMessage);
  const visibleAssistantMessages = assistantMessages.filter((item) => {
    if (item.isThinking || item.isTaskNotification) {
      return false;
    }

    return Boolean(normalizeComparableText(item.content));
  });

  if (!anchorMessageId || visibleAssistantMessages.length === 0) {
    return null;
  }

  const finalAssistantMessage = visibleAssistantMessages[visibleAssistantMessages.length - 1];
  const finalBody = String(finalAssistantMessage.content || '').trim();
  if (!finalBody) {
    return null;
  }

  const dedupedBodySegments = [];
  const segmentIndexByBodySignature = new Map<string, number>();
  for (let index = 0; index < visibleAssistantMessages.length; index += 1) {
    const message = visibleAssistantMessages[index];
    const kind = index === visibleAssistantMessages.length - 1 ? 'final' as const : 'phase' as const;
    const body = String(message.content || '').trim();
    const signature = normalizeComparableText(body);
    if (!body) {
      continue;
    }

    const nextSegment = {
      id: String(message.id || message.messageId || `${anchorMessageId}-fallback-${index}`),
      timestamp: String(message.timestamp || ''),
      kind,
      body,
    };
    const existingIndex = segmentIndexByBodySignature.get(signature);
    if (existingIndex == null) {
      segmentIndexByBodySignature.set(signature, dedupedBodySegments.length);
      dedupedBodySegments.push(nextSegment);
      continue;
    }

    if (kind === 'final') {
      dedupedBodySegments[existingIndex] = nextSegment;
    }
  }

  return {
    kind: 'assistant',
    id: `${String(anchorTurn?.sessionId || finalAssistantMessage.sessionId || userMessage.sessionId || 'session')}:fallback:${anchorMessageId}`,
    sessionId: String(anchorTurn?.sessionId || finalAssistantMessage.sessionId || userMessage.sessionId || ''),
    runId: null,
    anchorMessageId,
    status: 'completed',
    headline: '已完成',
    activityItems: [],
    bodySegments: dedupedBodySegments,
    activeInteraction: null,
    startedAt: String(anchorTurn?.timestamp || userMessage.timestamp || ''),
    updatedAt: String(finalAssistantMessage.timestamp || anchorTurn?.timestamp || userMessage.timestamp || ''),
    completedAt: String(finalAssistantMessage.timestamp || ''),
    source: 'fallback',
  };
}

function buildTransientAssistantFallbackTurns(
  transientMessages: ChatMessage[],
  userTurns: UserTurnViewModel[],
): AssistantTurnViewModel[] {
  if (!Array.isArray(transientMessages) || transientMessages.length === 0) {
    return [];
  }

  const turns: AssistantTurnViewModel[] = [];
  let currentUserMessage: ChatMessage | null = null;
  let currentAssistantMessages: ChatMessage[] = [];

  const resolveFallbackAnchorTurn = (message: ChatMessage | null): UserTurnViewModel | null => {
    if (!message) {
      return null;
    }

    const transientTurn = toUserTurn(message, 'transient');
    if (!transientTurn) {
      return null;
    }

    let fallbackMatch: UserTurnViewModel | null = null;
    for (const userTurn of userTurns) {
      if (!isSameUserTurn(userTurn, transientTurn)) {
        continue;
      }

      if (userTurn.source === 'official-history') {
        return userTurn;
      }

      fallbackMatch = userTurn;
    }

    return fallbackMatch || transientTurn;
  };

  const flushCurrentGroup = () => {
    const turn = buildTransientAssistantFallbackTurnForGroup(
      currentUserMessage,
      resolveFallbackAnchorTurn(currentUserMessage),
      currentAssistantMessages,
    );
    if (turn) {
      turns.push(turn);
    }
  };

  for (const message of transientMessages) {
    if (message.type === 'user') {
      flushCurrentGroup();
      currentUserMessage = message;
      currentAssistantMessages = [];
      continue;
    }

    if (message.type === 'assistant') {
      currentAssistantMessages.push(message);
    }
  }

  flushCurrentGroup();
  return turns;
}

function getTurnTime(turn: ConversationTurn) {
  const value = turn.kind === 'user'
    ? turn.timestamp
    : turn.startedAt || turn.updatedAt || turn.completedAt || '';
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function getAssistantIdentity(turn: AssistantTurnViewModel) {
  if (turn.anchorMessageId) {
    return `${turn.sessionId}:anchor:${turn.anchorMessageId}`;
  }

  if (turn.runId) {
    return `${turn.sessionId}:run:${turn.runId}`;
  }

  return `${turn.sessionId}:assistant:${turn.id}`;
}

function mergeBodySegments(left: AssistantTurnViewModel, right: AssistantTurnViewModel) {
  const byId = new Map(left.bodySegments.map((segment) => [segment.id, segment]));
  const seenSignatures = new Set(
    left.bodySegments.map((segment) => `${segment.kind}:${normalizeComparableText(segment.body)}`),
  );
  for (const segment of right.bodySegments) {
    const signature = `${segment.kind}:${normalizeComparableText(segment.body)}`;
    if (!byId.has(segment.id) && !seenSignatures.has(signature)) {
      byId.set(segment.id, segment);
      seenSignatures.add(signature);
    }
  }

  return [...byId.values()].sort((leftSegment, rightSegment) => {
    const leftTime = Date.parse(String(leftSegment.timestamp || ''));
    const rightTime = Date.parse(String(rightSegment.timestamp || ''));
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return 0;
  });
}

function mergeActivityItems(left: AssistantTurnViewModel, right: AssistantTurnViewModel) {
  const byId = new Map(left.activityItems.map((item) => [item.id, item]));
  for (const item of right.activityItems) {
    if (!byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }

  return [...byId.values()].sort((leftItem, rightItem) => {
    const leftTime = Date.parse(String(leftItem.timestamp || ''));
    const rightTime = Date.parse(String(rightItem.timestamp || ''));
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return 0;
  });
}

function mergeAssistantTurn(left: AssistantTurnViewModel, right: AssistantTurnViewModel): AssistantTurnViewModel {
  const rightIsTerminal = right.status === 'completed' || right.status === 'failed' || right.status === 'aborted';
  const rightIsBlocking = right.status === 'waiting_for_input';
  const mergedStatus = rightIsBlocking
    ? right.status
    : rightIsTerminal
      ? right.status
      : left.status === 'completed'
        ? left.status
        : right.status;

  return {
    ...left,
    ...right,
    status: mergedStatus,
    bodySegments: mergeBodySegments(left, right),
    activityItems: mergeActivityItems(left, right),
    activeInteraction: right.activeInteraction || left.activeInteraction,
    source: left.source === right.source ? left.source : 'mixed',
  };
}

function toAnchors(userTurns: UserTurnViewModel[]) {
  return userTurns.map((turn) => ({
    messageId: turn.id,
    content: turn.content,
    timestamp: turn.timestamp,
  }));
}

function pendingRequestToInteraction(request: PendingDecisionRequest): RunCardInteraction {
  const kind = isPendingQuestionRequest(request) ? 'interactive_prompt' : 'permission_request';

  return {
    requestId: request.requestId,
    kind,
    toolName: request.toolName || 'UnknownTool',
    message: kind === 'interactive_prompt' ? '需要你的回答' : '需要你的授权',
    input: request.input,
    context: request.context,
    payload: null,
  };
}

function attachPendingRequests(
  assistantTurns: AssistantTurnViewModel[],
  pendingDecisionRequests: PendingDecisionRequest[],
  sessionId: string | null,
) {
  if (pendingDecisionRequests.length === 0) {
    return assistantTurns;
  }

  const nextTurns = [...assistantTurns];

  for (const request of pendingDecisionRequests) {
    if (request.sessionId && sessionId && request.sessionId !== sessionId) {
      continue;
    }

    const interaction = pendingRequestToInteraction(request);
    const requestSessionId = request.sessionId || sessionId || '';
    const targetIndex = nextTurns.findIndex((turn) => (
      turn.sessionId === (requestSessionId || turn.sessionId)
      && (turn.status === 'running' || turn.status === 'waiting_for_input')
    ));
    const receivedAt = request.receivedAt instanceof Date
      ? request.receivedAt.toISOString()
      : new Date().toISOString();

    if (targetIndex >= 0) {
      const target = nextTurns[targetIndex];
      const hasExistingRequestItem = target.activityItems.some((item) => item.id === request.requestId);
      nextTurns[targetIndex] = {
        ...target,
        status: 'waiting_for_input',
        activeInteraction: interaction,
        updatedAt: receivedAt,
        activityItems: hasExistingRequestItem
          ? target.activityItems
          : [
              ...target.activityItems,
              {
                id: request.requestId,
                timestamp: receivedAt,
                kind: interaction.kind,
                title: interaction.toolName || interaction.kind,
                body: String(interaction.message || ''),
                tone: 'warning',
              },
            ],
      };
      continue;
    }

    nextTurns.push({
      kind: 'assistant',
      id: `${requestSessionId || 'session'}:pending:${request.requestId}`,
      sessionId: requestSessionId,
      runId: null,
      anchorMessageId: '',
      status: 'waiting_for_input',
      headline: interaction.kind === 'interactive_prompt' ? '等待你的回答' : '等待授权',
      activityItems: [{
        id: request.requestId,
        timestamp: receivedAt,
        kind: interaction.kind,
        title: interaction.toolName || interaction.kind,
        body: String(interaction.message || ''),
        tone: 'warning',
      }],
      bodySegments: [],
      activeInteraction: interaction,
      startedAt: receivedAt,
      updatedAt: receivedAt,
      completedAt: null,
      source: 'fallback',
    });
  }

  return nextTurns;
}

function constrainAssistantTurnToAnchorWindow(
  turn: AssistantTurnViewModel,
  anchorUserTimestampMs: number | null,
  nextUserTimestampMs: number | null,
): AssistantTurnViewModel | null {
  if (anchorUserTimestampMs == null && nextUserTimestampMs == null) {
    return turn;
  }

  const isWithinWindow = (timestamp: string | null | undefined) => {
    const parsed = Date.parse(String(timestamp || ''));
    if (!Number.isFinite(parsed)) {
      return true;
    }

    if (anchorUserTimestampMs != null && parsed < anchorUserTimestampMs) {
      return false;
    }

    if (nextUserTimestampMs != null && parsed >= nextUserTimestampMs) {
      return false;
    }

    return true;
  };

  const bodySegments = turn.bodySegments.filter((segment) => isWithinWindow(segment.timestamp));
  const activityItems = turn.activityItems.filter((item) => isWithinWindow(item.timestamp));
  const activeInteraction = turn.activeInteraction && isWithinWindow(turn.updatedAt)
    ? turn.activeInteraction
    : null;

  if (bodySegments.length === 0 && activityItems.length === 0 && !activeInteraction) {
    return null;
  }

  const latestRemainingTimestamp = [
    ...bodySegments.map((segment) => String(segment.timestamp || '')),
    ...activityItems.map((item) => String(item.timestamp || '')),
  ]
    .map((value) => ({ raw: value, parsed: Date.parse(value) }))
    .filter((entry) => Number.isFinite(entry.parsed))
    .sort((left, right) => left.parsed - right.parsed)
    .at(-1)?.raw || turn.updatedAt || turn.completedAt || turn.startedAt || null;

  return {
    ...turn,
    bodySegments,
    activityItems,
    activeInteraction,
    updatedAt: latestRemainingTimestamp,
    completedAt: turn.completedAt && isWithinWindow(turn.completedAt)
      ? turn.completedAt
      : (turn.status === 'completed' || turn.status === 'failed' || turn.status === 'aborted'
          ? latestRemainingTimestamp
          : null),
  };
}

function constrainAssistantTurnsToUserWindows(
  assistantTurns: AssistantTurnViewModel[],
  userTurns: UserTurnViewModel[],
) {
  if (assistantTurns.length === 0 || userTurns.length === 0) {
    return assistantTurns;
  }

  const orderedUsers = [...userTurns].sort((left, right) => {
    const leftTime = Date.parse(String(left.timestamp || ''));
    const rightTime = Date.parse(String(right.timestamp || ''));
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return 0;
  });

  const nextUserTimestampByAnchorId = new Map<string, number | null>();
  const currentUserTimestampByAnchorId = new Map<string, number | null>();
  for (let index = 0; index < orderedUsers.length; index += 1) {
    const currentTimestamp = Date.parse(String(orderedUsers[index].timestamp || ''));
    const nextUser = orderedUsers[index + 1] || null;
    const nextTimestamp = nextUser ? Date.parse(String(nextUser.timestamp || '')) : null;
    currentUserTimestampByAnchorId.set(
      orderedUsers[index].id,
      Number.isFinite(currentTimestamp) ? currentTimestamp : null,
    );
    nextUserTimestampByAnchorId.set(
      orderedUsers[index].id,
      Number.isFinite(nextTimestamp) ? nextTimestamp : null,
    );
  }

  return assistantTurns
    .map((turn) => constrainAssistantTurnToAnchorWindow(
      turn,
      currentUserTimestampByAnchorId.get(turn.anchorMessageId) ?? null,
      nextUserTimestampByAnchorId.get(turn.anchorMessageId) ?? null,
    ))
    .filter((turn): turn is AssistantTurnViewModel => Boolean(turn));
}

export function projectConversationTurns({
  sessionId,
  historicalMessages,
  transientMessages,
  realtimeEvents,
  pendingDecisionRequests,
}: ProjectConversationTurnsInput): ConversationTurn[] {
  const historicalChatMessages = projectHistoricalChatMessages(historicalMessages);
  const historicalUserTurns = historicalChatMessages
    .filter((message) => message.type === 'user')
    .map((message) => toUserTurn(message, 'official-history'))
    .filter((turn): turn is UserTurnViewModel => Boolean(turn));

  const transientUserTurns = transientMessages
    .filter((message) => message.type === 'user')
    .map((message) => toUserTurn(message, 'transient'))
    .filter((turn): turn is UserTurnViewModel => Boolean(turn));

  const userTurnsById = new Map<string, UserTurnViewModel>();
  for (const turn of historicalUserTurns) {
    userTurnsById.set(turn.id, turn);
  }
  for (const turn of transientUserTurns) {
    const isCanonicalEcho = [...userTurnsById.values()].some((historicalTurn) =>
      isSameUserTurn(historicalTurn, turn),
    );
    if (!isCanonicalEcho) {
      userTurnsById.set(turn.id, turn);
    }
  }

  const userTurns = [...userTurnsById.values()];
  const historicalAssistantTurns = projectHistoricalRunCards(historicalMessages).map(toAssistantTurn);
  const liveAssistantTurns = sessionId
    ? projectLiveRunCards({
        sessionId,
        anchoredUserMessages: toAnchors(userTurns),
        events: realtimeEvents,
      }).map((card) => ({
        ...toAssistantTurn(card),
        runId: card.runId ?? null,
      }))
    : [];

  const assistantTurnsByIdentity = new Map<string, AssistantTurnViewModel>();
  for (const turn of [...historicalAssistantTurns, ...liveAssistantTurns]) {
    const identity = getAssistantIdentity(turn);
    const existing = assistantTurnsByIdentity.get(identity);
    assistantTurnsByIdentity.set(identity, existing ? mergeAssistantTurn(existing, turn) : turn);
  }

  for (const transientAssistantFallbackTurn of buildTransientAssistantFallbackTurns(transientMessages, userTurns)) {
    const identity = getAssistantIdentity(transientAssistantFallbackTurn);
    if (!assistantTurnsByIdentity.has(identity)) {
      assistantTurnsByIdentity.set(identity, transientAssistantFallbackTurn);
    }
  }

  const assistantTurns = attachPendingRequests(
    [...assistantTurnsByIdentity.values()],
    pendingDecisionRequests,
    sessionId,
  );
  const constrainedAssistantTurns = constrainAssistantTurnsToUserWindows(assistantTurns, userTurns);
  const turns: ConversationTurn[] = [...userTurns, ...constrainedAssistantTurns];

  return turns.sort((left, right) => {
    const leftTime = getTurnTime(left);
    const rightTime = getTurnTime(right);
    if (leftTime != null && rightTime != null && leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    if (left.kind === 'user' && right.kind === 'assistant') {
      return -1;
    }
    if (left.kind === 'assistant' && right.kind === 'user') {
      return 1;
    }
    return 0;
  });
}
