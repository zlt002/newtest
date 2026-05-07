// @ts-ignore - Node's strip-types runtime resolves the .ts specifier; tsc flags it without allowImportingTsExtensions.
import type { InspectorSnapshot, InspectorSelection, LayerSnapshot, SelectorSnapshot, StyleSnapshot } from './types.ts';

type InspectorAdapterParts = {
  selection: () => InspectorSelection;
  selector: () => SelectorSnapshot;
  style: () => StyleSnapshot;
  layers: () => LayerSnapshot;
};

type InspectorSnapshotPatch = Partial<Omit<InspectorSnapshot, 'selector' | 'style' | 'layers'>> & {
  selector?: Partial<SelectorSnapshot>;
  style?: Partial<StyleSnapshot>;
  layers?: Partial<LayerSnapshot>;
};

type InspectorAdapterListener = () => void;

function isPlainSection(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeSnapshotSection<TSection>(
  current: TSection,
  patch: Partial<TSection> | undefined,
): TSection {
  if (!isPlainSection(current) || !isPlainSection(patch)) {
    return patch === undefined ? current : patch as TSection;
  }

  return {
    ...current,
    ...patch,
  } as TSection;
}

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
    patchSnapshot(patch: InspectorSnapshotPatch) {
      const current = ensureSnapshot();
      cachedSnapshot = {
        ...current,
        ...patch,
        selector: mergeSnapshotSection(current.selector, patch.selector),
        style: mergeSnapshotSection(current.style, patch.style),
        layers: mergeSnapshotSection(current.layers, patch.layers),
      };
      listeners.forEach((listener) => listener());
    },
    notify() {
      cachedSnapshot = null;
      listeners.forEach((listener) => listener());
    },
  };
}
