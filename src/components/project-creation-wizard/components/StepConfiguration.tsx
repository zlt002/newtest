import { useTranslation } from 'react-i18next';
import WorkspacePathField from './WorkspacePathField';

type StepConfigurationProps = {
  workspacePath: string;
  droppedFolderName?: string;
  isCreating: boolean;
  onWorkspacePathChange: (workspacePath: string) => void;
};

export default function StepConfiguration({
  workspacePath,
  droppedFolderName = '',
  isCreating,
  onWorkspacePathChange,
}: StepConfigurationProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div>
        {droppedFolderName && !workspacePath.trim() && (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <div className="font-medium">{t('projectWizard.step1.droppedFolderDetected', { name: droppedFolderName })}</div>
            <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              {t('projectWizard.step1.droppedFolderHint')}
            </div>
          </div>
        )}

        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('projectWizard.step1.pathLabel')}
        </label>

        <WorkspacePathField
          value={workspacePath}
          disabled={isCreating}
          onChange={onWorkspacePathChange}
        />

        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {t('projectWizard.step1.pathHelp')}
        </p>
      </div>
    </div>
  );
}
