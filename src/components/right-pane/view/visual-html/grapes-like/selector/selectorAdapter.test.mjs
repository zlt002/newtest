import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

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
import { readSelectorSnapshot, readSelectorState, normalizeSelectorStateValue } from '../selectorAdapter.ts';

test('readSelectorSnapshot returns common classes for multi selection', () => {
  const result = readSelectorSnapshot({
    selected: [
      { label: '按钮', classes: ['btn', 'primary'] },
      { label: '链接', classes: ['btn', 'link'] },
    ],
    activeState: 'hover',
  });

  assert.deepEqual(result.commonClasses, [{ name: 'btn' }]);
  assert.equal(result.activeState, 'hover');
  assert.deepEqual(result.availableStates, [
    { id: '', label: '默认状态' },
    { id: 'hover', label: '悬停' },
    { id: 'active', label: '激活' },
    { id: 'focus', label: '聚焦' },
  ]);
});

test('readSelectorState returns selected label, classes and active state', () => {
  const result = readSelectorState({
    name: '按钮',
    id: 'ctaButton',
    classes: ['btn', 'btn-primary'],
    state: 'hover',
  });

  assert.deepEqual(result, {
    selectedLabel: '按钮 #ctaButton',
    activeState: 'hover',
    classTags: ['btn', 'btn-primary'],
  });
});

test('readSelectorState falls back to component type when name is missing', () => {
  const result = readSelectorState({
    type: '卡片',
    id: 'heroCard',
    classes: 'card card-primary',
    state: '',
  });

  assert.equal(result.selectedLabel, '卡片 #heroCard');
  assert.deepEqual(result.classTags, ['card', 'card-primary']);
});

test('readSelectorState normalizes unknown states to the empty state option', () => {
  const result = readSelectorState({
    name: '按钮',
    state: 'staged',
  });

  assert.equal(result.activeState, '');
  assert.equal(normalizeSelectorStateValue('hover'), 'hover');
  assert.equal(normalizeSelectorStateValue('unknown'), '');
});
