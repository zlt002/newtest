import type { NormalizedMessage } from '@stores/useSessionStore';
import type { FileDraftPreviewOperation } from '@components/code-editor/types/types';
import type { FileChangeLineRange } from './chatFileChangeEvents';

type DraftPreviewToolName = 'Edit' | 'Write';

export type DraftPreviewEvent =
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

const SUPPORTED_DRAFT_TOOLS = new Set<DraftPreviewToolName>(['Edit', 'Write']);

function isDraftPreviewToolName(toolName: unknown): toolName is DraftPreviewToolName {
  return SUPPORTED_DRAFT_TOOLS.has(String(toolName) as DraftPreviewToolName);
}

function normalizeToolInput(toolInput: unknown): Record<string, unknown> {
  if (!toolInput) {
    return {};
  }

  if (typeof toolInput === 'string') {
    const trimmed = toolInput.trim();
    if (!trimmed) {
      return {};
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return {};
    }
  }

  if (typeof toolInput === 'object' && !Array.isArray(toolInput)) {
    return toolInput as Record<string, unknown>;
  }

  return {};
}

function getFilePath(toolInput: unknown) {
  const input = normalizeToolInput(toolInput);
  return String(input.file_path ?? input.filePath ?? input.path ?? '').trim();
}

function getLineRange(toolInput: unknown): FileChangeLineRange | null | undefined {
  const input = normalizeToolInput(toolInput);
  const candidate = input.lineRange ?? input.line_range ?? input.range;

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return undefined;
  }

  const startLine = Number((candidate as Record<string, unknown>).startLine ?? (candidate as Record<string, unknown>).start_line ?? (candidate as Record<string, unknown>).start);
  const endLine = Number((candidate as Record<string, unknown>).endLine ?? (candidate as Record<string, unknown>).end_line ?? (candidate as Record<string, unknown>).end);

  if (!Number.isFinite(startLine) || !Number.isFinite(endLine)) {
    return undefined;
  }

  return { startLine, endLine };
}

function getToolId(message: Pick<NormalizedMessage, 'toolId' | 'id'>) {
  return String(message.toolId || message.id || '').trim();
}

function buildDraftOperation(message: NormalizedMessage): FileDraftPreviewOperation | null {
  if ((message.kind !== 'tool_use' && message.kind !== 'tool_use_partial') || !isDraftPreviewToolName(message.toolName)) {
    return null;
  }

  const input = normalizeToolInput(message.toolInput);
  const filePath = getFilePath(message.toolInput);
  const toolId = getToolId(message);
  const sessionId = String(message.sessionId || '').trim();
  const timestamp = String(message.timestamp || '').trim();

  if (!sessionId || !toolId || !filePath || !timestamp) {
    return null;
  }

  if (message.toolName === 'Write') {
    const newText = String(input.content ?? '');
    if (!newText) {
      return null;
    }

    return {
      toolId,
      filePath,
      timestamp,
      source: 'Write',
      mode: 'write',
      newText,
      status: 'pending',
      lineRange: getLineRange(message.toolInput) ?? null,
    };
  }

  const oldText = String(input.old_string ?? '');
  const newText = String(input.new_string ?? '');
  if (!oldText && !newText) {
    return null;
  }

  return {
    toolId,
    filePath,
    timestamp,
    source: 'Edit',
    mode: 'replace',
    oldText,
    newText,
    replaceAll: Boolean(input.replace_all),
    status: 'pending',
    lineRange: getLineRange(message.toolInput) ?? null,
  };
}

function getToolResultById(messages: NormalizedMessage[]) {
  const map = new Map<string, NormalizedMessage>();

  for (const message of messages) {
    if (message.kind !== 'tool_result') {
      continue;
    }

    const toolId = getToolId(message);
    if (toolId) {
      map.set(toolId, message);
    }
  }

  return map;
}

export function createDraftPreviewEventKey(event: DraftPreviewEvent) {
  return [
    event.type,
    event.sessionId,
    event.toolId,
    event.filePath,
    event.timestamp,
  ].join('::');
}

export function collectUnseenDraftPreviewEvents(
  messages: NormalizedMessage[],
  emittedKeys: Set<string>,
): DraftPreviewEvent[] {
  const toolResultById = getToolResultById(messages);
  const nextEvents: DraftPreviewEvent[] = [];

  for (const message of messages) {
    const operation = buildDraftOperation(message);
    if (!operation) {
      continue;
    }

    const deltaEvent: DraftPreviewEvent = {
      type: 'file_change_preview_delta',
      sessionId: message.sessionId,
      toolId: operation.toolId,
      filePath: operation.filePath,
      timestamp: operation.timestamp,
      operation,
    };

    const deltaKey = createDraftPreviewEventKey(deltaEvent);
    if (!emittedKeys.has(deltaKey)) {
      emittedKeys.add(deltaKey);
      nextEvents.push(deltaEvent);
    }

    const toolResult = toolResultById.get(operation.toolId);
    if (!toolResult) {
      continue;
    }

    const followupEvent: DraftPreviewEvent = toolResult.isError
      ? {
          type: 'file_change_preview_discarded',
          sessionId: message.sessionId,
          toolId: operation.toolId,
          filePath: operation.filePath,
          timestamp: String(toolResult.timestamp || message.timestamp),
          error: String(toolResult.content || '').trim(),
        }
      : {
          type: 'file_change_preview_committed',
          sessionId: message.sessionId,
          toolId: operation.toolId,
          filePath: operation.filePath,
          timestamp: String(toolResult.timestamp || message.timestamp),
        };

    const followupKey = createDraftPreviewEventKey(followupEvent);
    if (!emittedKeys.has(followupKey)) {
      emittedKeys.add(followupKey);
      nextEvents.push(followupEvent);
    }
  }

  return nextEvents;
}
