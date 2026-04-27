import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { api } from '../../utils/api';
import type {
  AppSocketMessage,
  AppTab,
  LoadingProgress,
  Project,
  ProjectSession,
  ProjectsUpdatedMessage,
} from '../../types/app';
import { normalizePersistedAppTab } from '../shared/activeTabPersistence';
import {
  getUnseenSocketMessageEvents,
  type SocketMessageEvent,
} from '../../contexts/socketMessageEvents';
import {
  createDraftSessionRouteId,
  mergeResolvedRouteSessionIntoProjects,
  preserveRoutedSessionInProjects,
  resolveSessionSelectionFromRoute,
} from './useProjectsRouteSelection';

type UseProjectsStateArgs = {
  sessionId?: string;
  navigate: NavigateFunction;
  latestMessage: AppSocketMessage | null;
  messageEvents: SocketMessageEvent<AppSocketMessage>[];
  isMobile: boolean;
  activeSessions: Set<string>;
};

type FetchProjectsOptions = {
  showLoadingState?: boolean;
};

const serialize = (value: unknown) => JSON.stringify(value ?? null);

const projectsHaveChanges = (
  prevProjects: Project[],
  nextProjects: Project[],
): boolean => {
  if (prevProjects.length !== nextProjects.length) {
    return true;
  }

  return nextProjects.some((nextProject, index) => {
    const prevProject = prevProjects[index];
    if (!prevProject) {
      return true;
    }

    const baseChanged =
      nextProject.name !== prevProject.name ||
      nextProject.displayName !== prevProject.displayName ||
      nextProject.fullPath !== prevProject.fullPath ||
      serialize(nextProject.sessionMeta) !== serialize(prevProject.sessionMeta) ||
      serialize(nextProject.sessions) !== serialize(prevProject.sessions);
    return baseChanged;
  });
};

const getProjectSessions = (project: Project): ProjectSession[] => {
  return project.sessions ?? [];
};

const isTemporarySessionRouteId = (sessionId?: string | null) =>
  Boolean(sessionId && sessionId.startsWith('new-session-'));

const isUpdateAdditive = (
  currentProjects: Project[],
  updatedProjects: Project[],
  selectedProject: Project | null,
  selectedSession: ProjectSession | null,
): boolean => {
  if (!selectedProject || !selectedSession) {
    return true;
  }

  const currentSelectedProject = currentProjects.find((project) => project.name === selectedProject.name);
  const updatedSelectedProject = updatedProjects.find((project) => project.name === selectedProject.name);

  if (!currentSelectedProject || !updatedSelectedProject) {
    return false;
  }

  const currentSelectedSession = getProjectSessions(currentSelectedProject).find(
    (session) => session.id === selectedSession.id,
  );
  const updatedSelectedSession = getProjectSessions(updatedSelectedProject).find(
    (session) => session.id === selectedSession.id,
  );

  if (!currentSelectedSession || !updatedSelectedSession) {
    return false;
  }

  return (
    currentSelectedSession.id === updatedSelectedSession.id &&
    currentSelectedSession.title === updatedSelectedSession.title &&
    currentSelectedSession.created_at === updatedSelectedSession.created_at &&
    currentSelectedSession.updated_at === updatedSelectedSession.updated_at
  );
};

const readPersistedTab = (): AppTab => {
  try {
    return normalizePersistedAppTab(localStorage.getItem('activeTab'));
  } catch {
    // localStorage unavailable
  }
  return 'chat';
};

