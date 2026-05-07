import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { BoxValue, BorderValue, RadiusValue, ShadowValue, StylePropertyViewModel, StyleSectorKey, StyleStatePatch, TransitionLayerValue, TransitionValue, TransformLayerValue, TransformValue, UnitValue } from '../types';
import CompositeField from './fields/CompositeField';
import BoxField from './fields/BoxField';
import ColorField from './fields/ColorField';
import NumberField from './fields/NumberField';
import RadioField from './fields/RadioField';
import RadiusField from './fields/RadiusField';
import SelectField from './fields/SelectField';
import TextField from './fields/TextField';
import ShadowField, { stringifyShadowValue } from './fields/ShadowField';
import StackField, { moveStackItem } from './fields/StackField';

export type GrapesLikePropertyDefinition = {
  label: string;
  property: string;
  kind: 'number' | 'select' | 'radio' | 'composite' | 'color' | 'text' | 'shadow' | 'stack';
};

type GrapesLikePropertyProps = {
  property: StylePropertyViewModel;
  targetKind: 'rule' | 'inline';
  onCommit: (
    value: string,
    patchValue?: UnitValue | BoxValue | BorderValue | RadiusValue | ShadowValue | TransitionValue | TransformValue | string,
  ) => void;
};

function getPropertyLayoutClass(property: StylePropertyViewModel): string {
  if (property.kind === 'composite' || property.kind === 'radio' || property.kind === 'shadow' || property.kind === 'stack') {
    return 'gl-property gl-property-compact col-span-full w-full';
  }

  return 'gl-property gl-property-compact col-span-1 w-full';
}

export function createStylePropertyPatch(
  sector: StyleSectorKey,
  property: string,
  value: UnitValue | BoxValue | BorderValue | RadiusValue | ShadowValue | TransitionValue | TransformValue | string,
): StyleStatePatch {
  return {
    [sector]: {
      [property]: value,
    },
  } as StyleStatePatch;
}

function readScalarValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (!value || typeof value !== 'object') {
    return '';
  }

  const record = value as Partial<UnitValue>;
  return String(record.value ?? '');
}

function asUnitValue(value: unknown): UnitValue {
  if (!value || typeof value !== 'object') {
    return { value: '', unit: '' };
  }

  const record = value as Partial<UnitValue>;
  return {
    value: String(record.value ?? ''),
    unit: String(record.unit ?? ''),
  };
}

function asBoxValue(value: unknown): BoxValue {
  if (!value || typeof value !== 'object') {
    return { top: '', right: '', bottom: '', left: '', unit: '' };
  }

  const record = value as Partial<BoxValue>;
  return {
    top: String(record.top ?? ''),
    right: String(record.right ?? ''),
    bottom: String(record.bottom ?? ''),
    left: String(record.left ?? ''),
    unit: String(record.unit ?? ''),
  };
}

function asRadiusValue(value: unknown): RadiusValue {
  if (!value || typeof value !== 'object') {
    return { topLeft: '', topRight: '', bottomRight: '', bottomLeft: '', unit: '' };
  }

  const record = value as Partial<RadiusValue>;
  return {
    topLeft: String(record.topLeft ?? ''),
    topRight: String(record.topRight ?? ''),
    bottomRight: String(record.bottomRight ?? ''),
    bottomLeft: String(record.bottomLeft ?? ''),
    unit: String(record.unit ?? ''),
  };
}

function asBorderValue(value: unknown): BorderValue {
  if (!value || typeof value !== 'object') {
    return { top: '', right: '', bottom: '', left: '', unit: '', style: '', color: '' };
  }

  const record = value as Partial<BorderValue>;
  return {
    top: String(record.top ?? ''),
    right: String(record.right ?? ''),
    bottom: String(record.bottom ?? ''),
    left: String(record.left ?? ''),
    unit: String(record.unit ?? ''),
    style: String(record.style ?? ''),
    color: String(record.color ?? ''),
    topStyle: String(record.topStyle ?? record.style ?? ''),
    rightStyle: String(record.rightStyle ?? record.style ?? ''),
    bottomStyle: String(record.bottomStyle ?? record.style ?? ''),
    leftStyle: String(record.leftStyle ?? record.style ?? ''),
    topColor: String(record.topColor ?? record.color ?? ''),
    rightColor: String(record.rightColor ?? record.color ?? ''),
    bottomColor: String(record.bottomColor ?? record.color ?? ''),
    leftColor: String(record.leftColor ?? record.color ?? ''),
  };
}

