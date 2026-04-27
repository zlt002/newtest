interface ChatMessageLike {
  id?: string;
  messageId?: string;
  displayText?: string;
  content?: string;
  isToolUse?: boolean;
}

interface ChatMessageIdentity {
  id?: string;
  messageId?: string;
}

export function buildChatMessageIdentity(msg: ChatMessageLike = {}): ChatMessageIdentity {
  const id = typeof msg.id === 'string' && msg.id.trim() ? msg.id : undefined;
  const messageId = typeof msg.messageId === 'string' && msg.messageId.trim()
    ? msg.messageId
    : id;

  return {
    ...(id ? { id } : {}),
    ...(messageId ? { messageId } : {}),
  };
}

export function getToolUseLeadText(message: ChatMessageLike = {}): string {
  if (typeof message.displayText === 'string' && message.displayText.trim()) {
    return message.displayText;
  }

  if (typeof message.content === 'string' && message.content.trim() && !message.isToolUse) {
    return message.content;
  }

  return '';
}