export function useProjectsState({
  sessionId,
  navigate,
  latestMessage,
  messageEvents,
  isMobile,
  activeSessions,
}: UseProjectsStateArgs) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedSession, setSelectedSession] = useState<ProjectSession | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>(readPersistedTab);

  useEffect(() => {
    try {
      localStorage.setItem('activeTab', activeTab);
    } catch {
      // Silently ignore storage errors
    }
  }, [activeTab]);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState<LoadingProgress | null>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState('appearance');
  const [externalMessageUpdate, setExternalMessageUpdate] = useState(0);

  const loadingProgressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProcessedSocketEventIdRef = useRef(0);
  const suspendRouteSelectionRef = useRef(false);
  const routeLookupSessionIdRef = useRef<string | null>(null);

  const fetchProjects = useCallback(async ({ showLoadingState = true }: FetchProjectsOptions = {}) => {
    try {
      if (showLoadingState) {
        setIsLoadingProjects(true);
      }
      const response = await api.projects();
      const projectData = (await response.json()) as Project[];

      setProjects((prevProjects) => {
        if (prevProjects.length === 0) {
          return projectData;
        }

        return projectsHaveChanges(prevProjects, projectData)
          ? projectData
          : prevProjects;
      });
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      if (showLoadingState) {
        setIsLoadingProjects(false);
      }
    }
  }, []);

  const refreshProjectsSilently = useCallback(async () => {
    // Keep chat view stable while still syncing sidebar/session metadata in background.
    await fetchProjects({ showLoadingState: false });
  }, [fetchProjects]);

  const openSettings = useCallback((tab = 'appearance') => {
    setSettingsInitialTab(tab);
    setShowSettings(true);
  }, []);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  // Auto-select the project when there is only one, so the user lands on the new session page
  useEffect(() => {
    if (!isLoadingProjects && projects.length === 1 && !selectedProject && !sessionId) {
      setSelectedProject(projects[0]);
    }
  }, [isLoadingProjects, projects, selectedProject, sessionId]);

  useEffect(() => {
    const unseenEvents = getUnseenSocketMessageEvents(
      messageEvents,
      lastProcessedSocketEventIdRef.current,
    );

    if (unseenEvents.length === 0) {
      return;
    }

    for (const event of unseenEvents) {
      const message = event.data;

      if (message.type === 'loading_progress') {
        if (loadingProgressTimeoutRef.current) {
          clearTimeout(loadingProgressTimeoutRef.current);
          loadingProgressTimeoutRef.current = null;
        }

        setLoadingProgress(message as LoadingProgress);

        if (message.phase === 'complete') {
          loadingProgressTimeoutRef.current = setTimeout(() => {
            setLoadingProgress(null);
            loadingProgressTimeoutRef.current = null;
          }, 500);
        }

        continue;
      }

      if (message.type !== 'projects_updated') {
        continue;
      }

      const projectsMessage = message as ProjectsUpdatedMessage;

      if (projectsMessage.changedFile && selectedSession && selectedProject) {
        const normalized = projectsMessage.changedFile.replace(/\\/g, '/');
        const changedFileParts = normalized.split('/');

        if (changedFileParts.length >= 2) {
          const filename = changedFileParts[changedFileParts.length - 1];
          const changedSessionId = filename.replace('.jsonl', '');

          if (changedSessionId === selectedSession.id) {
            const isSessionActive = activeSessions.has(selectedSession.id);

            if (!isSessionActive) {
              setExternalMessageUpdate((prev) => prev + 1);
            }
          }
        }
      }

      const hasActiveSession =
        (selectedSession && activeSessions.has(selectedSession.id)) ||
        (activeSessions.size > 0 && Array.from(activeSessions).some((id) => id.startsWith('new-session-')));

      const updatedProjects = preserveRoutedSessionInProjects({
        projects: projectsMessage.projects,
        routedSessionId: sessionId,
        selectedProject,
        selectedSession,
      });

      if (
        hasActiveSession &&
        !isUpdateAdditive(projects, updatedProjects, selectedProject, selectedSession)
      ) {
        continue;
      }

      setProjects(updatedProjects);

      if (!selectedProject) {
        continue;
      }

      const updatedSelectedProject = updatedProjects.find(
        (project) => project.name === selectedProject.name,
      );

      if (!updatedSelectedProject) {
        continue;
      }

      if (serialize(updatedSelectedProject) !== serialize(selectedProject)) {
        setSelectedProject(updatedSelectedProject);
      }

      if (!selectedSession) {
        continue;
      }

      const updatedSelectedSession = getProjectSessions(updatedSelectedProject).find(
        (session) => session.id === selectedSession.id,
      );

      if (!updatedSelectedSession) {
        setSelectedSession(null);
      }
    }

    lastProcessedSocketEventIdRef.current = unseenEvents[unseenEvents.length - 1].id;
  }, [messageEvents, selectedProject, selectedSession, activeSessions, projects]);

  useEffect(() => {
    return () => {
      if (loadingProgressTimeoutRef.current) {
        clearTimeout(loadingProgressTimeoutRef.current);
        loadingProgressTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (projects.length === 0) {
      return;
    }

    if (suspendRouteSelectionRef.current) {
      if (!sessionId) {
        suspendRouteSelectionRef.current = false;
      }

      if (selectedSession) {
        setSelectedSession(null);
      }

      return;
    }

    const routeSelection = resolveSessionSelectionFromRoute({ sessionId, projects });

    if (!sessionId) {
      if (selectedSession) {
        setSelectedSession(null);
      }
      return;
    }

    if (!routeSelection.project) {
      return;
    }

    const shouldUpdateProject = selectedProject?.name !== routeSelection.project.name;

    if (shouldUpdateProject) {
      setSelectedProject(routeSelection.project);
    }

    if (routeSelection.isDraftSessionRoute) {
      if (selectedSession) {
        setSelectedSession(null);
      }
      return;
    }

    if (!routeSelection.session) {
      return;
    }

    const shouldUpdateSession = selectedSession?.id !== routeSelection.session.id;
    if (shouldUpdateSession) {
      setSelectedSession(routeSelection.session);
    }
  }, [sessionId, projects, selectedProject?.name, selectedSession?.id]);

  useEffect(() => {
    if (!sessionId || projects.length === 0 || suspendRouteSelectionRef.current || isTemporarySessionRouteId(sessionId)) {
      return;
    }

    const routeSelection = resolveSessionSelectionFromRoute({ sessionId, projects });
    if (routeSelection.project && routeSelection.session) {
      routeLookupSessionIdRef.current = null;
      return;
    }

    if (routeLookupSessionIdRef.current === sessionId) {
      return;
    }

    routeLookupSessionIdRef.current = sessionId;
    let cancelled = false;

    void (async () => {
      try {
        const response = await api.sessionLookup(sessionId);
        if (!response.ok) {
          return;
        }

        const payload = await response.json();
        const projectName = typeof payload?.projectName === 'string' ? payload.projectName : '';
        const resolvedSession = payload?.session && typeof payload.session === 'object'
          ? payload.session as ProjectSession
          : null;

        if (cancelled || !projectName || !resolvedSession) {
          return;
        }

        setProjects((prevProjects) => mergeResolvedRouteSessionIntoProjects({
          projects: prevProjects,
          projectName,
          session: resolvedSession,
        }));
      } catch (error) {
        console.error(`Error restoring routed session ${sessionId}:`, error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projects, sessionId]);

  const handleProjectSelect = useCallback(
    (project: Project) => {
      suspendRouteSelectionRef.current = true;
      setSelectedProject(project);
      setSelectedSession(null);
      navigate('/');

      if (isMobile) {
        setSidebarOpen(false);
      }
    },
    [isMobile, navigate],
  );

  const handleSessionSelect = useCallback(
    (session: ProjectSession) => {
      setSelectedSession(session);

      if (activeTab === 'preview') {
        setActiveTab('chat');
      }

      if (isMobile) {
        const sessionProjectName = session.__projectName;
        const currentProjectName = selectedProject?.name;

        if (sessionProjectName !== currentProjectName) {
          setSidebarOpen(false);
        }
      }

      navigate(`/session/${session.id}`);
    },
    [activeTab, isMobile, navigate, selectedProject?.name],
  );

  const handleNewSession = useCallback(
    (project: Project) => {
      setSelectedProject(project);
      setSelectedSession(null);
      setActiveTab('chat');
      navigate(`/session/${createDraftSessionRouteId(project.name)}`);

      if (isMobile) {
        setSidebarOpen(false);
      }
    },
    [isMobile, navigate],
  );

  const handleSessionDelete = useCallback(
    (sessionIdToDelete: string) => {
      if (selectedSession?.id === sessionIdToDelete) {
        setSelectedSession(null);
        navigate('/');
      }

      setProjects((prevProjects) =>
        prevProjects.map((project) => ({
          ...project,
          sessions: project.sessions?.filter((session) => session.id !== sessionIdToDelete) ?? [],
          sessionMeta: {
            ...project.sessionMeta,
            total: Math.max(0, (project.sessionMeta?.total as number | undefined ?? 0) - 1),
          },
        })),
      );
    },
    [navigate, selectedSession?.id],
  );

  const handleSidebarRefresh = useCallback(async () => {
    try {
      const response = await api.projects();
      const freshProjects = (await response.json()) as Project[];

      setProjects((prevProjects) =>
        projectsHaveChanges(prevProjects, freshProjects) ? freshProjects : prevProjects,
      );

      if (!selectedProject) {
        return;
      }

      const refreshedProject = freshProjects.find((project) => project.name === selectedProject.name);
      if (!refreshedProject) {
        return;
      }

      if (serialize(refreshedProject) !== serialize(selectedProject)) {
        setSelectedProject(refreshedProject);
      }

      if (!selectedSession) {
        return;
      }

      const refreshedSession = getProjectSessions(refreshedProject).find(
        (session) => session.id === selectedSession.id,
      );

      if (refreshedSession) {
        if (serialize(refreshedSession) !== serialize(selectedSession)) {
          setSelectedSession(refreshedSession);
        }
      }
    } catch (error) {
      console.error('Error refreshing sidebar:', error);
    }
  }, [selectedProject, selectedSession]);

  const handleProjectDelete = useCallback(
    (projectName: string) => {
      if (selectedProject?.name === projectName) {
        setSelectedProject(null);
        setSelectedSession(null);
        navigate('/');
      }

      setProjects((prevProjects) => prevProjects.filter((project) => project.name !== projectName));
    },
    [navigate, selectedProject?.name],
  );

  const sidebarSharedProps = useMemo(
    () => ({
      projects,
      selectedProject,
      selectedSession,
      onProjectSelect: handleProjectSelect,
      onSessionSelect: handleSessionSelect,
      onNewSession: handleNewSession,
      onSessionDelete: handleSessionDelete,
      onProjectDelete: handleProjectDelete,
      isLoading: isLoadingProjects,
      loadingProgress,
      onRefresh: handleSidebarRefresh,
      onShowSettings: () => setShowSettings(true),
      showSettings,
      settingsInitialTab,
      onCloseSettings: () => setShowSettings(false),
      isMobile,
    }),
    [
      handleNewSession,
      handleProjectDelete,
      handleProjectSelect,
      handleSessionDelete,
      handleSessionSelect,
      handleSidebarRefresh,
      isLoadingProjects,
      isMobile,
      loadingProgress,
      projects,
      settingsInitialTab,
      selectedProject,
      selectedSession,
      showSettings,
    ],
  );

  return {
    projects,
    selectedProject,
    selectedSession,
    activeTab,
    sidebarOpen,
    isLoadingProjects,
    loadingProgress,
    isInputFocused,
    showSettings,
    settingsInitialTab,
    externalMessageUpdate,
    setActiveTab,
    setSidebarOpen,
    setIsInputFocused,
    setShowSettings,
    openSettings,
    fetchProjects,
    refreshProjectsSilently,
    sidebarSharedProps,
    handleProjectSelect,
    handleSessionSelect,
    handleNewSession,
    handleSessionDelete,
    handleProjectDelete,
    handleSidebarRefresh,
  };
}
