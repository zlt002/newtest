// WebSocket / transport 进入 V2 的总入口。
// 这里负责判断是新会话还是续跑会话，并把事件回推给前端 writer。
import path from 'path';
import { resolveClaudeResumeSessionId } from '../../../utils/claude-session.js';

// 用项目目录名生成一个默认 conversation 标题。
function buildConversationTitle(projectPath) {
  const title = path.basename(String(projectPath || '').trim());
  return title || '新对话';
}

function requireProjectPathForNewSession(projectPath) {
  const normalizedProjectPath = String(projectPath || '').trim();
  if (!normalizedProjectPath) {
    throw new Error('New Claude V2 sessions require a concrete projectPath');
  }
  return normalizedProjectPath;
}

function normalizeContextFilePaths(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue;
    }

    const filePath = entry.trim();
    if (!filePath || seen.has(filePath)) {
      continue;
    }

    seen.add(filePath);
    normalized.push(filePath);
  }

  return normalized;
}

function buildContextFilePrelude(contextFilePaths) {
  return contextFilePaths
    .map((filePath) => `<context-file>${filePath}</context-file>`)
    .join('\n')
    .trim();
}

function prependContextToMessageContent(content, prelude) {
  if (!prelude) {
    return content;
  }

  if (typeof content === 'string') {
    return content ? `${prelude}\n${content}` : prelude;
  }

  if (Array.isArray(content)) {
    return [
      { type: 'text', text: prelude },
      ...content,
    ];
  }

  return prelude;
}

function injectContextFilesIntoUserMessage(message, contextFilePaths) {
  const normalizedMessage = message && typeof message === 'object' ? { ...message } : { role: 'user', content: '' };
  const prelude = buildContextFilePrelude(contextFilePaths);

  if (!prelude) {
    return normalizedMessage;
  }

  return {
    ...normalizedMessage,
    content: prependContextToMessageContent(normalizedMessage.content, prelude),
  };
}

// WebSocket / transport 层进入 V2 的统一入口。
// 这里负责把“是否继续已有会话”这件事翻译成 start / continue 两种 application 调用。
export async function handleClaudeCommandWithAgentV2({
  command,
  options = {},
  services,
  writer,
  hooks,
}) {
  const message = options.message && typeof options.message === 'object'
    ? options.message
    : null;
  const contextFilePaths = normalizeContextFilePaths(options.contextFilePaths);
  const effectiveMessage = injectContextFilesIntoUserMessage(message, contextFilePaths);
  const prompt = String(command || '').trim();
  const hasMessageContent = Boolean(
    effectiveMessage
    && (
      typeof effectiveMessage.content === 'string'
      || (Array.isArray(effectiveMessage.content) && effectiveMessage.content.length > 0)
    ),
  );

  if (!prompt && !hasMessageContent) {
    throw new Error('Claude command cannot be empty');
  }

  const continueSessionId = resolveClaudeResumeSessionId(options);

  const emittedEventIds = new Set();
  // 避免同一事件被重复向前端发送。
  const emitEvent = (event) => {
    if (!event || emittedEventIds.has(event.eventId)) {
      return;
    }
    emittedEventIds.add(event.eventId);
    writer.send(event);
  };

  // 明确绑定到 conversation 时，继续同一 conversation；否则创建新 conversation/run。
  let result;
  if (continueSessionId) {
    if (typeof services.continueSessionRun === 'function') {
      result = await services.continueSessionRun({
        sessionId: continueSessionId,
        prompt,
        images: options.images,
        message: effectiveMessage,
        model: options.model,
        projectPath: options.projectPath,
        effort: options.effort,
        permissionMode: options.permissionMode,
        toolsSettings: options.toolsSettings,
        traceId: options.traceId,
        writer,
        onEvent: emitEvent,
        hooks,
      });
    } else {
      result = await services.continueConversationRun({
        conversationId: continueSessionId,
        prompt,
        message: effectiveMessage,
        model: options.model,
        projectPath: options.projectPath,
        effort: options.effort,
        permissionMode: options.permissionMode,
        toolsSettings: options.toolsSettings,
        traceId: options.traceId,
        writer,
        onEvent: emitEvent,
        hooks,
      });
    }
  } else if (typeof services.startSessionRun === 'function') {
    const projectPath = requireProjectPathForNewSession(options.projectPath);
    result = await services.startSessionRun({
      title: buildConversationTitle(projectPath),
      prompt,
      images: options.images,
      message: effectiveMessage,
      model: options.model,
      projectPath,
      effort: options.effort,
      permissionMode: options.permissionMode,
      toolsSettings: options.toolsSettings,
      traceId: options.traceId,
      writer,
      onEvent: emitEvent,
      hooks,
    });
  } else {
    const projectPath = requireProjectPathForNewSession(options.projectPath);
    result = await services.startConversationRun({
      title: buildConversationTitle(projectPath),
      prompt,
      message: effectiveMessage,
      model: options.model,
      projectPath,
      effort: options.effort,
      permissionMode: options.permissionMode,
      toolsSettings: options.toolsSettings,
      traceId: options.traceId,
      writer,
      onEvent: emitEvent,
      hooks,
    });
  }

  // 把 run 的完整事件序列补发给前端，保证重放一致性。
  for (const event of result.events || []) {
    emitEvent(event);
  }

  return result;
}
