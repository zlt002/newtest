import test from 'node:test';
import assert from 'node:assert/strict';
import { readStyleSnapshot, readStyleState } from '../styleAdapter.ts';

test('readStyleSnapshot marks mixed values and defaults class selections to inline target', () => {
  const result = readStyleSnapshot({
    selection: [
      { styles: { width: '100px', color: '#111111', 'background-color': '#eeeeee' }, classes: ['btn'] },
      { styles: { width: '120px', color: '#222222', 'background-color': '#ffffff' }, classes: ['btn'] },
    ],
    activeState: '',
  });

  const layout = result.sectors.find((sector) => sector.key === 'layout');
  const text = result.sectors.find((sector) => sector.key === 'text');
  const appearance = result.sectors.find((sector) => sector.key === 'appearance');
  const width = layout?.properties.find((property) => property.property === 'width');
  const color = text?.properties.find((property) => property.property === 'color');
  const backgroundColor = appearance?.properties.find((property) => property.property === 'backgroundColor');

  assert.equal(width?.value.mixed, true);
  assert.deepEqual(width?.value.committed, { value: '', unit: '' });
  assert.equal(color?.value.mixed, true);
  assert.deepEqual(color?.value.committed, { value: '', unit: '' });
  assert.equal(backgroundColor?.value.mixed, true);
  assert.deepEqual(backgroundColor?.value.committed, { value: '', unit: '' });
  assert.equal(result.targetKind, 'inline');
});

test('readStyleSnapshot keeps Framer-like generated classes on inline target', () => {
  const result = readStyleSnapshot({
    selection: [
      {
        styles: {
          display: 'flex',
          width: '100%',
        },
        classes: ['framer-cgiad', 'framer-1t7cri2'],
      },
    ],
    activeState: '',
  });

  assert.equal(result.targetKind, 'inline');
});

test('readStyleState expands margin/padding/appearance fields', () => {
  const result = readStyleState({
    display: 'flex',
    'flex-direction': 'row-reverse',
    'flex-wrap': 'wrap',
    'justify-content': 'space-between',
    'align-items': 'center',
    'align-content': 'stretch',
    order: '2',
    'flex-basis': '240px',
    'flex-grow': '1',
    'flex-shrink': '0',
    'align-self': 'flex-end',
    float: 'left',
    position: 'absolute',
    top: '10px',
    right: '20px',
    bottom: '30px',
    left: '40px',
    'z-index': '7',
    width: '100%',
    height: '50vh',
    maxWidth: '1200px',
    minHeight: '320px',
    margin: '8px 16px',
    padding: '12px',
    'background-color': '#ffffff',
    color: '#222222',
    'font-family': 'Arial',
    'font-size': '16px',
    'font-weight': '700',
    'letter-spacing': '1px',
    'line-height': '1.5',
    'text-align': 'center',
    border: '1px solid #000000',
    borderRadius: '4px 8px 12px 16px',
    'box-shadow': 'inset 0 12px 24px 4px rgba(0, 0, 0, 0.18)',
    opacity: '0.5',
    transition: 'all 200ms ease',
    transform: 'translateY(4px)',
    perspective: '800px',
  });

  assert.equal(result.layout.display.value, 'flex');
  assert.equal(result.flex.flexDirection.value, 'row-reverse');
  assert.equal(result.flex.flexWrap.value, 'wrap');
  assert.equal(result.flex.justifyContent.value, 'space-between');
  assert.equal(result.flex.alignItems.value, 'center');
  assert.equal(result.flex.alignContent.value, 'stretch');
  assert.equal(result.flex.order.value, '2');
  assert.equal(result.flex.flexBasis.value, '240');
  assert.equal(result.flex.flexBasis.unit, 'px');
  assert.equal(result.flex.flexGrow.value, '1');
  assert.equal(result.flex.flexShrink.value, '0');
  assert.equal(result.flex.alignSelf.value, 'flex-end');
  assert.equal(result.layout.float.value, 'left');
  assert.equal(result.layout.position.value, 'absolute');
  assert.deepEqual(result.layout.inset, {
    top: '10',
    right: '20',
    bottom: '30',
    left: '40',
    unit: 'px',
  });
  assert.equal(result.layout.zIndex.value, '7');
  assert.equal(result.layout.zIndex.unit, '');
  assert.equal(result.layout.width.value, '100');
  assert.equal(result.layout.width.unit, '%');
  assert.equal(result.layout.height.value, '50');
  assert.equal(result.layout.maxWidth.value, '1200');
  assert.equal(result.layout.minHeight.value, '320');
  assert.deepEqual(result.spacing.margin, {
    top: '8',
    right: '16',
    bottom: '8',
    left: '16',
    unit: 'px',
  });
  assert.equal(result.text.color.value, '#222222');
  assert.equal(result.text.fontFamily.value, 'Arial');
  assert.equal(result.text.fontSize.value, '16');
  assert.equal(result.text.fontSize.unit, 'px');
  assert.equal(result.text.fontWeight.value, '700');
  assert.equal(result.text.letterSpacing.value, '1');
  assert.equal(result.text.letterSpacing.unit, 'px');
  assert.equal(result.text.lineHeight.value, '1.5');
  assert.equal(result.text.textAlign.value, 'center');
  assert.equal(result.appearance.backgroundColor.value, '#ffffff');
  assert.equal(result.appearance.border.style, 'solid');
  assert.equal(result.appearance.border.color, '#000000');
  assert.equal(result.appearance.border.top, '1');
  assert.equal(result.appearance.border.unit, 'px');
  assert.deepEqual(result.appearance.borderRadius, {
    topLeft: '4',
    topRight: '8',
    bottomRight: '12',
    bottomLeft: '16',
    unit: 'px',
  });
  assert.deepEqual(result.appearance.boxShadow, {
    layers: [
      {
        horizontal: { value: '0', unit: '' },
        vertical: { value: '12', unit: 'px' },
        blur: { value: '24', unit: 'px' },
        spread: { value: '4', unit: 'px' },
        color: 'rgba(0, 0, 0, 0.18)',
        type: 'inset',
      },
    ],
  });
  assert.equal(result.appearance.opacity.value, '0.5');
  assert.deepEqual(result.advanced.transition, {
    layers: [
      {
        property: 'all',
        duration: { value: '200', unit: 'ms' },
        timingFunction: 'ease',
      },
    ],
  });
  assert.deepEqual(result.advanced.transform, {
    layers: [{ functionName: 'translateY', argument: '4px' }],
  });
  assert.equal(result.advanced.perspective.value, '800');
});

