import type {
  RunCard,
  RunCardInteraction,
  RunCardProcessItem,
  RunCardProcessItemKind,
  RunCardResponseMessage,
} from '../types/runCard.ts';
import type { CanonicalSessionMessage } from '../types/sessionHistory.ts';
import { isExpandedSkillPromptContent } from '../../chat/utils/protocolNoise.ts';
import type { AgentRealtimeEvent } from './projectLiveSdkFeed.ts';

type LiveRunCardAnchor = {
  messageId: string;
  content: string;
  timestamp: string;
};

type ProjectLiveRunCardsInput = {
  sessionId: string;
  anchoredUserMessages: LiveRunCardAnchor[];
  events: AgentRealtimeEvent[];
};

const LIVE_RUN_ANCHOR_FUTURE_SKEW_MS = 5_000;

function parseTimestamp(value: string | null | undefined) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function pickAnchorMessage(
  anchoredUserMessages: LiveRunCardAnchor[],
  events: AgentRealtimeEvent[],
) {
  if (anchoredUserMessages.length === 0) {
    return null;
  }

  const firstEventTimestamp = parseTimestamp(events[0]?.timestamp);
  if (firstEventTimestamp == null) {
    return anchoredUserMessages[anchoredUserMessages.length - 1];
  }

  let nearestPastCandidate: LiveRunCardAnchor | null = null;
  let nearestFutureCandidate: LiveRunCardAnchor | null = null;
  for (let index = anchoredUserMessages.length - 1; index >= 0; index -= 1) {
    const candidate = anchoredUserMessages[index];
    const candidateTimestamp = parseTimestamp(candidate.timestamp);
    if (candidateTimestamp == null) {
      if (!nearestPastCandidate) {
        nearestPastCandidate = candidate;
      }
      continue;
    }

    if (candidateTimestamp <= firstEventTimestamp) {
      if (!nearestPastCandidate) {
        nearestPastCandidate = candidate;
      }
      continue;
    }

    if (
      candidateTimestamp > firstEventTimestamp
      && candidateTimestamp - firstEventTimestamp <= LIVE_RUN_ANCHOR_FUTURE_SKEW_MS
      && !nearestFutureCandidate
    ) {
      nearestFutureCandidate = candidate;
    }
  }

  if (nearestPastCandidate && nearestFutureCandidate) {
    const pastDistance = Math.abs(firstEventTimestamp - (parseTimestamp(nearestPastCandidate.timestamp) ?? firstEventTimestamp));
    const futureDistance = Math.abs((parseTimestamp(nearestFutureCandidate.timestamp) ?? firstEventTimestamp) - firstEventTimestamp);
    return futureDistance < pastDistance ? nearestFutureCandidate : nearestPastCandidate;
  }

  return nearestFutureCandidate || nearestPastCandidate || anchoredUserMessages[anchoredUserMessages.length - 1];
}

