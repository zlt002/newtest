import { type DragEvent, type ReactNode, useCallback, useRef, useState } from 'react';
import { Folder, MessageSquare, Search, Upload } from 'lucide-react';
import type { TFunction } from 'i18next';
import { Button, ScrollArea } from '../../../../shared/view/ui';
import type { Project } from '../../../../types/app';
import type { CodeEditorDiffInfo } from '../../../code-editor/types/types';
import type { GitCommitSummary } from '../../../git-panel/types/types';
import type { ConversationSearchResults, SearchProgress } from '../../hooks/useSidebarController';
import GitPanel from '../../../git-panel/view/GitPanel';
import FileTree from '../../../file-tree/view/FileTree';
import { extractDroppedFolder, type DroppedFolder } from '../../utils/sidebarFolderDrop';
import SidebarFooter from './SidebarFooter';
import SidebarHeader from './SidebarHeader';
import SidebarProjectList, { type SidebarProjectListProps } from './SidebarProjectList';
import type { WorkspaceView } from './sidebarWorkspace.shared';

type SearchMode = 'projects' | 'conversations';

function HighlightedSnippet({ snippet, highlights }: { snippet: string; highlights: { start: number; end: number }[] }) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const h of highlights) {
    if (h.start > cursor) {
      parts.push(snippet.slice(cursor, h.start));
    }
    parts.push(
      <mark key={h.start} className="rounded-sm bg-yellow-200 px-0.5 text-foreground dark:bg-yellow-800">
        {snippet.slice(h.start, h.end)}
      </mark>
    );
    cursor = h.end;
  }
  if (cursor < snippet.length) {
    parts.push(snippet.slice(cursor));
  }
  return (
    <span className="text-xs leading-relaxed text-muted-foreground">
      {parts}
    </span>
  );
}

type SidebarContentProps = {
  isPWA: boolean;
  isMobile: boolean;
  isLoading: boolean;
  workspaceView: WorkspaceView;
  projects: Project[];
  searchFilter: string;
  onSearchFilterChange: (value: string) => void;
  onClearSearchFilter: () => void;
  searchMode: SearchMode;
  onSearchModeChange: (mode: SearchMode) => void;
  onWorkspaceViewChange: (view: WorkspaceView) => void;
  conversationResults: ConversationSearchResults | null;
  isSearching: boolean;
  searchProgress: SearchProgress | null;
  onConversationResultClick: (projectName: string, sessionId: string, messageTimestamp?: string | null, messageSnippet?: string | null) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  onCreateProject: () => void;
  onOpenHooksOverview: () => void;
  onCreateProjectFromDroppedFolder: (folder: DroppedFolder) => void;
  onCollapseSidebar: () => void;
  onShowSettings: () => void;
  onFileOpen?: (filePath: string, diffInfo?: CodeEditorDiffInfo | null) => void;
  onAppendToChatInput?: ((text: string) => void) | null;
  onCommitPreviewOpen?: (commit: GitCommitSummary, diff: string) => void;
  surfaceMode?: 'default' | 'overlay';
  projectListProps: SidebarProjectListProps;
  t: TFunction;
};

