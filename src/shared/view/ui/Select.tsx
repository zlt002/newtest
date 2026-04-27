import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../../lib/utils.js';
import { getSelectLabel, type SelectOption } from './Select.shared';

type SelectProps = {
  value: string;
  options: SelectOption[];
  onValueChange: (value: string) => void;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  size?: 'sm' | 'default';
  align?: 'left' | 'right';
  ariaLabel?: string;
};

export function Select({
  value,
  options,
  onValueChange,
  className,
  triggerClassName,
  contentClassName,
  size = 'default',
  align = 'left',
  ariaLabel,
}: SelectProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const selectedLabel = getSelectLabel(options, value);
  const triggerSizeClass = size === 'sm' ? 'h-9 text-sm' : 'h-10 text-sm';

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={cn(
          'flex justify-between items-center px-3 py-1 w-full text-left rounded-md border shadow-sm transition-colors border-input bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          triggerSizeClass,
          triggerClassName,
        )}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown className={cn('h-4 w-3 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div
          className={cn(
            'absolute top-[calc(100%+0.375rem)] z-50 min-w-full overflow-hidden rounded-md border border-input bg-background p-1 shadow-md',
            align === 'right' ? 'right-0' : 'left-0',
            contentClassName,
          )}
        >
          <div role="listbox" aria-label={ariaLabel}>
            {options.map((option) => {
              const isSelected = option.value === value;

              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={cn(
                    'flex w-full items-center justify-between rounded-sm px-2.5 py-2 text-sm transition-colors',
                    isSelected
                      ? 'bg-accent text-accent-foreground'
                      : 'text-foreground hover:bg-accent/60',
                  )}
                  onClick={() => {
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span>{option.label}</span>
                 
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
