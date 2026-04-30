import type { FileDraftPreviewOperation } from '@components/code-editor/types/types';
import type { ClientLatencyMark } from '@components/chat/utils/latencyTrace';
import type { AgentRealtimeEvent } from '@components/chat/projection/projectLiveSdkFeed';
import {
  getPendingRequestQuestions,
  isPendingQuestionRequest,
  type PendingDecisionRequest,
} from '../../components/chat/types/types.ts';

type DraftPreviewEvent =
  | {
      type: 'file_change_preview_delta';
      sessionId: string;
      toolId: string;
      filePath: string;
      timestamp: string;
      operation: FileDraftPreviewOperation;
    }
  | {
      type: 'file_change_preview_committed';
      sessionId: string;
      toolId: string;
      filePath: string;
      timestamp: string;
    }
  | {
      type: 'file_change_preview_discarded';
      sessionId: string;
      toolId: string;
      filePath: string;
      timestamp: string;
      error?: string;
    };

export function shouldConsumeAgentV2Event(input: Record<string, unknown>) {
  return typeof input?.eventId === 'string'
    && typeof input?.runId === 'string'
    && typeof input?.type === 'string'
    && typeof input?.sequence === 'number';
}

function normalizeTimestamp(input: unknown) {
  if (typeof input === 'string' && input.trim()) {
    return input.trim();
  }

  return new Date().toISOString();
}

function createRealtimeEventId(prefix: string, sessionId: string | null, messageId: string) {
  return `${prefix}:${sessionId || 'unknown'}:${messageId}`;
}

export function getAgentV2LatencyMarks(event: {
  type: string;
  payload?: Record<string, unknown>;
}): {
  received: ClientLatencyMark | null;
  rendered: ClientLatencyMark | null;
} {
  const payload = normalizeRecord(event.payload);

  if (event.type === 'run.activity.appended') {
    const activity = normalizeRecord(payload.activity);
    const raw = normalizeRecord(activity.raw);
    const rawMessage = normalizeRecord(raw.message);
    const rawContent = Array.isArray(rawMessage.content) ? rawMessage.content : [];
    const directContent = Array.isArray(activity.content) ? activity.content : [];
    const content = rawContent.length > 0 ? rawContent : directContent;
    const hasThinkingBlock = content.some((block) => (
      block
      && typeof block === 'object'
      && !Array.isArray(block)
      && (block as Record<string, unknown>).type === 'thinking'
      && typeof (block as Record<string, unknown>).thinking === 'string'
      && String((block as Record<string, unknown>).thinking).trim()
    ));

    return {
      received: hasThinkingBlock ? 'first_thinking_received' : null,
      rendered: null,
    };
  }

  if (event.type === 'assistant.message.delta') {
    const text = typeof payload.text === 'string' ? payload.text : '';
    const hasText = Boolean(text.trim());
    return {
      received: hasText ? 'first_stream_delta_received' : null,
      rendered: hasText ? 'first_stream_delta_rendered' : null,
    };
  }

  if (event.type === 'run.body.segment_appended') {
    const segment = normalizeRecord(payload.segment);
    const text = typeof segment.text === 'string' ? segment.text : '';
    const hasText = Boolean(text.trim());
    return {
      received: hasText ? 'first_stream_delta_received' : null,
      rendered: hasText ? 'first_stream_delta_rendered' : null,
    };
  }

  return {
    received: null,
    rendered: null,
  };
}

function normalizeRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  return input as Record<string, unknown>;
}

