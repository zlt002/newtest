import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Edit3, Ellipsis, Folder, FolderOpen, Plus, Star, Trash2, X } from 'lucide-react';
import type { TFunction } from 'i18next';
import { cn } from '../../../../lib/utils';
import type { Project, ProjectSession, SessionProvider } from '../../../../types/app';
import type { SessionWithProvider } from '../../types/types';
import { api } from '../../../../utils/api';
import SidebarProjectSessions from './SidebarProjectSessions';
import {
  getProjectDisplayLabel,
  getProjectHoverPath,
  getProjectMenuActions,
  getSessionCountDisplay,
  getProjectVisualTone,
} from './sidebarProjectItem.utils';

type SidebarProjectItemProps = {
  project: Project;
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  isExpanded: boolean;
  isDeleting: boolean;
  isStarred: boolean;
  editingProject: string | null;
  editingName: string;
  sessions: SessionWithProvider[];
  initialSessionsLoaded: boolean;
  isLoadingSessions: boolean;
  currentTime: Date;
  editingSession: string | null;
  editingSessionName: string;
  onEditingNameChange: (name: string) => void;
  onToggleProject: (projectName: string) => void;
  onProjectSelect: (project: Project) => void;
  onToggleStarProject: (projectName: string) => void;
  onStartEditingProject: (project: Project) => void;
  onCancelEditingProject: () => void;
  onSaveProjectName: (projectName: string) => void;
  onDeleteProject: (project: Project) => void;
  onSessionSelect: (session: SessionWithProvider, projectName: string) => void;
  onDeleteSession: (
    projectName: string,
    sessionId: string,
    sessionTitle: string,
    provider: SessionProvider,
  ) => void;
  onLoadMoreSessions: (project: Project) => void;
  onResetVisibleSessions: (project: Project) => void;
  onNewSession: (project: Project) => void;
  onEditingSessionNameChange: (value: string) => void;
  onStartEditingSession: (sessionId: string, initialName: string) => void;
  onCancelEditingSession: () => void;
  onSaveEditingSession: (projectName: string, sessionId: string, summary: string, provider: SessionProvider) => void;
  t: TFunction;
};

