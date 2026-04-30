import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { MarkdownAnnotation } from '../types/markdownAnnotations.ts';
import { buildAnnotationRange, validateSelectedSlice, type AnnotationRange } from './markdownAnnotationSelection';

type MarkdownPosition = {
  start?: {
    offset?: number | null;
  };
  end?: {
    offset?: number | null;
  };
};

type MarkdownAstNode = {
  type?: string;
  value?: string;
  position?: MarkdownPosition;
  children?: MarkdownAstNode[];
};

export type MarkdownRenderedSourceSegment = {
  text: string;
  sourceStartOffset: number;
  sourceEndOffset: number;
  renderedStartOffset: number;
  renderedEndOffset: number;
};

export type MarkdownRenderedSourceMap = {
  renderedText: string;
  segments: MarkdownRenderedSourceSegment[];
};

const isTableCellFragment = (markdownSource: string): boolean => {
  if (markdownSource.includes('\n')) {
    return false;
  }

  const trimmed = markdownSource.trim();
  return trimmed.startsWith('|') || trimmed.endsWith('|');
};

const extractTableCellContentBounds = (markdownSource: string): { start: number; end: number } | null => {
  if (!isTableCellFragment(markdownSource)) {
    return null;
  }

  let start = 0;
  let end = markdownSource.length;

  if (markdownSource[start] === '|') {
    start += 1;
  }

  while (start < end && /\s/.test(markdownSource[start])) {
    start += 1;
  }

  if (end > start && markdownSource[end - 1] === '|') {
    end -= 1;
  }

  while (end > start && /\s/.test(markdownSource[end - 1])) {
    end -= 1;
  }

  if (end <= start) {
    return null;
  }

  return { start, end };
};

const buildRenderedSourceMapFromOffsetBase = (
  markdownSource: string,
  sourceOffsetBase: number,
): MarkdownRenderedSourceMap => {
  const renderedSourceMap = buildMarkdownRenderedSourceMap(markdownSource);

  return {
    renderedText: renderedSourceMap.renderedText,
    segments: renderedSourceMap.segments.map((segment) => ({
      ...segment,
      sourceStartOffset: segment.sourceStartOffset + sourceOffsetBase,
      sourceEndOffset: segment.sourceEndOffset + sourceOffsetBase,
    })),
  };
};

const isTableDelimiterRow = (line: string): boolean =>
  /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line);

const buildTableFragmentRenderedTextForComparison = (markdownSource: string): string | null => {
  const lines = markdownSource
    .split('\n')
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0 || !lines.every((line) => line.includes('|'))) {
    return null;
  }

  const renderedRows = lines
    .filter((line) => !isTableDelimiterRow(line))
    .map((line) => {
      const rawCells = line.split('|');
      const cells = rawCells
        .slice(1, rawCells[rawCells.length - 1] === '' ? -1 : rawCells.length)
        .map((cell) => buildMarkdownRenderedTextForComparison(cell.trim()))
        .filter((cell) => cell.length > 0);

      return cells.join('\t');
    })
    .filter((row) => row.length > 0);

  if (renderedRows.length === 0) {
    return null;
  }

  return renderedRows.join('\n');
};

