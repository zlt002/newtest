import type { ConversationStreamBlock } from '../types/conversationStream.ts';

export type ContextSidecarBinding =
  | {
      target: 'file';
      filePath: string;
    }
  | {
      target: 'task_context';
      runId: string;
      eventIds: string[];
    }
  | {
      target: 'recovery_context';
      runId: string;
    };

export function resolveContextSidecarBinding(
  block: ConversationStreamBlock | null | undefined,
): ContextSidecarBinding | null {
  if (!block) {
    return null;
  }

  if (block.kind === 'artifact' && block.filePath) {
    return {
      target: 'file',
      filePath: block.filePath,
    };
  }

  if (block.kind === 'task') {
    return {
      target: 'task_context',
      runId: block.runId,
      eventIds: block.eventIds,
    };
  }

  if (block.kind === 'recovery') {
    return {
      target: 'recovery_context',
      runId: block.runId,
    };
  }

  return null;
}
