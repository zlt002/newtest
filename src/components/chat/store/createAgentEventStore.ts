// 只存原始事件，不提前保存任何派生 UI 状态。
// timeline、execution panel 和活跃 run 状态都必须从这份事实源投影出来。
import type { AgentEventEnvelope } from '../types/agentEvents.ts';

const isOptimisticRunId = (runId: string | null | undefined) =>
  typeof runId === 'string' && runId.startsWith('optimistic:');

export function createAgentEventStore() {
  /** @type {AgentEventEnvelope[]} */
  const events: AgentEventEnvelope[] = [];
  const listeners = new Set<() => void>();

  const sortEvents = () => {
    events.sort((a, b) => {
      if (a.runId === b.runId) {
        return a.sequence - b.sequence;
      }
      return Date.parse(a.timestamp) - Date.parse(b.timestamp);
    });
  };

  const upsertEvent = (event: AgentEventEnvelope) => {
    const existingIndex = events.findIndex((entry) => entry.eventId === event.eventId);
    if (existingIndex >= 0) {
      events[existingIndex] = event;
    } else {
      events.push(event);
    }
  };

  const findLatestOptimisticRunId = (sessionId: string | null) => {
    if (!sessionId) {
      return null;
    }

    const optimisticEvents = events.filter((event) =>
      event.sessionId === sessionId && isOptimisticRunId(event.runId));

    if (optimisticEvents.length === 0) {
      return null;
    }

    optimisticEvents.sort((left, right) => {
      const timeDelta = Date.parse(left.timestamp) - Date.parse(right.timestamp);
      if (timeDelta !== 0) {
        return timeDelta;
      }
      return left.sequence - right.sequence;
    });

    return optimisticEvents.at(-1)?.runId || null;
  };

  const mergeOptimisticRunInto = (sessionId: string | null, realRunId: string) => {
    if (!sessionId || isOptimisticRunId(realRunId)) {
      return;
    }

    const optimisticRunId = findLatestOptimisticRunId(sessionId);
    if (!optimisticRunId) {
      return;
    }

    for (const event of events) {
      if (event.sessionId === sessionId && event.runId === optimisticRunId) {
        event.runId = realRunId;
      }
    }
  };

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    // 追加单条事件；如果 eventId 重复，则覆盖旧值。
    append(event: AgentEventEnvelope) {
      mergeOptimisticRunInto(event.sessionId, event.runId);
      upsertEvent(event);
      sortEvents();

      notify();
    },
    // 批量追加事件，常用于一次性重放或拉取历史。
    appendMany(input: AgentEventEnvelope[]) {
      for (const event of input) {
        mergeOptimisticRunInto(event.sessionId, event.runId);
        upsertEvent(event);
      }

      sortEvents();

      notify();
    },
    hydrateSession(sessionId: string, input: AgentEventEnvelope[]) {
      if (!sessionId) {
        return;
      }

      const nextHydratedEvents = input.filter((event) => event.sessionId === sessionId);

      for (let index = events.length - 1; index >= 0; index -= 1) {
        if (events[index]?.sessionId === sessionId) {
          events.splice(index, 1);
        }
      }

      for (const event of nextHydratedEvents) {
        mergeOptimisticRunInto(event.sessionId, event.runId);
        upsertEvent(event);
      }

      sortEvents();
      notify();
    },
    appendOptimisticRun({
      traceId,
      sessionId,
      prompt,
      timestamp = new Date().toISOString(),
    }: {
      traceId: string;
      sessionId: string;
      prompt: string;
      timestamp?: string;
    }) {
      const optimisticRunId = `optimistic:${traceId}`;
      const nextEvents: AgentEventEnvelope[] = [
        {
          eventId: `${optimisticRunId}:run.created`,
          runId: optimisticRunId,
          sessionId,
          sequence: -1,
          type: 'run.created',
          timestamp,
          payload: {
            userInput: prompt,
            optimistic: true,
            traceId,
          },
        },
        {
          eventId: `${optimisticRunId}:run.started`,
          runId: optimisticRunId,
          sessionId,
          sequence: 0,
          type: 'run.started',
          timestamp,
          payload: {
            optimistic: true,
            traceId,
          },
        },
      ];

      for (const event of nextEvents) {
        upsertEvent(event);
      }

      sortEvents();
      notify();
    },
    rebindSession(previousSessionId: string, nextSessionId: string) {
      if (!previousSessionId || !nextSessionId || previousSessionId === nextSessionId) {
        return;
      }

      let changed = false;
      for (const event of events) {
        if (event.sessionId === previousSessionId) {
          event.sessionId = nextSessionId;
          changed = true;
        }
      }

      if (!changed) {
        return;
      }

      sortEvents();
      notify();
    },
    // 按 runId 读取某一轮的全部事件。
    listByRun(runId: string) {
      return events.filter((event) => event.runId === runId);
    },
    // 按 sessionId 读取整个会话的事件。
    listBySession(sessionId: string) {
      return events.filter((event) => event.sessionId === sessionId);
    },
    // 订阅事件变化，便于 React 组件做增量刷新。
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
