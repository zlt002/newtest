/**
 * Message normalization utilities.
 * Converts NormalizedMessage[] from the session store into ChatMessage[] for the UI.
 */

import type { NormalizedMessage } from '../../stores/useSessionStore.ts';
import type {
  ChatMessage,
  OrchestrationState,
  ProcessTimelineEvent,
  SubagentChildTool,
  SubagentProgressState,
  TaskUsageStats,
} from '../../components/chat/types/types.ts';
import { decodeHtmlEntities, unescapeWithMathProtection, formatUsageLimitText } from '../../components/chat/utils/chatFormatting.ts';
import {
  isExpandedSkillPromptContent,
  isProtocolOnlyContent,
  sanitizeDisplayText,
  stripRawProtocolNoise,
} from '../../components/chat/utils/protocolNoise.ts';
import { buildChatMessageIdentity } from './chatMessagePresentation.ts';

function buildResultMessageContent(msg: NormalizedMessage) {
  const parts: string[] = [];
  const baseContent = String(msg.content || '').trim();

  if (baseContent) {
    parts.push(baseContent);
  }

  return parts.join('\n\n').trim();
}

function buildCompactNotification(msg: NormalizedMessage) {
  switch (msg.kind) {
    case 'compact_boundary':
      return {
        content: `会话上下文已${msg.status === 'manual' ? '手动' : '自动'}压缩${msg.tokens ? `（压缩前约 ${msg.tokens} tokens）` : ''}`,
        status: 'compacted',
      };
    case 'task_started':
      return {
        content: msg.content || '后台任务已开始',
        status: msg.status || 'started',
      };
    case 'task_progress':
      return {
        content: msg.content || '后台任务进行中',
        status: msg.status || 'in_progress',
      };
    case 'files_persisted':
      return {
        content: msg.content || '文件持久化完成',
        status: msg.status || 'completed',
      };
    case 'tool_progress':
      return {
        content: msg.content || '工具执行中',
        status: msg.status || 'in_progress',
      };
    case 'tool_use_summary':
      return {
        content: msg.content || '工具执行完成',
        status: 'completed',
      };
    case 'prompt_suggestion':
      return {
        content: msg.content || 'Claude 给出了一条后续建议',
        status: 'suggestion',
      };
    default:
      return null;
  }
}

function buildControlNotification(msg: NormalizedMessage) {
  switch (msg.kind) {
    case 'permission_request': {
      const toolName = String(msg.toolName || '工具').trim();
      return {
        content: `等待权限确认：${toolName}`,
        status: 'waiting',
      };
    }
    case 'permission_cancelled': {
      const toolName = String(msg.toolName || '工具').trim();
      return {
        content: `权限请求已取消：${toolName}`,
        status: 'cancelled',
      };
    }
    case 'status': {
      const text = String(msg.text || '').trim();
      if (!text || text === 'token_budget') {
        return null;
      }

      return {
        content: text,
        status: 'in_progress',
      };
    }
    default:
      return null;
  }
}

function isInteractivePromptMessage(msg: NormalizedMessage) {
  return msg.kind === 'interactive_prompt';
}

function buildInteractivePromptContent(msg: NormalizedMessage) {
  const parts: string[] = [];

  if (typeof msg.content === 'string' && msg.content.trim()) {
    parts.push(msg.content.trim());
  }

  if (msg.input && typeof msg.input === 'object') {
    const input = msg.input as {
      question?: unknown;
      content?: unknown;
      questions?: Array<{ question?: unknown }>;
    };

    if (typeof input.content === 'string' && input.content.trim()) {
      parts.push(input.content.trim());
    }

    if (typeof input.question === 'string' && input.question.trim()) {
      parts.push(input.question.trim());
    }

    if (Array.isArray(input.questions)) {
      for (const question of input.questions) {
        const text = String(question?.question || '').trim();
        if (text) {
          parts.push(text);
        }
      }
    }
  }

  return parts.join('\n\n').trim();
}

function buildSdkStreamDeltaContent(msg: NormalizedMessage) {
  const payload = msg.sdkMessage?.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return '';
  }

  const event = (payload as { event?: unknown }).event;
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return '';
  }

  const delta = (event as { delta?: unknown }).delta;
  if (!delta || typeof delta !== 'object' || Array.isArray(delta)) {
    return '';
  }

  return String((delta as { text?: unknown }).text || '').trim();
}

function buildSdkResultMessage(msg: NormalizedMessage): NormalizedMessage {
  const payload = msg.sdkMessage?.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return msg;
  }

  const resultPayload = payload as {
    result?: unknown;
    subtype?: unknown;
    structured_output?: unknown;
  };

  return {
    ...msg,
    kind: 'result',
    content: typeof resultPayload.result === 'string'
      ? resultPayload.result
      : stringifyPreviewContent(resultPayload.result),
    resultSubtype: typeof resultPayload.subtype === 'string' ? resultPayload.subtype : msg.resultSubtype,
    structuredOutput: resultPayload.structured_output,
  };
}