test('readStyleState merges partial longhands with shorthand fallback', () => {
  const result = readStyleState({
    padding: '10px 20px 30px 40px',
    'padding-right': '96px',
    'border-radius': '4px 8px 12px 16px',
    'border-top-left-radius': '6px',
  });

  assert.deepEqual(result.spacing.padding, {
    top: '10',
    right: '96',
    bottom: '30',
    left: '40',
    unit: 'px',
  });
  assert.deepEqual(result.appearance.borderRadius, {
    topLeft: '6',
    topRight: '8',
    bottomRight: '12',
    bottomLeft: '16',
    unit: 'px',
  });
});

test('readStyleSnapshot resolves partial longhands with shorthand fallback', () => {
  const result = readStyleSnapshot({
    selection: [
      {
        inlineStyles: {
          padding: '10px 20px 30px 40px',
          'padding-right': '96px',
        },
      },
    ],
    activeState: '',
  });

  const spacing = result.sectors.find((sector) => sector.key === 'spacing');
  const padding = spacing.properties.find((property) => property.property === 'padding');

  assert.deepEqual(padding.value.committed, {
    top: '10',
    right: '96',
    bottom: '30',
    left: '40',
    unit: 'px',
  });
  assert.equal(padding.value.resolved.source, 'inline');
});

test('readStyleState parses multiple box-shadow layers', () => {
  const result = readStyleState({
    'box-shadow': '0 2px 6px rgba(15, 23, 42, 0.16), inset 0 0 0 1px rgba(255, 255, 255, 0.7)',
  });

  assert.deepEqual(result.appearance.boxShadow, {
    layers: [
      {
        horizontal: { value: '0', unit: '' },
        vertical: { value: '2', unit: 'px' },
        blur: { value: '6', unit: 'px' },
        spread: { value: '', unit: '' },
        color: 'rgba(15, 23, 42, 0.16)',
        type: 'outside',
      },
      {
        horizontal: { value: '0', unit: '' },
        vertical: { value: '0', unit: '' },
        blur: { value: '0', unit: '' },
        spread: { value: '1', unit: 'px' },
        color: 'rgba(255, 255, 255, 0.7)',
        type: 'inset',
      },
    ],
  });
});

