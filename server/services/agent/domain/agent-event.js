// V2 统一事件模型定义。
// 所有持久化、回放、投影和前端展示都应该围绕这套稳定事件协议展开。
import crypto from 'crypto';

// 统一的 V2 事件类型列表。
// 前后端都只应该依赖这组语义稳定的事件，而不是 Claude SDK 的原始消息结构。
export const AGENT_EVENT_TYPES = [
  'run.created',
  'run.started',
  'run.status_changed',
  'run.activity.appended',
  'run.body.segment_appended',
  'sdk.system.init',
  'sdk.system.status',
  'sdk.stream_event',
  'sdk.compact_boundary',
  'sdk.task.started',
  'sdk.task.progress',
  'sdk.task.notification',
  'sdk.hook.started',
  'sdk.hook.progress',
  'sdk.hook.response',
  'sdk.tool.progress',
  'sdk.tool.summary',
  'sdk.files.persisted',
  'sdk.auth.status',
  'sdk.rate_limit',
  'sdk.prompt_suggestion',
  'sdk.event.unsupported',
  'assistant.message.started',
  'assistant.message.delta',
  'assistant.message.completed',
  'tool.call.started',
  'tool.call.delta',
  'tool.call.completed',
  'tool.call.failed',
  'artifact.created',
  'usage.updated',
  'run.completed',
  'run.failed',
  'run.aborted',
];

// 生成一条标准化的事件包络。
// 这里负责把 run/session/sequence 等元信息固定下来，方便持久化和重放。
export function createAgentEventEnvelope({
  runId,
  sessionId = null,
  sequence,
  type,
  payload = {},
  traceId = null,
}) {
  const nextPayload = { ...payload };
  if (traceId && typeof nextPayload.traceId !== 'string') {
    nextPayload.traceId = traceId;
  }

  return {
    eventId: crypto.randomUUID(),
    runId,
    sessionId,
    sequence,
    type,
    timestamp: new Date().toISOString(),
    payload: nextPayload,
  };
}
