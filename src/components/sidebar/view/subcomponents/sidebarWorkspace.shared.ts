import type { Project } from '../../../../types/app';

export type WorkspaceView = 'projects' | 'files' | 'git';

export type WorkspaceTabIcon = 'message-square' | 'folder' | 'git-branch';

export type WorkspaceTabMeta = {
  value: WorkspaceView;
  labelKey: string;
  icon: WorkspaceTabIcon;
};

export type WorkspacePanelState = 'ready' | 'needs-project';

export const WORKSPACE_VIEWS = ['projects', 'files', 'git'] as const;

export const DEFAULT_WORKSPACE_VIEW: WorkspaceView = 'projects';

const WORKSPACE_TAB_META: Record<WorkspaceView, WorkspaceTabMeta> = {
  projects: {
    value: 'projects',
    labelKey: 'workspace.projects',
    icon: 'message-square',
  },
  files: {
    value: 'files',
    labelKey: 'workspace.files',
    icon: 'folder',
  },
  git: {
    value: 'git',
    labelKey: 'workspace.git',
    icon: 'git-branch',
  },
};

export function getWorkspaceTabMeta(view: WorkspaceView): WorkspaceTabMeta {
  return WORKSPACE_TAB_META[view];
}

export function getWorkspacePanelState(
  view: WorkspaceView,
  selectedProject: Project | null,
): WorkspacePanelState {
  if (view === 'projects') {
    return 'ready';
  }

  return selectedProject ? 'ready' : 'needs-project';
}