function normalizeText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value == null) {
    return '';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function extractThinkingTextFromActivity(activityInput: unknown): string {
  const activity = normalizeRecord(activityInput);
  const raw = normalizeRecord(activity.raw);
  const rawMessage = normalizeRecord(raw.message);
  const rawContent = Array.isArray(rawMessage.content) ? rawMessage.content : [];
  const directContent = Array.isArray(activity.content) ? activity.content : [];
  const content = rawContent.length > 0 ? rawContent : directContent;

  return content
    .filter((block) => block && typeof block === 'object' && !Array.isArray(block))
    .filter((block) => (block as Record<string, unknown>).type === 'thinking')
    .map((block) => normalizeText((block as Record<string, unknown>).thinking))
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

export function collectRealtimeEventsFromAgentV2Event(event: {
  eventId: string;
  runId?: string | null;
  sessionId: string | null;
  timestamp: string;
  type: string;
  payload: Record<string, unknown>;
}): AgentRealtimeEvent[] {
  const runId = typeof event.runId === 'string' ? event.runId.trim() : null;
  const sessionId = typeof event.sessionId === 'string' ? event.sessionId.trim() : null;
  const timestamp = normalizeTimestamp(event.timestamp);
  const payload = normalizeRecord(event.payload);

  switch (event.type) {
    case 'run.started':
      return [{
        id: createRealtimeEventId('session.status', sessionId, event.eventId),
        type: 'session.status',
        runId,
        sessionId,
        timestamp,
        status: 'starting',
        payload,
      }];
    case 'run.completed':
      return [{
        id: createRealtimeEventId('session.status', sessionId, event.eventId),
        type: 'session.status',
        runId,
        sessionId,
        timestamp,
        status: 'completed',
        detail: normalizeText(payload.result),
        payload,
      }];
    case 'run.failed':
      return [{
        id: createRealtimeEventId('session.status', sessionId, event.eventId),
        type: 'session.status',
        runId,
        sessionId,
        timestamp,
        status: 'failed',
        detail: normalizeText(payload.error),
        payload,
      }];
    case 'run.aborted':
      return [{
        id: createRealtimeEventId('session.status', sessionId, event.eventId),
        type: 'session.status',
        runId,
        sessionId,
        timestamp,
        status: 'aborted',
        payload,
      }];
    case 'assistant.message.delta':
      return [{
        id: createRealtimeEventId('sdk.message', sessionId, event.eventId),
        type: 'sdk.message',
        runId,
        sessionId,
        timestamp,
        message: {
          kind: 'assistant.message.delta',
          text: normalizeText(payload.text),
          detail: normalizeText(payload),
          payload,
        },
      }];
    case 'run.body.segment_appended': {
      const segment = normalizeRecord(payload.segment);
      return [{
        id: createRealtimeEventId('sdk.message', sessionId, event.eventId),
        type: 'sdk.message',
        runId,
        sessionId,
        timestamp,
        message: {
          kind: 'assistant.message.delta',
          text: normalizeText(segment.text),
          detail: normalizeText(segment),
          payload: segment,
        },
      }];
    }
    case 'run.activity.appended': {
      const activity = normalizeRecord(payload.activity);
      const thinkingText = extractThinkingTextFromActivity(activity);
      if (!thinkingText) {
        return [];
      }
      return [{
        id: createRealtimeEventId('sdk.message', sessionId, event.eventId),
        type: 'sdk.message',
        runId,
        sessionId,
        timestamp,
        message: {
          kind: 'thinking',
          text: thinkingText,
          detail: normalizeText(activity),
          payload: activity,
        },
      }];
    }
    case 'sdk.stream_event': {
      const streamText = normalizeText(payload.text);
      if (!streamText) {
        return [];
      }
      return [{
        id: createRealtimeEventId('sdk.message', sessionId, event.eventId),
        type: 'sdk.message',
        runId,
        sessionId,
        timestamp,
        message: {
          kind: 'assistant.message.delta',
          text: streamText,
          detail: normalizeText(payload.event),
          payload,
        },
      }];
    }
    case 'tool.call.started':
    case 'tool.call.delta':
      return [{
        id: createRealtimeEventId('sdk.message', sessionId, event.eventId),
        type: 'sdk.message',
        runId,
        sessionId,
        timestamp,
        message: {
          kind: event.type,
          toolName: typeof payload.toolName === 'string' ? payload.toolName : null,
          input: payload.input ?? null,
          text: normalizeText(payload.input),
          detail: normalizeText(payload),
          payload,
        },
      }];
    case 'tool.call.completed':
    case 'tool.call.failed':
      return [{
        id: createRealtimeEventId('sdk.message', sessionId, event.eventId),
        type: 'sdk.message',
        runId,
        sessionId,
        timestamp,
        message: {
          kind: event.type,
          toolName: typeof payload.toolName === 'string' ? payload.toolName : null,
          output: payload.result ?? payload.error ?? null,
          isError: event.type === 'tool.call.failed',
          text: normalizeText(payload.result ?? payload.error),
          detail: normalizeText(payload),
          payload,
        },
      }];
    case 'sdk.task.started':
      return [{
        id: createRealtimeEventId('sdk.message', sessionId, event.eventId),
        type: 'sdk.message',
        runId,
        sessionId,
        timestamp,
        message: {
          kind: 'task_started',
          text: normalizeText(payload.description || payload.taskType || '子代理任务已启动'),
          detail: normalizeText(payload),
          payload,
        },
      }];
    case 'sdk.task.progress':
      return [{
        id: createRealtimeEventId('sdk.message', sessionId, event.eventId),
        type: 'sdk.message',
        runId,
        sessionId,
        timestamp,
        message: {
          kind: 'task_progress',
          text: normalizeText(payload.description || payload.lastToolName || '子代理任务进行中'),
          detail: normalizeText(payload),
          payload,
        },
      }];
    case 'sdk.task.notification':
      return [{
        id: createRealtimeEventId('sdk.message', sessionId, event.eventId),
        type: 'sdk.message',
        runId,
        sessionId,
        timestamp,
        message: {
          kind: 'task_notification',
          text: normalizeText(payload.summary || payload.status || '子代理任务状态更新'),
          detail: normalizeText(payload),
          payload,
        },
      }];
    case 'sdk.tool.progress':
      return [{
        id: createRealtimeEventId('sdk.message', sessionId, event.eventId),
        type: 'sdk.message',
        runId,
        sessionId,
        timestamp,
        message: {
          kind: 'tool_progress',
          toolName: typeof payload.toolName === 'string' ? payload.toolName : null,
          text: normalizeText(
            payload.text
            || (typeof payload.toolName === 'string' && payload.toolName.trim()
              ? `${payload.toolName.trim()} 运行中`
              : '子代理工具运行中'),
          ),
          detail: normalizeText(payload),
          payload,
        },
      }];
    case 'sdk.tool.summary':
      return [{
        id: createRealtimeEventId('sdk.message', sessionId, event.eventId),
        type: 'sdk.message',
        runId,
        sessionId,
        timestamp,
        message: {
          kind: 'tool_use_summary',
          text: normalizeText(payload.summary || '子代理工具摘要'),
          detail: normalizeText(payload),
          payload,
        },
      }];
    case 'sdk.compact_boundary':
      return [{
        id: createRealtimeEventId('sdk.message', sessionId, event.eventId),
        type: 'sdk.message',
        runId,
        sessionId,
        timestamp,
        message: {
          kind: 'compact_boundary',
          text: '上下文已压缩',
          detail: normalizeText(payload.trigger),
          payload,
        },
      }];
    case 'debug.ref':
    case 'sdk.debug.ref':
      return [{
        id: createRealtimeEventId('debug.ref', sessionId, event.eventId),
        type: 'debug.ref',
        runId,
        sessionId,
        timestamp,
        ref: {
          label: typeof payload.label === 'string' ? payload.label : normalizeText(payload.label || payload.path || payload.ref || 'debug ref'),
          path: typeof payload.path === 'string'
            ? payload.path
            : (typeof payload.refPath === 'string' ? payload.refPath : null),
        },
        payload,
      }];
    case 'sdk.session.status':
    case 'session.status':
      return [{
        id: createRealtimeEventId('session.status', sessionId, event.eventId),
        type: 'session.status',
        runId,
        sessionId,
        timestamp,
        status: typeof payload.status === 'string' ? payload.status : 'working',
        detail: normalizeText(payload.detail || payload.text || payload),
        payload,
      }];
    case 'sdk.interaction.required':
      return [{
        id: createRealtimeEventId('interaction.required', sessionId, event.eventId),
        type: 'interaction.required',
        runId,
        sessionId,
        timestamp,
        requestId: typeof payload.requestId === 'string' && payload.requestId.trim() ? payload.requestId.trim() : event.eventId,
        interaction: {
          kind: typeof payload.kind === 'string' && payload.kind === 'interactive_prompt' ? 'interactive_prompt' : 'permission',
          toolName: typeof payload.toolName === 'string' ? payload.toolName : null,
          message: normalizeText(payload.message || payload.text || payload.content || payload),
          input: payload.input ?? null,
          context: payload.context ?? null,
          payload,
        },
      }];
    case 'sdk.interaction.resolved':
      return [{
        id: createRealtimeEventId('interaction.resolved', sessionId, event.eventId),
        type: 'interaction.resolved',
        runId,
        sessionId,
        timestamp,
        requestId: typeof payload.requestId === 'string' && payload.requestId.trim() ? payload.requestId.trim() : event.eventId,
        outcome: typeof payload.outcome === 'string' ? payload.outcome : 'resolved',
        message: normalizeText(payload.message || payload.text || payload.content || payload),
        payload,
      }];
    default:
      return [];
  }
}

export function collectRealtimeEventsFromNormalizedMessage(message: Record<string, unknown>, sessionId: string | null): AgentRealtimeEvent[] {
  const sid = typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : null;
  const runId = typeof message.runId === 'string'
    ? message.runId.trim()
    : (typeof message.run_id === 'string' ? message.run_id.trim() : null);
  const kind = typeof message.kind === 'string' ? message.kind.trim() : '';
  const id = typeof message.id === 'string' && message.id.trim()
    ? message.id.trim()
    : `${kind || 'message'}:${Date.now()}`;
  const timestamp = normalizeTimestamp(message.timestamp);

  if (kind === 'question_request') {
    const requestId = typeof message.requestId === 'string' && message.requestId.trim()
      ? message.requestId.trim()
      : `${kind}:${id}`;
    const questions = Array.isArray(message.questions) ? message.questions : [];
    const firstQuestion = questions.find((item) => item && typeof item === 'object') as Record<string, unknown> | undefined;
    return [{
      id: createRealtimeEventId('interaction.required', sid, requestId),
      type: 'interaction.required',
      runId,
      sessionId: sid,
      timestamp,
      requestId,
      interaction: {
        kind: 'interactive_prompt',
        toolName: typeof message.toolName === 'string' ? message.toolName : 'AskUserQuestion',
        message: normalizeText(
          message.content
          || message.text
          || firstQuestion?.question
          || questions,
        ),
        input: {
          questions,
        },
        context: message.context,
        payload: message,
      },
    }];
  }

  if (kind === 'tool_approval_request') {
    const requestId = typeof message.requestId === 'string' && message.requestId.trim()
      ? message.requestId.trim()
      : `${kind}:${id}`;
    return [{
      id: createRealtimeEventId('interaction.required', sid, requestId),
      type: 'interaction.required',
      runId,
      sessionId: sid,
      timestamp,
      requestId,
      interaction: {
        kind: 'permission',
        toolName: typeof message.toolName === 'string' ? message.toolName : null,
        message: normalizeText(message.content || message.text || '等待权限确认'),
        input: message.input,
        context: message.context,
        payload: message,
      },
    }];
  }

  if (kind === 'agent_sdk_message') {
    const sdkMessage = message.sdkMessage;
    if (!sdkMessage || typeof sdkMessage !== 'object' || Array.isArray(sdkMessage)) {
      return [];
    }

    const normalizedSdkMessage = sdkMessage as { sdkType?: unknown; payload?: unknown };
    const sdkType = typeof normalizedSdkMessage.sdkType === 'string' ? normalizedSdkMessage.sdkType : '';
    const payload = normalizedSdkMessage.payload;
    const normalizedPayload = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {};

    if (sdkType === 'stream_event') {
      const event = normalizedPayload.event;
      const normalizedEvent = event && typeof event === 'object' && !Array.isArray(event)
        ? event as Record<string, unknown>
        : {};
      const delta = normalizedEvent.delta;
      const normalizedDelta = delta && typeof delta === 'object' && !Array.isArray(delta)
        ? delta as Record<string, unknown>
        : {};

      return [{
        id: createRealtimeEventId('sdk.message', sid, id),
        type: 'sdk.message',
        runId,
        sessionId: sid,
        timestamp,
        message: {
          kind: 'assistant.message.delta',
          text: normalizeText(normalizedDelta.text),
          detail: normalizeText(normalizedEvent),
          payload: normalizedPayload,
        },
      }];
    }

    if (sdkType === 'result') {
      const subtype = typeof normalizedPayload.subtype === 'string' ? normalizedPayload.subtype : '';
      return [{
        id: createRealtimeEventId('session.status', sid, id),
        type: 'session.status',
        runId,
        sessionId: sid,
        timestamp,
        status: subtype === 'success' ? 'completed' : 'failed',
        detail: normalizeText(normalizedPayload.result),
        payload: normalizedPayload,
      }];
    }
  }

  if (kind === 'permission_cancelled') {
    const requestId = typeof message.requestId === 'string' && message.requestId.trim()
      ? message.requestId.trim()
      : `${kind}:${id}`;
    return [{
      id: createRealtimeEventId('interaction.resolved', sid, requestId),
      type: 'interaction.resolved',
      runId,
      sessionId: sid,
      timestamp,
      requestId,
      outcome: 'cancelled',
      message: normalizeText(message.content || message.text),
      payload: message,
    }];
  }

  if (kind === 'status') {
    return [{
      id: createRealtimeEventId('session.status', sid, id),
      type: 'session.status',
      runId,
      sessionId: sid,
      timestamp,
      status: typeof message.text === 'string' ? message.text : 'working',
      detail: normalizeText(message.tokenBudget || message.content),
      payload: message,
    }];
  }

  if (kind === 'debug_ref' || kind === 'debug.ref') {
    return [{
      id: createRealtimeEventId('debug.ref', sid, id),
      type: 'debug.ref',
      runId,
      sessionId: sid,
      timestamp,
      ref: {
        label: normalizeText(message.label || message.title || message.text || 'debug ref'),
        path: typeof message.path === 'string' ? message.path : null,
      },
      payload: message,
    }];
  }

  if (
    kind === 'thinking'
    || kind === 'stream_delta'
    || kind === 'tool_use'
    || kind === 'tool_use_partial'
    || kind === 'tool_result'
    || kind === 'task_notification'
    || kind === 'task_started'
    || kind === 'task_progress'
    || kind === 'compact_boundary'
    || kind === 'tool_progress'
    || kind === 'tool_use_summary'
    || kind === 'auth_status'
    || kind === 'files_persisted'
    || kind === 'hook_started'
    || kind === 'hook_progress'
    || kind === 'hook_response'
    || kind === 'prompt_suggestion'
    || kind === 'rate_limit'
  ) {
    return [{
      id: createRealtimeEventId('sdk.message', sid, id),
      type: 'sdk.message',
      runId,
      sessionId: sid,
      timestamp,
      message: {
        kind,
        text: normalizeText(message.content || message.text || message.summary),
        toolName: typeof message.toolName === 'string' ? message.toolName : null,
        input: message.toolInput ?? message.input ?? null,
        output: message.toolResult ?? message.output ?? null,
        isError: message.isError === true,
        detail: normalizeText(message.toolResult || message.context || message.payload),
        payload: message,
      },
    }];
  }

  return [];
}

export function collectRealtimeEventsFromPendingDecisionRequest(
  request: PendingDecisionRequest,
  sessionId: string | null,
): AgentRealtimeEvent[] {
  const sid = typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : null;
  const requestId = typeof request.requestId === 'string' && request.requestId.trim()
    ? request.requestId.trim()
    : `pending-decision:${Date.now()}`;
  const questions = getPendingRequestQuestions(request);
  const firstQuestion = questions.find((item) => item && typeof item === 'object');
  const normalizedRequest = request as unknown as Record<string, unknown>;
  const interactionKind = isPendingQuestionRequest(request) ? 'interactive_prompt' : 'permission';
  const message = isPendingQuestionRequest(request)
    ? normalizeText(firstQuestion?.question || normalizedRequest.message || request.input || questions)
    : normalizeText(normalizedRequest.message || request.input || request.context || '等待权限确认');

  return [{
    id: createRealtimeEventId('interaction.required', sid, requestId),
    type: 'interaction.required',
    runId: null,
    sessionId: sid,
    timestamp: request.receivedAt instanceof Date ? request.receivedAt.toISOString() : new Date().toISOString(),
    requestId,
    interaction: {
      kind: interactionKind,
      toolName: typeof request.toolName === 'string'
        ? request.toolName
        : (interactionKind === 'interactive_prompt' ? 'AskUserQuestion' : null),
      message,
      input: interactionKind === 'interactive_prompt' ? { questions } : request.input,
      context: request.context,
      payload: normalizedRequest,
    },
  }];
}

function getDraftPreviewCacheKey(sessionId: string, toolId: string) {
  return `${sessionId}::${toolId}`;
}

function createDraftPreviewEventKey(event: DraftPreviewEvent) {
  return [
    event.type,
    event.sessionId,
    event.toolId,
    event.filePath,
    event.timestamp,
  ].join('::');
}

function mergeWritePreviewText(previousText: string, nextText: string) {
  if (!previousText) {
    return nextText;
  }

  if (!nextText) {
    return previousText;
  }

  if (nextText.startsWith(previousText)) {
    return nextText;
  }

  if (previousText.startsWith(nextText)) {
    return previousText;
  }

  return `${previousText}${nextText}`;
}

function mergeDraftPreviewOperation(
  previousOperation: FileDraftPreviewOperation | undefined,
  nextOperation: FileDraftPreviewOperation,
) {
  if (!previousOperation || previousOperation.source !== nextOperation.source) {
    return nextOperation;
  }

  if (nextOperation.source === 'Write' && nextOperation.mode === 'write') {
    return {
      ...previousOperation,
      ...nextOperation,
      newText: mergeWritePreviewText(previousOperation.newText, nextOperation.newText),
    };
  }

  return nextOperation;
}

function buildDraftPreviewOperationFromEvent(event: {
  sessionId: string;
  timestamp: string;
  payload: Record<string, unknown>;
}): FileDraftPreviewOperation | null {
  const toolName = typeof event.payload.toolName === 'string' ? event.payload.toolName.trim() : '';
  const toolId = typeof event.payload.toolId === 'string' ? event.payload.toolId.trim() : '';
  const input = normalizeRecord(event.payload.input);
  const filePathCandidate = input.file_path ?? input.filePath ?? input.path;
  const filePath = typeof filePathCandidate === 'string' ? filePathCandidate.trim() : '';

  if (!toolId || !filePath) {
    return null;
  }

  if (toolName === 'Write') {
    const newText = typeof input.content === 'string' ? input.content : '';
    if (!newText) {
      return null;
    }

    return {
      toolId,
      filePath,
      timestamp: event.timestamp,
      source: 'Write',
      mode: 'write',
      newText,
      status: 'pending',
      lineRange: null,
    };
  }

  if (toolName === 'Edit') {
    const oldText = typeof input.old_string === 'string' ? input.old_string : '';
    const newText = typeof input.new_string === 'string' ? input.new_string : '';
    if (!oldText && !newText) {
      return null;
    }

    return {
      toolId,
      filePath,
      timestamp: event.timestamp,
      source: 'Edit',
      mode: 'replace',
      oldText,
      newText,
      replaceAll: Boolean(input.replace_all),
      status: 'pending',
      lineRange: null,
    };
  }

  return null;
}

export function collectDraftPreviewEventsFromAgentV2Event({
  event,
  emittedKeys,
  draftOperationCache,
}: {
  event: {
    type: string;
    sessionId: string | null;
    timestamp: string;
    payload: Record<string, unknown>;
  };
  emittedKeys: Set<string>;
  draftOperationCache: Map<string, FileDraftPreviewOperation>;
}): DraftPreviewEvent[] {
  const sessionId = typeof event.sessionId === 'string' ? event.sessionId.trim() : '';
  if (!sessionId) {
    return [];
  }

  if (event.type === 'tool.call.started') {
    const cacheKey = getDraftPreviewCacheKey(sessionId, typeof event.payload.toolId === 'string' ? event.payload.toolId.trim() : '');
    const operation = buildDraftPreviewOperationFromEvent({
      sessionId,
      timestamp: event.timestamp,
      payload: event.payload,
    });

    if (!operation) {
      return [];
    }

    const mergedOperation = mergeDraftPreviewOperation(draftOperationCache.get(cacheKey), operation);
    draftOperationCache.set(getDraftPreviewCacheKey(sessionId, operation.toolId), mergedOperation);

    const nextEvent: DraftPreviewEvent = {
      type: 'file_change_preview_delta',
      sessionId,
      toolId: mergedOperation.toolId,
      filePath: mergedOperation.filePath,
      timestamp: mergedOperation.timestamp,
      operation: mergedOperation,
    };
    const eventKey = createDraftPreviewEventKey(nextEvent);
    if (emittedKeys.has(eventKey)) {
      return [];
    }
    emittedKeys.add(eventKey);
    return [nextEvent];
  }

  if (event.type === 'tool.call.delta') {
    const cacheKey = getDraftPreviewCacheKey(sessionId, typeof event.payload.toolId === 'string' ? event.payload.toolId.trim() : '');
    const operation = buildDraftPreviewOperationFromEvent({
      sessionId,
      timestamp: event.timestamp,
      payload: event.payload,
    });
    if (!operation) {
      return [];
    }

    const mergedOperation = mergeDraftPreviewOperation(draftOperationCache.get(cacheKey), operation);
    draftOperationCache.set(getDraftPreviewCacheKey(sessionId, operation.toolId), mergedOperation);
    const nextEvent: DraftPreviewEvent = {
      type: 'file_change_preview_delta',
      sessionId,
      toolId: mergedOperation.toolId,
      filePath: mergedOperation.filePath,
      timestamp: mergedOperation.timestamp,
      operation: mergedOperation,
    };
    const eventKey = createDraftPreviewEventKey(nextEvent);
    if (emittedKeys.has(eventKey)) {
      return [];
    }
    emittedKeys.add(eventKey);
    return [nextEvent];
  }

  if (event.type !== 'tool.call.completed' && event.type !== 'tool.call.failed') {
    return [];
  }

  const toolId = typeof event.payload.toolId === 'string' ? event.payload.toolId.trim() : '';
  if (!toolId) {
    return [];
  }

  const cacheKey = getDraftPreviewCacheKey(sessionId, toolId);
  const operation = draftOperationCache.get(cacheKey);
  if (!operation) {
    return [];
  }

  draftOperationCache.delete(cacheKey);

  const nextEvent: DraftPreviewEvent = event.type === 'tool.call.failed'
    ? {
        type: 'file_change_preview_discarded',
        sessionId,
        toolId,
        filePath: operation.filePath,
        timestamp: event.timestamp,
        error: typeof event.payload.error === 'string' ? event.payload.error : undefined,
      }
    : {
        type: 'file_change_preview_committed',
        sessionId,
        toolId,
        filePath: operation.filePath,
        timestamp: event.timestamp,
      };

  const eventKey = createDraftPreviewEventKey(nextEvent);
  if (emittedKeys.has(eventKey)) {
    return [];
  }
  emittedKeys.add(eventKey);
  return [nextEvent];
}

const isTemporarySessionId = (sessionId: string | null | undefined) =>
  Boolean(sessionId && sessionId.startsWith('new-session-'));

const HANDOFF_CANDIDATE_EVENT_TYPES = new Set([
  'assistant.message.started',
  'assistant.message.delta',
  'assistant.message.completed',
  'run.body.segment_appended',
  'run.activity.appended',
  'tool.call.started',
  'tool.call.delta',
  'tool.call.completed',
  'tool.call.failed',
]);

export function shouldCapturePendingSessionHandoffCandidate(eventType: string | null) {
  return typeof eventType === 'string' && HANDOFF_CANDIDATE_EVENT_TYPES.has(eventType);
}

export function resolvePendingSessionTraceId({
  currentSessionId,
  activeViewSessionId,
  pendingTraceId,
}: {
  currentSessionId: string | null;
  activeViewSessionId: string | null;
  pendingTraceId: string | null;
}) {
  if (typeof pendingTraceId === 'string' && pendingTraceId.trim()) {
    return pendingTraceId.trim();
  }

  if (isTemporarySessionId(currentSessionId)) {
    return currentSessionId;
  }

  if (isTemporarySessionId(activeViewSessionId)) {
    return activeViewSessionId;
  }

  return null;
}

export function resolvePendingSessionHandoff({
  currentSessionId,
  activeViewSessionId,
  pendingSessionId,
  pendingCandidateSessionId,
  runtimeSessionId,
  eventType,
  eventTraceId,
  handoffTraceId,
  hasPendingSessionHandoff,
}: {
  currentSessionId: string | null;
  activeViewSessionId: string | null;
  pendingSessionId: string | null;
  pendingCandidateSessionId: string | null;
  runtimeSessionId: string | null;
  eventType: string | null;
  eventTraceId: string | null;
  handoffTraceId: string | null;
  hasPendingSessionHandoff: boolean;
}) {
  let nextPendingSessionId = pendingSessionId;
  const nextPendingCandidateSessionId = pendingCandidateSessionId;

  if (!runtimeSessionId || !hasPendingSessionHandoff) {
    return {
      pendingSessionId: nextPendingSessionId,
      pendingCandidateSessionId: nextPendingCandidateSessionId,
      shouldAdopt: false,
    };
  }

  if (handoffTraceId && eventTraceId !== handoffTraceId) {
    return {
      pendingSessionId: nextPendingSessionId,
      pendingCandidateSessionId: nextPendingCandidateSessionId,
      shouldAdopt: false,
    };
  }

  if (
    (eventType === 'run.started' || shouldCapturePendingSessionHandoffCandidate(eventType))
    && !nextPendingSessionId
  ) {
    nextPendingSessionId = runtimeSessionId;
  }

  const shouldAdopt = shouldAdoptSessionCreatedId({
    currentSessionId,
    activeViewSessionId,
    pendingSessionId: nextPendingSessionId,
    newSessionId: runtimeSessionId,
    eventType,
    eventTraceId,
    handoffTraceId,
    hasPendingSessionHandoff,
  });

  return {
    pendingSessionId: nextPendingSessionId,
    pendingCandidateSessionId: shouldAdopt ? null : nextPendingCandidateSessionId,
    shouldAdopt,
  };
}

export function shouldAdoptSessionCreatedId({
  currentSessionId,
  activeViewSessionId,
  pendingSessionId,
  newSessionId,
  eventType,
  eventTraceId,
  handoffTraceId,
  hasPendingSessionHandoff,
}: {
  currentSessionId: string | null;
  activeViewSessionId: string | null;
  pendingSessionId: string | null;
  newSessionId: string | null;
  eventType: string | null;
  eventTraceId?: string | null;
  handoffTraceId?: string | null;
  hasPendingSessionHandoff: boolean;
}) {
  if (!newSessionId) {
    return false;
  }

  if (currentSessionId === newSessionId) {
    return false;
  }

  if (typeof eventType !== 'string' && typeof hasPendingSessionHandoff !== 'boolean') {
    return currentSessionId === activeViewSessionId;
  }

  if (!hasPendingSessionHandoff) {
    return false;
  }

  if (isTemporarySessionId(currentSessionId) && activeViewSessionId === currentSessionId) {
    if (!handoffTraceId || eventTraceId !== handoffTraceId) {
      return false;
    }
    return pendingSessionId === newSessionId
      && (
        eventType === 'run.started'
        || shouldCapturePendingSessionHandoffCandidate(eventType)
      );
  }

  if (!currentSessionId && (!pendingSessionId || pendingSessionId === newSessionId)) {
    return eventType === 'run.started' || shouldCapturePendingSessionHandoffCandidate(eventType);
  }

  return false;
}

export function shouldFinalizeActiveRunV2Event({
  eventSessionId,
  currentSessionId,
  activeViewSessionId,
  pendingSessionId,
}: {
  eventSessionId: string | null;
  currentSessionId: string | null;
  activeViewSessionId: string | null;
  pendingSessionId: string | null;
}) {
  if (!eventSessionId) {
    return false;
  }

  return eventSessionId === currentSessionId
    || eventSessionId === activeViewSessionId
    || eventSessionId === pendingSessionId;
}
