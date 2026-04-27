import type { CodeEditorDiffInfo } from '../../code-editor/types/types';
import type {
  RightPaneBrowserSource,
  RightPaneBrowserTarget,
  RightPaneCodeTarget,
  RightPaneTarget,
  RightPaneVisualHtmlTarget,
} from '../types';

const MARKDOWN_FILE_PATTERN = /\.(md|markdown)$/i;
const HTML_FILE_PATTERN = /\.html?$/i;

function getFileName(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return normalizedPath.split('/').pop() || filePath;
}

function isBrowserHostAddress(value: string): boolean {
  return /^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(value);
}

export function normalizeBrowserUrl(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error('Invalid browser URL');
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (isBrowserHostAddress(trimmed)) {
    return `http://${trimmed}`;
  }

  throw new Error('Invalid browser URL');
}

export function createCodeTarget({
  filePath,
  projectName,
  diffInfo = null,
}: {
  filePath: string;
  projectName?: string;
  diffInfo?: CodeEditorDiffInfo | null;
}): RightPaneCodeTarget {
  return {
    type: 'code',
    filePath,
    fileName: getFileName(filePath),
    projectName,
    diffInfo,
  };
}

export function createVisualHtmlTarget({
  filePath,
  projectName,
}: {
  filePath: string;
  projectName?: string;
}): RightPaneVisualHtmlTarget {
  return {
    type: 'visual-html',
    filePath,
    fileName: getFileName(filePath),
    projectName,
  };
}

export function createBrowserTarget({
  url,
  source,
  filePath,
  title,
}: {
  url: string;
  source: RightPaneBrowserSource;
  filePath?: string;
  title?: string;
}): RightPaneBrowserTarget;
export function createBrowserTarget({
  url,
  source,
  filePath,
  title,
}: {
  url: string;
  source: RightPaneBrowserSource;
  filePath?: string;
  title?: string;
}): RightPaneBrowserTarget {
  return {
    type: 'browser',
    url,
    source,
    filePath,
    title,
  };
}

export function resolveRightPaneTargetForFile(
  filePath: string,
  {
    projectName,
    diffInfo = null,
  }: {
    projectName?: string;
    diffInfo?: CodeEditorDiffInfo | null;
  } = {},
): RightPaneTarget {
  if (HTML_FILE_PATTERN.test(filePath)) {
    return createVisualHtmlTarget({
      filePath,
      projectName,
    });
  }

  if (MARKDOWN_FILE_PATTERN.test(filePath)) {
    return {
      type: 'markdown',
      filePath,
      fileName: getFileName(filePath),
      projectName,
    };
  }

  return createCodeTarget({
    filePath,
    projectName,
    diffInfo,
  });
}