const isFenceDelimiterLine = (line: string): boolean =>
  /^\s*(```+|~~~+)[^\n]*\s*$/.test(line);

const isInsideFencedCodeAtLine = (sourceText: string, targetLine: number): boolean => {
  const lines = sourceText.split('\n');
  let inFence = false;

  for (let index = 0; index < Math.max(0, targetLine - 1) && index < lines.length; index += 1) {
    if (isFenceDelimiterLine(lines[index])) {
      inFence = !inFence;
    }
  }

  return inFence;
};

const buildRenderedTextForRangeWithContext = ({
  sourceText,
  startLine,
  startColumn,
  endLine,
  endColumn,
}: {
  sourceText: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}): string | null => {
  const lines = sourceText.split('\n');
  if (startLine < 1 || endLine < startLine || endLine > lines.length) {
    return null;
  }

  let inFence = isInsideFencedCodeAtLine(sourceText, startLine);
  const renderedLines: string[] = [];

  for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
    const line = lines[lineNumber - 1] ?? '';
    const segmentStart = lineNumber === startLine ? Math.max(0, startColumn - 1) : 0;
    const segmentEnd = lineNumber === endLine ? Math.max(segmentStart, endColumn - 1) : line.length;
    const segment = line.slice(segmentStart, segmentEnd);

    if (isFenceDelimiterLine(line)) {
      inFence = !inFence;
      continue;
    }

    if (!segment) {
      continue;
    }

    if (inFence) {
      renderedLines.push(segment);
      continue;
    }

    const renderedLine = buildMarkdownRenderedTextForComparison(segment);
    if (renderedLine) {
      renderedLines.push(renderedLine);
    }
  }

  return renderedLines.join('\n');
};

const extractFencedCodeContentBounds = (markdownSource: string): { start: number; end: number } | null => {
  const openingMatch = markdownSource.match(/^(```+|~~~+)[^\n]*\n/);
  if (!openingMatch) {
    return null;
  }

  const openingFence = openingMatch[1];
  const contentStart = openingMatch[0].length;
  const closingPattern = new RegExp(`\\n${openingFence}[^\n]*\\s*$`);
  const closingMatch = closingPattern.exec(markdownSource);
  if (!closingMatch || closingMatch.index < contentStart) {
    return null;
  }

  let contentEnd = closingMatch.index;
  if (contentEnd > contentStart && markdownSource[contentEnd - 1] === '\n') {
    contentEnd -= 1;
  }

  if (contentEnd < contentStart) {
    return null;
  }

  return {
    start: contentStart,
    end: contentEnd,
  };
};

const getNodeOffsets = (node?: MarkdownAstNode): { start: number; end: number } | null => {
  const start = node?.position?.start?.offset;
  const end = node?.position?.end?.offset;

  if (typeof start !== 'number' || typeof end !== 'number' || end < start) {
    return null;
  }

  return { start, end };
};

const resolveInlineCodeSourceOffsets = (
  markdownSource: string,
  node: MarkdownAstNode,
): { start: number; end: number } | null => {
  const offsets = getNodeOffsets(node);
  const value = node.value ?? '';

  if (!offsets || value.length === 0) {
    return offsets;
  }

  const raw = markdownSource.slice(offsets.start, offsets.end);
  const openingFence = raw.match(/^`+/)?.[0] ?? '';
  const closingFence = raw.match(/`+$/)?.[0] ?? '';

  if (!openingFence || openingFence.length !== closingFence.length) {
    return offsets;
  }

  const inner = raw.slice(openingFence.length, raw.length - closingFence.length);
  const directMatchStart = inner.indexOf(value);
  if (directMatchStart >= 0) {
    return {
      start: offsets.start + openingFence.length + directMatchStart,
      end: offsets.start + openingFence.length + directMatchStart + value.length,
    };
  }

  const trimmedInner = inner.trim();
  const trimmedValue = value.trim();
  const trimmedMatchStart = trimmedInner.indexOf(trimmedValue);
  if (trimmedMatchStart >= 0) {
    const leadingWhitespace = inner.indexOf(trimmedInner);
    return {
      start: offsets.start + openingFence.length + Math.max(0, leadingWhitespace) + trimmedMatchStart,
      end: offsets.start + openingFence.length + Math.max(0, leadingWhitespace) + trimmedMatchStart + trimmedValue.length,
    };
  }

  return {
    start: offsets.start + openingFence.length,
    end: offsets.start + Math.max(openingFence.length, raw.length - closingFence.length),
  };
};

const resolveCodeBlockSourceOffsets = (
  markdownSource: string,
  node: MarkdownAstNode,
): { start: number; end: number } | null => {
  const offsets = getNodeOffsets(node);
  const value = node.value ?? '';

  if (!offsets || value.length === 0) {
    return offsets;
  }

  const raw = markdownSource.slice(offsets.start, offsets.end);
  const bounds = extractFencedCodeContentBounds(raw);
  if (bounds) {
    return {
      start: offsets.start + bounds.start,
      end: offsets.start + bounds.end,
    };
  }

  return offsets;
};