function asShadowValue(value: unknown): ShadowValue {
  if (!value || typeof value !== 'object') {
    return { layers: [] };
  }

  const record = value as Partial<ShadowValue>;
  return {
    layers: Array.isArray(record.layers)
      ? record.layers.map((layer) => ({
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
        }))
      : [],
  };
}

function asTransitionValue(value: unknown): TransitionValue {
  if (!value || typeof value !== 'object') {
    return { layers: [] };
  }

  const record = value as Partial<TransitionValue>;
  return {
    layers: Array.isArray(record.layers)
      ? record.layers.map((layer) => ({
          property: String(layer?.property ?? ''),
          duration: {
            value: String(layer?.duration?.value ?? ''),
            unit: String(layer?.duration?.unit ?? ''),
          },
          timingFunction: String(layer?.timingFunction ?? ''),
        }))
      : [],
  };
}

function asTransformValue(value: unknown): TransformValue {
  if (!value || typeof value !== 'object') {
    return { layers: [] };
  }

  const record = value as Partial<TransformValue>;
  return {
    layers: Array.isArray(record.layers)
      ? record.layers.map((layer) => ({
          functionName: String(layer?.functionName ?? ''),
          argument: String(layer?.argument ?? ''),
        }))
      : [],
  };
}

function stringifyUnitValue(value: UnitValue): string {
  const rawValue = String(value.value ?? '').trim();
  const unit = String(value.unit ?? '').trim();
  if (/^(auto|inherit|initial|unset|revert)$/i.test(rawValue)) {
    return rawValue;
  }

  if (/^(auto|inherit|initial|unset|revert)$/i.test(unit)) {
    return unit;
  }

  if (!/^-?\d*\.?\d+$/.test(rawValue)) {
    return rawValue;
  }

  return value.value ? `${value.value}${value.unit}` : '';
}

function stringifyBoxValue(value: BoxValue): string {
  const suffix = value.unit;
  return [value.top, value.right, value.bottom, value.left]
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean)
    .map((entry) => `${entry}${suffix}`)
    .join(' ');
}

function stringifyRadiusValue(value: RadiusValue): string {
  const suffix = value.unit;
  return [value.topLeft, value.topRight, value.bottomRight, value.bottomLeft]
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean)
    .map((entry) => `${entry}${suffix}`)
    .join(' ');
}

function stringifyBorderValue(value: BorderValue): string {
  const width = value.top ? `${value.top}${value.unit}` : '';
  return [width, value.style, value.color].filter(Boolean).join(' ');
}

function getBorderSideStyle(value: BorderValue, side: 'top' | 'right' | 'bottom' | 'left'): string {
  return String(value[`${side}Style` as keyof BorderValue] ?? value.style ?? '');
}

function getBorderSideColor(value: BorderValue, side: 'top' | 'right' | 'bottom' | 'left'): string {
  return String(value[`${side}Color` as keyof BorderValue] ?? value.color ?? '');
}

function isUniformBorderValue(value: BorderValue): boolean {
  const sides = ['top', 'right', 'bottom', 'left'] as const;
  return value.top === value.right
    && value.right === value.bottom
    && value.bottom === value.left
    && sides.every((side) => getBorderSideStyle(value, side) === getBorderSideStyle(value, 'top'))
    && sides.every((side) => getBorderSideColor(value, side) === getBorderSideColor(value, 'top'));
}

function buildDefaultTransitionLayer(): TransitionLayerValue {
  return {
    property: 'all',
    duration: { value: '200', unit: 'ms' },
    timingFunction: 'ease',
  };
}

function buildDefaultTransformLayer(): TransformLayerValue {
  return {
    functionName: 'rotateZ',
    argument: '0deg',
  };
}

