export type ClientLatencyMark =
  | 'send_clicked'
  | 'ws_message_first_received'
  | 'first_thinking_received'
  | 'first_stream_delta_received'
  | 'first_stream_delta_rendered'
  | 'complete_received';

type ClientTraceRecord = {
  sessionId: string;
  marks: Partial<Record<ClientLatencyMark, number>>;
  metadata: Record<string, unknown>;
};

function mergeMissingClientTraceData(
  current: ClientTraceRecord,
  next?: ClientTraceRecord,
): ClientTraceRecord {
  if (!next) {
    return current;
  }

  const marks: Partial<Record<ClientLatencyMark, number>> = { ...current.marks };
  for (const [mark, timestamp] of Object.entries(next.marks) as [ClientLatencyMark, number][]) {
    if (marks[mark] === undefined) {
      marks[mark] = timestamp;
    }
  }

  const metadata: Record<string, unknown> = { ...current.metadata };
  for (const [key, value] of Object.entries(next.metadata)) {
    if (metadata[key] === undefined) {
      metadata[key] = value;
    }
  }

  return {
    sessionId: current.sessionId,
    marks,
    metadata,
  };
}

export function createClientLatencyTraceStore() {
  return new Map<string, ClientTraceRecord>();
}

export function markClientLatencyEvent(
  store: Map<string, ClientTraceRecord>,
  sessionId: string,
  mark: ClientLatencyMark,
  timestamp = Date.now(),
  metadata: Record<string, unknown> = {},
) {
  const current = store.get(sessionId) || { sessionId, marks: {}, metadata: {} };
  if (current.marks[mark] === undefined) {
    current.marks[mark] = timestamp;
  }
  current.metadata = { ...current.metadata, ...metadata };
  store.set(sessionId, current);
  return current;
}

export function rebindClientLatencyTrace(
  store: Map<string, ClientTraceRecord>,
  previousSessionId: string,
  nextSessionId: string,
) {
  const current = store.get(previousSessionId);
  if (!current || previousSessionId === nextSessionId) {
    return;
  }
  const next = store.get(nextSessionId);
  store.delete(previousSessionId);
  const rebased = mergeMissingClientTraceData({ ...current, sessionId: nextSessionId }, next);
  store.set(nextSessionId, rebased);
}

export function summarizeClientLatencyTrace(
  store: Map<string, ClientTraceRecord>,
  sessionId: string,
) {
  const trace = store.get(sessionId);
  const marks = trace?.marks || {};
  const durations: Record<string, number> = {};
  const missing: string[] = [];

  if (marks.send_clicked !== undefined && marks.first_thinking_received !== undefined) {
    durations.sendToThinking = marks.first_thinking_received - marks.send_clicked;
  } else {
    missing.push('sendToThinking');
  }

  if (marks.first_thinking_received !== undefined && marks.first_stream_delta_received !== undefined) {
    durations.thinkingToFirstStreamDelta =
      marks.first_stream_delta_received - marks.first_thinking_received;
  } else {
    missing.push('thinkingToFirstStreamDelta');
  }

  if (marks.first_stream_delta_received !== undefined && marks.first_stream_delta_rendered !== undefined) {
    durations.streamDeltaToRendered =
      marks.first_stream_delta_rendered - marks.first_stream_delta_received;
  } else {
    missing.push('streamDeltaToRendered');
  }

  return { sessionId, durations, missing, metadata: trace?.metadata ? { ...trace.metadata } : {} };
}
