import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

function emptyOfficialSessionHistory(sessionId) {
  return {
    sessionId,
    cwd: null,
    summary: 'New Session',
    metadata: {
      messageCount: 0,
      firstActivity: null,
      lastActivity: null,
    },
    messages: [],
    diagnostics: {
      officialMessageCount: 0,
      ignoredLineCount: 0,
    },
  };
}

function decodeClaudeProjectDir(projectDirName) {
  if (typeof projectDirName !== 'string' || !projectDirName.trim()) {
    return null;
  }

  return projectDirName.replace(/-/g, '/');
}

function extractTextFromContent(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const pieces = [];
    for (const part of content) {
      if (typeof part === 'string') {
        if (part.trim()) pieces.push(part);
        continue;
      }
      if (typeof part?.text === 'string' && part.text.trim()) {
        pieces.push(part.text);
        continue;
      }
      if (typeof part?.content === 'string' && part.content.trim()) {
        pieces.push(part.content);
      }
    }
    return pieces.length > 0 ? pieces.join('\n') : null;
  }

  if (content && typeof content === 'object' && typeof content.text === 'string') {
    return content.text;
  }

  return null;
}

function extractCommandProtocolText(text) {
  if (typeof text !== 'string' || !text.includes('<command-name>')) {
    return null;
  }

  const nameMatch = text.match(/<command-name>\s*([\s\S]*?)\s*<\/command-name>/i);
  const argsMatch = text.match(/<command-args>\s*([\s\S]*?)\s*<\/command-args>/i);
  const commandName = typeof nameMatch?.[1] === 'string' ? nameMatch[1].trim() : '';
  const commandArgs = typeof argsMatch?.[1] === 'string' ? argsMatch[1].trim() : '';

  if (!commandName) {
    return null;
  }

  return commandArgs ? `${commandName} ${commandArgs}`.trim() : commandName;
}

function stripContextFileProtocol(text) {
  if (typeof text !== 'string') {
    return '';
  }

  return text.replace(/<context-file>[\s\S]*?<\/context-file>/gi, ' ').replace(/\s+/g, ' ').trim();
}

function stringifyContent(content) {
  const text = extractTextFromContent(content);
  if (text !== null) {
    return text;
  }

  if (content == null) {
    return null;
  }

  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

function resolveMessageRole(entry) {
  const role = entry?.message?.role || entry?.role || entry?.type;
  return typeof role === 'string' && role.trim() ? role.trim() : null;
}

function isKnownSystemUserMessage(text) {
  return typeof text === 'string' && (
    text.startsWith('<command-name>') ||
    text.startsWith('<command-message>') ||
    text.startsWith('<command-args>') ||
    text.startsWith('<local-command-caveat>') ||
    text.startsWith('<local-command-stdout>') ||
    text.startsWith('<context-file>') ||
    text.startsWith('<system-reminder>') ||
    text.startsWith('Caveat:') ||
    text.startsWith('This session is being continued from a previous') ||
    text.startsWith('Invalid API key') ||
    text.includes('{"subtasks":') ||
    text.includes('CRITICAL: You MUST respond with ONLY a JSON') ||
    text === 'Warmup'
  );
}

function isKnownSystemAssistantMessage(text) {
  return typeof text === 'string' && (
    text.startsWith('<local-command-caveat>') ||
    text.startsWith('<local-command-stdout>') ||
    text.startsWith('<system-reminder>') ||
    text.startsWith('Invalid API key') ||
    text.includes('{"subtasks":') ||
    text.includes('CRITICAL: You MUST respond with ONLY a JSON')
  );
}

function extractUserSummaryText(content) {
  if (typeof content === 'string') {
    return stripContextFileProtocol(content) || null;
  }

  if (Array.isArray(content)) {
    for (const part of content) {
      if (part?.type !== 'text' || typeof part.text !== 'string') {
        continue;
      }

      const normalized = stripContextFileProtocol(part.text);
      if (normalized) {
        return normalized;
      }
    }
  }

  return null;
}

function hasUserImageContent(content) {
  return Array.isArray(content) && content.some((part) => part?.type === 'image');
}

function extractAssistantSummaryText(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    let assistantText = null;
    for (const part of content) {
      if (part?.type === 'text' && part.text) {
        assistantText = part.text;
      }
    }
    return assistantText;
  }

  return null;
}

