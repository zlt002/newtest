import { useMemo } from 'react';
import type { RightPaneGitCommitTarget } from '../types';
import GitDiffViewer from '../../git-panel/view/shared/GitDiffViewer';
import { parseCommitFiles } from '../../git-panel/utils/gitPanelUtils';

type GitCommitPaneProps = {
  target: RightPaneGitCommitTarget;
  onClosePane: () => void;
};

export default function GitCommitPane({ target, onClosePane }: GitCommitPaneProps) {
  const fileSummary = useMemo(() => parseCommitFiles(target.diff), [target.diff]);

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-background"
      data-right-pane-view="git-commit"
      data-right-pane-commit-hash={target.commitHash}
    >
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-foreground">{target.message}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-mono">{target.shortHash}</span>
              <span>{target.author}</span>
              <span>{target.date}</span>
              {target.projectName ? <span>{target.projectName}</span> : null}
            </div>
          </div>
          <button
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            data-right-pane-close="true"
            onClick={onClosePane}
            type="button"
          >
            Close
          </button>
        </div>
        <div className="mt-3 flex gap-4 rounded-md bg-muted/70 px-3 py-2 text-xs text-muted-foreground">
          <span>
            文件 <span className="font-semibold text-foreground">{fileSummary.totalFiles}</span>
          </span>
          <span>
            新增 <span className="font-semibold text-green-600 dark:text-green-400">+{fileSummary.totalInsertions}</span>
          </span>
          <span>
            删除 <span className="font-semibold text-red-600 dark:text-red-400">-{fileSummary.totalDeletions}</span>
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="p-3">
          <GitDiffViewer diff={target.diff} isMobile={false} wrapText />
        </div>
      </div>
    </div>
  );
}
