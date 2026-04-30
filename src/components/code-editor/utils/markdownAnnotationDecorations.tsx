import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import type { MarkdownAnnotation } from '../types/markdownAnnotations.ts';
import MarkdownAnnotationHighlight from '../view/subcomponents/markdown/MarkdownAnnotationHighlight';
import { resolveAnnotationRenderedOverlap } from './markdownSourceTextMapping';

type RenderedAnnotationMatch = {
  annotation: MarkdownAnnotation;
  renderedStartOffset: number;
  renderedEndOffset: number;
};

const getRenderedAnnotationMatches = ({
  content,
  annotations,
  markdownSource,
  sourceStartLine,
  sourceStartColumn,
  sourceEndLine,
  sourceEndColumn,
}: {
  content: string;
  annotations: MarkdownAnnotation[];
  markdownSource: string;
  sourceStartLine: number;
  sourceStartColumn: number;
  sourceEndLine: number;
  sourceEndColumn: number;
}): { renderedText: string; matches: RenderedAnnotationMatch[] } => {
  const matches: RenderedAnnotationMatch[] = [];
  let renderedText = '';

  for (const annotation of annotations) {
    const renderedMatch = resolveAnnotationRenderedOverlap({
      content,
      annotation,
      markdownSource,
      sourceStartLine,
      sourceStartColumn,
      sourceEndLine,
      sourceEndColumn,
    });

    if (!renderedMatch) {
      continue;
    }

    renderedText = renderedMatch.renderedText;

    matches.push({
      annotation,
      renderedStartOffset: renderedMatch.renderedStartOffset,
      renderedEndOffset: renderedMatch.renderedEndOffset,
    });
  }

  return {
    renderedText,
    matches: matches.sort((left, right) =>
      left.renderedStartOffset - right.renderedStartOffset ||
      left.renderedEndOffset - right.renderedEndOffset,
    ),
  };
};

const getAnnotationsForRange = (
  matches: RenderedAnnotationMatch[],
  startOffset: number,
  endOffset: number,
): MarkdownAnnotation[] =>
  matches
    .filter((match) => match.renderedStartOffset < endOffset && match.renderedEndOffset > startOffset)
    .map((match) => match.annotation);

const splitTextByAnnotationMatches = ({
  text,
  matches,
  globalStartOffset,
  focusedAnnotationId,
  onActivate,
  keyPrefix,
}: {
  text: string;
  matches: RenderedAnnotationMatch[];
  globalStartOffset: number;
  focusedAnnotationId: string | null;
  onActivate: ((annotationId: string) => void) | null;
  keyPrefix: string;
}): ReactNode[] => {
  const globalEndOffset = globalStartOffset + text.length;
  const boundaries = new Set<number>([globalStartOffset, globalEndOffset]);

  for (const match of matches) {
    if (match.renderedStartOffset > globalStartOffset && match.renderedStartOffset < globalEndOffset) {
      boundaries.add(match.renderedStartOffset);
    }
    if (match.renderedEndOffset > globalStartOffset && match.renderedEndOffset < globalEndOffset) {
      boundaries.add(match.renderedEndOffset);
    }
  }

  const sortedBoundaries = [...boundaries].sort((left, right) => left - right);
  const parts: ReactNode[] = [];

  for (let index = 0; index < sortedBoundaries.length - 1; index += 1) {
    const start = sortedBoundaries[index];
    const end = sortedBoundaries[index + 1];
    if (end <= start) {
      continue;
    }

    const localStart = start - globalStartOffset;
    const localEnd = end - globalStartOffset;
    const piece = text.slice(localStart, localEnd);
    if (!piece) {
      continue;
    }

    const annotations = getAnnotationsForRange(matches, start, end);
    if (annotations.length === 0) {
      parts.push(piece);
      continue;
    }

    parts.push(
      <MarkdownAnnotationHighlight
        key={`${keyPrefix}-${index}`}
        text={piece}
        annotations={annotations}
        isFocused={Boolean(focusedAnnotationId && annotations.some((annotation) => annotation.id === focusedAnnotationId))}
        onActivate={onActivate}
      />,
    );
  }

  return parts;
};

export const decorateMarkdownAnnotationChildren = ({
  content,
  children,
  annotations,
  markdownSource,
  sourceStartLine,
  sourceStartColumn,
  sourceEndLine,
  sourceEndColumn,
  focusedAnnotationId,
  onActivate,
}: {
  content: string;
  children: ReactNode;
  annotations: MarkdownAnnotation[];
  markdownSource: string;
  sourceStartLine: number;
  sourceStartColumn: number;
  sourceEndLine: number;
  sourceEndColumn: number;
  focusedAnnotationId: string | null;
  onActivate: ((annotationId: string) => void) | null;
}): ReactNode => {
  const { matches } = getRenderedAnnotationMatches({
    content,
    annotations,
    markdownSource,
    sourceStartLine,
    sourceStartColumn,
    sourceEndLine,
    sourceEndColumn,
  });

  if (matches.length === 0) {
    return children;
  }

  const cursor = { offset: 0 };

  const decorateNode = (node: ReactNode, keyPrefix: string): ReactNode => {
    if (typeof node === 'string' || typeof node === 'number') {
      const text = String(node);
      const parts = splitTextByAnnotationMatches({
        text,
        matches,
        globalStartOffset: cursor.offset,
        focusedAnnotationId,
        onActivate,
        keyPrefix,
      });
      cursor.offset += text.length;
      return parts;
    }

    if (!isValidElement(node)) {
      return node;
    }

    if (node.type === 'br') {
      cursor.offset += 1;
      return node;
    }

    const childElement = node as ReactElement<{ children?: ReactNode }>;
    const childNodes = Children.toArray(childElement.props.children);
    if (childNodes.length === 0) {
      return node;
    }

    const decoratedChildren = childNodes.map((child, index) => decorateNode(child, `${keyPrefix}-${index}`));
    return cloneElement(childElement, childElement.props, ...decoratedChildren);
  };

  return Children.toArray(children).map((child, index) => decorateNode(child, `annotation-${index}`));
};
