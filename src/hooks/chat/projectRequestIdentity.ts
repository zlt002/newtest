interface ProjectRequestLike {
  name?: string | null;
  path?: string | null;
  fullPath?: string | null;
}

export function resolveProjectRequestName(project: ProjectRequestLike | null | undefined): string {
  return typeof project?.name === 'string' ? project.name.trim() : '';
}

export function resolveProjectRequestPath(project: ProjectRequestLike | null | undefined): string {
  if (typeof project?.fullPath === 'string' && project.fullPath.trim()) {
    return project.fullPath.trim();
  }

  if (typeof project?.path === 'string' && project.path.trim()) {
    return project.path.trim();
  }

  return '';
}

export function getProjectRequestIdentity(project: ProjectRequestLike | null | undefined): string {
  const name = resolveProjectRequestName(project);
  const path = resolveProjectRequestPath(project);

  if (!name && !path) {
    return '';
  }

  return `${name}::${path}`;
}
