// 根据事件流更新 run 状态。
// 这里是前端把“事件事实”压成“当前视图快照”的地方。
import type { AgentEventEnvelope } from '../types/agentEvents.ts';
import type { RunState, RunStatus } from '../types/runState.ts';

function reduceRunStatus(current: RunStatus, event: AgentEventEnvelope): RunStatus {
  switch (event.type) {
    case 'run.started':
      return 'starting';
    case 'assistant.message.started':
    case 'assistant.message.delta':
    case 'run.body.segment_appended':
      return 'streaming';
    case 'assistant.message.completed':
      return 'completing';
    case 'tool.call.started':
      return 'waiting_for_tool';
    case 'tool.call.completed':
      return 'streaming';
    case 'run.completed':
      return 'completed';
    case 'run.failed':
      return 'failed';
    case 'run.aborted':
      return 'aborted';
    default:
      return current;
  }
}

// 把单条事件合并进某个 run 的状态快照。
function reduceRunState(existing: RunState | undefined, event: AgentEventEnvelope): RunState {
  const current = existing ?? {
    runId: event.runId,
    status: 'queued',
    userInput: String(event.payload.userInput || ''),
    assistantText: '',
    error: null,
  };

  const next: RunState = {
    ...current,
    status: reduceRunStatus(current.status, event),
  };

  if (event.type === 'run.created' && typeof event.payload.userInput === 'string') {
    next.userInput = event.payload.userInput;
  }

  if (
    (event.type === 'assistant.message.delta' || event.type === 'assistant.message.completed')
    && typeof event.payload.text === 'string'
  ) {
    if (event.type === 'assistant.message.delta') {
      next.assistantText += event.payload.text;
    } else {
      next.assistantText = event.payload.text || next.assistantText;
    }
  }

  if (event.type === 'run.body.segment_appended') {
    const segment = event.payload.segment as { text?: string } | null | undefined;
    if (typeof segment?.text === 'string') {
      next.assistantText += segment.text;
    }
  }

  if (event.type === 'run.completed' && typeof event.payload.result === 'string' && !next.assistantText) {
    next.assistantText = event.payload.result;
  }

  if (event.type === 'run.failed') {
    next.error = typeof event.payload.error === 'string' ? event.payload.error : 'Run failed';
  }

  return next;
}

export function createConversationStore() {
  const byRunId = new Map<string, AgentEventEnvelope[]>();
  const runStateById = new Map<string, RunState>();

  return {
    // 先缓存事件，再同步更新 run 快照。
    appendEvents(events: AgentEventEnvelope[]) {
      for (const event of events) {
        const existing = byRunId.get(event.runId) || [];
        const deduped = existing.filter((entry) => entry.eventId !== event.eventId);
        deduped.push(event);
        deduped.sort((a, b) => a.sequence - b.sequence);
        byRunId.set(event.runId, deduped);
        runStateById.set(event.runId, reduceRunState(runStateById.get(event.runId), event));
      }
    },
    // 读取某个 run 的当前快照。
    getRunState(runId: string) {
      return runStateById.get(runId) || null;
    },
    // 读取某个 run 的原始事件序列。
    listRunEvents(runId: string) {
      return byRunId.get(runId) || [];
    },
  };
}
