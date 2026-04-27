function isTemporarySessionId(sessionId: string | null | undefined): boolean {
  return Boolean(sessionId && sessionId.startsWith('new-session-'));
}

interface StreamingTargetOptions {
  streamSessionId: string | null | undefined;
  activeViewSessionId: string | null | undefined;
}

export function resolveStreamingTargetSessionId({
  streamSessionId,
  activeViewSessionId,
}: StreamingTargetOptions): string | null {
  if (!streamSessionId) {
    return null;
  }

  if (isTemporarySessionId(activeViewSessionId)) {
    return activeViewSessionId ?? null;
  }

  return streamSessionId;
}

export function shouldAppendDeltaAsBackgroundRealtime({
  streamSessionId,
  activeViewSessionId,
}: StreamingTargetOptions): boolean {
  if (!streamSessionId) {
    return false;
  }

  const targetSessionId = resolveStreamingTargetSessionId({
    streamSessionId,
    activeViewSessionId,
  });

  return Boolean(targetSessionId && targetSessionId !== activeViewSessionId);
}
