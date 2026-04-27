import { readStyleState } from './styleAdapter.ts';
import type { BoxValue, BorderValue, RadiusValue, ShadowLayerValue, ShadowValue, StyleState, StyleStatePatch, TransitionLayerValue, TransitionValue, TransformValue, UnitValue } from './types.ts';

type StyleRecord = Record<string, string>;

function cloneStyle(style: StyleRecord | null | undefined): StyleRecord {
  return { ...(style ?? {}) };
}

function buildStyleRecordFromState(state: StyleState): StyleRecord {
  const style: StyleRecord = {};

  const appendUnitValue = (key: string, value: UnitValue) => {
    const rawValue = String(value.value ?? '').trim();
    if (!rawValue) {
      return;
    }

    const unit = String(value.unit ?? '').trim();
    style[key] = unit ? `${rawValue}${unit}` : rawValue;
  };

  const appendBoxValue = (key: string, value: BoxValue) => {
    const rawValues = [value.top, value.right, value.bottom, value.left].map((entry) => String(entry ?? '').trim());
    if (rawValues.every((entry) => !entry)) {
      return;
    }

    const unit = String(value.unit ?? '').trim();
    style[key] = [
      `${rawValues[0]}${unit}`,
      `${rawValues[1] || rawValues[0]}${unit}`,
      `${rawValues[2] || rawValues[0]}${unit}`,
      `${rawValues[3] || rawValues[1] || rawValues[0]}${unit}`,
    ].join(' ').trim();
  };

  const appendBorderValue = (key: string, value: BorderValue) => {
    const width = String(value.top ?? '').trim();
    const unit = String(value.unit ?? '').trim();
    const styleValue = String(value.style ?? '').trim();
    const color = String(value.color ?? '').trim();

    if (!width && !styleValue && !color) {
      return;
    }

    const widthPart = width ? `${width}${unit}` : '';
    style[key] = [widthPart, styleValue, color].filter(Boolean).join(' ').trim();
  };

  const appendRadiusValue = (key: string, value: RadiusValue) => {
    const rawValues = [value.topLeft, value.topRight, value.bottomRight, value.bottomLeft].map((entry) => String(entry ?? '').trim());
    if (rawValues.every((entry) => !entry)) {
      return;
    }

    const unit = String(value.unit ?? '').trim();
    style[key] = [
      `${rawValues[0]}${unit}`,
      `${rawValues[1] || rawValues[0]}${unit}`,
      `${rawValues[2] || rawValues[1] || rawValues[0]}${unit}`,
      `${rawValues[3] || rawValues[2] || rawValues[1] || rawValues[0]}${unit}`,
    ].join(' ').trim();
  };

  const appendShadowValue = (key: string, value: ShadowValue) => {
    const rawValue = buildShadowValue(value);
    if (!rawValue) {
      return;
    }

    style[key] = rawValue;
  };

  const appendTransitionValue = (key: string, value: TransitionValue) => {
    const rawValue = buildTransitionValue(value);
    if (!rawValue) {
      return;
    }

    style[key] = rawValue;
  };

  const appendTransformValue = (key: string, value: TransformValue) => {
    const rawValue = buildTransformValue(value);
    if (!rawValue) {
      return;
    }

    style[key] = rawValue;
  };

  appendUnitValue('display', state.layout.display);
  appendUnitValue('float', state.layout.float);
  appendUnitValue('position', state.layout.position);
  appendBoxValue('inset', state.layout.inset);
  appendUnitValue('z-index', state.layout.zIndex);
  appendUnitValue('flex-direction', state.flex.flexDirection);
  appendUnitValue('flex-wrap', state.flex.flexWrap);
  appendUnitValue('justify-content', state.flex.justifyContent);
  appendUnitValue('align-items', state.flex.alignItems);
  appendUnitValue('align-content', state.flex.alignContent);
  appendUnitValue('order', state.flex.order);
  appendUnitValue('flex-basis', state.flex.flexBasis);
  appendUnitValue('flex-grow', state.flex.flexGrow);
  appendUnitValue('flex-shrink', state.flex.flexShrink);
  appendUnitValue('align-self', state.flex.alignSelf);
  appendUnitValue('width', state.layout.width);
  appendUnitValue('height', state.layout.height);
  appendUnitValue('max-width', state.layout.maxWidth);
  appendUnitValue('min-height', state.layout.minHeight);
  appendBoxValue('margin', state.spacing.margin);
  appendBoxValue('padding', state.spacing.padding);
  appendUnitValue('background-color', state.appearance.backgroundColor);
  appendUnitValue('color', state.text.color);
  appendUnitValue('font-family', state.text.fontFamily);
  appendUnitValue('font-size', state.text.fontSize);
  appendUnitValue('font-weight', state.text.fontWeight);
  appendUnitValue('letter-spacing', state.text.letterSpacing);
  appendUnitValue('line-height', state.text.lineHeight);
  appendUnitValue('text-align', state.text.textAlign);
  appendBorderValue('border', state.appearance.border);
  appendRadiusValue('border-radius', state.appearance.borderRadius);
  appendShadowValue('box-shadow', state.appearance.boxShadow);
  appendUnitValue('opacity', state.appearance.opacity);
  appendTransitionValue('transition', state.advanced.transition);
  appendTransformValue('transform', state.advanced.transform);
  appendUnitValue('perspective', state.advanced.perspective);

  return style;
}

