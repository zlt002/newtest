export function shouldRenderChatEmptyState({
  chatMessagesLength,
  hasRenderableV2History,
  isLoadingSessionMessages,
  isLoading,
}: {
  chatMessagesLength: number;
  hasRenderableV2History?: boolean;
  isLoadingSessionMessages: boolean;
  isLoading: boolean;
}) {
  if (chatMessagesLength > 0) {
    return false;
  }

  if (hasRenderableV2History) {
    return false;
  }

  if (isLoadingSessionMessages) {
    return false;
  }

  // Suppress the generic empty state while the first turn of a new chat
  // is already in flight, otherwise the "continue conversation" card flashes
  // between local pending UI and the first server-backed message.
  if (isLoading) {
    return false;
  }

  return true;
}
