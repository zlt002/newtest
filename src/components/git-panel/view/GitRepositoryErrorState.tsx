import { GitBranch } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { translateGitErrorText } from '../utils/gitPanelErrorText';

type GitRepositoryErrorStateProps = {
  error: string;
  details?: string;
};

export default function GitRepositoryErrorState({ error, details }: GitRepositoryErrorStateProps) {
  const { t } = useTranslation('gitPanel');
  const translatedError = translateGitErrorText(error, t);
  const translatedDetails = translateGitErrorText(details, t);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-muted-foreground">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50">
        <GitBranch className="h-8 w-8 opacity-40" />
      </div>
      <h3 className="mb-3 text-center text-lg font-medium text-foreground">{translatedError}</h3>
      {translatedDetails && (
        <p className="mb-6 max-w-md text-center text-sm leading-relaxed">{translatedDetails}</p>
      )}
      <div className="max-w-md rounded-xl border border-primary/10 bg-primary/5 p-4">
        <p className="text-center text-sm text-primary">
          <strong>{t('repositoryError.tipLabel')}:</strong> {t('repositoryError.tip')}{' '}
          <code className="rounded-md bg-primary/10 px-2 py-1 font-mono text-xs">git init</code>
        </p>
      </div>
    </div>
  );
}