function buildQuestionRequestPrompt(msg: NormalizedMessage): NormalizedMessage {
  return {
    ...msg,
    kind: 'interactive_prompt',
    input: {
      questions: Array.isArray(msg.questions) ? msg.questions : [],
    },
  };
}

function buildToolApprovalRequestMessage(msg: NormalizedMessage): NormalizedMessage {
  return {
    ...msg,
    kind: 'permission_request',
    input: msg.input,
  };
}

const AMBIGUOUS_EDIT_ERROR_PATTERN = /Found \d+ matches of the string to replace/i;
const EDIT_TOOLS = new Set(['Edit', 'ApplyPatch', 'Write', 'MultiEdit']);
function shouldSuppressProtocolOnlyAssistantText(content: string) {
  if (!String(content || '').trim()) {
    return true;
  }
  return isProtocolOnlyContent(content);
}

function isSdkImageAttachmentPlaceholderText(content: string) {
  const normalized = String(content || '').trim();
  if (!normalized) {
    return false;
  }

  return /^\[Image:\s*original\s+\d+x\d+,\s*displayed at\s+\d+x\d+\.\s*Multiply coordinates by\s+[\d.]+\s+to map to original image\.\]$/i.test(normalized);
}

function getToolFilePath(toolInput: unknown) {
  if (!toolInput || typeof toolInput !== 'object') {
    return '';
  }

  return String((toolInput as { file_path?: string }).file_path || '').trim();
}

function shouldHideAmbiguousEditError(msg: NormalizedMessage, successfulEditPaths: Set<string>) {
  if (msg.kind !== 'tool_use' || !EDIT_TOOLS.has(String(msg.toolName || ''))) {
    return false;
  }

  const filePath = getToolFilePath(msg.toolInput);
  if (!filePath || !successfulEditPaths.has(filePath)) {
    return false;
  }

  const toolResult = msg.toolResult;
  if (!toolResult?.isError) {
    return false;
  }

  return AMBIGUOUS_EDIT_ERROR_PATTERN.test(String(toolResult.content || ''));
}

function getAttachedToolResultMessage(
  msg: NormalizedMessage,
  toolResultMap: Map<string, NormalizedMessage>,
) {
  if (msg.toolResult) {
    return {
      content: String(msg.toolResult.content || ''),
      isError: Boolean(msg.toolResult.isError),
      toolUseResult: msg.toolResult.toolUseResult,
    };
  }

  if (msg.toolId) {
    const mapped = toolResultMap.get(msg.toolId);
    if (mapped) {
      return {
        content: typeof mapped.content === 'string' ? mapped.content : JSON.stringify(mapped.content),
        isError: Boolean(mapped.isError),
        toolUseResult: (mapped as any).toolUseResult,
      };
    }
  }

  return null;
}

function getToolInputFilePath(toolInput: unknown) {
  if (!toolInput || typeof toolInput !== 'object') {
    return '';
  }

  return String((toolInput as { file_path?: string }).file_path || '').trim();
}

function isMarkdownWriteToolUseMessage(message: NormalizedMessage | undefined) {
  if (!message || message.kind !== 'tool_use') {
    return false;
  }

  if (String(message.toolName || '') !== 'Write') {
    return false;
  }

  return /\.md(?:own)?$/i.test(getToolInputFilePath(message.toolInput));
}

function shouldSuppressDocumentPreface(messages: NormalizedMessage[], index: number) {
  const message = messages[index];
  if (!message || message.kind !== 'text' || message.role !== 'assistant') {
    return false;
  }

  const content = String(message.content || '').trim();
  if (!content || content.length > 80) {
    return false;
  }

  return isMarkdownWriteToolUseMessage(messages[index + 1]) || isMarkdownWriteToolUseMessage(messages[index + 2]);
}

function shouldSuppressAdjacentDuplicateAssistantText(converted: ChatMessage[], content: string) {
  const previous = converted[converted.length - 1];
  if (!previous || previous.type !== 'assistant' || previous.isToolUse || previous.isThinking) {
    return false;
  }

  return String(previous.content || '').trim() === content.trim();
}

function isFinalAssistantSummaryMessage(message: ChatMessage | undefined) {
  if (!message || message.type !== 'assistant') {
    return false;
  }

  return !message.isToolUse
    && !message.isThinking
    && !message.isTaskNotification
    && !message.isInteractivePrompt
    && !message.isOrchestrationCard;
}

function mergeResultUsageSummary(target: ChatMessage, msg: NormalizedMessage) {
  target.usageSummary = {
    totalCostUsd: typeof msg.totalCostUsd === 'number' ? msg.totalCostUsd : null,
    usage: msg.usage || null,
    modelUsage: msg.modelUsage || null,
  };
}

