// 在已绑定 runtime session 的 conversation 上继续创建新 run。
import { buildClaudeV2RuntimeOptions } from '../runtime/claude-v2-request-builder.js';
import { extractUserInputText } from './user-message-text.js';
import { loadClaudePluginsSync } from '../../../utils/claude-plugin-config.js';

function getLiveSession(runtime, sessionId) {
  if (typeof runtime.hasLiveSession === 'function' && !runtime.hasLiveSession(sessionId)) {
    return null;
  }

  if (typeof runtime.getLiveSession === 'function') {
    return runtime.getLiveSession(sessionId) || null;
  }

  if (typeof runtime.get === 'function') {
    return runtime.get(sessionId) || null;
  }

  return null;
}

function reconnectSessionWriter(runtime, sessionId, writer) {
  if (!writer) {
    return false;
  }

  if (typeof runtime.reconnectSessionWriter === 'function') {
    return runtime.reconnectSessionWriter(sessionId, writer);
  }

  if (typeof runtime.updateWriter === 'function') {
    return runtime.updateWriter(sessionId, writer);
  }

  return false;
}

export async function continueConversationRun({
  repo,
  runtime,
  sessionId,
  prompt,
  message,
  model,
  projectPath,
  effort,
  permissionMode,
  toolsSettings,
  writer,
  hooks,
  plugins,
}) {
  const normalizedSessionId = String(sessionId || '').trim() || null;
  if (!normalizedSessionId) {
    throw new Error('Unable to continue run without a bound Claude session');
  }

  // 继续对话时只创建新的 run；真正决定 resume 的是 sessionId 本身。
  const run = await repo.createRun({
    sessionId: normalizedSessionId,
    userInput: extractUserInputText({ prompt, message }),
  });
  const runtimeOptions = buildClaudeV2RuntimeOptions({
    model,
    projectPath,
    effort,
    permissionMode,
    toolsSettings,
    writer,
    hooks,
    plugins: Array.isArray(plugins)
      ? plugins
      : loadClaudePluginsSync({ projectPath: typeof projectPath === 'string' ? projectPath.trim() : '' }),
  });
  const liveSession = getLiveSession(runtime, normalizedSessionId);
  if (liveSession) {
    reconnectSessionWriter(runtime, normalizedSessionId, writer);
    return {
      run,
      session: liveSession,
      sessionId: normalizedSessionId,
      sessionRecord: null,
    };
  }

  const session = runtime.resume(normalizedSessionId, runtimeOptions);

  return {
    run,
    session,
    sessionId: normalizedSessionId,
    sessionRecord: null,
  };
}
