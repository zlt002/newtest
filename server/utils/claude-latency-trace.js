import { shouldResumeClaudeSession } from './claude-session.js';
import path from 'node:path';

const PREVIEW_MAX = 80;

function toPreview(command = '') {
  const normalized = String(command).replace(/\s+/g, ' ').trim();
  return normalized.length > PREVIEW_MAX ? `${normalized.slice(0, PREVIEW_MAX - 3)}...` : normalized;
}

export function createLatencyTrace({ traceId, sessionId = null, source, commandPreview = '' }) {
  return {
    traceId,
    sessionId,
    source,
    commandPreview: toPreview(commandPreview),
    marks: {},
    metadata: {},
  };
}

export function markLatencyTrace(trace, mark, timestamp = Date.now()) {
  if (!trace?.marks || trace.marks[mark] !== undefined) {
    return trace;
  }
  trace.marks[mark] = timestamp;
  return trace;
}

export function updateLatencyTraceSession(trace, sessionId) {
  if (trace && sessionId && !trace.sessionId) {
    trace.sessionId = sessionId;
  }
  return trace;
}

export function buildClaudeInvocationSnapshot(options = {}) {
  const settings = options.toolsSettings || {};
  return {
    projectPath: options.projectPath || '',
    cwd: options.cwd || '',
    sessionId: options.sessionId || null,
    resume: shouldResumeClaudeSession(options),
    permissionMode: options.permissionMode || 'default',
    model: options.model || null,
    allowedTools: [...(settings.allowedTools || [])],
    disallowedTools: [...(settings.disallowedTools || [])],
    skipPermissions: Boolean(settings.skipPermissions),
  };
}

function toContentPreview(part = {}) {
  if (typeof part?.text === 'string' && part.text.trim()) {
    return part.text.trim().slice(0, 120);
  }

  if (typeof part?.thinking === 'string' && part.thinking.trim()) {
    return part.thinking.trim().slice(0, 120);
  }

  if (typeof part?.content === 'string' && part.content.trim()) {
    return part.content.trim().slice(0, 120);
  }

  return null;
}

function toMcpTransport(value = {}) {
  if (typeof value?.transport?.type === 'string' && value.transport.type) {
    return value.transport.type;
  }
  if (typeof value?.transport === 'string' && value.transport) {
    return value.transport;
  }
  if (typeof value?.type === 'string' && value.type) {
    return value.type;
  }
  return null;
}

function toMcpStatus(value = {}) {
  return value?.status || value?.state || value?.connectionState || value?.health || null;
}

function toMcpTarget(value = {}) {
  const url = value?.url || value?.transport?.url || null;
  if (typeof url === 'string' && url) {
    return url.slice(0, 120);
  }

  const command = value?.command || value?.transport?.command || null;
  if (typeof command === 'string' && command) {
    return path.basename(command);
  }

  return null;
}

function toMcpToolCount(value = {}) {
  if (Array.isArray(value?.tools)) {
    return value.tools.length;
  }

  if (Number.isFinite(value?.toolCount)) {
    return value.toolCount;
  }

  if (Number.isFinite(value?.tool_count)) {
    return value.tool_count;
  }

  return null;
}

function summarizeMcpServerEntry(name, value = {}) {
  return {
    name,
    transport: toMcpTransport(value),
    target: toMcpTarget(value),
    status: toMcpStatus(value),
    toolCount: toMcpToolCount(value),
  };
}

export function summarizeMcpServersForTrace(mcpServers = null) {
  if (!mcpServers) {
    return [];
  }

  if (Array.isArray(mcpServers)) {
    return mcpServers
      .map((entry, index) => summarizeMcpServerEntry(entry?.name || `server-${index}`, entry))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  if (typeof mcpServers === 'object') {
    return Object.entries(mcpServers)
      .map(([name, value]) => summarizeMcpServerEntry(name, value))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return [];
}

export function summarizeSdkEventForTrace(event = {}) {
  const content = Array.isArray(event?.message?.content) ? event.message.content : [];

  return {
    type: event?.type || null,
    subtype: event?.subtype || null,
    sessionId: event?.session_id || null,
    role: event?.message?.role || null,
    contentTypes: content.map((part) => part?.type).filter(Boolean),
    contentPreview: content.map(toContentPreview).filter(Boolean).slice(0, 3),
    keys: Object.keys(event || {}).sort(),
    hasModelUsage: Boolean(event?.modelUsage),
    mcpServers: summarizeMcpServersForTrace(event?.mcp_servers),
  };
}

export function appendSdkEventTimeline(metadata, trace, event, normalizedMessages = [], timestamp = Date.now(), limit = 8) {
  if (!metadata) {
    return;
  }

  if (!Array.isArray(metadata.sdkEventTimeline)) {
    metadata.sdkEventTimeline = [];
  }

  if (metadata.sdkEventTimeline.length >= limit) {
    return;
  }

  const startedAt = trace?.marks?.sdk_query_started;
  const atMs = startedAt === undefined ? null : Math.max(0, timestamp - startedAt);
  metadata.sdkEventTimeline.push({
    atMs,
    ...summarizeSdkEventForTrace(event),
    normalizedKinds: normalizedMessages.map((message) => message.kind),
  });
}

export function summarizeLatencyMetadataForLog(metadata = {}) {
  return {
    mcp: metadata?.mcp || null,
    spawn: metadata?.spawn || null,
    firstSdkEvent: metadata?.firstSdkEvent || null,
    firstNormalizedKinds: Array.isArray(metadata?.firstNormalizedKinds)
      ? [...metadata.firstNormalizedKinds]
      : [],
    sdkEventTimeline: Array.isArray(metadata?.sdkEventTimeline)
      ? [...metadata.sdkEventTimeline]
      : [],
  };
}

export function summarizeLatencyTrace(trace) {
  const marks = trace?.marks || {};
  const durations = {};
  const missing = [];
  const addDuration = (name, startMark, endMark, options = {}) => {
    const { optional = false } = options;
    if (marks[startMark] !== undefined && marks[endMark] !== undefined) {
      durations[name] = marks[endMark] - marks[startMark];
      return;
    }
    if (!optional || marks[startMark] !== undefined) {
      missing.push(name);
    }
  };

  addDuration('sendToSdkStart', 'send_clicked', 'sdk_query_started');
  addDuration('sdkStartToFirstEvent', 'sdk_query_started', 'first_sdk_event');
  addDuration('firstEventToFirstStreamDelta', 'first_sdk_event', 'first_stream_delta_sent');
  addDuration('mcpConfigLoad', 'mcp_config_started', 'mcp_config_loaded', { optional: true });
  addDuration('queryConstruction', 'query_construction_started', 'sdk_query_instance_created', { optional: true });
  addDuration('sdkReadyAfterMcp', 'mcp_config_loaded', 'sdk_query_instance_created', { optional: true });
  addDuration('spawnStartToReady', 'claude_process_spawn_started', 'claude_process_spawn_completed', { optional: true });
  addDuration('sdkReadyToFirstThinking', 'sdk_query_instance_created', 'first_thinking_event', { optional: true });
  addDuration('thinkingToFirstStreamDelta', 'first_thinking_event', 'first_stream_delta_sent', { optional: true });

  return {
    traceId: trace?.traceId || null,
    sessionId: trace?.sessionId || null,
    source: trace?.source || 'unknown',
    durations,
    missing,
  };
}
