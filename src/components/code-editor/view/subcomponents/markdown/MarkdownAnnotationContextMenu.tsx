import { useEffect, useRef } from 'react';

type MarkdownAnnotationContextMenuProps = {
  isOpen: boolean;
  position: {
    x: number;
    y: number;
  };
  canCreate: boolean;
  onCreate: () => void;
  onClose: () => void;
};

export default function MarkdownAnnotationContextMenu({
  isOpen,
  position,
  canCreate,
  onCreate,
  onClose,
}: MarkdownAnnotationContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleOutsideMouseDown = (event: MouseEvent) => {
      const menuElement = menuRef.current;
      if (menuElement && !menuElement.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscapeKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleOutsideMouseDown);
    document.addEventListener('keydown', handleEscapeKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleOutsideMouseDown);
      document.removeEventListener('keydown', handleEscapeKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !canCreate) {
    return null;
  }

  return (
    <div
      ref={menuRef}
      data-markdown-annotation-overlay="true"
      role="menu"
      aria-label="Markdown annotation menu"
      style={{ position: 'fixed', left: position.x, top: position.y, zIndex: 9999 }}
      className="min-w-[160px] rounded-lg border border-border bg-popover p-1 shadow-lg"
    >
      <button
        type="button"
        role="menuitem"
        onClick={onCreate}
        className="w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent focus:bg-accent focus:outline-none"
      >
        添加标注
      </button>
    </div>
  );
}
