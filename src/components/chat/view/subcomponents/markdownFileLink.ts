function getFileName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.split('/').pop() || filePath;
}

function normalizeFileUrlPath(pathname: string): string {
  const decoded = decodeURIComponent(pathname || '');
  if (/^\/[A-Za-z]:\//.test(decoded)) {
    return decoded.slice(1);
  }
  return decoded;
}

export function resolveMarkdownFileTarget(href?: string): { filePath: string; fileName: string } | null {
  const trimmedHref = String(href || '').trim();
  if (!trimmedHref || !/^file:\/\//i.test(trimmedHref)) {
    return null;
  }

  try {
    const parsed = new URL(trimmedHref);
    if (parsed.protocol !== 'file:') {
      return null;
    }

    const filePath = normalizeFileUrlPath(parsed.pathname);
    if (!filePath) {
      return null;
    }

    return {
      filePath,
      fileName: getFileName(filePath),
    };
  } catch {
    return null;
  }
}
