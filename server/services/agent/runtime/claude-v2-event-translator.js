// Claude SDK 到 V2 事件协议的翻译层。
// 这里把 SDK 私有消息形状转成项目内部稳定的事件包络。
// SDK-mapped events 只做薄映射；product-only 事件只保留无法直接归类的兜底状态。
import { createAgentEventEnvelope } from '../domain/agent-event.js';
import { createClaudeStreamToolPreviewTracker } from '../../../utils/claude-stream-tool-preview.js';
import { normalizeTodoWriteInput } from '../../../utils/todo-write.js';

// 从 Claude SDK 的 message 结构中提取纯文本内容。
// 这样上层只会拿到项目自己的 event payload，而不是 SDK 私有结构。
function extractAssistantText(message) {
  if (!Array.isArray(message?.message?.content)) {
    return '';
  }

  return message.message.content
    .filter((block) => block?.type === 'text')
    .map((block) => block.text)
    .join('');
}

function getMessageContentBlocks(sdkMessage) {
  if (!Array.isArray(sdkMessage?.message?.content)) {
    return [];
  }

  return sdkMessage.message.content.filter((block) => block && typeof block === 'object');
}

function getNestedToolUseBlock(sdkMessage) {
  return getMessageContentBlocks(sdkMessage).find((block) => block.type === 'tool_use') || null;
}

function getNestedToolResultBlock(sdkMessage) {
  return getMessageContentBlocks(sdkMessage).find((block) => block.type === 'tool_result') || null;
}

function normalizeToolName(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }

    const value = candidate.trim();
    if (!value || value === 'unknown') {
      continue;
    }

    return value;
  }

  return null;
}

function normalizeToolInput(toolName, input) {
  if (!input || typeof input !== 'object') {
    return input || {};
  }

  if (toolName === 'TodoWrite') {
    return normalizeTodoWriteInput(input);
  }

  return input;
}

function buildEvent(base, sequence, type, payload = {}) {
  return createAgentEventEnvelope({
    ...base,
    sequence,
    type,
    payload,
  });
}

function buildSdkMappedEvent(base, sequence, type, sdkMessage, payload = {}) {
  return buildEvent(base, sequence, type, {
    ...payload,
    sdk: sdkMessage,
  });
}

function buildActivityEvent(base, sequence, sdkMessage, activity) {
  return buildEvent(base, sequence, 'run.activity.appended', {
    activity,
    sdk: sdkMessage,
  });
}

function buildBodySegmentEvent(base, sequence, sdkMessage, text) {
  return buildEvent(base, sequence, 'run.body.segment_appended', {
    segment: {
      kind: 'phase',
      text,
    },
    sdk: sdkMessage,
  });
}

function isCompactOperation(sdkMessage) {
  const usage = sdkMessage?.usage;
  const modelUsage = sdkMessage?.modelUsage;
  // Compaction runs typically have 0 input/output in usage but large cache reads in modelUsage
  if (usage && typeof usage === 'object') {
    const inputTokens = Number(usage.input_tokens || usage.inputTokens || 0);
    const outputTokens = Number(usage.output_tokens || usage.outputTokens || 0);
    if (inputTokens === 0 && outputTokens === 0) {
      if (modelUsage && typeof modelUsage === 'object') {
        for (const entry of Object.values(modelUsage)) {
          if (entry && typeof entry === 'object') {
            const cacheRead = Number(entry.cacheReadInputTokens || entry.cache_read_input_tokens || 0);
            if (cacheRead > 10000) {
              return true;
            }
          }
        }
      }
    }
  }
  return false;
}

function extractTokenUsage(sdkMessage) {
  if (isCompactOperation(sdkMessage)) {
    return null;
  }
  const usage = sdkMessage?.usage;
  const modelUsage = sdkMessage?.modelUsage;
  console.log('[TokenBudget] SDK msg type:', sdkMessage?.type, 'subtype:', sdkMessage?.subtype, 'usage:', JSON.stringify(usage), 'modelUsage:', JSON.stringify(modelUsage));
  let used = 0;
  let total = 0;

  if (usage && typeof usage === 'object') {
    const inputTokens = Number(usage.input_tokens || usage.inputTokens || 0);
    const outputTokens = Number(usage.output_tokens || usage.outputTokens || 0);
    const cacheCreationTokens = Number(usage.cache_creation_input_tokens || usage.cacheCreationInputTokens || 0);
    const cacheReadTokens = Number(usage.cache_read_input_tokens || usage.cacheReadInputTokens || 0);
    used = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;
  }

  if (modelUsage && typeof modelUsage === 'object') {
    for (const entry of Object.values(modelUsage)) {
      if (entry && typeof entry === 'object') {
        if (!used) {
          const inputTokens = Number(entry.inputTokens || entry.input_tokens || 0);
          const outputTokens = Number(entry.outputTokens || entry.output_tokens || 0);
          const cacheCreationTokens = Number(entry.cacheCreationInputTokens || entry.cache_creation_input_tokens || 0);
          const cacheReadTokens = Number(entry.cacheReadInputTokens || entry.cache_read_input_tokens || 0);
          used = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;
        }
        if (!total) {
          total = Number(entry.contextWindow || entry.context_window || 0);
        }
        if (used && total) break;
      }
    }
  }

  if (!used) {
    return null;
  }
  if (!total) {
    total = Number(sdkMessage?.context_window || sdkMessage?.contextWindow || 200000);
  }
  return { used, total };
}

