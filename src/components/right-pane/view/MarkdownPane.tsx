import React, { Suspense, lazy } from 'react';
import { getDefaultMarkdownPreview } from '../../code-editor/utils/markdownPreviewState';
import type { FileDraftPreviewOperation } from '../../code-editor/types/types';
import type { RightPaneMarkdownTarget } from '../types';
import { createEditorPaneProps } from './editorPaneProps';

const CodeEditor = lazy(() => import('../../code-editor/view/CodeEditor'));

type MarkdownPaneProps = {
  target: RightPaneMarkdownTarget;
  projectPath?: string;
  refreshPulse?: number;
  draftPreviewOperations?: FileDraftPreviewOperation[];
  onClosePane: () => void;
  onTogglePaneExpand?: (() => void) | null;
  onAppendToChatInput?: ((text: string) => void) | null;
  onPopOut?: (() => void) | null;
  isExpanded?: boolean;
  isSidebar?: boolean;
};

export default function MarkdownPane({
  target,
  projectPath,
  refreshPulse = 0,
  draftPreviewOperations = [],
  onClosePane,
  onTogglePaneExpand = null,
  onAppendToChatInput = null,
  onPopOut = null,
  isExpanded = false,
  isSidebar = true,
}: MarkdownPaneProps) {
  const fallback = (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div className="text-sm font-medium">{target.fileName}</div>
        <button
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          data-right-pane-close="true"
          onClick={onClosePane}
          type="button"
        >
          Close
        </button>
      </div>
    </div>
  );

  if (typeof window === 'undefined') {
    return (
      <div
        className="h-full min-h-0"
        data-right-pane-view="markdown"
        data-markdown-pane="true"
        data-right-pane-file-path={target.filePath}
        data-markdown-file-name={target.fileName}
        data-markdown-default-preview={String(getDefaultMarkdownPreview(target.fileName))}
        data-editor-refresh-pulse={String(refreshPulse)}
      >
        {fallback}
      </div>
    );
  }

  return (
    <div
      className="h-full min-h-0"
      data-right-pane-view="markdown"
      data-markdown-pane="true"
      data-right-pane-file-path={target.filePath}
      data-markdown-file-name={target.fileName}
      data-markdown-default-preview={String(getDefaultMarkdownPreview(target.fileName))}
      data-editor-refresh-pulse={String(refreshPulse)}
    >
      <Suspense fallback={fallback}>
        <CodeEditor
          draftPreviewOperations={draftPreviewOperations}
          {...createEditorPaneProps({
            target,
            projectPath,
            onClosePane,
            onTogglePaneExpand,
            onAppendToChatInput,
            onPopOut,
            isExpanded,
            isSidebar,
          })}
        />
      </Suspense>
    </div>
  );
}
