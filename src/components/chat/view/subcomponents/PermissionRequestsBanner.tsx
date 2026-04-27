import React from 'react';
import {
  type PendingDecisionRequest,
  isPendingToolApprovalRequest,
} from '../../types/types';
import { useTranslation } from 'react-i18next';
import ToolApprovalCard from '../../components/ToolApprovalCard.tsx';

interface PermissionRequestsBannerProps {
  pendingDecisionRequests: PendingDecisionRequest[];
  inStreamRenderingEnabled?: boolean;
  embedded?: boolean;
  handlePermissionDecision: (
    requestIds: string | string[],
    decision: { allow?: boolean; message?: string; rememberEntry?: string | null; updatedInput?: unknown },
  ) => void;
  handleGrantToolPermission: (suggestion: { entry: string; toolName: string }) => { success: boolean };
}

export default function PermissionRequestsBanner({
  pendingDecisionRequests,
  inStreamRenderingEnabled = false,
  embedded = false,
  handlePermissionDecision,
  handleGrantToolPermission,
}: PermissionRequestsBannerProps) {
  useTranslation('chat');

  if (inStreamRenderingEnabled) {
    return null;
  }

  const permissionRequests = pendingDecisionRequests.filter(isPendingToolApprovalRequest);

  if (!permissionRequests.length) {
    return null;
  }

  return (
    <div className={embedded ? 'space-y-2' : 'mb-3 space-y-2'} data-chat-v2-permission-requests-banner="true">
      {permissionRequests.map((request) => {
        return (
          <ToolApprovalCard
            key={request.requestId}
            request={request}
            siblingRequests={permissionRequests}
            onDecision={handlePermissionDecision}
            onGrantToolPermission={handleGrantToolPermission}
          />
        );
      })}
    </div>
  );
}
