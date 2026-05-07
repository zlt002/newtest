import React, { Suspense, lazy, useMemo } from 'react';
import type { BrowserDependencySnapshot, CodeFollowAlongState } from '../../code-editor/hooks/useEditorSidebar';
import type { FileDraftPreviewOperation } from '../../code-editor/types/types';
import type { RightPaneTab, RightPaneTarget, RightPaneVisualHtmlTarget } from '../types';
import MarkdownPane from './MarkdownPane';
import MarkdownDraftPane from './MarkdownDraftPane';
import BrowserPane from './BrowserPane';
import GitCommitPane from './GitCommitPane';
import { createEditorPaneProps } from './editorPaneProps';
import { getRightPaneTargetIdentity } from '../utils/rightPaneTargetIdentity';

const CodeEditor = lazy(() => import('../../code-editor/view/CodeEditor'));
const VisualHtmlEditor = lazy(() => import('./VisualHtmlEditor'));

const MemoizedVisualHtmlEditor = React.memo(function MemoizedVisualHtmlEditor({
  target,
  isActive,
  onAppendToChatInput,
  onOpenSourceTab,
}: {
  target: RightPaneVisualHtmlTarget;
  isActive: boolean;
  onAppendToChatInput?: ((text: string) => void) | null;
  onOpenSourceTab?: ((filePath: string) => void) | null;
}) {
  return (
    <VisualHtmlEditor
      target={target}
      isActive={isActive}
      onAppendToChatInput={onAppendToChatInput}
      onOpenSourceTab={onOpenSourceTab}
    />
  );
}, (previous, next) => (
  previous.isActive === next.isActive
  && previous.target.filePath === next.target.filePath
  && previous.target.fileName === next.target.fileName
  && previous.target.projectName === next.target.projectName
  && previous.onAppendToChatInput === next.onAppendToChatInput
  && previous.onOpenSourceTab === next.onOpenSourceTab
));

type RightPaneContentRouterProps = {
  target: RightPaneTarget;
  tabs: RightPaneTab[];
  activeTabId: string | null;
  projectPath?: string;
  browserRefreshVersion?: number;
  codeFollowAlongState?: CodeFollowAlongState | null;
  draftPreviewOperations?: FileDraftPreviewOperation[];
  onBrowserDependenciesChange?: ((snapshot: BrowserDependencySnapshot) => void) | null;
  onClosePane: () => void;
  onTogglePaneExpand?: (() => void) | null;
  onAppendToChatInput?: ((text: string) => void) | null;
  onFileOpen?: ((filePath: string) => void) | null;
  onCodeFileOpen?: ((filePath: string) => void) | null;
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
  tabs,
  activeTabId,
  projectPath,
  browserRefreshVersion = 0,
  codeFollowAlongState = null,
  draftPreviewOperations = [],
  onBrowserDependenciesChange = null,
  onClosePane,
  onTogglePaneExpand = null,
  onAppendToChatInput = null,
  onFileOpen = null,
  onCodeFileOpen = null,
  onPopOut = null,
  isExpanded = false,
  isSidebar = true,
}: RightPaneContentRouterProps) {
  const activeTargetIdentity = useMemo(() => getRightPaneTargetIdentity(target), [target]);
  const renderedVisualHtmlTargets = useMemo(() => {
    const openVisualHtmlTargets = tabs
      .filter((tab): tab is RightPaneTab & { target: RightPaneVisualHtmlTarget } => tab.target.type === 'visual-html')
      .map((tab) => tab.target);

    if (target.type !== 'visual-html') {
      return openVisualHtmlTargets;
    }

    const activeIdentity = getRightPaneTargetIdentity(target);
    if (openVisualHtmlTargets.some((entry) => getRightPaneTargetIdentity(entry) === activeIdentity)) {
      return openVisualHtmlTargets;
    }

    return [...openVisualHtmlTargets, target];
  }, [tabs, target]);

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
        onFileOpen={onFileOpen}
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
          <div className="relative h-full min-h-0">
            {renderedVisualHtmlTargets.map((visualTarget) => {
              const visualTargetIdentity = getRightPaneTargetIdentity(visualTarget);
              const isActive = visualTargetIdentity === activeTargetIdentity && activeTabId === visualTargetIdentity;
              return (
                <div
                  key={visualTargetIdentity}
                  className={`absolute inset-0 min-h-0 ${isActive ? '' : 'invisible pointer-events-none'}`}
                  data-right-pane-visual-html-tab={visualTargetIdentity}
                  aria-hidden={!isActive}
                >
                  <MemoizedVisualHtmlEditor
                    target={visualTarget}
                    isActive={isActive}
                    onAppendToChatInput={onAppendToChatInput}
                    onOpenSourceTab={onCodeFileOpen}
                  />
                </div>
              );
            })}
          </div>
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
            onFileOpen,
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
