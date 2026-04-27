export function shouldPreserveTransientSessionState({
  currentSessionId,
  nextSessionId,
  pendingSessionId,
}: {
  currentSessionId: string | null;
  nextSessionId: string | null;
  pendingSessionId: string | null;
}) {
  if (!nextSessionId) {
    return false;
  }

  if (pendingSessionId && pendingSessionId === nextSessionId) {
    return true;
  }

  return Boolean(currentSessionId && currentSessionId.startsWith('new-session-'));
}
