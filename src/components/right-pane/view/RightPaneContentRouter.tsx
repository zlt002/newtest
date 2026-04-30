import React, { Suspense, lazy } from 'react';
import type { BrowserDependencySnapshot, CodeFollowAlongState } from '../../code-editor/hooks/useEditorSidebar';
import type { FileDraftPreviewOperation } from '../../code-editor/types/types';
import type { RightPaneTarget } from '../types';
import MarkdownPane from './MarkdownPane';
import MarkdownDraftPane from './MarkdownDraftPane';
import BrowserPane from './BrowserPane';
import GitCommitPane from './GitCommitPane';
import { createEditorPaneProps } from './editorPaneProps';

const CodeEditor = lazy(() => import('../../code-editor/view/CodeEditor'));
const VisualHtmlEditor = lazy(() => import('./VisualHtmlEditor'));

type RightPaneContentRouterProps = {
  target: RightPaneTarget;
  projectPath?: string;
  browserRefreshVersion?: number;
  codeFollowAlongState?: CodeFollowAlongState | null;
  draftPreviewOperations?: FileDraftPreviewOperation[];
  onBrowserDependenciesChange?: ((snapshot: BrowserDependencySnapshot) => void) | null;
  onClosePane: () => void;
  onTogglePaneExpand?: (() => void) | null;
  onAppendToChatInput?: ((text: string) => void) | null;
  onPopOut?: (() => void) | null;
  isExpanded?: boolean;
  isSidebar?: boolean;
};

function renderCodeFallback(target: Extract<RightPaneTarget, { type: 'code' | 'visual-html' }>) {
  return (
    <div
      className="flex h-full flex-col bg-background"
      data-right-pane-view="code"
      data-right-pane-file-path={target.filePath}
    >
      <div className="border-b border-gray-200 px-4 py-3 text-sm font-medium dark:border-gray-700">
        {target.fileName}
      </div>
    </div>
  );
}

function renderVisualHtmlFallback() {
  return <div className="h-full min-h-0 bg-background" data-right-pane-view="visual-html" />;
}

export default function RightPaneContentRouter({
  target,
  projectPath,
  browserRefreshVersion = 0,
  codeFollowAlongState = null,
  draftPreviewOperations = [],
  onBrowserDependenciesChange = null,
  onClosePane,
  onTogglePaneExpand = null,
  onAppendToChatInput = null,
  onPopOut = null,
  isExpanded = false,
  isSidebar = true,
}: RightPaneContentRouterProps) {
  if (target.type === 'browser') {
    return (
      <div className="h-full min-h-0" data-right-pane-view="browser">
        <BrowserPane
          target={target}
          projectPath={projectPath}
          refreshVersion={browserRefreshVersion}
          onDependenciesChange={onBrowserDependenciesChange}
          onClosePane={onClosePane}
          onAppendToChatInput={onAppendToChatInput}
        />
      </div>
    );
  }

  if (target.type === 'markdown') {
    const markdownRefreshPulse = codeFollowAlongState?.filePath === target.filePath
      ? codeFollowAlongState.pulse
      : 0;

    return (
      <MarkdownPane
        key={`${target.filePath}:${markdownRefreshPulse}`}
        target={target}
        projectPath={projectPath}
        refreshPulse={markdownRefreshPulse}
        draftPreviewOperations={draftPreviewOperations}
        onClosePane={onClosePane}
        onTogglePaneExpand={onTogglePaneExpand}
        onAppendToChatInput={onAppendToChatInput}
        onPopOut={onPopOut}
        isExpanded={isExpanded}
        isSidebar={isSidebar}
      />
    );
  }

  if (target.type === 'markdown-draft') {
    return (
      <MarkdownDraftPane
        target={target}
        onClosePane={onClosePane}
      />
    );
  }

  if (target.type === 'git-commit') {
    return (
      <div className="h-full min-h-0" data-right-pane-view="git-commit">
        <GitCommitPane target={target} onClosePane={onClosePane} />
      </div>
    );
  }

  if (target.type === 'visual-html') {
    return (
      <div className="h-full min-h-0" data-right-pane-view="visual-html">
        <Suspense fallback={renderVisualHtmlFallback()}>
          <VisualHtmlEditor
            target={target}
            onClosePane={onClosePane}
            onAppendToChatInput={onAppendToChatInput}
          />
        </Suspense>
      </div>
    );
  }

  if (typeof window === 'undefined') {
    return renderCodeFallback(target);
  }

  const codeRefreshPulse =
    'filePath' in target && codeFollowAlongState?.filePath === target.filePath
      ? codeFollowAlongState.pulse
      : 0;

  return (
    <div className="h-full" data-right-pane-view="code" data-editor-refresh-pulse={String(codeRefreshPulse)}>
      <Suspense fallback={renderCodeFallback(target)}>
        <CodeEditor
          key={`${target.type}:${target.filePath}:${codeRefreshPulse}`}
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
          draftPreviewOperations={draftPreviewOperations}
        />
      </Suspense>
    </div>
  );
}
