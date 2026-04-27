import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Heading1,
  Image as ImageIcon,
  Rows3,
  Square,
  Text,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { LayerNodeViewModel } from '../types';

type GrapesLikeLayerItemProps = {
  node: LayerNodeViewModel;
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
  isDragging?: boolean;
  dropIndicator?: 'before' | null;
  onDragStart?: (id: string) => void;
  onDragOverLayer?: (targetId: string) => void;
  onDropLayer?: (targetId: string) => void;
  onDragEnd?: () => void;
  onOpenContextMenu?: (payload: { id: string; clientX: number; clientY: number; canSelectParent: boolean }) => void;
  hasParent?: boolean;
};

export default function GrapesLikeLayerItem({
  node,
  actions,
  sortable = false,
  isDragging = false,
  dropIndicator = null,
  onDragStart,
  onDragOverLayer,
  onDropLayer,
  onDragEnd,
  onOpenContextMenu,
  hasParent = false,
}: GrapesLikeLayerItemProps) {
  const canExpand = node.canExpand || node.children.length > 0;
  const hasChildren = node.children.length > 0;
  const rowClassName = [
    'group/layer-row relative flex min-h-[26px] w-full items-center pr-1 text-[12px] leading-4 transition-colors',
    dropIndicator === 'before' ? 'before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-primary' : '',
    node.selected ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
    isDragging ? 'opacity-50' : '',
  ].join(' ');
  const labelClassName = [
    'flex min-w-0 flex-1 items-center gap-1 px-1 py-1 text-left outline-none transition-colors',
    node.selected ? 'text-primary' : 'text-foreground',
  ].join(' ');
  const actionClassName = [
    'flex items-center gap-0.5 transition-opacity duration-150',
    node.selected
      ? 'pointer-events-auto opacity-100'
      : 'pointer-events-none opacity-0 group-hover/layer-row:pointer-events-auto group-hover/layer-row:opacity-100',
  ].join(' ');
  const LayerIcon = getLayerIcon(node.label, hasChildren);

  return (
    <div
      data-layer-id={node.id}
      data-layer-row="true"
      data-layer-selected={node.selected ? 'true' : undefined}
      data-drop-indicator={dropIndicator ?? undefined}
      className={rowClassName}
      draggable={sortable}
      onDragOver={(event) => {
        if (!sortable) {
          return;
        }
        event.preventDefault();
        onDragOverLayer?.(node.id);
      }}
      onDragStart={(event) => {
        if (!sortable) {
          return;
        }
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', node.id);
        onDragStart?.(node.id);
      }}
      onDrop={(event) => {
        if (!sortable) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        onDropLayer?.(node.id);
      }}
      onDragEnd={() => {
        if (!sortable) {
          return;
        }
        onDragEnd?.();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenContextMenu?.({
          id: node.id,
          clientX: event.clientX,
          clientY: event.clientY,
          canSelectParent: hasParent,
        });
      }}
    >
      {canExpand ? (
        <button
          type="button"
          aria-label={node.expanded ? '收起图层' : '展开图层'}
          className={`flex h-4 w-4 shrink-0 items-center justify-center transition-colors ${node.selected ? 'text-primary hover:text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => actions.toggleLayerExpanded(node.id)}
        >
          {node.expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
      ) : (
        <span className="inline-block h-4 w-4 shrink-0" />
      )}
      <button
        type="button"
        aria-pressed={node.selected}
        className={`w-full min-w-0 text-left leading-4 ${labelClassName} text-[12px]`}
        onClick={(event) => actions.selectLayer(node.id, {
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
        })}
      >
        <span className={`flex h-4 w-4 shrink-0 items-center justify-center ${node.selected ? 'text-primary' : 'text-muted-foreground'}`}>
          <LayerIcon className="h-3.5 w-3.5" />
        </span>
        <span className="block min-w-0 flex-1 truncate whitespace-nowrap">{node.label}</span>
      </button>
      <div data-layer-actions="true" className={actionClassName}>
        <button
          type="button"
          aria-label={node.visible ? '隐藏图层' : '显示图层'}
          className={`flex h-5 w-5 items-center justify-center rounded-sm transition-colors ${
            node.selected
              ? 'text-primary hover:bg-primary/10 hover:text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          }`}
          onClick={() => actions.toggleLayerVisible(node.id)}
        >
          {node.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

function getLayerIcon(label: string, hasChildren: boolean): ComponentType<{ className?: string }> {
  const normalized = label.trim().toLowerCase();

  if (normalized.includes('图片') || normalized.includes('image') || normalized.includes('img')) {
    return ImageIcon;
  }
  if (normalized.includes('标题') || normalized.includes('heading') || normalized.startsWith('h ')) {
    return Heading1;
  }
  if (normalized.includes('正文') || normalized.includes('文本') || normalized.includes('text') || normalized.includes('paragraph')) {
    return Text;
  }
  if (normalized.includes('章节') || normalized.includes('section') || normalized.includes('结构') || hasChildren) {
    return Rows3;
  }
  return Square;
}
