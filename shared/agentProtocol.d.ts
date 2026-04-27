export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

export type UserContentBlock =
  | {
    type: 'text';
    text: string;
  }
  | {
    type: 'image';
    source: {
      type: 'base64';
      media_type: string;
      data: string;
    };
  };

export type UserContent = {
  role: 'user';
  content: string | UserContentBlock[];
};

export type OutputFormatConfig = {
  type: 'json_schema';
  schema: Record<string, unknown>;
};

export type QuestionOptionSpec = {
  label: string;
  description?: string;
  preview?: string;
};

export type QuestionSpec = {
  question: string;
  header?: string;
  options: QuestionOptionSpec[];
  multiSelect?: boolean;
};

export type ChatRunStartEvent = {
  type: 'chat_run_start';
  sessionId: string | null;
  projectPath: string;
  model?: string;
  permissionMode?: PermissionMode;
  message: UserContent;
  outputFormat?: OutputFormatConfig;
  contextFilePaths?: string[];
};

export type ChatUserMessageEvent = {
  type: 'chat_user_message';
  sessionId: string;
  message: UserContent;
  contextFilePaths?: string[];
};

export type ToolApprovalResponseEvent = {
  type: 'tool_approval_response';
  sessionId: string;
  requestId: string;
  decision: 'allow' | 'deny';
  rememberEntry?: string;
  updatedInput?: unknown;
  message?: string;
};

export type QuestionResponseEvent = {
  type: 'question_response';
  sessionId: string;
  requestId: string;
  questions: QuestionSpec[];
  answers: Record<string, string>;
};

export type ChatInterruptEvent = {
  type: 'chat_interrupt';
  sessionId: string;
};

export type ChatReconnectEvent = {
  type: 'chat_reconnect';
  sessionId: string;
};

export type GetPendingDecisionsEvent = {
  type: 'get-pending-decisions';
  sessionId: string;
};

export type ClientToServerEvent =
  | ChatRunStartEvent
  | ChatUserMessageEvent
  | ToolApprovalResponseEvent
  | QuestionResponseEvent
  | ChatInterruptEvent
  | ChatReconnectEvent
  | GetPendingDecisionsEvent;

export type AgentLifecycleEvent = {
  type: 'agent_lifecycle';
  sessionId: string | null;
  timestamp: string;
  phase: 'run_started' | 'session_created' | 'run_completed' | 'run_interrupted' | 'reconnected';
  data?: Record<string, unknown>;
};

export type SdkMessageEnvelope = {
  sdkType: 'system' | 'assistant' | 'user' | 'stream_event' | 'result';
  payload: unknown;
};

export type AgentSdkMessageEvent = {
  type: 'agent_sdk_message';
  sessionId: string | null;
  timestamp: string;
  sdkMessage: SdkMessageEnvelope;
};

export type ToolApprovalRequestEvent = {
  type: 'tool_approval_request';
  sessionId: string | null;
  timestamp: string;
  requestId: string;
  toolName: string;
  input: unknown;
};

export type QuestionRequestEvent = {
  type: 'question_request';
  sessionId: string | null;
  timestamp: string;
  requestId: string;
  questions: QuestionSpec[];
};

export type PendingDecisionsResponseEvent = {
  type: 'pending-decisions-response';
  sessionId: string | null;
  timestamp?: string;
  approvals: ToolApprovalRequestEvent[];
  questions: QuestionRequestEvent[];
};

export type AgentErrorEvent = {
  type: 'agent_error';
  sessionId: string | null;
  timestamp: string;
  error: {
    code?: string;
    message: string;
    details?: string;
  };
};

export type GitBranchCreatedEvent = {
  type: 'git_branch_created';
  sessionId: string | null;
  timestamp: string;
  branch: {
    name: string;
    url?: string;
  };
};

export type GitPrCreatedEvent = {
  type: 'git_pr_created';
  sessionId: string | null;
  timestamp: string;
  pullRequest: {
    number: number;
    url: string;
  };
};

export type ServerToClientEvent =
  | AgentLifecycleEvent
  | AgentSdkMessageEvent
  | ToolApprovalRequestEvent
  | QuestionRequestEvent
  | PendingDecisionsResponseEvent
  | AgentErrorEvent
  | GitBranchCreatedEvent
  | GitPrCreatedEvent;

export declare const CLIENT_EVENT_TYPES: Readonly<{
  CHAT_RUN_START: 'chat_run_start';
  CHAT_USER_MESSAGE: 'chat_user_message';
  TOOL_APPROVAL_RESPONSE: 'tool_approval_response';
  QUESTION_RESPONSE: 'question_response';
  CHAT_INTERRUPT: 'chat_interrupt';
  CHAT_RECONNECT: 'chat_reconnect';
  GET_PENDING_DECISIONS: 'get-pending-decisions';
}>;

export declare const SERVER_EVENT_TYPES: Readonly<{
  AGENT_LIFECYCLE: 'agent_lifecycle';
  AGENT_SDK_MESSAGE: 'agent_sdk_message';
  TOOL_APPROVAL_REQUEST: 'tool_approval_request';
  QUESTION_REQUEST: 'question_request';
  PENDING_DECISIONS_RESPONSE: 'pending-decisions-response';
  AGENT_ERROR: 'agent_error';
  GIT_BRANCH_CREATED: 'git_branch_created';
  GIT_PR_CREATED: 'git_pr_created';
  DONE: 'done';
}>;

export declare const AGENT_LIFECYCLE_PHASES: Readonly<{
  RUN_STARTED: 'run_started';
  SESSION_CREATED: 'session_created';
  RUN_COMPLETED: 'run_completed';
  RUN_INTERRUPTED: 'run_interrupted';
  RECONNECTED: 'reconnected';
}>;

export declare const SDK_MESSAGE_TYPES: readonly [
  'system',
  'assistant',
  'user',
  'stream_event',
  'result',
];

export declare const DEFAULT_AGENT_PROVIDER: 'claude';

export declare const OUTPUT_FORMAT_TYPES: Readonly<{
  JSON_SCHEMA: 'json_schema';
}>;

export declare function isSdkMessageType(value: unknown): value is SdkMessageEnvelope['sdkType'];

export declare function createBaseAgentEvent<TType extends string, TFields extends Record<string, unknown> = Record<string, unknown>>(
  type: TType,
  fields?: TFields,
): {
  type: TType;
  timestamp: string;
  sessionId: string | null;
} & TFields;

export declare function createLifecycleEvent(
  phase: AgentLifecycleEvent['phase'],
  fields?: Record<string, unknown>,
): AgentLifecycleEvent;

export declare function createSdkMessageEnvelope(
  sdkType: SdkMessageEnvelope['sdkType'],
  payload: unknown,
): SdkMessageEnvelope;

export declare function createSdkMessageEvent(
  sdkType: SdkMessageEnvelope['sdkType'],
  payload: unknown,
  fields?: Record<string, unknown>,
): AgentSdkMessageEvent;

export declare function createToolApprovalRequestEvent(
  fields?: Record<string, unknown>,
): ToolApprovalRequestEvent;

export declare function createQuestionRequestEvent(
  fields?: Record<string, unknown>,
): QuestionRequestEvent;

export declare function createAgentErrorEvent(
  error:
    | string
    | {
      code?: string;
      message?: string;
      details?: string;
    },
  fields?: Record<string, unknown>,
): AgentErrorEvent;
