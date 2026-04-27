export type BrowserElementSelection = {
  selector: string;
  tagName: string;
  text: string;
  pageTitle?: string;
  pageUrl?: string;
  fileReference?: string;
};

type ElementSourceLineRange = {
  startLine: number;
  endLine: number;
};

export function buildElementSelectionPrompt({
  selector,
  fileReference,
}: BrowserElementSelection): string {
  const lines = [`元素选择器：${selector}`];

  if (fileReference) {
    lines.push(`源码位置：${fileReference}`);
  }

  return lines.join('\n');
}

function stripSelectionHighlightAttribute(value: string): string {
  return value.replace(/\sdata-ccui-browser-selected-highlight="active"/g, '');
}

function normalizeForSearch(value: string): { normalized: string; indexMap: number[] } {
  let normalized = '';
  const indexMap: number[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (/\s/.test(character)) {
      continue;
    }

    normalized += character;
    indexMap.push(index);
  }

  return {
    normalized,
    indexMap,
  };
}

function countLinesUntilIndex(value: string, targetIndex: number): number {
  let line = 1;
  for (let index = 0; index < targetIndex; index += 1) {
    if (value[index] === '\n') {
      line += 1;
    }
  }
  return line;
}

export function findElementSourceLineRange({
  sourceText,
  elementOuterHtml,
}: {
  sourceText: string;
  elementOuterHtml: string;
}): ElementSourceLineRange | null {
  const sanitizedOuterHtml = stripSelectionHighlightAttribute(elementOuterHtml || '').trim();
  if (!sourceText.trim() || !sanitizedOuterHtml) {
    return null;
  }

  const normalizedSource = normalizeForSearch(sourceText);
  const normalizedElement = normalizeForSearch(sanitizedOuterHtml);
  if (!normalizedSource.normalized || !normalizedElement.normalized) {
    return null;
  }

  const startIndex = normalizedSource.normalized.indexOf(normalizedElement.normalized);
  if (startIndex === -1) {
    return null;
  }

  const endIndex = startIndex + normalizedElement.normalized.length - 1;
  const originalStartIndex = normalizedSource.indexMap[startIndex] ?? 0;
  const originalEndIndex = normalizedSource.indexMap[endIndex] ?? originalStartIndex;

  return {
    startLine: countLinesUntilIndex(sourceText, originalStartIndex),
    endLine: countLinesUntilIndex(sourceText, originalEndIndex),
  };
}

export function formatSelectedElementFileReference(
  filePath: string,
  projectPath?: string | null,
  lineRange?: ElementSourceLineRange | null,
): string {
  const normalizedFilePath = filePath.replace(/\\/g, '/');
  const normalizedProjectPath = projectPath?.replace(/\\/g, '/').replace(/\/+$/, '') || '';
  const relativePath = normalizedProjectPath && normalizedFilePath.startsWith(`${normalizedProjectPath}/`)
    ? normalizedFilePath.slice(normalizedProjectPath.length + 1)
    : normalizedFilePath;

  if (!lineRange) {
    return relativePath;
  }

  return `${relativePath}:${lineRange.startLine}-${lineRange.endLine}`;
}
