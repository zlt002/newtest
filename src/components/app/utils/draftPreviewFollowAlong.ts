import type { DraftPreviewEvent } from '@hooks/chat/chatDraftPreviewEvents';

type DraftPreviewRightPaneTarget =
  | {
      type: 'code';
      filePath: string;
    }
  | {
      type: 'markdown';
      filePath: string;
    }
  | {
      type: 'visual-html';
      filePath: string;
    }
  | {
      type: 'browser';
      filePath?: string;
      source?: string;
    }
  | {
      type: 'git-commit';
    }
  | null;

type DraftPreviewResolvedTarget =
  | {
      type: 'code';
      filePath: string;
      fileName: string;
      projectName?: string;
    }
  | {
      type: 'markdown';
      filePath: string;
      fileName: string;
      projectName?: string;
    }
  | {
      type: 'visual-html';
      filePath: string;
      fileName: string;
      projectName?: string;
    };

type DraftPreviewFollowAlongDecision = {
  supportsDraftPreview: boolean;
  shouldOpenTarget: boolean;
  target: DraftPreviewResolvedTarget | null;
};

const MARKDOWN_FILE_PATTERN = /\.(md|markdown)$/i;
const HTML_FILE_PATTERN = /\.html?$/i;

function getFileName(filePath: string) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return normalizedPath.split('/').pop() || filePath;
}

function resolveDraftPreviewTarget(filePath: string, projectName?: string): DraftPreviewResolvedTarget {
  if (HTML_FILE_PATTERN.test(filePath)) {
    return {
      type: 'visual-html',
      filePath,
      fileName: getFileName(filePath),
      projectName,
    };
  }

  if (MARKDOWN_FILE_PATTERN.test(filePath)) {
    return {
      type: 'markdown',
      filePath,
      fileName: getFileName(filePath),
      projectName,
    };
  }

  return {
    type: 'code',
    filePath,
    fileName: getFileName(filePath),
    projectName,
  };
}

function isPreviewCapableTarget(target: DraftPreviewRightPaneTarget) {
  return target?.type === 'code' || target?.type === 'markdown';
}

function isSamePreviewTarget(
  rightPaneTarget: DraftPreviewRightPaneTarget,
  filePath: string,
) {
  return isPreviewCapableTarget(rightPaneTarget) && rightPaneTarget.filePath === filePath;
}

export function getDraftPreviewFollowAlongDecision({
  event,
  rightPaneTarget,
  projectName,
}: {
  event: DraftPreviewEvent;
  rightPaneTarget: DraftPreviewRightPaneTarget;
  projectName?: string;
}): DraftPreviewFollowAlongDecision {
  const target = resolveDraftPreviewTarget(event.filePath, projectName);

  const supportsDraftPreview = target.type === 'code' || target.type === 'markdown';
  if (!supportsDraftPreview) {
    return {
      supportsDraftPreview: false,
      shouldOpenTarget: false,
      target,
    };
  }

  const shouldOpenTarget = (
    (target.type === 'markdown' || target.type === 'code')
    && (event.type === 'file_change_preview_delta' || event.type === 'file_change_preview_committed')
    && !isSamePreviewTarget(rightPaneTarget, event.filePath)
  );

  return {
    supportsDraftPreview: true,
    shouldOpenTarget,
    target,
  };
}
