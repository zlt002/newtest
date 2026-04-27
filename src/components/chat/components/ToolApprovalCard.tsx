import React from 'react';
import { useTranslation } from 'react-i18next';
import type { PendingToolApprovalRequest } from '../types/types';
import { buildClaudeToolPermissionEntry, formatToolInputForDisplay } from '../utils/chatPermissions';
import { getClaudeSettings } from '../utils/chatStorage';
import { getPermissionPanel } from '../tools/configs/permissionPanelRegistry';

type ToolApprovalCardProps = {
  request: PendingToolApprovalRequest;
  siblingRequests?: PendingToolApprovalRequest[];
  onDecision: (
    requestIds: string | string[],
    decision: { allow?: boolean; message?: string; rememberEntry?: string | null; updatedInput?: unknown },
  ) => void;
  onGrantToolPermission: (suggestion: { entry: string; toolName: string }) => { success: boolean };
};

export function ToolApprovalCard({
  request,
  siblingRequests = [],
  onDecision,
  onGrantToolPermission,
}: ToolApprovalCardProps) {
  const { t } = useTranslation('chat');
  const CustomPanel = getPermissionPanel(request.toolName);
  if (CustomPanel) {
    return (
      <CustomPanel
        request={request}
        onDecision={onDecision}
      />
    );
  }

  const rawInput = formatToolInputForDisplay(request.input);
  const permissionEntry = buildClaudeToolPermissionEntry(request.toolName, rawInput);
  const settings = getClaudeSettings();
  const alreadyAllowed = permissionEntry ? settings.allowedTools.includes(permissionEntry) : false;
  const rememberLabel = alreadyAllowed
    ? t('permissionRequests.actions.allowRememberSaved')
    : t('permissionRequests.actions.allowRemember');
  const matchingRequestIds = permissionEntry
    ? siblingRequests
        .filter(
          (item) => buildClaudeToolPermissionEntry(item.toolName, formatToolInputForDisplay(item.input)) === permissionEntry,
        )
        .map((item) => item.requestId)
    : [request.requestId];

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 shadow-sm dark:border-amber-800 dark:bg-amber-900/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">{t('permissionRequests.title')}</div>
          <div className="text-xs text-amber-800 dark:text-amber-200">
            {t('permissionRequests.toolLabel')} <span className="font-mono">{request.toolName}</span>
          </div>
        </div>
        {permissionEntry ? (
          <div className="text-xs text-amber-700 dark:text-amber-300">
            {t('permissionRequests.allowRuleLabel')} <span className="font-mono">{permissionEntry}</span>
          </div>
        ) : null}
      </div>

      {rawInput ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-amber-800 hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-100">
            {t('permissionRequests.viewToolInput')}
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-amber-200/60 bg-white/80 p-2 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-gray-900/60 dark:text-amber-100">
            {rawInput}
          </pre>
        </details>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onDecision(request.requestId, { allow: true })}
          className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700"
        >
          {t('permissionRequests.actions.allowOnce')}
        </button>
        <button
          type="button"
          onClick={() => {
            if (permissionEntry && !alreadyAllowed) {
              onGrantToolPermission({ entry: permissionEntry, toolName: request.toolName });
            }
            onDecision(matchingRequestIds, { allow: true, rememberEntry: permissionEntry });
          }}
          className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
            permissionEntry
              ? 'border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-100 dark:hover:bg-amber-900/30'
              : 'cursor-not-allowed border-gray-300 text-gray-400'
          }`}
          disabled={!permissionEntry}
        >
          {rememberLabel}
        </button>
        <button
          type="button"
          onClick={() => onDecision(request.requestId, { allow: false, message: t('permissionRequests.deniedMessage') })}
          className="inline-flex items-center gap-2 rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-900/30"
        >
          {t('permissionRequests.actions.deny')}
        </button>
      </div>
    </div>
  );
}

export default ToolApprovalCard;
