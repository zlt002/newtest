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
      });

      scheduleFrame(() => {
        if (scheduledRevision !== revision) {
          return;
        }

        applyPatch(next.deferred());
      });

      return scheduledRevision;
    },
  };
}