export default function SidebarContent({
  isPWA,
  isMobile,
  isLoading,
  workspaceView,
  projects,
  searchFilter,
  onSearchFilterChange,
  onClearSearchFilter,
  searchMode,
  onSearchModeChange,
  onWorkspaceViewChange,
  conversationResults,
  isSearching,
  searchProgress,
  onConversationResultClick,
  onRefresh,
  isRefreshing,
  onCreateProject,
  onOpenHooksOverview,
  onCreateProjectFromDroppedFolder,
  onCollapseSidebar,
  onShowSettings,
  onFileOpen,
  onAppendToChatInput,
  onCommitPreviewOpen,
  surfaceMode = 'default',
  projectListProps,
  t,
}: SidebarContentProps) {
  const isProjectsWorkspace = workspaceView === 'projects';
  const isFilesWorkspace = workspaceView === 'files';
  const isGitWorkspace = workspaceView === 'git';
  const selectedProject = projectListProps.selectedProject;
  const showConversationSearch = searchMode === 'conversations' && searchFilter.trim().length >= 2;
  const hasPartialResults = conversationResults && conversationResults.results.length > 0;
  const isOverlaySurface = surfaceMode === 'overlay';
  const [isDragOverProjectDropzone, setIsDragOverProjectDropzone] = useState(false);
  const [dropMessage, setDropMessage] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const handleDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) {
      return;
    }

    event.preventDefault();
    setDropMessage(null);
    setIsDragOverProjectDropzone(true);
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragOverProjectDropzone(true);
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (rootRef.current && rootRef.current.contains(event.relatedTarget as Node)) {
      return;
    }

    setIsDragOverProjectDropzone(false);
  }, []);

  const handleDrop = useCallback(async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOverProjectDropzone(false);
    setDropMessage(null);

    const folder = await extractDroppedFolder(event.dataTransfer);
    if (!folder) {
      setDropMessage(t('projects.dropFolderUnsupported', '请拖入一个文件夹以创建项目'));
      return;
    }

    onCreateProjectFromDroppedFolder(folder);
  }, [onCreateProjectFromDroppedFolder, t]);

  return (
    <div
      ref={rootRef}
      onDragEnter={isProjectsWorkspace ? handleDragEnter : undefined}
      onDragOver={isProjectsWorkspace ? handleDragOver : undefined}
      onDragLeave={isProjectsWorkspace ? handleDragLeave : undefined}
      onDrop={isProjectsWorkspace ? handleDrop : undefined}
      className={`flex h-full flex-col border-r border-border/70 md:w-72 md:select-none ${
        isOverlaySurface ? 'bg-background shadow-none' : 'bg-background/80 backdrop-blur-sm'
      } ${
        isProjectsWorkspace && isDragOverProjectDropzone ? 'bg-blue-50/70 ring-2 ring-inset ring-blue-400 dark:bg-blue-950/20' : ''
      }`}
      style={{}}
    >
      <SidebarHeader
        isPWA={isPWA}
        isMobile={isMobile}
        isLoading={isLoading}
        workspaceView={workspaceView}
        projectsCount={projects.length}
        searchFilter={searchFilter}
        onSearchFilterChange={onSearchFilterChange}
        onClearSearchFilter={onClearSearchFilter}
        searchMode={searchMode}
        onSearchModeChange={onSearchModeChange}
        onWorkspaceViewChange={onWorkspaceViewChange}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
        onCreateProject={onCreateProject}
        onOpenHooksOverview={onOpenHooksOverview}
        onCollapseSidebar={onCollapseSidebar}
        onShowSettings={onShowSettings}
        t={t}
      />

      <ScrollArea className="flex-1 overflow-y-auto overscroll-contain">
        {isProjectsWorkspace ? (
          <>
            {isDragOverProjectDropzone && (
              <div className="mx-2 mt-2 rounded-xl border border-dashed border-blue-300 bg-blue-50/80 p-4 text-center text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-300">
                <Upload className="mx-auto mb-2 h-5 w-5" />
                {t('projects.dropFolderCta', '松开鼠标，在这里用文件夹创建项目')}
              </div>
            )}

            {dropMessage && (
              <div className="mx-2 mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                {dropMessage}
              </div>
            )}

            {showConversationSearch ? (
              isSearching && !hasPartialResults ? (
                <div className="px-4 py-12 text-center md:py-8">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted md:mb-3">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                  </div>
                  <p className="text-sm text-muted-foreground">{t('search.searching')}</p>
                  {searchProgress && (
                    <p className="mt-1 text-xs text-muted-foreground/60">
                      {t('search.projectsScanned', { count: searchProgress.scannedProjects })}/{searchProgress.totalProjects}
                    </p>
                  )}
                </div>
              ) : !isSearching && conversationResults && conversationResults.results.length === 0 ? (
                <div className="px-4 py-12 text-center md:py-8">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted md:mb-3">
                    <Search className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="mb-2 text-base font-medium text-foreground md:mb-1">{t('search.noResults')}</h3>
                  <p className="text-sm text-muted-foreground">{t('search.tryDifferentQuery')}</p>
                </div>
              ) : hasPartialResults ? (
                <div className="space-y-3 px-2">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-xs text-muted-foreground">
                      {t('search.matches', { count: conversationResults.totalMatches })}
                    </p>
                    {isSearching && searchProgress && (
                      <div className="flex items-center gap-1.5">
                        <div className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-muted-foreground/40 border-t-primary" />
                        <p className="text-[10px] text-muted-foreground/60">
                          {searchProgress.scannedProjects}/{searchProgress.totalProjects}
                        </p>
                      </div>
                    )}
                  </div>
                  {isSearching && searchProgress && (
                    <div className="mx-1 h-0.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/60 transition-all duration-300"
                        style={{ width: `${Math.round((searchProgress.scannedProjects / searchProgress.totalProjects) * 100)}%` }}
                      />
                    </div>
                  )}
                  {conversationResults.results.map((projectResult) => (
                    <div key={projectResult.projectName} className="space-y-1">
                      <div className="flex items-center gap-1.5 px-1 py-1">
                        <Folder className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                        <span className="truncate text-xs font-medium text-foreground">
                          {projectResult.projectDisplayName}
                        </span>
                      </div>
                      {projectResult.sessions.map((session) => (
                        <button
                          key={`${projectResult.projectName}-${session.sessionId}`}
                          className="w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/50"
                          onClick={() => onConversationResultClick(
                            projectResult.projectName,
                            session.sessionId,
                            session.matches[0]?.timestamp,
                            session.matches[0]?.snippet
                          )}
                          >
                          <div className="mb-1 flex items-center gap-1.5">
                            <MessageSquare className="h-3 w-3 flex-shrink-0 text-primary" />
                            <span className="truncate text-xs font-medium text-foreground">
                              {session.sessionSummary}
                            </span>
                          </div>
                          <div className="space-y-1 pl-4">
                            {session.matches.map((match, idx) => (
                              <div key={idx} className="flex items-start gap-1">
                                <span className="mt-0.5 flex-shrink-0 text-[10px] font-medium uppercase text-muted-foreground/60">
                                  {match.role === 'user' ? 'U' : 'A'}
                                </span>
                                <HighlightedSnippet
                                  snippet={match.snippet}
                                  highlights={match.highlights}
                                />
                              </div>
                            ))}
                          </div>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ) : null
            ) : (
              <SidebarProjectList {...projectListProps} />
            )}
          </>
        ) : isFilesWorkspace && selectedProject ? (
          <FileTree
            selectedProject={selectedProject}
            onFileOpen={onFileOpen}
            onAppendToChatInput={onAppendToChatInput}
            embedded
          />
        ) : isGitWorkspace && selectedProject ? (
          <GitPanel
            selectedProject={selectedProject}
            onFileOpen={onFileOpen}
            onCommitPreviewOpen={onCommitPreviewOpen}
            embedded
            isMobile={isMobile}
          />
        ) : (
          <div className="flex min-h-full items-center justify-center px-4 py-8">
            <div className="workspace-placeholder-card w-full max-w-sm rounded-2xl border border-border/70 bg-card/80 p-5 shadow-sm">
              <div className="mb-3 inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {t(`workspace.${workspaceView}`)}
              </div>
              <h2 className="text-base font-semibold text-foreground">
                {t('workspace.selectProjectTitle')}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t('workspace.selectProjectDescription')}
              </p>
              <div className="mt-4 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onWorkspaceViewChange('projects')}
                  >
                    {t('workspace.backToProjects')}
                  </Button>
              </div>
            </div>
          </div>
        )}
      </ScrollArea>

      <SidebarFooter
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
        onCollapseSidebar={onCollapseSidebar}
        onShowSettings={onShowSettings}
        workspaceView={workspaceView}
        onWorkspaceViewChange={onWorkspaceViewChange}
        t={t}
      />
    </div>
  );
}
