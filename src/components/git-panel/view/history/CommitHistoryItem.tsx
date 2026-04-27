import type { GitCommitSummary } from '../../types/types';

type CommitHistoryItemProps = {
  commit: GitCommitSummary;
  onOpen?: () => void | Promise<void>;
};

export default function CommitHistoryItem({
  commit,
  onOpen,
}: CommitHistoryItemProps) {
  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        className="flex w-full cursor-pointer items-start border-0 bg-transparent p-3 text-left transition-colors hover:bg-accent/50"
        onClick={() => {
          void onOpen?.();
        }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{commit.message}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {commit.author}
                {' \u2022 '}
                {commit.date}
              </p>
            </div>
            <span className="flex-shrink-0 font-mono text-sm text-muted-foreground/60">
              {commit.hash.substring(0, 7)}
            </span>
          </div>
        </div>
      </button>
    </div>
  );
}