function addTransitionLayer(value: TransitionValue, layer: TransitionLayerValue = buildDefaultTransitionLayer()): TransitionValue {
  return {
    layers: [layer, ...value.layers],
  };
}

function removeTransitionLayer(value: TransitionValue, index: number): TransitionValue {
  return {
    layers: value.layers.filter((_, layerIndex) => layerIndex !== index),
  };
}

function updateTransitionLayer(
  value: TransitionValue,
  index: number,
  patch: Partial<TransitionLayerValue>,
): TransitionValue {
  return {
    layers: value.layers.map((layer, layerIndex) => {
      if (layerIndex !== index) {
        return layer;
      }

      return {
        property: patch.property ?? layer.property,
        duration: patch.duration ? { ...patch.duration } : { ...layer.duration },
        timingFunction: patch.timingFunction ?? layer.timingFunction,
      };
    }),
  };
}

function addTransformLayer(value: TransformValue, layer: TransformLayerValue = buildDefaultTransformLayer()): TransformValue {
  return {
    layers: [layer, ...value.layers],
  };
}

function removeTransformLayer(value: TransformValue, index: number): TransformValue {
  return {
    layers: value.layers.filter((_, layerIndex) => layerIndex !== index),
  };
}

function updateTransformLayer(
  value: TransformValue,
  index: number,
  patch: Partial<TransformLayerValue>,
): TransformValue {
  return {
    layers: value.layers.map((layer, layerIndex) => {
      if (layerIndex !== index) {
        return layer;
      }

      return {
        functionName: patch.functionName ?? layer.functionName,
        argument: patch.argument ?? layer.argument,
      };
    }),
  };
}

function stringifyTransitionValue(value: TransitionValue): string {
  return value.layers
    .map((layer) => [
      String(layer.property ?? '').trim(),
      layer.duration.value ? `${layer.duration.value}${layer.duration.unit}` : '',
      String(layer.timingFunction ?? '').trim(),
    ].filter(Boolean).join(' ').trim())
    .filter(Boolean)
    .join(', ');
}

function stringifyTransformValue(value: TransformValue): string {
  return value.layers
    .map((layer) => {
      const functionName = String(layer.functionName ?? '').trim();
      const argument = String(layer.argument ?? '').trim();
      if (!functionName) {
        return argument;
      }
      if (functionName === 'raw') {
        return argument;
      }
      return `${functionName}(${argument})`;
    })
    .filter(Boolean)
    .join(' ');
}

function cloneTransitionValue(value: TransitionValue | null | undefined): TransitionValue {
  const layers = Array.isArray(value?.layers) ? value?.layers ?? [] : [];
  return {
    layers: layers.map((layer) => ({
      property: String(layer?.property ?? ''),
      duration: {
        value: String(layer?.duration?.value ?? ''),
        unit: String(layer?.duration?.unit ?? ''),
      },
      timingFunction: String(layer?.timingFunction ?? ''),
    })),
  };
}

function cloneTransformValue(value: TransformValue | null | undefined): TransformValue {
  const layers = Array.isArray(value?.layers) ? value?.layers ?? [] : [];
  return {
    layers: layers.map((layer) => ({
      functionName: String(layer?.functionName ?? ''),
      argument: String(layer?.argument ?? ''),
    })),
  };
}

