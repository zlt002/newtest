import { FILE_STATUS_GROUPS } from '../../constants/constants';
import type { FileStatusCode, GitStatusResponse } from '../../types/types';
import FileChangeItem from './FileChangeItem';

type FileChangeListProps = {
  gitStatus: GitStatusResponse;
  selectedFiles: Set<string>;
  isMobile: boolean;
  filePaths?: Set<string>;
  onToggleSelected: (filePath: string) => void;
  onOpenFile: (filePath: string) => void;
  onRequestFileAction: (filePath: string, status: FileStatusCode) => void;
};

export default function FileChangeList({
  gitStatus,
  selectedFiles,
  isMobile,
  filePaths,
  onToggleSelected,
  onOpenFile,
  onRequestFileAction,
}: FileChangeListProps) {
  return (
    <>
      {FILE_STATUS_GROUPS.map(({ key, status }) =>
        (gitStatus[key] || [])
          .filter((filePath) => !filePaths || filePaths.has(filePath))
          .map((filePath) => (
            <FileChangeItem
              key={filePath}
              filePath={filePath}
              status={status}
              isMobile={isMobile}
              isSelected={selectedFiles.has(filePath)}
              onToggleSelected={onToggleSelected}
              onOpenFile={onOpenFile}
              onRequestFileAction={onRequestFileAction}
            />
          )),
      )}
    </>
  );
}
