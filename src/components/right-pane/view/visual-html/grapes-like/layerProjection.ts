import type { LayerNodeViewModel, LayerSnapshot } from './types.ts';

type ProjectVisibleLayerTreeInput = {
  roots: readonly LayerNodeViewModel[];
  selectedId: string | null | undefined;
  expandedIds: readonly string[];
};

function findSelectedPath(nodes: readonly LayerNodeViewModel[], selectedId: string): string[] {
  for (const node of nodes) {
    if (node.id === selectedId) {
      return [node.id];
    }

    const childPath = findSelectedPath(node.children, selectedId);
    if (childPath.length > 0) {
      return [node.id, ...childPath];
    }
  }

  return [];
}

function projectNode(
  node: LayerNodeViewModel,
  selectedPath: readonly string[],
  selectedId: string,
  expandedIds: ReadonlySet<string>,
  pathIndex: number,
): LayerNodeViewModel {
  const isSelected = node.id === selectedId;
  const isExpanded = expandedIds.has(node.id);
  const isOnSelectedPath = pathIndex >= 0;
  const nextPathId = selectedPath[pathIndex + 1];

  let children: LayerNodeViewModel[] = [];

  if (isSelected || isExpanded) {
    children = node.children
      .map((child) => projectNode(child, selectedPath, selectedId, expandedIds, child.id === nextPathId ? pathIndex + 1 : -1));
  } else if (isOnSelectedPath && nextPathId) {
    const nextChild = node.children.find((child) => child.id === nextPathId);
    if (nextChild) {
      children = [projectNode(nextChild, selectedPath, selectedId, expandedIds, pathIndex + 1)];
    }
  }

  return {
    id: node.id,
    label: node.label,
    visible: node.visible,
    selected: isSelected,
    expanded: isExpanded,
    canExpand: node.canExpand || children.length > 0,
    children,
  };
}

function collectLayerMetadata(
  nodes: readonly LayerNodeViewModel[],
  result: Pick<LayerSnapshot, 'selectedLayerIds' | 'expandedLayerIds'>,
): void {
  for (const node of nodes) {
    if (node.selected) {
      result.selectedLayerIds.push(node.id);
    }
    if (node.expanded) {
      result.expandedLayerIds.push(node.id);
    }
    collectLayerMetadata(node.children, result);
  }
}

export function projectVisibleLayerTree({
  roots,
  selectedId,
  expandedIds,
}: ProjectVisibleLayerTreeInput): LayerSnapshot {
  const normalizedSelectedId = selectedId ? String(selectedId) : '';
  const normalizedExpandedIds = new Set(expandedIds.map((id) => String(id)));
  const selectedPath = normalizedSelectedId ? findSelectedPath(roots, normalizedSelectedId) : [];

  const projectedRoots = roots.map((root) => projectNode(
    root,
    selectedPath,
    normalizedSelectedId,
    normalizedExpandedIds,
    selectedPath[0] === root.id ? 0 : -1,
  ));
  const result = {
    roots: projectedRoots,
    selectedLayerIds: [],
    expandedLayerIds: [],
    sortable: roots.length > 0,
  };
  collectLayerMetadata(projectedRoots, result);
  return result;
}
