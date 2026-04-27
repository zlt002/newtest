type ComposerSubmitMode = 'continue' | 'new' | 'new-conversation';

interface ComposerSubmitTarget {
  mode: ComposerSubmitMode;
  sessionId: string | null;
}

interface ComposerSubmitTargetInput {
  selectedSessionId: string | null;
  currentSessionId: string | null;
}

/**
 * Resolve the explicit submission intent for the composer.
 */
export function resolveComposerSubmitTarget({
  selectedSessionId,
  currentSessionId,
}: ComposerSubmitTargetInput): ComposerSubmitTarget {
  if (currentSessionId && currentSessionId.startsWith('new-session-')) {
    return {
      mode: 'new',
      sessionId: currentSessionId,
    };
  }

  if (selectedSessionId) {
    return {
      mode: 'continue',
      sessionId: selectedSessionId,
    };
  }

  return {
    mode: 'new-conversation',
    sessionId: null,
  };
}
