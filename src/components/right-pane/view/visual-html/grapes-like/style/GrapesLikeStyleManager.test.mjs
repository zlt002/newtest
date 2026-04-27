import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const tsxLoaderUrl = new URL('../../../../../code-editor/view/subcomponents/tsx-loader.mjs', import.meta.url).href;

const loaderSource = `
import * as base from ${JSON.stringify(tsxLoaderUrl)};

export async function resolve(specifier, context, nextResolve) {
  return base.resolve(specifier, context, nextResolve);
}

export async function load(url, context, nextLoad) {
  return base.load(url, context, nextLoad);
}
`;

register(`data:text/javascript,${encodeURIComponent(loaderSource)}`, import.meta.url);

const { EMPTY_STYLE_SNAPSHOT } = await import('../types.ts');
const { default: GrapesLikeStyleManager, toggleStyleSector } = await import('./GrapesLikeStyleManager.tsx');
const { default: GrapesLikeSector } = await import('./GrapesLikeSector.tsx');
const { default: GrapesLikeProperty, createStylePropertyPatch } = await import('./GrapesLikeProperty.tsx');
const { default: NumberField, syncNumberFieldState, applyDragDeltaToNumberField } = await import('./fields/NumberField.tsx');
const { default: SelectField } = await import('./fields/SelectField.tsx');
const { default: RadioField } = await import('./fields/RadioField.tsx');
const { default: CompositeField } = await import('./fields/CompositeField.tsx');
const { moveStackItem } = await import('./fields/StackField.tsx');
const { default: ShadowField, buildDefaultShadowLayer, addShadowLayer, removeShadowLayer, updateShadowLayer, stringifyShadowValue } = await import('./fields/ShadowField.tsx');

test('GrapesLikeStyleManager renders ordered sectors for layout spacing text appearance and advanced', () => {
  const markup = renderToStaticMarkup(
    React.createElement(GrapesLikeStyleManager, {
      style: {
        ...EMPTY_STYLE_SNAPSHOT,
        sectors: [
          { key: 'layout', title: '布局', properties: [] },
          { key: 'spacing', title: '间距', properties: [] },
          { key: 'text', title: '文本', properties: [] },
          { key: 'appearance', title: '外观', properties: [] },
          { key: 'advanced', title: '高级', properties: [] },
        ],
      },
      actions: { updateStyle: () => {} },
    }),
  );

  assert.match(markup, /布局/);
  assert.match(markup, /间距/);
  assert.match(markup, /文本/);
  assert.match(markup, /外观/);
  assert.match(markup, /高级/);
  assert.doesNotMatch(markup, /data-style-sector="flex"/);
});

test('GrapesLikeStyleManager uses a compact full-width grid for style properties', () => {
  const markup = renderToStaticMarkup(
    React.createElement(GrapesLikeStyleManager, {
      style: {
        ...EMPTY_STYLE_SNAPSHOT,
        sectors: [
          {
            key: 'layout',
            title: '布局',
            properties: [
              { property: 'display', label: '显示', kind: 'select', value: { committed: 'block' }, options: [
                { value: 'block', label: '块级' },
                { value: 'flex', label: '弹性布局' },
              ] },
              { property: 'width', label: '宽度', kind: 'number', value: { committed: { value: '100', unit: '%' } }, units: ['px', '%'] },
              { property: 'margin', label: '外边距', kind: 'composite', value: { committed: { top: '8', right: '8', bottom: '8', left: '8', unit: 'px' } } },
            ],
          },
        ],
      },
      actions: { updateStyle: () => {} },
    }),
  );

  assert.match(markup, /data-style-manager="true" class="[^"]*w-full/);
  assert.match(markup, /class="flex flex-col px-2 pb-2 w-full gl-sector-body"/);
  assert.match(markup, /class="gl-sector-grid grid grid-cols-2 grid-cols-\[repeat\(auto-fit,minmax\(96px,1fr\)\)\] gap-1"/);
  assert.match(markup, /class="gl-property gl-property-compact col-span-1 w-full"/);
  assert.match(markup, /class="gl-property gl-property-compact col-span-full w-full"/);
});