function buildUnitValue(value?: Partial<UnitValue> | string, fallback?: UnitValue): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  const merged: UnitValue = {
    value: value?.value ?? fallback?.value ?? '',
    unit: value?.unit ?? fallback?.unit ?? '',
  };
  const rawValue = String(merged.value ?? '').trim();
  if (!rawValue) {
    return '';
  }

  const unit = String(merged.unit ?? '').trim();
  return unit ? `${rawValue}${unit}` : rawValue;
}

function buildBoxValue(value?: Partial<BoxValue>, fallback?: BoxValue): string {
  const merged: BoxValue = {
    top: value?.top ?? fallback?.top ?? '',
    right: value?.right ?? fallback?.right ?? '',
    bottom: value?.bottom ?? fallback?.bottom ?? '',
    left: value?.left ?? fallback?.left ?? '',
    unit: value?.unit ?? fallback?.unit ?? '',
  };

  if (!merged.top && !merged.right && !merged.bottom && !merged.left) {
    return '';
  }

  const suffix = merged.unit;
  return [
    `${merged.top}${suffix}`,
    `${merged.right || merged.top}${suffix}`,
    `${merged.bottom || merged.top}${suffix}`,
    `${merged.left || merged.right || merged.top}${suffix}`,
  ].join(' ').trim();
}

function buildBorderValue(value?: Partial<BorderValue>, fallback?: BorderValue): string {
  const merged: BorderValue = {
    top: value?.top ?? fallback?.top ?? '',
    right: value?.right ?? fallback?.right ?? '',
    bottom: value?.bottom ?? fallback?.bottom ?? '',
    left: value?.left ?? fallback?.left ?? '',
    unit: value?.unit ?? fallback?.unit ?? '',
    style: value?.style ?? fallback?.style ?? '',
    color: value?.color ?? fallback?.color ?? '',
  };

  const width = String(merged.top ?? '').trim();
  const unit = String(merged.unit ?? '').trim();
  const style = String(merged.style ?? '').trim();
  const color = String(merged.color ?? '').trim();

  if (!width && !style && !color) {
    return '';
  }

  const widthPart = width ? `${width}${unit}` : '';
  return [widthPart, style, color].filter(Boolean).join(' ').trim();
}

function buildRadiusValue(value?: Partial<RadiusValue>, fallback?: RadiusValue): string {
  const merged: RadiusValue = {
    topLeft: value?.topLeft ?? fallback?.topLeft ?? '',
    topRight: value?.topRight ?? fallback?.topRight ?? '',
    bottomRight: value?.bottomRight ?? fallback?.bottomRight ?? '',
    bottomLeft: value?.bottomLeft ?? fallback?.bottomLeft ?? '',
    unit: value?.unit ?? fallback?.unit ?? '',
  };

  if (!merged.topLeft && !merged.topRight && !merged.bottomRight && !merged.bottomLeft) {
    return '';
  }

  const suffix = merged.unit;
  return [
    `${merged.topLeft}${suffix}`,
    `${merged.topRight || merged.topLeft}${suffix}`,
    `${merged.bottomRight || merged.topRight || merged.topLeft}${suffix}`,
    `${merged.bottomLeft || merged.bottomRight || merged.topRight || merged.topLeft}${suffix}`,
  ].join(' ').trim();
}

