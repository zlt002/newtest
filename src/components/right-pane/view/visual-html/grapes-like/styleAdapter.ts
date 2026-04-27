import { EMPTY_STYLE_STATE, type BoxValue, type BorderValue, type RadiusValue, type ShadowLayerValue, type ShadowValue, type StylePropertyViewModel, type StyleSectorViewModel, type StyleSnapshot, type StyleState, type TransitionLayerValue, type TransitionValue, type TransformValue, type UnitValue } from './types.ts';

type StyleRecord = Record<string, string | number | null | undefined>;

const DEFAULT_GENERAL_VALUES = {
  display: 'block',
  float: 'none',
  position: 'static',
} as const;

const STYLE_SCHEMA: Array<{
  key: StyleSectorViewModel['key'];
  title: string;
  properties: Array<Omit<StylePropertyViewModel, 'value'>>;
}> = [
  {
    key: 'layout',
    title: '布局',
    properties: [
      { property: 'display', label: '显示', kind: 'radio', options: [
        { value: 'block', label: '块级', icon: 'LayoutPanelTop' },
        { value: 'inline', label: '行内', icon: 'Text' },
        { value: 'inline-block', label: '行内块', icon: 'Square' },
        { value: 'flex', label: '弹性布局', icon: 'ArrowLeftRight' },
        { value: 'grid', label: '网格', icon: 'LayoutGrid' },
        { value: 'none', label: '隐藏', icon: 'X' },
      ] },
      { property: 'float', label: '浮动', kind: 'radio', options: [
        { value: 'none', label: '无', icon: 'Minus' },
        { value: 'left', label: '左浮动', icon: 'ArrowLeft' },
        { value: 'right', label: '右浮动', icon: 'ArrowRight' },
      ] },
      { property: 'position', label: '定位', kind: 'radio', options: [
        { value: 'static', label: '静态', icon: 'Square' },
        { value: 'relative', label: '相对', icon: 'Move' },
        { value: 'absolute', label: '绝对', icon: 'ArrowUpRight' },
        { value: 'fixed', label: '固定', icon: 'LocateFixed' },
        { value: 'sticky', label: '粘性', icon: 'Pin' },
      ] },
      { property: 'inset', label: '偏移', kind: 'composite' },
      { property: 'zIndex', label: '层级', kind: 'number' },
      { property: 'width', label: '宽度', kind: 'number', units: ['px', '%', 'vw', 'vh', 'rem', 'em', 'auto'] },
      { property: 'height', label: '高度', kind: 'number', units: ['px', '%', 'vw', 'vh', 'rem', 'em', 'auto'] },
      { property: 'maxWidth', label: '最大宽度', kind: 'number', units: ['px', '%', 'vw', 'vh', 'rem', 'em', 'auto'] },
      { property: 'minHeight', label: '最小高度', kind: 'number', units: ['px', '%', 'vw', 'vh', 'rem', 'em', 'auto'] },
    ],
  },
  {
    key: 'flex',
    title: '弹性布局',
    properties: [
      { property: 'flexDirection', label: '方向', kind: 'radio', options: [
        { value: 'row', label: '行', icon: 'ArrowRight' },
        { value: 'row-reverse', label: '行反向', icon: 'ArrowLeft' },
        { value: 'column', label: '列', icon: 'ArrowDown' },
        { value: 'column-reverse', label: '列反向', icon: 'ArrowUp' },
      ] },
      { property: 'flexWrap', label: '换行', kind: 'radio', options: [
        { value: 'nowrap', label: '不换行', icon: 'ArrowLeftRight' },
        { value: 'wrap', label: '换行', icon: 'WrapText' },
        { value: 'wrap-reverse', label: '反向换行', icon: 'ArrowUpDown' },
      ] },
      { property: 'justifyContent', label: '主轴对齐', kind: 'radio', options: [
        { value: 'flex-start', label: '起始', icon: 'AlignHorizontalJustifyStart' },
        { value: 'center', label: '居中', icon: 'AlignHorizontalJustifyCenter' },
        { value: 'flex-end', label: '末尾', icon: 'AlignHorizontalJustifyEnd' },
        { value: 'space-between', label: '两端分布', icon: 'AlignHorizontalSpaceBetween' },
        { value: 'space-around', label: '环绕分布', icon: 'AlignHorizontalSpaceAround' },
        { value: 'space-evenly', label: '平均分布', icon: 'AlignHorizontalDistributeCenter' },
      ] },
      { property: 'alignItems', label: '交叉轴对齐', kind: 'radio', options: [
        { value: 'stretch', label: '拉伸', icon: 'StretchVertical' },
        { value: 'flex-start', label: '起始', icon: 'AlignStartVertical' },
        { value: 'center', label: '居中', icon: 'AlignCenterVertical' },
        { value: 'flex-end', label: '末尾', icon: 'AlignEndVertical' },
        { value: 'baseline', label: '基线', icon: 'AlignVerticalJustifyCenter' },
      ] },
      { property: 'alignContent', label: '多行对齐', kind: 'radio', options: [
        { value: 'stretch', label: '拉伸', icon: 'StretchVertical' },
        { value: 'flex-start', label: '起始', icon: 'AlignVerticalJustifyStart' },
        { value: 'center', label: '居中', icon: 'AlignVerticalJustifyCenter' },
        { value: 'flex-end', label: '末尾', icon: 'AlignVerticalJustifyEnd' },
        { value: 'space-between', label: '两端分布', icon: 'AlignVerticalSpaceBetween' },
        { value: 'space-around', label: '环绕分布', icon: 'AlignVerticalSpaceAround' },
      ] },
      { property: 'order', label: '顺序', kind: 'number' },
      { property: 'flexBasis', label: '基准尺寸', kind: 'number', units: ['px', '%', 'vw', 'vh', 'rem', 'em', 'auto'] },
      { property: 'flexGrow', label: '增长', kind: 'number' },
      { property: 'flexShrink', label: '收缩', kind: 'number' },
      { property: 'alignSelf', label: '自对齐', kind: 'radio', options: [
        { value: 'auto', label: '自动', icon: 'Move' },
        { value: 'stretch', label: '拉伸', icon: 'StretchVertical' },
        { value: 'flex-start', label: '起始', icon: 'AlignStartVertical' },
        { value: 'center', label: '居中', icon: 'AlignCenterVertical' },
        { value: 'flex-end', label: '末尾', icon: 'AlignEndVertical' },
        { value: 'baseline', label: '基线', icon: 'PanelLeft' },
      ] },
    ],
  },
  {
    key: 'spacing',
    title: '间距',
    properties: [
      { property: 'margin', label: '外边距', kind: 'composite' },
      { property: 'padding', label: '内边距', kind: 'composite' },
    ],
  },
  {
    key: 'text',
    title: '文本',
    properties: [
      { property: 'color', label: '文字色', kind: 'color', placeholder: '#000000' },
      { property: 'fontFamily', label: '字体', kind: 'select', options: [
        { value: 'Arial', label: 'Arial（无衬线）' },
        { value: 'Helvetica', label: 'Helvetica（无衬线）' },
        { value: 'Georgia', label: 'Georgia（衬线）' },
        { value: 'Times New Roman', label: 'Times New Roman（衬线）' },
        { value: 'Courier New', label: 'Courier New（等宽）' },
        { value: 'system-ui', label: '系统字体' },
      ] },
      { property: 'fontSize', label: '字号', kind: 'number', units: ['px', 'rem', 'em', '%'] },
      { property: 'fontWeight', label: '字重', kind: 'select', options: [
        { value: '100', label: '100 极细' },
        { value: '200', label: '200 很细' },
        { value: '300', label: '300 细体' },
        { value: '400', label: '400 常规' },
        { value: '500', label: '500 中等' },
        { value: '600', label: '600 半粗' },
        { value: '700', label: '700 粗体' },
        { value: '800', label: '800 特粗' },
        { value: '900', label: '900 超粗' },
        { value: 'normal', label: '常规' },
        { value: 'bold', label: '粗体' },
      ] },
      { property: 'letterSpacing', label: '字间距', kind: 'number', units: ['px', 'em', 'rem'] },
      { property: 'lineHeight', label: '行高', kind: 'number', units: ['px', 'em', 'rem', '%'] },
      { property: 'textAlign', label: '文本对齐', kind: 'radio', options: [
        { value: 'left', label: '左对齐', icon: 'AlignLeft' },
        { value: 'center', label: '居中', icon: 'AlignCenterHorizontal' },
        { value: 'right', label: '右对齐', icon: 'AlignRight' },
        { value: 'justify', label: '两端对齐', icon: 'AlignHorizontalJustifyCenter' },
      ] },
    ],
  },
  {
    key: 'appearance',
    title: '外观',
    properties: [
      { property: 'backgroundColor', label: '背景色', kind: 'color', placeholder: '#ffffff' },
      { property: 'border', label: '边框', kind: 'composite' },
      { property: 'borderRadius', label: '圆角', kind: 'composite' },
      { property: 'boxShadow', label: '投影', kind: 'shadow' },
      { property: 'opacity', label: '透明度', kind: 'number' },
    ],
  },
  {
    key: 'advanced',
    title: '高级',
    properties: [
      { property: 'transition', label: '过渡', kind: 'stack' },
      { property: 'transform', label: '变换', kind: 'stack' },
      { property: 'perspective', label: '透视', kind: 'number', units: ['px'] },
    ],
  },
];

