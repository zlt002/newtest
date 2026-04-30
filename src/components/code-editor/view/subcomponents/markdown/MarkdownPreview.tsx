import { createElement, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject, ComponentPropsWithoutRef  } from 'react';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import { AlertTriangle } from 'lucide-react';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { MarkdownAnnotation } from '../../../types/markdownAnnotations.ts';
import type { UseMarkdownAnnotationsResult } from '../../../hooks/useMarkdownAnnotations';
import {
  canCreateMarkdownAnnotation,
} from '../../../utils/markdownAnnotationSelection';
import {
  formatMarkdownAnnotationPromptItemsForChat,
  formatMarkdownAnnotationsForChat,
} from '../../../utils/markdownAnnotationPrompt';
import type { MarkdownToolbarAnnotationItem } from '../MarkdownAnnotationToolbarMenu';
import { calculatePreviewCenteredPosition, calculateViewportSafePosition } from '../../../utils/markdownAnnotationOverlayPosition';
import {
  doesAnnotationMatchContent,
  resolveRenderedSelectionToSourceRange,
  sliceMarkdownSourceByRange,
} from '../../../utils/markdownSourceTextMapping';
import {
  isMarkdownAnnotationDocumentChanged,
  shouldCaptureLegacyAnnotationBaselineHash,
} from '../../../utils/markdownAnnotationHashState.ts';
import { decorateMarkdownAnnotationChildren } from '../../../utils/markdownAnnotationDecorations';
import { isEventFromMarkdownAnnotationOverlay } from '../../../utils/markdownAnnotationOverlayGuards';
import { buildStableTextHash } from '../../../utils/markdownAnnotationHashes.ts';
import MarkdownAnnotationBanner from './MarkdownAnnotationBanner';
import MarkdownAnnotationComposer from './MarkdownAnnotationComposer';
import MarkdownAnnotationContextMenu from './MarkdownAnnotationContextMenu';
import MarkdownCodeBlock from './MarkdownCodeBlock';

type MarkdownPreviewProps = {
  content: string;
  annotationState?: UseMarkdownAnnotationsResult;
  fileName: string;
  filePath: string;
  overlayAnchorRef?: RefObject<HTMLDivElement | null>;
  onAppendToChatInput?: ((text: string) => void) | null;
  onToolbarStateChange?: ((state: {
    addToChatInput: (() => void) | null;
    validAnnotationCount: number;
    items: MarkdownToolbarAnnotationItem[];
    onEditAnnotation: ((annotationId: string) => void) | null;
    onDeleteAnnotation: ((annotationId: string) => void) | null;
    onSendAnnotationToChatInput: ((annotationId: string) => void) | null;
  }) => void) | null;
  requestedEditAnnotationId?: string | null;
  onRequestedEditAnnotationHandled?: (() => void) | null;
};

