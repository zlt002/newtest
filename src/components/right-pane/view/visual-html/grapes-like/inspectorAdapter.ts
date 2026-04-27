// @ts-ignore - Node's strip-types runtime resolves the .ts specifier; tsc flags it without allowImportingTsExtensions.
import type { InspectorSnapshot, InspectorSelection, LayerSnapshot, SelectorSnapshot, StyleSnapshot } from './types.ts';

type InspectorAdapterParts = {
  selection: () => InspectorSelection;
  selector: () => SelectorSnapshot;
  style: () => StyleSnapshot;
  layers: () => LayerSnapshot;
};

type InspectorAdapterListener = () => void;

export function createInspectorAdapter(parts: InspectorAdapterParts) {
  const listeners = new Set<InspectorAdapterListener>();
  let cachedSnapshot: InspectorSnapshot | null = null;

  function ensureSnapshot(): InspectorSnapshot {
    if (!cachedSnapshot) {
      cachedSnapshot = {
        selection: parts.selection(),
        selector: parts.selector(),
        style: parts.style(),
        layers: parts.layers(),
        capabilities: {
          canEditSelectors: true,
          canEditStyles: true,
          canEditLayers: true,
        },
      };
    }

    return cachedSnapshot;
  }

  return {
    getSnapshot(): InspectorSnapshot {
      return ensureSnapshot();
    },
    subscribe(listener: InspectorAdapterListener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    patchSnapshot(patch: Partial<InspectorSnapshot>) {
      cachedSnapshot = {
        ...ensureSnapshot(),
        ...patch,
      };
      listeners.forEach((listener) => listener());
    },
    notify() {
      cachedSnapshot = null;
      listeners.forEach((listener) => listener());
    },
  };
}
