import { useSyncExternalStore } from 'react';
import type { InspectorSnapshot } from './types';

export function useGrapesLikeInspectorSnapshot(adapter: {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => InspectorSnapshot;
}) {
  return useSyncExternalStore(adapter.subscribe, adapter.getSnapshot, adapter.getSnapshot);
}
