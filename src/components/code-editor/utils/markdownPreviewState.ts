export function isMarkdownFileName(fileName: string): boolean {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension === 'md' || extension === 'markdown';
}

export function getDefaultMarkdownPreview(fileName: string): boolean {
  return isMarkdownFileName(fileName);
}