type MarkdownPositionNode = {
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

type SourcePositionDataProps = {
  'data-source-start-line'?: number;
  'data-source-start-column'?: number;
  'data-source-end-line'?: number;
  'data-source-end-column'?: number;
};

type PreviewPosition = {
  x: number;
  y: number;
};

type PendingSelection = {
  annotationId?: string;
  createdAt?: string;
  selectedText: string;
  range: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
};

type PositionedMarkdownProps<Tag extends keyof JSX.IntrinsicElements> = ComponentPropsWithoutRef<Tag> & {
  node?: MarkdownPositionNode;
};

const getSourcePositionDataProps = (node?: MarkdownPositionNode): SourcePositionDataProps => {
  const start = node?.position?.start;
  const end = node?.position?.end;

  if (
    typeof start?.line !== 'number' ||
    typeof start.column !== 'number' ||
    typeof end?.line !== 'number' ||
    typeof end.column !== 'number'
  ) {
    return {};
  }

  return {
    'data-source-start-line': start.line,
    'data-source-start-column': start.column,
    'data-source-end-line': end.line,
    'data-source-end-column': end.column,
  };
};

const createHighlightedBlock = <Tag extends keyof JSX.IntrinsicElements>(tag: Tag) => {
  const HighlightedBlock = ({
    node,
    children,
    annotations,
    focusedAnnotationId,
    onActivateAnnotation,
    markdownContent,
    ...props
  }: PositionedMarkdownProps<Tag> & {
    annotations: MarkdownAnnotation[];
    focusedAnnotationId?: string | null;
    onActivateAnnotation?: ((annotationId: string) => void) | null;
    markdownContent: string;
  }) => {
    const sourcePositionProps = getSourcePositionDataProps(node);
    const sourceStartLine = sourcePositionProps['data-source-start-line'];
    const sourceStartColumn = sourcePositionProps['data-source-start-column'];
    const sourceEndLine = sourcePositionProps['data-source-end-line'];
    const sourceEndColumn = sourcePositionProps['data-source-end-column'];

    if (
      typeof sourceStartLine !== 'number' ||
      typeof sourceStartColumn !== 'number' ||
      typeof sourceEndLine !== 'number' ||
      typeof sourceEndColumn !== 'number'
    ) {
      return createElement(tag, { ...props, ...sourcePositionProps }, children);
    }

    const markdownSource = sliceMarkdownSourceByRange({
      sourceText: markdownContent,
      startLine: sourceStartLine,
      startColumn: sourceStartColumn,
      endLine: sourceEndLine,
      endColumn: sourceEndColumn,
    });

    if (!markdownSource) {
      return createElement(tag, { ...props, ...sourcePositionProps }, children);
    }

    return createElement(
      tag,
      { ...props, ...sourcePositionProps },
      decorateMarkdownAnnotationChildren({
        content: markdownContent,
        children,
        annotations,
        markdownSource,
        sourceStartLine,
        sourceStartColumn,
        sourceEndLine,
        sourceEndColumn,
        focusedAnnotationId: focusedAnnotationId ?? null,
        onActivate: onActivateAnnotation ?? null,
      }),
    );
  };

  return HighlightedBlock;
};

const Paragraph = createHighlightedBlock('p');
const Heading1 = createHighlightedBlock('h1');
const Heading2 = createHighlightedBlock('h2');
const Heading3 = createHighlightedBlock('h3');
const Heading4 = createHighlightedBlock('h4');
const Heading5 = createHighlightedBlock('h5');
const Heading6 = createHighlightedBlock('h6');
const ListItem = createHighlightedBlock('li');
const TableHeaderCell = createHighlightedBlock('th');
const TableDataCell = createHighlightedBlock('td');

const createMarkdownPreviewComponents = (
  content: string,
  annotations: MarkdownAnnotation[],
  focusedAnnotationId: string | null,
  onActivateAnnotation: ((annotationId: string) => void) | null,
): Components => ({
  code: ({ node, inline, className, children, ...props }) => (
    <MarkdownCodeBlock
      {...props}
      node={node}
      inline={inline}
      className={className}
      annotations={annotations}
      focusedAnnotationId={focusedAnnotationId}
      onActivateAnnotation={onActivateAnnotation}
      markdownContent={content}
    >
      {children}
    </MarkdownCodeBlock>
  ),
  p: ({ node, children, ...props }) => <Paragraph {...props} node={node} annotations={annotations} focusedAnnotationId={focusedAnnotationId} onActivateAnnotation={onActivateAnnotation} markdownContent={content}>{children}</Paragraph>,
  h1: ({ node, children, ...props }) => <Heading1 {...props} node={node} annotations={annotations} focusedAnnotationId={focusedAnnotationId} onActivateAnnotation={onActivateAnnotation} markdownContent={content}>{children}</Heading1>,
  h2: ({ node, children, ...props }) => <Heading2 {...props} node={node} annotations={annotations} focusedAnnotationId={focusedAnnotationId} onActivateAnnotation={onActivateAnnotation} markdownContent={content}>{children}</Heading2>,
  h3: ({ node, children, ...props }) => <Heading3 {...props} node={node} annotations={annotations} focusedAnnotationId={focusedAnnotationId} onActivateAnnotation={onActivateAnnotation} markdownContent={content}>{children}</Heading3>,
  h4: ({ node, children, ...props }) => <Heading4 {...props} node={node} annotations={annotations} focusedAnnotationId={focusedAnnotationId} onActivateAnnotation={onActivateAnnotation} markdownContent={content}>{children}</Heading4>,
  h5: ({ node, children, ...props }) => <Heading5 {...props} node={node} annotations={annotations} focusedAnnotationId={focusedAnnotationId} onActivateAnnotation={onActivateAnnotation} markdownContent={content}>{children}</Heading5>,
  h6: ({ node, children, ...props }) => <Heading6 {...props} node={node} annotations={annotations} focusedAnnotationId={focusedAnnotationId} onActivateAnnotation={onActivateAnnotation} markdownContent={content}>{children}</Heading6>,
  li: ({ node, children, ...props }) => <ListItem {...props} node={node} annotations={annotations} focusedAnnotationId={focusedAnnotationId} onActivateAnnotation={onActivateAnnotation} markdownContent={content}>{children}</ListItem>,
  strong: ({ children, ...props }: PositionedMarkdownProps<'strong'>) => (
    <strong {...props}>
      {children}
    </strong>
  ),
  em: ({ children, ...props }: PositionedMarkdownProps<'em'>) => (
    <em {...props}>
      {children}
    </em>
  ),
  blockquote: ({ children, ...props }: PositionedMarkdownProps<'blockquote'>) => (
    <blockquote
      {...props}
      className="my-2 border-l-4 border-gray-300 pl-4 italic text-gray-600 dark:border-gray-600 dark:text-gray-400"
    >
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a href={href} className="text-blue-600 hover:underline dark:text-blue-400" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="min-w-full border-collapse border border-gray-200 dark:border-gray-700">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-gray-50 dark:bg-gray-800">{children}</thead>,
  th: ({ node, children, ...props }: PositionedMarkdownProps<'th'>) => (
    <TableHeaderCell
      {...props}
      node={node}
      annotations={annotations}
      focusedAnnotationId={focusedAnnotationId}
      onActivateAnnotation={onActivateAnnotation}
      markdownContent={content}
      className="border border-gray-200 px-3 py-2 text-left text-sm font-semibold dark:border-gray-700"
    >
      {children}
    </TableHeaderCell>
  ),
  td: ({ node, children, ...props }: PositionedMarkdownProps<'td'>) => (
    <TableDataCell
      {...props}
      node={node}
      annotations={annotations}
      focusedAnnotationId={focusedAnnotationId}
      onActivateAnnotation={onActivateAnnotation}
      markdownContent={content}
      className="border border-gray-200 px-3 py-2 align-top text-sm dark:border-gray-700"
    >
      {children}
    </TableDataCell>
  ),
});

const MENU_WIDTH = 160;
const COMPOSER_WIDTH = 360;
const COMPOSER_HEIGHT = 260;

const SAFE_SOURCE_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TH', 'TD']);
const UNSAFE_MARKDOWN_SELECTOR = [
  '[data-markdown-annotation-disabled="true"]',
].join(', ');

const hasSourcePositionData = (element: HTMLElement): boolean =>
  element.hasAttribute('data-source-start-line') &&
  element.hasAttribute('data-source-start-column') &&
  element.hasAttribute('data-source-end-line') &&
  element.hasAttribute('data-source-end-column');

const isSafeSourceAnchor = (element: HTMLElement): boolean =>
  (SAFE_SOURCE_TAGS.has(element.tagName) || element.dataset.markdownSourceAnchor === 'true') &&
  !element.matches(UNSAFE_MARKDOWN_SELECTOR) &&
  !element.querySelector(UNSAFE_MARKDOWN_SELECTOR);

const hasUnsafeSelectionContext = (selectionRange: Range, sourceElement: HTMLElement): boolean => {
  const startElement = selectionRange.startContainer instanceof Element
    ? selectionRange.startContainer
    : selectionRange.startContainer.parentElement;
  const endElement = selectionRange.endContainer instanceof Element
    ? selectionRange.endContainer
    : selectionRange.endContainer.parentElement;

  return Boolean(
    startElement?.closest(UNSAFE_MARKDOWN_SELECTOR) ||
    endElement?.closest(UNSAFE_MARKDOWN_SELECTOR) ||
    sourceElement.closest(UNSAFE_MARKDOWN_SELECTOR) ||
    sourceElement.querySelector(UNSAFE_MARKDOWN_SELECTOR),
  );
};

const getSourceAncestors = (node: Node): HTMLElement[] => {
  const ancestors: HTMLElement[] = [];
  let element = node instanceof HTMLElement ? node : node.parentElement;

  while (element) {
    if (hasSourcePositionData(element)) {
      ancestors.push(element);
    }
    element = element.parentElement;
  }

  return ancestors;
};

const getNearestSourceElement = (node: Node): HTMLElement | null =>
  getSourceAncestors(node)[0] ?? null;

const getRangeTextOffset = (sourceElement: HTMLElement, container: Node, offset: number): number => {
  const measurementRange = document.createRange();
  measurementRange.selectNodeContents(sourceElement);
  measurementRange.setEnd(container, offset);
  return measurementRange.toString().length;
};

const parseSourceNumber = (element: HTMLElement, key: keyof DOMStringMap): number | null => {
  const value = element.dataset[key];
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const getMarkdownSourceNode = (
  element: HTMLElement,
  content: string,
): {
  markdownSource: string;
  sourceStartLine: number;
  sourceStartColumn: number;
} | null => {
  const sourceStartLine = parseSourceNumber(element, 'sourceStartLine');
  const sourceStartColumn = parseSourceNumber(element, 'sourceStartColumn');
  const sourceEndLine = parseSourceNumber(element, 'sourceEndLine');
  const sourceEndColumn = parseSourceNumber(element, 'sourceEndColumn');

  if (
    sourceStartLine === null ||
    sourceStartColumn === null ||
    sourceEndLine === null ||
    sourceEndColumn === null
  ) {
    return null;
  }

  const markdownSource = sliceMarkdownSourceByRange({
    sourceText: content,
    startLine: sourceStartLine,
    startColumn: sourceStartColumn,
    endLine: sourceEndLine,
    endColumn: sourceEndColumn,
  });

  if (markdownSource === null || markdownSource.length === 0) {
    return null;
  }

  return {
    markdownSource,
    sourceStartLine,
    sourceStartColumn,
  };
};

export default function MarkdownPreview({
  content,
  annotationState,
  fileName,
  filePath,
  overlayAnchorRef = undefined,
  onAppendToChatInput,
  onToolbarStateChange = null,
  requestedEditAnnotationId = null,
  onRequestedEditAnnotationHandled = null,
}: MarkdownPreviewProps) {
  const remarkPlugins = useMemo(() => [remarkGfm, remarkMath], []);
  const rehypePlugins = useMemo(() => [rehypeKatex], []);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<PreviewPosition>({ x: 0, y: 0 });
  const [menuSelection, setMenuSelection] = useState<PendingSelection | null>(null);
  const [composerSelection, setComposerSelection] = useState<PendingSelection | null>(null);
  const [composerNote, setComposerNote] = useState('');
  const [composerError, setComposerError] = useState<string | null>(null);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [invalidAnnotationCount, setInvalidAnnotationCount] = useState(0);
  const [validAnnotationIds, setValidAnnotationIds] = useState<string[]>([]);
  const [selectionHint, setSelectionHint] = useState<string | null>(null);
  const [selectionHintPosition, setSelectionHintPosition] = useState<PreviewPosition | null>(null);
  const [focusedAnnotationId, setFocusedAnnotationId] = useState<string | null>(null);
  const [legacyBaselineHash, setLegacyBaselineHash] = useState<string | null>(null);
  const annotations = annotationState?.annotations ?? [];
  const annotationFile = annotationState?.annotationFile ?? null;
  const contentHash = useMemo(() => buildStableTextHash(content), [content]);
  const saveAnnotation = annotationState?.saveAnnotation;
  const saveAnnotationFile = annotationState?.saveAnnotationFile;
  const annotationSaving = annotationState?.saving ?? false;
  const focusedAnnotationTimerRef = useRef<number | null>(null);
  const selectionHintTimerRef = useRef<number | null>(null);

  const showSelectionHint = useCallback((message: string) => {
    const anchorRect = overlayAnchorRef?.current?.getBoundingClientRect();
    if (anchorRect) {
      setSelectionHintPosition({
        x: anchorRect.left + (anchorRect.width / 2),
        y: anchorRect.top + 16,
      });
    } else {
      setSelectionHintPosition({
        x: window.innerWidth / 2,
        y: 88,
      });
    }

    if (selectionHintTimerRef.current !== null) {
      window.clearTimeout(selectionHintTimerRef.current);
    }

    setSelectionHint(message);
    selectionHintTimerRef.current = window.setTimeout(() => {
      setSelectionHint(null);
      setSelectionHintPosition(null);
      selectionHintTimerRef.current = null;
    }, 2600);
  }, [overlayAnchorRef]);

  const openSelectionMenu = useCallback((selection: PendingSelection, position: PreviewPosition) => {
    setIsComposerOpen(false);
    setComposerNote('');
    setComposerError(null);
    setMenuSelection(selection);
    setMenuPosition(calculateViewportSafePosition(position, MENU_WIDTH, window.innerWidth, window.innerHeight));
  }, []);

  const closeMenu = useCallback(() => {
    setMenuSelection(null);
  }, []);

  const closeComposer = useCallback(() => {
    setIsComposerOpen(false);
    setComposerSelection(null);
    setComposerNote('');
    setComposerError(null);
  }, []);

  const clearFocusedAnnotation = useCallback(() => {
    if (focusedAnnotationTimerRef.current !== null) {
      window.clearTimeout(focusedAnnotationTimerRef.current);
      focusedAnnotationTimerRef.current = null;
    }
    setFocusedAnnotationId(null);
  }, []);

  const focusAnnotation = useCallback((annotationId: string) => {
    setFocusedAnnotationId(annotationId);
    if (focusedAnnotationTimerRef.current !== null) {
      window.clearTimeout(focusedAnnotationTimerRef.current);
    }
    focusedAnnotationTimerRef.current = window.setTimeout(() => {
      setFocusedAnnotationId(null);
      focusedAnnotationTimerRef.current = null;
    }, 2500);
  }, []);

  const getSelectionContext = useCallback((): PendingSelection | null => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return null;
    }

    const selectedText = selection.toString();
    if (!selectedText.trim()) {
      return null;
    }

    const selectionRange = selection.getRangeAt(0);
    const startSourceElement = getNearestSourceElement(selectionRange.startContainer);
    const endSourceElement = getNearestSourceElement(selectionRange.endContainer);

    if (
      !startSourceElement ||
      !endSourceElement ||
      !isSafeSourceAnchor(startSourceElement) ||
      !isSafeSourceAnchor(endSourceElement) ||
      hasUnsafeSelectionContext(selectionRange, startSourceElement) ||
      hasUnsafeSelectionContext(selectionRange, endSourceElement)
    ) {
      return null;
    }

    const startMarkdownSourceNode = getMarkdownSourceNode(startSourceElement, content);
    const endMarkdownSourceNode = getMarkdownSourceNode(endSourceElement, content);

    if (!startMarkdownSourceNode || !endMarkdownSourceNode) {
      return null;
    }

    const renderedTextOffsetStart = getRangeTextOffset(
      startSourceElement,
      selectionRange.startContainer,
      selectionRange.startOffset,
    );
    const renderedTextOffsetEnd = getRangeTextOffset(
      endSourceElement,
      selectionRange.endContainer,
      selectionRange.endOffset,
    );
    const range = resolveRenderedSelectionToSourceRange({
      content,
      selectedText,
      startAnchor: {
        markdownSource: startMarkdownSourceNode.markdownSource,
        sourceStartLine: startMarkdownSourceNode.sourceStartLine,
        sourceStartColumn: startMarkdownSourceNode.sourceStartColumn,
        renderedOffset: renderedTextOffsetStart,
      },
      endAnchor: {
        markdownSource: endMarkdownSourceNode.markdownSource,
        sourceStartLine: endMarkdownSourceNode.sourceStartLine,
        sourceStartColumn: endMarkdownSourceNode.sourceStartColumn,
        renderedOffset: renderedTextOffsetEnd,
      },
    });

    if (!range) {
      return null;
    }

    return {
      annotationId: undefined,
      createdAt: undefined,
      selectedText,
      range,
    };
  }, [content]);

  const handlePreviewContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (isEventFromMarkdownAnnotationOverlay(event.target)) {
      return;
    }

    const selectionText = window.getSelection()?.toString() ?? '';
    const nextSelection = getSelectionContext();
    const canCreate = canCreateMarkdownAnnotation({
      hasSelection: selectionText.trim().length > 0,
      isValidSourceMapping: nextSelection !== null,
    });

    if (!canCreate || !nextSelection) {
      closeMenu();
      return;
    }

    event.preventDefault();
    openSelectionMenu(nextSelection, { x: event.clientX, y: event.clientY });
  }, [closeMenu, getSelectionContext, openSelectionMenu]);

  const handlePreviewMouseUp = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    if (isEventFromMarkdownAnnotationOverlay(event.target)) {
      return;
    }

    window.setTimeout(() => {
      const selectionText = window.getSelection()?.toString() ?? '';
      const nextSelection = getSelectionContext();

      if (!selectionText.trim()) {
        setSelectionHint(null);
        setSelectionHintPosition(null);
        closeMenu();
        return;
      }

      if (!nextSelection) {
        showSelectionHint('当前选区无法稳定映射到 Markdown 源码');
        closeMenu();
        return;
      }

      setSelectionHint(null);
      setSelectionHintPosition(null);
      openSelectionMenu(nextSelection, {
        x: event.clientX + 8,
        y: event.clientY + 8,
      });
    }, 0);
  }, [closeMenu, getSelectionContext, openSelectionMenu, showSelectionHint]);

  const handleCreateAnnotation = useCallback(() => {
    if (!menuSelection) {
      return;
    }

    setMenuSelection(null);
    setComposerSelection(menuSelection);
    setComposerError(null);
    setComposerNote('');
    setIsComposerOpen(true);
    setMenuPosition((currentPosition) =>
      calculateViewportSafePosition(
        {
          x: currentPosition.x,
          y: currentPosition.y + 12,
        },
        COMPOSER_WIDTH,
        window.innerWidth,
        window.innerHeight,
      ),
    );
  }, [menuSelection]);

  const handleSaveAnnotation = useCallback(async () => {
    if (!saveAnnotation || !composerSelection) {
      return;
    }

    if (annotationSaving) {
      return;
    }

    const trimmedNote = composerNote.trim();
    if (!trimmedNote) {
      setComposerError('请输入标注内容');
      return;
    }

    const timestamp = new Date().toISOString();
    const annotation: MarkdownAnnotation = {
      id: composerSelection.annotationId ?? globalThis.crypto?.randomUUID?.() ?? `markdown-annotation-${Date.now()}`,
      ...composerSelection.range,
      selectedText: composerSelection.selectedText,
      note: trimmedNote,
      quoteHash: buildStableTextHash(composerSelection.selectedText),
      createdAt: composerSelection.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    try {
      await saveAnnotation(annotation);
      focusAnnotation(annotation.id);
      closeComposer();
      closeMenu();
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : String(error));
    }
  }, [annotationSaving, closeComposer, closeMenu, composerNote, composerSelection, focusAnnotation, saveAnnotation]);

  const handleSendComposerDraftToChatInput = useCallback(() => {
    if (!onAppendToChatInput || !composerSelection) {
      return;
    }

    const trimmedNote = composerNote.trim();
    if (!trimmedNote) {
      setComposerError('请输入标注内容');
      return;
    }

    const prompt = formatMarkdownAnnotationPromptItemsForChat({
      fileName,
      filePath,
      annotations: [
        {
          ...composerSelection.range,
          selectedText: composerSelection.selectedText,
          note: trimmedNote,
        },
      ],
    });

    if (!prompt) {
      return;
    }

    onAppendToChatInput(prompt);
    closeComposer();
    closeMenu();
  }, [closeComposer, closeMenu, composerNote, composerSelection, fileName, filePath, onAppendToChatInput]);

  useEffect(() => {
    return () => {
      if (focusedAnnotationTimerRef.current !== null) {
        window.clearTimeout(focusedAnnotationTimerRef.current);
      }
      if (selectionHintTimerRef.current !== null) {
        window.clearTimeout(selectionHintTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (annotations.length === 0) {
      setInvalidAnnotationCount(0);
      setValidAnnotationIds([]);
      return;
    }

    const nextValidAnnotationIds = annotations
      .filter((annotation) => doesAnnotationMatchContent({ content, annotation }))
      .map((annotation) => annotation.id);

    setValidAnnotationIds(nextValidAnnotationIds);
    setInvalidAnnotationCount(annotations.length - nextValidAnnotationIds.length);
  }, [annotations, content]);

  useEffect(() => {
    setLegacyBaselineHash(null);
  }, [annotationFile?.filePath]);

  useEffect(() => {
    if (!annotationFile) {
      setLegacyBaselineHash(null);
      return;
    }

    if (annotationFile.fileHash) {
      setLegacyBaselineHash(null);
      return;
    }

    if (!shouldCaptureLegacyAnnotationBaselineHash({
      storedFileHash: annotationFile.fileHash,
      legacyBaselineHash,
      annotationCount: annotations.length,
      invalidAnnotationCount,
    })) {
      return;
    }

    setLegacyBaselineHash(contentHash);
  }, [annotationFile, annotations.length, contentHash, invalidAnnotationCount, legacyBaselineHash]);

  const isDocumentContentChanged = isMarkdownAnnotationDocumentChanged({
    storedFileHash: annotationFile?.fileHash,
    legacyBaselineHash,
    contentHash,
  });

  const handleAddAnnotationsToChatInput = useCallback(() => {
    if (!onAppendToChatInput) {
      return;
    }

    const validAnnotations = annotations.filter((annotation) => validAnnotationIds.includes(annotation.id));
    if (validAnnotations.length === 0) {
      return;
    }

    const prompt = formatMarkdownAnnotationsForChat({
      fileName,
      filePath,
      annotations: validAnnotations,
    });

    if (!prompt) {
      return;
    }

    onAppendToChatInput(prompt);
  }, [annotations, fileName, filePath, onAppendToChatInput, validAnnotationIds]);

  const findAnnotation = useCallback((annotationId: string) => {
    return annotations.find((annotation) => annotation.id === annotationId) ?? null;
  }, [annotations]);

  const handleEditAnnotation = useCallback((annotationId: string) => {
    const annotation = findAnnotation(annotationId);
    if (!annotation) {
      return;
    }

    setMenuSelection(null);
    setComposerSelection({
      annotationId: annotation.id,
      createdAt: annotation.createdAt,
      selectedText: annotation.selectedText,
      range: {
        startLine: annotation.startLine,
        startColumn: annotation.startColumn,
        endLine: annotation.endLine,
        endColumn: annotation.endColumn,
      },
    });
    setComposerError(null);
    setComposerNote(annotation.note);
    setMenuPosition(
      calculatePreviewCenteredPosition(
        previewContainerRef.current?.getBoundingClientRect() ?? null,
        COMPOSER_WIDTH,
        COMPOSER_HEIGHT,
        window.innerWidth,
        window.innerHeight,
      ),
    );
    setIsComposerOpen(true);
    focusAnnotation(annotationId);
  }, [findAnnotation, focusAnnotation]);

  const renderedAnnotations = useMemo(
    () => annotations.filter((annotation) => validAnnotationIds.includes(annotation.id)),
    [annotations, validAnnotationIds],
  );

  const markdownPreviewComponents = useMemo(
    () => createMarkdownPreviewComponents(content, renderedAnnotations, focusedAnnotationId, handleEditAnnotation),
    [content, focusedAnnotationId, handleEditAnnotation, renderedAnnotations],
  );

  useEffect(() => {
    if (!requestedEditAnnotationId) {
      return;
    }

    handleEditAnnotation(requestedEditAnnotationId);
    onRequestedEditAnnotationHandled?.();
  }, [handleEditAnnotation, onRequestedEditAnnotationHandled, requestedEditAnnotationId]);

  const handleDeleteAnnotation = useCallback(async (annotationId: string) => {
    if (!annotationFile || !saveAnnotationFile) {
      return;
    }

    const nextAnnotationFile = {
      ...annotationFile,
      annotations: annotationFile.annotations.filter((annotation) => annotation.id !== annotationId),
    };

    await saveAnnotationFile(nextAnnotationFile);
    if (composerSelection?.annotationId === annotationId) {
      closeComposer();
    }
    clearFocusedAnnotation();
  }, [annotationFile, clearFocusedAnnotation, closeComposer, composerSelection?.annotationId, saveAnnotationFile]);

  const handleDeleteAnnotationFromToolbar = useCallback((annotationId: string) => {
    void handleDeleteAnnotation(annotationId);
  }, [handleDeleteAnnotation]);

  const handleSendSingleAnnotation = useCallback((annotationId: string) => {
    if (!onAppendToChatInput) {
      return;
    }

    const annotation = findAnnotation(annotationId);
    if (!annotation || !validAnnotationIds.includes(annotation.id)) {
      return;
    }

    const prompt = formatMarkdownAnnotationsForChat({
      fileName,
      filePath,
      annotations: [annotation],
    });

    if (prompt) {
      onAppendToChatInput(prompt);
    }
  }, [fileName, filePath, findAnnotation, onAppendToChatInput, validAnnotationIds]);

  const toolbarItems = useMemo<MarkdownToolbarAnnotationItem[]>(
    () => annotations.map((annotation) => ({
      id: annotation.id,
      selectedText: annotation.selectedText,
      note: annotation.note,
      isValid: validAnnotationIds.includes(annotation.id),
    })),
    [annotations, validAnnotationIds],
  );

  const toolbarState = useMemo(() => ({
    addToChatInput: validAnnotationIds.length > 0 && onAppendToChatInput
      ? handleAddAnnotationsToChatInput
      : null,
    validAnnotationCount: validAnnotationIds.length,
    items: toolbarItems,
    onEditAnnotation: handleEditAnnotation,
    onDeleteAnnotation: handleDeleteAnnotationFromToolbar,
    onSendAnnotationToChatInput: handleSendSingleAnnotation,
  }), [
    handleAddAnnotationsToChatInput,
    handleDeleteAnnotationFromToolbar,
    handleEditAnnotation,
    handleSendSingleAnnotation,
    onAppendToChatInput,
    toolbarItems,
    validAnnotationIds.length,
  ]);

  useEffect(() => {
    onToolbarStateChange?.(toolbarState);
  }, [onToolbarStateChange, toolbarState]);

  useEffect(() => {
    return () => {
      onToolbarStateChange?.({
        addToChatInput: null,
        validAnnotationCount: 0,
        items: [],
        onEditAnnotation: null,
        onDeleteAnnotation: null,
        onSendAnnotationToChatInput: null,
      });
    };
  }, [onToolbarStateChange]);

  const addToChatButtonTitle = !onAppendToChatInput
    ? '当前聊天输入框不可用'
    : validAnnotationIds.length > 0
      ? '将当前标注追加到聊天输入框'
      : '请先为选中文本添加标注，再追加到聊天输入框';

  return (
    <div
      ref={previewContainerRef}
      className="relative"
      onContextMenu={handlePreviewContextMenu}
      onMouseUp={handlePreviewMouseUp}
    >
      <MarkdownAnnotationBanner
        invalidCount={invalidAnnotationCount}
        isDocumentContentChanged={isDocumentContentChanged}
      />
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={markdownPreviewComponents}
      >
        {content}
      </ReactMarkdown>
      <MarkdownAnnotationContextMenu
        isOpen={menuSelection !== null}
        position={menuPosition}
        canCreate={menuSelection !== null}
        onCreate={handleCreateAnnotation}
        onClose={closeMenu}
      />
      <MarkdownAnnotationComposer
        isOpen={isComposerOpen && composerSelection !== null}
        position={menuPosition}
        selectedText={composerSelection?.selectedText ?? ''}
        note={composerNote}
        saving={annotationState?.saving ?? false}
        error={composerError ?? annotationState?.error ?? null}
        onNoteChange={setComposerNote}
        onSendToChatInput={onAppendToChatInput ? handleSendComposerDraftToChatInput : null}
        onSave={handleSaveAnnotation}
        onCancel={closeComposer}
      />
      {selectionHint && (
        <div
          data-markdown-annotation-overlay="true"
          style={{
            position: 'fixed',
            left: selectionHintPosition?.x ?? window.innerWidth / 2,
            top: selectionHintPosition?.y ?? 88,
            transform: 'translateX(-50%)',
          }}
          className="animate-in fade-in-0 slide-in-from-top-2 pointer-events-none z-[10020] flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm text-white shadow-lg"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{selectionHint}</span>
        </div>
      )}
    </div>
  );
}
