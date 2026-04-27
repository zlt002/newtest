// 新建 session run，并向 runtime 请求新的 Claude session。
import { buildClaudeV2RuntimeOptions } from '../runtime/claude-v2-request-builder.js';
import { extractUserInputText } from './user-message-text.js';
import { loadClaudePluginsSync } from '../../../utils/claude-plugin-config.js';

export async function startConversationRun({
  repo,
  runtime,
  title,
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
  const normalizedProjectPath = typeof projectPath === 'string' ? projectPath.trim() : '';
  if (!normalizedProjectPath) {
    throw new Error('New Claude V2 sessions require a concrete projectPath');
  }

  const run = await repo.createRun({
    sessionId: null,
    userInput: extractUserInputText({ prompt, message }),
  });
  // 新 session 的真实 sessionId 由 Claude runtime 在初始化后提供。
  const runtimeOptions = buildClaudeV2RuntimeOptions({
    model,
    projectPath: normalizedProjectPath,
    effort,
    permissionMode,
    toolsSettings,
    writer,
    hooks,
    plugins: Array.isArray(plugins) ? plugins : loadClaudePluginsSync({ projectPath: normalizedProjectPath }),
  });
  const session = runtime.create(runtimeOptions);

  return {
    run,
    session,
    sessionId: null,
  };
}