function getUsageStats(usage: unknown): TaskUsageStats | null {
  if (!usage || typeof usage !== 'object') {
    return null;
  }

  const data = usage as {
    total_tokens?: number;
    tool_uses?: number;
    duration_ms?: number;
  };

  const totalTokens = Number(data.total_tokens);
  const toolUses = Number(data.tool_uses);
  const durationMs = Number(data.duration_ms);

  const stats: TaskUsageStats = {};
  if (Number.isFinite(totalTokens)) stats.totalTokens = totalTokens;
  if (Number.isFinite(toolUses)) stats.toolUses = toolUses;
  if (Number.isFinite(durationMs)) stats.durationMs = durationMs;

  return Object.keys(stats).length > 0 ? stats : null;
}

const RECOVERABLE_SUBAGENT_WARNING_PATTERNS = [
  /Unable to verify if domain .* is safe to fetch/i,
  /Sibling tool call errored/i,
];

function stringifyPreviewContent(content: unknown): string {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (!trimmed) {
      return '';
    }

    try {
      const parsed: unknown = JSON.parse(trimmed);
      const normalized: string = stringifyPreviewContent(parsed);
      if (normalized) {
        return normalized;
      }
    } catch {
      // keep raw string when not JSON
    }

    return trimmed;
  }

  if (content == null) {
    return '';
  }

  if (typeof content === 'number' || typeof content === 'boolean') {
    return String(content);
  }

  if (Array.isArray(content)) {
    const textParts: string[] = content
      .map((item: unknown): string => {
        if (item && typeof item === 'object' && 'type' in item && (item as { type?: unknown }).type === 'text') {
          return String((item as { text?: unknown }).text || '').trim();
        }
        return stringifyPreviewContent(item);
      })
      .filter(Boolean);

    return textParts.join('\n').trim();
  }

  if (typeof content === 'object') {
    if ('type' in (content as Record<string, unknown>) && (content as { type?: unknown }).type === 'text') {
      return String((content as { text?: unknown }).text || '').trim();
    }
  }

  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

function getSubagentWarningText(message: NormalizedMessage) {
  const parts: string[] = [];

  if (typeof message.content === 'string' && message.content.trim()) {
    parts.push(message.content.trim());
  }

  if (Array.isArray(message.errors)) {
    for (const error of message.errors) {
      if (error && String(error).trim()) {
        parts.push(String(error).trim());
      }
    }
  }

  if (message.toolResult?.isError && message.toolResult.content !== undefined) {
    const preview = stringifyPreviewContent(message.toolResult.content);
    if (preview) {
      parts.push(preview);
    }
  }

  return parts.join('\n').trim();
}

function isRecoverableSubagentWarning(message: NormalizedMessage) {
  const text = getSubagentWarningText(message);
  if (!text) {
    return false;
  }

  return RECOVERABLE_SUBAGENT_WARNING_PATTERNS.some(pattern => pattern.test(text));
}

function addSubagentWarning(progress: SubagentProgressState, message: string) {
  const warnings = progress.warnings || (progress.warnings = []);
  if (warnings.some(warning => warning.kind === 'recoverable_tool_error' && warning.message === message)) {
    return;
  }
  warnings.push({
    kind: 'recoverable_tool_error',
    message,
  });
}

function getTaskTitleFromToolInput(toolInput: unknown) {
  if (!toolInput || typeof toolInput !== 'object') {
    return '';
  }

  const input = toolInput as {
    description?: unknown;
    title?: unknown;
    prompt?: unknown;
  };

  return String(input.description || input.title || input.prompt || '').trim();
}

function buildOrchestrationState(messages: NormalizedMessage[], index: number): OrchestrationState | null {
  const current = messages[index];
  if (!current || current.kind !== 'text' || current.role !== 'assistant') {
    return null;
  }

  const taskTitles: string[] = [];
  for (let nextIndex = index + 1; nextIndex < messages.length; nextIndex += 1) {
    const nextMessage = messages[nextIndex];
    if (!nextMessage || nextMessage.kind !== 'tool_use' || String(nextMessage.toolName || '') !== 'Task') {
      break;
    }

    const title = getTaskTitleFromToolInput(nextMessage.toolInput) || `Task ${taskTitles.length + 1}`;
    taskTitles.push(title);
  }

  if (taskTitles.length === 0) {
    return null;
  }

  const summary = String(current.content || '').trim();
  if (!summary) {
    return null;
  }

  return {
    summary,
    taskTitles,
  };
}