test('readStyleState tolerates empty box-shadow values without disturbing advanced fields', () => {
  const result = readStyleState({
    'box-shadow': 'none',
    transition: 'all 200ms ease',
    transform: 'translateY(4px)',
  });

  assert.deepEqual(result.appearance.boxShadow, { layers: [] });
  assert.deepEqual(result.advanced.transition, {
    layers: [
      {
        property: 'all',
        duration: { value: '200', unit: 'ms' },
        timingFunction: 'ease',
      },
    ],
  });
  assert.deepEqual(result.advanced.transform, {
    layers: [{ functionName: 'translateY', argument: '4px' }],
  });
});

test('readStyleSnapshot surfaces flex sector values', () => {
  const result = readStyleSnapshot({
    selection: [
      {
        styles: {
          display: 'flex',
          'justify-content': 'center',
          'align-items': 'flex-start',
          'flex-grow': '2',
        },
        classes: [],
      },
    ],
    activeState: '',
  });

  const flex = result.sectors.find((sector) => sector.key === 'flex');
  const justifyContent = flex?.properties.find((property) => property.property === 'justifyContent');
  const alignItems = flex?.properties.find((property) => property.property === 'alignItems');
  const flexGrow = flex?.properties.find((property) => property.property === 'flexGrow');

  assert.equal(justifyContent?.value.committed.value, 'center');
  assert.equal(alignItems?.value.committed.value, 'flex-start');
  assert.equal(flexGrow?.value.committed.value, '2');
});

test('readStyleSnapshot groups layout spacing text appearance and advanced properties in the new sectors', () => {
  const result = readStyleSnapshot({
    selection: [
      {
        styles: {
          display: 'flex',
          width: '100%',
          top: '12px',
          margin: '8px',
          color: '#111111',
          'background-color': '#eeeeee',
          border: '1px solid #000000',
          'box-shadow': '0 12px 24px rgba(0, 0, 0, 0.18)',
          opacity: '0.5',
          transition: 'all 200ms ease',
          transform: 'translateY(4px)',
        },
        classes: [],
      },
    ],
    activeState: '',
  });

  const layout = result.sectors.find((sector) => sector.key === 'layout');
  const spacing = result.sectors.find((sector) => sector.key === 'spacing');
  const text = result.sectors.find((sector) => sector.key === 'text');
  const appearance = result.sectors.find((sector) => sector.key === 'appearance');
  const advanced = result.sectors.find((sector) => sector.key === 'advanced');
  const position = layout?.properties.find((property) => property.property === 'position');

  assert.ok(layout?.properties.find((property) => property.property === 'display'));
  assert.ok(layout?.properties.find((property) => property.property === 'width'));
  assert.equal(position?.kind, 'radio');
  assert.equal(layout?.properties.some((property) => property.property === 'inset'), false);
  assert.equal(layout?.properties.some((property) => property.property === 'zIndex'), false);
  assert.ok(spacing?.properties.find((property) => property.property === 'margin'));
  assert.equal(spacing?.properties.some((property) => property.property === 'top'), false);
  assert.ok(text?.properties.find((property) => property.property === 'color'));
  assert.ok(appearance?.properties.find((property) => property.property === 'backgroundColor'));
  assert.ok(appearance?.properties.find((property) => property.property === 'border'));
  assert.ok(appearance?.properties.find((property) => property.property === 'boxShadow'));
  assert.ok(appearance?.properties.find((property) => property.property === 'opacity'));
  assert.ok(advanced?.properties.find((property) => property.property === 'transition'));
  assert.ok(advanced?.properties.find((property) => property.property === 'transform'));
});

