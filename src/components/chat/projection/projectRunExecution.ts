// 把一串 run 事件投影成“执行面板”视图。
// 这里关注的是执行过程、状态、文本片段和错误，而不是最终会话展示。
import type { AgentEventEnvelope, ProjectedRunExecution } from '../types/agentEvents.ts';
import { resolveRunFailureMessage } from './runFailureMessage.js';

function resolveFailureSubtype(payload: Record<string, unknown>) {
  const subtype = typeof payload.subtype === 'string' ? payload.subtype.trim() : '';
  if (subtype) {
    return subtype;
  }

  const error = typeof payload.error === 'string' ? payload.error.trim() : '';
  if (error === 'error_during_execution') {
    return 'error_during_execution';
  }

  return null;
}

export function projectRunExecution(events: AgentEventEnvelope[]): ProjectedRunExecution {
  const orderedEvents = [...events].sort((a, b) => a.sequence - b.sequence);
  let status = 'queued';
  let assistantText = '';
  let error = null;
  let failureSubtype = null;
  let terminalReached = false;
  let persistenceWarning = null;

  for (const event of orderedEvents) {
    if (terminalReached && event.type !== 'run.status_changed') {
      continue;
    }
    if (event.type === 'run.completed') {
      status = 'completed';
      if (!assistantText && typeof event.payload.result === 'string') {
        assistantText = event.payload.result;
      }
      terminalReached = true;
      continue;
    }
    if (event.type === 'run.failed') {
      status = 'failed';
      error = resolveRunFailureMessage(event.payload);
      failureSubtype = resolveFailureSubtype(event.payload);
      terminalReached = true;
      continue;
    }
    if (event.type === 'run.aborted') {
      status = 'aborted';
      terminalReached = true;
      continue;
    }
    if (event.type === 'assistant.message.completed') {
      status = 'completing';
      if (typeof event.payload.text === 'string') {
        assistantText = event.payload.text;
      }
      continue;
    }
    if (event.type === 'run.body.segment_appended') {
      status = 'streaming';
      const segment = event.payload.segment as { text?: string } | null | undefined;
      if (typeof segment?.text === 'string') {
        assistantText += segment.text;
      }
      continue;
    }
    if (event.type === 'tool.call.started') {
      status = 'waiting_for_tool';
      continue;
    }
    if (event.type === 'tool.call.failed') {
      status = 'failed';
      error = resolveRunFailureMessage(event.payload);
      failureSubtype = typeof event.payload.subtype === 'string' ? event.payload.subtype : 'tool.call.failed';
      continue;
    }
    if (event.type === 'tool.call.completed') {
      status = 'streaming';
      error = null;
      failureSubtype = null;
      continue;
    }
    if (event.type === 'assistant.message.started') {
      status = 'streaming';
      error = null;
      failureSubtype = null;
      continue;
    }
    if (event.type === 'assistant.message.delta') {
      status = 'streaming';
      error = null;
      failureSubtype = null;
      if (typeof event.payload.text === 'string') {
        assistantText += event.payload.text;
      }
      continue;
    }
    if (event.type === 'run.status_changed') {
      const nextStatus = typeof event.payload.status === 'string' ? event.payload.status.trim() : '';
      if (nextStatus === 'persistence_degraded') {
        persistenceWarning = typeof event.payload.detail === 'string'
          ? event.payload.detail
          : 'Persistence degraded';
      }
      continue;
    }
    if (event.type === 'run.started') {
      status = 'starting';
      error = null;
      failureSubtype = null;
    }
  }

  if (persistenceWarning) {
    error = error
      ? `${error} · Warning: ${persistenceWarning}`
      : persistenceWarning;
  }

  return {
    status,
    assistantText,
    error,
    failureSubtype,
    canStartNewSession: failureSubtype === 'error_during_execution',
    presentationMode: terminalReached ? 'history' : 'active',
    events: orderedEvents,
  };
}
