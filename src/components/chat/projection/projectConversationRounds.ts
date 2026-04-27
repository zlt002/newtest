import type { ConversationTurn } from '../types/conversationTurn.ts';
import type {
  AssistantCardViewModel,
  ConversationRound,
} from '../types/conversationRound.ts';
import type { RunCard as RunCardModel } from '../types/runCard.ts';
import { assistantTurnToRunCard } from '../types/conversationTurn.ts';

type ProjectConversationRoundsInput = {
  sessionId: string | null;
  conversationTurns: ConversationTurn[];
  fallbackRunCards?: RunCardModel[];
};

function previewLastFive(processItems: AssistantCardViewModel['processItems']) {
  return processItems.slice(-5);
}

function buildPendingAssistantCard(
  sessionId: string,
  anchorMessageId: string,
  timestamp: string,
): AssistantCardViewModel {
  return {
    id: `${sessionId}:pending:${anchorMessageId}`,
    sessionId,
    runId: null,
    anchorMessageId,
    status: 'queued',
    headline: '正在启动',
    responseSegments: [],
    processItems: [],
    previewItems: [],
    activeInteraction: null,
    startedAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
    source: 'fallback',
  };
}

function normalizeComparableText(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function mergeResponseSegments(
  left: AssistantCardViewModel['responseSegments'],
  right: AssistantCardViewModel['responseSegments'],
) {
  const byId = new Map(left.map((segment) => [segment.id, segment]));
  const seenSignatures = new Set(
    left.map((segment) => `${segment.kind}:${normalizeComparableText(segment.body)}`),
  );

  for (const segment of right) {
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

function mergeProcessItems(
  left: AssistantCardViewModel['processItems'],
  right: AssistantCardViewModel['processItems'],
) {
  const byId = new Map(left.map((item) => [item.id, item]));
  for (const item of right) {
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

function mergeAssistantStatus(
  current: AssistantCardViewModel['status'],
  incoming: AssistantCardViewModel['status'],
) {
  const incomingIsTerminal = incoming === 'completed' || incoming === 'failed' || incoming === 'aborted';
  if (incoming === 'waiting_for_input' || incomingIsTerminal) {
    return incoming;
  }

  if (current === 'completed' || current === 'failed' || current === 'aborted') {
    return current;
  }

  if (current === 'waiting_for_input') {
    return current;
  }

  return incoming;
}

function mergeAssistantCards(
  current: AssistantCardViewModel,
  incoming: AssistantCardViewModel,
): AssistantCardViewModel {
  const responseSegments = mergeResponseSegments(
    current.responseSegments,
    incoming.responseSegments,
  );
  const processItems = mergeProcessItems(current.processItems, incoming.processItems);
  const currentIsPlaceholder = current.status === 'queued'
    && current.source === 'fallback'
    && current.responseSegments.length === 0
    && current.processItems.length === 0
    && !current.activeInteraction;

  return {
    ...current,
    ...incoming,
    status: mergeAssistantStatus(current.status, incoming.status),
    responseSegments,
    processItems,
    previewItems: previewLastFive(processItems),
    activeInteraction: incoming.activeInteraction || current.activeInteraction,
    source: currentIsPlaceholder
      ? incoming.source
      : (current.source === incoming.source ? current.source : 'mixed'),
  };
}

function toAssistantCardFromFallback(turn: Extract<ConversationTurn, { kind: 'assistant' }>) {
  const sessionId = turn.sessionId || '';
  return {
    id: turn.id || `${sessionId}:fallback:${turn.anchorMessageId || 'assistant'}`,
    sessionId,
    runId: turn.runId,
    anchorMessageId: turn.anchorMessageId,
    status: turn.status,
    headline: turn.headline,
    responseSegments: turn.bodySegments.map((segment) => ({
      id: segment.id,
      kind: segment.kind,
      body: segment.body,
      timestamp: segment.timestamp || null,
    })),
    processItems: turn.activityItems,
    previewItems: previewLastFive(turn.activityItems),
    activeInteraction: turn.activeInteraction,
    startedAt: turn.startedAt,
    updatedAt: turn.updatedAt,
    completedAt: turn.completedAt,
    source: 'fallback' as const,
  };
}

function toAssistantCard(turn: Extract<ConversationTurn, { kind: 'assistant' }>): AssistantCardViewModel {
  if (turn.source === 'fallback') {
    return toAssistantCardFromFallback(turn);
  }

  const card = assistantTurnToRunCard(turn);
  return {
    id: turn.id,
    sessionId: card.sessionId,
    runId: turn.runId,
    anchorMessageId: card.anchorMessageId,
    status: card.cardStatus,
    headline: card.headline,
    responseSegments: (card.responseMessages || []).map((segment) => ({
      id: segment.id,
      kind: segment.kind,
      body: segment.body,
      timestamp: segment.timestamp || null,
    })),
    processItems: card.processItems,
    previewItems: previewLastFive(card.processItems),
    activeInteraction: card.activeInteraction,
    startedAt: card.startedAt,
    updatedAt: card.updatedAt,
    completedAt: card.completedAt,
    source: card.source,
  };
}

function toAssistantCardFromRunCard(card: RunCardModel): AssistantCardViewModel {
  const responseSegments = Array.isArray(card.responseMessages) && card.responseMessages.length > 0
    ? card.responseMessages.map((segment) => ({
        id: segment.id,
        kind: segment.kind,
        body: segment.body,
        timestamp: segment.timestamp || null,
      }))
    : String(card.finalResponse || '').trim()
      ? [{
          id: `${card.anchorMessageId || card.sessionId || 'assistant'}-final`,
          kind: 'final' as const,
          body: String(card.finalResponse || '').trim(),
          timestamp: card.completedAt || card.updatedAt || card.startedAt || null,
        }]
      : [];

  return {
    id: `${card.sessionId || 'session'}:${card.anchorMessageId || card.startedAt || card.updatedAt || 'assistant'}`,
    sessionId: card.sessionId,
    runId: card.runId || null,
    anchorMessageId: card.anchorMessageId,
    status: card.cardStatus,
    headline: card.headline,
    responseSegments,
    processItems: card.processItems,
    previewItems: Array.isArray(card.previewItems)
      ? card.previewItems
      : previewLastFive(card.processItems),
    activeInteraction: card.activeInteraction,
    startedAt: card.startedAt,
    updatedAt: card.updatedAt,
    completedAt: card.completedAt,
    source: card.source,
  };
}

function constrainAssistantCardToUserWindow(
  card: AssistantCardViewModel,
  anchorUserTimestampMs: number | null,
  nextUserTimestampMs: number | null,
): AssistantCardViewModel | null {
  if (anchorUserTimestampMs == null && nextUserTimestampMs == null) {
    return card;
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

  const responseSegments = card.responseSegments.filter((segment) => isWithinWindow(segment.timestamp));
  const processItems = card.processItems.filter((item) => isWithinWindow(item.timestamp));
  const activeInteraction = card.activeInteraction && isWithinWindow(card.updatedAt)
    ? card.activeInteraction
    : null;

  if (responseSegments.length === 0 && processItems.length === 0 && !activeInteraction) {
    return null;
  }

  const latestRemainingTimestamp = [
    ...responseSegments.map((segment) => String(segment.timestamp || '')),
    ...processItems.map((item) => String(item.timestamp || '')),
  ]
    .map((value) => ({ raw: value, parsed: Date.parse(value) }))
    .filter((entry) => Number.isFinite(entry.parsed))
    .sort((left, right) => left.parsed - right.parsed)
    .at(-1)?.raw || card.updatedAt || card.completedAt || card.startedAt || null;

  return {
    ...card,
    responseSegments,
    processItems,
    previewItems: previewLastFive(processItems),
    activeInteraction,
    updatedAt: latestRemainingTimestamp,
    completedAt: card.completedAt && isWithinWindow(card.completedAt) ? card.completedAt : null,
  };
}

export function projectConversationRounds({
  sessionId,
  conversationTurns,
  fallbackRunCards = [],
}: ProjectConversationRoundsInput): ConversationRound[] {
  const rounds: ConversationRound[] = [];
  let currentRound: ConversationRound | null = null;

  for (const turn of conversationTurns) {
    if (turn.kind === 'user') {
      const resolvedSessionId = sessionId || turn.sessionId;
      currentRound = {
        id: `${resolvedSessionId}:${turn.id}`,
        sessionId: resolvedSessionId,
        userMessage: {
          id: turn.id,
          sessionId: turn.sessionId,
          content: turn.content,
          images: Array.isArray(turn.images) ? turn.images : [],
          timestamp: turn.timestamp,
        },
        assistantCard: buildPendingAssistantCard(resolvedSessionId, turn.id, turn.timestamp),
      };
      rounds.push(currentRound);
      continue;
    }

    if (!currentRound || currentRound.userMessage.id !== turn.anchorMessageId) {
      continue;
    }

    currentRound.assistantCard = mergeAssistantCards(
      currentRound.assistantCard,
      toAssistantCard(turn),
    );
  }

  if (fallbackRunCards.length === 0) {
    return rounds;
  }

  const roundsByAnchorMessageId = new Map(
    rounds.map((round) => [round.userMessage.id, round] as const),
  );
  const currentUserTimestampByAnchorId = new Map<string, number | null>();
  const nextUserTimestampByAnchorId = new Map<string, number | null>();
  for (let index = 0; index < rounds.length; index += 1) {
    const currentTimestamp = Date.parse(String(rounds[index].userMessage.timestamp || ''));
    const nextRound = rounds[index + 1] || null;
    const nextTimestamp = nextRound
      ? Date.parse(String(nextRound.userMessage.timestamp || ''))
      : null;
    currentUserTimestampByAnchorId.set(
      rounds[index].userMessage.id,
      Number.isFinite(currentTimestamp) ? currentTimestamp : null,
    );
    nextUserTimestampByAnchorId.set(
      rounds[index].userMessage.id,
      Number.isFinite(nextTimestamp) ? nextTimestamp : null,
    );
  }

  for (const fallbackRunCard of fallbackRunCards) {
    const anchorMessageId = String(fallbackRunCard.anchorMessageId || '').trim();
    if (!anchorMessageId) {
      continue;
    }

    const round = roundsByAnchorMessageId.get(anchorMessageId);
    if (!round) {
      continue;
    }

    const constrainedCard = constrainAssistantCardToUserWindow(
      toAssistantCardFromRunCard(fallbackRunCard),
      currentUserTimestampByAnchorId.get(anchorMessageId) ?? null,
      nextUserTimestampByAnchorId.get(anchorMessageId) ?? null,
    );
    if (!constrainedCard) {
      continue;
    }

    round.assistantCard = mergeAssistantCards(
      round.assistantCard,
      constrainedCard,
    );
  }

  return rounds;
}
