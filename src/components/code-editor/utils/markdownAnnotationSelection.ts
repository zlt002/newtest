export type AnnotationRangeInput = {
  sourceText: string;
  sourceStartLine: number;
  sourceStartColumn: number;
  sourceTextOffsetStart: number;
  sourceTextOffsetEnd: number;
};

export type AnnotationRange = {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export type MarkdownAnnotationCreationState = {
  hasSelection: boolean;
  isValidSourceMapping: boolean;
  hasUnsafeMarkdownMapping?: boolean;
};

export function normalizeSelectedText(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
}

export function validateSelectedSlice(sourceSlice: string, selectedText: string): boolean {
  return normalizeSelectedText(sourceSlice) === normalizeSelectedText(selectedText);
}

const getLineAndColumnAtOffset = (
  sourceText: string,
  baseLine: number,
  baseColumn: number,
  offset: number,
) => {
  let line = baseLine;
  let column = baseColumn;

  for (let index = 0; index < offset; index += 1) {
    if (sourceText[index] === '\n') {
      line += 1;
      column = 1;
      continue;
    }

    column += 1;
  }

  return { line, column };
};

export function buildAnnotationRange({
  sourceText,
  sourceStartLine,
  sourceStartColumn,
  sourceTextOffsetStart,
  sourceTextOffsetEnd,
}: AnnotationRangeInput): AnnotationRange {
  const start = getLineAndColumnAtOffset(
    sourceText,
    sourceStartLine,
    sourceStartColumn,
    sourceTextOffsetStart,
  );
  const end = getLineAndColumnAtOffset(
    sourceText,
    sourceStartLine,
    sourceStartColumn,
    sourceTextOffsetEnd,
  );

  return {
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
  };
}

export function canCreateMarkdownAnnotation({
  hasSelection,
  isValidSourceMapping,
  hasUnsafeMarkdownMapping = false,
}: MarkdownAnnotationCreationState): boolean {
  return hasSelection && isValidSourceMapping && !hasUnsafeMarkdownMapping;
}