test('readStyleSnapshot groups appearance and advanced fields for shadow opacity transition and transform', () => {
  const result = readStyleSnapshot({
    selection: [
      {
        styles: {
          'background-color': '#ffffff',
          border: '1px solid #111111',
          'box-shadow': '0 12px 24px rgba(0, 0, 0, 0.18)',
          opacity: '0.5',
          transition: 'all 200ms ease',
          transform: 'translateY(4px)',
        },
        classes: [],
      },
    ],
    activeState: '',
  });

  const appearance = result.sectors.find((sector) => sector.key === 'appearance');
  const advanced = result.sectors.find((sector) => sector.key === 'advanced');

  assert.ok(appearance?.properties.find((property) => property.property === 'backgroundColor'));
  assert.ok(appearance?.properties.find((property) => property.property === 'border'));
  assert.ok(appearance?.properties.find((property) => property.property === 'boxShadow'));
  assert.ok(appearance?.properties.find((property) => property.property === 'opacity'));
  assert.ok(advanced?.properties.find((property) => property.property === 'transition'));
  assert.ok(advanced?.properties.find((property) => property.property === 'transform'));
});

test('readStyleState parses border shorthand with style before width', () => {
  const result = readStyleState({
    border: 'solid 1px red',
  });

  assert.equal(result.appearance.border.style, 'solid');
  assert.equal(result.appearance.border.top, '1');
  assert.equal(result.appearance.border.unit, 'px');
  assert.equal(result.appearance.border.color, 'red');
});

test('readStyleState parses keyword border widths', () => {
  const result = readStyleState({
    border: 'thin solid red',
  });

  assert.equal(result.appearance.border.top, 'thin');
  assert.equal(result.appearance.border.unit, '');
  assert.equal(result.appearance.border.style, 'solid');
  assert.equal(result.appearance.border.color, 'red');
});

test('readStyleState resolves single-side border declarations without leaking style tokens into color', () => {
  const result = readStyleState({
    border: '5px solid none none rgb(217, 217, 217)',
    'border-top': '1px dashed #d9d9d9',
  });

  assert.equal(result.appearance.border.top, '1');
  assert.equal(result.appearance.border.right, '5');
  assert.equal(result.appearance.border.unit, 'px');
  assert.equal(result.appearance.border.style, '');
  assert.equal(result.appearance.border.color, '');
  assert.equal(result.appearance.border.topStyle, 'dashed');
  assert.equal(result.appearance.border.rightStyle, 'solid');
  assert.equal(result.appearance.border.topColor, '#d9d9d9');
  assert.equal(result.appearance.border.rightColor, 'rgb(217, 217, 217)');
});

test('readStyleState falls back to GrapesJS defaults for display float and position', () => {
  const result = readStyleState({});

  assert.equal(result.layout.display.value, 'block');
  assert.equal(result.layout.float.value, 'none');
  assert.equal(result.layout.position.value, 'static');
});

test('readStyleSnapshot surfaces default display float and position when the target has no explicit values', () => {
  const result = readStyleSnapshot({
    selection: [
      { styles: {}, classes: [] },
    ],
    activeState: '',
  });

  const layout = result.sectors.find((sector) => sector.key === 'layout');
  const display = layout?.properties.find((property) => property.property === 'display');
  const float = layout?.properties.find((property) => property.property === 'float');
  const position = layout?.properties.find((property) => property.property === 'position');

  assert.equal(display?.value.committed.value, 'block');
  assert.equal(float?.value.committed.value, 'none');
  assert.equal(position?.value.committed.value, 'static');
});

test('readStyleSnapshot resolves inline authored values over computed values', () => {
  const result = readStyleSnapshot({
    selection: [{
      computedStyles: {
        width: 'auto',
        'font-size': '16px',
        color: 'rgb(0, 0, 0)',
      },
      inlineStyles: {
        width: '251.46px',
        'font-size': '21px',
        color: '#ffffff',
      },
      modelStyles: {},
    }],
    activeState: '',
  });

  const layout = result.sectors.find((sector) => sector.key === 'layout');
  const text = result.sectors.find((sector) => sector.key === 'text');
  const width = layout.properties.find((property) => property.property === 'width');
  const fontSize = text.properties.find((property) => property.property === 'fontSize');
  const color = text.properties.find((property) => property.property === 'color');

  assert.equal(width.value.committed.value, '251.46');
  assert.equal(width.value.resolved.source, 'inline');
  assert.deepEqual(width.value.resolved.computed, { value: 'auto', unit: '' });
  assert.deepEqual(width.value.resolved.authored, { value: '251.46', unit: 'px' });
  assert.equal(fontSize.value.committed.value, '21');
  assert.equal(fontSize.value.resolved.source, 'inline');
  assert.equal(color.value.committed.value, '#ffffff');
  assert.equal(color.value.resolved.source, 'inline');
});

