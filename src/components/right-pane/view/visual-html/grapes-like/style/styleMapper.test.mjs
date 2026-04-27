import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { applyStylePatch, updateStyle } from '../styleMapper.ts';

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

const { createStylePropertyPatch } = await import('./GrapesLikeProperty.tsx');
const { createStyleWritebackHandler } = await import('../styleMapper.ts');

test('updateStyle routes rule and inline writes by targetKind', () => {
  const calls = [];
  const editor = {
    updateRuleStyle(property, value) {
      calls.push(['rule', property, value]);
      return { kind: 'rule', property, value };
    },
    updateInlineStyle(property, value) {
      calls.push(['inline', property, value]);
      return { kind: 'inline', property, value };
    },
  };

  updateStyle(editor, { property: 'width', value: '120px', targetKind: 'rule' });
  updateStyle(editor, { property: 'height', value: '80px', targetKind: 'inline' });

  assert.deepEqual(calls, [
    ['rule', 'width', '120px'],
    ['inline', 'height', '80px'],
  ]);
});

test('updateStyle normalizes inspector property names into CSS property names', () => {
  const calls = [];
  const editor = {
    updateRuleStyle(property, value) {
      calls.push(['rule', property, value]);
    },
    updateInlineStyle(property, value) {
      calls.push(['inline', property, value]);
    },
  };

  updateStyle(editor, { property: 'backgroundColor', value: '#ff0', targetKind: 'rule' });
  updateStyle(editor, { property: 'fontSize', value: '16px', targetKind: 'rule' });
  updateStyle(editor, { property: 'textAlign', value: 'center', targetKind: 'inline' });
  updateStyle(editor, { property: 'borderRadius', value: '12px 12px 12px 12px', targetKind: 'inline' });
  updateStyle(editor, { property: 'maxWidth', value: '640px', targetKind: 'rule' });
  updateStyle(editor, { property: 'justifyContent', value: 'center', targetKind: 'rule' });

  assert.deepEqual(calls, [
    ['rule', 'background-color', '#ff0'],
    ['rule', 'font-size', '16px'],
    ['inline', 'text-align', 'center'],
    ['inline', 'border-radius', '12px 12px 12px 12px'],
    ['rule', 'max-width', '640px'],
    ['rule', 'justify-content', 'center'],
  ]);
});

