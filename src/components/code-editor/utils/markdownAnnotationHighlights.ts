import type { MarkdownAnnotation } from '../types/markdownAnnotations.ts';
import { validateSelectedSlice } from './markdownAnnotationSelection';

export type MarkdownAnnotationMatch = {
  annotation: MarkdownAnnotation;
  startOffset: number;
  endOffset: number;
};

export type MarkdownAnnotationHighlightSegment = {
  text: string;
  annotations: MarkdownAnnotation[];
};

const getOffsetFromLineColumn = (
  sourceText: string,
  baseLine: number,
  baseColumn: number,
  targetLine: number,
  targetColumn: number,
): number | null => {
  let line = baseLine;
  let column = baseColumn;

  if (line === targetLine && column === targetColumn) {
    return 0;
  }

  for (let index = 0; index < sourceText.length; index += 1) {
    if (sourceText[index] === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }

    if (line === targetLine && column === targetColumn) {
      return index + 1;
    }
  }

  return null;
};

export const resolveMarkdownAnnotationMatch = ({
  annotation,
  sourceText,
  sourceStartLine,
  sourceStartColumn,
}: {
  annotation: MarkdownAnnotation;
  sourceText: string;
  sourceStartLine: number;
  sourceStartColumn: number;
}): MarkdownAnnotationMatch | null => {
  const startOffset = getOffsetFromLineColumn(
    sourceText,
    sourceStartLine,
    sourceStartColumn,
    annotation.startLine,
    annotation.startColumn,
  );
  const endOffset = getOffsetFromLineColumn(
    sourceText,
    sourceStartLine,
    sourceStartColumn,
    annotation.endLine,
    annotation.endColumn,
  );

  if (startOffset === null || endOffset === null || endOffset <= startOffset) {
    return null;
  }

  const sourceSlice = sourceText.slice(startOffset, endOffset);
  if (!validateSelectedSlice(sourceSlice, annotation.selectedText)) {
    return null;
  }

  return {
    annotation,
    startOffset,
    endOffset,
  };
};

export const getValidMarkdownAnnotationMatches = ({
  annotations,
  sourceText,
  sourceStartLine,
  sourceStartColumn,
}: {
  annotations: MarkdownAnnotation[];
  sourceText: string;
  sourceStartLine: number;
  sourceStartColumn: number;
}): MarkdownAnnotationMatch[] =>
  annotations
    .map((annotation) =>
      resolveMarkdownAnnotationMatch({
        annotation,
        sourceText,
        sourceStartLine,
        sourceStartColumn,
      }))
    .filter((match): match is MarkdownAnnotationMatch => match !== null)
    .sort((left, right) => left.startOffset - right.startOffset || left.endOffset - right.endOffset);

export const buildMarkdownAnnotationHighlightSegments = ({
  annotations,
  sourceText,
  sourceStartLine,
  sourceStartColumn,
}: {
  annotations: MarkdownAnnotation[];
  sourceText: string;
  sourceStartLine: number;
  sourceStartColumn: number;
}): MarkdownAnnotationHighlightSegment[] => {
  if (sourceText.length === 0) {
    return [];
  }

  const matches = getValidMarkdownAnnotationMatches({
    annotations,
    sourceText,
    sourceStartLine,
    sourceStartColumn,
  });

  if (matches.length === 0) {
    return [
      {
        text: sourceText,
        annotations: [],
      },
    ];
  }

  const boundaries = new Set<number>([0, sourceText.length]);
  for (const match of matches) {
    boundaries.add(match.startOffset);
    boundaries.add(match.endOffset);
  }

  const sortedBoundaries = [...boundaries].sort((left, right) => left - right);
  const segments: MarkdownAnnotationHighlightSegment[] = [];

  for (let index = 0; index < sortedBoundaries.length - 1; index += 1) {
    const start = sortedBoundaries[index];
    const end = sortedBoundaries[index + 1];
    if (end <= start) {
      continue;
    }

    const text = sourceText.slice(start, end);
    if (!text) {
      continue;
    }

    const coveringAnnotations = matches
      .filter((match) => match.startOffset < end && match.endOffset > start)
      .map((match) => match.annotation);

    segments.push({
      text,
      annotations: coveringAnnotations,
    });
  }

  return segments;
};

export const countInvalidMarkdownAnnotations = ({
  annotations,
  sourceNodes,
}: {
  annotations: MarkdownAnnotation[];
  sourceNodes: Array<{
    sourceText: string;
    sourceStartLine: number;
    sourceStartColumn: number;
  }>;
}): number => {
  if (annotations.length === 0) {
    return 0;
  }

  const matchedIds = new Set<string>();

  for (const node of sourceNodes) {
    for (const match of getValidMarkdownAnnotationMatches({
      annotations,
      sourceText: node.sourceText,
      sourceStartLine: node.sourceStartLine,
      sourceStartColumn: node.sourceStartColumn,
    })) {
      matchedIds.add(match.annotation.id);
    }
  }

  return annotations.filter((annotation) => !matchedIds.has(annotation.id)).length;
};

export const getValidMarkdownAnnotationIds = ({
  annotations,
  sourceNodes,
}: {
  annotations: MarkdownAnnotation[];
  sourceNodes: Array<{
    sourceText: string;
    sourceStartLine: number;
    sourceStartColumn: number;
  }>;
}): string[] => {
  const matchedIds = new Set<string>();

  for (const node of sourceNodes) {
    for (const match of getValidMarkdownAnnotationMatches({
      annotations,
      sourceText: node.sourceText,
      sourceStartLine: node.sourceStartLine,
      sourceStartColumn: node.sourceStartColumn,
    })) {
      matchedIds.add(match.annotation.id);
    }
  }

  return annotations
    .map((annotation) => annotation.id)
    .filter((id) => matchedIds.has(id));
};
