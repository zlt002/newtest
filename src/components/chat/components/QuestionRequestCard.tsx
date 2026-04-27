import React from 'react';
import type { PendingQuestionRequest } from '../types/types';
import { getInteractivePanel, registerInteractivePanel } from '../tools/configs/interactivePanelRegistry';
import { AskUserQuestionPanel } from '../tools/components/InteractiveRenderers';

registerInteractivePanel('AskUserQuestion', AskUserQuestionPanel);

type QuestionRequestCardProps = {
  request: PendingQuestionRequest;
  onDecision: (
    requestIds: string | string[],
    decision: { allow?: boolean; message?: string; updatedInput?: unknown },
  ) => void;
};

export function QuestionRequestCard({
  request,
  onDecision,
}: QuestionRequestCardProps) {
  const CustomPanel = getInteractivePanel(request.toolName);
  if (CustomPanel) {
    return (
      <CustomPanel
        request={request}
        onDecision={onDecision}
      />
    );
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 shadow-sm dark:border-blue-800 dark:bg-blue-900/20">
      <div className="text-sm font-semibold text-blue-900 dark:text-blue-100">需要你的输入</div>
      <div className="mt-1 text-xs text-blue-800 dark:text-blue-200">
        工具: <span className="font-mono">{request.toolName}</span>
      </div>
      <div className="mt-3">
        <button
          type="button"
          onClick={() => onDecision(request.requestId, { allow: true, updatedInput: request.input })}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
        >
          继续
        </button>
      </div>
    </div>
  );
}

export default QuestionRequestCard;