function buildSubagentProgressMap(messages: NormalizedMessage[]) {
  const byParentToolId = new Map<string, SubagentProgressState>();

  const getProgress = (parentToolId: string) => {
    let existing = byParentToolId.get(parentToolId);
    if (!existing) {
      existing = {};
      byParentToolId.set(parentToolId, existing);
    }
    if (!existing.timeline) {
      existing.timeline = [];
    }
    return existing;
  };

  const pushTimeline = (progress: SubagentProgressState, event: ProcessTimelineEvent) => {
    const timeline = progress.timeline || (progress.timeline = []);
    timeline.push(event);
    if (timeline.length > 8) {
      progress.timeline = timeline.slice(-8);
    }
  };

  for (const message of messages) {
    const parentToolId = String(message.parentToolUseId || message.toolId || '').trim();
    if (!parentToolId) {
      continue;
    }

    if (message.kind === 'text' && message.role === 'assistant') {
      const progress = getProgress(parentToolId);
      progress.status = progress.status || 'in_progress';
      pushTimeline(progress, {
        kind: 'subagent_text',
        label: buildSubagentTextTimelineLabel(message.content),
        timestamp: message.timestamp,
      });
      continue;
    }

    if (message.kind === 'thinking') {
      const progress = getProgress(parentToolId);
      progress.status = progress.status || 'in_progress';
      pushTimeline(progress, {
        kind: 'subagent_thinking',
        label: '子代理思考中',
        timestamp: message.timestamp,
        status: 'in_progress',
      });
      continue;
    }

    if (message.kind === 'tool_use' && String(message.toolName || '') !== 'Task') {
      if (message.toolResult?.isError && isRecoverableSubagentWarning(message)) {
        const progress = getProgress(parentToolId);
        addSubagentWarning(progress, getSubagentWarningText(message));
      }
      continue;
    }

    if (message.kind === 'tool_result' && message.isError && isRecoverableSubagentWarning(message)) {
      const progress = getProgress(parentToolId);
      addSubagentWarning(progress, getSubagentWarningText(message));
      continue;
    }

    if (message.kind === 'error') {
      if (isRecoverableSubagentWarning(message)) {
        const progress = getProgress(parentToolId);
        addSubagentWarning(progress, getSubagentWarningText(message));
      }
      continue;
    }

    if (message.kind === 'tool_progress') {
      const progress = getProgress(parentToolId);
      progress.currentToolName = message.toolName || progress.currentToolName;
      progress.elapsedTimeSeconds = typeof message.elapsedTimeSeconds === 'number'
        ? message.elapsedTimeSeconds
        : progress.elapsedTimeSeconds;
      progress.status = message.status || progress.status || 'in_progress';
      if (message.taskId) {
        progress.taskId = message.taskId;
      }
      pushTimeline(progress, {
        kind: 'tool_progress',
        label: message.content || `${message.toolName || '工具'} 运行中`,
        timestamp: message.timestamp,
        status: message.status,
      });
      continue;
    }

    if (message.kind === 'task_started' || message.kind === 'task_progress' || message.kind === 'task_notification') {
      const progress = getProgress(parentToolId);
      progress.status = message.status || progress.status;
      if (message.taskId) {
        progress.taskId = message.taskId;
      }
      if (message.lastToolName) {
        progress.lastToolName = message.lastToolName;
      }
      const usage = getUsageStats(message.usage);
      if (usage) {
        progress.usage = usage;
      }
      if (message.outputFile) {
        progress.outputFile = message.outputFile;
      }
      pushTimeline(progress, {
        kind: message.kind,
        label: message.content || message.summary || message.status || message.kind,
        timestamp: message.timestamp,
        status: message.status,
      });
      continue;
    }

    if (message.kind === 'tool_use_summary') {
      const progress = getProgress(parentToolId);
      pushTimeline(progress, {
        kind: 'tool_use_summary',
        label: message.content || '工具使用摘要',
        timestamp: message.timestamp,
      });
    }
  }

  return byParentToolId;
}

function buildSubagentChildToolsMap(messages: NormalizedMessage[]) {
  const byParentToolId = new Map<string, SubagentChildTool[]>();
  const childToolIndex = new Map<string, SubagentChildTool>();

  const getBucket = (parentToolId: string) => {
    let bucket = byParentToolId.get(parentToolId);
    if (!bucket) {
      bucket = [];
      byParentToolId.set(parentToolId, bucket);
    }
    return bucket;
  };

  for (const message of messages) {
    const parentToolId = String(message.parentToolUseId || '').trim();
    if (!parentToolId) {
      continue;
    }

    if (message.kind === 'tool_use' && String(message.toolName || '') !== 'Task') {
      const childTool: SubagentChildTool = {
        toolId: String(message.toolId || message.id),
        toolName: String(message.toolName || 'UnknownTool'),
        toolInput: message.toolInput,
        toolResult: message.toolResult || null,
        timestamp: new Date(message.timestamp || Date.now()),
      };
      getBucket(parentToolId).push(childTool);
      childToolIndex.set(childTool.toolId, childTool);
      continue;
    }

    if (message.kind === 'tool_result' && message.toolId) {
      const existing = childToolIndex.get(String(message.toolId));
      if (existing) {
        existing.toolResult = {
          content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
          isError: Boolean(message.isError),
        };
      }
    }
  }

  return byParentToolId;
}

