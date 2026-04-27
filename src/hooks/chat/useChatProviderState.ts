import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SetStateAction } from 'react';
import {
  type PendingDecisionRequest,
  type PendingQuestionRequest,
  type PendingToolApprovalRequest,
  type PermissionMode,
  isPendingQuestionRequest,
  isPendingToolApprovalRequest,
} from '@components/chat/types/types';
import { CLAUDE_MODELS } from '../../../shared/modelConstants';
import type { ProjectSession } from '@/types/app';

interface UseChatProviderStateArgs {
  selectedSession: ProjectSession | null;
}

function isValidPermissionMode(value: unknown): value is PermissionMode {
  return value === 'default'
    || value === 'dontAsk'
    || value === 'acceptEdits'
    || value === 'bypassPermissions'
    || value === 'plan';
}

function parsePermissionMode(value: string | null | undefined): PermissionMode | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return isValidPermissionMode(normalized) ? normalized : null;
}

function readDefaultPermissionMode(): PermissionMode {
  try {
    const raw = localStorage.getItem('claude-settings');
    if (!raw) {
      return 'bypassPermissions';
    }
    const parsed = JSON.parse(raw);
    return parsePermissionMode(parsed?.permissionMode) || 'bypassPermissions';
  } catch {
    return 'bypassPermissions';
  }
}

export function useChatProviderState({ selectedSession }: UseChatProviderStateArgs) {
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(() => readDefaultPermissionMode());
  const [pendingApprovalRequests, setPendingApprovalRequests] = useState<PendingToolApprovalRequest[]>([]);
  const [pendingQuestionRequests, setPendingQuestionRequests] = useState<PendingQuestionRequest[]>([]);
  const [claudeModel, setClaudeModel] = useState<string>(() => {
    return localStorage.getItem('claude-model') || CLAUDE_MODELS.DEFAULT;
  });

  useEffect(() => {
    if (!selectedSession?.id) {
      setPermissionMode(readDefaultPermissionMode());
      return;
    }

    const savedMode = localStorage.getItem(`permissionMode-${selectedSession.id}`);
    setPermissionMode(parsePermissionMode(savedMode) || readDefaultPermissionMode());
  }, [selectedSession?.id]);

  useEffect(() => {
    // Claude-only mode does not persist provider selection.
  }, []);

  useEffect(() => {
    localStorage.setItem('claude-model', claudeModel);
  }, [claudeModel]);

  useEffect(() => {
    setPendingApprovalRequests((previous) =>
      previous.filter((request) => !request.sessionId || request.sessionId === selectedSession?.id),
    );
    setPendingQuestionRequests((previous) =>
      previous.filter((request) => !request.sessionId || request.sessionId === selectedSession?.id),
    );
  }, [selectedSession?.id]);

  const pendingDecisionRequests = useMemo<PendingDecisionRequest[]>(
    () => [...pendingApprovalRequests, ...pendingQuestionRequests],
    [pendingApprovalRequests, pendingQuestionRequests],
  );

  const setPendingDecisionRequests = useCallback((nextValue: SetStateAction<PendingDecisionRequest[]>) => {
    const nextRequests = typeof nextValue === 'function'
      ? nextValue([...pendingApprovalRequests, ...pendingQuestionRequests])
      : nextValue;

    setPendingApprovalRequests(nextRequests.filter(isPendingToolApprovalRequest));
    setPendingQuestionRequests(nextRequests.filter(isPendingQuestionRequest));
  }, [pendingApprovalRequests, pendingQuestionRequests]);

  const cyclePermissionMode = useCallback(() => {
    const modes: PermissionMode[] = ['default', 'dontAsk', 'acceptEdits', 'bypassPermissions', 'plan'];

    const currentIndex = modes.indexOf(permissionMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    const nextMode = modes[nextIndex];
    setPermissionMode(nextMode);

    if (selectedSession?.id) {
      localStorage.setItem(`permissionMode-${selectedSession.id}`, nextMode);
    }
  }, [permissionMode, selectedSession?.id]);

  return {
    provider: 'claude' as const,
    claudeModel,
    setClaudeModel,
    permissionMode,
    setPermissionMode,
    pendingApprovalRequests,
    setPendingApprovalRequests,
    pendingQuestionRequests,
    setPendingQuestionRequests,
    pendingDecisionRequests,
    setPendingDecisionRequests,
    cyclePermissionMode,
  };
}
