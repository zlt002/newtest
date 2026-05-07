type InspectorSnapshotImmediatePayload = {
  selection: unknown;
  layers: unknown;
};

type InspectorSnapshotDeferredPayload = {
  style: unknown;
  selector: unknown;
};

type InspectorSnapshotStagePayload = {
  immediate: InspectorSnapshotImmediatePayload;
  deferred: () => InspectorSnapshotDeferredPayload;
};

type InspectorSnapshotSchedulerOptions = {
  scheduleFrame: (task: () => void) => void;
  applyPatch: (patch: Record<string, unknown>) => void;
};

function markSyncState(section: unknown, syncState: 'pending' | 'ready') {
  if (!section || typeof section !== 'object' || Array.isArray(section)) {
    return { syncState };
  }

  return {
    ...section,
    syncState,
  };
}

export function createInspectorSnapshotScheduler({
  scheduleFrame,
  applyPatch,
}: InspectorSnapshotSchedulerOptions) {
  let revision = 0;

  return {
    scheduleSelection(next: InspectorSnapshotStagePayload) {
      revision += 1;
      const scheduledRevision = revision;

      applyPatch({
        selection: next.immediate.selection,
        layers: next.immediate.layers,
        style: markSyncState(null, 'pending'),
        selector: markSyncState(null, 'pending'),
      });

      scheduleFrame(() => {
        if (scheduledRevision !== revision) {
          return;
        }

        const deferred = next.deferred();
        applyPatch({
          style: markSyncState(deferred.style, 'ready'),
          selector: markSyncState(deferred.selector, 'ready'),
        });
      });

      return scheduledRevision;
    },
  };
}
