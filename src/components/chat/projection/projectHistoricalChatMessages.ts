import type { ChatImage, ChatMessage } from '../../chat/types/types.ts';
import type { CanonicalSessionMessage } from '../types/sessionHistory.ts';
import { isExpandedSkillPromptContent, isProtocolOnlyContent, sanitizeDisplayText } from '../../chat/utils/protocolNoise.ts';

function normalizeContentBlocks(content: unknown): Record<string, unknown>[] {
  if (!Array.isArray(content)) {
    return [];
  }

  return content
    .filter((block) => block && typeof block === 'object' && !Array.isArray(block))
    .map((block) => block as Record<string, unknown>);
}

function getString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function extractMessageText(message: CanonicalSessionMessage): string {
  const directText = getString(message.text);
  if (directText) {
    return directText;
  }

  return normalizeContentBlocks(message.content)
    .filter((block) => block.type === 'text' && typeof block.text === 'string' && block.text.trim())
    .map((block) => String(block.text).trim())
    .join('\n')
    .trim();
}

function buildImageName(index: number, mimeType: string): string {
  const extension = mimeType.startsWith('image/')
    ? mimeType.slice('image/'.length).replace(/[^a-z0-9.+-]/gi, '') || 'png'
    : 'png';
  return `image-${index + 1}.${extension}`;
}

function extractMessageImages(message: CanonicalSessionMessage): ChatImage[] {
  const blocks = normalizeContentBlocks(message.content);
  const images: ChatImage[] = [];

  blocks.forEach((block, index) => {
    if (block.type !== 'image' || !block.source || typeof block.source !== 'object' || Array.isArray(block.source)) {
      return;
    }

    const source = block.source as Record<string, unknown>;
    const mimeType = getString(source.media_type) || 'image/png';
    const name = buildImageName(images.length, mimeType);
    const base64Data = getString(source.data);

    if (getString(source.type) === 'base64' && base64Data) {
      images.push({
        data: `data:${mimeType};base64,${base64Data}`,
        name,
        mimeType,
      });
      return;
    }

    images.push({
      data: null,
      name,
      mimeType,
      isPlaceholder: true,
      placeholderLabel: '已发送图片',
    });
  });

  return images;
}

function normalizeSignatureText(value: unknown): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function isSameUserMessage(historyMessage: ChatMessage, transientMessage: ChatMessage) {
  if (historyMessage.type !== 'user' || transientMessage.type !== 'user') {
    return false;
  }

  const historyContent = normalizeSignatureText(historyMessage.content);
  const transientContent = normalizeSignatureText(transientMessage.content);
  if (!historyContent || historyContent !== transientContent) {
    return false;
  }

  const historyTimestamp = Date.parse(String(historyMessage.timestamp || ''));
  const transientTimestamp = Date.parse(String(transientMessage.timestamp || ''));
  if (!Number.isFinite(historyTimestamp) || !Number.isFinite(transientTimestamp)) {
    return false;
  }

  return Math.abs(historyTimestamp - transientTimestamp) <= 5_000;
}

function isSameAssistantMessage(historyMessage: ChatMessage, transientMessage: ChatMessage) {
  if (historyMessage.type !== 'assistant' || transientMessage.type !== 'assistant') {
    return false;
  }

  if (historyMessage.isThinking || transientMessage.isThinking) {
    return false;
  }

  if (historyMessage.isTaskNotification || transientMessage.isTaskNotification) {
    return false;
  }

  const historyContent = normalizeSignatureText(historyMessage.content);
  const transientContent = normalizeSignatureText(transientMessage.content);
  if (!historyContent || historyContent !== transientContent) {
    return false;
  }

  const historyTimestamp = Date.parse(String(historyMessage.timestamp || ''));
  const transientTimestamp = Date.parse(String(transientMessage.timestamp || ''));
  if (!Number.isFinite(historyTimestamp) || !Number.isFinite(transientTimestamp)) {
    return false;
  }

  return Math.abs(historyTimestamp - transientTimestamp) <= 5_000;
}

function isExpandedSkillPromptEcho(historyMessage: ChatMessage, transientMessage: ChatMessage) {
  if (historyMessage.type !== 'user' || transientMessage.type !== 'user') {
    return false;
  }

  const historyContent = String(historyMessage.content || '').trim();
  const transientContent = String(transientMessage.content || '').trim();
  if (!historyContent || !transientContent) {
    return false;
  }

  if (!isExpandedSkillPromptContent(transientContent)) {
    return false;
  }

  if (!historyContent.startsWith('/')) {
    return false;
  }

  const historyTimestamp = Date.parse(String(historyMessage.timestamp || ''));
  const transientTimestamp = Date.parse(String(transientMessage.timestamp || ''));
  if (!Number.isFinite(historyTimestamp) || !Number.isFinite(transientTimestamp)) {
    return false;
  }

  return Math.abs(historyTimestamp - transientTimestamp) <= 5_000;
}