function isExpandedSkillPromptText(text) {
  return typeof text === 'string' && text.startsWith('Base directory for this skill:');
}

function deriveOfficialSessionSummary(rawMessages) {
  const pendingSummaries = new Map();
  let summary = 'New Session';
  let lastUserMessage = null;
  let lastAssistantMessage = null;

  for (const entry of Array.isArray(rawMessages) ? rawMessages : []) {
    if (entry?.type === 'summary' && entry.summary && !entry.sessionId && entry.leafUuid) {
      pendingSummaries.set(entry.leafUuid, entry.summary);
    }

    if (!entry?.sessionId) {
      continue;
    }

    if (summary === 'New Session' && entry.parentUuid && pendingSummaries.has(entry.parentUuid)) {
      summary = pendingSummaries.get(entry.parentUuid);
    }

    if (entry.type === 'summary' && entry.summary) {
      summary = entry.summary;
    }

    const role = resolveMessageRole(entry);

    if (role === 'user' && entry.message?.content) {
      const textContent = extractUserSummaryText(entry.message.content);
      if (
        typeof textContent === 'string'
        && textContent.length > 0
        && !isKnownSystemUserMessage(textContent)
        && !isExpandedSkillPromptText(textContent)
      ) {
        lastUserMessage = textContent;
      }
    } else if (role === 'assistant' && entry.message?.content) {
      if (entry.isApiErrorMessage === true) {
        continue;
      }

      const assistantText = extractAssistantSummaryText(entry.message.content);
      if (assistantText && !isKnownSystemAssistantMessage(assistantText)) {
        lastAssistantMessage = assistantText;
      }
    }
  }

  if (summary === 'New Session') {
    const lastMessage = lastUserMessage || lastAssistantMessage;
    if (lastMessage) {
      summary = lastMessage.length > 50 ? `${lastMessage.substring(0, 50)}...` : lastMessage;
    }
  }

  return summary;
}

function deriveOfficialSessionMetadata(rawMessages) {
  let messageCount = 0;
  let firstActivity = null;
  let lastActivity = null;

  for (const entry of Array.isArray(rawMessages) ? rawMessages : []) {
    if (!entry?.sessionId) {
      continue;
    }

    messageCount++;

    if (typeof entry?.timestamp === 'string' && entry.timestamp.trim()) {
      const timestamp = entry.timestamp.trim();
      if (!firstActivity) {
        firstActivity = timestamp;
      }
      lastActivity = timestamp;
    }
  }

  return {
    messageCount,
    firstActivity,
    lastActivity,
  };
}

function buildCanonicalMessage({
  id,
  sessionId,
  timestamp,
  kind,
  role = null,
  text = null,
  content = null,
  rawType = null,
  source = 'session',
  toolName,
  toolInput,
  toolId,
  isError,
}) {
  return {
    id,
    sessionId,
    timestamp,
    kind,
    role,
    text,
    content,
    rawType,
    source,
    ...(toolName === undefined ? {} : { toolName }),
    ...(toolInput === undefined ? {} : { toolInput }),
    ...(toolId === undefined ? {} : { toolId }),
    ...(isError === undefined ? {} : { isError }),
  };
}

function buildCanonicalId(baseId, suffix) {
  return suffix == null ? baseId : `${baseId}_${suffix}`;
}

