export function resolveVisibleChatSessionId({
  selectedSessionId,
  currentSessionId,
  pendingSessionId,
}: {
  selectedSessionId: string | null;
  currentSessionId: string | null;
  pendingSessionId: string | null;
}) {
  if (currentSessionId) {
    return currentSessionId;
  }

  if (pendingSessionId) {
    return pendingSessionId;
  }

  return selectedSessionId || null;
}
