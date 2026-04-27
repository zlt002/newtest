function dedupeMessages(messages: Array<{ id?: string }>): Array<{ id?: string }> {
  const seen = new Set<string>();
  const deduped: Array<{ id?: string }> = [];

  for (const message of messages) {
    if (!message?.id || seen.has(message.id)) {
      continue;
    }
    seen.add(message.id);
    deduped.push(message);
  }

  return deduped;
}

export function rebindSessionSlotData(sourceSlot: Record<string, any> | null | undefined, targetSlot: Record<string, any>): Record<string, any> {
  if (!sourceSlot) {
    return targetSlot;
  }

  return {
    ...targetSlot,
    serverMessages: dedupeMessages([
      ...(sourceSlot.serverMessages || []),
      ...(targetSlot.serverMessages || []),
    ]),
    realtimeMessages: dedupeMessages([
      ...(sourceSlot.realtimeMessages || []),
      ...(targetSlot.realtimeMessages || []),
    ]),
    fetchedAt: Math.max(sourceSlot.fetchedAt || 0, targetSlot.fetchedAt || 0),
    total: Math.max(sourceSlot.total || 0, targetSlot.total || 0),
    hasMore: Boolean(sourceSlot.hasMore || targetSlot.hasMore),
    offset: Math.max(sourceSlot.offset || 0, targetSlot.offset || 0),
    tokenUsage: targetSlot.tokenUsage ?? sourceSlot.tokenUsage ?? null,
    status: targetSlot.status === 'error' ? targetSlot.status : sourceSlot.status || targetSlot.status,
  };
}
