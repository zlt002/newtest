export type RunCardStatus =
  | 'queued'
  | 'starting'
  | 'running'
  | 'waiting_for_input'
  | 'completed'
  | 'failed'
  | 'aborted';

export type RunCardProcessItemKind =
  | 'thinking'
  | 'tool_use'
  | 'tool_result'
  | 'subagent_progress'
  | 'interactive_prompt'
  | 'permission_request'
  | 'session_status'
  | 'compact_boundary'
  | 'debug_ref'
  | 'notice';

export type RunCardProcessItem = {
  id: string;
  timestamp: string;
  kind: RunCardProcessItemKind;
  title: string;
  body: string;
  tone?: 'neutral' | 'warning' | 'danger' | 'success';
  payload?: unknown;
};

export type RunCardInteraction = {
  requestId: string;
  kind: 'interactive_prompt' | 'permission_request';
  toolName?: string | null;
  message?: string | null;
  input?: unknown;
  context?: unknown;
  payload?: unknown;
};

export type RunCardResponseMessage = {
  id: string;
  timestamp: string;
  kind: 'phase' | 'final';
  body: string;
};

export type RunCardSource =
  | 'official-history'
  | 'sdk-live'
  | 'mixed'
  | 'fallback';

export type RunCard = {
  sessionId: string;
  anchorMessageId: string;
  cardStatus: RunCardStatus;
  headline: string;
  finalResponse: string;
  responseMessages?: RunCardResponseMessage[];
  processItems: RunCardProcessItem[];
  previewItems?: RunCardProcessItem[];
  activeInteraction: RunCardInteraction | null;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  defaultExpanded: boolean;
  source: RunCardSource;
  runId?: string | null;
};
