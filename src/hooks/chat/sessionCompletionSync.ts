import type { Project } from '@/types/app';
import type { SessionProvider } from '@/types/app';
import type { SessionStore } from '@/stores/useSessionStore';

async function defaultWait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function hasCompletedAssistantReply(sessionStore: SessionStore, sessionId: string): boolean {
  if (!sessionStore.getSessionSlot) {
    return true;
  }

  const slot = sessionStore.getSessionSlot(sessionId);
  const messages = Array.isArray(slot?.serverMessages) ? slot.serverMessages : [];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.kind === 'text' && message?.role === 'assistant' && String(message?.content || '').trim()) {
      return true;
    }
    if (message?.kind === 'thinking') {
      return false;
    }
  }

  return true;
}

interface SyncCompletedSessionHistoryOptions {
  sessionId: string | null | undefined;
  provider: SessionProvider;
  selectedProject: Project | null;
  sessionStore: SessionStore;
  wait?: (ms: number) => Promise<void>;
}

export async function syncCompletedSessionHistory({
  sessionId,
  provider,
  selectedProject,
  sessionStore,
  wait = defaultWait,
}: SyncCompletedSessionHistoryOptions): Promise<void> {
  if (!sessionId || !selectedProject) {
    return;
  }

  try {
    await sessionStore.refreshFromServer(sessionId, {
      provider,
      projectName: selectedProject.name,
      projectPath: selectedProject.fullPath || selectedProject.path || '',
    });

    if (!hasCompletedAssistantReply(sessionStore, sessionId)) {
      await wait(150);
      await sessionStore.refreshFromServer(sessionId, {
        provider,
        projectName: selectedProject.name,
        projectPath: selectedProject.fullPath || selectedProject.path || '',
      });
    }
  } catch (error) {
    console.error('[Chat] Error syncing completed session history:', error);
  }
}