function normalizeContentPart({ part, baseId, partIndex, sessionId, timestamp, role, source, rawType }) {
  if (!part || typeof part !== 'object') {
    return [];
  }

  if (part.type === 'text' && typeof part.text === 'string' && part.text.trim()) {
    const commandProtocolText = role === 'user' ? extractCommandProtocolText(part.text) : null;
    const normalizedText = commandProtocolText || part.text;

    if (
      role === 'user'
      && rawType === 'user'
      && source === 'session'
      && isKnownCompactSummaryEntry({ role, text: normalizedText, rawType, source })
    ) {
      return [];
    }

    if (role === 'user' && isKnownSystemUserMessage(part.text)) {
      if (commandProtocolText) {
        return [buildCanonicalMessage({
          id: buildCanonicalId(baseId, partIndex),
          sessionId,
          timestamp,
          kind: 'text',
          role,
          text: commandProtocolText,
          content: commandProtocolText,
          rawType,
          source,
        })];
      }

      return [];
    }

    if (role === 'assistant' && isKnownSystemAssistantMessage(part.text)) {
      return [];
    }

    return [buildCanonicalMessage({
      id: buildCanonicalId(baseId, partIndex),
      sessionId,
      timestamp,
      kind: 'text',
      role,
      text: normalizedText,
      content: normalizedText,
      rawType,
      source,
    })];
  }

  if (part.type === 'thinking' && typeof part.thinking === 'string' && part.thinking.trim()) {
    return [buildCanonicalMessage({
      id: buildCanonicalId(baseId, partIndex),
      sessionId,
      timestamp,
      kind: 'thinking',
      role: 'assistant',
      text: part.thinking,
      content: part.thinking,
      rawType,
      source,
    })];
  }

  if (part.type === 'tool_use') {
    return [buildCanonicalMessage({
      id: part.id || buildCanonicalId(baseId, partIndex),
      sessionId,
      timestamp,
      kind: 'tool_use',
      role: 'assistant',
      rawType,
      source,
      toolName: part.name || null,
      toolInput: part.input ?? null,
      toolId: part.id || null,
    })];
  }

  if (part.type === 'tool_result') {
    const text = stringifyContent(part.content);
    return [buildCanonicalMessage({
      id: buildCanonicalId(baseId, `tr_${part.tool_use_id || partIndex}`),
      sessionId,
      timestamp,
      kind: 'tool_result',
      role: role || 'user',
      text,
      content: text,
      rawType,
      source,
      toolId: part.tool_use_id || null,
      isError: Boolean(part.is_error),
    })];
  }

  return [];
}

function isKnownCompactSummaryEntry(entry) {
  return Boolean(
    entry
    && entry.role === 'user'
    && (entry.isVisibleInTranscriptOnly === true || entry.isCompactSummary === true)
  );
}

function normalizeOfficialHistoryEntry(entry, normalizedSessionId, source = 'session') {
  if (!entry || typeof entry !== 'object' || entry.type === 'summary') {
    return [];
  }

  const sessionId = typeof entry.sessionId === 'string' && entry.sessionId.trim()
    ? entry.sessionId.trim()
    : normalizedSessionId;
  const timestamp = typeof entry.timestamp === 'string' && entry.timestamp.trim()
    ? entry.timestamp.trim()
    : null;
  const baseId = typeof entry.uuid === 'string' && entry.uuid.trim()
    ? entry.uuid.trim()
    : `${source}-${normalizedSessionId || 'unknown'}-${timestamp || 'unknown'}-${entry.type || 'entry'}`;

  if (entry.type === 'thinking') {
    const text = stringifyContent(entry.message?.content ?? entry.content ?? null);
    return text
      ? [buildCanonicalMessage({
        id: baseId,
        sessionId,
        timestamp,
        kind: 'thinking',
        role: 'assistant',
        text,
        content: text,
        rawType: entry.type,
        source,
      })]
      : [];
  }

  if (entry.type === 'system' && entry.subtype === 'compact_boundary') {
    return [buildCanonicalMessage({
      id: baseId,
      sessionId,
      timestamp,
      kind: 'compact_boundary',
      role: 'tool',
      text: null,
      content: entry.content ?? null,
      rawType: entry.subtype || entry.type,
      source,
    })];
  }

  if (entry.type === 'tool_use' && entry.toolName) {
    return [buildCanonicalMessage({
      id: entry.toolCallId || baseId,
      sessionId,
      timestamp,
      kind: 'tool_use',
      role: 'assistant',
      rawType: entry.type,
      source,
      toolName: entry.toolName,
      toolInput: entry.toolInput ?? null,
      toolId: entry.toolCallId || null,
    })];
  }

  if (entry.type === 'tool_result') {
    const text = stringifyContent(entry.output ?? entry.content ?? null);
    return [buildCanonicalMessage({
      id: buildCanonicalId(baseId, entry.toolCallId || 'result'),
      sessionId,
      timestamp,
      kind: 'tool_result',
      role: 'user',
      text,
      content: text,
      rawType: entry.type,
      source,
      toolId: entry.toolCallId || null,
      isError: Boolean(entry.is_error),
    })];
  }

  const role = resolveMessageRole(entry);
  if (!role) {
    return [];
  }

  if (isKnownCompactSummaryEntry({
    role,
    isVisibleInTranscriptOnly: entry.isVisibleInTranscriptOnly,
    isCompactSummary: entry.isCompactSummary,
  })) {
    return [];
  }

  const content = entry.message?.content ?? entry.content ?? null;
  if (role === 'user' && Array.isArray(content) && hasUserImageContent(content)) {
    const text = extractUserSummaryText(content);
    return [buildCanonicalMessage({
      id: baseId,
      sessionId,
      timestamp,
      kind: 'text',
      role,
      text,
      content,
      rawType: entry.type,
      source,
    })];
  }

  if (Array.isArray(content)) {
    return content.flatMap((part, partIndex) => normalizeContentPart({
      part,
      baseId,
      partIndex,
      sessionId,
      timestamp,
      role,
      source,
      rawType: entry.type,
    }));
  }

  const rawText = stringifyContent(content);
  const commandProtocolText = role === 'user' ? extractCommandProtocolText(rawText) : null;
  const text = commandProtocolText || rawText;
  if (role === 'user' && isKnownSystemUserMessage(text)) {
    if (commandProtocolText) {
      return [buildCanonicalMessage({
        id: baseId,
        sessionId,
        timestamp,
        kind: 'text',
        role,
        text: commandProtocolText,
        content: commandProtocolText,
        rawType: entry.type,
        source,
      })];
    }

    return [];
  }

  if (role === 'assistant' && isKnownSystemAssistantMessage(text)) {
    return [];
  }

  return text
    ? [buildCanonicalMessage({
      id: baseId,
      sessionId,
      timestamp,
      kind: role === 'assistant' && entry.type === 'thinking' ? 'thinking' : 'text',
      role,
      text,
      content: text,
      rawType: entry.type,
      source,
    })]
    : [];
}

