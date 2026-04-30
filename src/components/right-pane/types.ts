import type { CodeEditorDiffInfo } from '../code-editor/types/types';

export type RightPaneTargetType = 'code' | 'markdown' | 'markdown-draft' | 'browser' | 'git-commit' | 'visual-html';

export type RightPaneBrowserSource = 'address-bar' | 'chat-link' | 'external-link';

export type RightPaneCodeTarget = {
  type: 'code';
  filePath: string;
  fileName: string;
  projectName?: string;
  diffInfo?: CodeEditorDiffInfo | null;
};

export type RightPaneMarkdownTarget = {
  type: 'markdown';
  filePath: string;
  fileName: string;
  projectName?: string;
};

export type RightPaneMarkdownDraftTarget = {
  type: 'markdown-draft';
  filePath: string;
  fileName: string;
  projectName?: string;
  content?: string;
  statusText?: string;
  sourceSessionId?: string | null;
};

export type RightPaneVisualHtmlTarget = {
  type: 'visual-html';
  filePath: string;
  fileName: string;
  projectName?: string;
};

export type RightPaneBrowserTarget = {
  type: 'browser';
  url: string;
  source: RightPaneBrowserSource;
  filePath?: string;
  title?: string;
};

export type RightPaneGitCommitTarget = {
  type: 'git-commit';
  commitHash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  diff: string;
  projectName?: string;
};

export type RightPaneTarget =
  | RightPaneCodeTarget
  | RightPaneMarkdownTarget
  | RightPaneMarkdownDraftTarget
  | RightPaneVisualHtmlTarget
  | RightPaneBrowserTarget
  | RightPaneGitCommitTarget;

export type RightPaneTab = {
  id: string;
  target: RightPaneTarget;
  isFresh?: boolean;
};

export function createClosedRightPaneState() {
  return {
    tabs: [] as RightPaneTab[],
    activeTabId: null as string | null,
    rightPaneTarget: null as RightPaneTarget | null,
    isVisible: false,
    editorExpanded: false,
  };
}
