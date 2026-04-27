import { deriveFileChangeEvents } from './chatFileChangeEvents.ts';
import type { FileChangeEvent } from './chatFileChangeEvents';

export function createFileChangeEventKey(event: FileChangeEvent): string {
  return [
    event.type,
    event.sessionId,
    event.toolId,
    event.filePath,
    event.timestamp,
    event.lineRange?.startLine ?? '',
    event.lineRange?.endLine ?? '',
    event.type === 'file_change_failed' ? (event as FileChangeEvent & { type: 'file_change_failed'; error: string }).error : '',
  ].join('::');
}

export function collectUnseenFileChangeEvents(
  messages: Parameters<typeof deriveFileChangeEvents>[0],
  emittedKeys: Set<string>,
): FileChangeEvent[] {
  const nextEvents: FileChangeEvent[] = [];

  for (const event of deriveFileChangeEvents(messages)) {
    const eventKey = createFileChangeEventKey(event);
    if (emittedKeys.has(eventKey)) {
      continue;
    }

    emittedKeys.add(eventKey);
    nextEvents.push(event);
  }

  return nextEvents;
}
