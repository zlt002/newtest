import type { CanonicalSessionMessage } from '../types/sessionHistory.ts';
import type { AssistantTurn } from '../types/assistantTurn.ts';
import type { InlineRuntimeActivityLine } from './projectInlineRuntimeActivity.ts';

function normalizeRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  return input as Record<string, unknown>;
}

function normalizeContentBlocks(content: unknown): Record<string, unknown>[] {
  if (!Array.isArray(content)) {
    return [];
  }

  return content
    .filter((block) => block && typeof block === 'object' && !Array.isArray(block))
    .map((block) => block as Record<string, unknown>);
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getMessageKind(message: CanonicalSessionMessage) {
  const kind = getString(message.kind);
  if (kind) {
    return kind;
  }

  return getString(message.type);
}

function extractAssistantText(message: CanonicalSessionMessage) {
  const directText = getString(message.text);
  if (directText) {
    return directText;
  }

  const textSegments = normalizeContentBlocks(message.content)
    .filter((block) => block.type === 'text' && typeof block.text === 'string' && block.text.trim())
    .map((block) => String(block.text).trim());

  return textSegments.join('\n').trim();
}

function summarizeToolUse(block: Record<string, unknown>) {
  const toolName = getString(block.name);
  return toolName ? `工具调用 · ${toolName}` : '工具调用';
}

function summarizeToolResult(block: Record<string, unknown>) {
  const toolName = getString(block.tool_name) || getString(block.toolName);
  const resultText = getString(block.content) || getString(block.result) || getString(block.output);
  if (toolName && resultText) {
    return `${toolName} 结果 · ${resultText}`;
  }
  if (toolName) {
    return `${toolName} 结果`;
  }
  if (resultText) {
    return `工具结果 · ${resultText}`;
  }
  return '工具结果';
}

function buildActivityLines(message: CanonicalSessionMessage): InlineRuntimeActivityLine[] {
  const lines: InlineRuntimeActivityLine[] = [];
  const messageKind = getMessageKind(message);
  const timestamp = message.timestamp || '';
  const messageId = message.id || 'history-message';
  const text = extractAssistantText(message);

  if (messageKind === 'compact_boundary') {
    lines.push({
      eventId: `history-${messageId}-compact`,
      timestamp,
      kind: 'system',
      label: 'history.compact_boundary',
      summary: '上下文已压缩，后续历史从压缩边界继续。',
    });
  }

  if (messageKind === 'resume_boundary') {
    lines.push({
      eventId: `history-${messageId}-resume`,
      timestamp,
      kind: 'system',
      label: 'history.resume_boundary',
      summary: '会话已恢复，继续沿用已有上下文。',
    });
  }

  for (const block of normalizeContentBlocks(message.content)) {
    if (block.type === 'tool_use') {
      lines.push({
        eventId: `history-${messageId}-tool-use-${lines.length}`,
        timestamp,
        kind: 'tool',
        label: 'history.tool_use',
        summary: summarizeToolUse(block),
      });
      continue;
    }

    if (block.type === 'tool_result') {
      lines.push({
        eventId: `history-${messageId}-tool-result-${lines.length}`,
        timestamp,
        kind: 'result',
        label: 'history.tool_result',
        summary: summarizeToolResult(block),
      });
    }
  }

  if (message.role === 'assistant' && text) {
    lines.push({
      eventId: `history-${messageId}-assistant`,
      timestamp,
      kind: 'assistant',
      label: 'history.assistant',
      summary: text,
    });
  } else if (message.role === 'tool' && text) {
    const detail = normalizeRecord(message.content);
    lines.push({
      eventId: `history-${messageId}-detail`,
      timestamp,
      kind: 'tool',
      label: `history.${messageKind || message.role || 'message'}`,
      summary: getString(detail.summary) || text,
    });
  }

  return lines;
}

function buildSummary(message: CanonicalSessionMessage) {
  const assistantText = extractAssistantText(message);
  return {
    status: 'completed',
    assistantText,
    error: null,
    failureSubtype: null,
    canStartNewSession: false,
    presentationMode: 'history' as const,
    events: [],
  };
}

export function projectOfficialSession(messages: CanonicalSessionMessage[]): AssistantTurn[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  const turns: AssistantTurn[] = [];
  let pendingActivity: InlineRuntimeActivityLine[] = [];
  let userMessageCount = 0;
  let lastSessionId = '';
  let pendingSeedId = 'history-tail';

  for (const message of messages) {
    if (message.sessionId) {
      lastSessionId = message.sessionId;
    }
    if (message.id) {
      pendingSeedId = `history-${message.id}`;
    }
    if (message.role === 'user') {
      userMessageCount += 1;
    }

    const activity = buildActivityLines(message);
    const assistantText = extractAssistantText(message);

    if (message.role === 'assistant' && assistantText) {
      turns.push({
        sessionId: message.sessionId || '',
        runId: `history-${message.id}`,
        anchorUserMessageIndex: userMessageCount > 0 ? userMessageCount - 1 : null,
        run: null,
        summary: buildSummary(message),
        activity: [...pendingActivity, ...activity],
        events: [],
      });
      pendingActivity = [];
      continue;
    }

    if (activity.length > 0) {
      pendingActivity = [...pendingActivity, ...activity];
    }
  }

  if (pendingActivity.length > 0) {
    if (userMessageCount > turns.length) {
      turns.push({
        sessionId: lastSessionId,
        runId: `${pendingSeedId}-pending`,
        anchorUserMessageIndex: userMessageCount > 0 ? userMessageCount - 1 : null,
        run: null,
        summary: {
          status: 'completed',
          assistantText: '',
          error: null,
          failureSubtype: null,
          canStartNewSession: false,
          presentationMode: 'history',
          events: [],
        },
        activity: pendingActivity,
        events: [],
      });
    } else if (turns.length > 0) {
      const lastTurn = turns[turns.length - 1];
      turns[turns.length - 1] = {
        ...lastTurn,
        activity: [...lastTurn.activity, ...pendingActivity],
      };
    }
  }

  return turns;
}
