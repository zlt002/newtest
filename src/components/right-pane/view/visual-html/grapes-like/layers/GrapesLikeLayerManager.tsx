import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Copy, Trash2 } from 'lucide-react';
import type { LayerSnapshot } from '../types';
import GrapesLikeLayerTree from './GrapesLikeLayerTree';

type GrapesLikeLayerManagerProps = {
  layers: LayerSnapshot;
  actions: {
    selectLayer: (id: string, event?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } | null) => void;
    selectParentLayer: (id: string) => void;
    duplicateLayer: (id: string) => void;
    deleteLayer: (id: string) => void;
    toggleLayerVisible: (id: string) => void;
    toggleLayerExpanded: (id: string) => void;
    moveLayer: (sourceId: string, targetId: string) => void;
  };
};

type LayerContextMenuState = {
  id: string;
  x: number;
  y: number;
  canSelectParent: boolean;
} | null;

export default function GrapesLikeLayerManager({ layers, actions }: GrapesLikeLayerManagerProps) {
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const [dropIndicatorLayerId, setDropIndicatorLayerId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<LayerContextMenuState>(null);
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!contextMenu) {
      return undefined;
    }

    const closeMenu = () => setContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    window.addEventListener('pointerdown', closeMenu);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  return (
    <section
      ref={sectionRef}
      data-layer-manager="true"
      className="relative w-full min-w-0 p-1.5 text-card-foreground "
    >
      <GrapesLikeLayerTree
        nodes={layers.roots}
        actions={actions}
        sortable={layers.sortable}
        draggedLayerId={draggedLayerId}
        dropIndicatorLayerId={dropIndicatorLayerId}
        onDragStart={setDraggedLayerId}
        onDragOverLayer={setDropIndicatorLayerId}
        onDropLayer={(targetId) => {
          if (draggedLayerId && draggedLayerId !== targetId) {
            actions.moveLayer(draggedLayerId, targetId);
          }
          setDraggedLayerId(null);
          setDropIndicatorLayerId(null);
        }}
        onDragEnd={() => {
          setDraggedLayerId(null);
          setDropIndicatorLayerId(null);
        }}
        onOpenContextMenu={(payload) => {
          const bounds = sectionRef.current?.getBoundingClientRect();
          const x = bounds ? payload.clientX - bounds.left : payload.clientX;
          const y = bounds ? payload.clientY - bounds.top : payload.clientY;
          setContextMenu({
            id: payload.id,
            x,
            y,
            canSelectParent: payload.canSelectParent,
          });
        }}
      />
      {contextMenu ? (
        <div
          data-layer-context-menu="true"
          className="absolute z-20 min-w-[148px] overflow-hidden rounded-md border border-border bg-popover py-1 text-[13px] text-popover-foreground shadow-lg"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            disabled={!contextMenu.canSelectParent}
            className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            onClick={() => {
              actions.selectParentLayer(contextMenu.id);
              setContextMenu(null);
            }}
          >
            <ArrowUp className="h-3.5 w-3.5" />
            <span>Select parent</span>
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent"
            onClick={() => {
              actions.duplicateLayer(contextMenu.id);
              setContextMenu(null);
            }}
          >
            <Copy className="h-3.5 w-3.5" />
            <span>Duplicate</span>
          </button>
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-destructive transition-colors hover:bg-destructive/10"
            onClick={() => {
              actions.deleteLayer(contextMenu.id);
              setContextMenu(null);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}
