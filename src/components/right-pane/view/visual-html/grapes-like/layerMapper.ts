// @ts-ignore - Node's strip-types runtime resolves the .ts specifier; tsc flags it without this hint.
import type { LayerNode } from './types.ts';

function updateLayerNode(
  node: LayerNode,
  targetId: string,
  visible: boolean,
): { node: LayerNode; found: boolean } {
  if (node.id === targetId) {
    if (node.visible === visible) {
      return { node, found: true };
    }

    return {
      node: {
        ...node,
        visible,
      },
      found: true,
    };
  }

  let changed = false;
  let found = false;
  const nextChildren = node.children.map((child) => {
    const result = updateLayerNode(child, targetId, visible);
    if (result.found) {
      found = true;
    }
    if (result.node !== child) {
      changed = true;
    }
    return result.node;
  });

  if (!found) {
    return { node, found: false };
  }

  if (!changed) {
    return { node, found: true };
  }

  return {
    node: {
      ...node,
      children: nextChildren,
    },
    found: true,
  };
}

export function applyLayerVisibilityPatch(root: LayerNode, targetId: string, visible: boolean): LayerNode {
  return updateLayerNode(root, targetId, visible).node;
}

export function selectLayer(actions: { selectLayer?: (id: string) => void } | null | undefined, id: string) {
  actions?.selectLayer?.(id);
}

export function moveLayer(
  actions: { moveLayer?: (sourceId: string, targetId: string) => void } | null | undefined,
  sourceId: string,
  targetId: string,
) {
  actions?.moveLayer?.(sourceId, targetId);
}

export function toggleLayerExpanded(actions: { toggleLayerExpanded?: (id: string) => void } | null | undefined, id: string) {
  actions?.toggleLayerExpanded?.(id);
}

export function toggleLayerVisible(actions: { toggleLayerVisible?: (id: string) => void } | null | undefined, id: string) {
  actions?.toggleLayerVisible?.(id);
}
