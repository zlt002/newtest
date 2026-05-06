import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../../lib/utils';
import type { FileTreeSortConfig, FileTreeSortKey } from '../types/types';

type FileTreeDetailedColumnsProps = {
  sortConfig: FileTreeSortConfig;
  onSortChange: (key: FileTreeSortKey) => void;
};

type DetailedColumn = {
  key: FileTreeSortKey;
  label: string;
  className: string;
};

export default function FileTreeDetailedColumns({
  sortConfig,
  onSortChange,
}: FileTreeDetailedColumnsProps) {
  const { t } = useTranslation();
  const columns: DetailedColumn[] = [
    { key: 'name', label: t('fileTree.name'), className: 'col-span-6' },
    { key: 'size', label: t('fileTree.size'), className: 'col-span-2' },
    { key: 'modified', label: t('fileTree.modified'), className: 'col-span-2' },
  ];

  return (
    <div className="border-b border-border px-3 pb-1 pt-1.5">
      <div className="grid grid-cols-10 gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {columns.map((column) => {
          const isActive = sortConfig.key === column.key;
          const nextDirection =
            isActive && sortConfig.direction === 'asc' ? 'descending' : 'ascending';
          const SortIcon = isActive
            ? sortConfig.direction === 'asc'
              ? ArrowUp
              : ArrowDown
            : ChevronsUpDown;

          return (
            <div key={column.key} className={column.className}>
              <button
                type="button"
                className={cn(
                  'inline-flex h-5 max-w-full items-center gap-1 rounded-sm text-left transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                  isActive && 'text-foreground',
                )}
                onClick={() => onSortChange(column.key)}
                aria-label={`${column.label} sort ${nextDirection}`}
              >
                <span className="truncate">{column.label}</span>
                <SortIcon className="h-3 w-3 flex-none" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
