type PreviewDependencyInput = {
  document: {
    querySelectorAll(selector: string): ArrayLike<{
      getAttribute(name: string): string | null;
    }>;
  };
  previewUrl: string;
  projectPath: string;
};

type FileChangeRefreshInput = {
  previewFilePath: string;
  dependencyPaths: string[];
  changedFilePath: string;
};

const PREVIEW_ROUTE_SEGMENT = '/preview/';

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
}

function normalizeFilePath(value: string): string {
  return normalizePath(value).replace(/\/$/, '');
}

function joinProjectPath(projectPath: string, relativePath: string): string {
  const normalizedProjectPath = normalizePath(projectPath);
  const normalizedRelativePath = relativePath.replace(/^\/+/, '');

  if (!normalizedRelativePath) {
    return normalizedProjectPath;
  }

  return `${normalizedProjectPath}/${normalizedRelativePath}`;
}

function getPreviewRoutePrefix(previewUrl: string): string | null {
  try {
    const { pathname } = new URL(previewUrl);
    const previewIndex = pathname.indexOf(PREVIEW_ROUTE_SEGMENT);

    if (previewIndex === -1) {
      return null;
    }

    return pathname.slice(0, previewIndex + PREVIEW_ROUTE_SEGMENT.length);
  } catch {
    return null;
  }
}

function resolvePreviewResourcePath({
  resourceUrl,
  previewUrl,
  projectPath,
}: {
  resourceUrl: string;
  previewUrl: string;
  projectPath: string;
}): string | null {
  try {
    const preview = new URL(previewUrl);
    const resolvedResource = new URL(resourceUrl, preview);

    if (resolvedResource.origin !== preview.origin) {
      return null;
    }

    const previewRoutePrefix = getPreviewRoutePrefix(previewUrl);
    if (!previewRoutePrefix || !resolvedResource.pathname.startsWith(previewRoutePrefix)) {
      return null;
    }

    const relativePath = resolvedResource.pathname.slice(previewRoutePrefix.length);
    if (!relativePath) {
      return null;
    }

    const decodedRelativePath = (() => {
      try {
        return decodeURIComponent(relativePath);
      } catch {
        return relativePath;
      }
    })();

    return normalizeFilePath(joinProjectPath(projectPath, decodedRelativePath));
  } catch {
    return null;
  }
}

function collectSelectorValues(
  document: PreviewDependencyInput['document'],
  selector: string,
  attributeName: string,
): string[] {
  const nodes = Array.from(document.querySelectorAll(selector));
  const values: string[] = [];

  for (const node of nodes) {
    const value = node.getAttribute(attributeName)?.trim();
    if (value) {
      values.push(value);
    }
  }

  return values;
}

export function collectPreviewDependencyPaths({
  document,
  previewUrl,
  projectPath,
}: PreviewDependencyInput): string[] {
  const dependencyPaths = new Set<string>();

  for (const href of collectSelectorValues(document, 'link[rel~="stylesheet"][href]', 'href')) {
    const resolvedPath = resolvePreviewResourcePath({
      resourceUrl: href,
      previewUrl,
      projectPath,
    });
    if (resolvedPath) {
      dependencyPaths.add(resolvedPath);
    }
  }

  for (const src of collectSelectorValues(document, 'script[src]', 'src')) {
    const resolvedPath = resolvePreviewResourcePath({
      resourceUrl: src,
      previewUrl,
      projectPath,
    });
    if (resolvedPath) {
      dependencyPaths.add(resolvedPath);
    }
  }

  return Array.from(dependencyPaths);
}

export function shouldRefreshPreviewForFileChange({
  previewFilePath,
  dependencyPaths,
  changedFilePath,
}: FileChangeRefreshInput): boolean {
  const normalizedChangedFilePath = normalizeFilePath(changedFilePath);
  const normalizedPreviewFilePath = normalizeFilePath(previewFilePath);

  if (!normalizedChangedFilePath || !normalizedPreviewFilePath) {
    return false;
  }

  if (normalizedChangedFilePath === normalizedPreviewFilePath) {
    return true;
  }

  return dependencyPaths.some((dependencyPath) => normalizeFilePath(dependencyPath) === normalizedChangedFilePath);
}
