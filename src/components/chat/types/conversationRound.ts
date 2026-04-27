import type { ChatImage } from '../../chat/types/types.ts';
import type { RunCardInteraction, RunCardProcessItem } from './runCard.ts';

export type AssistantResponseSegment = {
  id: string;
  kind: 'phase' | 'final';
  body: string;
  timestamp: string | null;
};

export type AssistantCardViewModel = {
  id: string;
  sessionId: string;
  runId: string | null;
  anchorMessageId: string;
  status:
    | 'queued'
    | 'starting'
    | 'running'
    | 'waiting_for_input'
    | 'completed'
    | 'failed'
    | 'aborted';
  headline: string;
  responseSegments: AssistantResponseSegment[];
  processItems: RunCardProcessItem[];
  previewItems: RunCardProcessItem[];
  activeInteraction: RunCardInteraction | null;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  source: 'official-history' | 'sdk-live' | 'mixed' | 'fallback';
};

export type ConversationRound = {
  id: string;
  sessionId: string;
  userMessage: {
    id: string;
    sessionId: string;
    content: string;
    images: ChatImage[];
    timestamp: string;
  };
  assistantCard: AssistantCardViewModel;
};
