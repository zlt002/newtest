export function resolveTokenUsageProjectName({
  selectedProjectName,
  sessionProjectName,
}: {
  selectedProjectName: string | null | undefined;
  sessionProjectName: string | null | undefined;
}): string | null {
  const normalizedSelectedProjectName = selectedProjectName?.trim() || '';
  const normalizedSessionProjectName = sessionProjectName?.trim() || '';

  if (!normalizedSelectedProjectName) {
    return null;
  }

  if (!normalizedSessionProjectName) {
    return normalizedSelectedProjectName;
  }

  if (normalizedSessionProjectName !== normalizedSelectedProjectName) {
    return null;
  }

  return normalizedSessionProjectName;
}