function TransitionStackField({
  label,
  value,
  mixed = false,
  disabled = false,
  onCommit,
}: {
  label: string;
  value: TransitionValue | null | undefined;
  mixed?: boolean;
  disabled?: boolean;
  onCommit: (value: TransitionValue) => void;
}) {
  const [transitionValue, setTransitionValue] = useState<TransitionValue>(() => cloneTransitionValue(value));
  const transitionValueRef = useRef<TransitionValue>(transitionValue);
  const valueSignature = stringifyTransitionValue(cloneTransitionValue(value));

  useEffect(() => {
    const nextValue = cloneTransitionValue(value);
    transitionValueRef.current = nextValue;
    setTransitionValue(nextValue);
  }, [valueSignature]);

  const commit = (updater: (current: TransitionValue) => TransitionValue) => {
    const nextValue = updater(transitionValueRef.current);
    transitionValueRef.current = nextValue;
    setTransitionValue(nextValue);
    onCommit(nextValue);
  };

  return (
    <StackField
      label={label}
      items={transitionValue.layers}
      mixed={mixed}
      disabled={disabled}
      sortable
      emptyText="点击 + 添加过渡"
      getTitle={(layer, index) => `${layer.property || '过渡'} ${index + 1}`}
      renderItemLeading={(_layer, _index, _expanded, dragHandleProps) => (
        <button
          type="button"
          data-stack-move
          className="flex h-4 w-4 items-center justify-center rounded text-[11px] leading-none text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={`拖动${label}`}
          title="拖动排序"
          {...dragHandleProps}
        >
          ⋮⋮
        </button>
      )}
      onAdd={() => {
        commit((current) => addTransitionLayer(current));
      }}
      onRemove={(index) => {
        commit((current) => removeTransitionLayer(current, index));
      }}
      onMove={(fromIndex, toIndex) => {
        commit((current) => ({
          layers: moveStackItem(current.layers, fromIndex, toIndex),
        }));
      }}
      renderItem={(layer, index) => (
        <div className="grid grid-cols-2 gap-1">
          <SelectField
            label="属性"
            value={layer.property || 'all'}
            options={[
              { value: 'all', label: 'all' },
              { value: 'width', label: 'width' },
              { value: 'height', label: 'height' },
              { value: 'background-color', label: 'background-color' },
              { value: 'transform', label: 'transform' },
              { value: 'box-shadow', label: 'box-shadow' },
              { value: 'opacity', label: 'opacity' },
            ]}
            mixed={mixed}
            disabled={disabled}
            onCommit={(nextValue) => {
              commit((current) => updateTransitionLayer(current, index, { property: nextValue }));
            }}
          />
          <NumberField
            label="时长"
            value={layer.duration}
            units={['ms', 's']}
            mixed={mixed}
            disabled={disabled}
            onCommit={(nextValue) => {
              commit((current) => updateTransitionLayer(current, index, { duration: nextValue }));
            }}
          />
          <SelectField
            label="缓动"
            value={layer.timingFunction || 'ease'}
            options={[
              { value: 'linear', label: 'linear' },
              { value: 'ease', label: 'ease' },
              { value: 'ease-in', label: 'ease-in' },
              { value: 'ease-out', label: 'ease-out' },
              { value: 'ease-in-out', label: 'ease-in-out' },
            ]}
            mixed={mixed}
            disabled={disabled}
            onCommit={(nextValue) => {
              commit((current) => updateTransitionLayer(current, index, { timingFunction: nextValue }));
            }}
          />
        </div>
      )}
    />
  );
}

