import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import type { Extension } from '@codemirror/state';
import { useEffect, useRef } from 'react';
import type { UseMarkdownAnnotationsResult } from '../../hooks/useMarkdownAnnotations';
import type { FileDraftPreviewOperation } from '../../types/types';
import { getFirstDraftPreviewAnchorLine } from '../../utils/draftPreview';
import MarkdownPreview from './markdown/MarkdownPreview';
import type { MarkdownToolbarAnnotationItem } from './MarkdownAnnotationToolbarMenu';

type CodeEditorSurfaceProps = {
  content: string;
  onChange: (value: string) => void;
  markdownPreview: boolean;
  isMarkdownFile: boolean;
  markdownAnnotations: UseMarkdownAnnotationsResult;
  fileName: string;
  filePath: string;
  onAppendToChatInput?: ((text: string) => void) | null;
  onMarkdownToolbarStateChange?: ((state: {
    addToChatInput: (() => void) | null;
    validAnnotationCount: number;
    items: MarkdownToolbarAnnotationItem[];
    onEditAnnotation: ((annotationId: string) => void) | null;
    onDeleteAnnotation: ((annotationId: string) => void) | null;
    onSendAnnotationToChatInput: ((annotationId: string) => void) | null;
  }) => void) | null;
  requestedEditAnnotationId?: string | null;
  onRequestedEditAnnotationHandled?: (() => void) | null;
  shouldAutoFollowOutput?: boolean;
  draftPreviewOperations?: FileDraftPreviewOperation[];
  isDarkMode: boolean;
  fontSize: number;
  showLineNumbers: boolean;
  extensions: Extension[];
};

function getClosestPreviewAnchor(
  elements: HTMLElement[],
  targetLine: number,
): HTMLElement | null {
  let closestElement: HTMLElement | null = null;
  let smallestDistance = Number.POSITIVE_INFINITY;

  for (const element of elements) {
    const startLine = Number(element.dataset.sourceStartLine ?? '');
    const endLine = Number(element.dataset.sourceEndLine ?? '');

    if (!Number.isFinite(startLine) || !Number.isFinite(endLine)) {
      continue;
    }

    if (targetLine >= startLine && targetLine <= endLine) {
      return element;
    }

    const distance = targetLine < startLine
      ? startLine - targetLine
      : targetLine - endLine;

    if (distance < smallestDistance) {
      smallestDistance = distance;
      closestElement = element;
    }
  }

  return closestElement;
}

export default function CodeEditorSurface({
  content,
  onChange,
  markdownPreview,
  isMarkdownFile,
  markdownAnnotations,
  fileName,
  filePath,
  onAppendToChatInput,
  onMarkdownToolbarStateChange = null,
  requestedEditAnnotationId = null,
  onRequestedEditAnnotationHandled = null,
  shouldAutoFollowOutput = false,
  draftPreviewOperations = [],
  isDarkMode,
  fontSize,
  showLineNumbers,
  extensions,
}: CodeEditorSurfaceProps) {
  const previewViewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!shouldAutoFollowOutput || !markdownPreview || !isMarkdownFile) {
      return;
    }

    const container = previewViewportRef.current;
    if (!container) {
      return;
    }

    const targetLine = getFirstDraftPreviewAnchorLine(content, draftPreviewOperations);

    if (targetLine) {
      const previewAnchors = Array.from(
        container.querySelectorAll<HTMLElement>('[data-source-start-line][data-source-end-line]'),
      );

      const positionedElement = getClosestPreviewAnchor(previewAnchors, targetLine);

      if (positionedElement) {
        positionedElement.scrollIntoView({
          block: 'center',
          behavior: 'smooth',
        });
        return;
      }
    }

    container.scrollTop = container.scrollHeight;
  }, [content, draftPreviewOperations, isMarkdownFile, markdownPreview, shouldAutoFollowOutput]);

  if (markdownPreview && isMarkdownFile) {
    return (
      <div
        ref={previewViewportRef}
        data-scroll-container="true"
        className="ui-scrollbar h-full overflow-y-auto bg-white dark:bg-gray-900"
      >
        <div className="prose prose-sm mx-auto max-w-4xl max-w-none px-8 py-6 dark:prose-invert prose-headings:font-semibold prose-a:text-blue-600 prose-code:text-sm prose-pre:bg-gray-900 prose-img:rounded-lg dark:prose-a:text-blue-400">
          <MarkdownPreview
            content={content}
            annotationState={markdownAnnotations}
            fileName={fileName}
            filePath={filePath}
            overlayAnchorRef={previewViewportRef}
            onAppendToChatInput={onAppendToChatInput}
            onToolbarStateChange={onMarkdownToolbarStateChange}
            requestedEditAnnotationId={requestedEditAnnotationId}
            onRequestedEditAnnotationHandled={onRequestedEditAnnotationHandled}
          />
        </div>
      </div>
    );
  }

  return (
    <CodeMirror
      className="min-w-0"
      value={content}
      onChange={onChange}
      extensions={extensions}
      theme={isDarkMode ? oneDark : undefined}
      height="100%"
      style={{
        fontSize: `${fontSize}px`,
        height: '100%',
        width: '100%',
        minWidth: 0,
      }}
      basicSetup={{
        lineNumbers: showLineNumbers,
        foldGutter: true,
        dropCursor: false,
        allowMultipleSelections: false,
        indentOnInput: true,
        bracketMatching: true,
        closeBrackets: true,
        autocompletion: true,
        highlightSelectionMatches: true,
        searchKeymap: true,
      }}
    />
  );
}
