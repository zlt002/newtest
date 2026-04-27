import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { CLAUDE_MODELS } from '../../../../../shared/modelConstants';

type ClaudeModelSelectorProps = {
  value: string;
  onChange: (value: string) => void;
  title: string;
  menuPosition?: { top: number; left: number; bottom?: number };
};

const menuBaseStyle: CSSProperties = {
  maxHeight: '300px',
  overflowY: 'auto',
  borderRadius: '8px',
  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  zIndex: 1000,
  padding: '8px',
  transition: 'opacity 150ms ease-in-out, transform 150ms ease-in-out',
};

function getMenuPosition(position?: { top: number; left: number; bottom?: number }): CSSProperties {
  if (typeof window === 'undefined') {
    return { position: 'fixed', left: '16px', bottom: '90px' };
  }

  if (!position) {
    return { position: 'fixed', left: '16px', bottom: '90px' };
  }

  if (window.innerWidth < 640) {
    return {
      position: 'fixed',
      bottom: `${position.bottom ?? 90}px`,
      left: '16px',
      right: '16px',
      width: 'auto',
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: 'min(50vh, 300px)',
    };
  }

  return {
    position: 'fixed',
    bottom: `${Math.max(16, position.bottom ?? 90)}px`,
    left: `${Math.max(16, position.left)}px`,
    width: 'min(320px, calc(100vw - 32px))',
    maxWidth: 'calc(100vw - 32px)',
    maxHeight: '300px',
  };
}

export default function ClaudeModelSelector({
  value,
  onChange,
  title,
  menuPosition,
}: ClaudeModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const currentOption = useMemo(
    () => CLAUDE_MODELS.OPTIONS.find((option) => option.value === value) || CLAUDE_MODELS.OPTIONS[0],
    [value],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (
        target
        && !triggerRef.current?.contains(target)
        && !menuRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((previous) => !previous)}
        className="inline-flex h-7 max-w-[148px] items-center gap-1 rounded-full border border-border/60 bg-background/80 pl-2 pr-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
        title={title}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        data-chat-model-selector="true"
      >
        <span className="truncate font-medium">AI</span>
        <span className="min-w-0 truncate text-[11px] font-medium text-foreground">{currentOption.label}</span>
        <svg className={`h-3 w-3 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          aria-label={title}
          className="command-menu border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
          style={{ ...menuBaseStyle, ...getMenuPosition(menuPosition), opacity: 1, transform: 'translateY(0)' }}
          data-chat-model-selector-menu="true"
        >
          {CLAUDE_MODELS.OPTIONS.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                onMouseDown={(event) => event.preventDefault()}
                className={`command-item mb-0.5 flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors ${
                  isSelected ? 'bg-blue-50 dark:bg-blue-900' : 'bg-transparent hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                  AI
                </span>
                <span className={`min-w-0 flex-1 truncate text-sm font-medium ${isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                  {option.label}
                </span>
                {isSelected ? (
                  <span className="command-metadata-badge rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                    当前
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