function TransformStackField({
  label,
  value,
  mixed = false,
  disabled = false,
  onCommit,
}: {
  label: string;
  value: TransformValue | null | undefined;
  mixed?: boolean;
  disabled?: boolean;
  onCommit: (value: TransformValue) => void;
}) {
  const [transformValue, setTransformValue] = useState<TransformValue>(() => cloneTransformValue(value));
  const transformValueRef = useRef<TransformValue>(transformValue);
  const valueSignature = stringifyTransformValue(cloneTransformValue(value));

  useEffect(() => {
    const nextValue = cloneTransformValue(value);
    transformValueRef.current = nextValue;
    setTransformValue(nextValue);
  }, [valueSignature]);

  const commit = (updater: (current: TransformValue) => TransformValue) => {
    const nextValue = updater(transformValueRef.current);
    transformValueRef.current = nextValue;
    setTransformValue(nextValue);
    onCommit(nextValue);
  };

  return (
    <StackField
      label={label}
      items={transformValue.layers}
      mixed={mixed}
      disabled={disabled}
      sortable
      emptyText="点击 + 添加变换"
      getTitle={(layer, index) => `${layer.functionName || '变换'} ${index + 1}`}
      renderItemLeading={(_layer, _index, _expanded, dragHandleProps) => (
        <button
          type="button"
          data-stack-move
          className="flex h-4 w-4 items-center justify-center rounded text-[11px] leading-none text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={`拖动${label}`}
          title="拖动排序"
          {...dragHandleProps}
        >
          ⋮⋮
        </button>
      )}
      onAdd={() => {
        commit((current) => addTransformLayer(current));
      }}
      onRemove={(index) => {
        commit((current) => removeTransformLayer(current, index));
      }}
      onMove={(fromIndex, toIndex) => {
        commit((current) => ({
          layers: moveStackItem(current.layers, fromIndex, toIndex),
        }));
      }}
      renderItem={(layer, index) => (
        <div className="grid grid-cols-2 gap-1">
          <SelectField
            label="类型"
            value={layer.functionName || 'rotateZ'}
            options={[
              { value: 'scaleX', label: 'scaleX' },
              { value: 'scaleY', label: 'scaleY' },
              { value: 'scaleZ', label: 'scaleZ' },
              { value: 'rotateX', label: 'rotateX' },
              { value: 'rotateY', label: 'rotateY' },
              { value: 'rotateZ', label: 'rotateZ' },
              { value: 'translateX', label: 'translateX' },
              { value: 'translateY', label: 'translateY' },
            ]}
            mixed={mixed}
            disabled={disabled}
            onCommit={(nextValue) => {
              commit((current) => updateTransformLayer(current, index, { functionName: nextValue }));
            }}
          />
          <TextField
            label="参数"
            value={layer.argument}
            placeholder="4px"
            mixed={mixed}
            disabled={disabled}
            onCommit={(nextValue) => {
              commit((current) => updateTransformLayer(current, index, { argument: nextValue }));
            }}
          />
        </div>
      )}
    />
  );
}

