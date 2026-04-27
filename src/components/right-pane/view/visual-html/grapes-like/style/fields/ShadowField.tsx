import { useEffect, useRef, useState } from 'react';
import type { ShadowLayerValue, ShadowValue } from '../../types';
import NumberField from './NumberField';
import ColorField from './ColorField';
import SelectField from './SelectField';
import StackField, { moveStackItem } from './StackField';

type ShadowFieldProps = {
  label: string;
  value: ShadowValue | null | undefined;
  mixed?: boolean;
  disabled?: boolean;
  onCommit: (value: ShadowValue) => void;
};

const SHADOW_UNITS = ['px', 'em', 'rem', '%'] as const;

export function buildDefaultShadowLayer(): ShadowLayerValue {
  return {
    horizontal: { value: '0', unit: 'px' },
    vertical: { value: '2', unit: 'px' },
    blur: { value: '8', unit: 'px' },
    spread: { value: '0', unit: 'px' },
    color: 'rgba(0, 0, 0, 0.16)',
    type: 'outside',
  };
}

function normalizeShadowLayer(layer: Partial<ShadowLayerValue> | null | undefined): ShadowLayerValue {
  return {
    horizontal: {
      value: String(layer?.horizontal?.value ?? ''),
      unit: String(layer?.horizontal?.unit ?? ''),
    },
    vertical: {
      value: String(layer?.vertical?.value ?? ''),
      unit: String(layer?.vertical?.unit ?? ''),
    },
    blur: {
      value: String(layer?.blur?.value ?? ''),
      unit: String(layer?.blur?.unit ?? ''),
    },
    spread: {
      value: String(layer?.spread?.value ?? ''),
      unit: String(layer?.spread?.unit ?? ''),
    },
    color: String(layer?.color ?? ''),
    type: layer?.type === 'inset' ? 'inset' : 'outside',
  };
}

function cloneShadowValue(value: ShadowValue | null | undefined): ShadowValue {
  const layers = Array.isArray(value?.layers) ? value?.layers ?? [] : [];
  return {
    layers: layers.map((layer) => normalizeShadowLayer(layer)),
  };
}

export function addShadowLayer(value: ShadowValue | null | undefined, layer: ShadowLayerValue = buildDefaultShadowLayer()): ShadowValue {
  const layers = Array.isArray(value?.layers) ? value?.layers ?? [] : [];
  return {
    layers: [normalizeShadowLayer(layer), ...layers],
  };
}

export function removeShadowLayer(value: ShadowValue | null | undefined, index: number): ShadowValue {
  const layers = Array.isArray(value?.layers) ? value?.layers ?? [] : [];
  return {
    layers: layers.filter((_, layerIndex) => layerIndex !== index),
  };
}

export function updateShadowLayer(
  value: ShadowValue | null | undefined,
  index: number,
  patch: Partial<ShadowLayerValue>,
): ShadowValue {
  const layers = Array.isArray(value?.layers) ? value?.layers ?? [] : [];
  return {
    layers: layers.map((layer, layerIndex) => {
      if (layerIndex !== index) {
        return layer;
      }

      return {
        horizontal: patch.horizontal ? { value: String(patch.horizontal.value ?? ''), unit: String(patch.horizontal.unit ?? '') } : { ...layer.horizontal },
        vertical: patch.vertical ? { value: String(patch.vertical.value ?? ''), unit: String(patch.vertical.unit ?? '') } : { ...layer.vertical },
        blur: patch.blur ? { value: String(patch.blur.value ?? ''), unit: String(patch.blur.unit ?? '') } : { ...layer.blur },
        spread: patch.spread ? { value: String(patch.spread.value ?? ''), unit: String(patch.spread.unit ?? '') } : { ...layer.spread },
        color: patch.color ?? layer.color,
        type: patch.type ?? layer.type,
      };
    }),
  };
}

function formatShadowUnit(value: { value: string; unit: string }): string {
  const rawValue = String(value.value ?? '').trim();
  if (!rawValue) {
    return '';
  }

  const unit = String(value.unit ?? '').trim();
  return unit ? `${rawValue}${unit}` : rawValue;
}

function formatShadowLayer(value: ShadowLayerValue): string {
  return [
    value.type === 'inset' ? 'inset' : '',
    formatShadowUnit(value.horizontal),
    formatShadowUnit(value.vertical),
    formatShadowUnit(value.blur),
    formatShadowUnit(value.spread),
    String(value.color ?? '').trim(),
  ].filter(Boolean).join(' ').trim();
}

