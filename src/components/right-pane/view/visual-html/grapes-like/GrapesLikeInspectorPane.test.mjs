import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const tsxLoaderUrl = new URL('../../../../code-editor/view/subcomponents/tsx-loader.mjs', import.meta.url).href;

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

const { default: GrapesLikeInspectorPane } = await import('./GrapesLikeInspectorPane.tsx');

function createSnapshot(overrides = {}) {
  return {
    selection: {
      selectedIds: ['cmp-1'],
      primarySelectedId: 'cmp-1',
      selectedLabel: '按钮 #cta',
      isMultiSelection: false,
      isDetached: false,
    },
    selector: {
      availableStates: [{ id: '', label: '默认状态' }],
      activeState: '',
      commonClasses: [{ name: 'btn' }],
      canAddClass: true,
      canRemoveClass: true,
      canSyncStyle: false,
    },
    style: {
      targetKind: 'inline',
      sectors: [{ key: 'layout', title: '布局', properties: [] }],
      hasMixedValues: false,
      editable: true,
    },
    layers: {
      roots: [],
      selectedLayerIds: [],
      expandedLayerIds: [],
      sortable: false,
    },
    capabilities: {
      canEditSelectors: true,
      canEditStyles: true,
      canEditLayers: true,
    },
    ...overrides,
  };
}

function createAdapter(snapshotOverrides = {}) {
  return {
    subscribe: () => () => {},
    getSnapshot: () => createSnapshot(snapshotOverrides),
  };
}

function renderInspector(snapshotOverrides = {}) {
  return renderToStaticMarkup(
    React.createElement(GrapesLikeInspectorPane, {
      adapter: createAdapter(snapshotOverrides),
      actions: {
        selector: { addClass: () => {}, removeClass: () => {}, setState: () => {} },
        style: { updateStyle: () => {} },
        layers: {
          selectLayer: () => {},
          selectParentLayer: () => {},
          duplicateLayer: () => {},
          deleteLayer: () => {},
          toggleLayerVisible: () => {},
          toggleLayerExpanded: () => {},
          moveLayer: () => {},
        },
      },
    }),
  );
}

test('GrapesLikeInspectorPane defaults to the style tab and renders style content', () => {
  const markup = renderInspector();

  assert.match(markup, /role="tab"[^>]*aria-selected="true"[^>]*>样式/);
  assert.match(markup, /role="tab"[^>]*aria-selected="false"[^>]*>图层/);
  assert.doesNotMatch(markup, /role="tab"[^>]*>选择器/);
  assert.match(markup, /data-selector-manager="true"/);
  assert.match(markup, /data-style-manager="true"/);
  assert.match(markup, /按钮 #cta/);
  assert.doesNotMatch(markup, /data-inspector-sync-hint="true"/);
});

test('GrapesLikeInspectorPane uses a compact project-aligned shell', () => {
  const markup = renderInspector({
    selection: {
      selectedIds: [],
      primarySelectedId: null,
      selectedLabel: '',
      isMultiSelection: false,
      isDetached: false,
    },
    selector: {
      availableStates: [],
      activeState: '',
      commonClasses: [],
      canAddClass: true,
      canRemoveClass: true,
      canSyncStyle: false,
    },
    style: {
      targetKind: 'inline',
      sectors: [],
      hasMixedValues: false,
      editable: true,
    },
  });

  assert.match(markup, /data-gjs-like-inspector="true"/);
  assert.match(markup, /role="tablist"/);
  assert.equal((markup.match(/role="tab"/g) ?? []).length, 2);
  assert.equal((markup.match(/aria-selected="true"/g) ?? []).length, 1);
});

test('GrapesLikeInspectorPane renders sync hint while layers are catching up', () => {
  const markup = renderInspector({
    selection: {
      selectedIds: ['cell-1'],
      primarySelectedId: 'cell-1',
      selectedLabel: '单元格 #cell-1',
      isMultiSelection: false,
      isDetached: false,
      revision: 3,
    },
    selector: {
      availableStates: [],
      activeState: '',
      commonClasses: [],
      canAddClass: true,
      canRemoveClass: true,
      canSyncStyle: false,
    },
    style: {
      targetKind: 'inline',
      sectors: [],
      hasMixedValues: false,
      editable: true,
      syncState: 'ready',
    },
    layers: {
      roots: [],
      selectedLayerIds: ['cell-1'],
      expandedLayerIds: [],
      sortable: false,
      syncState: 'pending',
    },
  });

  assert.match(markup, /data-inspector-sync-hint="true"/);
  assert.match(markup, />正在同步</);
  assert.match(markup, /单元格 #cell-1/);
});

test('GrapesLikeInspectorPane keeps sync hint hidden when staged sections are settled', () => {
  const markup = renderInspector({
    style: {
      targetKind: 'inline',
      sectors: [],
      hasMixedValues: false,
      editable: true,
      syncState: 'ready',
    },
    layers: {
      roots: [],
      selectedLayerIds: [],
      expandedLayerIds: [],
      sortable: false,
      syncState: 'ready',
    },
  });

  assert.doesNotMatch(markup, /data-inspector-sync-hint="true"/);
  assert.doesNotMatch(markup, />正在同步</);
});

test('VisualHtmlEditor source wires GrapesLikeInspectorPane directly to the grapesLikeBridge', async () => {
  const source = await readFile(new URL('../../VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(
    source,
    /<GrapesLikeInspectorPane\s+adapter=\{grapesLikeBridge\.adapter\}\s+actions=\{grapesLikeBridge\.actions\}\s*\/>/s,
  );
  assert.match(source, /\{grapesLikeBridge \? \(/);
  assert.doesNotMatch(source, /inspectorMode/);
});