async function locateSessionFile(sessionId, claudeProjectsRoot, fsImpl) {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) {
    return null;
  }

  let projectDirs = [];
  try {
    projectDirs = await fsImpl.readdir(claudeProjectsRoot, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of projectDirs) {
    if (!entry.isDirectory()) {
      continue;
    }

    const projectDir = path.join(claudeProjectsRoot, entry.name);
    const jsonlPath = path.join(projectDir, `${normalizedSessionId}.jsonl`);

    try {
      await fsImpl.access(jsonlPath);
      return {
        projectDir,
        jsonlPath,
      };
    } catch {
      continue;
    }
  }

  return null;
}

async function readJsonlEntries(filePath) {
  const fileStream = createReadStream(filePath);
  const entries = [];
  let ignoredLineCount = 0;

  try {
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) {
        continue;
      }

      try {
        entries.push(JSON.parse(line));
      } catch {
        ignoredLineCount++;
      }
    }
  } finally {
    fileStream.destroy();
  }

  return {
    entries,
    ignoredLineCount,
  };
}

function normalizeShellCommandArguments(argumentsJson) {
  let toolInput = argumentsJson;
  try {
    const args = JSON.parse(argumentsJson);
    toolInput = JSON.stringify({ command: args.command });
  } catch {
    // Keep original if parsing fails.
  }
  return toolInput;
}

function normalizeAgentFileEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return [];
  }

  if (entry.type === 'response_item' && entry.payload?.type === 'message' && entry.payload.role === 'assistant') {
    const text = extractTextFromContent(entry.payload.content);
    return text
      ? [{
        type: 'assistant',
        timestamp: entry.timestamp,
        message: {
          role: 'assistant',
          content: [{ type: 'text', text }],
        },
      }]
      : [];
  }

  if (entry.type === 'response_item' && entry.payload?.type === 'reasoning') {
    const text = Array.isArray(entry.payload.summary)
      ? entry.payload.summary.map((item) => item?.text).filter(Boolean).join('\n')
      : null;
    return text
      ? [{
        type: 'thinking',
        timestamp: entry.timestamp,
        message: {
          role: 'assistant',
          content: text,
        },
      }]
      : [];
  }

  if (entry.type === 'response_item' && entry.payload?.type === 'function_call') {
    let toolName = entry.payload.name;
    let toolInput = entry.payload.arguments;
    if (toolName === 'shell_command') {
      toolName = 'Bash';
      toolInput = normalizeShellCommandArguments(entry.payload.arguments);
    }

    return [{
      type: 'tool_use',
      timestamp: entry.timestamp,
      toolName,
      toolInput,
      toolCallId: entry.payload.call_id,
    }];
  }

  if (entry.type === 'response_item' && entry.payload?.type === 'function_call_output') {
    return [{
      type: 'tool_result',
      timestamp: entry.timestamp,
      toolCallId: entry.payload.call_id,
      output: entry.payload.output,
    }];
  }

  if (entry.type === 'response_item' && entry.payload?.type === 'custom_tool_call') {
    return [{
      type: 'tool_use',
      timestamp: entry.timestamp,
      toolName: entry.payload.name || 'custom_tool',
      toolInput: entry.payload.input || '',
      toolCallId: entry.payload.call_id,
    }];
  }

  if (entry.type === 'response_item' && entry.payload?.type === 'custom_tool_call_output') {
    return [{
      type: 'tool_result',
      timestamp: entry.timestamp,
      toolCallId: entry.payload.call_id,
      output: entry.payload.output || '',
    }];
  }

  if (entry.type === 'assistant' && Array.isArray(entry.message?.content)) {
    return entry.message.content.flatMap((part) => {
      if (!part || typeof part !== 'object') {
        return [];
      }

      if (part.type === 'thinking' && typeof part.thinking === 'string' && part.thinking.trim()) {
        return [{
          type: 'thinking',
          timestamp: entry.timestamp,
          message: {
            role: 'assistant',
            content: part.thinking,
          },
        }];
      }

      if (part.type === 'tool_use') {
        return [{
          type: 'tool_use',
          timestamp: entry.timestamp,
          toolName: part.name || null,
          toolInput: part.input ?? null,
          toolCallId: part.id || null,
        }];
      }

      return [];
    });
  }

  if (entry.type === 'user' && Array.isArray(entry.message?.content)) {
    return entry.message.content.flatMap((part) => {
      if (!part || typeof part !== 'object' || part.type !== 'tool_result') {
        return [];
      }

      return [{
        type: 'tool_result',
        timestamp: entry.timestamp,
        toolCallId: part.tool_use_id || null,
        output: part.content ?? '',
        is_error: Boolean(part.is_error),
      }];
    });
  }

  return [];
}

function extractAgentIds(rawMessages) {
  const agentIds = new Set();

  for (const entry of Array.isArray(rawMessages) ? rawMessages : []) {
    const agentId = entry?.toolUseResult?.agentId;
    if (typeof agentId === 'string' && agentId.trim()) {
      agentIds.add(agentId.trim());
    }
  }

  return [...agentIds];
}

function getAgentFileCandidatePaths(projectDir, sessionId, agentId) {
  const candidates = [
    path.join(projectDir, `agent-${agentId}.jsonl`),
  ];

  if (sessionId) {
    candidates.push(
      path.join(projectDir, sessionId, 'subagents', `agent-${agentId}.jsonl`),
    );
  }

  return candidates;
}

async function readSessionMessagesFromProjectDir(projectDir, sessionId) {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!projectDir || !normalizedSessionId) {
    return {
      rawMessages: [],
      agentRawMessages: [],
      ignoredLineCount: 0,
      exactCwd: null,
    };
  }

  const jsonlPath = path.join(projectDir, `${normalizedSessionId}.jsonl`);
  const sessionFile = await readJsonlEntries(jsonlPath);
  const rawMessages = [];
  let exactCwd = null;

  for (const entry of sessionFile.entries) {
    if (!exactCwd && typeof entry?.cwd === 'string' && entry.cwd.trim()) {
      exactCwd = entry.cwd.trim();
    }
    rawMessages.push(entry);
  }

  const agentIds = extractAgentIds(rawMessages);
  const agentRawMessages = [];
  let ignoredLineCount = sessionFile.ignoredLineCount;

  for (const agentId of agentIds) {
    let matchedAgentPath = null;
    for (const candidatePath of getAgentFileCandidatePaths(projectDir, normalizedSessionId, agentId)) {
      try {
        await fs.access(candidatePath);
        matchedAgentPath = candidatePath;
        break;
      } catch (error) {
        if (error?.code !== 'ENOENT') {
          throw error;
        }
      }
    }

    if (!matchedAgentPath) {
      continue;
    }

    const agentFile = await readJsonlEntries(matchedAgentPath);
    ignoredLineCount += agentFile.ignoredLineCount;
    for (const entry of agentFile.entries) {
      agentRawMessages.push(...normalizeAgentFileEntry(entry));
    }
  }

  return {
    rawMessages,
    agentRawMessages,
    ignoredLineCount,
    exactCwd,
  };
}

