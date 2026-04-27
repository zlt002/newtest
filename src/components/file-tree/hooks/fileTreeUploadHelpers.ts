type ClipboardLike = {
  items?: ArrayLike<{
    kind?: string;
    type?: string;
    getAsFile?: () => File | null;
  }>;
  files?: ArrayLike<File>;
};

function inferExtensionFromMimeType(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/svg+xml':
      return 'svg';
    default:
      return 'bin';
  }
}

export function createPastedFileName(mimeType: string): string {
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('') + '-' + [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');

  return `pasted-image-${timestamp}.${inferExtensionFromMimeType(mimeType)}`;
}

function normalizeClipboardFile(file: File): File {
  if (file.name && file.name.trim()) {
    return file;
  }

  return new File([file], createPastedFileName(file.type || 'application/octet-stream'), {
    type: file.type,
    lastModified: file.lastModified || Date.now(),
  });
}

export function extractClipboardFiles(clipboardData: ClipboardLike | null | undefined): File[] {
  if (!clipboardData) {
    return [];
  }

  const itemFiles = Array.from(clipboardData.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile?.())
    .filter((file): file is File => Boolean(file))
    .map(normalizeClipboardFile);

  if (itemFiles.length > 0) {
    return itemFiles;
  }

  return Array.from(clipboardData.files ?? []).map(normalizeClipboardFile);
}

export function buildUploadFormData(files: File[], targetPath: string): FormData {
  const formData = new FormData();
  formData.append('targetPath', targetPath);

  const relativePaths: string[] = [];
  files.forEach((file) => {
    const cleanFile = new File([file], file.name.split('/').pop()!, {
      type: file.type,
      lastModified: file.lastModified,
    });
    formData.append('files', cleanFile);
    relativePaths.push(file.name);
  });

  formData.append('relativePaths', JSON.stringify(relativePaths));
  return formData;
}

export function shouldHandleTreePaste(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) {
    return true;
  }

  const tagName = target.tagName.toUpperCase();
  return !target.isContentEditable && tagName !== 'INPUT' && tagName !== 'TEXTAREA' && tagName !== 'SELECT';
}
