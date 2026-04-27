import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignHorizontalDistributeCenter,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignHorizontalSpaceAround,
  AlignHorizontalSpaceBetween,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalSpaceAround,
  AlignVerticalSpaceBetween,
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  LocateFixed,
  LayoutGrid,
  LayoutPanelTop,
  Minus,
  Move,
  PanelLeft,
  Pin,
  StretchVertical,
  Square,
  Text,
  WrapText,
  X,
} from 'lucide-react';
import type { ComponentType } from 'react';

type RadioOption = {
  value: string;
  label: string;
  icon?: string;
};

type RadioFieldProps = {
  label: string;
  value: string;
  options: readonly (string | RadioOption)[];
  mixed?: boolean;
  disabled?: boolean;
  onCommit: (value: string) => void;
};

function normalizeOption(option: string | RadioOption): RadioOption {
  return typeof option === 'string' ? { value: option, label: option } : option;
}

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignHorizontalDistributeCenter,
  AlignHorizontalSpaceAround,
  AlignHorizontalSpaceBetween,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalSpaceAround,
  AlignVerticalSpaceBetween,
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  LocateFixed,
  LayoutGrid,
  LayoutPanelTop,
  Minus,
  Move,
  PanelLeft,
  Pin,
  StretchVertical,
  Square,
  Text,
  WrapText,
  X,
};

export default function RadioField({
  label,
  value,
  options,
  mixed = false,
  disabled = false,
  onCommit,
}: RadioFieldProps) {
  return (
    <fieldset className="gl-field flex w-full min-w-0 flex-1 flex-col gap-0.5 rounded-md text-foreground">
      <legend className="text-[10px] font-medium leading-4 text-muted-foreground">{label}</legend>
      <div
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${Math.max(options.length, 1)}, minmax(0, 1fr))` }}
      >
        {options.map((option) => {
          const normalized = normalizeOption(option);
          const checked = normalized.value === value;
          const Icon = normalized.icon ? ICONS[normalized.icon] : null;
          return (
            <button
              key={normalized.value}
              type="button"
              aria-pressed={checked}
              aria-label={normalized.label}
              title={normalized.label}
              disabled={disabled}
              className={[
                'min-w-0 rounded-md border border-border px-0.5 py-0.5 text-[11px] leading-4 transition-colors',
                checked ? 'border-primary/30 bg-primary/10 text-primary' : 'bg-background text-muted-foreground hover:bg-accent hover:text-foreground',
                mixed ? 'opacity-70' : '',
              ].join(' ')}
              onClick={() => {
                onCommit(normalized.value);
              }}
            >
              {Icon ? (
                <span className="flex min-h-6 items-center justify-center">
                  <Icon aria-hidden="true" className="h-3 w-3" />
                  <span className="sr-only">{normalized.label}</span>
                </span>
              ) : (
                <span className="block break-words text-center text-[10px] leading-3">{normalized.label}</span>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
