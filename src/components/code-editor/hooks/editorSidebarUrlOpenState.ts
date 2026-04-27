import type { CodeEditorFile } from '../types/types';
import type { RightPaneBrowserSource, RightPaneTarget } from '../../right-pane/types';

type CreateUrlOpenStateParams = {
  url: string;
  source?: RightPaneBrowserSource;
  editorExpanded?: boolean;
};

type EditorSidebarUrlOpenState = {
  editingFile: CodeEditorFile | null;
  rightPaneTarget: RightPaneTarget;
  editorExpanded: boolean;
};

export function shouldFocusCodeTarget(target: RightPaneTarget | null, filePath: string) {
  return target?.type === 'code' && target.filePath === filePath;
}

export function createUrlOpenState({
  url,
  source = 'external-link',
  editorExpanded = false,
}: CreateUrlOpenStateParams): EditorSidebarUrlOpenState {
  const normalizedUrl = normalizeUrlForBrowserTarget(url);

  return {
    editingFile: null,
    rightPaneTarget: {
      type: 'browser',
      url: normalizedUrl,
      source,
    },
    editorExpanded,
  };
}

function normalizeUrlForBrowserTarget(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error('Invalid browser URL');
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(trimmed)) {
    return `http://${trimmed}`;
  }

  throw new Error('Invalid browser URL');
}
