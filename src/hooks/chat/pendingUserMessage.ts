export function mergePendingUserMessage<T extends { type: string }>(
  storeMessages: T[],
  pendingUserMessage: T | null | undefined,
): T[] {
  if (!pendingUserMessage) {
    return storeMessages;
  }

  const hasPersistedUserMessage = storeMessages.some((message) => message.type === 'user');
  if (hasPersistedUserMessage) {
    return storeMessages;
  }

  return [pendingUserMessage, ...storeMessages];
}
