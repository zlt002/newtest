import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { UnitValue } from '../../types';

type NumberFieldProps = {
  label: string;
  value: UnitValue;
  units?: readonly string[];
  keywordOptions?: readonly string[];
  placeholder?: string;
  mixed?: boolean;
  disabled?: boolean;
  onCommit: (value: UnitValue) => void;
};

function isCssKeywordValue(value: string, keywordOptions: readonly string[]): boolean {
  const normalized = value.trim().toLowerCase();
  return keywordOptions.some((keyword) => keyword.toLowerCase() === normalized);
}

function isNumericValue(value: string): boolean {
  return /^-?\d*\.?\d+$/.test(value.trim());
}

function isCompleteCssValue(value: string, keywordOptions: readonly string[]): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  return isCssKeywordValue(trimmed, keywordOptions)
    || /^(auto|none|inherit|initial|unset|revert)$/i.test(trimmed)
    || /^(calc|min|max|clamp|var)\(/i.test(trimmed)
    || !isNumericValue(trimmed);
}

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
  keywordOptions: readonly string[] = [],
) {
  const prev = {
    draft: String(previousValue.value ?? ''),
    unit: isCompleteCssValue(String(previousValue.value ?? ''), keywordOptions)
      ? String(previousValue.unit ?? '')
      : getDefaultUnit(units, String(previousValue.unit ?? '')),
  };
  const next = {
    draft: String(value.value ?? ''),
    unit: isCompleteCssValue(String(value.value ?? ''), keywordOptions)
      ? String(value.unit ?? '')
      : getDefaultUnit(units, String(value.unit ?? '')),
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
    unit: current.unit && current.unit !== 'auto' ? current.unit : 'px',
  };
}

function normalizeNumberFieldCommit(
  draft: string,
  unit: string,
  units: readonly string[],
  keywordOptions: readonly string[],
): UnitValue {
  const trimmedDraft = draft.trim();
  if (isCompleteCssValue(trimmedDraft, keywordOptions)) {
    return { value: trimmedDraft, unit: '' };
  }

  if (isCssKeywordValue(unit, keywordOptions)) {
    return { value: unit.trim(), unit: '' };
  }

  return {
    value: trimmedDraft,
    unit: getDefaultUnit(units, unit),
  };
}

function readNumberFieldState(value: UnitValue, units: readonly string[], keywordOptions: readonly string[]) {
  const draft = String(value.value ?? '');
  if (isCompleteCssValue(draft, keywordOptions)) {
    return {
      draft,
      unit: isCssKeywordValue(draft, keywordOptions) ? draft.trim() : '',
    };
  }

  return {
    draft,
    unit: getDefaultUnit(units, String(value.unit ?? '')),
  };
}

function readNumberFieldSignature(value: UnitValue, units: readonly string[], keywordOptions: readonly string[]) {
  const state = readNumberFieldState(value, units, keywordOptions);
  return `${state.draft}\u0000${state.unit}`;
}

export default function NumberField({
  label,
  value,
  units = [],
  keywordOptions = [],
  placeholder,
  mixed = false,
  disabled = false,
  onCommit,
}: NumberFieldProps) {
  const selectOptions = [...units, ...keywordOptions];
  const [draft, setDraft] = useState(() => readNumberFieldState(value, units, keywordOptions).draft);
  const [unit, setUnit] = useState(() => readNumberFieldState(value, units, keywordOptions).unit);
  const [isEditing, setIsEditing] = useState(false);
  const previousValueRef = useRef<UnitValue>(value);
  const previousValueSignatureRef = useRef(readNumberFieldSignature(value, units, keywordOptions));
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startValue: UnitValue;
  } | null>(null);

  useEffect(() => {
    if (isEditing) {
      return;
    }

    const nextSignature = readNumberFieldSignature(value, units, keywordOptions);
    if (previousValueSignatureRef.current !== nextSignature) {
      const next = readNumberFieldState(value, units, keywordOptions);
      setDraft(next.draft);
      setUnit(next.unit);
      previousValueSignatureRef.current = nextSignature;
      previousValueRef.current = value;
      return;
    }

    const next = syncNumberFieldState({ draft, unit }, previousValueRef.current, value, units, keywordOptions);
    setDraft(next.draft);
    setUnit(next.unit);
    previousValueSignatureRef.current = nextSignature;
    previousValueRef.current = value;
  }, [draft, isEditing, keywordOptions, unit, units, value, value.unit, value.value]);

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
  const syncedState = readNumberFieldState(value, units, keywordOptions);
  const displayDraft = isEditing ? draft : syncedState.draft;
  const displayUnit = isEditing ? unit : syncedState.unit;
  const needsCustomUnitOption = displayUnit === '' && isCompleteCssValue(displayDraft, keywordOptions);
  const resolvedSelectOptions = needsCustomUnitOption ? ['', ...selectOptions] : selectOptions;

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
                value: displayDraft,
                unit: isCompleteCssValue(displayDraft, keywordOptions) ? '' : getDefaultUnit(units, displayUnit),
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
          value={displayDraft}
          disabled={disabled}
          inputMode="decimal"
          onFocus={() => {
            setIsEditing(true);
            setDraft(displayDraft);
            setUnit(displayUnit);
          }}
          onChange={(event) => {
            setIsEditing(true);
            setDraft(event.target.value);
            if (isCompleteCssValue(unit, keywordOptions) && !isCompleteCssValue(event.target.value, keywordOptions)) {
              setUnit(getDefaultUnit(units, ''));
            }
          }}
          onBlur={() => {
            onCommit(normalizeNumberFieldCommit(draft, unit, units, keywordOptions));
            setIsEditing(false);
          }}
        />
        {resolvedSelectOptions.length > 0 ? (
          <div className="relative min-w-0 shrink-0">
            <select
              aria-label={`${label} 单位`}
              className="gl-input w-full appearance-none border-l border-border bg-transparent py-0 pl-2 pr-1 text-xs leading-4 text-foreground outline-none"
              style={unitSelectStyle}
              value={displayUnit}
              disabled={disabled}
              onChange={(event) => {
                const nextUnit = event.target.value;
                const nextValue = isCssKeywordValue(nextUnit, keywordOptions) ? nextUnit : (isCompleteCssValue(displayDraft, keywordOptions) ? '' : displayDraft);
                setIsEditing(true);
                setDraft(nextValue);
                setUnit(nextUnit);
                onCommit(normalizeNumberFieldCommit(nextValue, nextUnit, units, keywordOptions));
              }}
            >
              {resolvedSelectOptions.map((unit) => (
                <option key={unit} value={unit}>
                  {unit || '自定义'}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
    </label>
  );
}
