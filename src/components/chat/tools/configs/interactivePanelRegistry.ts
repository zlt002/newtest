import type { ComponentType } from 'react';
import type { PendingPermissionRequest } from '../../types/types';

export interface InteractivePanelProps {
  request: PendingPermissionRequest;
  onDecision: (
    requestIds: string | string[],
    decision: { allow?: boolean; message?: string; updatedInput?: unknown },
  ) => void;
}

const registry: Record<string, ComponentType<InteractivePanelProps>> = {};

export function registerInteractivePanel(
  toolName: string,
  component: ComponentType<InteractivePanelProps>,
): void {
  registry[toolName] = component;
}

export function getInteractivePanel(
  toolName: string,
): ComponentType<InteractivePanelProps> | null {
  return registry[toolName] || null;
}
