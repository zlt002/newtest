import { useState } from 'react';
import type { ComponentProps } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark as prismOneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { copyTextToClipboard } from '../../../../../utils/clipboard';
import type { MarkdownAnnotation } from '../../../types/markdownAnnotations.ts';
import {
  resolveAnnotationRenderedOverlap,
  sliceMarkdownSourceByRange,
} from '../../../utils/markdownSourceTextMapping';
import { getMarkdownCodeAnnotationProps } from './markdownCodeAnnotationProps';
import MarkdownAnnotationHighlight from './MarkdownAnnotationHighlight';
import MermaidBlock from '../../../../shared/markdown/MermaidBlock';
import { parseMarkdownCodeBlock, shouldRenderMermaidBlock } from '../../../../shared/markdown/mermaidCodeBlock';

type MarkdownCodeBlockProps = {
  annotations?: MarkdownAnnotation[];
  focusedAnnotationId?: string | null;
  inline?: boolean;
  markdownContent?: string;
  onActivateAnnotation?: ((annotationId: string) => void) | null;
  node?: {
    position?: {
      start?: {
        line?: number;
        column?: number;
      };
      end?: {
        line?: number;
        column?: number;
      };
    };
  };
} & ComponentProps<'code'>;

const buildCodeHighlightParts = ({
  annotations,
  content,
  markdownSource,
  rawContent,
  sourceStartLine,
  sourceStartColumn,
  sourceEndLine,
  sourceEndColumn,
  focusedAnnotationId,
  onActivateAnnotation,
}: {
  annotations: MarkdownAnnotation[];
  content: string;
  markdownSource: string;
  rawContent: string;
  sourceStartLine: number;
  sourceStartColumn: number;
  sourceEndLine: number;
  sourceEndColumn: number;
  focusedAnnotationId: string | null;
  onActivateAnnotation: ((annotationId: string) => void) | null;
}) => {
  const matches = annotations
    .map((annotation) => {
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
        return null;
      }

      return {
        annotation,
        renderedStartOffset: renderedMatch.renderedStartOffset,
        renderedEndOffset: renderedMatch.renderedEndOffset,
      };
    })
    .filter((match) => match !== null)
    .sort((left, right) =>
      left.renderedStartOffset - right.renderedStartOffset ||
      left.renderedEndOffset - right.renderedEndOffset,
    );

  if (matches.length === 0) {
    return null;
  }

  const boundaries = new Set<number>([0, rawContent.length]);
  for (const match of matches) {
    boundaries.add(match.renderedStartOffset);
    boundaries.add(match.renderedEndOffset);
  }

  const sortedBoundaries = [...boundaries].sort((left, right) => left - right);
  return sortedBoundaries.flatMap((start, index) => {
    const end = sortedBoundaries[index + 1];
    if (typeof end !== 'number' || end <= start) {
      return [];
    }

    const text = rawContent.slice(start, end);
    if (!text) {
      return [];
    }

    const coveringAnnotations = matches
      .filter((match) => match.renderedStartOffset < end && match.renderedEndOffset > start)
      .map((match) => match.annotation);

    if (coveringAnnotations.length === 0) {
      return [text];
    }

    return [
      <MarkdownAnnotationHighlight
        key={`code-annotation-${start}-${end}`}
        text={text}
        annotations={coveringAnnotations}
        isFocused={Boolean(
          focusedAnnotationId &&
          coveringAnnotations.some((annotation) => annotation.id === focusedAnnotationId),
        )}
        onActivate={onActivateAnnotation}
      />,
    ];
  });
};

const getSourcePositionDataProps = (node?: MarkdownCodeBlockProps['node'], shouldRenderInline = false) => {
  const annotationProps = getMarkdownCodeAnnotationProps({ shouldRenderInline });
  const start = node?.position?.start;
  const end = node?.position?.end;

  if (
    typeof start?.line !== 'number' ||
    typeof start.column !== 'number' ||
    typeof end?.line !== 'number' ||
    typeof end.column !== 'number'
  ) {
    return annotationProps;
  }

  return {
    ...annotationProps,
    'data-markdown-source-anchor': 'true',
    'data-source-start-line': start.line,
    'data-source-start-column': start.column,
    'data-source-end-line': end.line,
    'data-source-end-column': end.column,
  };
};

