import type { NormalizedMessage } from '@stores/useSessionStore';

export type FileChangeToolName = 'Edit' | 'Write' | 'ApplyPatch' | 'MultiEdit';

export type FileChangeLineRange = {
  startLine: number;
  endLine: number;
};

type FileChangeEventBase = {
  sessionId: string;
  toolId: string;
  filePath: string;
  source: FileChangeToolName;
  timestamp: string;
  lineRange?: FileChangeLineRange | null;
};

type FileResultLike = {
  content?: string;
  isError?: boolean;
} | null;

type FileResultState =
  | { kind: 'missing' }
  | { kind: 'success' }
  | { kind: 'error'; error: string };

export type FileChangeEvent =
  | (FileChangeEventBase & {
      type: 'file_change_started';
    })
  | (FileChangeEventBase & {
      type: 'file_change_applied';
    })
  | (FileChangeEventBase & {
      type: 'file_change_failed';
      error: string;
    })
  | (FileChangeEventBase & {
      type: 'focus_file_changed';
      reason: 'latest_edit';
    });

const FILE_CHANGE_TOOL_NAMES = new Set<FileChangeToolName>([
  'Edit',
  'Write',
  'ApplyPatch',
  'MultiEdit',
]);

function isFileChangeToolName(toolName: unknown): toolName is FileChangeToolName {
  return FILE_CHANGE_TOOL_NAMES.has(String(toolName) as FileChangeToolName);
}

function getMessageToolId(message: Pick<NormalizedMessage, 'toolId' | 'id'>) {
  return String(message.toolId || message.id || '').trim();
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
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }

    return {};
  }

  if (typeof toolInput === 'object' && !Array.isArray(toolInput)) {
    return toolInput as Record<string, unknown>;
  }

  return {};
}

function getFilePath(toolInput: unknown) {
  const input = normalizeToolInput(toolInput);
  const rawPath =
    input.file_path ??
    input.filePath ??
    input.path ??
    input.file ??
    '';

  return String(rawPath || '').trim();
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

  return {
    startLine,
    endLine,
  };
}

function getAttachedToolResult(
  message: NormalizedMessage,
  toolResultById: Map<string, NormalizedMessage>,
) : FileResultLike {
  if (message.toolResult) {
    return message.toolResult;
  }

  const toolId = getMessageToolId(message);
  if (!toolId) {
    return null;
  }

  const toolResultMessage = toolResultById.get(toolId);
  if (!toolResultMessage) {
    return null;
  }

  return {
    content: toolResultMessage.content,
    isError: toolResultMessage.isError,
  };
}

function getFileResultState(
  message: NormalizedMessage,
  toolResultById: Map<string, NormalizedMessage>,
): FileResultState {
  const attachedToolResult = getAttachedToolResult(message, toolResultById);
  if (!attachedToolResult) {
    return { kind: 'missing' };
  }

  if (attachedToolResult.isError) {
    return {
      kind: 'error',
      error: String(attachedToolResult.content || '').trim(),
    };
  }

  return { kind: 'success' };
}

function buildBaseEvent(message: NormalizedMessage) {
  const toolName = message.toolName;
  if (!isFileChangeToolName(toolName)) {
    return null;
  }

  const filePath = getFilePath(message.toolInput);
  const sessionId = String(message.sessionId || '').trim();
  const toolId = getMessageToolId(message);
  const timestamp = String(message.timestamp || '').trim();

  if (!sessionId || !toolId || !filePath || !timestamp) {
    return null;
  }

  return {
    sessionId,
    toolId,
    filePath,
    source: toolName,
    timestamp,
    lineRange: getLineRange(message.toolInput),
  } satisfies FileChangeEventBase;
}

export function deriveFileChangeEvents(messages: NormalizedMessage[]): FileChangeEvent[] {
  const toolResultById = new Map<string, NormalizedMessage>();

  for (const message of messages) {
    if (message.kind !== 'tool_result') {
      continue;
    }

    const toolId = String(message.toolId || message.id || '').trim();
    if (!toolId) {
      continue;
    }

    toolResultById.set(toolId, message);
  }

  const events: FileChangeEvent[] = [];

  for (const message of messages) {
    if (message.kind !== 'tool_use' || !isFileChangeToolName(message.toolName)) {
      continue;
    }

    const baseEvent = buildBaseEvent(message);
    if (!baseEvent) {
      continue;
    }

    const fileResultState = getFileResultState(message, toolResultById);

    events.push({
      type: 'file_change_started',
      ...baseEvent,
    });

    if (fileResultState.kind === 'error') {
      events.push({
        type: 'file_change_failed',
        ...baseEvent,
        error: fileResultState.error,
      });
      continue;
    }

    if (fileResultState.kind === 'missing') {
      continue;
    }

    events.push({
      type: 'file_change_applied',
      ...baseEvent,
    });
    events.push({
      type: 'focus_file_changed',
      ...baseEvent,
      reason: 'latest_edit',
    });
  }

  return events;
}