test('readStyleSnapshot displays computed-only values without treating them as authored', () => {
  const result = readStyleSnapshot({
    selection: [{
      computedStyles: {
        width: '1200px',
        'font-size': '16px',
      },
      inlineStyles: {},
      modelStyles: {},
    }],
    activeState: '',
  });

  const layout = result.sectors.find((sector) => sector.key === 'layout');
  const text = result.sectors.find((sector) => sector.key === 'text');
  const width = layout.properties.find((property) => property.property === 'width');
  const fontSize = text.properties.find((property) => property.property === 'fontSize');

  assert.equal(width.value.committed.value, '1200');
  assert.equal(width.value.resolved.source, 'computed');
  assert.deepEqual(width.value.resolved.authored, { value: '', unit: '' });
  assert.equal(fontSize.value.committed.value, '16');
  assert.equal(fontSize.value.resolved.source, 'computed');
});

test('readStyleSnapshot treats empty authored values as absent', () => {
  const result = readStyleSnapshot({
    selection: [{
      computedStyles: {
        'font-size': '21px',
      },
      inlineStyles: {},
      modelStyles: {
        'font-size': '',
      },
    }],
    activeState: '',
  });

  const text = result.sectors.find((sector) => sector.key === 'text');
  const fontSize = text.properties.find((property) => property.property === 'fontSize');

  assert.equal(fontSize.value.committed.value, '21');
  assert.equal(fontSize.value.resolved.source, 'computed');
});

test('readStyleSnapshot marks mixed source values consistently', () => {
  const result = readStyleSnapshot({
    selection: [
      {
        computedStyles: { width: '100px' },
        inlineStyles: { width: '100px' },
        modelStyles: {},
      },
      {
        computedStyles: { width: '120px' },
        inlineStyles: { width: '120px' },
        modelStyles: {},
      },
    ],
    activeState: '',
  });

  const layout = result.sectors.find((sector) => sector.key === 'layout');
  const width = layout.properties.find((property) => property.property === 'width');

  assert.equal(width.value.mixed, true);
  assert.equal(width.value.resolved.source, 'mixed');
  assert.deepEqual(width.value.committed, { value: '', unit: '' });
});

test('readStyleSnapshot keeps position offsets visible for legacy styles input', () => {
  const result = readStyleSnapshot({
    selection: [
      {
        styles: {
          position: 'absolute',
          top: '10px',
        },
      },
    ],
    activeState: '',
  });

  const layout = result.sectors.find((sector) => sector.key === 'layout');
  const position = layout.properties.find((property) => property.property === 'position');

  assert.equal(position.value.committed.value, 'absolute');
  assert.equal(layout.properties.some((property) => property.property === 'inset'), true);
  assert.equal(layout.properties.some((property) => property.property === 'zIndex'), true);
});

test('readStyleSnapshot falls back to legacy styles when modelStyles is empty', () => {
  const result = readStyleSnapshot({
    selection: [
      {
        styles: { width: '100px' },
        modelStyles: {},
      },
    ],
    activeState: '',
  });

  const layout = result.sectors.find((sector) => sector.key === 'layout');
  const width = layout.properties.find((property) => property.property === 'width');

  assert.equal(width.value.committed.value, '100');
  assert.equal(width.value.resolved.source, 'model');
});

test('readStyleSnapshot does not mark same displayed values mixed only because sources differ', () => {
  const result = readStyleSnapshot({
    selection: [
      {
        inlineStyles: { width: '100px' },
      },
      {
        modelStyles: { width: '100px' },
      },
    ],
    activeState: '',
  });

  const layout = result.sectors.find((sector) => sector.key === 'layout');
  const width = layout.properties.find((property) => property.property === 'width');

  assert.equal(width.value.mixed, false);
  assert.equal(width.value.committed.value, '100');
  assert.equal(width.value.resolved.source, 'inline');
});
