type FileOpenPayloadItem = {
  type: 'file' | 'directory';
  name: string;
  path: string;
};

export function getFileOpenPayload({
  item,
}: {
  item: FileOpenPayloadItem;
}) {
  return {
    filePath: item.path,
  };
}
