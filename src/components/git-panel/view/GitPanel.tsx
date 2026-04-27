import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGitPanelController } from '../hooks/useGitPanelController';
import { useRevertLocalCommit } from '../hooks/useRevertLocalCommit';
import type { ConfirmationRequest, GitPanelProps, GitPanelView } from '../types/types';
import { getChangedFileCount } from '../utils/gitPanelUtils';
import ChangesView from '../view/changes/ChangesView';
import HistoryView from '../view/history/HistoryView';
import BranchesView from '../view/branches/BranchesView';
import GitPanelHeader from '../view/GitPanelHeader';
import GitRepositoryErrorState from '../view/GitRepositoryErrorState';
import GitViewTabs from '../view/GitViewTabs';
import ConfirmActionModal from '../view/modals/ConfirmActionModal';

type EmbeddedGitPanelProps = GitPanelProps & {
  embedded?: boolean;
};

export default function GitPanel({
  selectedProject,
  isMobile = false,
  onFileOpen,
  onCommitPreviewOpen,
  embedded = false,
}: EmbeddedGitPanelProps) {
  const { t } = useTranslation(['gitPanel', 'sidebar']);
  const [activeView, setActiveView] = useState<GitPanelView>('changes');
  const [confirmAction, setConfirmAction] = useState<ConfirmationRequest | null>(null);

  const {
    gitStatus,
    gitDiff,
    isLoading,
    currentBranch,
    branches,
    localBranches,
    remoteBranches,
    recentCommits,
    commitDiffs,
    remoteStatus,
    isCreatingBranch,
    isFetching,
    isPulling,
    isPushing,
    isPublishing,
    isCreatingInitialCommit,
    operationError,
    clearOperationError,
    refreshAll,
    switchBranch,
    createBranch,
    deleteBranch,
    handleFetch,
    handlePull,
    handlePush,
    handlePublish,
    discardChanges,
    deleteUntrackedFile,
    fetchCommitDiff,
    generateCommitMessage,
    commitChanges,
    createInitialCommit,
    openFile,
  } = useGitPanelController({
    selectedProject,
    activeView,
    onFileOpen,
  });

  const { isRevertingLocalCommit, revertLatestLocalCommit } = useRevertLocalCommit({
    projectName: selectedProject?.name ?? null,
    onSuccess: refreshAll,
  });

  const executeConfirmedAction = useCallback(async () => {
    if (!confirmAction) return;
    const actionToExecute = confirmAction;
    setConfirmAction(null);
    try {
      await actionToExecute.onConfirm();
    } catch (error) {
      console.error('Error executing confirmation action:', error);
    }
  }, [confirmAction]);

  const changeCount = getChangedFileCount(gitStatus);

  if (!selectedProject) {
    return (
      <div className={`flex min-h-full items-center justify-center ${embedded ? 'px-3 py-4' : 'px-4 py-6'} text-muted-foreground`}>
        <div className="workspace-placeholder-card w-full max-w-sm rounded-2xl border border-border/70 bg-card/80 p-5 shadow-sm">
          <div className="mb-3 inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {t('sidebar:workspace.git')}
          </div>
          <h2 className="text-base font-semibold text-foreground">
            {t('sidebar:workspace.selectProjectTitle')}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t('sidebar:workspace.selectProjectDescription')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-full flex-col ${embedded ? 'bg-transparent' : 'bg-background'}`}>
      <GitPanelHeader
        isMobile={isMobile}
        embedded={embedded}
        currentBranch={currentBranch}
        branches={branches}
        remoteStatus={remoteStatus}
        isLoading={isLoading}
        isCreatingBranch={isCreatingBranch}
        isFetching={isFetching}
        isPulling={isPulling}
        isPushing={isPushing}
        isPublishing={isPublishing}
        isRevertingLocalCommit={isRevertingLocalCommit}
        operationError={operationError}
        onRefresh={refreshAll}
        onRevertLocalCommit={revertLatestLocalCommit}
        onSwitchBranch={switchBranch}
        onCreateBranch={createBranch}
        onFetch={handleFetch}
        onPull={handlePull}
        onPush={handlePush}
        onPublish={handlePublish}
        onClearError={clearOperationError}
        onRequestConfirmation={setConfirmAction}
      />

      {gitStatus?.error ? (
        <GitRepositoryErrorState error={gitStatus.error} details={gitStatus.details} />
      ) : (
        <>
          <GitViewTabs
            activeView={activeView}
            isHidden={false}
            changeCount={changeCount}
            onChange={setActiveView}
          />

          {activeView === 'changes' && (
            <ChangesView
              key={selectedProject.fullPath}
              isMobile={isMobile}
              projectPath={selectedProject.fullPath}
              gitStatus={gitStatus}
              isLoading={isLoading}
              isCreatingInitialCommit={isCreatingInitialCommit}
              onCreateInitialCommit={createInitialCommit}
              onOpenFile={openFile}
              onDiscardFile={discardChanges}
              onDeleteFile={deleteUntrackedFile}
              onCommitChanges={commitChanges}
              onGenerateCommitMessage={generateCommitMessage}
              onRequestConfirmation={setConfirmAction}
            />
          )}

          {activeView === 'history' && (
            <HistoryView
              isMobile={isMobile}
              isLoading={isLoading}
              recentCommits={recentCommits}
              commitDiffs={commitDiffs}
              onFetchCommitDiff={fetchCommitDiff}
              onOpenCommitPreview={onCommitPreviewOpen}
            />
          )}

          {activeView === 'branches' && (
            <BranchesView
              isMobile={isMobile}
              isLoading={isLoading}
              currentBranch={currentBranch}
              localBranches={localBranches}
              remoteBranches={remoteBranches}
              remoteStatus={remoteStatus}
              isCreatingBranch={isCreatingBranch}
              onSwitchBranch={switchBranch}
              onCreateBranch={createBranch}
              onDeleteBranch={deleteBranch}
              onRequestConfirmation={setConfirmAction}
            />
          )}
        </>
      )}

      <ConfirmActionModal
        action={confirmAction}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          void executeConfirmedAction();
        }}
      />
    </div>
  );
}
