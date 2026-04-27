import type { LoadingProgress, Project, ProjectSession, SessionProvider } from '../../../types/app';
import type { WorkspaceView } from '../view/subcomponents/sidebarWorkspace.shared';
import type { CodeEditorDiffInfo } from '../../code-editor/types/types';
import type { GitCommitSummary } from '../../git-panel/types/types';

export type ProjectSortOrder = 'name' | 'date';

export type SessionWithProvider = ProjectSession;

export type AdditionalSessionsByProject = Record<string, ProjectSession[]>;
export type LoadingSessionsByProject = Record<string, boolean>;

export type DeleteProjectConfirmation = {
  project: Project;
  sessionCount: number;
};

export type SessionDeleteConfirmation = {
  projectName: string;
  sessionId: string;
  sessionTitle: string;
  provider: SessionProvider;
};

export type SidebarProps = {
  projects: Project[];
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  onProjectSelect: (project: Project) => void;
  onSessionSelect: (session: ProjectSession) => void;
  onNewSession: (project: Project) => void;
  onSessionDelete?: (sessionId: string) => void;
  onProjectDelete?: (projectName: string) => void;
  isLoading: boolean;
  loadingProgress: LoadingProgress | null;
  onRefresh: () => Promise<void> | void;
  onShowSettings: () => void;
  showSettings: boolean;
  settingsInitialTab: string;
  onCloseSettings: () => void;
  isMobile: boolean;
  initialWorkspaceView?: WorkspaceView;
  onFileOpen?: (filePath: string, diffInfo?: CodeEditorDiffInfo | null) => void;
  onAppendToChatInput?: ((text: string) => void) | null;
  onCommitPreviewOpen?: (commit: GitCommitSummary, diff: string) => void;
  presentation?: 'default' | 'peek-collapsed' | 'peek-expanded';
  onRequestPeekOpen?: () => void;
  onRequestPeekClose?: () => void;
};

export type SessionViewModel = {
  isActive: boolean;
  sessionName: string;
  sessionTime: string;
  messageCount: number;
};

export type DesktopSessionRowViewModel = {
  sessionName: string;
  sessionTime: string;
  isActive: boolean;
};

export type SettingsProject = Pick<Project, 'name' | 'displayName' | 'fullPath' | 'path'>;
