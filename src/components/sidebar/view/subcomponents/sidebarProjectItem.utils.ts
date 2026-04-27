import type { TFunction } from 'i18next';
import type { Project } from '../../../../types/app';
import type { SessionWithProvider } from '../../types/types';

export type ProjectMenuAction = {
  id: 'open-folder' | 'toggle-star' | 'rename' | 'delete';
  label: string;
  danger?: boolean;
};

export type ProjectVisualTone = {
  containerClassName: string;
  iconClassName: string;
  titleClassName: string;
  countClassName: string;
};

export const getSessionCountDisplay = (sessions: SessionWithProvider[], hasMoreSessions: boolean): string => {
  const sessionCount = sessions.length;
  if (hasMoreSessions && sessionCount >= 5) {
    return `${sessionCount}+`;
  }

  return `${sessionCount}`;
};

export const getProjectDisplayLabel = (project: Project): string => {
  const rawLabel =
    typeof project.displayName === 'string' && project.displayName.trim().length > 0
      ? project.displayName.trim()
      : typeof project.fullPath === 'string' && project.fullPath.trim().length > 0
        ? project.fullPath.trim()
        : typeof project.path === 'string' && project.path.trim().length > 0
          ? project.path.trim()
          : project.name;

  const normalizedLabel = rawLabel.replace(/[\\/]+$/, '');
  const hasPathSeparator = /[\\/]/.test(normalizedLabel);
  if (!hasPathSeparator) {
    return normalizedLabel;
  }

  const segments = normalizedLabel.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] || normalizedLabel;
};

export const getProjectHoverPath = (project: Project): string => project.fullPath || project.path || '';

export const getProjectVisualTone = ({
  isSelected,
  isStarred,
}: {
  isSelected: boolean;
  isStarred: boolean;
}): ProjectVisualTone => {
  if (isSelected) {
    return {
      containerClassName: 'bg-transparent text-accent-foreground',
      iconClassName: 'text-primary',
      titleClassName: 'text-foreground',
      countClassName: 'text-foreground/80',
    };
  }

  if (isStarred) {
    return {
      containerClassName: 'bg-yellow-50/35 dark:bg-yellow-900/10 hover:bg-yellow-100/40 dark:hover:bg-yellow-900/20',
      iconClassName: 'text-muted-foreground/80',
      titleClassName: 'text-foreground/80',
      countClassName: 'text-muted-foreground/80',
    };
  }

  return {
    containerClassName: 'hover:bg-accent/20',
    iconClassName: 'text-muted-foreground/50',
    titleClassName: 'text-foreground/60',
    countClassName: 'text-muted-foreground/55',
  };
};

export const getProjectMenuActions = (isStarred: boolean, t: TFunction): ProjectMenuAction[] => [
  {
    id: 'open-folder',
    label: t('tooltips.openFolder'),
  },
  {
    id: 'toggle-star',
    label: isStarred ? t('tooltips.removeFromFavorites') : t('tooltips.addToFavorites'),
  },
  {
    id: 'rename',
    label: t('tooltips.renameProject'),
  },
  {
    id: 'delete',
    label: t('tooltips.deleteProject'),
    danger: true,
  },
];
