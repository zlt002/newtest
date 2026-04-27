// V2 前端事件类型与投影结果类型定义。
// 这里的类型只服务于前端事件 store、投影层和 UI 组件。
export type AgentEventType =
  // Product-only orchestration and lifecycle events
  | 'run.created'
  | 'run.started'
  | 'run.activity.appended'
  | 'run.body.segment_appended'
  // Product-only fallback event when no stable SDK mapping exists
  | 'run.status_changed'
  // SDK-mapped system and protocol events
  | 'sdk.system.init'
  | 'sdk.system.status'
  | 'sdk.stream_event'
  | 'sdk.compact_boundary'
  | 'sdk.task.started'
  | 'sdk.task.progress'
  | 'sdk.task.notification'
  | 'sdk.hook.started'
  | 'sdk.hook.progress'
  | 'sdk.hook.response'
  | 'sdk.tool.progress'
  | 'sdk.tool.summary'
  | 'sdk.files.persisted'
  | 'sdk.auth.status'
  | 'sdk.rate_limit'
  | 'sdk.prompt_suggestion'
  | 'sdk.event.unsupported'
  // Transitional decision events to support V2-first stream rendering
  | 'interactive_prompt'
  | 'permission_request'
  | 'permission_cancelled'
  // SDK-mapped assistant events
  | 'assistant.message.started'
  | 'assistant.message.delta'
  | 'assistant.message.completed'
  // SDK-mapped tool events
  | 'tool.call.started'
  | 'tool.call.delta'
  | 'tool.call.completed'
  | 'tool.call.failed'
  // Transitional compatibility events to be thinned later if unused
  | 'artifact.created'
  | 'usage.updated'
  // SDK-mapped terminal events
  | 'run.completed'
  | 'run.failed'
  | 'run.aborted';

export type AgentEventEnvelope = {
  eventId: string;
  runId: string;
  sessionId: string | null;
  sequence: number;
  type: AgentEventType;
  timestamp: string;
  payload: Record<string, unknown> & {
    traceId?: string | null;
  };
};

export type ProjectedRunExecution = {
  status: string;
  assistantText: string;
  error: string | null;
  failureSubtype: string | null;
  canStartNewSession: boolean;
  presentationMode: 'active' | 'history';
  events: AgentEventEnvelope[];
};