function toText(value: unknown) {
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

function extractStructuredTextContent(content: unknown) {
  const blocks = normalizeContentBlocks(content);
  if (blocks.length === 0) {
    return '';
  }

  return blocks
    .filter((block) => block.type === 'text' && typeof block.text === 'string' && block.text.trim())
    .map((block) => String(block.text).trim())
    .join('\n')
    .trim();
}

function extractMessageText(message: CanonicalSessionMessage) {
  const directText = typeof message.text === 'string' ? message.text.trim() : '';
  if (isExpandedSkillPromptContent(directText)) {
    return '';
  }
  if (directText) {
    return directText;
  }

  const structuredText = extractStructuredTextContent(message.content);
  if (isExpandedSkillPromptContent(structuredText)) {
    return '';
  }
  if (structuredText) {
    return structuredText;
  }

  const fallbackText = toText(message.content);
  if (isExpandedSkillPromptContent(fallbackText)) {
    return '';
  }
  return fallbackText;
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizeContentBlocks(content: unknown): Record<string, unknown>[] {
  if (!Array.isArray(content)) {
    return [];
  }

  return content
    .filter((block) => block && typeof block === 'object' && !Array.isArray(block))
    .map((block) => block as Record<string, unknown>);
}

function getRecordString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeInteractionKind(kind: 'permission' | 'interactive_prompt'): RunCardInteraction['kind'] {
  return kind === 'permission' ? 'permission_request' : 'interactive_prompt';
}

function normalizeProcessItemKind(kind: string): RunCardProcessItemKind {
  if (kind === 'tool.call.started' || kind === 'tool.call.delta') {
    return 'tool_use';
  }

  if (kind === 'tool.call.completed' || kind === 'tool.call.failed') {
    return 'tool_result';
  }

  if (
    kind === 'thinking' ||
    kind === 'tool_use' ||
    kind === 'tool_result' ||
    kind === 'task_started' ||
    kind === 'task_progress' ||
    kind === 'task_notification' ||
    kind === 'tool_progress' ||
    kind === 'tool_use_summary' ||
    kind === 'interactive_prompt' ||
    kind === 'permission_request' ||
    kind === 'session_status' ||
    kind === 'compact_boundary' ||
    kind === 'debug_ref'
  ) {
    if (
      kind === 'task_started' ||
      kind === 'task_progress' ||
      kind === 'task_notification' ||
      kind === 'tool_progress' ||
      kind === 'tool_use_summary'
    ) {
      return 'subagent_progress';
    }
    return kind;
  }

  return 'notice';
}

function normalizeLiveCardStatus(status: string): RunCard['cardStatus'] | null {
  const normalized = status.trim().toLowerCase();

  if (normalized === 'completed' || normalized === 'failed' || normalized === 'aborted') {
    return normalized;
  }

  return null;
}

function headlineForCardStatus(cardStatus: RunCard['cardStatus']) {
  switch (cardStatus) {
    case 'completed':
      return '已完成';
    case 'failed':
      return '执行失败';
    case 'aborted':
      return '已中止';
    case 'waiting_for_input':
      return '等待你的回答';
    default:
      return '执行中';
  }
}

function liveProcessTitle(kind: string, fallbackToolName?: string | null) {
  const normalized = String(kind || '').trim();
  if (normalized === 'thinking') {
    return '思考';
  }
  if (normalized === 'tool.call.started' || normalized === 'tool.call.delta' || normalized === 'tool_use') {
    return fallbackToolName ? `工具调用 · ${fallbackToolName}` : '工具调用';
  }
  if (normalized === 'tool.call.completed' || normalized === 'tool.call.failed') {
    return fallbackToolName ? `工具结果 · ${fallbackToolName}` : '工具结果';
  }
  if (normalized === 'interactive_prompt') {
    return '交互提问';
  }
  if (normalized === 'permission_request') {
    return '权限请求';
  }
  if (normalized === 'compact_boundary') {
    return '压缩边界';
  }
  if (normalized === 'debug_ref') {
    return '调试引用';
  }
  if (normalized === 'task_started') {
    return '子代理任务';
  }
  if (normalized === 'task_progress') {
    return '子代理进度';
  }
  if (normalized === 'task_notification') {
    return '子代理状态';
  }
  if (normalized === 'tool_progress') {
    return '子代理工具进度';
  }
  if (normalized === 'tool_use_summary') {
    return '子代理工具摘要';
  }
  return normalized || '过程';
}

function appendResponseFragment(current: string, fragment: unknown) {
  if (typeof fragment === 'string') {
    return current + fragment;
  }

  const text = toText(fragment);
  return text ? current + text : current;
}

function sessionStatusBody(status: string, detail?: string | null, payload?: unknown) {
  return [status, detail, payload]
    .map((part) => toText(part))
    .filter(Boolean)
    .join('\n\n');
}

function sessionStatusTone(status: string): 'neutral' | 'danger' {
  const normalized = status.trim().toLowerCase();

  if (normalized === 'failed' || normalized === 'aborted') {
    return 'danger';
  }

  return 'neutral';
}

function debugRefBody(label: string, path?: string | null, payload?: unknown) {
  const parts = [label, path, payload];
  return parts
    .map((part) => toText(part))
    .filter(Boolean)
    .join('\n\n');
}

function isTerminalSessionStatus(status: string) {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'completed' || normalized === 'failed' || normalized === 'aborted';
}

function extractHistoricalToolName(message: CanonicalSessionMessage): string | null {
  const directToolName = String(message.toolName || '').trim();
  if (directToolName) {
    return directToolName;
  }

  for (const block of normalizeContentBlocks(message.content)) {
    const blockToolName = getRecordString(block, 'name')
      || getRecordString(block, 'tool_name')
      || getRecordString(block, 'toolName');
    if (blockToolName) {
      return blockToolName;
    }
  }

  return null;
}

function historicalProcessTitle(message: CanonicalSessionMessage, normalizedKind: string) {
  if (normalizedKind === 'thinking') {
    return '思考';
  }

  if (normalizedKind === 'tool_use') {
    const toolName = extractHistoricalToolName(message);
    return toolName ? `工具调用 · ${toolName}` : '工具调用';
  }

  if (normalizedKind === 'tool_result') {
    const toolName = extractHistoricalToolName(message);
    return toolName ? `工具结果 · ${toolName}` : '工具结果';
  }

  if (normalizedKind === 'interactive_prompt') {
    return '交互提问';
  }

  if (normalizedKind === 'permission_request') {
    return '权限请求';
  }

  if (normalizedKind === 'compact_boundary') {
    return '压缩边界';
  }

  if (normalizedKind === 'debug_ref') {
    return '调试引用';
  }

  if (normalizedKind === 'session_status') {
    return '会话状态';
  }

  return normalizedKind || '过程';
}

function pushAssistantNotice(
  processItems: RunCardProcessItem[],
  message: CanonicalSessionMessage | null,
) {
  const body = message ? extractMessageText(message) : '';
  if (!message || !body) {
    return;
  }

  processItems.push({
    id: message.id,
    timestamp: message.timestamp,
    kind: 'notice',
    title: '阶段更新',
    body,
    tone: 'neutral',
  });
}

function toResponseMessage(message: CanonicalSessionMessage | null, kind: 'phase' | 'final'): RunCardResponseMessage | null {
  const body = message ? extractMessageText(message) : '';
  if (!message || !body) {
    return null;
  }

  return {
    id: message.id,
    timestamp: message.timestamp,
    kind,
    body,
  };
}

function materializeResponseMessages(
  responseMessages: RunCardResponseMessage[],
  assistantMessage: CanonicalSessionMessage | null,
) {
  const finalMessage = toResponseMessage(assistantMessage, 'final');
  if (!finalMessage) {
    return responseMessages;
  }

  const alreadyHasFinal = responseMessages.some((item) => item.id === finalMessage.id && item.kind === 'final');
  return alreadyHasFinal ? responseMessages : [...responseMessages, finalMessage];
}

function buildHistoricalProcessPayload(message: CanonicalSessionMessage) {
  const hasContent = Object.prototype.hasOwnProperty.call(message, 'content');
  const hasToolInput = Object.prototype.hasOwnProperty.call(message, 'toolInput');
  const hasToolName = Object.prototype.hasOwnProperty.call(message, 'toolName');
  const hasToolId = Object.prototype.hasOwnProperty.call(message, 'toolId');
  const hasIsError = Object.prototype.hasOwnProperty.call(message, 'isError');

  if (!hasContent && !hasToolInput && !hasToolName && !hasToolId && !hasIsError) {
    return undefined;
  }

  if (!hasToolInput && !hasToolName && !hasToolId && !hasIsError) {
    return message.content;
  }

  return {
    ...(hasContent ? { content: message.content } : {}),
    ...(hasToolInput ? { toolInput: message.toolInput } : {}),
    ...(hasToolName ? { toolName: message.toolName } : {}),
    ...(hasToolId ? { toolId: message.toolId } : {}),
    ...(hasIsError ? { isError: message.isError } : {}),
  };
}

export function projectHistoricalRunCards(messages: CanonicalSessionMessage[]): RunCard[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  const cards: RunCard[] = [];
  let currentUserMessage: CanonicalSessionMessage | null = null;
  let processItems: RunCardProcessItem[] = [];
  let finalResponse = '';
  let responseMessages: RunCardResponseMessage[] = [];
  let pendingAssistantMessage: CanonicalSessionMessage | null = null;
  let lastActivityTimestamp: string | null = null;
  let currentRunSessionId: string | null = null;
  let currentRunStartedAt: string | null = null;

  const flush = (assistantMessage: CanonicalSessionMessage | null, terminalTimestamp: string | null = null) => {
    const effectiveSessionId = currentUserMessage?.sessionId || assistantMessage?.sessionId || currentRunSessionId || '';
    const effectiveStartedAt = currentUserMessage?.timestamp || currentRunStartedAt || assistantMessage?.timestamp || lastActivityTimestamp;
    const effectiveAnchorMessageId = currentUserMessage?.id || '';

    if (!effectiveStartedAt) {
      return;
    }

    if (!currentUserMessage || !assistantMessage) {
      if (!currentUserMessage && !assistantMessage) {
        return;
      }

      const completedAt = terminalTimestamp || lastActivityTimestamp || effectiveStartedAt;
      const effectiveResponseMessages = materializeResponseMessages(responseMessages, assistantMessage);
      cards.push({
        sessionId: effectiveSessionId,
        anchorMessageId: effectiveAnchorMessageId,
        cardStatus: 'completed',
        headline: '已完成',
        finalResponse,
        responseMessages: effectiveResponseMessages,
        processItems,
        activeInteraction: null,
        startedAt: effectiveStartedAt,
        updatedAt: completedAt,
        completedAt,
        defaultExpanded: false,
        source: 'official-history',
      });
      return;
    }

    const completedAt = terminalTimestamp || assistantMessage.timestamp || lastActivityTimestamp || currentUserMessage.timestamp;
    const effectiveResponseMessages = materializeResponseMessages(responseMessages, assistantMessage);

    cards.push({
      sessionId: effectiveSessionId,
      anchorMessageId: effectiveAnchorMessageId,
      cardStatus: 'completed',
      headline: '已完成',
      finalResponse,
      responseMessages: effectiveResponseMessages,
      processItems,
      activeInteraction: null,
      startedAt: effectiveStartedAt,
      updatedAt: completedAt,
      completedAt,
      defaultExpanded: false,
      source: 'official-history',
    });
  };

  for (const message of messages) {
    const normalizedKind = String(message.kind || message.type || '').trim();

    if (message.role === 'user' && (normalizedKind === 'text' || normalizedKind === 'message' || !normalizedKind)) {
      const userText = extractMessageText(message);
      const rawUserContent = toText(message.text || message.content);
      if (isExpandedSkillPromptContent(userText) || isExpandedSkillPromptContent(rawUserContent)) {
        continue;
      }

      if (pendingAssistantMessage || processItems.length > 0) {
        flush(pendingAssistantMessage, lastActivityTimestamp);
      }

      currentUserMessage = message;
      currentRunSessionId = message.sessionId || null;
      currentRunStartedAt = message.timestamp || null;
      processItems = [];
      finalResponse = '';
      responseMessages = [];
      pendingAssistantMessage = null;
      lastActivityTimestamp = message.timestamp || null;
      continue;
    }

    if (!currentRunStartedAt) {
      currentRunStartedAt = message.timestamp || null;
      currentRunSessionId = message.sessionId || null;
    }

    if (normalizedKind === 'thinking') {
      lastActivityTimestamp = message.timestamp || lastActivityTimestamp;
      processItems.push({
        id: message.id,
        timestamp: message.timestamp,
        kind: 'thinking',
        title: historicalProcessTitle(message, normalizedKind),
        body: toText(message.text),
      });
      continue;
    }

    if (
      normalizedKind === 'tool_use' ||
      normalizedKind === 'tool_result' ||
      normalizedKind === 'interactive_prompt' ||
      normalizedKind === 'permission_request' ||
      normalizedKind === 'compact_boundary'
    ) {
      lastActivityTimestamp = message.timestamp || lastActivityTimestamp;
      processItems.push({
        id: message.id,
        timestamp: message.timestamp,
        kind: normalizeProcessItemKind(normalizedKind),
        title: historicalProcessTitle(message, normalizedKind),
        body: toText(message.content ?? message.text),
        payload: buildHistoricalProcessPayload(message),
      });
      continue;
    }

    if (normalizedKind === 'session_status') {
      const record = normalizeRecord(message.content);
      const status = getRecordString(record, 'status') || getRecordString(record, 'text') || getRecordString(record, 'kind') || normalizedKind;
      const detail = getRecordString(record, 'detail') || message.text || null;
      const payload = Object.prototype.hasOwnProperty.call(record, 'payload') ? record.payload : message.content;
      lastActivityTimestamp = message.timestamp || lastActivityTimestamp;
      if (isTerminalSessionStatus(status)) {
        continue;
      }
      processItems.push({
        id: message.id,
        timestamp: message.timestamp,
        kind: 'session_status',
        title: historicalProcessTitle(message, normalizedKind),
        body: sessionStatusBody(status, detail, payload),
        tone: sessionStatusTone(status),
        payload,
      });
      continue;
    }

    if (normalizedKind === 'debug_ref') {
      const record = normalizeRecord(message.content);
      const label = getRecordString(record, 'label') || 'Debug Ref';
      const path = getRecordString(record, 'path') || null;
      const payload = Object.prototype.hasOwnProperty.call(record, 'payload') ? record.payload : message.content;
      lastActivityTimestamp = message.timestamp || lastActivityTimestamp;
      processItems.push({
        id: message.id,
        timestamp: message.timestamp,
        kind: 'debug_ref',
        title: historicalProcessTitle(message, normalizedKind),
        body: debugRefBody(label, path, payload) || '可查看调试日志引用',
        tone: 'neutral',
        payload,
      });
      continue;
    }

    if (message.role === 'assistant') {
      lastActivityTimestamp = message.timestamp || lastActivityTimestamp;
      if (pendingAssistantMessage) {
        pushAssistantNotice(processItems, pendingAssistantMessage);
        const responseMessage = toResponseMessage(pendingAssistantMessage, 'phase');
        if (responseMessage) {
          responseMessages.push(responseMessage);
        }
      }
      finalResponse = extractMessageText(message);
      pendingAssistantMessage = message;
    }
  }

  if (pendingAssistantMessage) {
    flush(pendingAssistantMessage, lastActivityTimestamp);
  } else if (currentUserMessage && processItems.length > 0) {
    const completedAt = lastActivityTimestamp || currentRunStartedAt || currentUserMessage.timestamp;
    cards.push({
      sessionId: currentUserMessage.sessionId || currentRunSessionId || '',
      anchorMessageId: currentUserMessage.id,
      cardStatus: 'completed',
      headline: '已完成',
      finalResponse,
      responseMessages,
      processItems,
      activeInteraction: null,
      startedAt: currentRunStartedAt || currentUserMessage.timestamp,
      updatedAt: completedAt,
      completedAt,
      defaultExpanded: false,
      source: 'official-history',
    });
  }

  return cards;
}

function groupEventsByRun(
  events: AgentRealtimeEvent[],
): Array<{ runId: string | null; events: AgentRealtimeEvent[] }> {
  const groups: Array<{ runId: string | null; events: AgentRealtimeEvent[] }> = [];
  const groupIndexByRunId = new Map<string, number>();

  for (const event of events) {
    const eventRunId = String(event.runId || '').trim() || null;

    if (eventRunId === null) {
      if (groups.length === 0) {
        groups.push({ runId: null, events: [event] });
      } else {
        groups[groups.length - 1].events.push(event);
      }
      continue;
    }

    const existingIndex = groupIndexByRunId.get(eventRunId);
    if (existingIndex != null) {
      groups[existingIndex].events.push(event);
      continue;
    }

    groupIndexByRunId.set(eventRunId, groups.length);
    groups.push({ runId: eventRunId, events: [event] });
  }

  return groups;
}

function processLiveRunCardEvents(
  groupEvents: AgentRealtimeEvent[],
): {
  processItems: RunCardProcessItem[];
  activeInteraction: RunCardInteraction | null;
  finalResponse: string;
  responseMessages: RunCardResponseMessage[];
  cardStatus: RunCard['cardStatus'];
  completedAt: string | null;
} {
  const processItems: RunCardProcessItem[] = [];
  let activeInteraction: RunCardInteraction | null = null;
  let finalResponse = '';
  let responseMessages: RunCardResponseMessage[] = [];
  let cardStatus: RunCard['cardStatus'] = 'running';
  let completedAt: string | null = null;

  for (const event of groupEvents) {
    if (event.type === 'sdk.message') {
      const kind = String(event.message.kind || '').trim();
      if (kind === 'assistant.message.delta') {
        finalResponse = appendResponseFragment(finalResponse, event.message.text ?? event.message.payload);
        responseMessages = [{
          id: event.id,
          timestamp: event.timestamp,
          kind: 'final',
          body: finalResponse,
        }];
        continue;
      }

      const liveProcessKind = kind === 'tool_result'
        ? 'notice'
        : normalizeProcessItemKind(kind);

      processItems.push({
        id: event.id,
        timestamp: event.timestamp,
        kind: liveProcessKind,
        title: liveProcessTitle(kind, event.message.toolName),
        body: toText(event.message.text || event.message.input || event.message.output || event.message.payload),
        payload: {
          input: event.message.input,
          output: event.message.output,
          payload: event.message.payload,
          text: event.message.text,
          toolName: event.message.toolName,
        },
      });
      continue;
    }

    if (event.type === 'interaction.required') {
      if (completedAt) {
        continue;
      }

      const interactionKind = normalizeInteractionKind(event.interaction.kind);
      activeInteraction = {
        requestId: event.requestId,
        kind: interactionKind,
        toolName: event.interaction.toolName,
        message: event.interaction.message,
        input: event.interaction.input,
        context: event.interaction.context,
        payload: event.interaction.payload,
      };
      cardStatus = 'waiting_for_input';
      processItems.push({
        id: event.id,
        timestamp: event.timestamp,
        kind: interactionKind,
        title: liveProcessTitle(interactionKind, event.interaction.toolName),
        body: toText(event.interaction.message || event.interaction.input || event.interaction.payload),
        tone: 'warning',
        payload: {
          input: event.interaction.input,
          context: event.interaction.context,
          payload: event.interaction.payload,
          message: event.interaction.message,
          toolName: event.interaction.toolName,
        },
      });
      continue;
    }

    if (event.type === 'interaction.resolved') {
      processItems.push({
        id: event.id,
        timestamp: event.timestamp,
        kind: 'notice',
        title: `Interaction Resolved · ${event.outcome}`,
        body: toText(event.message ?? event.outcome ?? event.payload),
        tone: 'success',
        payload: event.payload,
      });

      if (!completedAt && activeInteraction?.requestId === event.requestId) {
        activeInteraction = null;
        if (cardStatus === 'waiting_for_input') {
          cardStatus = 'running';
        }
      }

      continue;
    }

    if (event.type === 'session.status') {
      const nextStatus = normalizeLiveCardStatus(event.status);
      const body = sessionStatusBody(event.status, event.detail ?? null, event.payload);
      if (nextStatus) {
        cardStatus = nextStatus;
        completedAt = event.timestamp;
        activeInteraction = null;
        if (nextStatus === 'running') {
          processItems.push({
            id: event.id,
            timestamp: event.timestamp,
            kind: 'session_status',
            title: '会话状态',
            body: body || '会话状态已更新',
            tone: sessionStatusTone(event.status),
            payload: event.payload,
          });
        }
      } else {
        processItems.push({
          id: event.id,
          timestamp: event.timestamp,
          kind: 'session_status',
          title: '会话状态',
          body: body || '会话状态已更新',
          tone: sessionStatusTone(event.status),
          payload: event.payload,
        });
      }

      continue;
    }

    if (event.type === 'debug.ref') {
      processItems.push({
        id: event.id,
        timestamp: event.timestamp,
        kind: 'debug_ref',
        title: '调试引用',
        body: debugRefBody(event.ref.label, event.ref.path, event.payload) || '可查看调试日志引用',
        tone: 'neutral',
        payload: event.payload,
      });
    }
  }

  return {
    processItems,
    activeInteraction,
    finalResponse,
    responseMessages,
    cardStatus,
    completedAt,
  };
}

export function projectLiveRunCards({
  sessionId,
  anchoredUserMessages,
  events,
}: ProjectLiveRunCardsInput): RunCard[] {
  if (events.length === 0) {
    return [];
  }

  const eventGroups = groupEventsByRun(events);
  const cards: RunCard[] = [];

  for (const { runId: groupRunId, events: groupEvents } of eventGroups) {
    const anchor = pickAnchorMessage(anchoredUserMessages, groupEvents);
    if (!anchor) {
      continue;
    }

    const {
      processItems,
      activeInteraction,
      finalResponse,
      responseMessages,
      cardStatus,
      completedAt,
    } = processLiveRunCardEvents(groupEvents);

    cards.push({
      sessionId,
      anchorMessageId: anchor.messageId,
      cardStatus,
      headline: headlineForCardStatus(cardStatus),
      finalResponse,
      responseMessages,
      processItems,
      activeInteraction,
      startedAt: anchor.timestamp,
      updatedAt: groupEvents[groupEvents.length - 1]?.timestamp || anchor.timestamp,
      completedAt,
      defaultExpanded: true,
      source: 'sdk-live',
      runId: groupRunId,
    });
  }

  return cards;
}