function buildShadowUnitValue(value?: Partial<UnitValue> | null, fallback?: UnitValue): UnitValue {
  return {
    value: value?.value ?? fallback?.value ?? '',
    unit: value?.unit ?? fallback?.unit ?? '',
  };
}

function buildTransitionUnitValue(value?: Partial<UnitValue> | null, fallback?: UnitValue): UnitValue {
  return {
    value: value?.value ?? fallback?.value ?? '',
    unit: value?.unit ?? fallback?.unit ?? '',
  };
}

function formatShadowUnitValue(value: UnitValue): string {
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
    formatShadowUnitValue(value.horizontal),
    formatShadowUnitValue(value.vertical),
    formatShadowUnitValue(value.blur),
    formatShadowUnitValue(value.spread),
    String(value.color ?? '').trim(),
  ].filter(Boolean).join(' ').trim();
}

function normalizeShadowLayer(layer?: Partial<ShadowLayerValue> | null, fallback?: ShadowLayerValue): ShadowLayerValue {
  return {
    horizontal: buildShadowUnitValue(layer?.horizontal, fallback?.horizontal ?? { value: '', unit: '' }),
    vertical: buildShadowUnitValue(layer?.vertical, fallback?.vertical ?? { value: '', unit: '' }),
    blur: buildShadowUnitValue(layer?.blur, fallback?.blur ?? { value: '', unit: '' }),
    spread: buildShadowUnitValue(layer?.spread, fallback?.spread ?? { value: '', unit: '' }),
    color: String(layer?.color ?? fallback?.color ?? ''),
    type: layer?.type === 'inset' ? 'inset' : (fallback?.type ?? 'outside'),
  };
}

function formatTransitionUnitValue(value: UnitValue): string {
  const rawValue = String(value.value ?? '').trim();
  if (!rawValue) {
    return '';
  }

  const unit = String(value.unit ?? '').trim();
  return unit ? `${rawValue}${unit}` : rawValue;
}

function formatTransitionLayer(value: TransitionLayerValue): string {
  return [
    String(value.property ?? '').trim(),
    formatTransitionUnitValue(value.duration),
    String(value.timingFunction ?? '').trim(),
  ].filter(Boolean).join(' ').trim();
}

function buildTransitionValue(value?: Partial<TransitionValue> | null, fallback?: TransitionValue): string {
  const layers = Array.isArray(value?.layers) ? value.layers : fallback?.layers ?? [];
  return layers
    .map((layer, index) => {
      const fallbackLayer = fallback?.layers?.[index];
      return formatTransitionLayer({
        property: String(layer?.property ?? fallbackLayer?.property ?? ''),
        duration: buildTransitionUnitValue(layer?.duration, fallbackLayer?.duration ?? { value: '', unit: '' }),
        timingFunction: String(layer?.timingFunction ?? fallbackLayer?.timingFunction ?? ''),
      });
    })
    .filter(Boolean)
    .join(', ');
}