export default function SidebarProjectItem({
  project,
  selectedProject,
  selectedSession,
  isExpanded,
  isDeleting,
  isStarred,
  editingProject,
  editingName,
  sessions,
  initialSessionsLoaded,
  isLoadingSessions,
  currentTime,
  editingSession,
  editingSessionName,
  onEditingNameChange,
  onToggleProject,
  onProjectSelect,
  onToggleStarProject,
  onStartEditingProject,
  onCancelEditingProject,
  onSaveProjectName,
  onDeleteProject,
  onSessionSelect,
  onDeleteSession,
  onLoadMoreSessions,
  onResetVisibleSessions,
  onNewSession,
  onEditingSessionNameChange,
  onStartEditingSession,
  onCancelEditingSession,
  onSaveEditingSession,
  t,
}: SidebarProjectItemProps) {
  const isSelected = selectedProject?.name === project.name;
  const isEditing = editingProject === project.name;
  const hasMoreSessions = project.sessionMeta?.hasMore === true;
  const sessionCountDisplay = getSessionCountDisplay(sessions, hasMoreSessions);
  const sessionCountLabel = `${sessionCountDisplay} session${sessions.length === 1 ? '' : 's'}`;
  const projectDisplayLabel = getProjectDisplayLabel(project);
  const projectPath = getProjectHoverPath(project);
  const menuActions = getProjectMenuActions(isStarred, t);
  const projectVisualTone = getProjectVisualTone({ isSelected, isStarred });
  const [isDesktopMenuOpen, setIsDesktopMenuOpen] = useState(false);
  const desktopMenuRef = useRef<HTMLDivElement | null>(null);

  const toggleProject = () => onToggleProject(project.name);
  const toggleStarProject = () => onToggleStarProject(project.name);

  const saveProjectName = () => {
    onSaveProjectName(project.name);
  };

  useEffect(() => {
    if (!isDesktopMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!desktopMenuRef.current?.contains(event.target as Node)) {
        setIsDesktopMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDesktopMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isDesktopMenuOpen]);

  useEffect(() => {
    if (isEditing) {
      setIsDesktopMenuOpen(false);
    }
  }, [isEditing]);

  const handleMenuAction = (actionId: string) => {
    setIsDesktopMenuOpen(false);

    if (actionId === 'open-folder') {
      void api.openProjectFolder(project.name).then(async (response) => {
        if (response.ok) {
          return;
        }

        let message = t('messages.errorOccurred');
        try {
          const payload = await response.json();
          message = payload.error || message;
        } catch {
          // Ignore malformed error payloads and keep the fallback message.
        }
        window.alert(message);
      });
      return;
    }

    if (actionId === 'toggle-star') {
      toggleStarProject();
      return;
    }

    if (actionId === 'rename') {
      onStartEditingProject(project);
      return;
    }

    if (actionId === 'delete') {
      onDeleteProject(project);
    }
  };

  return (
    <div className={cn('', isDeleting && 'opacity-50 pointer-events-none')}>
      <div className="md:group group">
        <div className="md:hidden">
          <div
            className={cn(
              'p-3 mx-3 my-1 bg-card border border-border/50 active:scale-[0.98] transition-all duration-150',
              isSelected && 'bg-primary/5 border-primary/20',
              isStarred &&
                !isSelected &&
                'bg-yellow-50/50 dark:bg-yellow-900/5 border-yellow-200/30 dark:border-yellow-800/30',
            )}
            onClick={toggleProject}
          >
            <div className="flex justify-between items-center">
              <div className="flex flex-1 gap-3 items-center min-w-0">
                <div
                  className={cn(
                    'flex justify-center items-center w-8 h-8 transition-colors',
                    isExpanded ? 'bg-primary/10' : 'bg-muted',
                  )}
                >
                  {isExpanded ? (
                    <FolderOpen className="w-4 h-4 text-primary" />
                  ) : (
                    <Folder className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(event) => onEditingNameChange(event.target.value)}
                      className="px-3 py-2 w-full text-sm rounded-lg border-2 shadow-sm transition-all duration-200 border-primary/40 bg-background text-foreground focus:border-primary focus:shadow-md focus:outline-none"
                      placeholder={t('projects.projectNamePlaceholder')}
                      autoFocus
                      autoComplete="off"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          saveProjectName();
                        }

                        if (event.key === 'Escape') {
                          onCancelEditingProject();
                        }
                      }}
                      style={{
                        fontSize: '16px',
                        WebkitAppearance: 'none',
                        borderRadius: '8px',
                      }}
                    />
                  ) : (
                    <>
                      <div className="flex flex-1 justify-between items-center min-w-0">
                        <h3 className="text-sm font-medium truncate text-foreground">{project.displayName}</h3>
                      </div>
                      <p className="text-xs text-muted-foreground">{sessionCountLabel}</p>
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-1 items-center">
                {isEditing ? (
                  <>
                    <button
                      className="flex justify-center items-center w-8 h-8 bg-green-500 rounded-lg shadow-sm transition-all duration-150 active:scale-90 active:shadow-none dark:bg-green-600"
                      onClick={(event) => {
                        event.stopPropagation();
                        saveProjectName();
                      }}
                    >
                      <Check className="w-4 h-4 text-white" />
                    </button>
                    <button
                      className="flex justify-center items-center w-8 h-8 bg-gray-500 rounded-lg shadow-sm transition-all duration-150 active:scale-90 active:shadow-none dark:bg-gray-600"
                      onClick={(event) => {
                        event.stopPropagation();
                        onCancelEditingProject();
                      }}
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className={cn(
                        'flex justify-center items-center w-8 h-8 rounded-lg border transition-all duration-150 active:scale-90',
                        isStarred
                          ? 'border-yellow-200 bg-yellow-500/10 dark:bg-yellow-900/30 dark:border-yellow-800'
                          : 'border-gray-200 bg-gray-500/10 dark:bg-gray-900/30 dark:border-gray-800',
                      )}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleStarProject();
                      }}
                      title={isStarred ? t('tooltips.removeFromFavorites') : t('tooltips.addToFavorites')}
                    >
                      <Star
                        className={cn(
                          'w-4 h-4 transition-colors',
                          isStarred
                            ? 'text-yellow-600 fill-current dark:text-yellow-400'
                            : 'text-gray-600 dark:text-gray-400',
                        )}
                      />
                    </button>

                    <button
                      className="flex justify-center items-center w-8 h-8 rounded-lg border border-red-200 bg-red-500/10 active:scale-90 dark:border-red-800 dark:bg-red-900/30"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteProject(project);
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                    </button>

                    <button
                      className="flex justify-center items-center w-8 h-8 rounded-lg border border-primary/20 bg-primary/10 active:scale-90 dark:border-primary/30 dark:bg-primary/20"
                      onClick={(event) => {
                        event.stopPropagation();
                        onStartEditingProject(project);
                      }}
                    >
                      <Edit3 className="w-4 h-4 text-primary" />
                    </button>

                    <div className="flex justify-center items-center w-6 h-6 bg-muted/30">
                      {isExpanded ? (
                        <ChevronDown className="w-3 h-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div
          className={cn(
            'group/project hidden md:flex w-full items-center justify-between py-2 transition-colors hover:bg-accent/50',
            projectVisualTone.containerClassName,
          )}
          ref={desktopMenuRef}
          title={!isEditing && projectPath ? projectPath : undefined}
        >
          <button
            type="button"
            className="flex flex-1 gap-3 items-center min-w-0 text-left"
            onClick={toggleProject}
            title={!isEditing && projectPath ? projectPath : undefined}
          >
            {isExpanded ? (
              <FolderOpen className={cn('h-4 w-4 flex-shrink-0', isSelected ? 'text-primary' : projectVisualTone.iconClassName)} />
            ) : (
              <Folder className={cn('h-4 w-4 flex-shrink-0', projectVisualTone.iconClassName)} />
            )}
            <div className="flex-1 min-w-0 text-left">
              {isEditing ? (
                <input
                  type="text"
                  value={editingName}
                  onChange={(event) => onEditingNameChange(event.target.value)}
                  className="px-2 py-1 w-full text-sm rounded border border-border bg-background text-foreground focus:ring-2 focus:ring-primary/20"
                  placeholder={t('projects.projectNamePlaceholder')}
                  autoFocus
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      saveProjectName();
                    }
                    if (event.key === 'Escape') {
                      onCancelEditingProject();
                    }
                  }}
                />
              ) : (
                <div>
                  <div className="flex gap-2 items-center">
                    <div
                      className={cn(
                        'truncate text-sm font-semibold transition-colors',
                        projectVisualTone.titleClassName,
                      )}
                      title={projectDisplayLabel}
                    >
                      {projectDisplayLabel}
                    </div>
                    <div
                      className={cn(
                        'flex-shrink-0 text-xs transition-colors',
                        projectVisualTone.countClassName,
                      )}
                      title={sessionCountLabel}
                    >
                      {sessionCountDisplay}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </button>

          <div className="flex relative flex-shrink-0 items-center pl-2">
            {isEditing ? (
              <>
                <button
                  type="button"
                  className="flex justify-center items-center w-6 h-6 text-green-600 rounded transition-colors cursor-pointer hover:bg-green-50 hover:text-green-700 dark:hover:bg-green-900/20"
                  onClick={(event) => {
                    event.stopPropagation();
                    saveProjectName();
                  }}
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  className="flex justify-center items-center w-6 h-6 text-gray-500 rounded transition-colors cursor-pointer hover:bg-gray-50 hover:text-gray-700 dark:hover:bg-gray-800"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCancelEditingProject();
                  }}
                >
                  <X className="w-3 h-3" />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  aria-label={t('actions.moreActions', { defaultValue: '更多操作' })}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-md transition-all duration-200 touch:opacity-100',
                    'opacity-0 group-hover/project:opacity-100 hover:bg-accent focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                    isDesktopMenuOpen && 'opacity-100 bg-accent',
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    setIsDesktopMenuOpen((prev) => !prev);
                  }}
                >
                  <Ellipsis className="w-4 h-4 text-muted-foreground" />
                </button>
                <button
                  type="button"
                  aria-label={t('sessions.newSession')}
                  className="flex justify-center items-center w-7 h-7 rounded-md opacity-0 transition-all duration-200 touch:opacity-100 hover:bg-accent focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 group-hover/project:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    onNewSession(project);
                  }}
                  title={t('sessions.newSession')}
                >
                  <Plus className="w-4 h-4 text-muted-foreground" />
                </button>
                {isDesktopMenuOpen && (
                  <div className="absolute right-0 top-[calc(100%+4px)] z-20 min-w-[144px] overflow-hidden rounded-md border border-border bg-popover p-1 shadow-lg">
                    {menuActions.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        className={cn(
                          'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent',
                          action.danger && 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20',
                        )}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleMenuAction(action.id);
                        }}
                      >
                        {action.id === 'open-folder' && <Folder className="h-3.5 w-3.5" />}
                        {action.id === 'toggle-star' && (
                          <Star
                            className={cn(
                              'h-3.5 w-3.5',
                              isStarred && 'fill-current text-yellow-500',
                            )}
                          />
                        )}
                        {action.id === 'rename' && <Edit3 className="h-3.5 w-3.5" />}
                        {action.id === 'delete' && <Trash2 className="h-3.5 w-3.5" />}
                        <span>{action.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

        <SidebarProjectSessions
        project={project}
        isExpanded={isExpanded}
        sessions={sessions}
        selectedSession={selectedSession}
        initialSessionsLoaded={initialSessionsLoaded}
        isLoadingSessions={isLoadingSessions}
        currentTime={currentTime}
        editingSession={editingSession}
        editingSessionName={editingSessionName}
        onEditingSessionNameChange={onEditingSessionNameChange}
        onStartEditingSession={onStartEditingSession}
        onCancelEditingSession={onCancelEditingSession}
        onSaveEditingSession={onSaveEditingSession}
        onProjectSelect={onProjectSelect}
        onSessionSelect={onSessionSelect}
          onDeleteSession={onDeleteSession}
          onLoadMoreSessions={onLoadMoreSessions}
          onResetVisibleSessions={onResetVisibleSessions}
          onNewSession={onNewSession}
          t={t}
        />
    </div>
  );
}