function BorderField({
  label,
  value,
  mixed = false,
  disabled = false,
  onCommit,
}: {
  label: string;
  value: BorderValue;
  mixed?: boolean;
  disabled?: boolean;
  onCommit: (value: BorderValue) => void;
}) {
  const sideEntries = [
    ['top', '上'],
    ['right', '右'],
    ['bottom', '下'],
    ['left', '左'],
  ] as const;
  const styleOptions = [
    { value: 'none', label: '无' },
    { value: 'solid', label: '实线' },
    { value: 'dashed', label: '虚线' },
    { value: 'dotted', label: '点线' },
    { value: 'double', label: '双线' },
  ];
  const [mode, setMode] = useState<'split' | 'unified'>(() => (mixed || !isUniformBorderValue(value) ? 'split' : 'unified'));

  useEffect(() => {
    setMode(mixed || !isUniformBorderValue(value) ? 'split' : 'unified');
  }, [
    mixed,
    value.top,
    value.right,
    value.bottom,
    value.left,
    value.unit,
    value.style,
    value.color,
    value.topStyle,
    value.rightStyle,
    value.bottomStyle,
    value.leftStyle,
    value.topColor,
    value.rightColor,
    value.bottomColor,
    value.leftColor,
  ]);

  const commitUnified = (patch: Partial<BorderValue>) => {
    const nextValue: BorderValue = {
      ...value,
      ...patch,
      top: patch.top ?? value.top,
      right: patch.top ?? value.right,
      bottom: patch.top ?? value.bottom,
      left: patch.top ?? value.left,
      topStyle: patch.style ?? value.style,
      rightStyle: patch.style ?? value.style,
      bottomStyle: patch.style ?? value.style,
      leftStyle: patch.style ?? value.style,
      topColor: patch.color ?? value.color,
      rightColor: patch.color ?? value.color,
      bottomColor: patch.color ?? value.color,
      leftColor: patch.color ?? value.color,
    };
    onCommit(nextValue);
  };

  const commitSide = (side: 'top' | 'right' | 'bottom' | 'left', patch: Partial<BorderValue>) => {
    onCommit({
      ...value,
      ...patch,
      [`${side}Style`]: patch.style ?? getBorderSideStyle(value, side),
      [`${side}Color`]: patch.color ?? getBorderSideColor(value, side),
      [side]: patch[side] ?? value[side],
      style: isUniformBorderValue(value) ? value.style : '',
      color: isUniformBorderValue(value) ? value.color : '',
    } as BorderValue);
  };

  return (
    <section data-border-field={label} className="gl-field flex w-full min-w-0 flex-1 flex-col gap-0.5 rounded-md py-1 text-foreground">
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
        <div data-border-field-mode="unified" className="grid grid-cols-2 gap-1">
          <NumberField
            label="宽度"
            value={{ value: value.top, unit: value.unit }}
            units={['px', '%', 'em', 'rem']}
            mixed={mixed}
            disabled={disabled}
            onCommit={(nextValue) => {
              commitUnified({
                top: nextValue.value,
                right: nextValue.value,
                bottom: nextValue.value,
                left: nextValue.value,
                unit: nextValue.unit,
              });
            }}
          />
          <SelectField
            label="样式"
            value={value.style}
            options={styleOptions}
            mixed={mixed}
            disabled={disabled}
            onCommit={(nextValue) => {
              commitUnified({ style: nextValue });
            }}
          />
          <ColorField
            label="颜色"
            value={value.color}
            placeholder="#000000"
            mixed={mixed}
            disabled={disabled}
            onCommit={(nextValue) => {
              commitUnified({ color: nextValue });
            }}
          />
        </div>
      ) : (
        <div data-border-field-mode="split" className="grid grid-cols-1 gap-1">
          {sideEntries.map(([side, sideLabel]) => (
            <div key={side} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1 rounded-md border border-border/60 p-1">
              <NumberField
                label={`${sideLabel} 宽度`}
                value={{ value: value[side], unit: value.unit }}
                units={['px', '%', 'em', 'rem']}
                mixed={mixed}
                disabled={disabled}
                onCommit={(nextValue) => {
                  commitSide(side, {
                    [side]: nextValue.value,
                    unit: nextValue.unit,
                  } as Partial<BorderValue>);
                }}
              />
              <SelectField
                label={`${sideLabel} 样式`}
                value={getBorderSideStyle(value, side)}
                options={styleOptions}
                mixed={mixed}
                disabled={disabled}
                onCommit={(nextValue) => {
                  commitSide(side, { style: nextValue });
                }}
              />
              <div className="col-span-full">
                <ColorField
                  label={`${sideLabel} 颜色`}
                  value={getBorderSideColor(value, side)}
                  placeholder="#000000"
                  mixed={mixed}
                  disabled={disabled}
                  onCommit={(nextValue) => {
                    commitSide(side, { color: nextValue });
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function renderCompositeField(property: StylePropertyViewModel, onCommit: GrapesLikePropertyProps['onCommit']) {
  if (property.property === 'inset') {
    const currentValue = asBoxValue(property.value.committed);
    return (
      <BoxField
        label={property.label}
        value={currentValue}
        mixed={property.value.mixed}
        disabled={property.value.disabled}
        onCommit={(nextValue) => {
          onCommit(stringifyBoxValue(nextValue), nextValue);
        }}
      />
    );
  }

  if (property.property === 'margin' || property.property === 'padding') {
    const currentValue = asBoxValue(property.value.committed);
    return (
      <BoxField
        label={property.label}
        value={currentValue}
        mixed={property.value.mixed}
        disabled={property.value.disabled}
        onCommit={(nextValue) => {
          onCommit(stringifyBoxValue(nextValue), nextValue);
        }}
      />
    );
  }

  if (property.property === 'borderRadius') {
    const currentValue = asRadiusValue(property.value.committed);
    return (
      <RadiusField
        label={property.label}
        value={currentValue}
        mixed={property.value.mixed}
        disabled={property.value.disabled}
        onCommit={(nextValue) => {
          onCommit(stringifyRadiusValue(nextValue), nextValue);
        }}
      />
    );
  }

  const currentValue = asBorderValue(property.value.committed);
  return (
    <BorderField
      label={property.label}
      value={currentValue}
      mixed={property.value.mixed}
      disabled={property.value.disabled}
      onCommit={(nextValue) => {
        onCommit(stringifyBorderValue(nextValue), nextValue);
      }}
    />
  );
}

export default function GrapesLikeProperty({ property, onCommit }: GrapesLikePropertyProps) {
  if (property.kind === 'color') {
    const currentValue = asUnitValue(property.value.committed);
    return (
      <div data-style-property={property.property} className={getPropertyLayoutClass(property)}>
        <ColorField
          label={property.label}
          value={currentValue.value}
          placeholder={property.placeholder}
          mixed={property.value.mixed}
          disabled={property.value.disabled}
          onCommit={(nextValue) => {
            onCommit(nextValue, nextValue);
          }}
        />
      </div>
    );
  }

  if (property.kind === 'number') {
    const currentValue = asUnitValue(property.value.committed);
    return (
      <div data-style-property={property.property} className={getPropertyLayoutClass(property)}>
        <NumberField
          label={property.label}
          value={currentValue}
          units={property.units}
          keywordOptions={property.keywordOptions}
          placeholder={property.value.mixed ? '混合' : property.placeholder}
          mixed={property.value.mixed}
          disabled={property.value.disabled}
          onCommit={(nextValue) => {
            onCommit(stringifyUnitValue(nextValue), nextValue);
          }}
        />
      </div>
    );
  }

  if (property.kind === 'select') {
    return (
      <div data-style-property={property.property} className={getPropertyLayoutClass(property)}>
        <SelectField
          label={property.label}
          value={readScalarValue(property.value.committed)}
          options={property.options ?? []}
          mixed={property.value.mixed}
          disabled={property.value.disabled}
          onCommit={(nextValue) => {
            onCommit(nextValue, nextValue);
          }}
        />
      </div>
    );
  }

  if (property.kind === 'radio') {
    return (
      <div data-style-property={property.property} className={getPropertyLayoutClass(property)}>
        <RadioField
          label={property.label}
          value={readScalarValue(property.value.committed)}
          options={property.options ?? []}
          mixed={property.value.mixed}
          disabled={property.value.disabled}
          onCommit={(nextValue) => {
            onCommit(nextValue, nextValue);
          }}
        />
      </div>
    );
  }

  if (property.kind === 'text') {
    return (
      <div data-style-property={property.property} className={getPropertyLayoutClass(property)}>
        <TextField
          label={property.label}
          value={readScalarValue(property.value.committed)}
          placeholder={property.placeholder}
          mixed={property.value.mixed}
          disabled={property.value.disabled}
          onCommit={(nextValue) => {
            onCommit(nextValue, nextValue);
          }}
        />
      </div>
    );
  }

  if (property.kind === 'stack' && property.property === 'transition') {
    const currentValue = asTransitionValue(property.value.committed);
    return (
      <div data-style-property={property.property} className={getPropertyLayoutClass(property)}>
        <TransitionStackField
          label={property.label}
          value={currentValue}
          mixed={property.value.mixed}
          disabled={property.value.disabled}
          onCommit={(nextValue) => {
            onCommit(stringifyTransitionValue(nextValue), nextValue);
          }}
        />
      </div>
    );
  }

  if (property.kind === 'stack' && property.property === 'transform') {
    const currentValue = asTransformValue(property.value.committed);
    return (
      <div data-style-property={property.property} className={getPropertyLayoutClass(property)}>
        <TransformStackField
          label={property.label}
          value={currentValue}
          mixed={property.value.mixed}
          disabled={property.value.disabled}
          onCommit={(nextValue) => {
            onCommit(stringifyTransformValue(nextValue), nextValue);
          }}
        />
      </div>
    );
  }

  if (property.kind === 'shadow') {
    const currentValue = asShadowValue(property.value.committed);
    return (
      <div data-style-property={property.property} className={getPropertyLayoutClass(property)}>
        <ShadowField
          label={property.label}
          value={currentValue}
          mixed={property.value.mixed}
          disabled={property.value.disabled}
          onCommit={(nextValue) => {
            onCommit(stringifyShadowValue(nextValue), nextValue);
          }}
        />
      </div>
    );
  }

  return (
    <div data-style-property={property.property} className={getPropertyLayoutClass(property)}>
      {renderCompositeField(property, onCommit)}
    </div>
  );
}
