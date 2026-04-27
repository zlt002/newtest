import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { UnitValue } from '../../types';

type NumberFieldProps = {
  label: string;
  value: UnitValue;
  units?: readonly string[];
  placeholder?: string;
  mixed?: boolean;
  disabled?: boolean;
  onCommit: (value: UnitValue) => void;
};

function getDefaultUnit(units: readonly string[], unit: string): string {
  if (unit) {
    return unit;
  }

  if (units.includes('px')) {
    return 'px';
  }

  return units[0] ?? '';
}

export function syncNumberFieldState(
  current: { draft: string; unit: string },
  previousValue: UnitValue,
  value: UnitValue,
  units: readonly string[] = [],
) {
  const prev = {
    draft: String(previousValue.value ?? ''),
    unit: getDefaultUnit(units, String(previousValue.unit ?? '')),
  };
  const next = {
    draft: String(value.value ?? ''),
    unit: getDefaultUnit(units, String(value.unit ?? '')),
  };

  if (prev.draft === next.draft && prev.unit === next.unit) {
    return current;
  }

  return next;
}

function formatDraggedNumber(value: number) {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(2).replace(/\.?0+$/, '');
}

export function applyDragDeltaToNumberField(
  current: UnitValue,
  deltaX: number,
  modifiers: { shiftKey?: boolean; altKey?: boolean },
): UnitValue {
  const parsed = Number(current.value);
  if (!Number.isFinite(parsed)) {
    return current;
  }

  const step = modifiers.altKey ? 10 : modifiers.shiftKey ? 0.1 : 1;

  return {
    value: formatDraggedNumber(parsed + (deltaX * step)),
    unit: current.unit || 'px',
  };
}

function readNumberFieldState(value: UnitValue, units: readonly string[]) {
  return {
    draft: String(value.value ?? ''),
    unit: getDefaultUnit(units, String(value.unit ?? '')),
  };
}

export default function NumberField({
  label,
  value,
  units = [],
  placeholder,
  mixed = false,
  disabled = false,
  onCommit,
}: NumberFieldProps) {
  const [draft, setDraft] = useState(() => readNumberFieldState(value, units).draft);
  const [unit, setUnit] = useState(() => readNumberFieldState(value, units).unit);
  const previousValueRef = useRef<UnitValue>(value);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startValue: UnitValue;
  } | null>(null);

  useEffect(() => {
    const next = syncNumberFieldState({ draft, unit }, previousValueRef.current, value, units);
    setDraft(next.draft);
    setUnit(next.unit);
    previousValueRef.current = value;
  }, [units, value]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      const nextValue = applyDragDeltaToNumberField(
        dragState.startValue,
        Math.round((event.clientX - dragState.startX) / 4),
        {
          shiftKey: event.shiftKey,
          altKey: event.altKey,
        },
      );

      setDraft(nextValue.value);
      setUnit(nextValue.unit);
      onCommit(nextValue);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      dragStateRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [onCommit]);

  const unitSelectStyle: CSSProperties = {
    appearance: 'none',
    backgroundImage: 'none',
    WebkitAppearance: 'none',
  };

  return (
    <label className="gl-field flex w-full min-w-0 flex-1 flex-col gap-0.5 rounded-md text-foreground">
      <span className="text-[10px] font-medium leading-4 text-muted-foreground">{label}</span>
      <div className="flex h-8 min-w-0 items-center gap-1 rounded-md border border-border bg-background px-1 py-1 transition-colors focus-within:bg-accent hover:bg-accent">
        <button
          type="button"
          aria-label={`拖动 ${label}`}
          className="flex h-4 w-3 shrink-0 cursor-ew-resize items-center justify-center text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          onPointerDown={(event) => {
            dragStateRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startValue: {
                value: draft,
                unit: getDefaultUnit(units, unit),
              },
            };
          }}
        >
          <span aria-hidden="true">↔</span>
        </button>
        <input
          aria-label={label}
          className="gl-input min-w-0 flex-1 bg-transparent px-0.5 py-0 text-xs leading-4 outline-none"
          placeholder={mixed ? '混合' : placeholder}
          value={draft}
          disabled={disabled}
          inputMode="decimal"
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onBlur={() => {
            onCommit({
              value: draft,
              unit: getDefaultUnit(units, unit),
            });
          }}
        />
        {units.length > 0 ? (
          <div className="relative min-w-0 shrink-0">
            <select
              aria-label={`${label} 单位`}
              className="gl-input w-full appearance-none border-l border-border bg-transparent py-0 pl-2 pr-1 text-xs leading-4 text-foreground outline-none"
              style={unitSelectStyle}
              value={unit}
              disabled={disabled}
              onChange={(event) => {
                const nextUnit = event.target.value;
                setUnit(nextUnit);
                onCommit({
                  value: draft,
                  unit: getDefaultUnit(units, nextUnit),
                });
              }}
            >
              {units.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
    </label>
  );
}