function toStyleRecord(style: StyleRecord | null | undefined): Record<string, string> {
  if (!style) {
    return {};
  }

  return Object.entries(style).reduce<Record<string, string>>((result, [key, value]) => {
    if (value === null || value === undefined) {
      return result;
    }

    result[key] = String(value);
    return result;
  }, {});
}

function splitCssValue(value: string): UnitValue {
  const trimmed = value.trim();
  if (!trimmed) {
    return { value: '', unit: '' };
  }

  const match = trimmed.match(/^(-?\d*\.?\d+)([a-z%]+)?$/i);
  if (!match) {
    return { value: trimmed, unit: '' };
  }

  return {
    value: match[1],
    unit: match[2] ?? '',
  };
}

function splitTopLevel(value: string, separator: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '(') {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ')' && depth > 0) {
      depth -= 1;
      current += char;
      continue;
    }

    if (char === separator && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) {
        result.push(trimmed);
      }
      current = '';
      continue;
    }

    current += char;
  }

  const trimmed = current.trim();
  if (trimmed) {
    result.push(trimmed);
  }

  return result;
}

function tokenizeTopLevel(value: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '(') {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ')' && depth > 0) {
      depth -= 1;
      current += char;
      continue;
    }

    if (/\s/.test(char) && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) {
        result.push(trimmed);
      }
      current = '';
      continue;
    }

    current += char;
  }

  const trimmed = current.trim();
  if (trimmed) {
    result.push(trimmed);
  }

  return result;
}

