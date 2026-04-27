type UserMessageCollapseStateInput = {
  isExpanded: boolean;
  isOverflowing: boolean;
};

type UserMessageCollapseState = {
  shouldClamp: boolean;
  shouldShowToggle: boolean;
  toggleLabel: '展开' | '收起' | null;
};

export function getUserMessageCollapseState({
  isExpanded,
  isOverflowing,
}: UserMessageCollapseStateInput): UserMessageCollapseState {
  if (!isOverflowing) {
    return {
      shouldClamp: false,
      shouldShowToggle: false,
      toggleLabel: null,
    };
  }

  return {
    shouldClamp: !isExpanded,
    shouldShowToggle: true,
    toggleLabel: isExpanded ? '收起' : '展开',
  };
}

export function shouldCollapseUserMessage(content: string, maxLines = 5): boolean {
  if (!content) {
    return false;
  }

  return content.split(/\r?\n/).length > maxLines;
}
