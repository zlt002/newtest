const RAW_PROTOCOL_BLOCK_PATTERNS = [
  /<task-notification>[\s\S]*?<\/task-notification>/gi,
  /<task-id>[\s\S]*?<\/task-id>/gi,
  /<output-file>[\s\S]*?<\/output-file>/gi,
  /<status>[\s\S]*?<\/status>/gi,
  /<summary>[\s\S]*?<\/summary>/gi,
  /<tool-use-id>[\s\S]*?<\/tool-use-id>/gi,
  /<command-name>[\s\S]*?<\/command-name>/gi,
  /<command-message>[\s\S]*?<\/command-message>/gi,
  /<command-args>[\s\S]*?<\/command-args>/gi,
  /<local-command-caveat>[\s\S]*?<\/local-command-caveat>/gi,
  /<local-command-stdout>[\s\S]*?<\/local-command-stdout>/gi,
  /<system-reminder>[\s\S]*?<\/system-reminder>/gi,
  /<context-file>[\s\S]*?<\/context-file>/gi,
];

const RAW_PROTOCOL_INLINE_TAG_PATTERN = /<\/?(task-notification|task-id|output-file|status|summary|tool-use-id|command-name|command-message|command-args|local-command-caveat|local-command-stdout|system-reminder|context-file)>/gi;

export function isExpandedSkillPromptContent(content: unknown): boolean {
  const normalized = String(content || '').trim();
  if (!normalized) {
    return false;
  }

  return normalized.startsWith('Base directory for this skill:')
    || normalized.startsWith('Base directory for this skill');
}

export function extractCommandProtocolText(content: string): string {
  const text = String(content || '');
  if (!text.includes('<command-name>')) {
    return '';
  }

  const nameMatch = text.match(/<command-name>\s*([\s\S]*?)\s*<\/command-name>/i);
  const argsMatch = text.match(/<command-args>\s*([\s\S]*?)\s*<\/command-args>/i);
  const commandName = typeof nameMatch?.[1] === 'string' ? nameMatch[1].trim() : '';
  const commandArgs = typeof argsMatch?.[1] === 'string' ? argsMatch[1].trim() : '';

  if (!commandName) {
    return '';
  }

  return commandArgs ? `${commandName} ${commandArgs}`.trim() : commandName;
}

export function stripRawProtocolNoise(content: string): string {
  let stripped = String(content || '');

  if (isExpandedSkillPromptContent(stripped)) {
    return '';
  }

  for (const pattern of RAW_PROTOCOL_BLOCK_PATTERNS) {
    stripped = stripped.replace(pattern, ' ');
  }

  stripped = stripped.replace(RAW_PROTOCOL_INLINE_TAG_PATTERN, ' ');
  return stripped.replace(/\s+/g, ' ').trim();
}

export function isProtocolOnlyContent(content: string): boolean {
  if (extractCommandProtocolText(content)) {
    return false;
  }

  return !stripRawProtocolNoise(content).trim();
}

export function sanitizeDisplayText(content: unknown, fallback = ''): string {
  const commandText = extractCommandProtocolText(String(content || ''));
  if (commandText) {
    return commandText;
  }

  const stripped = stripRawProtocolNoise(String(content || ''));
  return stripped || fallback;
}
