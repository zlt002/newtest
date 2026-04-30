import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Sidebar from '../sidebar/view/Sidebar';
import MainContent from '../main-content/view/MainContent';
import { useWebSocket } from '../../contexts/WebSocketContext';
import { useDeviceSettings } from '../../hooks/shared/useDeviceSettings';
import { useSessionProtection } from '../../hooks/shared/useSessionProtection';
import { useProjectsState } from '../../hooks/api/useProjectsState';
import { useUiPreferences } from '../../hooks/shared/useUiPreferences';
import { useEditorSidebar } from '../code-editor/hooks/useEditorSidebar';
import type { FileChangeEvent } from '@hooks/chat/chatFileChangeEvents';
import type { DraftPreviewEvent } from '@hooks/chat/chatDraftPreviewEvents';
import { broadcastFileSyncEvent } from '../../utils/fileSyncEvents';
import { getFileChangeFollowAlongDecision } from './utils/fileChangeFollowAlong';
import { getDraftPreviewFollowAlongDecision } from './utils/draftPreviewFollowAlong';
import { getDesktopSidebarPresentation } from './utils/desktopSidebarLayout';
import MobileNav from './MobileNav';
import { CLIENT_EVENT_TYPES } from '@components/chat/types/transport';

const shouldLogPrdStreamingDebug = Boolean(import.meta.env?.DEV);

