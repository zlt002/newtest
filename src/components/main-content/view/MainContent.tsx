import React, { useCallback, useState } from 'react';
import ChatInterface from '../../chat/view/ChatInterface';
import RightPane from '../../right-pane/view/RightPane';
import type { MainContentProps } from '../types/types';
import { useUiPreferences } from '../../../hooks/shared/useUiPreferences';
import { getMainContentPaneClassName, shouldUseBalancedEditorLayout } from '../../code-editor/utils/editorSidebarLayout';
import MainContentHeader from './subcomponents/MainContentHeader';
import MainContentStateView from './subcomponents/MainContentStateView';
import ErrorBoundary from './ErrorBoundary';

const shouldLogPrdStreamingDebug = Boolean(import.meta.env?.DEV);

function MainContent({
  selectedProject,
  selectedSession,
  activeTab,
  setActiveTab: _setActiveTab,
  ws,
  sendMessage,
  latestMessage,
  isMobile,
  onMenuClick,
  isLoading,
  onInputFocusChange,
  onSessionActive,
  onSessionInactive,
  onSessionProcessing,
  onSessionNotProcessing,
  processingSessions,
  onReplaceTemporarySession,
  onNavigateToSession,
  onStartNewSession,
  hasRightPaneContent,
  isRightPaneVisible,
  onToggleRightPaneVisibility,
  onShowSettings,
  onComposerAppendReady,
  externalMessageUpdate,
  onFileChangeEvent,
  onDraftPreviewEvent,
  rightPaneTabs,
  activeRightPaneTabId,
  rightPaneTarget,
  activeContextTarget,
  editorWidth,
  editorExpanded,
  hasManualWidth,
  isResizing,
  resizeHandleRef,
  browserRefreshVersion,
  codeFollowAlongState,
  draftPreviewState,
  onFileOpen,
  onOpenUrl,
  onClosePane,
  onSelectRightPaneTab,
  onCloseRightPaneTab,
  onTogglePaneExpand,
  onResizeStart,
  onBrowserDependenciesChange,
}: MainContentProps) {
  const { preferences } = useUiPreferences();
  const { autoExpandTools, showRawParameters, showThinking, autoScrollToBottom, sendByCtrlEnter } = preferences;
  const [appendToChatInput, setAppendToChatInput] = useState<((text: string) => void) | null>(null);
  const handleComposerAppendReady = useCallback((append: ((text: string) => void) | null) => {
    setAppendToChatInput(() => append);
    onComposerAppendReady?.(append);
  }, [onComposerAppendReady]);

  const useBalancedEditorLayout = shouldUseBalancedEditorLayout({
    activeTab,
    editorExpanded,
    hasManualWidth,
  });

  if (shouldLogPrdStreamingDebug) {
    console.info('[PRD debug][MainContent] render', {
      activeTab,
      hasRightPaneContent,
      isRightPaneVisible,
      activeRightPaneTabId,
      rightPaneTarget,
      useBalancedEditorLayout,
      editorExpanded,
      hasManualWidth,
    });
  }

  if (isLoading) {
    return <MainContentStateView mode="loading" isMobile={isMobile} onMenuClick={onMenuClick} />;
  }

  if (!selectedProject) {
    return <MainContentStateView mode="empty" isMobile={isMobile} onMenuClick={onMenuClick} />;
  }

  return (
    <div className="flex h-full min-w-0 overflow-hidden">
      <div className={getMainContentPaneClassName({ editorExpanded, useBalancedLayout: useBalancedEditorLayout })}>
        <MainContentHeader
          activeTab={activeTab}
          selectedProject={selectedProject}
          selectedSession={selectedSession}
          isMobile={isMobile}
          onMenuClick={onMenuClick}
          onNavigateToSession={onNavigateToSession}
          onStartNewSession={onStartNewSession}
          hasRightPaneContent={hasRightPaneContent}
          isRightPaneVisible={isRightPaneVisible}
          onToggleRightPaneVisibility={onToggleRightPaneVisibility}
        />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className={`min-h-0 flex-1 ${activeTab === 'chat' ? 'block' : 'hidden'}`}>
            <ErrorBoundary showDetails>
              <ChatInterface
                selectedProject={selectedProject}
                selectedSession={selectedSession}
                ws={ws}
                sendMessage={sendMessage}
                latestMessage={latestMessage}
                onFileOpen={onFileOpen}
                onOpenUrl={(url) => onOpenUrl(url, 'chat-link')}
                onInputFocusChange={onInputFocusChange}
                onSessionActive={onSessionActive}
                onSessionInactive={onSessionInactive}
                onSessionProcessing={onSessionProcessing}
                onSessionNotProcessing={onSessionNotProcessing}
                processingSessions={processingSessions}
                onReplaceTemporarySession={onReplaceTemporarySession}
                onNavigateToSession={onNavigateToSession}
                onStartNewSession={onStartNewSession}
                onShowSettings={onShowSettings}
                autoExpandTools={autoExpandTools}
                showRawParameters={showRawParameters}
                showThinking={showThinking}
                autoScrollToBottom={autoScrollToBottom}
                sendByCtrlEnter={sendByCtrlEnter}
                externalMessageUpdate={externalMessageUpdate}
                onComposerAppendReady={handleComposerAppendReady}
                onFileChangeEvent={onFileChangeEvent}
                onDraftPreviewEvent={onDraftPreviewEvent}
                activeContextTarget={activeContextTarget}
              />
            </ErrorBoundary>
          </div>

          <div className={`min-h-0 flex-1 overflow-hidden ${activeTab === 'preview' ? 'block' : 'hidden'}`} />
        </div>
      </div>

      <RightPane
        tabs={rightPaneTabs}
        activeTabId={activeRightPaneTabId}
        target={isRightPaneVisible ? rightPaneTarget : null}
        isMobile={isMobile}
        editorExpanded={editorExpanded}
        editorWidth={editorWidth}
        hasManualWidth={hasManualWidth}
        isResizing={isResizing}
        resizeHandleRef={resizeHandleRef}
        onResizeStart={onResizeStart}
        browserRefreshVersion={browserRefreshVersion}
        codeFollowAlongState={codeFollowAlongState ?? null}
        draftPreviewState={draftPreviewState}
        onClosePane={onClosePane}
        onSelectTab={onSelectRightPaneTab}
        onCloseTab={onCloseRightPaneTab}
        onTogglePaneExpand={onTogglePaneExpand}
        projectPath={selectedProject.fullPath || selectedProject.path}
        fillSpace={useBalancedEditorLayout}
        onAppendToChatInput={appendToChatInput}
        onBrowserDependenciesChange={onBrowserDependenciesChange}
      />
    </div>
  );
}

export default React.memo(MainContent);