function buildSubagentTaskToolIds(messages: NormalizedMessage[]) {
  const taskToolIds = new Set<string>();
  for (const message of messages) {
    if (message.kind === 'tool_use' && String(message.toolName || '') === 'Task' && message.toolId) {
      taskToolIds.add(String(message.toolId));
    }
  }
  return taskToolIds;
}

function isTaskSubagentMessage(message: NormalizedMessage, subagentTaskToolIds: Set<string>) {
  if (!subagentTaskToolIds.size) {
    return false;
  }

  const parentToolUseId = String(message.parentToolUseId || '').trim();
  return Boolean(parentToolUseId) && subagentTaskToolIds.has(parentToolUseId);
}

function shouldSuppressSubagentNotification(message: NormalizedMessage, subagentTaskToolIds: Set<string>) {
  if (!isTaskSubagentMessage(message, subagentTaskToolIds)) {
    return false;
  }

  return message.kind === 'task_started'
    || message.kind === 'task_progress'
    || message.kind === 'task_notification'
    || message.kind === 'tool_use'
    || message.kind === 'tool_result'
    || message.kind === 'tool_progress'
    || message.kind === 'tool_use_summary';
}

function buildSubagentTextTimelineLabel(content: unknown) {
  const text = formatUsageLimitText(
    unescapeWithMathProtection(
      decodeHtmlEntities(String(content || '')),
    ),
  )
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) {
    return '子代理输出更新';
  }

  return text.length > 120 ? `${text.slice(0, 117)}...` : text;
}

function buildAggregationStatus(messages: NormalizedMessage[], toolResultMap: Map<string, NormalizedMessage>) {
  const rootTaskEntries: Array<{ index: number; timestamp: string | number | Date }> = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.kind !== 'tool_use' || String(message.toolName || '') !== 'Task') {
      continue;
    }

    if (String(message.parentToolUseId || '').trim()) {
      continue;
    }

    const taskResult = getAttachedToolResultMessage(message, toolResultMap);
    if (!taskResult) {
      return null;
    }

    rootTaskEntries.push({
      index,
      timestamp: message.timestamp,
    });
  }

  if (rootTaskEntries.length === 0) {
    return null;
  }

  if (rootTaskEntries.length < 2) {
    return null;
  }

  const lastTaskIndex = rootTaskEntries[rootTaskEntries.length - 1].index;

  for (let index = lastTaskIndex + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (String(message.parentToolUseId || '').trim()) {
      continue;
    }

    if (message.kind === 'thinking') {
      continue;
    }

    if (message.kind === 'text' && message.role === 'assistant' && String(message.content || '').trim()) {
      return null;
    }

    if (message.kind === 'result') {
      return null;
    }

    if (message.kind === 'stream_delta' && String(message.content || '').trim()) {
      return null;
    }

    if (message.kind === 'error' || message.kind === 'auth_status' || message.kind === 'rate_limit') {
      return null;
    }
  }

  return {
    insertAfterIndex: lastTaskIndex,
    timestamp: rootTaskEntries[rootTaskEntries.length - 1].timestamp,
    completedTaskCount: rootTaskEntries.length,
    totalTaskCount: rootTaskEntries.length,
  };
}

/**
 * Convert NormalizedMessage[] from the session store into ChatMessage[]
 * that the existing UI components expect.
 *
 * Internal/system content (e.g. <system-reminder>, <command-name>) is already
 * filtered server-side by the Claude adapter (server/providers/utils.js).
 */
