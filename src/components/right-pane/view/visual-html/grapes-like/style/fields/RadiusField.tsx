import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { RadiusValue } from '../../types';
import { applyDragDeltaToNumberField } from './NumberField';

type RadiusFieldProps = {
  label: string;
  value: RadiusValue;
  mixed?: boolean;
  disabled?: boolean;
  onCommit: (value: RadiusValue) => void;
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

function isUniformRadiusValue(value: RadiusValue): boolean {
  return value.topLeft === value.topRight
    && value.topRight === value.bottomRight
    && value.bottomRight === value.bottomLeft;
}

function getUnifiedRadiusValue(value: RadiusValue): string {
  return value.topLeft || value.topRight || value.bottomRight || value.bottomLeft || '';
}

function RadiusNumberInput({
  label,
  value,
  unit,
  units,
  mixed = false,
  disabled = false,
  dense = false,
  onCommit,
}: {
  label: string;
  value: string;
  unit: string;
  units: readonly string[];
  mixed?: boolean;
  disabled?: boolean;
  dense?: boolean;
  onCommit: (next: { value: string; unit: string }) => void;
}) {
  const rowStyle: CSSProperties = {
    appearance: 'none',
    backgroundImage: 'none',
    WebkitAppearance: 'none',
  };
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startValue: { value: string; unit: string };
  } | null>(null);

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

  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[10px] leading-4 text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-1 rounded-md border border-border bg-background px-1 py-1 transition-colors focus-within:bg-accent hover:bg-accent">
        <button
          type="button"
          aria-label={`拖动 ${label}`}
          className="flex h-4 w-3 shrink-0 cursor-ew-resize items-center justify-center text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          disabled={disabled}
          onPointerDown={(event) => {
            dragStateRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startValue: {
                value,
                unit: getDefaultUnit(units, unit),
              },
            };
          }}
        >
          <span aria-hidden="true">↔</span>
        </button>
        <input
          aria-label={`${label} 值`}
          className="gl-input min-w-0 flex-1 bg-transparent px-0.5 py-0 text-xs leading-4 outline-none"
          placeholder={mixed ? '混合' : ''}
          value={value}
          disabled={disabled}
          inputMode="decimal"
          onChange={(event) => {
            onCommit({ value: event.target.value, unit: getDefaultUnit(units, unit) });
          }}
        />
        {units.length > 0 ? (
          <div className={dense ? 'relative w-9 min-w-0 shrink-0' : 'relative w-11 min-w-0 shrink-0'}>
            <select
              aria-label={`${label} 单位`}
              className="gl-input w-full appearance-none border-l border-border bg-transparent py-0 pl-2 pr-1 text-xs leading-4 text-foreground outline-none"
              style={rowStyle}
              value={getDefaultUnit(units, unit)}
              disabled={disabled}
              onChange={(event) => {
                onCommit({ value, unit: getDefaultUnit(units, event.target.value) });
              }}
            >
              {units.map((nextUnit) => (
                <option key={nextUnit} value={nextUnit}>
                  {nextUnit}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
    </label>
  );
}

export default function RadiusField({
  label,
  value,
  mixed = false,
  disabled = false,
  onCommit,
}: RadiusFieldProps) {
  const unitChoices = ['px', '%', 'em', 'rem'] as const;
  const radiusEntries = [
    ['topLeft', '左上'],
    ['topRight', '右上'],
    ['bottomRight', '右下'],
    ['bottomLeft', '左下'],
  ] as const;
  const resolvedUnit = getDefaultUnit(unitChoices, value.unit);
  const [mode, setMode] = useState<'split' | 'unified'>(() => (mixed || !isUniformRadiusValue(value) ? 'split' : 'unified'));

  useEffect(() => {
    setMode(mixed || !isUniformRadiusValue(value) ? 'split' : 'unified');
  }, [mixed, value.bottomLeft, value.bottomRight, value.topLeft, value.topRight, value.unit]);

  return (
    <section data-radius-field={label} className="gl-field flex w-full min-w-0 flex-1 flex-col gap-0.5 rounded-md py-1 text-foreground">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium leading-4 text-muted-foreground">{label}</span>
        <button
          type="button"
          className="inline-flex h-5 shrink-0 items-center justify-center rounded border border-border px-1.5 text-[10px] leading-none text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          aria-label={mode === 'split' ? '切换到统一设置' : '切换到四向设置'}
          disabled={disabled}
          onClick={() => {
            setMode((current) => (current === 'split' ? 'unified' : 'split'));
          }}
        >
          {mode === 'split' ? '统一' : '四向'}
        </button>
      </div>
      {mode === 'unified' ? (
        <div data-radius-field-mode="unified">
          <RadiusNumberInput
            label={`${label} 整体`}
            value={getUnifiedRadiusValue(value)}
            unit={resolvedUnit}
            units={unitChoices}
            mixed={mixed}
            disabled={disabled}
            onCommit={(next) => {
              onCommit({
                topLeft: next.value,
                topRight: next.value,
                bottomRight: next.value,
                bottomLeft: next.value,
                unit: next.unit,
              });
            }}
          />
        </div>
      ) : (
        <div data-radius-field-mode="split" className="grid grid-cols-2 gap-1">
          {radiusEntries.map(([key, itemLabel]) => (
            <RadiusNumberInput
              key={key}
              label={itemLabel}
              value={value[key] ?? ''}
              unit={resolvedUnit}
              units={unitChoices}
              mixed={mixed}
              disabled={disabled}
              dense
              onCommit={(next) => {
                onCommit({
                  ...value,
                  [key]: next.value,
                  unit: next.unit,
                });
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}
