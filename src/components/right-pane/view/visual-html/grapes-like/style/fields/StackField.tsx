import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';

export type StackDragHandleProps = {
  draggable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
};

type StackFieldProps<TItem> = {
  label: string;
  items: readonly TItem[];
  mixed?: boolean;
  disabled?: boolean;
  emptyText?: string;
  sortable?: boolean;
  getTitle: (item: TItem, index: number) => string;
  renderItemLeading?: (item: TItem, index: number, expanded: boolean, dragHandleProps: StackDragHandleProps) => ReactNode;
  renderItem: (item: TItem, index: number) => ReactNode;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onMove?: (fromIndex: number, toIndex: number) => void;
};

export function moveStackItem<TItem>(items: readonly TItem[], fromIndex: number, toIndex: number): TItem[] {
  if (fromIndex === toIndex) {
    return [...items];
  }

  if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) {
    return [...items];
  }

  const nextItems = [...items];
  const [item] = nextItems.splice(fromIndex, 1);
  nextItems.splice(toIndex, 0, item);
  return nextItems;
}

export default function StackField<TItem>({
  label,
  items,
  mixed = false,
  disabled = false,
  emptyText = '点击 + 添加项目',
  sortable = false,
  getTitle,
  renderItemLeading,
  renderItem,
  onAdd,
  onRemove,
  onMove,
}: StackFieldProps<TItem>) {
  const [expandedItems, setExpandedItems] = useState<boolean[]>(() => items.map(() => true));
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  useEffect(() => {
    setExpandedItems((current) => {
      if (current.length === items.length) {
        return current;
      }

      return items.map((_, index) => current[index] ?? true);
    });
  }, [items]);

  const handleAdd = () => {
    setExpandedItems((current) => [true, ...current]);
    onAdd();
  };

  const handleRemove = (index: number) => {
    setExpandedItems((current) => current.filter((_, currentIndex) => currentIndex !== index));
    onRemove(index);
  };

  const handleMove = (fromIndex: number, toIndex: number) => {
    if (!onMove || fromIndex === toIndex) {
      return;
    }

    setExpandedItems((current) => moveStackItem(current, fromIndex, toIndex));
    onMove(fromIndex, toIndex);
  };

  const handleToggle = (index: number) => {
    setExpandedItems((current) => current.map((expanded, currentIndex) => (currentIndex === index ? !expanded : expanded)));
  };

  const stopPointerPropagation = (event: ReactPointerEvent<HTMLButtonElement> | ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  return (
    <section data-stack-field={label} className="gl-field flex w-full min-w-0 flex-1 flex-col gap-1 rounded-md text-foreground">
      <header className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium leading-4 text-muted-foreground">{label}</span>
        <button
          type="button"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border text-[12px] leading-none text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={`添加${label}`}
          disabled={disabled}
          onPointerDown={stopPointerPropagation}
          onMouseDown={stopPointerPropagation}
          onClick={(event) => {
            event.stopPropagation();
            handleAdd();
          }}
        >
          <span aria-hidden="true">+</span>
        </button>
      </header>
      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-2 py-2 text-[10px] leading-4 text-muted-foreground">
          {mixed ? '混合' : emptyText}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((item, index) => {
            const expanded = expandedItems[index] ?? true;
            const isDragging = draggedIndex === index;
            const isDropTarget = dropIndex === index;
            const dragHandleProps: StackDragHandleProps = {
              draggable: sortable && !disabled,
              onDragStart: () => {
                if (!sortable || disabled) {
                  return;
                }

                setDraggedIndex(index);
                setDropIndex(index);
              },
              onDragEnd: () => {
                setDraggedIndex(null);
                setDropIndex(null);
              },
            };
            return (
              <article
                key={index}
                className={[
                  'overflow-hidden rounded-lg border border-border bg-background',
                  isDragging ? 'opacity-50' : '',
                  isDropTarget ? 'relative before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-primary' : '',
                ].join(' ')}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onDragOver={(event) => {
                  if (!sortable || disabled || draggedIndex === null) {
                    return;
                  }

                  event.preventDefault();
                  if (dropIndex !== index) {
                    setDropIndex(index);
                  }
                }}
                onDrop={(event) => {
                  if (!sortable || disabled || draggedIndex === null) {
                    return;
                  }

                  event.preventDefault();
                  event.stopPropagation();
                  const sourceIndex = draggedIndex;
                  const targetIndex = index;
                  setDraggedIndex(null);
                  setDropIndex(null);
                  handleMove(sourceIndex, targetIndex);
                }}
              >
                <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1.5">
                  <div className="flex min-w-0 flex-1 items-center gap-1">
                    {renderItemLeading ? <div className="shrink-0">{renderItemLeading(item, index, expanded, dragHandleProps)}</div> : null}
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-1 text-left"
                      aria-expanded={expanded}
                      onPointerDown={stopPointerPropagation}
                      onMouseDown={stopPointerPropagation}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleToggle(index);
                      }}
                    >
                      <span aria-hidden="true" className="text-[11px] leading-4 text-muted-foreground">
                        {expanded ? '▾' : '▸'}
                      </span>
                      <span className="truncate text-[11px] font-medium leading-4 text-foreground">
                        {getTitle(item, index)}
                      </span>
                    </button>
                  </div>
                  <button
                    type="button"
                    className="rounded px-1 text-[10px] leading-4 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`删除${getTitle(item, index)}`}
                    disabled={disabled}
                    onPointerDown={stopPointerPropagation}
                    onMouseDown={stopPointerPropagation}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleRemove(index);
                    }}
                  >
                    删除
                  </button>
                </div>
                {expanded ? <div className="px-2 py-2">{renderItem(item, index)}</div> : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
