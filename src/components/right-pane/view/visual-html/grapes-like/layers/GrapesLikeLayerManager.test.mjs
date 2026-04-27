import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFile } from 'node:fs/promises';
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

const { default: GrapesLikeLayerManager } = await import('./GrapesLikeLayerManager.tsx');
const { default: GrapesLikeLayerItem } = await import('./GrapesLikeLayerItem.tsx');
const { default: GrapesLikeLayerTree } = await import('./GrapesLikeLayerTree.tsx');

test('GrapesLikeLayerManager renders nested nodes and visibility controls', () => {
  const markup = renderToStaticMarkup(
    React.createElement(GrapesLikeLayerManager, {
      layers: {
        roots: [{
          id: 'hero',
          label: '区块 #hero',
          visible: true,
          selected: false,
          expanded: true,
          children: [{
            id: 'cta',
            label: '按钮 #cta',
            visible: true,
            selected: true,
            expanded: false,
            children: [],
          }],
        }],
        selectedLayerIds: ['cta'],
        expandedLayerIds: ['hero'],
        sortable: false,
      },
      actions: {
        selectLayer: () => {},
        selectParentLayer: () => {},
        duplicateLayer: () => {},
        deleteLayer: () => {},
        toggleLayerVisible: () => {},
        toggleLayerExpanded: () => {},
        moveLayer: () => {},
      },
    }),
  );

  assert.match(markup, /区块 #hero/);
  assert.match(markup, /按钮 #cta/);
  assert.match(markup, /隐藏图层/);
  assert.match(markup, /aria-pressed="true"/);
  assert.match(markup, /data-layer-actions="true"/);
});

test('GrapesLikeLayerManager highlights all selected nodes', () => {
  const markup = renderToStaticMarkup(
    React.createElement(GrapesLikeLayerManager, {
      layers: {
        roots: [
          { id: 'hero', label: '区块 #hero', visible: true, selected: true, expanded: false, children: [] },
          { id: 'cta', label: '按钮 #cta', visible: true, selected: true, expanded: false, children: [] },
        ],
        selectedLayerIds: ['hero', 'cta'],
        expandedLayerIds: [],
        sortable: false,
      },
      actions: {
        selectLayer: () => {},
        selectParentLayer: () => {},
        duplicateLayer: () => {},
        deleteLayer: () => {},
        toggleLayerVisible: () => {},
        toggleLayerExpanded: () => {},
        moveLayer: () => {},
      },
    }),
  );

  assert.equal((markup.match(/aria-pressed="true"/g) ?? []).length, 2);
  assert.equal((markup.match(/data-layer-selected="true"/g) ?? []).length, 2);
  assert.match(markup, /bg-primary\/10/);
});

test('GrapesLikeLayerManager shows an expander for deferred children', () => {
  const markup = renderToStaticMarkup(
    React.createElement(GrapesLikeLayerManager, {
      layers: {
        roots: [
          { id: 'hero', label: '区块 #hero', visible: true, selected: true, expanded: false, canExpand: true, children: [] },
        ],
        selectedLayerIds: ['hero'],
        expandedLayerIds: [],
        sortable: false,
      },
      actions: {
        selectLayer: () => {},
        selectParentLayer: () => {},
        duplicateLayer: () => {},
        deleteLayer: () => {},
        toggleLayerVisible: () => {},
        toggleLayerExpanded: () => {},
        moveLayer: () => {},
      },
    }),
  );

  assert.match(markup, /aria-label="展开图层"/);
});

test('GrapesLikeLayerManager exposes drag handles when sorting is enabled', () => {
  const markup = renderToStaticMarkup(
    React.createElement(GrapesLikeLayerManager, {
      layers: {
        roots: [
          { id: 'hero', label: '区块 #hero', visible: true, selected: false, expanded: false, children: [] },
        ],
        selectedLayerIds: [],
        expandedLayerIds: [],
        sortable: true,
      },
      actions: {
        selectLayer: () => {},
        selectParentLayer: () => {},
        duplicateLayer: () => {},
        deleteLayer: () => {},
        toggleLayerVisible: () => {},
        toggleLayerExpanded: () => {},
        moveLayer: () => {},
      },
    }),
  );

  assert.match(markup, /draggable="true"/);
});

test('GrapesLikeLayerManager renders layer rows with visibility label and drag handle in fixed order', () => {
  const markup = renderToStaticMarkup(
    React.createElement(GrapesLikeLayerManager, {
      layers: {
        roots: [
          { id: 'hero', label: '区块 #hero', visible: true, selected: false, expanded: false, children: [] },
        ],
        selectedLayerIds: [],
        expandedLayerIds: [],
        sortable: true,
      },
      actions: {
        selectLayer: () => {},
        selectParentLayer: () => {},
        duplicateLayer: () => {},
        deleteLayer: () => {},
        toggleLayerVisible: () => {},
        toggleLayerExpanded: () => {},
        moveLayer: () => {},
      },
    }),
  );

  assert.match(markup, /data-layer-id="hero"/);
  assert.match(markup, /data-layer-row="true"/);
  assert.match(markup, /区块 #hero[\s\S]*aria-label="隐藏图层"/);
  assert.doesNotMatch(markup, /aria-label="拖动图层"/);
});

test('GrapesLikeLayerItem keeps selection bound to the label button only', async () => {
  const source = await readFile(new URL('./GrapesLikeLayerItem.tsx', import.meta.url), 'utf8');

  assert.match(source, /onClick=\{\(event\) => actions\.selectLayer/);
  assert.doesNotMatch(source, /<div[\s\S]*?data-layer-id=\{node\.id\}[^>]*onClick=/);
});

test('GrapesLikeLayerItem renders a compact full-width row and drop indicator line', () => {
  const markup = renderToStaticMarkup(
    React.createElement(GrapesLikeLayerItem, {
      node: {
        id: 'hero',
        label: '区块 #hero',
        visible: true,
        selected: false,
        expanded: false,
        children: [],
      },
      actions: {
        selectLayer: () => {},
        selectParentLayer: () => {},
        duplicateLayer: () => {},
        deleteLayer: () => {},
        toggleLayerVisible: () => {},
        toggleLayerExpanded: () => {},
        moveLayer: () => {},
      },
      sortable: true,
      dropIndicator: 'before',
    }),
  );

  assert.match(markup, /w-full/);
  assert.match(markup, /data-layer-row="true"/);
  assert.match(markup, /group\/layer-row/);
  assert.match(markup, /data-drop-indicator="before"/);
  assert.match(markup, /before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-primary/);
});

test('GrapesLikeLayerItem keeps action buttons hidden until hover when node is not selected', () => {
  const markup = renderToStaticMarkup(
    React.createElement(GrapesLikeLayerItem, {
      node: {
        id: 'hero',
        label: '图片',
        visible: true,
        selected: false,
        expanded: false,
        children: [],
      },
      actions: {
        selectLayer: () => {},
        selectParentLayer: () => {},
        duplicateLayer: () => {},
        deleteLayer: () => {},
        toggleLayerVisible: () => {},
        toggleLayerExpanded: () => {},
        moveLayer: () => {},
      },
      sortable: true,
    }),
  );

  assert.match(markup, /data-layer-actions="true"/);
  assert.match(markup, /opacity-0/);
  assert.match(markup, /group-hover\/layer-row:opacity-100/);
});

test('GrapesLikeLayerItem keeps action buttons visible when node is selected', () => {
  const markup = renderToStaticMarkup(
    React.createElement(GrapesLikeLayerItem, {
      node: {
        id: 'hero',
        label: '正文',
        visible: true,
        selected: true,
        expanded: false,
        children: [],
      },
      actions: {
        selectLayer: () => {},
        selectParentLayer: () => {},
        duplicateLayer: () => {},
        deleteLayer: () => {},
        toggleLayerVisible: () => {},
        toggleLayerExpanded: () => {},
        moveLayer: () => {},
      },
      sortable: true,
    }),
  );

  assert.match(markup, /data-layer-actions="true"/);
  assert.match(markup, /opacity-100/);
});

test('GrapesLikeLayerTree uses compact indentation spacing for nested nodes', () => {
  const markup = renderToStaticMarkup(
    React.createElement(GrapesLikeLayerTree, {
      nodes: [{
        id: 'root',
        label: '容器 #root',
        visible: true,
        selected: false,
        expanded: true,
        children: [{
          id: 'child',
          label: '容器 #child',
          visible: true,
          selected: false,
          expanded: true,
          children: [{
            id: 'grandchild',
            label: '容器 #grandchild',
            visible: true,
            selected: false,
            expanded: false,
            children: [],
          }],
        }],
      }],
      actions: {
        selectLayer: () => {},
        selectParentLayer: () => {},
        duplicateLayer: () => {},
        deleteLayer: () => {},
        toggleLayerVisible: () => {},
        toggleLayerExpanded: () => {},
        moveLayer: () => {},
      },
    }),
  );

  assert.match(markup, /style="padding-left:12px"/);
  assert.doesNotMatch(markup, /style="padding-left:28px"/);
});
