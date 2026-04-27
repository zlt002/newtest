type TranslateFn = (key: string) => string;

export function translateGitErrorText(text: string | undefined | null, t: TranslateFn): string | undefined | null {
  if (!text) {
    return text;
  }

  if (text === 'Git operation failed' || text === 'Project directory is not a git repository') {
    return t('repositoryError.errors.gitOperationFailed');
  }

  if (text.startsWith('Failed to get git status:')) {
    const detail = text.slice('Failed to get git status:'.length).trim();
    return `${t('repositoryError.errors.failedToGetStatus')}: ${translateGitErrorText(detail, t)}`;
  }

  if (
    text.includes('Not a git repository.')
    || text.includes('This directory does not contain a .git folder.')
    || text.toLowerCase().includes('not a git repository')
  ) {
    return t('repositoryError.errors.notGitRepository');
  }

  return text;
}
