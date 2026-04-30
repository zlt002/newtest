import type { Dispatch, MouseEvent as ReactMouseEvent, RefObject, SetStateAction } from 'react';
import type { AppTab, Project, ProjectSession } from '../../../types/app';
import type { CodeEditorDiffInfo } from '../../code-editor/types/types';
import type { BrowserDependencySnapshot, CodeFollowAlongState, DraftPreviewState  } from '../../code-editor/hooks/useEditorSidebar';
import type { RightPaneTab, RightPaneTarget } from '../../right-pane/types';
import type { FileChangeEvent } from '@hooks/chat/chatFileChangeEvents';
import type { DraftPreviewEvent } from '@hooks/chat/chatDraftPreviewEvents';


export type SessionLifecycleHandler = (sessionId?: string | null) => void;


export type MainContentProps = {
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  activeTab: AppTab;
  setActiveTab: Dispatch<SetStateAction<AppTab>>;
  ws: WebSocket | null;
  sendMessage: (message: unknown) => void;
  latestMessage: unknown;
  isMobile: boolean;
  onMenuClick: () => void;
  isLoading: boolean;
  onInputFocusChange: (focused: boolean) => void;
  onSessionActive: SessionLifecycleHandler;
  onSessionInactive: SessionLifecycleHandler;
  onSessionProcessing: SessionLifecycleHandler;
  onSessionNotProcessing: SessionLifecycleHandler;
  processingSessions: Set<string>;
  onReplaceTemporarySession: SessionLifecycleHandler;
  onNavigateToSession: (targetSessionId: string) => void;
  onStartNewSession: (project: Project) => void;
  hasRightPaneContent: boolean;
  isRightPaneVisible: boolean;
  onToggleRightPaneVisibility: () => void;
  onShowSettings: () => void;
  externalMessageUpdate: number;
  onComposerAppendReady?: ((append: ((text: string) => void) | null) => void) | null;
  onFileChangeEvent?: (event: FileChangeEvent) => void;
  onDraftPreviewEvent?: (event: DraftPreviewEvent) => void;
  rightPaneTabs: RightPaneTab[];
  activeRightPaneTabId: string | null;
  rightPaneTarget: RightPaneTarget | null;
  activeContextTarget?: RightPaneTarget | null;
  editorWidth: number;
  editorExpanded: boolean;
  hasManualWidth: boolean;
  isResizing: boolean;
  resizeHandleRef: RefObject<HTMLDivElement | null>;
  browserRefreshVersion?: number;
  codeFollowAlongState?: CodeFollowAlongState | null;
  draftPreviewState?: DraftPreviewState;
  onFileOpen: (filePath: string, diffInfo?: CodeEditorDiffInfo | null) => void;
  onMarkdownDraftOpen: (payload: {
    filePath: string;
    fileName?: string;
    content?: string;
    statusText?: string;
    sourceSessionId?: string | null;
  }) => void;
  onMarkdownDraftUpdate: (payload: {
    filePath: string;
    content?: string;
    statusText?: string;
    sourceSessionId?: string | null;
  }) => void;
  onOpenUrl: (url: string, source?: 'address-bar' | 'chat-link' | 'external-link') => void;
  onClosePane: () => void;
  onSelectRightPaneTab: (tabId: string) => void;
  onCloseRightPaneTab: (tabId: string) => void;
  onTogglePaneExpand: () => void;
  onResizeStart: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onBrowserDependenciesChange?: ((snapshot: BrowserDependencySnapshot) => void) | null;
};

export type MainContentHeaderProps = {
  activeTab: AppTab;
  selectedProject: Project;
  selectedSession: ProjectSession | null;
  isMobile: boolean;
  onMenuClick: () => void;
  onNavigateToSession: (targetSessionId: string) => void;
  onStartNewSession: (project: Project) => void;
  hasRightPaneContent: boolean;
  isRightPaneVisible: boolean;
  onToggleRightPaneVisibility: () => void;
};

export type MainContentStateViewProps = {
  mode: 'loading' | 'empty';
  isMobile: boolean;
  onMenuClick: () => void;
};

export type MobileMenuButtonProps = {
  onMenuClick: () => void;
  compact?: boolean;
};