function extractStreamText(sdkMessage) {
  const text = sdkMessage?.event?.delta?.text;
  return typeof text === 'string' ? text : '';
}

function isAssistantTextEvent(sdkMessage) {
  if (sdkMessage?.type !== 'assistant') {
    return false;
  }

  return extractAssistantText(sdkMessage).length > 0;
}

function translateClaudeV2EventInternal(base, sdkMessage, sequence) {
  const nestedToolUseBlock = getNestedToolUseBlock(sdkMessage);
  if (nestedToolUseBlock) {
    const toolName = normalizeToolName(nestedToolUseBlock.name);
    return [
      buildSdkMappedEvent(base, sequence, 'tool.call.started', sdkMessage, {
        toolId: nestedToolUseBlock.id || null,
        toolName,
        input: normalizeToolInput(toolName, nestedToolUseBlock.input || {}),
      }),
    ];
  }

  const nestedToolResultBlock = getNestedToolResultBlock(sdkMessage);
  if (nestedToolResultBlock) {
    const isError = nestedToolResultBlock.status === 'error' || nestedToolResultBlock.is_error === true;
    return [
      buildSdkMappedEvent(base, sequence, isError ? 'tool.call.failed' : 'tool.call.completed', sdkMessage, {
        toolId: nestedToolResultBlock.tool_use_id || nestedToolResultBlock.toolId || null,
        toolName: normalizeToolName(nestedToolResultBlock.tool_name, nestedToolResultBlock.toolName),
        error: nestedToolResultBlock.error || null,
        result: nestedToolResultBlock.result || nestedToolResultBlock.output || nestedToolResultBlock.content || null,
      }),
    ];
  }

  if (isAssistantTextEvent(sdkMessage)) {
    return [
      buildBodySegmentEvent(base, sequence, sdkMessage, extractAssistantText(sdkMessage)),
    ];
  }

  if (!sdkMessage || typeof sdkMessage !== 'object') {
    return [
      buildActivityEvent(base, sequence, sdkMessage, {
        kind: 'sdk_fallback',
        sourceType: 'unknown',
        summary: 'unknown sdk event',
      }),
    ];
  }

  if (sdkMessage.type === 'system' && sdkMessage.subtype === 'init') {
    return [
      buildSdkMappedEvent(base, sequence, 'sdk.system.init', sdkMessage, {
        cwd: sdkMessage.cwd || null,
        model: sdkMessage.model || null,
        permissionMode: sdkMessage.permissionMode || null,
        tools: Array.isArray(sdkMessage.tools) ? sdkMessage.tools : [],
        slashCommands: Array.isArray(sdkMessage.slash_commands) ? sdkMessage.slash_commands : [],
        skills: Array.isArray(sdkMessage.skills) ? sdkMessage.skills : [],
        plugins: Array.isArray(sdkMessage.plugins) ? sdkMessage.plugins : [],
      }),
    ];
  }

  if (sdkMessage.type === 'system' && sdkMessage.subtype === 'status') {
    return [
      buildSdkMappedEvent(base, sequence, 'sdk.system.status', sdkMessage, {
        status: sdkMessage.status || null,
        permissionMode: sdkMessage.permissionMode || null,
      }),
    ];
  }

  if (sdkMessage.type === 'stream_event') {
    return [
      buildSdkMappedEvent(base, sequence, 'sdk.stream_event', sdkMessage, {
        rawEventType: sdkMessage?.event?.type || null,
        text: extractStreamText(sdkMessage),
        event: sdkMessage.event || null,
      }),
    ];
  }

  if (sdkMessage.type === 'system' && sdkMessage.subtype === 'compact_boundary') {
    return [
      buildSdkMappedEvent(base, sequence, 'sdk.compact_boundary', sdkMessage, {
        trigger: sdkMessage?.compact_metadata?.trigger || null,
        tokens: sdkMessage?.compact_metadata?.pre_tokens ?? null,
      }),
    ];
  }

  if (sdkMessage.type === 'system' && sdkMessage.subtype === 'task_started') {
    return [
      buildSdkMappedEvent(base, sequence, 'sdk.task.started', sdkMessage, {
        taskId: sdkMessage.task_id || null,
        taskType: sdkMessage.task_type || null,
        description: sdkMessage.description || '',
        toolId: sdkMessage.tool_use_id || null,
      }),
    ];
  }

  if (sdkMessage.type === 'system' && sdkMessage.subtype === 'task_progress') {
    return [
      buildSdkMappedEvent(base, sequence, 'sdk.task.progress', sdkMessage, {
        taskId: sdkMessage.task_id || null,
        description: sdkMessage.description || '',
        toolId: sdkMessage.tool_use_id || null,
        usage: sdkMessage.usage || null,
        lastToolName: sdkMessage.last_tool_name || null,
      }),
    ];
  }

  if (sdkMessage.type === 'system' && sdkMessage.subtype === 'task_notification') {
    return [
      buildSdkMappedEvent(base, sequence, 'sdk.task.notification', sdkMessage, {
        taskId: sdkMessage.task_id || null,
        status: sdkMessage.status || null,
        outputFile: sdkMessage.output_file || null,
        summary: sdkMessage.summary || '',
        usage: sdkMessage.usage || null,
      }),
    ];
  }

  if (sdkMessage.type === 'system' && sdkMessage.subtype === 'hook_started') {
    return [
      buildSdkMappedEvent(base, sequence, 'sdk.hook.started', sdkMessage, {
        hookId: sdkMessage.hook_id || null,
        hookName: sdkMessage.hook_name || null,
        hookEvent: sdkMessage.hook_event || null,
      }),
    ];
  }

  if (sdkMessage.type === 'system' && sdkMessage.subtype === 'hook_progress') {
    return [
      buildSdkMappedEvent(base, sequence, 'sdk.hook.progress', sdkMessage, {
        hookId: sdkMessage.hook_id || null,
        hookName: sdkMessage.hook_name || null,
        hookEvent: sdkMessage.hook_event || null,
        output: sdkMessage.output || '',
        stdout: sdkMessage.stdout || '',
        stderr: sdkMessage.stderr || '',
      }),
    ];
  }

  if (sdkMessage.type === 'system' && sdkMessage.subtype === 'hook_response') {
    return [
      buildSdkMappedEvent(base, sequence, 'sdk.hook.response', sdkMessage, {
        hookId: sdkMessage.hook_id || null,
        hookName: sdkMessage.hook_name || null,
        hookEvent: sdkMessage.hook_event || null,
        outcome: sdkMessage.outcome || null,
        output: sdkMessage.output || '',
        stdout: sdkMessage.stdout || '',
        stderr: sdkMessage.stderr || '',
        exitCode: sdkMessage.exit_code ?? null,
      }),
    ];
  }

  if (sdkMessage.type === 'tool_progress') {
    return [
      buildSdkMappedEvent(base, sequence, 'sdk.tool.progress', sdkMessage, {
        toolId: sdkMessage.tool_use_id || null,
        toolName: sdkMessage.tool_name || null,
        parentToolUseId: sdkMessage.parent_tool_use_id || null,
        elapsedTimeSeconds: sdkMessage.elapsed_time_seconds ?? null,
        taskId: sdkMessage.task_id || null,
      }),
    ];
  }

  if (sdkMessage.type === 'tool_use_summary') {
    return [
      buildSdkMappedEvent(base, sequence, 'sdk.tool.summary', sdkMessage, {
        summary: sdkMessage.summary || '',
        toolUseIds: Array.isArray(sdkMessage.preceding_tool_use_ids) ? sdkMessage.preceding_tool_use_ids : [],
      }),
    ];
  }

  if (sdkMessage.type === 'system' && sdkMessage.subtype === 'files_persisted') {
    return [
      buildSdkMappedEvent(base, sequence, 'sdk.files.persisted', sdkMessage, {
        files: Array.isArray(sdkMessage.files) ? sdkMessage.files : [],
        failed: Array.isArray(sdkMessage.failed) ? sdkMessage.failed : [],
        processedAt: sdkMessage.processed_at || null,
      }),
    ];
  }

  if (sdkMessage.type === 'auth_status') {
    return [
      buildSdkMappedEvent(base, sequence, 'sdk.auth.status', sdkMessage, {
        isAuthenticating: Boolean(sdkMessage.isAuthenticating),
        output: Array.isArray(sdkMessage.output) ? sdkMessage.output : [],
        error: sdkMessage.error || null,
      }),
    ];
  }

  if (sdkMessage.type === 'rate_limit') {
    return [
      buildSdkMappedEvent(base, sequence, 'sdk.rate_limit', sdkMessage, {
        message: sdkMessage.message || sdkMessage.content || '',
      }),
    ];
  }

  if (sdkMessage.type === 'prompt_suggestion') {
    return [
      buildSdkMappedEvent(base, sequence, 'sdk.prompt_suggestion', sdkMessage, {
        prompt: sdkMessage.prompt || sdkMessage.suggestion || sdkMessage.content || '',
      }),
    ];
  }

  if (sdkMessage.type === 'assistant_completed') {
    return [
      buildSdkMappedEvent(base, sequence, 'assistant.message.completed', sdkMessage, {
        text: extractAssistantText(sdkMessage),
      }),
    ];
  }

  if (sdkMessage.type === 'tool_use') {
    const toolName = normalizeToolName(sdkMessage.name);
    return [
      buildSdkMappedEvent(base, sequence, 'tool.call.started', sdkMessage, {
        toolId: sdkMessage.id || null,
        toolName,
        input: normalizeToolInput(toolName, sdkMessage.input || {}),
      }),
    ];
  }

  if (sdkMessage.type === 'tool_use_partial') {
    const toolName = normalizeToolName(sdkMessage.toolName);
    return [
      buildSdkMappedEvent(base, sequence, 'tool.call.delta', sdkMessage, {
        toolId: sdkMessage.toolCallId || sdkMessage.toolId || null,
        toolName,
        input: normalizeToolInput(toolName, sdkMessage.toolInput || {}),
      }),
    ];
  }

  if (sdkMessage.type === 'tool_result') {
    const isError = sdkMessage.status === 'error' || sdkMessage.is_error === true;
    return [
      buildSdkMappedEvent(base, sequence, isError ? 'tool.call.failed' : 'tool.call.completed', sdkMessage, {
        toolId: sdkMessage.tool_use_id || sdkMessage.toolId || null,
        toolName: normalizeToolName(sdkMessage.tool_name, sdkMessage.toolName),
        error: sdkMessage.error || null,
        result: sdkMessage.result || sdkMessage.output || null,
      }),
    ];
  }

  if (sdkMessage.type === 'result') {
    return [
      buildSdkMappedEvent(base, sequence, sdkMessage.subtype === 'success' ? 'run.completed' : 'run.failed', sdkMessage, {
        result: sdkMessage.result || '',
        subtype: sdkMessage.subtype || 'unknown',
        durationMs: sdkMessage.duration_ms ?? null,
        durationApiMs: sdkMessage.duration_api_ms ?? null,
        isError: typeof sdkMessage.is_error === 'boolean' ? sdkMessage.is_error : null,
        numTurns: sdkMessage.num_turns ?? null,
        stopReason: sdkMessage.stop_reason ?? null,
        totalCostUsd: sdkMessage.total_cost_usd ?? null,
        usage: sdkMessage.usage || null,
        modelUsage: sdkMessage.modelUsage || null,
        tokenUsage: extractTokenUsage(sdkMessage),
        isCompactOperation: isCompactOperation(sdkMessage),
        permissionDenials: Array.isArray(sdkMessage.permission_denials) ? sdkMessage.permission_denials : [],
        errors: Array.isArray(sdkMessage.errors) ? sdkMessage.errors : [],
        structuredOutput: sdkMessage.structured_output ?? null,
      }),
    ];
  }

  return [
    buildActivityEvent(base, sequence, sdkMessage, {
      kind: 'sdk_fallback',
      sourceType: sdkMessage.type || 'unknown',
      summary: sdkMessage.subtype || sdkMessage?.event?.type || sdkMessage.type || 'unknown',
      raw: sdkMessage,
    }),
  ];
}

export function translateClaudeV2Event({ sdkEvent, runId, sessionId = null, traceId = null, sequence = 0 }) {
  const base = {
    runId,
    sessionId,
    traceId,
  };
  return translateClaudeV2EventInternal(base, sdkEvent, sequence);
}

// 把 Claude SDK 原始消息翻译成项目自己的稳定事件。
// 这里是 SDK 语义与产品语义的隔离墙。
export function createClaudeV2EventTranslator(base) {
  const toolPreviewTracker = createClaudeStreamToolPreviewTracker();

  return (sdkMessage, sequence) => {
    const previewMessages = toolPreviewTracker
      .consume(sdkMessage)
      .filter((message) => {
        const toolInput = message?.toolInput;
        return Boolean(toolInput && Object.keys(toolInput).length > 0);
      });

    const previewEvents = previewMessages.flatMap((message, index) => (
      translateClaudeV2EventInternal(base, message, sequence + index)
    ));
    const primaryEvents = translateClaudeV2EventInternal(
      base,
      sdkMessage,
      sequence + previewEvents.length,
    );

    const combinedEvents = [...previewEvents, ...primaryEvents];
    return combinedEvents.length === 1 ? combinedEvents[0] : combinedEvents;
  };
}
