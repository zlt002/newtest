import type { LayerNodeViewModel } from '../types';
import GrapesLikeLayerItem from './GrapesLikeLayerItem';

type GrapesLikeLayerTreeProps = {
  nodes: LayerNodeViewModel[];
  actions: {
    selectLayer: (id: string, event?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } | null) => void;
    selectParentLayer: (id: string) => void;
    duplicateLayer: (id: string) => void;
    deleteLayer: (id: string) => void;
    toggleLayerVisible: (id: string) => void;
    toggleLayerExpanded: (id: string) => void;
    moveLayer: (sourceId: string, targetId: string) => void;
  };
  sortable?: boolean;
  draggedLayerId?: string | null;
  dropIndicatorLayerId?: string | null;
  onDragStart?: (id: string) => void;
  onDragOverLayer?: (targetId: string) => void;
  onDropLayer?: (targetId: string) => void;
  onDragEnd?: () => void;
  onOpenContextMenu?: (payload: { id: string; clientX: number; clientY: number; canSelectParent: boolean }) => void;
  depth?: number;
};

export default function GrapesLikeLayerTree({
  nodes,
  actions,
  sortable = false,
  draggedLayerId = null,
  dropIndicatorLayerId = null,
  onDragStart,
  onDragOverLayer,
  onDropLayer,
  onDragEnd,
  onOpenContextMenu,
  depth = 0,
}: GrapesLikeLayerTreeProps) {
  return (
    <div className="flex w-full flex-col gap-0">
      {nodes.map((node) => (
        <div key={node.id} className="w-full" style={{ paddingLeft: `${Math.min(depth * 6, 12)}px` }}>
          <GrapesLikeLayerItem
            node={node}
            actions={actions}
            sortable={sortable}
            isDragging={draggedLayerId === node.id}
            dropIndicator={dropIndicatorLayerId === node.id ? 'before' : null}
            onDragStart={onDragStart}
            onDragOverLayer={onDragOverLayer}
            onDropLayer={onDropLayer}
            onDragEnd={onDragEnd}
            onOpenContextMenu={onOpenContextMenu}
            hasParent={depth > 0}
          />
          {node.expanded && node.children.length > 0 ? (
            <GrapesLikeLayerTree
              nodes={node.children}
              actions={actions}
              sortable={sortable}
              draggedLayerId={draggedLayerId}
              dropIndicatorLayerId={dropIndicatorLayerId}
              onDragStart={onDragStart}
              onDragOverLayer={onDragOverLayer}
              onDropLayer={onDropLayer}
              onDragEnd={onDragEnd}
              onOpenContextMenu={onOpenContextMenu}
              depth={depth + 1}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