test('applyStylePatch writes primitive and composite style values back', () => {
  const next = applyStylePatch(
    {
      display: 'block',
      'justify-content': 'flex-start',
      'align-items': 'stretch',
      'flex-grow': '0',
      margin: '1px 2px 3px 4px',
      'margin-top': '1px',
      'margin-right': '2px',
      'margin-bottom': '3px',
      'margin-left': '4px',
      padding: '5px 6px 7px 8px',
      'padding-top': '5px',
      'padding-right': '6px',
      'padding-bottom': '7px',
      'padding-left': '8px',
      'background-color': '#eeeeee',
      color: '#111111',
      'font-family': 'Arial',
      'font-size': '14px',
      'font-weight': '400',
      'letter-spacing': '0px',
      'line-height': '1.2',
      'text-align': 'left',
      'border-top-left-radius': '1px',
      'border-top-right-radius': '2px',
      'border-bottom-right-radius': '3px',
      'border-bottom-left-radius': '4px',
      border: '1px solid #111111',
      'box-shadow': '0 4px 12px rgba(15, 23, 42, 0.16), inset 0 0 0 1px rgba(255, 255, 255, 0.7)',
      opacity: '0.8',
      transition: 'all 120ms ease',
      transform: 'translateY(2px)',
      perspective: '600px',
    },
    {
      layout: {
        display: { value: 'flex', unit: '' },
        inset: { top: '10', right: '20', bottom: '30', left: '40', unit: 'px' },
        zIndex: { value: '5', unit: '' },
      },
      flex: {
        justifyContent: { value: 'center', unit: '' },
        alignItems: { value: 'flex-end', unit: '' },
        flexGrow: { value: '2', unit: '' },
        flexBasis: { value: '240', unit: 'px' },
      },
      spacing: {
        margin: { top: '8', unit: 'px' },
        padding: { right: '10', unit: 'px' },
      },
      text: {
        color: { value: '#222222', unit: '' },
        fontFamily: { value: 'Arial', unit: '' },
        fontSize: { value: '16', unit: 'px' },
        fontWeight: { value: '700', unit: '' },
        letterSpacing: { value: '', unit: '' },
        lineHeight: { value: '1.5', unit: '' },
        textAlign: { value: 'center', unit: '' },
      },
      appearance: {
        backgroundColor: { value: '#ffffff', unit: '' },
        boxShadow: {
          layers: [
            {
              horizontal: { value: '0', unit: '' },
              vertical: { value: '4', unit: 'px' },
              blur: { value: '12', unit: 'px' },
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
        },
        opacity: { value: '0.8', unit: '' },
        borderRadius: { topLeft: '9', unit: 'px' },
        border: { top: '2', right: '2', bottom: '2', left: '2', unit: 'px', style: 'solid', color: '#000000' },
      },
      advanced: {
        transition: {
          layers: [
            {
              property: 'all',
              duration: { value: '120', unit: 'ms' },
              timingFunction: 'ease',
            },
          ],
        },
        transform: {
          layers: [{ functionName: 'translateY', argument: '2px' }],
        },
        perspective: { value: '800', unit: 'px' },
      },
    },
  );

  assert.deepEqual(next, {
    display: 'flex',
    'justify-content': 'center',
    'align-items': 'flex-end',
    'flex-grow': '2',
    'flex-basis': '240px',
    inset: '10px 20px 30px 40px',
    'z-index': '5',
    margin: '8px 2px 3px 4px',
    padding: '5px 10px 7px 8px',
    'background-color': '#ffffff',
    color: '#222222',
    'font-family': 'Arial',
    'font-size': '16px',
    'font-weight': '700',
    'line-height': '1.5',
    'text-align': 'center',
    'border-radius': '9px 2px 3px 4px',
    border: '2px solid #000000',
    'box-shadow': '0 4px 12px rgba(15, 23, 42, 0.16), inset 0 0 0 1px rgba(255, 255, 255, 0.7)',
    opacity: '0.8',
    transition: 'all 120ms ease',
    transform: 'translateY(2px)',
    perspective: '800px',
  });
  assert.equal(Object.hasOwn(next, 'backgroundColor'), false);
  assert.equal(Object.hasOwn(next, 'margin-top'), false);
  assert.equal(Object.hasOwn(next, 'margin-right'), false);
  assert.equal(Object.hasOwn(next, 'padding-left'), false);
  assert.equal(Object.hasOwn(next, 'border-top-left-radius'), false);
  assert.equal(Object.hasOwn(next, 'border-bottom-left-radius'), false);
  assert.equal(Object.hasOwn(next, 'decorations'), false);
});

test('createStyleWritebackHandler maps property patches through applyStylePatch before invoking onPatch', () => {
  const patches = [];
  const writeback = createStyleWritebackHandler(
    {
      layout: {
        display: { value: 'block', unit: '' },
        float: { value: '', unit: '' },
        position: { value: '', unit: '' },
        inset: { top: '', right: '', bottom: '', left: '', unit: '' },
        zIndex: { value: '', unit: '' },
        width: { value: '', unit: '' },
        height: { value: '', unit: '' },
        maxWidth: { value: '', unit: '' },
        minHeight: { value: '', unit: '' },
      },
      flex: {
        flexDirection: { value: '', unit: '' },
        flexWrap: { value: '', unit: '' },
        justifyContent: { value: '', unit: '' },
        alignItems: { value: '', unit: '' },
        alignContent: { value: '', unit: '' },
        order: { value: '', unit: '' },
        flexBasis: { value: '', unit: '' },
        flexGrow: { value: '', unit: '' },
        flexShrink: { value: '', unit: '' },
        alignSelf: { value: '', unit: '' },
      },
      spacing: {
        margin: { top: '', right: '', bottom: '', left: '', unit: '' },
        padding: { top: '', right: '', bottom: '', left: '', unit: '' },
      },
      text: {
        color: { value: '#111111', unit: '' },
        fontFamily: { value: 'Arial', unit: '' },
        fontSize: { value: '14', unit: 'px' },
        fontWeight: { value: '400', unit: '' },
        letterSpacing: { value: '', unit: '' },
        lineHeight: { value: '1.2', unit: '' },
        textAlign: { value: 'left', unit: '' },
      },
      appearance: {
        backgroundColor: { value: '#eeeeee', unit: '' },
        border: {
          top: '1',
          right: '1',
          bottom: '1',
          left: '1',
          unit: 'px',
          style: 'solid',
          color: '#111111',
        },
        borderRadius: {
          topLeft: '',
          topRight: '',
          bottomRight: '',
          bottomLeft: '',
          unit: '',
        },
        boxShadow: {
          layers: [
            {
              horizontal: { value: '0', unit: '' },
              vertical: { value: '4', unit: 'px' },
              blur: { value: '12', unit: 'px' },
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
        },
        opacity: { value: '', unit: '' },
      },
      advanced: {
        transition: { layers: [] },
        transform: { layers: [] },
        perspective: { value: '', unit: '' },
      },
    },
    (nextStyle) => {
      patches.push(nextStyle);
    },
  );

  writeback(createStylePropertyPatch('appearance', 'backgroundColor', { value: '#ffffff', unit: '' }));
  writeback(createStylePropertyPatch('text', 'textAlign', { value: 'center', unit: '' }));
  writeback(createStylePropertyPatch('appearance', 'boxShadow', {
    layers: [
      {
        horizontal: { value: '0', unit: '' },
        vertical: { value: '8', unit: 'px' },
        blur: { value: '20', unit: 'px' },
        spread: { value: '', unit: '' },
        color: 'rgba(15, 23, 42, 0.16)',
        type: 'outside',
      },
      {
        horizontal: { value: '0', unit: '' },
        vertical: { value: '0', unit: '' },
        blur: { value: '0', unit: '' },
        spread: { value: '1', unit: 'px' },
        color: 'rgba(255, 255, 255, 0.12)',
        type: 'inset',
      },
    ],
  }));
  writeback(createStylePropertyPatch('advanced', 'transition', {
    layers: [
      {
        property: 'all',
        duration: { value: '150', unit: 'ms' },
        timingFunction: 'ease',
      },
    ],
  }));
  writeback(createStylePropertyPatch('advanced', 'transform', {
    layers: [
      {
        functionName: 'translateY',
        argument: '4px',
      },
    ],
  }));

  assert.equal(patches.length, 5);
  assert.equal(patches[0]['background-color'], '#ffffff');
  assert.equal(patches[0].display, 'block');
  assert.equal(patches[0].border, '1px solid #111111');
  assert.equal(patches[0]['box-shadow'], '0 4px 12px rgba(15, 23, 42, 0.16), inset 0 0 0 1px rgba(255, 255, 255, 0.7)');
  assert.equal(patches[1]['text-align'], 'center');
  assert.equal(patches[2]['box-shadow'], '0 8px 20px rgba(15, 23, 42, 0.16), inset 0 0 0 1px rgba(255, 255, 255, 0.12)');
  assert.equal(patches[3].transition, 'all 150ms ease');
  assert.equal(patches[4].transform, 'translateY(4px)');
});
