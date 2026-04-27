import type { AgentEventEnvelope } from '../types/agentEvents.ts';

export type InlineRuntimeActivityLine = {
  eventId: string;
  timestamp: string;
  kind: 'run' | 'system' | 'task' | 'tool' | 'assistant' | 'result' | 'raw';
  label: string;
  summary: string;
};

function normalizeRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  return input as Record<string, unknown>;
}

function getToolFilePath(payload: Record<string, unknown>) {
  const input = normalizeRecord(payload.input);
  const candidate = input.file_path ?? input.filePath ?? input.path ?? payload.filePath;
  return typeof candidate === 'string' ? candidate.trim() : '';
}

function isMarkdownPath(filePath: string) {
  return /\.(md|markdown)$/i.test(filePath);
}

function getFileName(filePath: string) {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.split('/').pop() || filePath;
}

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getToolLabel(event: AgentEventEnvelope) {
  const payload = event.payload;
  const toolName = getString(payload.toolName);
  if (toolName && toolName !== 'unknown') {
    return toolName;
  }

  const outputFileLabel = getOutputFileLabel(payload);
  if (outputFileLabel) {
    return outputFileLabel;
  }

  const toolId = getString(payload.toolId);
  if (toolId && toolId !== 'unknown') {
    return toolId;
  }

  return '';
}

function getOutputFileLabel(payload: Record<string, unknown>) {
  const outputFile = getString(payload.outputFile) || getString(payload.output_file);
  if (outputFile) {
    return getFileName(outputFile);
  }

  const filePath = getString(payload.filePath) || getString(payload.file_path) || getString(payload.path);
  if (filePath) {
    return getFileName(filePath);
  }

  return '';
}

function summarizeToolEvent(event: AgentEventEnvelope): string {
  const toolName = getToolLabel(event);
  const filePath = getToolFilePath(event.payload);
  const fileName = filePath ? getFileName(filePath) : '';

  if (toolName === 'Write' && isMarkdownPath(filePath)) {
    if (event.type === 'tool.call.started') {
      return fileName ? `Markdown 写入中 · ${fileName}` : 'Markdown 写入中';
    }
    if (event.type === 'tool.call.completed') {
      return fileName ? `Markdown 已写入完成 · ${fileName}` : 'Markdown 已写入完成';
    }
  }

  if (toolName) {
    if (event.type === 'tool.call.started') {
      return `工具调用已开始 · ${toolName}`;
    }
    if (event.type === 'tool.call.completed') {
      return `工具调用已完成 · ${toolName}`;
    }
    if (event.type === 'tool.call.failed') {
      return `工具调用失败 · ${toolName}`;
    }
    return `工具调用 · ${toolName}`;
  }

  if (event.type === 'tool.call.started') {
    return '工具调用已开始';
  }
  if (event.type === 'tool.call.completed') {
    return '工具调用已完成';
  }
  if (event.type === 'tool.call.failed') {
    return '工具调用失败';
  }
  if (event.type === 'tool.call.delta') {
    return '工具调用进行中';
  }

  return '工具调用';
}

function summarizeFallbackActivity(event: AgentEventEnvelope): InlineRuntimeActivityLine {
  const activity = event.payload.activity as { summary?: string; sourceType?: string; raw?: unknown } | null | undefined;
  const raw = normalizeRecord(activity?.raw);
  const message = normalizeRecord(raw.message);
  const content = Array.isArray(message.content) ? message.content : [];
  const firstThinkingBlock = content.find((block) => (
    block
    && typeof block === 'object'
    && !Array.isArray(block)
    && (block as Record<string, unknown>).type === 'thinking'
    && typeof (block as Record<string, unknown>).thinking === 'string'
    && String((block as Record<string, unknown>).thinking).trim()
  )) as Record<string, unknown> | undefined;

  if (firstThinkingBlock) {
    return {
      eventId: event.eventId,
      timestamp: event.timestamp,
      kind: 'assistant',
      label: 'assistant.thinking',
      summary: String(firstThinkingBlock.thinking || ''),
    };
  }

  const summary = String(activity?.summary || activity?.sourceType || '');
  return {
    eventId: event.eventId,
    timestamp: event.timestamp,
    kind: 'raw',
    label: event.type,
    summary,
  };
}

function summarizeEvent(event: AgentEventEnvelope): InlineRuntimeActivityLine {
  if (event.type === 'run.started') {
    return {
      eventId: event.eventId,
      timestamp: event.timestamp,
      kind: 'run',
      label: 'run.started',
      summary: 'Run started',
    };
  }

  if (event.type === 'sdk.system.init') {
    return {
      eventId: event.eventId,
      timestamp: event.timestamp,
      kind: 'system',
      label: 'sdk.system.init',
      summary: `cwd=${String(event.payload.cwd || '')}`.trim(),
    };
  }

  if (event.type.startsWith('sdk.task.')) {
    return {
      eventId: event.eventId,
      timestamp: event.timestamp,
      kind: 'task',
      label: event.type,
      summary: String(event.payload.summary || event.payload.description || event.payload.status || ''),
    };
  }

  if (event.type.startsWith('tool.call.')) {
    return {
      eventId: event.eventId,
      timestamp: event.timestamp,
      kind: 'tool',
      label: event.type,
      summary: summarizeToolEvent(event),
    };
  }

  if (event.type === 'assistant.message.delta') {
    return {
      eventId: event.eventId,
      timestamp: event.timestamp,
      kind: 'assistant',
      label: event.type,
      summary: String(event.payload.text || ''),
    };
  }

  if (event.type === 'run.body.segment_appended') {
    const segment = event.payload.segment as { text?: string } | null | undefined;
    const summary = typeof segment?.text === 'string' ? segment.text : '';
    return {
      eventId: event.eventId,
      timestamp: event.timestamp,
      kind: 'assistant',
      label: event.type,
      summary,
    };
  }

  if (event.type === 'run.activity.appended') {
    return summarizeFallbackActivity(event);
  }

  if (
    event.type === 'run.completed'
    || event.type === 'run.failed'
    || event.type === 'run.aborted'
  ) {
    return {
      eventId: event.eventId,
      timestamp: event.timestamp,
      kind: 'result',
      label: event.type,
      summary: String(event.payload.result || event.payload.error || ''),
    };
  }

  return {
    eventId: event.eventId,
    timestamp: event.timestamp,
    kind: 'raw',
    label: event.type,
    summary: JSON.stringify(event.payload),
  };
}

export function projectInlineRuntimeActivity(events: AgentEventEnvelope[]) {
  return [...events]
    .sort((a, b) => a.sequence - b.sequence)
    .map(summarizeEvent);
}
