import type { RightPaneTarget } from '../types';

export function getRightPaneTargetIdentity(target: RightPaneTarget | null): string {
  if (!target) {
    return 'none';
  }

  if (target.type === 'browser') {
    return `browser:${target.url}`;
  }

  if (target.type === 'git-commit') {
    return `git-commit:${target.commitHash}`;
  }

  if (target.type === 'markdown-draft') {
    return `markdown:${target.filePath}`;
  }

  return `${target.type}:${target.filePath}`;
}