export default function MarkdownCodeBlock({
  annotations = [],
  inline,
  className,
  children,
  focusedAnnotationId = null,
  markdownContent = '',
  node,
  onActivateAnnotation = null,
  ...props
}: MarkdownCodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const rawContent = Array.isArray(children) ? children.join('') : String(children ?? '');
  const codeBlock = parseMarkdownCodeBlock({
    inline,
    className,
    rawContent,
  });
  const shouldRenderInline = codeBlock.shouldRenderInline;

  if (shouldRenderInline) {
    return (
      <code
        className={`whitespace-pre-wrap break-words rounded-md border border-gray-200 bg-gray-100 px-1.5 py-0.5 font-mono text-[0.9em] text-gray-900 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-100 ${className || ''}`}
        {...props}
      >
        {children}
      </code>
    );
  }

  const sourcePositionDataProps = getSourcePositionDataProps(node, shouldRenderInline);
  if (shouldRenderMermaidBlock({
    inline,
    className,
    rawContent,
  })) {
    return <MermaidBlock {...sourcePositionDataProps} chart={rawContent.trim()} />;
  }

  const language = codeBlock.language;
  const sourceStartLine = node?.position?.start?.line;
  const sourceStartColumn = node?.position?.start?.column;
  const sourceEndLine = node?.position?.end?.line;
  const sourceEndColumn = node?.position?.end?.column;
  const highlightedCodeParts = (
    typeof sourceStartLine === 'number' &&
    typeof sourceStartColumn === 'number' &&
    typeof sourceEndLine === 'number' &&
    typeof sourceEndColumn === 'number' &&
    markdownContent &&
    annotations.length > 0
  ) ? buildCodeHighlightParts({
    annotations,
    content: markdownContent,
    markdownSource: sliceMarkdownSourceByRange({
      sourceText: markdownContent,
      startLine: sourceStartLine,
      startColumn: sourceStartColumn,
      endLine: sourceEndLine,
      endColumn: sourceEndColumn,
    }) ?? rawContent,
    rawContent,
    sourceStartLine,
    sourceStartColumn,
    sourceEndLine,
    sourceEndColumn,
    focusedAnnotationId,
    onActivateAnnotation,
  }) : null;

  return (
    <div className="group relative my-2">
      {language !== 'text' && (
        <div className="absolute left-3 top-2 z-10 text-xs font-medium uppercase text-gray-400">{language}</div>
      )}

      <button
        type="button"
        onClick={() =>
          copyTextToClipboard(rawContent).then((success) => {
            if (success) {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }
          })}
        className="absolute right-2 top-2 z-10 rounded-md border border-gray-600 bg-gray-700/80 px-2 py-1 text-xs text-white opacity-0 transition-opacity hover:bg-gray-700 group-hover:opacity-100"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>

      <div {...sourcePositionDataProps}>
        {highlightedCodeParts ? (
          <pre
            className="overflow-x-auto rounded-lg bg-[#282c34] text-sm text-gray-100"
            style={{
              margin: 0,
              padding: language !== 'text' ? '2rem 1rem 1rem 1rem' : '1rem',
            }}
          >
            <code className="font-mono whitespace-pre-wrap break-words">
              {highlightedCodeParts}
            </code>
          </pre>
        ) : (
          <SyntaxHighlighter
            language={language}
            style={prismOneDark}
            customStyle={{
              margin: 0,
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              padding: language !== 'text' ? '2rem 1rem 1rem 1rem' : '1rem',
            }}
          >
            {rawContent}
          </SyntaxHighlighter>
        )}
      </div>
    </div>
  );
}