export function normalizedToChatMessages(
  messages: NormalizedMessage[],
  options: { suppressInStreamDecisions?: boolean } = {},
): ChatMessage[] {
  const converted: ChatMessage[] = [];
  const suppressInStreamDecisions = options.suppressInStreamDecisions === true;
  const successfulEditPaths = new Set<string>();
  const subagentProgressByParent = buildSubagentProgressMap(messages);
  const subagentChildToolsByParent = buildSubagentChildToolsMap(messages);
  const subagentTaskToolIds = buildSubagentTaskToolIds(messages);
  const cancelledPermissionRequestIds = new Set<string>();
  const permissionToolNameByRequestId = new Map<string, string>();

  // First pass: collect tool results for attachment
  const toolResultMap = new Map<string, NormalizedMessage>();
  for (const msg of messages) {
    if (msg.kind === 'tool_result' && msg.toolId) {
      toolResultMap.set(msg.toolId, msg);
    }

    if (msg.kind === 'tool_use' && EDIT_TOOLS.has(String(msg.toolName || ''))) {
      const filePath = getToolFilePath(msg.toolInput);
      const attachedToolResult = getAttachedToolResultMessage(msg, toolResultMap);
      if (filePath && attachedToolResult && !attachedToolResult.isError) {
        successfulEditPaths.add(filePath);
      }
    }

    if ((msg.kind === 'permission_request' || msg.kind === 'interactive_prompt') && msg.requestId) {
      permissionToolNameByRequestId.set(String(msg.requestId), String(msg.toolName || '').trim());
    }

    if (msg.kind === 'permission_cancelled' && msg.requestId) {
      cancelledPermissionRequestIds.add(String(msg.requestId));
    }
  }

  const aggregationStatus = buildAggregationStatus(messages, toolResultMap);

  for (let index = 0; index < messages.length; index += 1) {
    const msg = messages[index];
    switch (msg.kind) {
      case 'text': {
        const content = msg.content || '';
        if (!content.trim()) continue;

        if (msg.role !== 'user' && msg.role !== 'assistant') {
          break;
        }

        if (isTaskSubagentMessage(msg, subagentTaskToolIds)) {
          break;
        }

        if (shouldSuppressProtocolOnlyAssistantText(content)) {
          break;
        }

        if (msg.role === 'user') {
          if (isExpandedSkillPromptContent(content)) {
            break;
          }
          const sanitizedUserText = sanitizeDisplayText(
            unescapeWithMathProtection(decodeHtmlEntities(content)),
          );
          if (!sanitizedUserText || isSdkImageAttachmentPlaceholderText(sanitizedUserText)) {
            break;
          }
          converted.push({
            ...buildChatMessageIdentity(msg),
            type: 'user',
            content: sanitizedUserText,
            images: Array.isArray(msg.images) ? msg.images : [],
            timestamp: msg.timestamp,
            normalizedKind: 'text',
          });
        } else {
          if (shouldSuppressDocumentPreface(messages, index)) {
            continue;
          }
          let text = decodeHtmlEntities(content);
          text = unescapeWithMathProtection(text);
          text = stripRawProtocolNoise(text);
          text = formatUsageLimitText(text);
          if (shouldSuppressProtocolOnlyAssistantText(text)) {
            continue;
          }
          if (shouldSuppressAdjacentDuplicateAssistantText(converted, text)) {
            continue;
          }
          const orchestrationState = buildOrchestrationState(messages, index);
          converted.push({
            ...buildChatMessageIdentity(msg),
            type: 'assistant',
            content: text,
            timestamp: msg.timestamp,
            normalizedKind: 'text',
            ...(orchestrationState
              ? {
                  isOrchestrationCard: true,
                  orchestrationState,
                }
              : {}),
          });
        }
        break;
      }

      case 'tool_use': {
        if (String(msg.toolName || '') !== 'Task' && shouldSuppressSubagentNotification(msg, subagentTaskToolIds)) {
          break;
        }
        const tr = getAttachedToolResultMessage(msg, toolResultMap);
        const isSubagentContainer = msg.toolName === 'Task';

        // Build child tools from subagentTools
        const childTools: SubagentChildTool[] = [];
        if (isSubagentContainer && msg.subagentTools && Array.isArray(msg.subagentTools)) {
          for (const tool of msg.subagentTools as any[]) {
            childTools.push({
              toolId: tool.toolId,
              toolName: tool.toolName,
              toolInput: tool.toolInput,
              toolResult: tool.toolResult || null,
              timestamp: new Date(tool.timestamp || Date.now()),
            });
          }
        }
        if (isSubagentContainer && msg.toolId && subagentChildToolsByParent.has(msg.toolId)) {
          const realtimeChildTools = subagentChildToolsByParent.get(msg.toolId) || [];
          for (const tool of realtimeChildTools) {
            if (!childTools.some(existing => existing.toolId === tool.toolId)) {
              childTools.push(tool);
            }
          }
        }

        const toolResult = tr
          ? (() => {
              const hideInUi = shouldHideAmbiguousEditError(
                {
                  ...msg,
                  toolResult: tr,
                },
                successfulEditPaths,
              );

              return {
                content: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content),
                isError: Boolean(tr.isError),
                toolUseResult: (tr as any).toolUseResult,
                ...(hideInUi ? { hideInUi: true } : {}),
              };
            })()
          : null;

        let progress = msg.toolId ? (subagentProgressByParent.get(msg.toolId) || null) : null;
        if (isSubagentContainer) {
          const resultPreview = tr && tr.isError !== true ? stringifyPreviewContent(tr.content ?? null) : '';
          if (resultPreview) {
            if (progress) {
              progress.resultPreview = resultPreview;
            } else {
              progress = {
                resultPreview,
              };
            }
          }
        }

        converted.push({
          ...buildChatMessageIdentity(msg),
          type: 'assistant',
          content: '',
          timestamp: msg.timestamp,
          isToolUse: true,
          toolName: msg.toolName,
          toolInput: typeof msg.toolInput === 'string' ? msg.toolInput : JSON.stringify(msg.toolInput ?? '', null, 2),
          toolId: msg.toolId,
          normalizedKind: 'tool_use',
          toolResult,
          isSubagentContainer,
          subagentState: isSubagentContainer
            ? {
                childTools,
                currentToolIndex: childTools.length > 0 ? childTools.length - 1 : -1,
                isComplete: Boolean(toolResult),
                progress,
            }
            : undefined,
        });
        break;
      }

      case 'thinking':
        if (isTaskSubagentMessage(msg, subagentTaskToolIds)) {
          break;
        }
        if (aggregationStatus && index > aggregationStatus.insertAfterIndex) {
          break;
        }
        if (msg.content?.trim()) {
          converted.push({
            ...buildChatMessageIdentity(msg),
            type: 'assistant',
            content: unescapeWithMathProtection(msg.content),
            timestamp: msg.timestamp,
            normalizedKind: 'thinking',
            isThinking: true,
          });
        }
        break;

      case 'error':
        if (shouldSuppressSubagentNotification(msg, subagentTaskToolIds)) {
          break;
        }
        if (subagentTaskToolIds.has(String(msg.parentToolUseId || '').trim()) && isRecoverableSubagentWarning(msg)) {
          break;
        }
        converted.push({
          ...buildChatMessageIdentity(msg),
          type: 'error',
          content: msg.content || 'Unknown error',
          timestamp: msg.timestamp,
          normalizedKind: 'error',
        });
        break;

      case 'task_notification':
        if (shouldSuppressSubagentNotification(msg, subagentTaskToolIds)) {
          break;
        }
        if (!sanitizeDisplayText(msg.summary || '')) {
          break;
        }
        converted.push({
          ...buildChatMessageIdentity(msg),
          type: 'assistant',
          content: sanitizeDisplayText(msg.summary || '', 'Background task update'),
          timestamp: msg.timestamp,
          normalizedKind: 'task_notification',
          isTaskNotification: true,
          taskStatus: msg.status || 'completed',
        });
        break;

      case 'result': {
        const content = buildResultMessageContent(msg);
        if (msg.isError) {
          const errorContent = (msg.errors || []).filter(Boolean).join('\n') || content || 'Claude 执行失败';
          converted.push({
            ...buildChatMessageIdentity(msg),
            type: 'error',
            content: errorContent,
            timestamp: msg.timestamp,
            normalizedKind: 'result',
          });
          break;
        }

        const previous = converted[converted.length - 1];
        const previousContent = typeof previous?.content === 'string' ? previous.content.trim() : '';
        if (isFinalAssistantSummaryMessage(previous) && (!content || previousContent === content.trim())) {
          mergeResultUsageSummary(previous, msg);
          break;
        }

        if (!content) {
          break;
        }

        if (shouldSuppressProtocolOnlyAssistantText(content)) {
          break;
        }

        converted.push({
          ...buildChatMessageIdentity(msg),
          type: 'assistant',
          content,
          timestamp: msg.timestamp,
          normalizedKind: 'result',
          structuredOutput: msg.structuredOutput,
          usageSummary: {
            totalCostUsd: typeof msg.totalCostUsd === 'number' ? msg.totalCostUsd : null,
            usage: msg.usage || null,
            modelUsage: msg.modelUsage || null,
          },
        });
        break;
      }

      case 'compact_boundary':
      case 'task_started':
      case 'task_progress':
      case 'files_persisted':
      case 'tool_progress':
      case 'tool_use_summary':
      case 'prompt_suggestion': {
        if (shouldSuppressSubagentNotification(msg, subagentTaskToolIds)) {
          break;
        }
        const notification = buildCompactNotification(msg);
        if (!notification) {
          break;
        }
        converted.push({
          ...buildChatMessageIdentity(msg),
          type: 'assistant',
          content: notification.content,
          timestamp: msg.timestamp,
          normalizedKind: msg.kind,
          isTaskNotification: true,
          taskStatus: notification.status,
        });
        break;
      }

      case 'auth_status': {
        const content = ((msg.errors || []).filter(Boolean).join('\n') || msg.content || '').trim();
        if (!content) break;
        converted.push({
          ...buildChatMessageIdentity(msg),
          type: msg.isError ? 'error' : 'assistant',
          content,
          timestamp: msg.timestamp,
          normalizedKind: 'auth_status',
        });
        break;
      }

      case 'rate_limit':
      case 'hook_response': {
        const content = ((msg.errors || []).filter(Boolean).join('\n') || msg.content || '').trim();
        if (!content) break;
        converted.push({
          ...buildChatMessageIdentity(msg),
          type: msg.isError ? 'error' : 'assistant',
          content,
          timestamp: msg.timestamp,
          normalizedKind: msg.kind,
        });
        break;
      }

      case 'hook_started':
      case 'hook_progress':
        if (msg.content?.trim()) {
          converted.push({
            ...buildChatMessageIdentity(msg),
            type: 'assistant',
            content: msg.content,
            timestamp: msg.timestamp,
            normalizedKind: msg.kind,
            isTaskNotification: true,
            taskStatus: msg.status || 'in_progress',
          });
        }
        break;

      case 'stream_delta':
        if (isTaskSubagentMessage(msg, subagentTaskToolIds)) {
          break;
        }
        if (msg.content) {
          converted.push({
            ...buildChatMessageIdentity(msg),
            type: 'assistant',
            content: msg.content,
            timestamp: msg.timestamp,
            normalizedKind: 'stream_delta',
            isStreaming: true,
          });
        }
        break;

      case 'tool_result':
        if (shouldSuppressSubagentNotification(msg, subagentTaskToolIds)) {
          break;
        }
        break;

      case 'agent_sdk_message':
        if (msg.sdkMessage?.sdkType === 'stream_event') {
          const content = buildSdkStreamDeltaContent(msg);
          if (!content || isTaskSubagentMessage(msg, subagentTaskToolIds)) {
            break;
          }
          converted.push({
            ...buildChatMessageIdentity(msg),
            type: 'assistant',
            content,
            timestamp: msg.timestamp,
            normalizedKind: 'stream_delta',
            isStreaming: true,
          });
          break;
        }

        if (msg.sdkMessage?.sdkType === 'result') {
          const resultMessage = buildSdkResultMessage(msg);
          const content = buildResultMessageContent(resultMessage);
          if (!content) {
            break;
          }
          converted.push({
            ...buildChatMessageIdentity(resultMessage),
            type: 'assistant',
            content,
            timestamp: resultMessage.timestamp,
            normalizedKind: 'result',
            structuredOutput: resultMessage.structuredOutput,
            usageSummary: {
              totalCostUsd: typeof resultMessage.totalCostUsd === 'number' ? resultMessage.totalCostUsd : null,
              usage: resultMessage.usage || null,
              modelUsage: resultMessage.modelUsage || null,
            },
          });
        }
        break;

      case 'question_request': {
        const promptMessage = buildQuestionRequestPrompt(msg);
        const content = buildInteractivePromptContent(promptMessage);
        if (!content) {
          break;
        }

        converted.push({
          ...buildChatMessageIdentity(promptMessage),
          type: 'assistant',
          content,
          timestamp: promptMessage.timestamp,
          normalizedKind: 'interactive_prompt',
          isInteractivePrompt: true,
        });
        break;
      }

      case 'tool_approval_request': {
        const approvalMessage = buildToolApprovalRequestMessage(msg);
        const notification = buildControlNotification(approvalMessage);
        if (!notification) {
          break;
        }

        converted.push({
          ...buildChatMessageIdentity(approvalMessage),
          type: 'assistant',
          content: notification.content,
          timestamp: approvalMessage.timestamp,
          normalizedKind: 'permission_request',
          isTaskNotification: true,
          taskStatus: notification.status,
        });
        break;
      }

      // Legacy transcript-only terminal marker.
      // Current V2 execution state is derived from agent events, so this stays non-rendered.
      case 'complete':
        break;

      case 'status':
      case 'permission_request':
      case 'interactive_prompt':
      case 'permission_cancelled': {
        if (
          suppressInStreamDecisions
          && (
            msg.kind === 'permission_request'
            || msg.kind === 'interactive_prompt'
            || msg.kind === 'permission_cancelled'
          )
        ) {
          break;
        }

        if (msg.kind === 'permission_request' && msg.requestId && cancelledPermissionRequestIds.has(String(msg.requestId))) {
          break;
        }

        if (isInteractivePromptMessage(msg)) {
          const content = buildInteractivePromptContent(msg);
          if (!content) {
            break;
          }

          converted.push({
            ...buildChatMessageIdentity(msg),
            type: 'assistant',
            content,
            timestamp: msg.timestamp,
            normalizedKind: 'interactive_prompt',
            isInteractivePrompt: true,
          });
          break;
        }

        const normalizedMessage = msg.kind === 'permission_cancelled'
          ? {
              ...msg,
              toolName: msg.toolName || permissionToolNameByRequestId.get(String(msg.requestId || '')) || '工具',
            }
          : msg;

        const notification = buildControlNotification(normalizedMessage);
        if (!notification) {
          break;
        }
        converted.push({
          ...buildChatMessageIdentity(normalizedMessage),
          type: 'assistant',
          content: notification.content,
          timestamp: normalizedMessage.timestamp,
          normalizedKind: normalizedMessage.kind as ChatMessage['normalizedKind'],
          isTaskNotification: true,
          taskStatus: notification.status,
        });
        break;
      }

      // Control / process-only records stay out of the plain chat bubble projection.
      case 'stream_end':
      case 'session_created':
      case 'session_status':
      case 'debug_ref':
        // Skip — these are consumed by lifecycle / run-card projections instead.
        break;

      default:
        break;
    }

    if (aggregationStatus && index === aggregationStatus.insertAfterIndex) {
      converted.push({
        type: 'assistant',
        content: `${aggregationStatus.completedTaskCount}/${aggregationStatus.totalTaskCount} 子代理已完成，正在汇总最终结果`,
        timestamp: aggregationStatus.timestamp,
        normalizedKind: 'task_progress',
        isTaskNotification: true,
        taskStatus: 'in_progress',
      });
    }
  }

  return converted;
}
