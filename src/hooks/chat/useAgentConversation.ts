// V2 会话聚合钩子。
// 它把原始事件流投影成 timeline、active run events 和 execution summary，供 UI 直接消费。
import { useMemo } from 'react';
import { projectRunExecution } from '@components/chat/projection/projectRunExecution';
import { projectInlineRuntimeActivity } from '@components/chat/projection/projectInlineRuntimeActivity';
import type { AgentEventEnvelope } from '@components/chat/types/agentEvents';
import type { PendingDecisionRequest } from '@components/chat/types/types';
import type { ConversationStreamBlock } from '@components/chat/types/conversationStream';

export function useAgentConversation({
  eventVersion = 0,
  sessionId,
  listEventsBySession,
  pendingDecisionRequests = [],
}: {
  eventVersion?: number;
  sessionId: string | null;
  listEventsBySession: (sessionId: string) => AgentEventEnvelope[];
  pendingDecisionRequests?: PendingDecisionRequest[];
}) {
  return useMemo(() => {
    // 先从 event store 里取出当前 session 的全部事件。
    const events = sessionId ? listEventsBySession(sessionId) : [];
    // V1 对齐后，实时主展示走 official history + raw SDK feed，不再依赖旧 stream 投影。
    const stream: ConversationStreamBlock[] = [];
    // 主路径直接从事件流锁定最新 run，避免再依赖旧 timeline 投影。
    const activeRunId = [...events]
      .sort((a, b) => a.sequence - b.sequence)
      .reduce<string | null>((latestRunId, event) => event.runId || latestRunId, null);
    // 活跃 run 的事件只保留当前 run 的那一组。
    const activeRunEvents = activeRunId
      ? events.filter((event) => event.runId === activeRunId)
      : [];
    // 执行面板只能依赖同一批 V2 事件做状态投影，不读取 legacy transcript 状态。
    const execution = activeRunEvents.length > 0 ? projectRunExecution(activeRunEvents) : null;
    const activeRunActivity = activeRunEvents.length > 0 ? projectInlineRuntimeActivity(activeRunEvents) : [];
    const hasBlockingDecision = pendingDecisionRequests.length > 0;

    return {
      stream,
      activeRunEvents,
      activeRunActivity,
      execution,
      hasBlockingDecision,
    };
  }, [eventVersion, sessionId, listEventsBySession, pendingDecisionRequests]);
}