const collectRenderedSourceSegments = (
  markdownSource: string,
  node: MarkdownAstNode,
  segments: MarkdownRenderedSourceSegment[],
) => {
  if (node.type === 'text') {
    const offsets = getNodeOffsets(node);
    const text = node.value ?? '';

    if (!offsets || text.length === 0) {
      return;
    }

    const renderedStartOffset = segments.length === 0 ? 0 : segments[segments.length - 1].renderedEndOffset;
    segments.push({
      text,
      sourceStartOffset: offsets.start,
      sourceEndOffset: offsets.end,
      renderedStartOffset,
      renderedEndOffset: renderedStartOffset + text.length,
    });
    return;
  }

  if (node.type === 'inlineCode') {
    const offsets = resolveInlineCodeSourceOffsets(markdownSource, node);
    const text = node.value ?? '';

    if (!offsets || text.length === 0) {
      return;
    }

    const renderedStartOffset = segments.length === 0 ? 0 : segments[segments.length - 1].renderedEndOffset;
    segments.push({
      text,
      sourceStartOffset: offsets.start,
      sourceEndOffset: offsets.end,
      renderedStartOffset,
      renderedEndOffset: renderedStartOffset + text.length,
    });
    return;
  }

  if (node.type === 'code') {
    const offsets = resolveCodeBlockSourceOffsets(markdownSource, node);
    const text = node.value ?? '';

    if (!offsets || text.length === 0) {
      return;
    }

    const renderedStartOffset = segments.length === 0 ? 0 : segments[segments.length - 1].renderedEndOffset;
    segments.push({
      text,
      sourceStartOffset: offsets.start,
      sourceEndOffset: offsets.end,
      renderedStartOffset,
      renderedEndOffset: renderedStartOffset + text.length,
    });
    return;
  }

  if (!Array.isArray(node.children)) {
    return;
  }

  for (const child of node.children) {
    collectRenderedSourceSegments(markdownSource, child, segments);
  }
};

const BLOCK_SEPARATOR_PARENTS = new Set(['root', 'blockquote', 'list', 'listItem']);
const SPACE_SEPARATOR_PARENTS = new Set(['table', 'tableRow', 'tableCell']);

const collectRenderedTextForComparison = (
  markdownSource: string,
  node: MarkdownAstNode,
): string => {
  if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'code') {
    if (node.type === 'inlineCode' || node.type === 'code') {
      return node.value ?? '';
    }
    return node.value ?? '';
  }

  if (!Array.isArray(node.children) || node.children.length === 0) {
    return '';
  }

  const separator = BLOCK_SEPARATOR_PARENTS.has(node.type ?? '')
    ? '\n'
    : SPACE_SEPARATOR_PARENTS.has(node.type ?? '')
      ? ' '
      : '';

  return node.children
    .map((child) => collectRenderedTextForComparison(markdownSource, child))
    .filter((text) => text.length > 0)
    .join(separator);
};

export const buildMarkdownRenderedSourceMap = (markdownSource: string): MarkdownRenderedSourceMap => {
  const tableCellBounds = extractTableCellContentBounds(markdownSource);
  if (tableCellBounds) {
    const innerSource = markdownSource.slice(tableCellBounds.start, tableCellBounds.end);
    return buildRenderedSourceMapFromOffsetBase(innerSource, tableCellBounds.start);
  }

  const fencedCodeBounds = extractFencedCodeContentBounds(markdownSource);
  if (fencedCodeBounds) {
    const innerSource = markdownSource.slice(fencedCodeBounds.start, fencedCodeBounds.end);
    return {
      renderedText: innerSource,
      segments: innerSource.length === 0
        ? []
        : [{
          text: innerSource,
          sourceStartOffset: fencedCodeBounds.start,
          sourceEndOffset: fencedCodeBounds.end,
          renderedStartOffset: 0,
          renderedEndOffset: innerSource.length,
        }],
    };
  }

  const root = unified().use(remarkParse).use(remarkGfm).parse(markdownSource) as MarkdownAstNode;
  const segments: MarkdownRenderedSourceSegment[] = [];
  collectRenderedSourceSegments(markdownSource, root, segments);

  return {
    renderedText: segments.map((segment) => segment.text).join(''),
    segments,
  };
};

export const buildMarkdownRenderedTextForComparison = (markdownSource: string): string => {
  const tableFragmentText = buildTableFragmentRenderedTextForComparison(markdownSource);
  if (tableFragmentText !== null) {
    return tableFragmentText;
  }

  const tableCellBounds = extractTableCellContentBounds(markdownSource);
  if (tableCellBounds) {
    return buildMarkdownRenderedTextForComparison(
      markdownSource.slice(tableCellBounds.start, tableCellBounds.end),
    );
  }

  const fencedCodeBounds = extractFencedCodeContentBounds(markdownSource);
  if (fencedCodeBounds) {
    return markdownSource.slice(fencedCodeBounds.start, fencedCodeBounds.end);
  }

  const root = unified().use(remarkParse).use(remarkGfm).parse(markdownSource) as MarkdownAstNode;
  return collectRenderedTextForComparison(markdownSource, root);
};