function compareCanonicalMessages(left, right) {
  const timestampOrder = String(left?.timestamp || '').localeCompare(String(right?.timestamp || ''));
  if (timestampOrder !== 0) {
    return timestampOrder;
  }

  return String(left?.id || '').localeCompare(String(right?.id || ''));
}

function normalizeSignatureText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function getCanonicalDeduplicationKey(message) {
  return [
    String(message?.kind || ''),
    String(message?.timestamp || ''),
    String(message?.toolId || ''),
    normalizeSignatureText(message?.text ?? message?.content ?? ''),
  ].join('::');
}

function dedupeCanonicalMessages(messages) {
  const deduped = [];
  const seenKeys = new Set();

  for (const message of messages) {
    const key = getCanonicalDeduplicationKey(message);
    if (seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    deduped.push(message);
  }

  return deduped;
}

function normalizeOfficialSessionHistory({
  sessionId,
  projectDir,
  rawMessages,
  agentRawMessages,
  ignoredLineCount = 0,
  exactCwd = null,
}) {
  const normalizedSessionId = String(sessionId || '').trim();
  const sessionMessages = Array.isArray(rawMessages) ? rawMessages : [];
  const auxiliaryMessages = Array.isArray(agentRawMessages) ? agentRawMessages : [];
  const metadata = deriveOfficialSessionMetadata(sessionMessages);
  const messages = [
    ...sessionMessages.flatMap((entry) => normalizeOfficialHistoryEntry(entry, normalizedSessionId, 'session')),
    ...auxiliaryMessages.flatMap((entry) => normalizeOfficialHistoryEntry(entry, normalizedSessionId, 'agent')),
  ].sort(compareCanonicalMessages);
  const dedupedMessages = dedupeCanonicalMessages(messages);

  return {
    sessionId: normalizedSessionId,
    cwd: exactCwd || decodeClaudeProjectDir(path.basename(projectDir || '')),
    summary: deriveOfficialSessionSummary(sessionMessages),
    metadata,
    messages: dedupedMessages,
    diagnostics: {
      officialMessageCount: sessionMessages.length + auxiliaryMessages.length,
      agentMessageCount: auxiliaryMessages.length,
      debugAugmentedCount: 0,
      ignoredLineCount,
    },
  };
}

export function createOfficialHistoryReader({
  claudeProjectsRoot = path.join(os.homedir(), '.claude', 'projects'),
  fsImpl = fs,
} = {}) {
  return {
    locateSessionFile(sessionId) {
      return locateSessionFile(sessionId, claudeProjectsRoot, fsImpl);
    },

    async readSession({ sessionId, projectDir = null } = {}) {
      const normalizedSessionId = String(sessionId || '').trim();
      if (!normalizedSessionId) {
        return emptyOfficialSessionHistory(normalizedSessionId);
      }

      const located = projectDir
        ? { projectDir, jsonlPath: path.join(projectDir, `${normalizedSessionId}.jsonl`) }
        : await locateSessionFile(normalizedSessionId, claudeProjectsRoot, fsImpl);

      if (!located) {
        return emptyOfficialSessionHistory(normalizedSessionId);
      }

      const {
        rawMessages,
        agentRawMessages,
        ignoredLineCount,
        exactCwd,
      } = await readSessionMessagesFromProjectDir(located.projectDir, normalizedSessionId, fsImpl);

      return normalizeOfficialSessionHistory({
        sessionId: normalizedSessionId,
        projectDir: located.projectDir,
        rawMessages,
        agentRawMessages,
        ignoredLineCount,
        exactCwd,
      });
    },
  };
}