test('text appearance and advanced sectors use a single-column grid', () => {
  const markup = renderToStaticMarkup(
    React.createElement(GrapesLikeStyleManager, {
      style: {
        ...EMPTY_STYLE_SNAPSHOT,
        sectors: [
          {
            key: 'text',
            title: '文本',
            properties: [
              { property: 'color', label: '文字色', kind: 'color', value: { committed: { value: '#111111', unit: '' } } },
            ],
          },
          {
            key: 'appearance',
            title: '外观',
            properties: [
              { property: 'backgroundColor', label: '背景色', kind: 'color', value: { committed: { value: '#ffffff', unit: '' } } },
              { property: 'boxShadow', label: '投影', kind: 'shadow', value: { committed: { layers: [{ horizontal: { value: '0', unit: '' }, vertical: { value: '12', unit: 'px' }, blur: { value: '24', unit: 'px' }, spread: { value: '', unit: '' }, color: 'rgba(0, 0, 0, 0.18)', type: 'outside' }] } } },
            ],
          },
          {
            key: 'advanced',
            title: '高级',
            properties: [
              {
                property: 'transition',
                label: '过渡',
                kind: 'stack',
                value: {
                  committed: {
                    layers: [
                      {
                        property: 'all',
                        duration: { value: '200', unit: 'ms' },
                        timingFunction: 'ease',
                      },
                    ],
                  },
                },
              },
              {
                property: 'transform',
                label: '变换',
                kind: 'stack',
                value: {
                  committed: {
                    layers: [
                      {
                        functionName: 'translateY',
                        argument: '4px',
                      },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
      actions: { updateStyle: () => {} },
    }),
  );

  assert.match(markup, /data-style-sector="text"[\s\S]*?class="gl-sector-grid grid grid-cols-2 grid-cols-1 gap-1"/);
  assert.match(markup, /data-style-sector="appearance"[\s\S]*?class="gl-sector-grid grid grid-cols-2 grid-cols-1 gap-1"/);
  assert.match(markup, /data-style-sector="advanced"/);
});

test('ShadowField renders add button and layer controls', () => {
  const markup = renderToStaticMarkup(
    React.createElement(ShadowField, {
      label: '投影',
      value: {
        layers: [buildDefaultShadowLayer()],
      },
      onCommit: () => {},
    }),
  );

  assert.match(markup, /data-stack-field="投影"/);
  assert.match(markup, /添加投影/);
  assert.match(markup, /aria-expanded="true"/);
  assert.match(markup, /投影 1/);
  assert.match(markup, /删除投影 1/);
  assert.match(markup, /水平/);
  assert.match(markup, /垂直/);
  assert.match(markup, /模糊/);
  assert.match(markup, /扩散/);
  assert.match(markup, /颜色/);
  assert.match(markup, /类型/);
  assert.match(markup, /data-shadow-preview/);
  assert.match(markup, /data-shadow-move/);
  assert.match(markup, /draggable="true"/);
  assert.match(markup, /Outside/);
  assert.match(markup, /Inset/);
});

test('ShadowField helper functions add update remove and stringify layers', () => {
  const base = { layers: [buildDefaultShadowLayer()] };
  const added = addShadowLayer(base);
  const updated = updateShadowLayer(added, 1, {
    type: 'inset',
    color: 'rgba(15, 23, 42, 0.16)',
    blur: { value: '20', unit: 'px' },
  });
  const removed = removeShadowLayer(updated, 0);

  assert.equal(added.layers.length, 2);
  assert.equal(updated.layers[1].type, 'inset');
  assert.equal(updated.layers[1].blur.value, '20');
  assert.equal(stringifyShadowValue(removed), 'inset 0px 2px 20px 0px rgba(15, 23, 42, 0.16)');
});

test('ShadowField helper functions tolerate null or empty stack values', () => {
  const added = addShadowLayer(null, buildDefaultShadowLayer());
  const removed = removeShadowLayer(null, 0);
  const updated = updateShadowLayer(undefined, 0, {
    color: 'rgba(15, 23, 42, 0.16)',
  });

  assert.equal(added.layers.length, 1);
  assert.equal(removed.layers.length, 0);
  assert.equal(updated.layers.length, 0);
  assert.equal(stringifyShadowValue({ layers: [] }), '');
});

test('moveStackItem reorders stack entries without mutating the original array', () => {
  const source = ['a', 'b', 'c'];
  const moved = moveStackItem(source, 2, 0);

  assert.deepEqual(source, ['a', 'b', 'c']);
  assert.deepEqual(moved, ['c', 'a', 'b']);
});

test('GrapesLikeStyleManager renders representative field labels inside sectors', () => {
  const markup = renderToStaticMarkup(
    React.createElement(GrapesLikeStyleManager, {
      style: {
        ...EMPTY_STYLE_SNAPSHOT,
        sectors: [
          {
            key: 'layout',
            title: '布局',
            properties: [{
              property: 'display',
              label: '显示',
              kind: 'select',
              value: { committed: 'flex' },
              options: [
                { value: 'block', label: '块级' },
                { value: 'flex', label: '弹性布局' },
              ],
            }],
          },
          {
            key: 'flex',
            title: '弹性布局',
            properties: [{
              property: 'justifyContent',
              label: '主轴对齐',
              kind: 'select',
              value: { committed: { value: 'center', unit: '' } },
              options: [
                { value: 'flex-start', label: '起始' },
                { value: 'center', label: '居中' },
              ],
            }],
          },
          {
            key: 'spacing',
            title: '间距',
            properties: [{ property: 'margin', label: '外边距', kind: 'composite', value: { committed: { top: '8', right: '8', bottom: '8', left: '8', unit: 'px' } } }],
          },
          {
            key: 'appearance',
            title: '外观',
            properties: [
              { property: 'backgroundColor', label: '背景色', kind: 'color', value: { committed: { value: '#fff', unit: '' } } },
              { property: 'opacity', label: '透明度', kind: 'number', value: { committed: { value: '0.5', unit: '' } } },
            ],
          },
          {
            key: 'advanced',
            title: '高级',
            properties: [{
              property: 'transition',
              label: '过渡',
              kind: 'stack',
              value: {
                committed: {
                  layers: [
                      {
                        property: 'all',
                        duration: { value: '150', unit: 'ms' },
                        timingFunction: 'ease',
                      },
                    ],
                  },
              },
            }],
          },
          {
            key: 'text',
            title: '文本',
            properties: [
              { property: 'color', label: '文字色', kind: 'color', value: { committed: { value: '#fff', unit: '' } } },
              { property: 'fontFamily', label: '字体', kind: 'select', value: { committed: { value: 'Arial', unit: '' } }, options: [
                { value: 'Arial', label: 'Arial（无衬线）' },
                { value: 'Helvetica', label: 'Helvetica（无衬线）' },
              ] },
              { property: 'fontSize', label: '字号', kind: 'number', value: { committed: { value: '16', unit: 'px' } }, units: ['px', 'rem'] },
              { property: 'fontWeight', label: '字重', kind: 'select', value: { committed: { value: '700', unit: '' } }, options: [
                { value: '400', label: '400 常规' },
                { value: '700', label: '700 粗体' },
              ] },
              { property: 'textAlign', label: '文本对齐', kind: 'radio', value: { committed: { value: 'center', unit: '' } }, options: [
                { value: 'left', label: '左' },
                { value: 'center', label: '居中' },
                { value: 'right', label: '右' },
                { value: 'justify', label: '两端对齐' },
              ] },
            ],
          },
          {
            key: 'background',
            title: '背景',
            properties: [
              { property: 'backgroundColor', label: '背景色', kind: 'color', value: { committed: { value: '#fff', unit: '' } } },
            ],
          },
          {
            key: 'border',
            title: '边框',
            properties: [
              { property: 'border', label: '边框', kind: 'composite', value: { committed: { top: '1', right: '1', bottom: '1', left: '1', unit: 'px', style: 'solid', color: '#000000' } } },
            ],
          },
        ],
      },
      actions: { updateStyle: () => {} },
    }),
  );

  assert.match(markup, /显示/);
  assert.match(markup, /主轴对齐/);
  assert.match(markup, /背景色/);
  assert.match(markup, /透明度/);
  assert.match(markup, /文字色/);
  assert.match(markup, /字体/);
  assert.match(markup, /字号/);
  assert.match(markup, /字重/);
  assert.match(markup, /文本对齐/);
  assert.match(markup, /外边距/);
});

test('GrapesLikeStyleManager shows layout offset controls only for absolute or fixed positioning', () => {
  const staticMarkup = renderToStaticMarkup(
    React.createElement(GrapesLikeStyleManager, {
      style: {
        ...EMPTY_STYLE_SNAPSHOT,
        sectors: [
          {
            key: 'layout',
            title: '布局',
            properties: [
              {
                property: 'position',
                label: '定位',
                kind: 'radio',
                value: { committed: { value: 'static', unit: '' } },
                options: [
                  { value: 'static', label: '静态' },
                  { value: 'absolute', label: '绝对' },
                  { value: 'fixed', label: '固定' },
                ],
              },
              {
                property: 'inset',
                label: '偏移',
                kind: 'composite',
                value: {
                  committed: {
                    top: '10',
                    right: '12',
                    bottom: '14',
                    left: '16',
                    unit: 'px',
                  },
                },
              },
              {
                property: 'zIndex',
                label: '层级',
                kind: 'number',
                value: { committed: { value: '10', unit: '' } },
              },
            ],
          },
        ],
      },
      actions: { updateStyle: () => {} },
    }),
  );

  const absoluteMarkup = renderToStaticMarkup(
    React.createElement(GrapesLikeStyleManager, {
      style: {
        ...EMPTY_STYLE_SNAPSHOT,
        sectors: [
          {
            key: 'layout',
            title: '布局',
            properties: [
              {
                property: 'position',
                label: '定位',
                kind: 'radio',
                value: { committed: { value: 'absolute', unit: '' } },
                options: [
                  { value: 'static', label: '静态' },
                  { value: 'absolute', label: '绝对' },
                  { value: 'fixed', label: '固定' },
                ],
              },
              {
                property: 'inset',
                label: '偏移',
                kind: 'composite',
                value: {
                  committed: {
                    top: '10',
                    right: '12',
                    bottom: '14',
                    left: '16',
                    unit: 'px',
                  },
                },
              },
              {
                property: 'zIndex',
                label: '层级',
                kind: 'number',
                value: { committed: { value: '10', unit: '' } },
              },
            ],
          },
        ],
      },
      actions: { updateStyle: () => {} },
    }),
  );

  assert.doesNotMatch(staticMarkup, /data-style-property="inset"/);
  assert.doesNotMatch(staticMarkup, /data-style-property="zIndex"/);
  assert.match(absoluteMarkup, /data-style-property="inset"/);
  assert.match(absoluteMarkup, /data-style-property="zIndex"/);
  assert.match(absoluteMarkup, /aria-label="上 值"/);
  assert.match(absoluteMarkup, /aria-label="右 值"/);
  assert.match(absoluteMarkup, /aria-label="下 值"/);
  assert.match(absoluteMarkup, /aria-label="左 值"/);
  assert.match(absoluteMarkup, /层级/);
});

test('GrapesLikeStyleManager keeps number and select controls compact in narrow layouts', () => {
  const markup = renderToStaticMarkup(
    React.createElement(GrapesLikeStyleManager, {
      style: {
        ...EMPTY_STYLE_SNAPSHOT,
        sectors: [
          {
            key: 'layout',
            title: '布局',
            properties: [
              { property: 'width', label: '宽度', kind: 'number', value: { committed: { value: '21', unit: 'px' } }, units: ['px', '%'] },
              { property: 'display', label: '显示', kind: 'select', value: { committed: 'flex' }, options: [
                { value: 'block', label: '块级' },
                { value: 'flex', label: '弹性布局' },
              ] },
            ],
          },
        ],
      },
      actions: { updateStyle: () => {} },
    }),
  );

  assert.match(markup, /flex h-8 min-w-0 items-center gap-1 rounded-md border border-border bg-background px-1 py-1/);
  assert.match(markup, /border-l border-border bg-transparent py-0 pl-2 pr-1 text-xs leading-4 text-foreground outline-none/);
  assert.match(markup, /appearance-none/);
});

test('GrapesLikeStyleManager hides flex sector entirely when display is not flex', () => {
  const markup = renderToStaticMarkup(
    React.createElement(GrapesLikeStyleManager, {
      style: {
        ...EMPTY_STYLE_SNAPSHOT,
        sectors: [
          {
            key: 'layout',
            title: '布局',
            properties: [{
              property: 'display',
              label: '显示',
              kind: 'select',
              value: { committed: { value: 'block', unit: '' } },
              options: [
                { value: 'block', label: '块级' },
                { value: 'flex', label: '弹性布局' },
              ],
            }],
          },
          {
            key: 'flex',
            title: '弹性布局',
            properties: [{
              property: 'justifyContent',
              label: '主轴对齐',
              kind: 'select',
              value: { committed: { value: '', unit: '' } },
              options: [
                { value: 'flex-start', label: '起始' },
                { value: 'center', label: '居中' },
              ],
            }],
          },
        ],
      },
      actions: { updateStyle: () => {} },
    }),
  );

  assert.match(markup, /data-style-sector="layout"[\s\S]*aria-expanded="true"/);
  assert.doesNotMatch(markup, /data-style-sector="flex"/);
  assert.doesNotMatch(markup, /主轴对齐/);
});

test('GrapesLikeStyleManager auto expands flex when display is flex', () => {
  const markup = renderToStaticMarkup(
    React.createElement(GrapesLikeStyleManager, {
      style: {
        ...EMPTY_STYLE_SNAPSHOT,
        sectors: [
          {
            key: 'layout',
            title: '布局',
            properties: [{
              property: 'display',
              label: '显示',
              kind: 'select',
              value: { committed: { value: 'flex', unit: '' } },
              options: [
                { value: 'block', label: '块级' },
                { value: 'flex', label: '弹性布局' },
              ],
            }],
          },
          {
            key: 'flex',
            title: '弹性布局',
            properties: [{
              property: 'justifyContent',
              label: '主轴对齐',
              kind: 'select',
              value: { committed: { value: 'center', unit: '' } },
              options: [
                { value: 'flex-start', label: '起始' },
                { value: 'center', label: '居中' },
              ],
            }],
          },
        ],
      },
      actions: { updateStyle: () => {} },
    }),
  );

  assert.match(markup, /data-style-sector="flex"[\s\S]*aria-expanded="true"/);
  assert.match(markup, /主轴对齐/);
});

test('GrapesLikeSector omits body content when collapsed', () => {
  const expandedMarkup = renderToStaticMarkup(
    React.createElement(GrapesLikeSector, {
      title: '常规',
      expanded: true,
      onToggle: () => {},
      children: React.createElement('div', null, '显示字段'),
    }),
  );
  const collapsedMarkup = renderToStaticMarkup(
    React.createElement(GrapesLikeSector, {
      title: '常规',
      expanded: false,
      onToggle: () => {},
      children: React.createElement('div', null, '显示字段'),
    }),
  );

  assert.match(expandedMarkup, /显示字段/);
  assert.doesNotMatch(collapsedMarkup, /显示字段/);
  assert.match(collapsedMarkup, /aria-expanded="false"/);
});

test('toggleStyleSector flips only the requested sector', () => {
  const next = toggleStyleSector(
    {
      layout: true,
      flex: true,
      spacing: false,
      text: true,
      background: true,
      border: true,
      advanced: false,
    },
    'spacing',
  );

  assert.deepEqual(next, {
    layout: true,
    flex: true,
    spacing: true,
    text: true,
    background: true,
    border: true,
    advanced: false,
  });
});

test('createStylePropertyPatch maps style property changes into patch objects', () => {
  assert.deepEqual(
    createStylePropertyPatch('layout', 'display', { value: 'flex', unit: '' }),
    {
      layout: {
        display: { value: 'flex', unit: '' },
      },
    },
  );
  assert.deepEqual(
    createStylePropertyPatch('layout', 'inset', {
      top: '10',
      right: '12',
      bottom: '14',
      left: '16',
      unit: 'px',
    }),
    {
      layout: {
        inset: {
          top: '10',
          right: '12',
          bottom: '14',
          left: '16',
          unit: 'px',
        },
      },
    },
  );
  assert.deepEqual(
    createStylePropertyPatch('layout', 'zIndex', { value: '5', unit: '' }),
    {
      layout: {
        zIndex: { value: '5', unit: '' },
      },
    },
  );
  assert.deepEqual(
    createStylePropertyPatch('spacing', 'margin', {
      top: '8',
      right: '16',
      bottom: '8',
      left: '16',
      unit: 'px',
    }),
    {
      spacing: {
        margin: {
          top: '8',
          right: '16',
          bottom: '8',
          left: '16',
          unit: 'px',
        },
      },
    },
  );
  assert.deepEqual(
    createStylePropertyPatch('border', 'border', {
      top: '1',
      right: '1',
      bottom: '1',
      left: '1',
      unit: 'px',
      style: 'solid',
      color: '#000000',
    }),
    {
      border: {
        border: {
          top: '1',
          right: '1',
          bottom: '1',
          left: '1',
          unit: 'px',
          style: 'solid',
          color: '#000000',
        },
      },
    },
  );
});

test('basic field components render GrapesJS-like controls and labels', () => {
  const markup = renderToStaticMarkup(
    React.createElement('div', null,
      React.createElement(NumberField, {
        label: '宽度',
        value: { value: '100', unit: '%' },
        units: ['px', '%'],
        onCommit: () => {},
      }),
      React.createElement(SelectField, {
        label: '显示',
        value: 'flex',
        options: [
          { value: 'block', label: '块级' },
          { value: 'flex', label: '弹性布局' },
          { value: 'grid', label: '网格' },
        ],
        onCommit: () => {},
      }),
      React.createElement(RadioField, {
        label: '浮动',
        value: 'left',
        options: [
          { value: 'none', label: '无' },
          { value: 'left', label: '左浮动' },
          { value: 'right', label: '右浮动' },
        ],
        onCommit: () => {},
      }),
      React.createElement(CompositeField, {
        label: '外边距',
        description: '上 右 下 左',
        children: React.createElement('span', null, 'composite body'),
      }),
      React.createElement(GrapesLikeProperty, {
        property: {
          label: '外边距',
          property: 'margin',
          kind: 'composite',
          value: {
            committed: {
              top: '',
              right: '',
              bottom: '',
              left: '',
              unit: '',
            },
          },
        },
        targetKind: 'inline',
        onCommit: () => {},
      }),
    ),
  );

  assert.match(markup, /宽度/);
  assert.match(markup, /显示/);
  assert.match(markup, /浮动/);
  assert.match(markup, /外边距/);
  assert.match(markup, /外边距 整体|上/);
  assert.match(markup, /弹性布局/);
  assert.match(markup, /左浮动/);
  assert.match(markup, /100/);
});

test('GrapesLikeProperty reads the current scalar value from unit-style snapshots for select and radio fields', () => {
  const markup = renderToStaticMarkup(
    React.createElement('div', null,
      React.createElement(GrapesLikeProperty, {
        property: {
          label: '显示',
          property: 'display',
          kind: 'select',
          value: { committed: { value: 'flex', unit: '' } },
          options: [
            { value: 'block', label: '块级' },
            { value: 'flex', label: '弹性布局' },
          ],
        },
        targetKind: 'inline',
        onCommit: () => {},
      }),
      React.createElement(GrapesLikeProperty, {
        property: {
          label: '浮动',
          property: 'float',
          kind: 'radio',
          value: { committed: { value: 'left', unit: '' } },
          options: [
            { value: 'none', label: '无' },
            { value: 'left', label: '左浮动' },
            { value: 'right', label: '右浮动' },
          ],
        },
        targetKind: 'inline',
        onCommit: () => {},
      }),
    ),
  );

  assert.match(markup, /option value="flex" selected=""/);
  assert.match(markup, /aria-pressed="true"[^>]*aria-label="左浮动"/);
});

test('GrapesLikeProperty renders transform stack fields with function and argument controls', () => {
  const markup = renderToStaticMarkup(
    React.createElement(GrapesLikeProperty, {
      property: {
        label: '变换',
        property: 'transform',
        kind: 'stack',
        value: {
          committed: {
            layers: [
              {
                functionName: 'translateY',
                argument: '4px',
              },
            ],
          },
        },
      },
      targetKind: 'inline',
      onCommit: () => {},
    }),
  );

  assert.match(markup, /data-stack-field="变换"/);
  assert.match(markup, /添加变换/);
  assert.match(markup, /类型/);
  assert.match(markup, /参数/);
  assert.match(markup, /data-stack-move/);
  assert.match(markup, /draggable="true"/);
  assert.match(markup, /translateY/);
  assert.match(markup, /4px/);
});

test('GrapesLikeProperty renders transition stack fields with GrapesJS preset dropdowns', () => {
  const markup = renderToStaticMarkup(
    React.createElement(GrapesLikeProperty, {
      property: {
        label: '过渡',
        property: 'transition',
        kind: 'stack',
        value: {
          committed: {
            layers: [
              {
                property: 'all',
                duration: { value: '200', unit: 'ms' },
                timingFunction: 'ease',
              },
            ],
          },
        },
      },
      targetKind: 'inline',
      onCommit: () => {},
    }),
  );

  assert.match(markup, /data-stack-field="过渡"/);
  assert.match(markup, /属性/);
  assert.match(markup, /时长/);
  assert.match(markup, /缓动/);
  assert.match(markup, /data-stack-move/);
  assert.match(markup, /draggable="true"/);
  assert.match(markup, /option value="all" selected=""/);
  assert.match(markup, /option value="background-color"/);
  assert.match(markup, /option value="ease" selected=""/);
  assert.match(markup, /option value="ease-in-out"/);
  assert.match(markup, /200/);
});

test('syncNumberFieldState adopts incoming prop values when the selected style changes', () => {
  assert.deepEqual(
    syncNumberFieldState(
      { draft: '', unit: '' },
      { value: '', unit: '' },
      { value: '40', unit: 'px' },
      ['px', '%'],
    ),
    { draft: '40', unit: 'px' },
  );
});

test('syncNumberFieldState keeps the current draft while props are unchanged during typing', () => {
  assert.deepEqual(
    syncNumberFieldState(
      { draft: '12', unit: 'px' },
      { value: '', unit: 'px' },
      { value: '', unit: 'px' },
      ['px', '%'],
    ),
    { draft: '12', unit: 'px' },
  );
});

test('syncNumberFieldState falls back to px when the value has no explicit unit', () => {
  assert.deepEqual(
    syncNumberFieldState(
      { draft: '', unit: '' },
      { value: '', unit: '' },
      { value: '40', unit: '' },
      ['px', '%'],
    ),
    { draft: '40', unit: 'px' },
  );
});

test('NumberField preserves usable space for numeric input when a unit select is present', () => {
  const markup = renderToStaticMarkup(
    React.createElement(NumberField, {
      label: '左',
      value: { value: '40', unit: '' },
      units: ['px', '%', 'vw', 'vh'],
      onCommit: () => {},
    }),
  );

  assert.match(markup, /flex h-8 min-w-0 items-center gap-1 rounded-md border border-border bg-background px-1 py-1/);
  assert.match(markup, /flex-1 bg-transparent px-0\.5 py-0 text-xs leading-4 outline-none/);
  assert.match(markup, /border-l border-border bg-transparent py-0 pl-2 pr-1 text-xs leading-4 text-foreground outline-none/);
  assert.match(markup, /text-\[10px\] font-medium leading-4 text-muted-foreground/);
  assert.match(markup, /aria-label="拖动 左"/);
  assert.match(markup, /cursor-ew-resize/);
  assert.match(markup, /transition-colors hover:bg-accent focus-within:bg-accent/);
  assert.match(markup, /<option value="px" selected="">px<\/option>/);
});

test('applyDragDeltaToNumberField adjusts values with precision modifiers', () => {
  assert.deepEqual(
    applyDragDeltaToNumberField(
      { value: '10', unit: 'px' },
      3,
      { shiftKey: false, altKey: false },
    ),
    { value: '13', unit: 'px' },
  );

  assert.deepEqual(
    applyDragDeltaToNumberField(
      { value: '10', unit: 'px' },
      3,
      { shiftKey: true, altKey: false },
    ),
    { value: '10.3', unit: 'px' },
  );

  assert.deepEqual(
    applyDragDeltaToNumberField(
      { value: '10', unit: 'px' },
      2,
      { shiftKey: false, altKey: true },
    ),
    { value: '30', unit: 'px' },
  );
});

test('border width exposes unit choices in the composite border control', () => {
  const markup = renderToStaticMarkup(
    React.createElement(GrapesLikeProperty, {
      property: {
        label: '边框',
        property: 'border',
        kind: 'composite',
        value: {
          committed: {
            top: '1',
            right: '1',
            bottom: '1',
            left: '1',
            unit: 'px',
            style: 'solid',
            color: '#000000',
          },
        },
      },
      targetKind: 'inline',
      onCommit: () => {},
    }),
  );

  assert.match(markup, /aria-label="宽度 单位"/);
  assert.match(markup, /<option value="px" selected="">px<\/option>/);
  assert.match(markup, /<option value="%">%<\/option>/);
});

test('color properties render a visual color picker alongside the hex value', () => {
  const backgroundMarkup = renderToStaticMarkup(
    React.createElement(GrapesLikeProperty, {
      property: {
        label: '背景色',
        property: 'backgroundColor',
        kind: 'color',
        value: {
          committed: {
            value: '#ffffff',
            unit: '',
          },
        },
      },
      targetKind: 'inline',
      onCommit: () => {},
    }),
  );

  const borderMarkup = renderToStaticMarkup(
    React.createElement(GrapesLikeProperty, {
      property: {
        label: '边框',
        property: 'border',
        kind: 'composite',
        value: {
          committed: {
            top: '1',
            right: '1',
            bottom: '1',
            left: '1',
            unit: 'px',
            style: 'solid',
            color: '#000000',
          },
        },
      },
      targetKind: 'inline',
      onCommit: () => {},
    }),
  );

  assert.match(backgroundMarkup, /type="color"/);
  assert.match(backgroundMarkup, /aria-label="背景色 颜色块"/);
  assert.match(backgroundMarkup, /value="#ffffff"/);
  assert.match(backgroundMarkup, /h-8 min-w-0 items-center gap-1 rounded-md border border-border bg-background/);
  assert.match(borderMarkup, /aria-label="颜色 颜色块"/);
  assert.match(borderMarkup, /type="color"/);
  assert.match(borderMarkup, /value="#000000"/);
});

test('margin and padding render four split controls', () => {
  const marginMarkup = renderToStaticMarkup(
    React.createElement(GrapesLikeProperty, {
      property: {
        label: '外边距',
        property: 'margin',
        kind: 'composite',
        value: {
          committed: {
            top: '8',
            right: '10',
            bottom: '12',
            left: '14',
            unit: 'px',
          },
        },
      },
      targetKind: 'inline',
      onCommit: () => {},
    }),
  );
  const paddingMarkup = renderToStaticMarkup(
    React.createElement(GrapesLikeProperty, {
      property: {
        label: '内边距',
        property: 'padding',
        kind: 'composite',
        value: {
          committed: {
            top: '11',
            right: '12',
            bottom: '11',
            left: '12',
            unit: 'px',
          },
        },
      },
      targetKind: 'inline',
      onCommit: () => {},
    }),
  );

  assert.match(marginMarkup, /data-spacing-box-field="外边距"/);
  assert.match(marginMarkup, /aria-label="切换到统一设置"/);
  assert.match(marginMarkup, /data-box-field-mode="split"/);
  assert.match(marginMarkup, /grid grid-cols-2 gap-1/);
  assert.match(marginMarkup, /aria-label="上 值"/);
  assert.match(marginMarkup, /aria-label="右 值"/);
  assert.match(marginMarkup, /aria-label="下 值"/);
  assert.match(marginMarkup, /aria-label="左 值"/);
  assert.match(marginMarkup, /aria-label="上 单位"/);
  assert.match(paddingMarkup, /data-spacing-box-field="内边距"/);
  assert.match(paddingMarkup, /aria-label="切换到统一设置"/);
  assert.match(paddingMarkup, /data-box-field-mode="split"/);
  assert.match(paddingMarkup, /aria-label="上 值"/);
  assert.match(paddingMarkup, /aria-label="左 单位"/);
});

test('uniform box values default to a single unified control', () => {
  const markup = renderToStaticMarkup(
    React.createElement(GrapesLikeProperty, {
      property: {
        label: '内边距',
        property: 'padding',
        kind: 'composite',
        value: {
          committed: {
            top: '11',
            right: '11',
            bottom: '11',
            left: '11',
            unit: 'px',
          },
        },
      },
      targetKind: 'inline',
      onCommit: () => {},
    }),
  );

  assert.match(markup, /data-box-field-mode="unified"/);
  assert.match(markup, /aria-label="切换到四向设置"/);
  assert.match(markup, /aria-label="内边距 整体 值"/);
  assert.match(markup, /aria-label="内边距 整体 单位"/);
  assert.doesNotMatch(markup, /aria-label="上 值"/);
  assert.doesNotMatch(markup, /aria-label="右 值"/);
  assert.doesNotMatch(markup, /aria-label="下 值"/);
  assert.doesNotMatch(markup, /aria-label="左 值"/);
});

test('non-uniform border radius defaults to split corner controls', () => {
  const markup = renderToStaticMarkup(
    React.createElement(GrapesLikeProperty, {
      property: {
        label: '圆角',
        property: 'borderRadius',
        kind: 'composite',
        value: {
          committed: {
            topLeft: '10',
            topRight: '12',
            bottomRight: '14',
            bottomLeft: '16',
            unit: 'px',
          },
        },
      },
      targetKind: 'inline',
      onCommit: () => {},
    }),
  );

  assert.match(markup, /data-radius-field="圆角"/);
  assert.match(markup, /aria-label="切换到统一设置"/);
  assert.match(markup, /data-radius-field-mode="split"/);
  assert.match(markup, /grid grid-cols-2 gap-1/);
  assert.match(markup, /aria-label="左上 值"/);
  assert.match(markup, /aria-label="右上 值"/);
  assert.match(markup, /aria-label="右下 值"/);
  assert.match(markup, /aria-label="左下 值"/);
  assert.match(markup, /aria-label="左上 单位"/);
  assert.match(markup, /aria-label="右上 单位"/);
  assert.match(markup, /aria-label="右下 单位"/);
  assert.match(markup, /aria-label="左下 单位"/);
});

test('uniform border radius defaults to a single unified control', () => {
  const markup = renderToStaticMarkup(
    React.createElement(GrapesLikeProperty, {
      property: {
        label: '圆角',
        property: 'borderRadius',
        kind: 'composite',
        value: {
          committed: {
            topLeft: '10',
            topRight: '10',
            bottomRight: '10',
            bottomLeft: '10',
            unit: 'px',
          },
        },
      },
      targetKind: 'inline',
      onCommit: () => {},
    }),
  );

  assert.match(markup, /data-radius-field-mode="unified"/);
  assert.match(markup, /aria-label="切换到四向设置"/);
  assert.match(markup, /aria-label="圆角 整体 值"/);
  assert.match(markup, /aria-label="圆角 整体 单位"/);
  assert.doesNotMatch(markup, /aria-label="左上 值"/);
  assert.doesNotMatch(markup, /aria-label="右上 值"/);
  assert.doesNotMatch(markup, /aria-label="右下 值"/);
  assert.doesNotMatch(markup, /aria-label="左下 值"/);
});

test('style fields stay full-width and avoid empty side gutters', () => {
  const markup = renderToStaticMarkup(
    React.createElement(GrapesLikeProperty, {
      property: {
        label: '宽度',
        property: 'width',
        kind: 'number',
        value: {
          committed: { value: '100', unit: '%' },
        },
        units: ['px', '%'],
      },
      targetKind: 'inline',
      onCommit: () => {},
    }),
  );

  assert.match(markup, /data-style-property="width"/);
  assert.match(markup, /class="gl-property gl-property-compact col-span-1 w-full"/);
  assert.match(markup, /class="gl-field flex min-w-0 w-full/);
});

test('mixed style fields render placeholder instead of concrete value', () => {
  const markup = renderToStaticMarkup(
    React.createElement(GrapesLikeProperty, {
      property: {
        label: '宽度',
        property: 'width',
        kind: 'number',
        value: {
          committed: { value: '100', unit: 'px' },
          mixed: true,
        },
        units: ['px', '%'],
      },
      targetKind: 'rule',
      onCommit: () => {},
    }),
  );

  assert.match(markup, /placeholder="混合"/);
});
