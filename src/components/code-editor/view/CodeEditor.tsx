import { EditorView } from '@codemirror/view';
import { unifiedMergeView } from '@codemirror/merge';
import type { Extension } from '@codemirror/state';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCodeEditorDocument } from '../hooks/useCodeEditorDocument';
import { useMarkdownAnnotations } from '../hooks/useMarkdownAnnotations';
import { useCodeEditorSettings } from '../hooks/useCodeEditorSettings';
import { useEditorKeyboardShortcuts } from '../hooks/useEditorKeyboardShortcuts';
import type { CodeEditorFile, FileDraftPreviewOperation } from '../types/types';
import { applyDraftPreviewOperations, getAnimatedDraftPreviewContent } from '../utils/draftPreview';
import { createMinimapExtension, createScrollToFirstChunkExtension, getLanguageExtensions } from '../utils/editorExtensions';
import { getDefaultMarkdownPreview, isMarkdownFileName } from '../utils/markdownPreviewState';
import { createEmptyMarkdownToolbarState, isMarkdownToolbarStateEqual, type MarkdownToolbarState } from '../utils/markdownToolbarState';
import { getEditorStyles } from '../utils/editorStyles';
import { createEditorToolbarPanelExtension } from '../utils/editorToolbarPanel';
import { openVisualHtmlEditor, shouldShowVisualHtmlAction } from '../utils/visualHtmlEditor';
import CodeEditorFooter from './subcomponents/CodeEditorFooter';
import CodeEditorHeader from './subcomponents/CodeEditorHeader';
import CodeEditorLoadingState from './subcomponents/CodeEditorLoadingState';
import CodeEditorSurface from './subcomponents/CodeEditorSurface';
import CodeEditorBinaryFile from './subcomponents/CodeEditorBinaryFile';

type CodeEditorProps = {
  file: CodeEditorFile;
  onClose: () => void;
  projectPath?: string;
  isSidebar?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: (() => void) | null;
  onPopOut?: (() => void) | null;
  onAppendToChatInput?: ((text: string) => void) | null;
  draftPreviewOperations?: FileDraftPreviewOperation[];
};

