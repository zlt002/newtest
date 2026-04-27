import type { AgentEventEnvelope } from '../types/agentEvents.ts';

export type TaskBlockGroupStep = {
  eventId: string;
  type: AgentEventEnvelope['type'];
  label: string;
};

export type TaskBlockEventGroup = {
  title: string;
  status: 'running' | 'completed' | 'failed';
  summary: string;
  defaultExpanded: boolean;
  steps: TaskBlockGroupStep[];
  events: AgentEventEnvelope[];
};

const TASK_BLOCK_EVENT_TYPES = new Set([
  'sdk.task.started',
  'sdk.task.progress',
  'sdk.task.notification',
  'sdk.tool.progress',
  'sdk.tool.summary',
  'sdk.hook.started',
  'sdk.hook.progress',
  'sdk.hook.response',
  'sdk.files.persisted',
]);

export function isTaskBlockEvent(event: AgentEventEnvelope) {
  return TASK_BLOCK_EVENT_TYPES.has(event.type);
}

function resolveTaskKey(event: AgentEventEnvelope, fallbackKey: string | null) {
  const taskId = typeof event.payload.taskId === 'string' && event.payload.taskId.trim()
    ? event.payload.taskId.trim()
    : null;

  if (taskId) {
    return `${event.runId}:${taskId}`;
  }

  if (event.type === 'sdk.task.started') {
    return `${event.runId}:${event.eventId}`;
  }

  return fallbackKey || `${event.runId}:${event.eventId}`;
}

function resolveStatus(events: AgentEventEnvelope[]): 'running' | 'completed' | 'failed' {
  const notification = [...events].reverse().find((event) => event.type === 'sdk.task.notification');
  const status = typeof notification?.payload?.status === 'string' ? notification.payload.status : '';
  if (status === 'failed' || status === 'error') {
    return 'failed';
  }
  if (status === 'completed' || status === 'success') {
    return 'completed';
  }
  return 'running';
}

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getFileName(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.split('/').pop() || filePath;
}

function getReadableLabel(value: unknown) {
  return getString(value);
}

function resolveEventLabel(event: AgentEventEnvelope) {
  const description = getReadableLabel(event.payload.description);
  if (description) {
    return description;
  }

  const summary = getReadableLabel(event.payload.summary);
  if (summary) {
    return summary;
  }

  const toolName = getReadableLabel(event.payload.toolName);
  if (toolName && toolName !== 'unknown') {
    return toolName;
  }

  const outputFile = getReadableLabel(event.payload.outputFile) || getReadableLabel(event.payload.output_file);
  if (outputFile) {
    return getFileName(outputFile);
  }

  const filePath = getReadableLabel(event.payload.filePath)
    || getReadableLabel(event.payload.file_path)
    || getReadableLabel(event.payload.path);
  if (filePath) {
    return getFileName(filePath);
  }

  const hookName = getReadableLabel(event.payload.hookName) || getReadableLabel(event.payload.hookEventName);
  if (hookName) {
    return hookName;
  }

  return '';
}

function resolveTitle(events: AgentEventEnvelope[]) {
  const titleEvent = events.find((event) =>
    (event.type === 'sdk.task.started' || event.type === 'sdk.task.progress')
    && typeof event.payload.description === 'string'
    && event.payload.description.trim(),
  );

  if (titleEvent && typeof titleEvent.payload.description === 'string') {
    return titleEvent.payload.description;
  }

  const notification = [...events].reverse().find((event) => event.type === 'sdk.task.notification');
  const notificationSummary = getReadableLabel(notification?.payload?.summary);
  if (notificationSummary) {
    return notificationSummary;
  }

  const informativeEvent = events.find((event) => resolveEventLabel(event));
  if (informativeEvent) {
    return resolveEventLabel(informativeEvent);
  }

  return 'Task';
}

function resolveSummary(events: AgentEventEnvelope[]) {
  const notification = [...events].reverse().find((event) =>
    event.type === 'sdk.task.notification'
    && getReadableLabel(event.payload.summary),
  );

  if (notification) {
    return getReadableLabel(notification.payload.summary);
  }

  const titleEvent = events.find((event) => resolveEventLabel(event));
  return titleEvent ? resolveEventLabel(titleEvent) : '';
}

function resolveStepLabel(event: AgentEventEnvelope) {
  return resolveEventLabel(event) || event.type;
}

export function groupTaskBlockEvents(events: AgentEventEnvelope[]): TaskBlockEventGroup[] {
  if (events.length === 0) {
    return [];
  }

  const groups: AgentEventEnvelope[][] = [];
  let currentGroup: AgentEventEnvelope[] = [];
  let currentTaskKey: string | null = null;

  for (const event of events) {
    if (!isTaskBlockEvent(event)) {
      continue;
    }

    const eventTaskKey = resolveTaskKey(event, currentTaskKey);
    if (currentGroup.length > 0 && currentTaskKey !== eventTaskKey) {
      groups.push(currentGroup);
      currentGroup = [];
    }

    currentGroup.push(event);
    currentTaskKey = eventTaskKey;
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups.map((groupEvents) => {
    const status = resolveStatus(groupEvents);
    return {
      title: resolveTitle(groupEvents),
      status,
      summary: resolveSummary(groupEvents),
      defaultExpanded:
        status !== 'completed'
        || groupEvents.some((event) => event.type === 'sdk.files.persisted'),
      steps: groupEvents.slice(-4).map((event) => ({
        eventId: event.eventId,
        type: event.type,
        label: resolveStepLabel(event),
      })),
      events: groupEvents,
    };
  });
}
