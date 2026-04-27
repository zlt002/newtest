type DragEntryLike = {
  isDirectory?: boolean;
  isFile?: boolean;
  name?: string;
  fullPath?: string;
};

type DragItemLike = {
  kind?: string;
  webkitGetAsEntry?: () => DragEntryLike | null;
};

type DragFileLike = {
  name?: string;
  type?: string;
};

type FolderDropSource = {
  items?: ArrayLike<DragItemLike> | null;
  files?: ArrayLike<DragFileLike> | null;
};

export type DroppedFolder = {
  name: string;
  relativePath: string | null;
};

export async function extractDroppedFolder(source: FolderDropSource): Promise<DroppedFolder | null> {
  const items = source.items ? Array.from(source.items) : [];

  for (const item of items) {
    if (item.kind !== 'file') {
      continue;
    }

    const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
    if (!entry || !entry.isDirectory || !entry.name) {
      continue;
    }

    return {
      name: entry.name,
      relativePath: typeof entry.fullPath === 'string' && entry.fullPath.trim() ? entry.fullPath : null,
    };
  }

  const files = source.files ? Array.from(source.files) : [];
  const folderLikeFile = files.find((file) => file.type === '' && file.name);
  if (!folderLikeFile?.name) {
    return null;
  }

  return {
    name: folderLikeFile.name,
    relativePath: null,
  };
}
