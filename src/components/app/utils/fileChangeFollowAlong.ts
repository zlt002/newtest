import type { FileChangeEvent } from '@hooks/chat/chatFileChangeEvents';

type FollowAlongRightPaneTarget =
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

type FollowAlongResolvedTarget =
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

type FileChangeFollowAlongDecision = {
  shouldOpenTarget: boolean;
  target: FollowAlongResolvedTarget | null;
};

const MARKDOWN_FILE_PATTERN = /\.(md|markdown)$/i;
const HTML_FILE_PATTERN = /\.html?$/i;

function getFileName(filePath: string) {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return normalizedPath.split('/').pop() || filePath;
}

function resolveFollowAlongTarget(filePath: string, projectName?: string): FollowAlongResolvedTarget {
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

function isPreviewCapableTarget(target: FollowAlongRightPaneTarget) {
  return target?.type === 'code' || target?.type === 'markdown' || target?.type === 'visual-html';
}

export function getFileChangeFollowAlongDecision({
  event,
  rightPaneTarget,
  isRightPaneVisible,
  projectName,
}: {
  event: FileChangeEvent;
  rightPaneTarget: FollowAlongRightPaneTarget;
  isRightPaneVisible: boolean;
  projectName?: string;
}): FileChangeFollowAlongDecision {
  const target = resolveFollowAlongTarget(event.filePath, projectName);

  const shouldOpenTarget = (
    event.type === 'focus_file_changed' &&
    (!isRightPaneVisible || !rightPaneTarget) &&
    target.type === 'markdown'
  ) || (
    event.type === 'focus_file_changed' &&
    isPreviewCapableTarget(rightPaneTarget) &&
    rightPaneTarget.filePath !== event.filePath &&
    target.type === 'markdown'
  );

  return {
    shouldOpenTarget,
    target,
  };
}
