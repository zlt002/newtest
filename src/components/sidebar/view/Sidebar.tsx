import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDeviceSettings } from '../../../hooks/shared/useDeviceSettings';
import { useVersionCheck } from '../../../hooks/shared/useVersionCheck';
import { useUiPreferences } from '../../../hooks/shared/useUiPreferences';
import { useSidebarController } from '../hooks/useSidebarController';
import type { SessionProvider } from '../../../types/app';
import type { SidebarProps } from '../types/types';
import type { ProjectWizardLaunchContext } from '../../project-creation-wizard/types';
import type { DroppedFolder } from '../utils/sidebarFolderDrop';
import SidebarCollapsed from './subcomponents/SidebarCollapsed';
import SidebarContent from './subcomponents/SidebarContent';
import SidebarModals from './subcomponents/SidebarModals';
import { DEFAULT_WORKSPACE_VIEW, type WorkspaceView } from './subcomponents/sidebarWorkspace.shared';
import type { SidebarProjectListProps } from './subcomponents/SidebarProjectList';

function Sidebar({
  projects,
  selectedProject,
  selectedSession,
  onProjectSelect,
  onSessionSelect,
  onNewSession,
  onSessionDelete,
  onProjectDelete,
  isLoading,
  loadingProgress,
  onRefresh,
  onShowSettings,
  showSettings,
  settingsInitialTab,
  onCloseSettings,
  isMobile,
  initialWorkspaceView,
  onFileOpen,
  onAppendToChatInput,
  onCommitPreviewOpen,
  presentation = 'default',
  onRequestPeekOpen,
  onRequestPeekClose,
}: SidebarProps) {
  const { t } = useTranslation(['sidebar', 'common']);
  const { isPWA } = useDeviceSettings({ trackMobile: false });
  const { latestVersion, currentVersion, releaseInfo, installMode } = useVersionCheck(
    'siteboon',
    'claudecodeui',
  );
  const { preferences, setPreference } = useUiPreferences();
  const { sidebarVisible } = preferences;
  const [newProjectLaunchContext, setNewProjectLaunchContext] = useState<ProjectWizardLaunchContext | null>(null);
  const [showHooksOverview, setShowHooksOverview] = useState(false);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>(
    initialWorkspaceView ?? DEFAULT_WORKSPACE_VIEW,
  );

  const {
    isSidebarCollapsed: isPersistedSidebarCollapsed,
    expandedProjects,
    editingProject,
    showNewProject,
    editingName,
    loadingSessions,
    initialSessionsLoaded,
    currentTime,
    isRefreshing,
    editingSession,
    editingSessionName,
    searchFilter,
    searchMode,
    setSearchMode,
    conversationResults,
    isSearching,
    searchProgress,
    clearConversationResults,
    deletingProjects,
    deleteConfirmation,
    sessionDeleteConfirmation,
    showVersionModal,
    filteredProjects,
    toggleProject,
    handleSessionClick,
    toggleStarProject,
    isProjectStarred,
    getProjectSessions,
    startEditing,
    cancelEditing,
    saveProjectName,
    showDeleteSessionConfirmation,
    confirmDeleteSession,
    requestProjectDelete,
    confirmDeleteProject,
    loadMoreSessions,
    resetVisibleSessions,
    handleProjectSelect,
    refreshProjects,
    updateSessionSummary,
    collapseSidebar: handleCollapseSidebar,
    expandSidebar: handleExpandSidebar,
    setShowNewProject,
    setEditingName,
    setEditingSession,
    setEditingSessionName,
    setSearchFilter,
    setDeleteConfirmation,
    setSessionDeleteConfirmation,
    setShowVersionModal,
  } = useSidebarController({
    projects,
    selectedProject,
    selectedSession,
    isLoading,
    isMobile,
    t,
    onRefresh,
    onProjectSelect,
    onSessionSelect,
    onSessionDelete,
    onProjectDelete,
    setCurrentProject: () => {},
    setSidebarVisible: (visible) => setPreference('sidebarVisible', visible),
    sidebarVisible,
  });

  const isForcedCollapsed = presentation === 'peek-collapsed';
  const isPeekExpanded = presentation === 'peek-expanded';
  const collapsedSurfaceMode = isForcedCollapsed ? 'solid' : 'default';
  const contentSurfaceMode = isPeekExpanded ? 'overlay' : 'default';
  const isSidebarCollapsed = isForcedCollapsed || (!isPeekExpanded && isPersistedSidebarCollapsed);
  const handleExpand = isForcedCollapsed ? (onRequestPeekOpen ?? handleExpandSidebar) : handleExpandSidebar;
  const handleCollapse = isPeekExpanded ? (onRequestPeekClose ?? handleCollapseSidebar) : handleCollapseSidebar;

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.documentElement.classList.toggle('pwa-mode', isPWA);
    document.body.classList.toggle('pwa-mode', isPWA);
  }, [isPWA]);

  const handleProjectCreated = () => {
    if (window.refreshProjects) {
      void window.refreshProjects();
      return;
    }

    window.location.reload();
  };

  const handleOpenSelectedProjectFiles = () => {
    setWorkspaceView('files');
  };

  const projectListProps: SidebarProjectListProps = {
    projects,
    filteredProjects,
    selectedProject,
    selectedSession,
    isLoading,
    loadingProgress,
    expandedProjects,
    editingProject,
    editingName,
    loadingSessions,
    initialSessionsLoaded,
    currentTime,
    editingSession,
    editingSessionName,
    deletingProjects,
    getProjectSessions,
    isProjectStarred,
    onEditingNameChange: setEditingName,
    onToggleProject: toggleProject,
    onProjectSelect: handleProjectSelect,
    onOpenSelectedProjectFiles: handleOpenSelectedProjectFiles,
    onToggleStarProject: toggleStarProject,
    onStartEditingProject: startEditing,
    onCancelEditingProject: cancelEditing,
    onSaveProjectName: (projectName) => {
      void saveProjectName(projectName);
    },
    onDeleteProject: requestProjectDelete,
    onSessionSelect: handleSessionClick,
    onDeleteSession: showDeleteSessionConfirmation,
    onLoadMoreSessions: (project) => {
      void loadMoreSessions(project);
    },
    onResetVisibleSessions: resetVisibleSessions,
    onNewSession,
    onEditingSessionNameChange: setEditingSessionName,
    onStartEditingSession: (sessionId, initialName) => {
      setEditingSession(sessionId);
      setEditingSessionName(initialName);
    },
    onCancelEditingSession: () => {
      setEditingSession(null);
      setEditingSessionName('');
    },
    onSaveEditingSession: (projectName: string, sessionId: string, summary: string, provider: SessionProvider) => {
      void updateSessionSummary(projectName, sessionId, summary, provider);
    },
    t,
  };

  return (
    <>
      <SidebarModals
        projects={projects}
        selectedProject={selectedProject}
        showSettings={showSettings}
        settingsInitialTab={settingsInitialTab}
        onCloseSettings={onCloseSettings}
        showNewProject={showNewProject}
        newProjectLaunchContext={newProjectLaunchContext}
        onCloseNewProject={() => {
          setShowNewProject(false);
          setNewProjectLaunchContext(null);
        }}
        onProjectCreated={handleProjectCreated}
        deleteConfirmation={deleteConfirmation}
        onCancelDeleteProject={() => setDeleteConfirmation(null)}
        onConfirmDeleteProject={confirmDeleteProject}
        sessionDeleteConfirmation={sessionDeleteConfirmation}
        onCancelDeleteSession={() => setSessionDeleteConfirmation(null)}
        onConfirmDeleteSession={confirmDeleteSession}
        showVersionModal={showVersionModal}
        onCloseVersionModal={() => setShowVersionModal(false)}
        showHooksOverview={showHooksOverview}
        onCloseHooksOverview={() => setShowHooksOverview(false)}
        releaseInfo={releaseInfo}
        currentVersion={currentVersion}
        latestVersion={latestVersion}
        installMode={installMode}
        t={t}
      />

      {isSidebarCollapsed ? (
        <>
          <SidebarCollapsed
            onExpand={handleExpand}
            onShowSettings={onShowSettings}
            surfaceMode={collapsedSurfaceMode}
            t={t}
          />
          <div className="px-1 pt-2">
            <button
              className="flex w-full items-center justify-center rounded-md border border-slate-700/70 px-2 py-2 text-[11px] font-medium text-slate-300 transition hover:border-slate-500 hover:text-white"
              onClick={() => setShowHooksOverview(true)}
              type="button"
            >
              Hooks
            </button>
          </div>
        </>
      ) : (
        <>
        <SidebarContent
          isPWA={isPWA}
          isMobile={isMobile}
          isLoading={isLoading}
          workspaceView={workspaceView}
          projects={projects}
          searchFilter={searchFilter}
          onSearchFilterChange={setSearchFilter}
          onClearSearchFilter={() => setSearchFilter('')}
          searchMode={searchMode}
          onSearchModeChange={(mode: 'projects' | 'conversations') => {
            setSearchMode(mode);
            if (mode === 'projects') clearConversationResults();
          }}
          onWorkspaceViewChange={setWorkspaceView}
          conversationResults={conversationResults}
          isSearching={isSearching}
          searchProgress={searchProgress}
            onConversationResultClick={(projectName: string, sessionId: string, messageTimestamp?: string | null, messageSnippet?: string | null) => {
              const project = projects.find(p => p.name === projectName);
              const searchTarget = { __searchTargetTimestamp: messageTimestamp || null, __searchTargetSnippet: messageSnippet || null };
              const sessionObj = {
                id: sessionId,
                __projectName: projectName,
                ...searchTarget,
              };
              if (project) {
                handleProjectSelect(project);
                const sessions = getProjectSessions(project);
                const existing = sessions.find(s => s.id === sessionId);
                if (existing) {
                  handleSessionClick({ ...existing, ...searchTarget }, projectName);
                } else {
                  handleSessionClick(sessionObj, projectName);
                }
              } else {
                handleSessionClick(sessionObj, projectName);
              }
          }}
          onRefresh={() => {
              void refreshProjects();
            }}
            isRefreshing={isRefreshing}
            onCreateProject={() => {
              setNewProjectLaunchContext(null);
              setShowNewProject(true);
            }}
            onOpenHooksOverview={() => setShowHooksOverview(true)}
            onCreateProjectFromDroppedFolder={(folder: DroppedFolder) => {
              setNewProjectLaunchContext({
                initialStep: 1,
                droppedFolderName: folder.name,
              });
              setShowNewProject(true);
            }}
          onCollapseSidebar={handleCollapse}
          onShowSettings={onShowSettings}
          onFileOpen={onFileOpen}
          onAppendToChatInput={onAppendToChatInput}
          onCommitPreviewOpen={onCommitPreviewOpen}
          surfaceMode={contentSurfaceMode}
          projectListProps={projectListProps}
          t={t}
        />
        </>
      )}

    </>
  );
}

export default Sidebar;
