import { History, RefreshCw } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { GitDiffMap, GitCommitSummary } from '../../types/types';
import CommitHistoryItem from './CommitHistoryItem';

type HistoryViewProps = {
  isMobile: boolean;
  isLoading: boolean;
  recentCommits: GitCommitSummary[];
  commitDiffs: GitDiffMap;
  onFetchCommitDiff: (commitHash: string) => Promise<string | null>;
  onOpenCommitPreview?: (commit: GitCommitSummary, diff: string) => void;
};

export default function HistoryView({
  isMobile,
  isLoading,
  recentCommits,
  commitDiffs,
  onFetchCommitDiff,
  onOpenCommitPreview,
}: HistoryViewProps) {
  const { t } = useTranslation('gitPanel');

  const handleCommitOpen = useCallback(
    async (commit: GitCommitSummary) => {
      const diff = commitDiffs[commit.hash] ?? await onFetchCommitDiff(commit.hash);
      if (!diff) {
        return;
      }

      onOpenCommitPreview?.(commit, diff);
    },
    [commitDiffs, onFetchCommitDiff, onOpenCommitPreview],
  );

  return (
    <div className={`flex-1 overflow-y-auto ${isMobile ? 'pb-mobile-nav' : ''}`}>
      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : recentCommits.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center text-muted-foreground">
          <History className="mb-2 h-10 w-10 opacity-40" />
          <p className="text-sm">{t('emptyState.noHistory')}</p>
        </div>
      ) : (
        <div className={isMobile ? 'pb-4' : ''}>
          {recentCommits.map((commit) => (
            <CommitHistoryItem
              key={commit.hash}
              commit={commit}
              onOpen={() => void handleCommitOpen(commit)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