export default function CodeEditor({
  file,
  onClose,
  projectPath,
  isSidebar = false,
  isExpanded = false,
  onToggleExpand = null,
  onPopOut = null,
  onAppendToChatInput = null,
  draftPreviewOperations = [],
}: CodeEditorProps) {
  const { t } = useTranslation('codeEditor');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showDiff, setShowDiff] = useState(Boolean(file.diffInfo));
  const [markdownPreview, setMarkdownPreview] = useState(() => getDefaultMarkdownPreview(file.name));
  const [requestedEditAnnotationId, setRequestedEditAnnotationId] = useState<string | null>(null);
  const [markdownToolbarState, setMarkdownToolbarState] = useState<MarkdownToolbarState>(() => createEmptyMarkdownToolbarState());
  const [draftPreviewRevealStartMs, setDraftPreviewRevealStartMs] = useState<number | null>(null);
  const [draftPreviewNowMs, setDraftPreviewNowMs] = useState(() => Date.now());

  const {
    isDarkMode,
    wordWrap,
    minimapEnabled,
    showLineNumbers,
    fontSize,
  } = useCodeEditorSettings();

  const {
    content,
    persistedContent,
    hasUnsavedChanges,
    setContent,
    loading,
    saving,
    saveSuccess,
    saveError,
    isBinary,
    handleSave,
    handleDownload,
    handleDownloadAsMarkdown,
    handleDownloadAsDoc,
  } = useCodeEditorDocument({
    file,
    projectPath,
  });

  const isMarkdownFile = useMemo(() => {
    return isMarkdownFileName(file.name);
  }, [file.name]);

  const isHtmlFile = useMemo(() => shouldShowVisualHtmlAction(file), [file]);

  const pendingWritePreviewKey = useMemo(() => {
    const pendingWrite = draftPreviewOperations.findLast((operation) => (
      operation.mode === 'write' && operation.status === 'pending'
    ));

    if (!pendingWrite) {
      return null;
    }

    return `${pendingWrite.toolId}:${pendingWrite.timestamp}:${pendingWrite.newText.length}`;
  }, [draftPreviewOperations]);

  useEffect(() => {
    if (!pendingWritePreviewKey) {
      setDraftPreviewRevealStartMs(null);
      return;
    }

    setDraftPreviewRevealStartMs(Date.now());
    setDraftPreviewNowMs(Date.now());
  }, [pendingWritePreviewKey]);

  useEffect(() => {
    if (!pendingWritePreviewKey || !draftPreviewRevealStartMs) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setDraftPreviewNowMs(Date.now());
    }, 50);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [draftPreviewRevealStartMs, pendingWritePreviewKey]);

  const effectiveContent = useMemo(() => {
    if (draftPreviewOperations.length === 0 || content !== persistedContent) {
      return content;
    }

    const finalPreviewContent = applyDraftPreviewOperations(content, draftPreviewOperations);

    if (!pendingWritePreviewKey) {
      return finalPreviewContent;
    }

    return getAnimatedDraftPreviewContent({
      content,
      operations: draftPreviewOperations,
      nowMs: draftPreviewNowMs,
      revealStartMs: draftPreviewRevealStartMs,
    });
  }, [content, draftPreviewNowMs, draftPreviewOperations, draftPreviewRevealStartMs, pendingWritePreviewKey, persistedContent]);

  const handleOpenVisualEditor = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    openVisualHtmlEditor({
      hasUnsavedChanges,
      persistedContent,
      filePath: file.path,
      projectName: file.projectName ?? projectPath,
      confirm: window.confirm.bind(window),
      setContent,
      dispatchEvent: window.dispatchEvent.bind(window),
    });
  }, [file.path, file.projectName, hasUnsavedChanges, persistedContent, projectPath, setContent]);

  const markdownAnnotations = useMarkdownAnnotations({
    enabled: isMarkdownFile,
    projectName: file.projectName ?? projectPath,
    filePath: file.path,
    content: effectiveContent,
  });

  useEffect(() => {
    setMarkdownPreview(getDefaultMarkdownPreview(file.name));
  }, [file.name]);

  useEffect(() => {
    setMarkdownToolbarState(createEmptyMarkdownToolbarState());
    setRequestedEditAnnotationId(null);
  }, [file.path, markdownPreview]);

  const handleMarkdownToolbarStateChange = useCallback((state: MarkdownToolbarState) => {
    setMarkdownToolbarState((previousState) => (
      isMarkdownToolbarStateEqual(previousState, state)
        ? previousState
        : state
    ));
  }, []);

  const minimapExtension = useMemo(
    () => (
      createMinimapExtension({
        file,
        showDiff,
        minimapEnabled,
        isDarkMode,
      })
    ),
    [file, isDarkMode, minimapEnabled, showDiff],
  );

  const scrollToFirstChunkExtension = useMemo(
    () => createScrollToFirstChunkExtension({ file, showDiff }),
    [file, showDiff],
  );

  const toolbarPanelExtension = useMemo(
    () => (
      createEditorToolbarPanelExtension({
        file,
        showDiff,
        isSidebar,
        isExpanded,
        onToggleDiff: () => setShowDiff((previous) => !previous),
        onPopOut,
        onToggleExpand,
        labels: {
          changes: t('toolbar.changes'),
          previousChange: t('toolbar.previousChange'),
          nextChange: t('toolbar.nextChange'),
          hideDiff: t('toolbar.hideDiff'),
          showDiff: t('toolbar.showDiff'),
          collapse: t('toolbar.collapse'),
          expand: t('toolbar.expand'),
        },
      })
    ),
    [file, isExpanded, isSidebar, onPopOut, onToggleExpand, showDiff, t],
  );

  const extensions = useMemo(() => {
    const allExtensions: Extension[] = [
      ...getLanguageExtensions(file.name),
      ...toolbarPanelExtension,
    ];

    if (file.diffInfo && showDiff && file.diffInfo.old_string !== undefined) {
      allExtensions.push(
        unifiedMergeView({
          original: file.diffInfo.old_string,
          mergeControls: false,
          highlightChanges: true,
          syntaxHighlightDeletions: false,
          gutter: true,
        }),
      );
      allExtensions.push(...minimapExtension);
      allExtensions.push(...scrollToFirstChunkExtension);
    }

    if (wordWrap) {
      allExtensions.push(EditorView.lineWrapping);
    }

    return allExtensions;
  }, [
    file.diffInfo,
    file.name,
    minimapExtension,
    scrollToFirstChunkExtension,
    showDiff,
    toolbarPanelExtension,
    wordWrap,
  ]);

  useEditorKeyboardShortcuts({
    onSave: handleSave,
    onClose,
    dependency: content,
  });

  if (loading) {
    return (
      <CodeEditorLoadingState
        isDarkMode={isDarkMode}
        isSidebar={isSidebar}
        loadingText={t('loading', { fileName: file.name })}
      />
    );
  }

  // Binary file display
  if (isBinary) {
    return (
      <CodeEditorBinaryFile
        file={file}
        isSidebar={isSidebar}
        isFullscreen={isFullscreen}
        onClose={onClose}
        onToggleFullscreen={() => setIsFullscreen((previous) => !previous)}
        title={t('binaryFile.title', 'Binary File')}
        message={t('binaryFile.message', 'The file "{{fileName}}" cannot be displayed in the text editor because it is a binary file.', { fileName: file.name })}
      />
    );
  }

  const outerContainerClassName = isFullscreen
    ? 'fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-0'
    : isSidebar
      ? 'w-full h-full flex flex-col'
      : 'fixed inset-0 z-[9999] md:bg-black/50 md:flex md:items-center md:justify-center md:p-4';

  const innerContainerClassName = isFullscreen
    ? 'bg-background shadow-2xl flex flex-col w-full h-full rounded-none'
    : isSidebar
      ? 'bg-background flex flex-col w-full h-full'
      : 'bg-background shadow-2xl flex flex-col w-full h-full md:rounded-lg md:shadow-2xl md:w-full md:max-w-6xl md:h-[80vh] md:max-h-[80vh]';

  return (
    <>
      <style>{getEditorStyles(isDarkMode)}</style>
      <div className={outerContainerClassName}>
        <div className={innerContainerClassName}>
          <CodeEditorHeader
            file={file}
            isSidebar={isSidebar}
            isFullscreen={isFullscreen}
            isMarkdownFile={isMarkdownFile}
            markdownPreview={markdownPreview}
            saving={saving}
            saveSuccess={saveSuccess}
            markdownAnnotationCount={markdownToolbarState.validAnnotationCount}
            canAddAnnotationsToChatInput={markdownToolbarState.validAnnotationCount > 0}
            markdownToolbarItems={markdownToolbarState.items}
            onToggleMarkdownPreview={() => setMarkdownPreview((previous) => !previous)}
            onAddAnnotationsToChatInput={markdownToolbarState.addToChatInput}
            onRequestEditAnnotation={setRequestedEditAnnotationId}
            onDeleteAnnotation={markdownToolbarState.onDeleteAnnotation}
            onSendAnnotationToChatInput={markdownToolbarState.onSendAnnotationToChatInput}
            onOpenSettings={() => window.openSettings?.('appearance')}
            showVisualHtmlAction={isHtmlFile}
            onOpenVisualHtmlEditor={handleOpenVisualEditor}
            onPopOut={onPopOut}
            onDownload={handleDownload}
            onDownloadAsMarkdown={handleDownloadAsMarkdown}
            onDownloadAsDoc={handleDownloadAsDoc}
            onSave={handleSave}
            onToggleFullscreen={() => setIsFullscreen((previous) => !previous)}
            onClose={onClose}
            labels={{
              showingChanges: t('header.showingChanges'),
              editMarkdown: t('actions.editMarkdown'),
              previewMarkdown: t('actions.previewMarkdown'),
              settings: t('toolbar.settings'),
              download: t('actions.download'),
              downloadMarkdown: '下载 Markdown',
              downloadDoc: '下载 Word 文档',
              save: t('actions.save'),
              saving: t('actions.saving'),
              saved: t('actions.saved'),
              addAnnotationsToChatInput: '添加标注到聊天输入框',
              addAnnotationsUnavailable: '请先保存标注，再添加到聊天输入框',
              fullscreen: t('actions.fullscreen'),
              exitFullscreen: t('actions.exitFullscreen'),
              close: t('actions.close'),
            }}
          />

          {saveError && (
            <div className="border-b border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
              {saveError}
            </div>
          )}

          <div className="min-w-0 flex-1 overflow-hidden">
            <CodeEditorSurface
              content={effectiveContent}
              onChange={setContent}
              markdownPreview={markdownPreview}
              isMarkdownFile={isMarkdownFile}
              markdownAnnotations={markdownAnnotations}
              fileName={file.name}
              filePath={file.path}
              onAppendToChatInput={onAppendToChatInput}
              onMarkdownToolbarStateChange={handleMarkdownToolbarStateChange}
              requestedEditAnnotationId={requestedEditAnnotationId}
              onRequestedEditAnnotationHandled={() => {
                setRequestedEditAnnotationId(null);
              }}
              shouldAutoFollowOutput={draftPreviewOperations.length > 0}
              draftPreviewOperations={draftPreviewOperations}
              isDarkMode={isDarkMode}
              fontSize={fontSize}
              showLineNumbers={showLineNumbers}
              extensions={extensions}
            />
          </div>

          <CodeEditorFooter
            content={effectiveContent}
            linesLabel={t('footer.lines')}
            charactersLabel={t('footer.characters')}
            shortcutsLabel={t('footer.shortcuts')}
          />
        </div>
      </div>
    </>
  );
}
