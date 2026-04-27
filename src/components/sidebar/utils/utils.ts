import type { TFunction } from 'i18next';
import type { Project } from '../../../types/app';
import type {
  AdditionalSessionsByProject,
  DesktopSessionRowViewModel,
  ProjectSortOrder,
  SettingsProject,
  SessionViewModel,
  SessionWithProvider,
} from '../types/types';
import { sanitizeDisplayText } from '../../chat/utils/protocolNoise.ts';

export const dedupeSessionsById = (sessions: SessionWithProvider[]): SessionWithProvider[] => {
  const seen = new Set<string>();
  const deduped: SessionWithProvider[] = [];

  for (const session of sessions) {
    const sessionId = typeof session?.id === 'string' ? session.id.trim() : '';
    if (!sessionId || seen.has(sessionId)) {
      continue;
    }
    seen.add(sessionId);
    deduped.push(session);
  }

  return deduped;
};

export const reconcileAdditionalSessions = (
  projects: Project[],
  additionalSessions: AdditionalSessionsByProject,
): AdditionalSessionsByProject => {
  const next: AdditionalSessionsByProject = {};

  for (const project of projects) {
    const projectName = project.name;
    const extraSessions = additionalSessions[projectName];
    if (!Array.isArray(extraSessions) || extraSessions.length === 0) {
      continue;
    }

    const baseSessionIds = new Set(
      (project.sessions || [])
        .map((session) => (typeof session?.id === 'string' ? session.id.trim() : ''))
        .filter(Boolean),
    );
    const preservedSessions = dedupeSessionsById(
      extraSessions.filter((session) => {
        const sessionId = typeof session?.id === 'string' ? session.id.trim() : '';
        return Boolean(sessionId) && !baseSessionIds.has(sessionId);
      }),
    );

    if (preservedSessions.length > 0) {
      next[projectName] = preservedSessions;
    }
  }

  return next;
};

export const readProjectSortOrder = (): ProjectSortOrder => {
  try {
    const rawSettings = localStorage.getItem('claude-settings');
    if (!rawSettings) {
      return 'date';
    }

    const settings = JSON.parse(rawSettings) as { projectSortOrder?: ProjectSortOrder };
    return settings.projectSortOrder === 'name' ? 'name' : 'date';
  } catch {
    return 'date';
  }
};

export const loadStarredProjects = (): Set<string> => {
  try {
    const saved = localStorage.getItem('starredProjects');
    return saved ? new Set<string>(JSON.parse(saved)) : new Set<string>();
  } catch {
    return new Set<string>();
  }
};

export const persistStarredProjects = (starredProjects: Set<string>) => {
  try {
    localStorage.setItem('starredProjects', JSON.stringify([...starredProjects]));
  } catch {
    // Keep UI responsive even if storage fails.
  }
};

export const getSessionDate = (session: SessionWithProvider): Date => {
  return new Date(session.lastActivity || session.createdAt || 0);
};

export const getSessionName = (session: SessionWithProvider, t: TFunction): string => {
  return sanitizeDisplayText(session.summary || session.name || '', t('projects.newSession'));
};

export const getSessionTime = (session: SessionWithProvider): string => {
  return String(session.lastActivity || session.createdAt || '');
};

export const createSessionViewModel = (
  session: SessionWithProvider,
  currentTime: Date,
  t: TFunction,
): SessionViewModel => {
  const sessionDate = getSessionDate(session);
  const diffInMinutes = Math.floor((currentTime.getTime() - sessionDate.getTime()) / (1000 * 60));

  return {
    isActive: diffInMinutes < 10,
    sessionName: getSessionName(session, t),
    sessionTime: getSessionTime(session),
    messageCount: Number(session.messageCount || 0),
  };
};

export const createDesktopSessionRowViewModel = (
  session: SessionWithProvider,
  currentTime: Date,
  t: TFunction,
): DesktopSessionRowViewModel => {
  const sessionView = createSessionViewModel(session, currentTime, t);

  return {
    sessionName: sessionView.sessionName,
    sessionTime: sessionView.sessionTime,
    isActive: sessionView.isActive,
  };
};

export const getAllSessions = (
  project: Project,
  additionalSessions: AdditionalSessionsByProject,
): SessionWithProvider[] => {
  const combinedSessions = [
    ...(project.sessions || []),
    ...(additionalSessions[project.name] || []),
  ].sort((a, b) => getSessionDate(b).getTime() - getSessionDate(a).getTime());

  return dedupeSessionsById(combinedSessions);
};

export const getProjectLastActivity = (
  project: Project,
  additionalSessions: AdditionalSessionsByProject,
): Date => {
  const sessions = getAllSessions(project, additionalSessions);
  if (sessions.length === 0) {
    return new Date(0);
  }

  return sessions.reduce((latest, session) => {
    const sessionDate = getSessionDate(session);
    return sessionDate > latest ? sessionDate : latest;
  }, new Date(0));
};

export const sortProjects = (
  projects: Project[],
  projectSortOrder: ProjectSortOrder,
  starredProjects: Set<string>,
  additionalSessions: AdditionalSessionsByProject,
): Project[] => {
  const byName = [...projects];

  byName.sort((projectA, projectB) => {
    const aStarred = starredProjects.has(projectA.name);
    const bStarred = starredProjects.has(projectB.name);

    if (aStarred && !bStarred) {
      return -1;
    }

    if (!aStarred && bStarred) {
      return 1;
    }

    if (projectSortOrder === 'date') {
      return (
        getProjectLastActivity(projectB, additionalSessions).getTime() -
        getProjectLastActivity(projectA, additionalSessions).getTime()
      );
    }

    return (projectA.displayName || projectA.name).localeCompare(projectB.displayName || projectB.name);
  });

  return byName;
};

export const filterProjects = (projects: Project[], searchFilter: string): Project[] => {
  const normalizedSearch = searchFilter.trim().toLowerCase();
  if (!normalizedSearch) {
    return projects;
  }

  return projects.filter((project) => {
    const displayName = (project.displayName || project.name).toLowerCase();
    const projectName = project.name.toLowerCase();
    return displayName.includes(normalizedSearch) || projectName.includes(normalizedSearch);
  });
};

export const normalizeProjectForSettings = (project: Project): SettingsProject => {
  const fallbackPath =
    typeof project.fullPath === 'string' && project.fullPath.length > 0
      ? project.fullPath
      : typeof project.path === 'string'
        ? project.path
        : '';

  return {
    name: project.name,
    displayName:
      typeof project.displayName === 'string' && project.displayName.trim().length > 0
        ? project.displayName
        : project.name,
    fullPath: fallbackPath,
    path:
      typeof project.path === 'string' && project.path.length > 0
        ? project.path
        : fallbackPath,
  };
};
