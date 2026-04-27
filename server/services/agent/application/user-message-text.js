function extractTextFromContentBlocks(content) {
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join('\n');
}

export function extractUserInputText({ prompt = '', message = null } = {}) {
  const messageContent = message && typeof message === 'object' ? message.content : null;

  if (typeof messageContent === 'string') {
    const normalized = messageContent.trim();
    if (normalized) {
      return normalized;
    }
  }

  const blockText = extractTextFromContentBlocks(messageContent);
  if (blockText) {
    return blockText;
  }

  return String(prompt || '').trim();
}
