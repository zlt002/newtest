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

const { default: GrapesLikeSelectorManager } = await import('./GrapesLikeSelectorManager.tsx');
const { createSelectorManagerActions, createSelectorManagerRuntime } = await import('./useSelectorManagerState.ts');
const { setComponentState } = await import('../selectorMapper');

test('GrapesLikeSelectorManager renders class tags, state select and selected label', () => {
  const markup = renderToStaticMarkup(
    React.createElement(GrapesLikeSelectorManager, {
      selection: {
        selectedIds: ['cmp-1', 'cmp-2'],
        primarySelectedId: 'cmp-1',
        selectedLabel: '按钮 #cta',
        isMultiSelection: true,
        isDetached: false,
      },
      selector: {
        availableStates: [
          { id: '', label: '默认状态' },
          { id: 'hover', label: '悬停' },
        ],
        activeState: 'hover',
        commonClasses: [{ name: 'btn' }, { name: 'btn-primary' }],
        canAddClass: true,
        canRemoveClass: true,
        canSyncStyle: false,
      },
      actions: {
        addClass: () => {},
        removeClass: () => {},
        setState: () => {},
      },
    }),
  );

  assert.match(markup, /Classes/);
  assert.match(markup, /状态/);
  assert.match(markup, /默认状态/);
  assert.match(markup, /btn-primary/);
  assert.match(markup, /Selected:/);
  assert.doesNotMatch(markup, /placeholder="添加类名"/);
});

test('createSelectorManagerActions trims blank class names and preserves state values', () => {
  const events = [];
  const actions = createSelectorManagerActions({
    addClass: (className) => events.push(['add', className]),
    removeClass: (className) => events.push(['remove', className]),
    setState: (state) => events.push(['state', state]),
  });

  actions.addClass('  btn-secondary  ');
  actions.addClass('   ');
  actions.removeClass('  btn-primary  ');
  actions.changeState('focus');

  assert.deepEqual(events, [
    ['add', 'btn-secondary'],
    ['remove', 'btn-primary'],
    ['state', 'focus'],
  ]);
});

test('createSelectorManagerRuntime handles Enter, plus button, state changes and clears the input after add', () => {
  const events = [];
  let inputValue = '  btn-secondary  ';
  const runtime = createSelectorManagerRuntime({
    state: {
      selectedLabel: '按钮 #cta',
      activeState: 'staged',
      classTags: ['btn'],
    },
    classInputValue: inputValue,
    setClassInputValue: (nextValue) => {
      inputValue = nextValue;
    },
    handlers: {
      addClass: (className) => events.push(['add', className]),
      removeClass: (className) => events.push(['remove', className]),
      setState: (state) => events.push(['state', state]),
    },
  });

  runtime.handleClassInputKeyDown({
    key: 'Enter',
    preventDefault: () => events.push(['prevent', 'enter']),
  });

  assert.deepEqual(events, [
    ['prevent', 'enter'],
    ['add', 'btn-secondary'],
  ]);
  assert.equal(inputValue, '');
  assert.equal(runtime.state.activeState, '');

  inputValue = '  btn-outline  ';
  const secondRuntime = createSelectorManagerRuntime({
    state: runtime.state,
    classInputValue: inputValue,
    setClassInputValue: (nextValue) => {
      inputValue = nextValue;
    },
    handlers: {
      addClass: (className) => events.push(['add', className]),
      removeClass: (className) => events.push(['remove', className]),
      setState: (state) => events.push(['state', state]),
    },
  });

  secondRuntime.handleAddButtonClick();
  secondRuntime.handleStateChange('focus');

  assert.equal(inputValue, '');
  assert.deepEqual(events, [
    ['prevent', 'enter'],
    ['add', 'btn-secondary'],
    ['add', 'btn-outline'],
    ['state', 'focus'],
  ]);
});

test('setState normalizes unknown states before writing back', () => {
  const states = [];
  const component = {
    setState(nextState) {
      states.push(nextState);
    },
  };

  setComponentState(component, 'staged');
  setComponentState(component, 'hover');

  assert.deepEqual(states, ['', 'hover']);
});