function buildShadowPreviewStyle(layer: ShadowLayerValue): { boxShadow: string } {
  return {
    boxShadow: formatShadowLayer(layer),
  };
}

export function stringifyShadowValue(value: ShadowValue): string {
  return value.layers
    .map((layer) => formatShadowLayer(layer))
    .filter(Boolean)
    .join(', ');
}

export default function ShadowField({
  label,
  value,
  mixed = false,
  disabled = false,
  onCommit,
}: ShadowFieldProps) {
  const [shadowValue, setShadowValue] = useState<ShadowValue>(() => cloneShadowValue(value));
  const shadowValueRef = useRef<ShadowValue>(shadowValue);
  const valueSignature = stringifyShadowValue(cloneShadowValue(value));

  useEffect(() => {
    const nextValue = cloneShadowValue(value);
    shadowValueRef.current = nextValue;
    setShadowValue(nextValue);
  }, [valueSignature]);

  const commit = (updater: (current: ShadowValue) => ShadowValue) => {
    const nextValue = updater(shadowValueRef.current);
    shadowValueRef.current = nextValue;
    setShadowValue(nextValue);
    onCommit(nextValue);
  };

  return (
    <StackField
      label={label}
      items={shadowValue.layers}
      mixed={mixed}
      disabled={disabled}
      sortable
      emptyText="点击 + 添加投影"
      getTitle={(_, index) => `投影 ${index + 1}`}
      renderItemLeading={(layer, _index, _expanded, dragHandleProps) => (
        <div className="flex items-center gap-1">
          <div
            data-shadow-preview
            className="h-4 w-4 rounded-sm border border-border bg-background"
            style={buildShadowPreviewStyle(layer)}
          />
          <button
            data-shadow-move
            type="button"
            className="flex h-4 w-4 items-center justify-center rounded text-[11px] leading-none text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={`拖动${label}`}
            title="拖动排序"
            {...dragHandleProps}
          >
            ⋮⋮
          </button>
        </div>
      )}
      onAdd={() => {
        commit((current) => addShadowLayer(current));
      }}
      onRemove={(index) => {
        commit((current) => removeShadowLayer(current, index));
      }}
      onMove={(fromIndex, toIndex) => {
        commit((current) => ({
          layers: moveStackItem(current.layers, fromIndex, toIndex),
        }));
      }}
      renderItem={(layer, index) => (
        <div className="grid grid-cols-2 gap-1">
          <NumberField
            label="水平"
            value={layer.horizontal}
            units={SHADOW_UNITS}
            mixed={mixed}
            disabled={disabled}
            onCommit={(nextValue) => {
              commit((current) => updateShadowLayer(current, index, { horizontal: nextValue }));
            }}
          />
          <NumberField
            label="垂直"
            value={layer.vertical}
            units={SHADOW_UNITS}
            mixed={mixed}
            disabled={disabled}
            onCommit={(nextValue) => {
              commit((current) => updateShadowLayer(current, index, { vertical: nextValue }));
            }}
          />
          <NumberField
            label="模糊"
            value={layer.blur}
            units={SHADOW_UNITS}
            mixed={mixed}
            disabled={disabled}
            onCommit={(nextValue) => {
              commit((current) => updateShadowLayer(current, index, { blur: nextValue }));
            }}
          />
          <NumberField
            label="扩散"
            value={layer.spread}
            units={SHADOW_UNITS}
            mixed={mixed}
            disabled={disabled}
            onCommit={(nextValue) => {
              commit((current) => updateShadowLayer(current, index, { spread: nextValue }));
            }}
          />
          <ColorField
            label="颜色"
            value={layer.color}
            placeholder="rgba(0, 0, 0, 0.16)"
            mixed={mixed}
            disabled={disabled}
            onCommit={(nextValue) => {
              commit((current) => updateShadowLayer(current, index, { color: nextValue }));
            }}
          />
          <SelectField
            label="类型"
            value={layer.type}
            options={[
              { value: 'outside', label: 'Outside' },
              { value: 'inset', label: 'Inset' },
            ]}
            mixed={mixed}
            disabled={disabled}
            onCommit={(nextValue) => {
              commit((current) => updateShadowLayer(current, index, { type: nextValue === 'inset' ? 'inset' : 'outside' }));
            }}
          />
        </div>
      )}
    />
  );
}
