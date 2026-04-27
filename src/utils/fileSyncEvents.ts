export type FileSyncEventDetail = {
  projectName: string;
  filePath: string;
  sourceId?: string | null;
  version?: string | null;
  updatedAt?: number;
};

type FileSyncSubscriptionOptions = {
  projectName?: string | null;
  filePath?: string | null;
  sourceId?: string | null;
  onFileSync: (detail: FileSyncEventDetail) => void;
};

export const FILE_SYNC_EVENT_NAME = 'ccui:file-sync';

const fileSyncEventTarget = new EventTarget();

function createFileSyncEvent(detail: FileSyncEventDetail): Event {
  if (typeof CustomEvent === 'function') {
    return new CustomEvent<FileSyncEventDetail>(FILE_SYNC_EVENT_NAME, { detail });
  }

  const event = new Event(FILE_SYNC_EVENT_NAME) as Event & { detail?: FileSyncEventDetail };
  event.detail = detail;
  return event;
}

function isMatch(value: string | null | undefined, expected: string | null | undefined): boolean {
  if (!expected) {
    return true;
  }

  return value === expected;
}

export function broadcastFileSyncEvent(detail: FileSyncEventDetail): void {
  fileSyncEventTarget.dispatchEvent(createFileSyncEvent({
    ...detail,
    updatedAt: detail.updatedAt ?? Date.now(),
  }));
}

export function subscribeToFileSyncEvents({
  projectName = null,
  filePath = null,
  sourceId = null,
  onFileSync,
}: FileSyncSubscriptionOptions): () => void {
  const handler = (event: Event) => {
    const syncEvent = event as CustomEvent<FileSyncEventDetail> & {
      detail?: FileSyncEventDetail;
    };
    const detail = syncEvent.detail;

    if (!detail) {
      return;
    }

    if (!isMatch(detail.projectName, projectName) || !isMatch(detail.filePath, filePath)) {
      return;
    }

    if (sourceId && detail.sourceId && detail.sourceId === sourceId) {
      return;
    }

    onFileSync(detail);
  };

  fileSyncEventTarget.addEventListener(FILE_SYNC_EVENT_NAME, handler as EventListener);

  return () => {
    fileSyncEventTarget.removeEventListener(FILE_SYNC_EVENT_NAME, handler as EventListener);
  };
}
