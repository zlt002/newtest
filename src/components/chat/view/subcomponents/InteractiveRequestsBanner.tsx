import React from 'react';
import {
  type PendingDecisionRequest,
  isPendingQuestionRequest,
} from '../../types/types';
import QuestionRequestCard from '../../components/QuestionRequestCard.tsx';

interface InteractiveRequestsBannerProps {
  pendingDecisionRequests: PendingDecisionRequest[];
  inStreamRenderingEnabled?: boolean;
  embedded?: boolean;
  handlePermissionDecision: (
    requestIds: string | string[],
    decision: { allow?: boolean; message?: string; updatedInput?: unknown },
  ) => void;
}

export default function InteractiveRequestsBanner({
  pendingDecisionRequests,
  inStreamRenderingEnabled = false,
  embedded = false,
  handlePermissionDecision,
}: InteractiveRequestsBannerProps) {
  if (inStreamRenderingEnabled) {
    return null;
  }

  const interactiveRequests = pendingDecisionRequests.filter(isPendingQuestionRequest);

  if (!interactiveRequests.length) {
    return null;
  }

  return (
    <div className={embedded ? 'space-y-2' : 'mb-3 space-y-2'} data-chat-v2-interactive-requests-banner="true">
      {interactiveRequests.map((request) => {
        return (
          <QuestionRequestCard
            key={request.requestId}
            request={request}
            onDecision={handlePermissionDecision}
          />
        );
      })}
    </div>
  );
}