function isShadowLengthToken(token: string): boolean {
  return /^-?\d*\.?\d+(?:[a-z%]+)?$/i.test(token)
    || /^-?\d*\.?\d*$/.test(token)
    || /^(calc|min|max|clamp)\(/i.test(token);
}

function createEmptyShadowLayer(): ShadowLayerValue {
  return {
    horizontal: { value: '', unit: '' },
    vertical: { value: '', unit: '' },
    blur: { value: '', unit: '' },
    spread: { value: '', unit: '' },
    color: '',
    type: 'outside',
  };
}

function readShadowLayer(layerValue: string): ShadowLayerValue {
  const trimmed = layerValue.trim();
  if (!trimmed || trimmed.toLowerCase() === 'none') {
    return createEmptyShadowLayer();
  }

  const tokens = tokenizeTopLevel(trimmed);
  const type: ShadowLayerValue['type'] = tokens.some((token) => token.toLowerCase() === 'inset') ? 'inset' : 'outside';
  const resolvedTokens = tokens.filter((token) => token.toLowerCase() !== 'inset');
  const lengthTokens = resolvedTokens.filter((token) => isShadowLengthToken(token));
  const colorTokens = resolvedTokens.filter((token) => !isShadowLengthToken(token));
  const [horizontal = '', vertical = '', blur = '', spread = ''] = lengthTokens;
  const color = colorTokens.join(' ').trim();

  return {
    horizontal: splitCssValue(horizontal),
    vertical: splitCssValue(vertical),
    blur: splitCssValue(blur),
    spread: splitCssValue(spread),
    color,
    type,
  };
}

function readShadow(style: Record<string, string>): ShadowValue {
  const rawValue = style['box-shadow'] ?? style.boxShadow ?? '';
  if (!rawValue.trim() || rawValue.trim().toLowerCase() === 'none') {
    return { layers: [] };
  }

  return {
    layers: splitTopLevel(rawValue, ',').map((layerValue) => readShadowLayer(layerValue)),
  };
}

function isTransitionDurationToken(token: string): boolean {
  return /^-?\d*\.?\d+(?:ms|s)?$/i.test(token)
    || /^-?\d*\.?\d*$/.test(token)
    || /^(calc|min|max|clamp)\(/i.test(token);
}

function normalizeTransitionUnit(value: string): UnitValue {
  return splitCssValue(value);
}

function readTransitionLayer(layerValue: string): TransitionLayerValue {
  const tokens = tokenizeTopLevel(layerValue.trim()).filter(Boolean);
  const property = tokens.shift() ?? '';
  const durationIndex = tokens.findIndex((token) => isTransitionDurationToken(token));
  const durationToken = durationIndex >= 0 ? tokens[durationIndex] : '';
  const timingTokens = tokens.filter((token, index) => index !== durationIndex);

  return {
    property,
    duration: normalizeTransitionUnit(durationToken),
    timingFunction: timingTokens.join(' ').trim(),
  };
}

function readTransition(style: Record<string, string>): TransitionValue {
  const rawValue = style.transition ?? '';
  if (!rawValue.trim() || rawValue.trim().toLowerCase() === 'none') {
    return { layers: [] };
  }

  return {
    layers: splitTopLevel(rawValue, ',').map((layerValue) => readTransitionLayer(layerValue)),
  };
}

function readTransform(style: Record<string, string>): TransformValue {
  const rawValue = style.transform ?? '';
  if (!rawValue.trim() || rawValue.trim().toLowerCase() === 'none') {
    return { layers: [] };
  }

  return {
    layers: tokenizeTopLevel(rawValue).map((layerValue) => {
      const match = layerValue.trim().match(/^([a-z-]+)\((.*)\)$/i);
      if (!match) {
        return {
          functionName: 'raw',
          argument: layerValue.trim(),
        };
      }

      return {
        functionName: match[1],
        argument: match[2].trim(),
      };
    }),
  };
}

function expandCssBox(value: string): [string, string, string, string] {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return ['', '', '', ''];
  }

  if (tokens.length === 1) {
    return [tokens[0], tokens[0], tokens[0], tokens[0]];
  }

  if (tokens.length === 2) {
    return [tokens[0], tokens[1], tokens[0], tokens[1]];
  }

  if (tokens.length === 3) {
    return [tokens[0], tokens[1], tokens[2], tokens[1]];
  }

  return [tokens[0], tokens[1], tokens[2], tokens[3]];
}

function readBox(style: Record<string, string>, key: string): BoxValue {
  const sideKeys = [
    `${key}-top`,
    `${key}-right`,
    `${key}-bottom`,
    `${key}-left`,
  ];
  const sideValues = sideKeys.map((sideKey) => style[sideKey] ?? '');
  const shorthand = style[key] ?? '';
  const resolved = sideValues.some(Boolean) ? sideValues : expandCssBox(shorthand);
  const unit = resolved.map(splitCssValue).find((entry) => entry.unit)?.unit ?? splitCssValue(shorthand).unit;

  return {
    top: splitCssValue(resolved[0]).value,
    right: splitCssValue(resolved[1]).value,
    bottom: splitCssValue(resolved[2]).value,
    left: splitCssValue(resolved[3]).value,
    unit,
  };
}

function readInset(style: Record<string, string>): BoxValue {
  const sideKeys = ['top', 'right', 'bottom', 'left'];
  const sideValues = sideKeys.map((sideKey) => style[sideKey] ?? '');
  const shorthand = style.inset ?? '';
  const resolved = sideValues.some(Boolean) ? sideValues : expandCssBox(shorthand);
  const unit = resolved.map(splitCssValue).find((entry) => entry.unit)?.unit ?? splitCssValue(shorthand).unit;

  return {
    top: splitCssValue(resolved[0]).value,
    right: splitCssValue(resolved[1]).value,
    bottom: splitCssValue(resolved[2]).value,
    left: splitCssValue(resolved[3]).value,
    unit,
  };
}

function readZIndex(style: Record<string, string>): UnitValue {
  return splitCssValue(style['z-index'] ?? style.zIndex ?? '');
}

function readRadius(style: Record<string, string>): RadiusValue {
  const sideKeys = [
    'border-top-left-radius',
    'border-top-right-radius',
    'border-bottom-right-radius',
    'border-bottom-left-radius',
  ];
  const sideValues = sideKeys.map((sideKey) => style[sideKey] ?? '');
  const shorthand = style['border-radius'] ?? style.borderRadius ?? '';
  const resolved = sideValues.some(Boolean) ? sideValues : expandCssBox(shorthand);
  const unit = resolved.map(splitCssValue).find((entry) => entry.unit)?.unit ?? splitCssValue(shorthand).unit;

  return {
    topLeft: splitCssValue(resolved[0]).value,
    topRight: splitCssValue(resolved[1]).value,
    bottomRight: splitCssValue(resolved[2]).value,
    bottomLeft: splitCssValue(resolved[3]).value,
    unit,
  };
}

function readBorder(style: Record<string, string>): BorderValue {
  const shorthand = style.border ?? '';
  const width = style['border-width'] ?? '';
  const borderStyle = style['border-style'] ?? '';
  const color = style['border-color'] ?? '';
  const source = shorthand || [width, borderStyle, color].filter(Boolean).join(' ');
  const tokens = source.trim().split(/\s+/).filter(Boolean);
  const borderStyles = new Set([
    'none',
    'hidden',
    'dotted',
    'dashed',
    'solid',
    'double',
    'groove',
    'ridge',
    'inset',
    'outset',
  ]);
  const borderWidths = new Set(['thin', 'medium', 'thick']);
  const widthToken = tokens.find((token) => borderWidths.has(token.toLowerCase()) || splitCssValue(token).unit || /^\d/.test(token));
  const styleToken = tokens.find((token) => borderStyles.has(token.toLowerCase()));
  const remainingTokens = tokens.filter((token) => token !== widthToken && token !== styleToken);
  const size = splitCssValue((widthToken ?? width) || '');
  const parsedStyle = styleToken ?? borderStyle ?? '';
  const parsedColor = remainingTokens.join(' ') || color || '';

  return {
    top: size.value,
    right: size.value,
    bottom: size.value,
    left: size.value,
    unit: size.unit,
    style: parsedStyle,
    color: parsedColor,
  };
}

export function readStyleState(style: StyleRecord | null | undefined): StyleState {
  const record = toStyleRecord(style);

  return {
    ...EMPTY_STYLE_STATE,
    layout: {
      display: splitCssValue(record.display ?? DEFAULT_GENERAL_VALUES.display),
      float: splitCssValue(record.float ?? DEFAULT_GENERAL_VALUES.float),
      position: splitCssValue(record.position ?? DEFAULT_GENERAL_VALUES.position),
      inset: readInset(record),
      zIndex: readZIndex(record),
      width: splitCssValue(record.width ?? ''),
      height: splitCssValue(record.height ?? ''),
      maxWidth: splitCssValue(record['max-width'] ?? record.maxWidth ?? ''),
      minHeight: splitCssValue(record['min-height'] ?? record.minHeight ?? ''),
    },
    flex: {
      flexDirection: splitCssValue(record['flex-direction'] ?? record.flexDirection ?? ''),
      flexWrap: splitCssValue(record['flex-wrap'] ?? record.flexWrap ?? ''),
      justifyContent: splitCssValue(record['justify-content'] ?? record.justifyContent ?? ''),
      alignItems: splitCssValue(record['align-items'] ?? record.alignItems ?? ''),
      alignContent: splitCssValue(record['align-content'] ?? record.alignContent ?? ''),
      order: splitCssValue(record.order ?? ''),
      flexBasis: splitCssValue(record['flex-basis'] ?? record.flexBasis ?? ''),
      flexGrow: splitCssValue(record['flex-grow'] ?? record.flexGrow ?? ''),
      flexShrink: splitCssValue(record['flex-shrink'] ?? record.flexShrink ?? ''),
      alignSelf: splitCssValue(record['align-self'] ?? record.alignSelf ?? ''),
    },
    spacing: {
      margin: readBox(record, 'margin'),
      padding: readBox(record, 'padding'),
    },
    text: {
      color: splitCssValue(record.color ?? ''),
      fontFamily: splitCssValue(record['font-family'] ?? record.fontFamily ?? ''),
      fontSize: splitCssValue(record['font-size'] ?? record.fontSize ?? ''),
      fontWeight: splitCssValue(record['font-weight'] ?? record.fontWeight ?? ''),
      letterSpacing: splitCssValue(record['letter-spacing'] ?? record.letterSpacing ?? ''),
      lineHeight: splitCssValue(record['line-height'] ?? record.lineHeight ?? ''),
      textAlign: splitCssValue(record['text-align'] ?? record.textAlign ?? ''),
    },
    appearance: {
      backgroundColor: splitCssValue(record['background-color'] ?? record.backgroundColor ?? ''),
      border: readBorder(record),
      borderRadius: readRadius(record),
      boxShadow: readShadow(record),
      opacity: splitCssValue(record.opacity ?? ''),
    },
    advanced: {
      transition: readTransition(record),
      transform: readTransform(record),
      perspective: splitCssValue(record.perspective ?? ''),
    },
  };
}

function getSelectionStyles(source: {
  selection?: Array<{ styles?: StyleRecord | null; classes?: readonly string[] | string | null }> | null;
} | null | undefined): StyleState[] {
  return (source?.selection ?? []).map((entry) => readStyleState(entry.styles));
}

function readPropertyValue(state: StyleState, sectorKey: StyleSectorViewModel['key'], property: string): unknown {
  const sector = state[sectorKey] as Record<string, unknown>;
  return sector[property];
}

function isMixedValue(values: unknown[]): boolean {
  if (values.length <= 1) {
    return false;
  }

  const baseline = JSON.stringify(values[0] ?? null);
  return values.slice(1).some((value) => JSON.stringify(value ?? null) !== baseline);
}

export function readStyleSnapshot(source: {
  selection?: Array<{ styles?: StyleRecord | null; classes?: readonly string[] | string | null }> | null;
  activeState?: string | null;
} | null | undefined): StyleSnapshot {
  const selected = source?.selection ?? [];
  const states = getSelectionStyles(source);
  const baseState = states[0] ?? EMPTY_STYLE_STATE;
  let hasMixedValues = false;
  const hasPositionOffset = states.some((state) => {
    const position = state.layout.position.value;
    return position === 'absolute' || position === 'fixed';
  });
  const shouldShowLayoutPositionProps = hasPositionOffset;

  const sectors = STYLE_SCHEMA.map((sector): StyleSectorViewModel => ({
    key: sector.key,
    title: sector.title,
    properties: sector.properties.filter((property) => {
      if (sector.key === 'layout' && (property.property === 'inset' || property.property === 'zIndex')) {
        return shouldShowLayoutPositionProps;
      }

      return true;
    }).map((property) => {
      const values = states.map((state) => readPropertyValue(state, sector.key, property.property));
      const mixed = isMixedValue(values);
      if (mixed) {
        hasMixedValues = true;
      }

      return {
        ...property,
        value: {
          committed: readPropertyValue(baseState, sector.key, property.property),
          mixed,
          disabled: false,
        },
      };
    }),
  }));

  const targetKind = selected.length > 0
    && selected.every((entry) => {
      const classes = Array.isArray(entry.classes)
        ? entry.classes
        : String(entry.classes ?? '').split(/\s+/).filter(Boolean);
      return classes.length > 0;
    })
    && !source?.activeState
    ? 'rule'
    : 'inline';

  return {
    targetKind,
    sectors,
    hasMixedValues,
    editable: true,
  };
}
