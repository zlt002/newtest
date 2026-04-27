import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FileStatusCode } from '../../types/types';
import { getStatusBadgeClass, getStatusLabel } from '../../utils/gitPanelUtils';

type FileChangeItemProps = {
  filePath: string;
  status: FileStatusCode;
  isMobile: boolean;
  isSelected: boolean;
  onToggleSelected: (filePath: string) => void;
  onOpenFile: (filePath: string) => void;
  onRequestFileAction: (filePath: string, status: FileStatusCode) => void;
};

export default function FileChangeItem({
  filePath,
  status,
  isMobile,
  isSelected,
  onToggleSelected,
  onOpenFile,
  onRequestFileAction,
}: FileChangeItemProps) {
  const { t } = useTranslation('gitPanel');
  const statusLabel = getStatusLabel(status, t);
  const badgeClass = getStatusBadgeClass(status);

  return (
    <div className="border-b border-border last:border-0">
      <div className={`flex items-center transition-colors hover:bg-accent/50 ${isMobile ? 'px-2 py-1.5' : 'px-3 py-2'}`}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelected(filePath)}
          onClick={(event) => event.stopPropagation()}
          className={`rounded border-border bg-background text-primary checked:bg-primary focus:ring-primary/40 ${isMobile ? 'mr-1.5' : 'mr-2'}`}
        />

        <div
          className="flex min-w-0 flex-1 cursor-pointer items-center"
          onClick={(event) => {
            event.stopPropagation();
            onOpenFile(filePath);
          }}
          title={t('fileChange.clickToOpenFile')}
        >
          <span
            className={`flex-1 truncate ${isMobile ? 'text-xs' : 'text-sm'} cursor-pointer hover:text-primary hover:underline`}
            onClick={(event) => {
              event.stopPropagation();
              onOpenFile(filePath);
            }}
          >
            {filePath}
          </span>

          <span className="flex items-center gap-1">
            {(status === 'M' || status === 'D' || status === 'U') && (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onRequestFileAction(filePath, status);
                }}
                className={`${isMobile ? 'px-2 py-1 text-xs' : 'p-1'} flex items-center gap-1 rounded font-medium text-destructive hover:bg-destructive/10`}
                title={status === 'U' ? t('fileChange.deleteUntrackedFile') : t('fileChange.discardChanges')}
              >
                <Trash2 className="h-3 w-3" />
                {isMobile && <span>{status === 'U' ? t('fileChange.delete') : t('fileChange.discard')}</span>}
              </button>
            )}

            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded border text-[10px] font-bold ${badgeClass}`}
              title={statusLabel}
            >
              {status}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
