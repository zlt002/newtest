import type {
  RunCard,
  RunCardInteraction,
  RunCardProcessItem,
  RunCardResponseMessage,
  RunCardStatus,
} from './runCard.ts';
import type { ChatImage } from '../../chat/types/types.ts';

export type ConversationTurn = UserTurnViewModel | AssistantTurnViewModel;

export type UserTurnSource = 'official-history' | 'transient';

export type UserTurnViewModel = {
  kind: 'user';
  id: string;
  sessionId: string;
  content: string;
  images: ChatImage[];
  timestamp: string;
  source: UserTurnSource;
};

export type AssistantTurnSource = 'official-history' | 'sdk-live' | 'mixed' | 'fallback';

export type RuntimeActivityItem = RunCardProcessItem;

export type AssistantBodySegment = RunCardResponseMessage;

export type AssistantTurnViewModel = {
  kind: 'assistant';
  id: string;
  sessionId: string;
  runId: string | null;
  anchorMessageId: string;
  status: RunCardStatus;
  headline: string;
  activityItems: RuntimeActivityItem[];
  bodySegments: AssistantBodySegment[];
  activeInteraction: RunCardInteraction | null;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  source: AssistantTurnSource;
};

export function assistantTurnToRunCard(turn: AssistantTurnViewModel): RunCard {
  const finalSegment = [...turn.bodySegments]
    .reverse()
    .find((segment) => segment.kind === 'final' && String(segment.body || '').trim());

  return {
    sessionId: turn.sessionId,
    anchorMessageId: turn.anchorMessageId,
    cardStatus: turn.status,
    headline: turn.headline,
    finalResponse: finalSegment?.body || '',
    responseMessages: turn.bodySegments,
    processItems: turn.activityItems,
    activeInteraction: turn.activeInteraction,
    startedAt: turn.startedAt,
    updatedAt: turn.updatedAt,
    completedAt: turn.completedAt,
    defaultExpanded: turn.source === 'sdk-live',
    source: turn.source,
  };
}