export const getSourceOffsetFromLineColumn = (
  sourceText: string,
  targetLine: number,
  targetColumn: number,
): number | null => {
  let line = 1;
  let column = 1;

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

export const getSourceOffsetFromLineColumnWithBase = (
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

export const sliceMarkdownSourceByRange = ({
  sourceText,
  startLine,
  startColumn,
  endLine,
  endColumn,
}: {
  sourceText: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}): string | null => {
  const startOffset = getSourceOffsetFromLineColumn(sourceText, startLine, startColumn);
  const endOffset = getSourceOffsetFromLineColumn(sourceText, endLine, endColumn);

  if (startOffset === null || endOffset === null || endOffset < startOffset) {
    return null;
  }

  return sourceText.slice(startOffset, endOffset);
};

export const mapRenderedOffsetToSourceOffset = (
  renderedSourceMap: MarkdownRenderedSourceMap,
  renderedOffset: number,
  bias: 'start' | 'end' = 'start',
): number | null => {
  if (renderedOffset < 0 || renderedOffset > renderedSourceMap.renderedText.length) {
    return null;
  }

  if (renderedOffset === 0) {
    return renderedSourceMap.segments[0]?.sourceStartOffset ?? 0;
  }

  const lastSegment = renderedSourceMap.segments[renderedSourceMap.segments.length - 1];
  if (renderedOffset === renderedSourceMap.renderedText.length) {
    return lastSegment?.sourceEndOffset ?? 0;
  }

  for (const segment of renderedSourceMap.segments) {
    if (renderedOffset < segment.renderedStartOffset || renderedOffset > segment.renderedEndOffset) {
      continue;
    }

    if (renderedOffset === segment.renderedEndOffset) {
      if (bias === 'end') {
        return segment.sourceEndOffset;
      }

      continue;
    }

    return segment.sourceStartOffset + (renderedOffset - segment.renderedStartOffset);
  }

  return null;
};

export const mapSourceOffsetToRenderedOffset = (
  renderedSourceMap: MarkdownRenderedSourceMap,
  sourceOffset: number,
  bias: 'start' | 'end' = 'start',
): number | null => {
  for (const segment of renderedSourceMap.segments) {
    if (sourceOffset < segment.sourceStartOffset || sourceOffset > segment.sourceEndOffset) {
      continue;
    }

    if (sourceOffset === segment.sourceEndOffset) {
      if (bias === 'end') {
        return segment.renderedEndOffset;
      }

      continue;
    }

    return segment.renderedStartOffset + (sourceOffset - segment.sourceStartOffset);
  }

  return null;
};

const clampSourceOffsetToRenderedOffset = (
  renderedSourceMap: MarkdownRenderedSourceMap,
  sourceOffset: number,
  bias: 'start' | 'end',
): number | null => {
  const directOffset = mapSourceOffsetToRenderedOffset(renderedSourceMap, sourceOffset, bias);
  if (directOffset !== null) {
    return directOffset;
  }

  if (renderedSourceMap.segments.length === 0) {
    return null;
  }

  if (bias === 'start') {
    for (const segment of renderedSourceMap.segments) {
      if (sourceOffset <= segment.sourceStartOffset) {
        return segment.renderedStartOffset;
      }
      if (sourceOffset < segment.sourceEndOffset) {
        return segment.renderedStartOffset + Math.max(0, sourceOffset - segment.sourceStartOffset);
      }
    }

    return renderedSourceMap.segments[renderedSourceMap.segments.length - 1]?.renderedEndOffset ?? null;
  }

  for (let index = renderedSourceMap.segments.length - 1; index >= 0; index -= 1) {
    const segment = renderedSourceMap.segments[index];
    if (sourceOffset >= segment.sourceEndOffset) {
      return segment.renderedEndOffset;
    }
    if (sourceOffset > segment.sourceStartOffset) {
      return segment.renderedStartOffset + (sourceOffset - segment.sourceStartOffset);
    }
  }

  return renderedSourceMap.segments[0]?.renderedStartOffset ?? null;
};

export const resolveAnnotationRenderedOffsets = ({
  annotation,
  markdownSource,
  sourceStartLine,
  sourceStartColumn,
}: {
  annotation: MarkdownAnnotation;
  markdownSource: string;
  sourceStartLine: number;
  sourceStartColumn: number;
}): { renderedStartOffset: number; renderedEndOffset: number; renderedText: string } | null => {
  const sourceStartOffset = getSourceOffsetFromLineColumnWithBase(
    markdownSource,
    sourceStartLine,
    sourceStartColumn,
    annotation.startLine,
    annotation.startColumn,
  );
  const sourceEndOffset = getSourceOffsetFromLineColumnWithBase(
    markdownSource,
    sourceStartLine,
    sourceStartColumn,
    annotation.endLine,
    annotation.endColumn,
  );

  if (sourceStartOffset === null || sourceEndOffset === null || sourceEndOffset <= sourceStartOffset) {
    return null;
  }

  const renderedSourceMap = buildMarkdownRenderedSourceMap(markdownSource);
  const renderedStartOffset = mapSourceOffsetToRenderedOffset(renderedSourceMap, sourceStartOffset, 'start');
  const renderedEndOffset = mapSourceOffsetToRenderedOffset(renderedSourceMap, sourceEndOffset, 'end');

  if (
    renderedStartOffset === null ||
    renderedEndOffset === null ||
    renderedEndOffset <= renderedStartOffset
  ) {
    return null;
  }

  return {
    renderedStartOffset,
    renderedEndOffset,
    renderedText: renderedSourceMap.renderedText,
  };
};

export const resolveAnnotationRenderedOverlap = ({
  content,
  annotation,
  markdownSource,
  sourceStartLine,
  sourceStartColumn,
  sourceEndLine,
  sourceEndColumn,
}: {
  content: string;
  annotation: MarkdownAnnotation;
  markdownSource: string;
  sourceStartLine: number;
  sourceStartColumn: number;
  sourceEndLine: number;
  sourceEndColumn: number;
}): { renderedStartOffset: number; renderedEndOffset: number; renderedText: string } | null => {
  const blockStartOffset = getSourceOffsetFromLineColumn(content, sourceStartLine, sourceStartColumn);
  const blockEndOffset = getSourceOffsetFromLineColumn(content, sourceEndLine, sourceEndColumn);
  const annotationStartOffset = getSourceOffsetFromLineColumn(content, annotation.startLine, annotation.startColumn);
  const annotationEndOffset = getSourceOffsetFromLineColumn(content, annotation.endLine, annotation.endColumn);

  if (
    blockStartOffset === null ||
    blockEndOffset === null ||
    annotationStartOffset === null ||
    annotationEndOffset === null
  ) {
    return null;
  }

  const overlapStartOffset = Math.max(blockStartOffset, annotationStartOffset);
  const overlapEndOffset = Math.min(blockEndOffset, annotationEndOffset);
  if (overlapEndOffset <= overlapStartOffset) {
    return null;
  }

  const localStartOffset = overlapStartOffset - blockStartOffset;
  const localEndOffset = overlapEndOffset - blockStartOffset;
  const renderedSourceMap = buildMarkdownRenderedSourceMap(markdownSource);
  const renderedStartOffset = clampSourceOffsetToRenderedOffset(renderedSourceMap, localStartOffset, 'start');
  const renderedEndOffset = clampSourceOffsetToRenderedOffset(renderedSourceMap, localEndOffset, 'end');

  if (
    renderedStartOffset === null ||
    renderedEndOffset === null ||
    renderedEndOffset <= renderedStartOffset
  ) {
    return null;
  }

  return {
    renderedStartOffset,
    renderedEndOffset,
    renderedText: renderedSourceMap.renderedText,
  };
};

export const resolveRenderedSelectionToSourceRange = ({
  content,
  selectedText,
  startAnchor,
  endAnchor,
}: {
  content: string;
  selectedText: string;
  startAnchor: {
    markdownSource: string;
    sourceStartLine: number;
    sourceStartColumn: number;
    renderedOffset: number;
  };
  endAnchor: {
    markdownSource: string;
    sourceStartLine: number;
    sourceStartColumn: number;
    renderedOffset: number;
  };
}): AnnotationRange | null => {
  const startRenderedSourceMap = buildMarkdownRenderedSourceMap(startAnchor.markdownSource);
  const endRenderedSourceMap = buildMarkdownRenderedSourceMap(endAnchor.markdownSource);
  const startSourceTextOffset = mapRenderedOffsetToSourceOffset(startRenderedSourceMap, startAnchor.renderedOffset, 'start');
  const endSourceTextOffset = mapRenderedOffsetToSourceOffset(endRenderedSourceMap, endAnchor.renderedOffset, 'end');
  const startAnchorAbsoluteOffset = getSourceOffsetFromLineColumn(content, startAnchor.sourceStartLine, startAnchor.sourceStartColumn);
  const endAnchorAbsoluteOffset = getSourceOffsetFromLineColumn(content, endAnchor.sourceStartLine, endAnchor.sourceStartColumn);

  if (
    startSourceTextOffset === null ||
    endSourceTextOffset === null ||
    startAnchorAbsoluteOffset === null ||
    endAnchorAbsoluteOffset === null
  ) {
    return null;
  }

  const sourceTextOffsetStart = startAnchorAbsoluteOffset + startSourceTextOffset;
  const sourceTextOffsetEnd = endAnchorAbsoluteOffset + endSourceTextOffset;

  if (sourceTextOffsetEnd <= sourceTextOffsetStart) {
    return null;
  }

  const isSameAnchor = startAnchor.markdownSource === endAnchor.markdownSource &&
    startAnchor.sourceStartLine === endAnchor.sourceStartLine &&
    startAnchor.sourceStartColumn === endAnchor.sourceStartColumn;

  if (isSameAnchor) {
    const renderedSlice = startRenderedSourceMap.renderedText.slice(
      startAnchor.renderedOffset,
      endAnchor.renderedOffset,
    );
    if (!validateSelectedSlice(renderedSlice, selectedText)) {
      return null;
    }
  }

  return buildAnnotationRange({
    sourceText: content,
    sourceStartLine: 1,
    sourceStartColumn: 1,
    sourceTextOffsetStart,
    sourceTextOffsetEnd,
  });
};

export const doesAnnotationMatchContent = ({
  content,
  annotation,
}: {
  content: string;
  annotation: MarkdownAnnotation;
}): boolean => {
  const blockStartLine = annotation.startLine;
  const blockStartColumn = 1;
  const blockEndLine = annotation.endLine;
  const blockEndColumn = (() => {
    const lines = content.split('\n');
    const targetLine = lines[Math.max(0, annotation.endLine - 1)] ?? '';
    return targetLine.length + 1;
  })();

  const blockSource = sliceMarkdownSourceByRange({
    sourceText: content,
    startLine: blockStartLine,
    startColumn: blockStartColumn,
    endLine: blockEndLine,
    endColumn: blockEndColumn,
  });

  if (blockSource) {
    const renderedMatch = resolveAnnotationRenderedOffsets({
      annotation,
      markdownSource: blockSource,
      sourceStartLine: blockStartLine,
      sourceStartColumn: blockStartColumn,
    });

    if (renderedMatch) {
      const renderedSlice = renderedMatch.renderedText.slice(
        renderedMatch.renderedStartOffset,
        renderedMatch.renderedEndOffset,
      );
      if (validateSelectedSlice(renderedSlice, annotation.selectedText)) {
        return true;
      }
    }
  }

  const sourceSlice = sliceMarkdownSourceByRange({
    sourceText: content,
    startLine: annotation.startLine,
    startColumn: annotation.startColumn,
    endLine: annotation.endLine,
    endColumn: annotation.endColumn,
  });

  if (sourceSlice === null || sourceSlice.length === 0) {
    return false;
  }

  const contextualRenderedSlice = buildRenderedTextForRangeWithContext({
    sourceText: content,
    startLine: annotation.startLine,
    startColumn: annotation.startColumn,
    endLine: annotation.endLine,
    endColumn: annotation.endColumn,
  });
  if (contextualRenderedSlice && validateSelectedSlice(contextualRenderedSlice, annotation.selectedText)) {
    return true;
  }

  const renderedSlice = buildMarkdownRenderedTextForComparison(sourceSlice);
  return validateSelectedSlice(renderedSlice, annotation.selectedText);
};