function buildTransformValue(value?: Partial<TransformValue> | null, fallback?: TransformValue): string {
  const layers = Array.isArray(value?.layers) ? value.layers : fallback?.layers ?? [];
  return layers
    .map((layer, index) => {
      const fallbackLayer = fallback?.layers?.[index];
      const functionName = String(layer?.functionName ?? fallbackLayer?.functionName ?? '').trim();
      const argument = String(layer?.argument ?? fallbackLayer?.argument ?? '').trim();

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

function buildShadowValue(value?: Partial<ShadowValue> | string | null, fallback?: ShadowValue): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  const layers = Array.isArray(value?.layers) ? value.layers : fallback?.layers ?? [];
  return layers
    .map((layer, index) => {
      const fallbackLayer = fallback?.layers?.[index];
      return formatShadowLayer(normalizeShadowLayer(layer, fallbackLayer));
    })
    .filter(Boolean)
    .join(', ');
}

function setStyleValue(style: StyleRecord, key: string, value: string) {
  if (!value) {
    delete style[key];
    return;
  }

  style[key] = value;
}

function deleteStyleKeys(style: StyleRecord, keys: string[]) {
  keys.forEach((key) => {
    delete style[key];
  });
}

export function applyStylePatch(currentStyle: StyleRecord | null | undefined, patch: StyleStatePatch): StyleRecord {
  const nextStyle = cloneStyle(currentStyle);
  const currentState = readStyleState(currentStyle);

  const layout = patch.layout ?? {};
  if ('display' in layout) {
    setStyleValue(nextStyle, 'display', buildUnitValue(layout.display, currentState.layout.display));
  }
  if ('float' in layout) {
    setStyleValue(nextStyle, 'float', buildUnitValue(layout.float, currentState.layout.float));
  }
  if ('position' in layout) {
    setStyleValue(nextStyle, 'position', buildUnitValue(layout.position, currentState.layout.position));
  }
  if ('inset' in layout) {
    setStyleValue(nextStyle, 'inset', buildBoxValue(layout.inset, currentState.layout.inset));
    deleteStyleKeys(nextStyle, ['top', 'right', 'bottom', 'left']);
  }
  if ('zIndex' in layout) {
    setStyleValue(nextStyle, 'z-index', buildUnitValue(layout.zIndex, currentState.layout.zIndex));
  }
  if ('width' in layout) {
    setStyleValue(nextStyle, 'width', buildUnitValue(layout.width, currentState.layout.width));
  }
  if ('height' in layout) {
    setStyleValue(nextStyle, 'height', buildUnitValue(layout.height, currentState.layout.height));
  }
  if ('maxWidth' in layout) {
    setStyleValue(nextStyle, 'max-width', buildUnitValue(layout.maxWidth, currentState.layout.maxWidth));
  }
  if ('minHeight' in layout) {
    setStyleValue(nextStyle, 'min-height', buildUnitValue(layout.minHeight, currentState.layout.minHeight));
  }

  const flex = patch.flex ?? {};
  if ('flexDirection' in flex) {
    setStyleValue(nextStyle, 'flex-direction', buildUnitValue(flex.flexDirection, currentState.flex.flexDirection));
  }
  if ('flexWrap' in flex) {
    setStyleValue(nextStyle, 'flex-wrap', buildUnitValue(flex.flexWrap, currentState.flex.flexWrap));
  }
  if ('justifyContent' in flex) {
    setStyleValue(nextStyle, 'justify-content', buildUnitValue(flex.justifyContent, currentState.flex.justifyContent));
  }
  if ('alignItems' in flex) {
    setStyleValue(nextStyle, 'align-items', buildUnitValue(flex.alignItems, currentState.flex.alignItems));
  }
  if ('alignContent' in flex) {
    setStyleValue(nextStyle, 'align-content', buildUnitValue(flex.alignContent, currentState.flex.alignContent));
  }
  if ('order' in flex) {
    setStyleValue(nextStyle, 'order', buildUnitValue(flex.order, currentState.flex.order));
  }
  if ('flexBasis' in flex) {
    setStyleValue(nextStyle, 'flex-basis', buildUnitValue(flex.flexBasis, currentState.flex.flexBasis));
  }
  if ('flexGrow' in flex) {
    setStyleValue(nextStyle, 'flex-grow', buildUnitValue(flex.flexGrow, currentState.flex.flexGrow));
  }
  if ('flexShrink' in flex) {
    setStyleValue(nextStyle, 'flex-shrink', buildUnitValue(flex.flexShrink, currentState.flex.flexShrink));
  }
  if ('alignSelf' in flex) {
    setStyleValue(nextStyle, 'align-self', buildUnitValue(flex.alignSelf, currentState.flex.alignSelf));
  }

  const spacing = patch.spacing ?? {};
  if ('margin' in spacing) {
    deleteStyleKeys(nextStyle, ['margin-top', 'margin-right', 'margin-bottom', 'margin-left']);
    setStyleValue(nextStyle, 'margin', buildBoxValue(spacing.margin, currentState.spacing.margin));
  }
  if ('padding' in spacing) {
    deleteStyleKeys(nextStyle, ['padding-top', 'padding-right', 'padding-bottom', 'padding-left']);
    setStyleValue(nextStyle, 'padding', buildBoxValue(spacing.padding, currentState.spacing.padding));
  }

  const text = patch.text ?? {};
  const appearance = patch.appearance ?? {};
  const advanced = patch.advanced ?? {};

  if ('color' in text) {
    setStyleValue(nextStyle, 'color', buildUnitValue(text.color, currentState.text.color));
  }
  if ('fontFamily' in text) {
    setStyleValue(nextStyle, 'font-family', buildUnitValue(text.fontFamily, currentState.text.fontFamily));
  }
  if ('fontSize' in text) {
    setStyleValue(nextStyle, 'font-size', buildUnitValue(text.fontSize, currentState.text.fontSize));
  }
  if ('fontWeight' in text) {
    setStyleValue(nextStyle, 'font-weight', buildUnitValue(text.fontWeight, currentState.text.fontWeight));
  }
  if ('letterSpacing' in text) {
    setStyleValue(nextStyle, 'letter-spacing', buildUnitValue(text.letterSpacing, currentState.text.letterSpacing));
  }
  if ('lineHeight' in text) {
    setStyleValue(nextStyle, 'line-height', buildUnitValue(text.lineHeight, currentState.text.lineHeight));
  }
  if ('textAlign' in text) {
    setStyleValue(nextStyle, 'text-align', buildUnitValue(text.textAlign, currentState.text.textAlign));
  }

  if ('backgroundColor' in appearance) {
    setStyleValue(nextStyle, 'background-color', buildUnitValue(appearance.backgroundColor, currentState.appearance.backgroundColor));
    delete nextStyle.backgroundColor;
  }
  if ('border' in appearance) {
    setStyleValue(nextStyle, 'border', buildBorderValue(appearance.border, currentState.appearance.border));
  }
  if ('borderRadius' in appearance) {
    deleteStyleKeys(nextStyle, [
      'border-top-left-radius',
      'border-top-right-radius',
      'border-bottom-right-radius',
      'border-bottom-left-radius',
    ]);
    setStyleValue(nextStyle, 'border-radius', buildRadiusValue(appearance.borderRadius, currentState.appearance.borderRadius));
  }
  if ('boxShadow' in appearance) {
    setStyleValue(nextStyle, 'box-shadow', buildShadowValue(appearance.boxShadow, currentState.appearance.boxShadow));
    delete nextStyle.boxShadow;
  }
  if ('opacity' in appearance) {
    setStyleValue(nextStyle, 'opacity', buildUnitValue(appearance.opacity, currentState.appearance.opacity));
  }
  if ('transition' in advanced) {
    setStyleValue(nextStyle, 'transition', buildTransitionValue(advanced.transition, currentState.advanced.transition));
  }
  if ('transform' in advanced) {
    setStyleValue(nextStyle, 'transform', buildTransformValue(advanced.transform, currentState.advanced.transform));
  }
  if ('perspective' in advanced) {
    setStyleValue(nextStyle, 'perspective', buildUnitValue(advanced.perspective, currentState.advanced.perspective));
  }

  return nextStyle;
}

export function createStyleWritebackHandler(
  currentState: StyleState,
  onPatch: (nextStyle: StyleRecord) => void,
) {
  let currentStyle = buildStyleRecordFromState(currentState);

  return (patch: StyleStatePatch) => {
    currentStyle = applyStylePatch(currentStyle, patch);
    onPatch(currentStyle);
  };
}

export function updateStyle(
  editor: {
    updateRuleStyle?: (property: string, value: string) => unknown;
    updateInlineStyle?: (property: string, value: string) => unknown;
  } | null | undefined,
  input: {
    property: string;
    value: string;
    targetKind: 'rule' | 'inline';
  },
) {
  const property = input.property.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

  if (input.targetKind === 'rule') {
    return editor?.updateRuleStyle?.(property, input.value);
  }

  return editor?.updateInlineStyle?.(property, input.value);
}
