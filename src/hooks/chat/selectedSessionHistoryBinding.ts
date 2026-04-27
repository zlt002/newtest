export function resolveSelectedSessionHistoryId({
  activeSessionId,
  selectedSessionId,
}: {
  activeSessionId: string | null;
  selectedSessionId: string | null;
}) {
  if (!activeSessionId || !selectedSessionId) {
    return null;
  }

  return activeSessionId === selectedSessionId ? selectedSessionId : null;
}

export function projectSelectedSessionHistoryUiState({
  selectedSessionHistoryId,
  hasMoreMessages,
  totalMessages,
  allMessagesLoaded,
  isLoadingAllMessages,
  loadAllJustFinished,
  showLoadAllOverlay,
}: {
  selectedSessionHistoryId: string | null;
  hasMoreMessages: boolean;
  totalMessages: number;
  allMessagesLoaded: boolean;
  isLoadingAllMessages: boolean;
  loadAllJustFinished: boolean;
  showLoadAllOverlay: boolean;
}) {
  if (!selectedSessionHistoryId) {
    return {
      hasMoreMessages: false,
      totalMessages: 0,
      allMessagesLoaded: false,
      isLoadingAllMessages: false,
      loadAllJustFinished: false,
      showLoadAllOverlay: false,
    };
  }

  return {
    hasMoreMessages,
    totalMessages,
    allMessagesLoaded,
    isLoadingAllMessages,
    loadAllJustFinished,
    showLoadAllOverlay,
  };
}

export function shouldApplySelectedSessionHistoryResponse({
  latestSelectedSessionHistoryId,
  requestSessionId,
}: {
  latestSelectedSessionHistoryId: string | null;
  requestSessionId: string;
}) {
  return latestSelectedSessionHistoryId === requestSessionId;
}
