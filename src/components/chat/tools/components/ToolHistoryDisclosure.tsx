import React from 'react';

export interface ToolHistoryDisclosureEntry {
  id: string;
  title: string;
  detail?: string;
  status?: 'queued' | 'running' | 'waiting' | 'completed' | 'failed';
}

interface ToolHistoryDisclosureProps {
  title?: string;
  entries: ToolHistoryDisclosureEntry[];
  emptyLabel?: string;
  defaultOpen?: boolean;
}

function getStatusTone(status: ToolHistoryDisclosureEntry['status']) {
  switch (status) {
    case 'completed':
      return 'bg-green-400 dark:bg-green-500';
    case 'failed':
      return 'bg-red-400 dark:bg-red-500';
    case 'running':
      return 'bg-amber-400 dark:bg-amber-500';
    case 'waiting':
      return 'bg-blue-400 dark:bg-blue-500';
    default:
      return 'bg-gray-300 dark:bg-gray-600';
  }
}

export const ToolHistoryDisclosure: React.FC<ToolHistoryDisclosureProps> = ({
  title = '工具日志',
  entries,
  emptyLabel = '暂无日志',
  defaultOpen = false,
}) => {
  if (entries.length === 0) {
    return (
      <div className="text-[11px] text-gray-400 dark:text-gray-500">
        {emptyLabel}
      </div>
    );
  }

  return (
    <details className="group/tool-history-disclosure" open={defaultOpen}>
      <summary className="flex cursor-pointer items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300">
        <svg
          className="h-2.5 w-2.5 flex-shrink-0 transition-transform duration-150 group-open/tool-history-disclosure:rotate-90"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span>{title}（{entries.length}）</span>
      </summary>
      <div className="mt-2 space-y-1.5 border-l border-gray-200 pl-3 dark:border-gray-700">
        {entries.map((entry, index) => (
          <div key={entry.id} className="flex items-start gap-2 text-[11px] text-gray-500 dark:text-gray-400">
            <span className="mt-[3px] w-4 flex-shrink-0 text-right text-gray-400 dark:text-gray-500">{index + 1}.</span>
            <span className={`mt-1 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full ${getStatusTone(entry.status)}`} />
            <div className="min-w-0 flex-1">
              <div className="break-words text-gray-700 dark:text-gray-200">{entry.title}</div>
              {entry.detail && (
                <div className="break-words font-mono text-gray-400 dark:text-gray-500">
                  {entry.detail}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
};