function projectNotificationMessage(
  message: CanonicalSessionMessage,
  content: string,
  normalizedKind: ChatMessage['normalizedKind'],
  taskStatus: string,
): ChatMessage | null {
  const text = content.trim();
  if (!text) {
    return null;
  }

  return {
    id: message.id,
    messageId: message.id,
    sessionId: message.sessionId,
    type: 'assistant',
    content: text,
    timestamp: message.timestamp,
    normalizedKind,
    isTaskNotification: true,
    taskStatus,
  };
}

export function projectHistoricalChatMessages(messages: CanonicalSessionMessage[]): ChatMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  const projected: ChatMessage[] = [];

  for (const message of messages) {
    const text = extractMessageText(message);
    const images = extractMessageImages(message);
    const rawKind = getString(message.kind || message.type);
    const normalizedKind = rawKind as ChatMessage['normalizedKind'];
    const sanitizedText = sanitizeDisplayText(text);

    if (message.role === 'user' && (normalizedKind === 'text' || rawKind === 'message' || !normalizedKind)) {
      if (isExpandedSkillPromptContent(text)) {
        continue;
      }

      const hasRenderableImages = images.length > 0;
      const hasProtocolOnlyText = Boolean(text) && isProtocolOnlyContent(text);
      if ((!sanitizedText && !hasRenderableImages) || hasProtocolOnlyText) {
        continue;
      }

      projected.push({
        id: message.id,
        messageId: message.id,
        sessionId: message.sessionId,
        type: 'user',
        content: sanitizedText,
        timestamp: message.timestamp,
        normalizedKind: 'text',
        ...(hasRenderableImages ? { images } : {}),
      });
      continue;
    }

    if (message.role === 'assistant' && (normalizedKind === 'text' || rawKind === 'message' || !normalizedKind)) {
      if (!sanitizedText || isProtocolOnlyContent(text)) {
        continue;
      }

      projected.push({
        id: message.id,
        messageId: message.id,
        sessionId: message.sessionId,
        type: 'assistant',
        content: sanitizedText,
        timestamp: message.timestamp,
        normalizedKind: 'text',
      });
      continue;
    }

    if (normalizedKind === 'compact_boundary') {
      const notification = projectNotificationMessage(
        message,
        '会话上下文已压缩，后续历史从压缩边界继续。',
        'compact_boundary',
        'compacted',
      );
      if (notification) {
        projected.push(notification);
      }
      continue;
    }

    if (normalizedKind === 'error') {
      projected.push({
        id: message.id,
        messageId: message.id,
        sessionId: message.sessionId,
        type: 'error',
        content: text || 'Unknown error',
        timestamp: message.timestamp,
        normalizedKind: 'error',
      });
      continue;
    }

    if (normalizedKind === 'thinking' && sanitizedText) {
      projected.push({
        id: message.id,
        messageId: message.id,
        sessionId: message.sessionId,
        type: 'assistant',
        content: sanitizedText,
        timestamp: message.timestamp,
        normalizedKind: 'thinking',
        isThinking: true,
      });
    }

    if (normalizedKind === 'session_status' || normalizedKind === 'debug_ref') {
      continue;
    }
  }

  return projected;
}

export function mergeHistoricalChatMessages(
  historicalMessages: ChatMessage[],
  transientMessages: ChatMessage[],
): ChatMessage[] {
  if (historicalMessages.length === 0) {
    return transientMessages;
  }
  if (transientMessages.length === 0) {
    return historicalMessages;
  }

  const seenIds = new Set(
    historicalMessages.flatMap((message) => [message.id, message.messageId].filter(Boolean) as string[]),
  );

  const extras = transientMessages.filter((message) => {
    const messageId = typeof message.id === 'string' && message.id.trim() ? message.id.trim() : null;
    const intrinsicId = typeof message.messageId === 'string' && message.messageId.trim() ? message.messageId.trim() : null;
    if ((messageId && seenIds.has(messageId)) || (intrinsicId && seenIds.has(intrinsicId))) {
      return false;
    }

    return !historicalMessages.some((historyMessage) =>
      isSameUserMessage(historyMessage, message)
      || isSameAssistantMessage(historyMessage, message)
      || isExpandedSkillPromptEcho(historyMessage, message)
    );
  });

  if (extras.length === 0) {
    return historicalMessages;
  }

  return [...historicalMessages, ...extras].sort((left, right) => {
    const leftTime = Date.parse(String(left.timestamp || ''));
    const rightTime = Date.parse(String(right.timestamp || ''));
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return 0;
  });
}
