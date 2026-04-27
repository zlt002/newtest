import type { Project, ProjectSession } from '../../types/app';

type RouteSelection = {
  project: Project | null;
  session: ProjectSession | null;
  isDraftSessionRoute: boolean;
};

const DRAFT_SESSION_ROUTE_PREFIX = 'new-session-draft-';

export function createDraftSessionRouteId(projectName: string, timestamp = Date.now()) {
  return `${DRAFT_SESSION_ROUTE_PREFIX}${encodeURIComponent(projectName)}-${timestamp}`;
}

export function resolveDraftProjectNameFromSessionRoute(sessionId?: string) {
  if (!sessionId || !sessionId.startsWith(DRAFT_SESSION_ROUTE_PREFIX)) {
    return null;
  }

  const encodedPayload = sessionId.slice(DRAFT_SESSION_ROUTE_PREFIX.length);
  const separatorIndex = encodedPayload.lastIndexOf('-');
  if (separatorIndex <= 0) {
    return null;
  }

  try {
    return decodeURIComponent(encodedPayload.slice(0, separatorIndex));
  } catch {
    return null;
  }
}

export function resolveSessionSelectionFromRoute({
  sessionId,
  projects,
}: {
  sessionId?: string;
  projects: Project[];
}): RouteSelection {
  if (!sessionId) {
    return {
      project: null,
      session: null,
      isDraftSessionRoute: false,
    };
  }

  for (const project of projects) {
    const session = project.sessions?.find((candidate) => candidate.id === sessionId) ?? null;
    if (session) {
      return {
        project,
        session,
        isDraftSessionRoute: false,
      };
    }
  }

  const draftProjectName = resolveDraftProjectNameFromSessionRoute(sessionId);
  if (draftProjectName) {
    const project = projects.find((candidate) => candidate.name === draftProjectName) ?? null;
    if (project) {
      return {
        project,
        session: null,
        isDraftSessionRoute: true,
      };
    }
  }

  return {
    project: null,
    session: null,
    isDraftSessionRoute: false,
  };
}

export function mergeResolvedRouteSessionIntoProjects({
  projects,
  projectName,
  session,
}: {
  projects: Project[];
  projectName: string;
  session: ProjectSession;
}): Project[] {
  return projects.map((project) => {
    if (project.name !== projectName) {
      return project;
    }

    const existingSessions = project.sessions ?? [];
    const nextSession = {
      ...session,
      __projectName: project.name,
    };
    const dedupedSessions = existingSessions.filter((candidate) => candidate.id !== session.id);
    const sessionAlreadyPresent = dedupedSessions.length !== existingSessions.length;
    const currentTotal = Number(project.sessionMeta?.total ?? existingSessions.length);

    return {
      ...project,
      sessions: [nextSession, ...dedupedSessions],
      sessionMeta: {
        ...project.sessionMeta,
        total: sessionAlreadyPresent ? currentTotal : Math.max(currentTotal, dedupedSessions.length + 1),
      },
    };
  });
}

export function preserveRoutedSessionInProjects({
  projects,
  routedSessionId,
  selectedProject,
  selectedSession,
}: {
  projects: Project[];
  routedSessionId?: string | null;
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
}): Project[] {
  if (!routedSessionId || !selectedProject || !selectedSession || selectedSession.id !== routedSessionId) {
    return projects;
  }

  const updatedProject = projects.find((project) => project.name === selectedProject.name);
  if (!updatedProject) {
    return projects;
  }

  const sessionAlreadyPresent = (updatedProject.sessions ?? []).some((session) => session.id === routedSessionId);
  if (sessionAlreadyPresent) {
    return projects;
  }

  return mergeResolvedRouteSessionIntoProjects({
    projects,
    projectName: selectedProject.name,
    session: selectedSession,
  });
}
