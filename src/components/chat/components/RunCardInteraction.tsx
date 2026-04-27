import React from 'react';
import type { PendingDecisionRequest } from '../../chat/types/types';
import type { RunCardInteraction as RunCardInteractionModel } from '../types/runCard.ts';
import InteractiveRequestsBanner from '../../chat/view/subcomponents/InteractiveRequestsBanner';
import PermissionRequestsBanner from '../../chat/view/subcomponents/PermissionRequestsBanner';

type RunCardInteractionProps = {
  interaction: RunCardInteractionModel;
  handlePermissionDecision: (
    requestIds: string | string[],
    decision: { allow?: boolean; message?: string; updatedInput?: unknown; rememberEntry?: string | null },
  ) => void;
  handleGrantToolPermission: (suggestion: { entry: string; toolName: string }) => { success: boolean };
};

function buildEmbeddedRequest(interaction: RunCardInteractionModel): PendingDecisionRequest {
  return {
    requestId: interaction.requestId,
    toolName: interaction.toolName || 'UnknownTool',
    input: interaction.input,
    context: interaction.context,
    sessionId: null,
    receivedAt: new Date(),
    kind: interaction.kind,
  };
}

export function RunCardInteraction({
  interaction,
  handlePermissionDecision,
  handleGrantToolPermission,
}: RunCardInteractionProps) {
  const request = buildEmbeddedRequest(interaction);

  return (
    <div data-chat-v2-run-card-interaction="true" className="space-y-2">
      {interaction.kind === 'interactive_prompt' ? (
        <InteractiveRequestsBanner
          embedded
          pendingDecisionRequests={[request]}
          handlePermissionDecision={handlePermissionDecision}
        />
      ) : (
        <PermissionRequestsBanner
          embedded
          pendingDecisionRequests={[request]}
          handlePermissionDecision={handlePermissionDecision}
          handleGrantToolPermission={handleGrantToolPermission}
        />
      )}
    </div>
  );
}

export default RunCardInteraction;
