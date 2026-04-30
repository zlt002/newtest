import type { Project, ProjectSession, SessionProvider } from '../../../types/app';
import type { FileChangeEvent } from '../../../hooks/chat/chatFileChangeEvents.ts';
import type { DraftPreviewEvent } from '../../../hooks/chat/chatDraftPreviewEvents.ts';
import type { PermissionMode as AgentTransportPermissionMode } from './transport.ts';
import type { RightPaneTarget } from '../../right-pane/types.ts';

export type Provider = SessionProvider;
export type PermissionMode = AgentTransportPermissionMode | 'dontAsk';

export interface ChatImage {
  data: string | null;
  name: string;
  mimeType?: string;
  isPlaceholder?: boolean;
  placeholderLabel?: string;
}

export interface ToolResult {
  content?: unknown;
  isError?: boolean;
  timestamp?: string | number | Date;
  toolUseResult?: unknown;
  [key: string]: unknown;
}

export interface SubagentChildTool {
  toolId: string;
  toolName: string;
  toolInput: unknown;
  toolResult?: ToolResult | null;
  timestamp: Date;
}

export interface TaskUsageStats {
  totalTokens?: number;
  toolUses?: number;
  durationMs?: number;
}

export interface SubagentWarningState {
  kind: string;
  message: string;
  timestamp?: string | number | Date;
  status?: string;
}

export interface ProcessTimelineEvent {
  kind: string;
  label: string;
  timestamp?: string | number | Date;
  status?: string;
}

export interface OrchestrationState {
  summary: string;
  taskTitles: string[];
}

export interface ResultUsageSummary {
  totalCostUsd?: number | null;
  usage?: Record<string, unknown> | null;
  modelUsage?: Record<string, unknown> | null;
}

export type ChatMessageSourceKind =
  | 'text'
  | 'tool_use'
  | 'tool_use_partial'
  | 'thinking'
  | 'interactive_prompt'
  | 'task_notification'
  | 'result'
  | 'compact_boundary'
  | 'task_started'
  | 'task_progress'
  | 'files_persisted'
  | 'tool_progress'
  | 'tool_use_summary'
  | 'prompt_suggestion'
  | 'permission_request'
  | 'permission_cancelled'
  | 'status'
  | 'complete'
  | 'auth_status'
  | 'rate_limit'
  | 'hook_response'
  | 'hook_started'
  | 'hook_progress'
  | 'stream_delta'
  | 'session_status'
  | 'debug_ref'
  | 'tool_result'
  | 'error';

export interface SubagentProgressState {
  taskId?: string;
  status?: string;
  currentToolName?: string;
  lastToolName?: string;
  elapsedTimeSeconds?: number | null;
  usage?: TaskUsageStats | null;
  outputFile?: string;
  timeline?: ProcessTimelineEvent[];
  warnings?: SubagentWarningState[];
  resultPreview?: string | null;
}

export interface ChatMessage {
  type: string;
  content?: string;
  timestamp: string | number | Date;
  structuredOutput?: unknown;
  images?: ChatImage[];
  reasoning?: string;
  isThinking?: boolean;
  isStreaming?: boolean;
  isInteractivePrompt?: boolean;
  isToolUse?: boolean;
  toolName?: string;
  toolInput?: unknown;
  toolResult?: ToolResult | null;
  toolId?: string;
  toolCallId?: string;
  isTaskNotification?: boolean;
  taskStatus?: string;
  isOrchestrationCard?: boolean;
  orchestrationState?: OrchestrationState | null;
  isSubagentContainer?: boolean;
  subagentState?: {
    childTools: SubagentChildTool[];
    currentToolIndex: number;
    isComplete: boolean;
    progress?: SubagentProgressState | null;
  };
  usageSummary?: ResultUsageSummary | null;
  normalizedKind?: ChatMessageSourceKind;
  [key: string]: unknown;
}

export interface ClaudeSettings {
  allowedTools: string[];
  disallowedTools: string[];
  skipPermissions: boolean;
  projectSortOrder: string;
  lastUpdated?: string;
  [key: string]: unknown;
}

export interface ClaudePermissionSuggestion {
  toolName: string;
  entry: string;
  isAllowed: boolean;
}

export interface PermissionGrantResult {
  success: boolean;
  alreadyAllowed?: boolean;
  updatedSettings?: ClaudeSettings;
}

export interface PendingPermissionRequest {
  requestId: string;
  toolName: string;
  input?: unknown;
  context?: unknown;
  sessionId?: string | null;
  receivedAt?: Date;
  kind?: 'permission_request' | 'interactive_prompt';
  questions?: Question[];
}

export type PendingDecisionRequest = PendingPermissionRequest;

export interface PendingQuestionRequest extends PendingPermissionRequest {
  kind: 'interactive_prompt';
  questions?: Question[];
}

export interface PendingToolApprovalRequest extends PendingPermissionRequest {
  kind: 'permission_request';
}

export function getPendingRequestQuestions(request: PendingPermissionRequest): Question[] {
  if (Array.isArray(request.questions)) {
    return request.questions;
  }

  const input = request.input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return [];
  }

  const questions = (input as { questions?: unknown }).questions;
  return Array.isArray(questions) ? questions as Question[] : [];
}

export function isPendingQuestionRequest(request: PendingPermissionRequest): request is PendingQuestionRequest {
  if (request.kind === 'interactive_prompt') {
    return true;
  }

  return getPendingRequestQuestions(request).length > 0;
}

export function isPendingToolApprovalRequest(
  request: PendingPermissionRequest,
): request is PendingToolApprovalRequest {
  return !isPendingQuestionRequest(request);
}

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface Question {
  question: string;
  header?: string;
  options: QuestionOption[];
  multiSelect?: boolean;
}

export interface ChatInterfaceProps {
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  ws: WebSocket | null;
  sendMessage: (message: unknown) => void;
  latestMessage: any;
  onFileOpen?: (filePath: string, diffInfo?: any) => void;
  onMarkdownDraftOpen?: (payload: {
    filePath: string;
    fileName?: string;
    content?: string;
    statusText?: string;
    sourceSessionId?: string | null;
  }) => void;
  onMarkdownDraftUpdate?: (payload: {
    filePath: string;
    content?: string;
    statusText?: string;
    sourceSessionId?: string | null;
  }) => void;
  onOpenUrl?: (url: string) => void;
  onInputFocusChange?: (focused: boolean) => void;
  onSessionActive?: (sessionId?: string | null) => void;
  onSessionInactive?: (sessionId?: string | null) => void;
  onSessionProcessing?: (sessionId?: string | null) => void;
  onSessionNotProcessing?: (sessionId?: string | null) => void;
  processingSessions?: Set<string>;
  onReplaceTemporarySession?: (sessionId?: string | null) => void;
  onNavigateToSession?: (targetSessionId: string) => void;
  onStartNewSession?: (project: Project) => void;
  onShowSettings?: () => void;
  autoExpandTools?: boolean;
  showRawParameters?: boolean;
  showThinking?: boolean;
  autoScrollToBottom?: boolean;
  sendByCtrlEnter?: boolean;
  externalMessageUpdate?: number;
  onTaskClick?: (...args: unknown[]) => void;
  onComposerAppendReady?: ((append: ((text: string) => void) | null) => void) | null;
  onFileChangeEvent?: (event: FileChangeEvent) => void;
  onDraftPreviewEvent?: (event: DraftPreviewEvent) => void;
  activeContextTarget?: RightPaneTarget | null;
}
