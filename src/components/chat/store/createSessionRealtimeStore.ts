type SessionRealtimeRecord = {
  id: string;
  sessionId: string | null;
  timestamp: string;
};

export function createSessionRealtimeStore<TEvent extends SessionRealtimeRecord>() {
  const events: TEvent[] = [];
  const listeners = new Set<() => void>();

  const sortEvents = () => {
    events.sort((left, right) => {
      const leftTime = Date.parse(left.timestamp);
      const rightTime = Date.parse(right.timestamp);

      if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
        return leftTime - rightTime;
      }

      return left.id.localeCompare(right.id);
    });
  };

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    append(event: TEvent) {
      const existingIndex = events.findIndex((entry) => entry.id === event.id);
      if (existingIndex >= 0) {
        events[existingIndex] = event;
      } else {
        events.push(event);
      }
      sortEvents();
      notify();
    },
    listBySession(sessionId: string) {
      return events.filter((event) => event.sessionId === sessionId);
    },
    clearSession(sessionId: string) {
      if (!sessionId) {
        return 0;
      }

      const nextEvents = events.filter((event) => event.sessionId !== sessionId);
      const removedCount = events.length - nextEvents.length;
      if (removedCount === 0) {
        return 0;
      }

      events.splice(0, events.length, ...nextEvents);
      notify();
      return removedCount;
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

      if (changed) {
        sortEvents();
        notify();
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
