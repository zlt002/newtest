// 负责判断当前旧聊天页是否还对应同一条 V2 session。
// 这能避免在切换项目 / 会话时错误复用上一条执行上下文。
import type { ProjectSession } from '../../../types/app';

type AgentConversationSelection = {
  projectKey: string | null;
  sessionId: string | null;
};

export function getAgentConversationSelection({
  selectedProject,
  selectedSession,
}: {
  selectedProject: { fullPath?: string; path?: string; name?: string } | null;
  selectedSession: ProjectSession | null;
}): AgentConversationSelection {
  const projectKey = selectedProject
    ? String(selectedProject.fullPath || selectedProject.path || selectedProject.name || '').trim() || null
    : null;
  const sessionId = selectedSession?.id || null;
  return { projectKey, sessionId };
}

export function shouldResetAgentConversationId({
  previousSelection,
  nextSelection,
}: {
  previousSelection: AgentConversationSelection;
  nextSelection: AgentConversationSelection;
}) {
  return (
    previousSelection.projectKey !== nextSelection.projectKey ||
    previousSelection.sessionId !== nextSelection.sessionId
  );
}
