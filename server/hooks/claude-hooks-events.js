const HOOK_EVENT_TYPES = new Set([
  'sdk.hook.started',
  'sdk.hook.progress',
  'sdk.hook.response',
]);

export function buildHookExecutionList(events = []) {
  const grouped = splitHookExecutions(events);

  return grouped.map((group) => buildExecutionSummary(group));
}

export function buildHookExecutionDetail(events = [], hookId, filters = {}) {
  const normalizedHookId = normalizeHookId(hookId);
  if (!normalizedHookId) {
    return null;
  }

  const grouped = splitHookExecutions(events);
  const group = selectExecutionGroup(grouped, normalizedHookId, filters);
  if (!group) {
    return null;
  }

  const summary = buildExecutionSummary(group);
  const startedEvent = findFirstByType(group.events, 'sdk.hook.started');
  const progressEvents = group.events.filter((event) => event.type === 'sdk.hook.progress');
  const responseEvent = findLastByType(group.events, 'sdk.hook.response');

  return {
    ...summary,
    stdout: collectText(group.events, 'stdout'),
    stderr: collectText(group.events, 'stderr'),
    output: collectText(group.events, 'output'),
    exitCode: responseEvent?.payload?.exitCode ?? null,
    started: startedEvent,
    progress: progressEvents,
    response: responseEvent ?? null,
    raw: {
      started: startedEvent,
      progress: progressEvents,
      response: responseEvent ?? null,
    },
  };
}

function splitHookExecutions(events) {
  const executions = [];
  const openExecutions = new Map();

  for (const event of sortHookLifecycleEvents(events)) {
    if (!isHookLifecycleEvent(event)) {
      continue;
    }

    const hookId = normalizeHookId(event?.payload?.hookId);
    if (!hookId) {
      continue;
    }

    const existing = openExecutions.get(hookId);

    if (event.type === 'sdk.hook.started') {
      if (existing) {
        executions.push(existing);
      }

      openExecutions.set(hookId, createExecutionGroup(hookId, event));
      continue;
    }

    const target = existing ?? createExecutionGroup(hookId);
    target.events.push(event);

    if (!existing) {
      openExecutions.set(hookId, target);
    }

    if (event.type === 'sdk.hook.response') {
      executions.push(target);
      openExecutions.delete(hookId);
    }
  }

  for (const execution of openExecutions.values()) {
    executions.push(execution);
  }

  return executions;
}

function buildExecutionSummary(group) {
  const startedEvent = findFirstByType(group.events, 'sdk.hook.started');
  const responseEvent = findLastByType(group.events, 'sdk.hook.response');
  const latestEvent = group.events[group.events.length - 1] ?? null;
  const basePayload = latestDefinedPayload(group.events);

  return {
    hookId: group.hookId,
    hookName: firstNonEmpty([
      startedEvent?.payload?.hookName,
      basePayload?.hookName,
    ]),
    hookEvent: firstNonEmpty([
      startedEvent?.payload?.hookEvent,
      basePayload?.hookEvent,
    ]),
    runId: firstNonEmpty([
      startedEvent?.runId,
      latestEvent?.runId,
    ]),
    sessionId: firstNonEmpty([
      startedEvent?.sessionId,
      latestEvent?.sessionId,
    ]),
    status: inferExecutionStatus(group.events),
    outcome: responseEvent?.payload?.outcome ?? null,
    startedAt: startedEvent?.timestamp ?? group.events[0]?.timestamp ?? null,
    updatedAt: latestEvent?.timestamp ?? null,
  };
}

function selectExecutionGroup(groups, hookId, filters) {
  const candidates = groups.filter((candidate) => candidate.hookId === hookId);
  if (candidates.length === 0) {
    return null;
  }

  const normalizedFilters = normalizeExecutionFilters(filters);
  const hasFilters = Object.values(normalizedFilters).some(Boolean);
  if (!hasFilters) {
    return candidates.at(-1) ?? null;
  }

  let bestCandidate = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    const summary = buildExecutionSummary(candidate);
    const score = scoreExecutionMatch(summary, normalizedFilters);
    if (score < 0) {
      continue;
    }

    if (score > bestScore) {
      bestCandidate = candidate;
      bestScore = score;
      continue;
    }

    if (score === bestScore && compareExecutionGroups(candidate, bestCandidate) > 0) {
      bestCandidate = candidate;
    }
  }

  return bestScore >= 0 ? bestCandidate : null;
}

function inferExecutionStatus(events) {
  if (findLastByType(events, 'sdk.hook.response')) {
    return 'completed';
  }

  if (findLastByType(events, 'sdk.hook.progress')) {
    return 'in_progress';
  }

  return 'started';
}

function collectText(events, fieldName) {
  return events
    .map((event) => (typeof event?.payload?.[fieldName] === 'string' ? event.payload[fieldName] : ''))
    .filter(Boolean)
    .join('');
}

function latestDefinedPayload(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const payload = events[index]?.payload;
    if (payload && typeof payload === 'object') {
      return payload;
    }
  }

  return null;
}

function sortHookLifecycleEvents(events) {
  return [...(Array.isArray(events) ? events : [])].sort(compareEvents);
}

function compareEvents(left, right) {
  const leftSequence = Number.isFinite(left?.sequence) ? left.sequence : Number.MAX_SAFE_INTEGER;
  const rightSequence = Number.isFinite(right?.sequence) ? right.sequence : Number.MAX_SAFE_INTEGER;
  if (leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }

  const leftTimestamp = Date.parse(left?.timestamp ?? '') || 0;
  const rightTimestamp = Date.parse(right?.timestamp ?? '') || 0;
  if (leftTimestamp !== rightTimestamp) {
    return leftTimestamp - rightTimestamp;
  }

  return String(left?.eventId ?? '').localeCompare(String(right?.eventId ?? ''));
}

function compareExecutionGroups(left, right) {
  if (!right) {
    return 1;
  }

  return compareEvents(
    left?.events?.[left.events.length - 1] ?? left?.events?.[0],
    right?.events?.[right.events.length - 1] ?? right?.events?.[0],
  );
}

function findFirstByType(events, type) {
  return events.find((event) => event?.type === type) ?? null;
}

function findLastByType(events, type) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.type === type) {
      return events[index];
    }
  }

  return null;
}

function createExecutionGroup(hookId, event) {
  return {
    hookId,
    events: event ? [event] : [],
  };
}

function isHookLifecycleEvent(event) {
  return HOOK_EVENT_TYPES.has(event?.type);
}

function normalizeHookId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function firstNonEmpty(values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return null;
}

function normalizeExecutionFilters(filters = {}) {
  return {
    runId: normalizeOptionalString(filters.runId),
    sessionId: normalizeOptionalString(filters.sessionId),
    hookEvent: normalizeOptionalString(filters.hookEvent),
    hookName: normalizeOptionalString(filters.hookName),
  };
}

function normalizeOptionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function scoreExecutionMatch(summary, filters) {
  let score = 0;

  if (filters.runId) {
    if (summary.runId !== filters.runId) {
      return -1;
    }
    score += 8;
  }

  if (filters.sessionId) {
    if (summary.sessionId !== filters.sessionId) {
      return -1;
    }
    score += 4;
  }

  if (filters.hookEvent) {
    if (summary.hookEvent !== filters.hookEvent) {
      return -1;
    }
    score += 2;
  }

  if (filters.hookName) {
    if (summary.hookName !== filters.hookName) {
      return -1;
    }
    score += 1;
  }

  return score;
}
