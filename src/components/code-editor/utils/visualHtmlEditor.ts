import type { CodeEditorFile } from '../types/types';

export const VISUAL_HTML_OPEN_REQUEST_EVENT_NAME = 'ccui:visual-html-open-request';

const HTML_FILE_PATTERN = /\.html?$/i;

export function shouldShowVisualHtmlAction(file: Pick<CodeEditorFile, 'name' | 'diffInfo'>) {
  return HTML_FILE_PATTERN.test(file.name) && !file.diffInfo;
}

export function openVisualHtmlEditor({
  hasUnsavedChanges,
  persistedContent,
  filePath,
  projectName,
  confirm,
  setContent,
  dispatchEvent,
}: {
  hasUnsavedChanges: boolean;
  persistedContent: string;
  filePath: string;
  projectName?: string;
  confirm: (message: string) => boolean;
  setContent: (content: string) => void;
  dispatchEvent: (event: CustomEvent<{ filePath: string; projectName?: string }>) => void;
}) {
  if (hasUnsavedChanges) {
    const shouldDiscard = confirm('当前源码存在未保存修改，是否放弃这些改动并进入可视化编辑？');
    if (!shouldDiscard) {
      return false;
    }

    setContent(persistedContent);
  }

  dispatchEvent(new CustomEvent(VISUAL_HTML_OPEN_REQUEST_EVENT_NAME, {
    detail: {
      filePath,
      projectName,
    },
  }));

  return true;
}
