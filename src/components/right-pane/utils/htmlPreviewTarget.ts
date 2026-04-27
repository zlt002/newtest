const HTML_FILE_PATTERN = /\.html?$/i;

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
}

function ensureLeadingSlash(value: string): string {
  return value.startsWith('/') ? value : `/${value}`;
}

function getRuntimePreviewBaseUrl(): string | null {
  if (typeof window === 'undefined' || !window.location?.origin) {
    return null;
  }

  const origin = window.location.origin.trim();
  if (!/^https?:\/\//i.test(origin)) {
    return null;
  }

  return origin;
}

export function resolveHtmlPreviewTarget(
  filePath: string,
  {
    projectRoot,
    projectName,
    devServerUrl,
  }: {
    projectRoot?: string | null;
    projectName?: string | null;
    devServerUrl?: string | null;
  },
): string | null {
  if (!projectRoot || !projectName || !HTML_FILE_PATTERN.test(filePath)) {
    return null;
  }

  const previewBaseUrl = devServerUrl?.trim() || getRuntimePreviewBaseUrl();
  if (!previewBaseUrl) {
    return null;
  }

  const normalizedProjectRoot = normalizePath(projectRoot);
  const normalizedFilePath = filePath.replace(/\\/g, '/');
  const normalizedDevServerUrl = previewBaseUrl.replace(/\/+$/, '');
  const projectPrefix = `${normalizedProjectRoot}/`;

  if (
    normalizedFilePath !== normalizedProjectRoot &&
    !normalizedFilePath.startsWith(projectPrefix)
  ) {
    return null;
  }

  const relativePath =
    normalizedFilePath === normalizedProjectRoot
      ? ''
      : normalizedFilePath.slice(projectPrefix.length);

  if (!relativePath || relativePath.includes('/../') || relativePath.startsWith('../')) {
    return null;
  }

  return `${normalizedDevServerUrl}/api/projects/${encodeURIComponent(projectName)}/preview${ensureLeadingSlash(relativePath)}`;
}
