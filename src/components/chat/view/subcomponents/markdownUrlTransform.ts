import { defaultUrlTransform } from 'react-markdown';

export function preserveMarkdownHref(url: string): string {
  const trimmed = String(url || '').trim();

  if (!trimmed) {
    return '';
  }

  // `react-markdown` 默认会把 file:// 协议清空，导致本地文件链接渲染成空 href。
  if (/^file:\/\/\/?/i.test(trimmed)) {
    return trimmed;
  }

  return defaultUrlTransform(trimmed);
}
