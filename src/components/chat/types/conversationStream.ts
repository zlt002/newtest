import type { AgentEventEnvelope } from './agentEvents.ts';

export type ConversationTaskStep = {
  eventId: string;
  type: AgentEventEnvelope['type'];
  label: string;
};

type ConversationStreamBlockBase = {
  id: string;
  runId: string;
  timestamp: string;
};

export type ConversationTurnBlock = ConversationStreamBlockBase & {
  kind: 'turn';
  userText: string | null;
  assistantText: string;
  events: AgentEventEnvelope[];
};

export type ConversationTaskBlock = ConversationStreamBlockBase & {
  kind: 'task';
  title: string;
  status: 'running' | 'completed' | 'failed';
  summary: string;
  defaultExpanded: boolean;
  steps: ConversationTaskStep[];
  eventIds: string[];
  events: AgentEventEnvelope[];
};

export type ConversationDecisionBlock = ConversationStreamBlockBase & {
  kind: 'decision';
  decisionKind: 'interactive_prompt' | 'permission_request';
  title: string;
  state: 'pending' | 'answered' | 'approved' | 'denied';
  payload: Record<string, unknown>;
  events: AgentEventEnvelope[];
};

export type ConversationArtifactBlock = ConversationStreamBlockBase & {
  kind: 'artifact';
  title: string;
  filePath: string | null;
  artifactKind: 'file' | 'diff' | 'preview' | 'resource';
  events: AgentEventEnvelope[];
};

export type ConversationRecoveryBlock = ConversationStreamBlockBase & {
  kind: 'recovery';
  title: string;
  message: string;
  canRetry: boolean;
  canStartNewSession: boolean;
  events: AgentEventEnvelope[];
};

export type ConversationStatusInlineBlock = ConversationStreamBlockBase & {
  kind: 'status_inline';
  label: string;
  events: AgentEventEnvelope[];
};

export type ConversationStreamBlock =
  | ConversationTurnBlock
  | ConversationTaskBlock
  | ConversationDecisionBlock
  | ConversationArtifactBlock
  | ConversationRecoveryBlock
  | ConversationStatusInlineBlock;