export default function AppContent() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId?: string }>();
  const { t } = useTranslation('common');
  const { isMobile } = useDeviceSettings({ trackPWA: false });
  const { preferences } = useUiPreferences();
  const { sidebarVisible } = preferences;
  const { ws, sendMessage, latestMessage, messageEvents, isConnected } = useWebSocket();
  const wasConnectedRef = useRef(false);
  const [appendToChatInput, setAppendToChatInput] = useState<((text: string) => void) | null>(null);

  const {
    activeSessions,
    processingSessions,
    markSessionAsActive,
    markSessionAsInactive,
    markSessionAsProcessing,
    markSessionAsNotProcessing,
    replaceTemporarySession,
  } = useSessionProtection();

  const {
    selectedProject,
    selectedSession,
    activeTab,
    sidebarOpen,
    isLoadingProjects,
    isInputFocused,
    externalMessageUpdate,
    setActiveTab,
    setSidebarOpen,
    setIsInputFocused,
    setShowSettings,
    openSettings,
    refreshProjectsSilently,
    sidebarSharedProps,
  } = useProjectsState({
    sessionId,
    navigate,
    latestMessage,
    messageEvents,
    isMobile,
    activeSessions,
  });

  const {
    tabs,
    activeTabId,
    rightPaneTarget,
    isRightPaneVisible,
    editorWidth,
    editorExpanded,
    hasManualWidth,
    isResizing,
    browserRefreshVersion,
    browserDependencySnapshot,
    codeFollowAlongState,
    draftPreviewState,
    resizeHandleRef,
    handleFileOpen,
    handleCommitPreviewOpen,
    handleUrlOpen,
    handleCloseEditor,
    handleOpenExistingTab,
    handleCloseTab,
    handleToggleRightPaneVisibility: toggleRightPaneVisibility,
    handleToggleEditorExpand,
    handleResizeStart,
    handleBrowserDependenciesChange,
    requestBrowserRefresh,
    focusCurrentCodeFile,
    applyDraftPreviewEvent,
    handleMarkdownDraftOpen,
    handleMarkdownDraftUpdate,
  } = useEditorSidebar({
    selectedProject,
    isMobile,
  });
  const [isDesktopSidebarPeekOpen, setIsDesktopSidebarPeekOpen] = useState(false);

  const desktopSidebarPresentation = useMemo(
    () => getDesktopSidebarPresentation({
      isMobile,
      isRightPaneVisible,
      isPeekOpen: isDesktopSidebarPeekOpen,
      isSidebarVisible: sidebarVisible,
    }),
    [isDesktopSidebarPeekOpen, isMobile, isRightPaneVisible, sidebarVisible],
  );

  useEffect(() => {
    if (!desktopSidebarPresentation.shouldAutoCollapse && isDesktopSidebarPeekOpen) {
      setIsDesktopSidebarPeekOpen(false);
    }
  }, [desktopSidebarPresentation.shouldAutoCollapse, isDesktopSidebarPeekOpen]);

  useEffect(() => {
    // Expose a non-blocking refresh for chat/session flows.
    // Full loading refreshes are still available through direct fetchProjects calls.
    window.refreshProjects = refreshProjectsSilently;

    return () => {
      if (window.refreshProjects === refreshProjectsSilently) {
        delete window.refreshProjects;
      }
    };
  }, [refreshProjectsSilently]);

  useEffect(() => {
    window.openSettings = openSettings;

    return () => {
      if (window.openSettings === openSettings) {
        delete window.openSettings;
      }
    };
  }, [openSettings]);

  // Decision recovery: query pending approvals/questions on WebSocket reconnect or session change
  useEffect(() => {
    const isReconnect = isConnected && !wasConnectedRef.current;

    if (isReconnect) {
      wasConnectedRef.current = true;
    } else if (!isConnected) {
      wasConnectedRef.current = false;
    }

    if (isConnected && selectedSession?.id) {
      sendMessage({
        type: CLIENT_EVENT_TYPES.GET_PENDING_DECISIONS,
        sessionId: selectedSession.id
      });
    }
  }, [isConnected, selectedSession?.id, sendMessage]);

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  const closeDesktopSidebarPeek = useCallback(() => {
    setIsDesktopSidebarPeekOpen(false);
  }, []);

  const openDesktopSidebarPeek = useCallback(() => {
    setIsDesktopSidebarPeekOpen(true);
  }, []);

  const handleToggleRightPaneVisibility = () => {
    if (toggleRightPaneVisibility()) {
      return;
    }

    const shouldOpenBrowser = window.confirm(
      '右侧暂无已打开内容。是否直接打开右侧浏览器？\n选择“取消”后，可从左侧资源点击文件或链接在右侧显示。',
    );

    if (shouldOpenBrowser) {
      handleUrlOpen(window.location.origin, 'address-bar');
    }
  };

  const handleFileChangeEvent = (event: FileChangeEvent) => {
    const followAlongDecision = getFileChangeFollowAlongDecision({
      event,
      rightPaneTarget,
      isRightPaneVisible,
      projectName: selectedProject?.name,
    });

    if (followAlongDecision.shouldOpenTarget) {
      handleFileOpen(event.filePath, undefined);
    }

    if (
      event.type === 'focus_file_changed' &&
      (rightPaneTarget?.type === 'code' || rightPaneTarget?.type === 'markdown') &&
      rightPaneTarget.filePath === event.filePath
    ) {
      focusCurrentCodeFile(event.filePath, event.lineRange ?? null);
    }
  };

  const handleDraftPreviewEvent = (event: DraftPreviewEvent) => {
    const followAlongDecision = getDraftPreviewFollowAlongDecision({
      event,
      rightPaneTarget,
      projectName: selectedProject?.name,
    });

    if (followAlongDecision.supportsDraftPreview) {
      applyDraftPreviewEvent(event);
    }

    if (
      followAlongDecision.supportsDraftPreview
      && (
        followAlongDecision.shouldOpenTarget
        || (
          (rightPaneTarget?.type === 'code' || rightPaneTarget?.type === 'markdown')
          && rightPaneTarget.filePath === event.filePath
        )
      )
    ) {
      focusCurrentCodeFile(
        event.filePath,
        event.type === 'file_change_preview_delta' ? event.operation.lineRange ?? null : null,
      );
    }

    if (event.type === 'file_change_preview_committed' && selectedProject?.name) {
      broadcastFileSyncEvent({
        projectName: selectedProject.name,
        filePath: event.filePath,
        sourceId: `draft-preview:${event.sessionId}:${event.toolId}`,
      });
    }

    if (followAlongDecision.shouldOpenTarget) {
      const isViewingDifferentTarget = (
        rightPaneTarget !== null
        && !(
          (rightPaneTarget.type === 'code' || rightPaneTarget.type === 'markdown')
          && rightPaneTarget.filePath === event.filePath
        )
      );

      handleFileOpen(event.filePath, undefined, {
        activate: !isViewingDifferentTarget,
        markAsFresh: isViewingDifferentTarget,
      });
    }
  };

  const handleComposerAppendReady = useCallback((append: ((text: string) => void) | null) => {
    setAppendToChatInput(() => append);
  }, []);

  const handleChatFileOpen = useCallback((filePath: string, diffInfo?: Parameters<NonNullable<typeof handleFileOpen>>[1]) => {
    if (shouldLogPrdStreamingDebug) {
      console.info('[PRD debug][AppContent] 收到 onFileOpen 请求', {
        filePath,
        diffInfo,
        currentRightPaneTarget: rightPaneTarget,
        isRightPaneVisible,
      });
    }

    handleFileOpen(filePath, diffInfo);
  }, [handleFileOpen, isRightPaneVisible, rightPaneTarget]);

  const handleChatMarkdownDraftOpen = useCallback((payload: {
    filePath: string;
    fileName?: string;
    content?: string;
    statusText?: string;
    sourceSessionId?: string | null;
  }) => {
    handleMarkdownDraftOpen({
      ...payload,
      projectName: selectedProject?.name,
    });
  }, [handleMarkdownDraftOpen, selectedProject?.name]);

  const handleChatMarkdownDraftUpdate = useCallback((payload: {
    filePath: string;
    content?: string;
    statusText?: string;
    sourceSessionId?: string | null;
  }) => {
    handleMarkdownDraftUpdate({
      ...payload,
      projectName: selectedProject?.name,
    });
  }, [handleMarkdownDraftUpdate, selectedProject?.name]);

  useEffect(() => {
    if (!shouldLogPrdStreamingDebug) {
      return;
    }

    console.info('[PRD debug][AppContent] 右侧状态更新', {
      isRightPaneVisible,
      activeTabId,
      rightPaneTarget,
      tabCount: tabs.length,
    });
  }, [activeTabId, isRightPaneVisible, rightPaneTarget, tabs.length]);

  const sidebarProps = useMemo(() => ({
    ...sidebarSharedProps,
    onProjectSelect: (project: Parameters<typeof sidebarSharedProps.onProjectSelect>[0]) => {
      closeDesktopSidebarPeek();
      sidebarSharedProps.onProjectSelect(project);
    },
    onSessionSelect: (session: Parameters<typeof sidebarSharedProps.onSessionSelect>[0]) => {
      closeDesktopSidebarPeek();
      sidebarSharedProps.onSessionSelect(session);
    },
    onNewSession: (project: Parameters<typeof sidebarSharedProps.onNewSession>[0]) => {
      closeDesktopSidebarPeek();
      sidebarSharedProps.onNewSession(project);
    },
    onShowSettings: () => {
      closeDesktopSidebarPeek();
      sidebarSharedProps.onShowSettings();
    },
  }), [closeDesktopSidebarPeek, sidebarSharedProps]);

  const sidebarAuxiliaryProps = useMemo(() => ({
    onFileOpen: (filePath: string, diffInfo?: Parameters<NonNullable<typeof handleFileOpen>>[1]) => {
      handleChatFileOpen(filePath, diffInfo);
    },
    onCommitPreviewOpen: (commit: Parameters<typeof handleCommitPreviewOpen>[0], diff: Parameters<typeof handleCommitPreviewOpen>[1]) => {
      closeDesktopSidebarPeek();
      handleCommitPreviewOpen(commit, diff);
    },
  }), [closeDesktopSidebarPeek, handleChatFileOpen, handleCommitPreviewOpen]);

  return (
    <div className="fixed inset-0 flex bg-background">
      {!isMobile ? (
        <div className={`relative hidden h-full flex-shrink-0 border-r border-border/50 md:block ${desktopSidebarPresentation.dockWidthClassName}`}>
          {desktopSidebarPresentation.shouldRenderOverlay && (
            <button
              className="fixed inset-0 z-20 bg-background/40"
              onClick={closeDesktopSidebarPeek}
              onPointerDown={closeDesktopSidebarPeek}
              aria-label="关闭临时文件侧栏"
            />
          )}
          <div
            className={`h-full ${
              desktopSidebarPresentation.shouldRenderOverlay
                ? 'absolute inset-y-0 left-0 z-30 w-72 overflow-hidden rounded-r-2xl border-r border-border/60 bg-background shadow-2xl'
                : 'w-full'
            }`}
          >
            <Sidebar
              {...sidebarProps}
              {...sidebarAuxiliaryProps}
              onAppendToChatInput={appendToChatInput}
              presentation={
                desktopSidebarPresentation.shouldAutoCollapse
                  ? (desktopSidebarPresentation.shouldRenderOverlay ? 'peek-expanded' : 'peek-collapsed')
                  : 'default'
              }
              onRequestPeekOpen={openDesktopSidebarPeek}
              onRequestPeekClose={closeDesktopSidebarPeek}
            />
          </div>
        </div>
      ) : (
        <div
          className={`fixed inset-0 z-50 flex transition-all duration-150 ease-out ${sidebarOpen ? 'visible opacity-100' : 'invisible opacity-0'
            }`}
        >
          <button
            className="fixed inset-0 bg-background/60 backdrop-blur-sm transition-opacity duration-150 ease-out"
            onClick={(event) => {
              event.stopPropagation();
              closeSidebar();
            }}
            onPointerDown={(event) => {
              event.stopPropagation();
              closeSidebar();
            }}
            aria-label={t('versionUpdate.ariaLabels.closeSidebar')}
          />
          <div
            className={`relative h-full w-[85vw] max-w-sm transform border-r border-border/40 bg-card transition-transform duration-150 ease-out sm:w-80 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
              }`}
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Sidebar
              {...sidebarSharedProps}
              onFileOpen={handleChatFileOpen}
              onAppendToChatInput={appendToChatInput}
              onCommitPreviewOpen={handleCommitPreviewOpen}
            />
          </div>
        </div>
      )}

      <div className={`flex min-w-0 flex-1 flex-col ${isMobile ? 'pb-mobile-nav' : ''}`}>
        <MainContent
          selectedProject={selectedProject}
          selectedSession={selectedSession}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          ws={ws}
          sendMessage={sendMessage}
          latestMessage={latestMessage}
          isMobile={isMobile}
          onMenuClick={() => setSidebarOpen(true)}
          isLoading={isLoadingProjects}
          onInputFocusChange={setIsInputFocused}
          onSessionActive={markSessionAsActive}
          onSessionInactive={markSessionAsInactive}
          onSessionProcessing={markSessionAsProcessing}
          onSessionNotProcessing={markSessionAsNotProcessing}
          processingSessions={processingSessions}
          onReplaceTemporarySession={replaceTemporarySession}
          onNavigateToSession={(targetSessionId: string) => navigate(`/session/${targetSessionId}`)}
          onStartNewSession={(project) => sidebarSharedProps.onNewSession(project)}
          hasRightPaneContent={tabs.length > 0}
          isRightPaneVisible={isRightPaneVisible}
          onToggleRightPaneVisibility={handleToggleRightPaneVisibility}
          onShowSettings={() => setShowSettings(true)}
          onComposerAppendReady={handleComposerAppendReady}
          externalMessageUpdate={externalMessageUpdate}
          onFileChangeEvent={handleFileChangeEvent}
          onDraftPreviewEvent={handleDraftPreviewEvent}
          rightPaneTabs={tabs}
          activeRightPaneTabId={activeTabId}
          rightPaneTarget={rightPaneTarget}
          activeContextTarget={rightPaneTarget}
          editorWidth={editorWidth}
          editorExpanded={editorExpanded}
          hasManualWidth={hasManualWidth}
          isResizing={isResizing}
          resizeHandleRef={resizeHandleRef}
          browserRefreshVersion={browserRefreshVersion}
          codeFollowAlongState={codeFollowAlongState}
          draftPreviewState={draftPreviewState}
          onFileOpen={handleChatFileOpen}
          onMarkdownDraftOpen={handleChatMarkdownDraftOpen}
          onMarkdownDraftUpdate={handleChatMarkdownDraftUpdate}
          onOpenUrl={handleUrlOpen}
          onClosePane={handleCloseEditor}
          onSelectRightPaneTab={handleOpenExistingTab}
          onCloseRightPaneTab={handleCloseTab}
          onTogglePaneExpand={handleToggleEditorExpand}
          onResizeStart={handleResizeStart}
          onBrowserDependenciesChange={handleBrowserDependenciesChange}
        />
      </div>

      {isMobile && (
        <MobileNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isInputFocused={isInputFocused}
        />
      )}

    </div>
  );
}
