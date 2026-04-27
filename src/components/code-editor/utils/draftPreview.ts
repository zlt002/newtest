import type { FileDraftPreviewOperation } from '../types/types';

function replaceFirst(source: string, search: string, replacement: string) {
  const index = source.indexOf(search);
  if (index === -1) {
    return source;
  }

  return `${source.slice(0, index)}${replacement}${source.slice(index + search.length)}`;
}

function getFirstNonEmptyLine(text: string): string | null {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return lines[0] ?? null;
}

function getLineNumberFromContent(content: string, snippet: string | null): number | null {
  if (!snippet) {
    return null;
  }

  const normalizedSnippet = snippet.trim();
  if (!normalizedSnippet) {
    return null;
  }

  const index = content.indexOf(normalizedSnippet);
  if (index < 0) {
    return null;
  }

  return content.slice(0, index).split('\n').length;
}

export function applyDraftPreviewOperation(
  content: string,
  operation: FileDraftPreviewOperation,
) {
  if (operation.mode === 'write') {
    return operation.newText;
  }

  if (!operation.oldText) {
    return content;
  }

  return operation.replaceAll
    ? content.split(operation.oldText).join(operation.newText)
    : replaceFirst(content, operation.oldText, operation.newText);
}

export function applyDraftPreviewOperations(
  content: string,
  operations: FileDraftPreviewOperation[],
) {
  return operations
    .slice()
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp))
    .reduce((currentContent, operation) => applyDraftPreviewOperation(currentContent, operation), content);
}

export function getFirstDraftPreviewAnchorLine(
  content: string,
  operations: FileDraftPreviewOperation[],
): number | null {
  if (operations.length === 0) {
    return null;
  }

  const candidateLines: number[] = [];

  for (const operation of operations) {
    if (operation.lineRange?.startLine) {
      candidateLines.push(operation.lineRange.startLine);
      continue;
    }

    const matchedLine = getLineNumberFromContent(
      content,
      getFirstNonEmptyLine(operation.newText) ?? getFirstNonEmptyLine(operation.oldText ?? ''),
    );

    if (matchedLine) {
      candidateLines.push(matchedLine);
    }
  }

  if (candidateLines.length === 0) {
    return null;
  }

  return Math.min(...candidateLines);
}
