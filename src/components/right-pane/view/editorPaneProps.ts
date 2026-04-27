import type { CodeEditorFile } from '../../code-editor/types/types';
import type { RightPaneTarget } from '../types';

type EditorPaneTarget = Extract<RightPaneTarget, { type: 'code' | 'markdown' | 'visual-html' }>;

type CreateEditorPanePropsParams = {
  target: EditorPaneTarget;
  projectPath?: string;
  onClosePane: () => void;
  onTogglePaneExpand?: (() => void) | null;
  onAppendToChatInput?: ((text: string) => void) | null;
  onPopOut?: (() => void) | null;
  isExpanded?: boolean;
  isSidebar?: boolean;
};

type EditorPaneProps = {
  file: CodeEditorFile;
  onClose: () => void;
  projectPath?: string;
  isSidebar: boolean;
  isExpanded: boolean;
  onToggleExpand: (() => void) | null;
  onPopOut: (() => void) | null;
  onAppendToChatInput: ((text: string) => void) | null;
};

function createEditorPaneFile(target: EditorPaneTarget): CodeEditorFile {
  const file: CodeEditorFile = {
    name: target.fileName,
    path: target.filePath,
    projectName: target.projectName,
  };

  if (target.type === 'code') {
    file.diffInfo = target.diffInfo;
  }

  return file;
}

export function createEditorPaneProps({
  target,
  projectPath,
  onClosePane,
  onTogglePaneExpand = null,
  onAppendToChatInput = null,
  onPopOut = null,
  isExpanded = false,
  isSidebar = true,
}: CreateEditorPanePropsParams): EditorPaneProps {
  return {
    file: createEditorPaneFile(target),
    onClose: onClosePane,
    projectPath,
    isSidebar,
    isExpanded,
    onToggleExpand: onTogglePaneExpand,
    onPopOut,
    onAppendToChatInput,
  };
}
