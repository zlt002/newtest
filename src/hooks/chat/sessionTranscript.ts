const DEFAULT_SESSION_TITLE = 'conversation';

interface TranscriptMessage {
  type?: string;
  isThinking?: boolean;
  isToolUse?: boolean;
  toolName?: string;
  content?: unknown;
  timestamp?: Date | string | number;
}

interface TranscriptOptions {
  sessionTitle?: string;
}

const formatTimestamp = (timestamp: Date | string | number | undefined): string | null => {
  if (!timestamp) {
    return null;
  }

  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
};

const normalizeRole = (message: TranscriptMessage): string => {
  if (message?.type === 'user') {
    return 'User';
  }
  if (message?.isThinking) {
    return 'Thinking';
  }
  if (message?.isToolUse) {
    return `Tool:${message.toolName || 'unknown'}`;
  }
  if (message?.type === 'error') {
    return 'Error';
  }
  return 'Assistant';
};

const normalizeContent = (message: TranscriptMessage): string => String(message?.content || '').trim();

export function buildSessionTranscript(
  messages: TranscriptMessage[] = [],
  format: 'markdown' | 'text' = 'markdown',
  options: TranscriptOptions = {},
): string {
  const sessionTitle = String(options.sessionTitle || DEFAULT_SESSION_TITLE).trim() || DEFAULT_SESSION_TITLE;
  const filteredMessages = Array.isArray(messages)
    ? messages.filter((message) => normalizeContent(message).length > 0)
    : [];

  if (format === 'text') {
    return filteredMessages
      .map((message) => {
        const timestamp = formatTimestamp(message.timestamp);
        const prefix = timestamp ? `[${timestamp}] ` : '';
        return `${prefix}${normalizeRole(message)}: ${normalizeContent(message)}`;
      })
      .join('\n\n');
  }

  const header = `# ${sessionTitle}\n`;
  const body = filteredMessages
    .map((message) => {
      const timestamp = formatTimestamp(message.timestamp);
      const heading = `## ${normalizeRole(message)}${timestamp ? ` (${timestamp})` : ''}`;
      return `${heading}\n\n${normalizeContent(message)}`;
    })
    .join('\n\n');

  return body ? `${header}\n${body}\n` : `${header}\n`;
}

export function buildTranscriptFilename(sessionTitle: string, extension = 'md'): string {
  const normalizedTitle = String(sessionTitle || DEFAULT_SESSION_TITLE)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || DEFAULT_SESSION_TITLE;

  return `${normalizedTitle}.${extension}`;
}
