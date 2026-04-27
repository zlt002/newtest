import type { InlineRuntimeActivityLine } from '../projection/projectInlineRuntimeActivity.ts';
import type { AgentEventEnvelope, ProjectedRunExecution } from './agentEvents.ts';

export type AssistantTurn = {
  sessionId: string;
  runId: string;
  anchorUserMessageIndex: number | null;
  run: null;
  summary: ProjectedRunExecution;
  activity: InlineRuntimeActivityLine[];
  events: AgentEventEnvelope[];
};
