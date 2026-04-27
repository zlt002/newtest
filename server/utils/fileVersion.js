import crypto from 'crypto';

export function getFileContentVersion(content) {
  const normalizedContent = typeof content === 'string' ? content : String(content ?? '');

  return crypto.createHash('sha1').update(normalizedContent, 'utf8').digest('hex');
}
