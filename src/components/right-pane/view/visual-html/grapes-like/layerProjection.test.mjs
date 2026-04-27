import test from 'node:test';
import assert from 'node:assert/strict';

import { projectVisibleLayerTree } from './layerProjection.ts';

const selectedTree = [{
  id: 'root',
  label: 'Root',
  visible: true,
  selected: false,
  expanded: true,
  children: [{
    id: 'table',
    label: '表格 #table',
    visible: true,
    selected: false,
    expanded: false,
    children: [{
      id: 'row-1',
      label: '行 #row-1',
      visible: true,
      selected: false,
      expanded: false,
      children: [{
        id: 'cell-1',
        label: '单元格 #cell-1',
        visible: true,
        selected: true,
        expanded: false,
        children: [{
          id: 'text-1',
          label: '文本 #text-1',
          visible: true,
          selected: false,
          expanded: false,
          children: [],
        }],
      }],
    }],
  }],
}];

const multiRootTree = [{
  id: 'root-a',
  label: 'Root A',
  visible: true,
  selected: false,
  expanded: false,
  children: [{
    id: 'branch-a',
    label: '分支 A',
    visible: true,
    selected: false,
    expanded: true,
    children: [{
      id: 'target',
      label: '目标 #target',
      visible: true,
      selected: true,
      expanded: false,
      children: [],
    }],
  }],
}, {
  id: 'root-b',
  label: 'Root B',
  visible: true,
  selected: false,
  expanded: true,
  children: [{
    id: 'stale-branch',
    label: '旧展开分支',
    visible: true,
    selected: false,
    expanded: true,
    children: [{
      id: 'stale-leaf',
      label: '旧叶子',
      visible: true,
      selected: false,
      expanded: false,
      children: [],
    }],
  }],
}];

test('projectVisibleLayerTree keeps the selected path even when ancestors are collapsed', () => {
  const result = projectVisibleLayerTree({
    roots: selectedTree,
    selectedId: 'cell-1',
    expandedIds: [],
  });

  assert.deepEqual(result.roots.map((node) => node.id), ['root']);
  assert.equal(result.roots[0].children[0].id, 'table');
  assert.equal(result.roots[0].children[0].children[0].id, 'row-1');
  assert.equal(result.roots[0].children[0].children[0].children[0].id, 'cell-1');
  assert.deepEqual(result.selectedLayerIds, ['cell-1']);
  assert.deepEqual(result.expandedLayerIds, []);
  assert.equal(result.sortable, true);
});

test('projectVisibleLayerTree only materializes direct children for selected and expanded nodes', () => {
  const result = projectVisibleLayerTree({
    roots: selectedTree,
    selectedId: 'cell-1',
    expandedIds: ['table'],
  });

  const table = result.roots[0].children[0];
  assert.equal(table.children.length, 1);
  assert.equal(table.children[0].id, 'row-1');
  assert.equal(table.children[0].children[0].id, 'cell-1');
  assert.equal(table.children[0].children[0].children[0].id, 'text-1');
  assert.deepEqual(result.selectedLayerIds, ['cell-1']);
  assert.deepEqual(result.expandedLayerIds, ['table']);
  assert.equal(result.sortable, true);
});

test('projectVisibleLayerTree ignores selected and expanded flags from the source tree', () => {
  const result = projectVisibleLayerTree({
    roots: [{
      id: 'root',
      label: 'Root',
      visible: true,
      selected: false,
      expanded: false,
      children: [{
        id: 'source-selected',
        label: '源选中节点',
        visible: true,
        selected: true,
        expanded: true,
        children: [{
          id: 'source-child',
          label: '源子节点',
          visible: true,
          selected: false,
          expanded: false,
          children: [],
        }],
      }, {
        id: 'target',
        label: '目标 #target',
        visible: true,
        selected: false,
        expanded: false,
        children: [],
      }],
    }],
    selectedId: 'target',
    expandedIds: [],
  });

  const root = result.roots[0];
  assert.equal(root.children.length, 1);
  assert.equal(root.children[0].id, 'target');
  assert.equal(root.children[0].selected, true);
  assert.equal(root.children[0].expanded, false);
  assert.deepEqual(result.selectedLayerIds, ['target']);
  assert.deepEqual(result.expandedLayerIds, []);
});

test('projectVisibleLayerTree handles missing selected ids without leaking old expansion state', () => {
  const result = projectVisibleLayerTree({
    roots: [{
      id: 'root',
      label: 'Root',
      visible: true,
      selected: true,
      expanded: true,
      children: [{
        id: 'branch',
        label: '分支',
        visible: true,
        selected: false,
        expanded: true,
        children: [{
          id: 'leaf',
          label: '叶子',
          visible: true,
          selected: false,
          expanded: false,
          children: [],
        }],
      }],
    }],
    selectedId: 'missing',
    expandedIds: [],
  });

  const root = result.roots[0];
  assert.equal(root.selected, false);
  assert.equal(root.expanded, false);
  assert.equal(root.children.length, 0);
  assert.deepEqual(result.selectedLayerIds, []);
  assert.deepEqual(result.expandedLayerIds, []);
  assert.equal(result.sortable, true);
});

test('projectVisibleLayerTree keeps unrelated roots closed while preserving the selected root path', () => {
  const result = projectVisibleLayerTree({
    roots: multiRootTree,
    selectedId: 'target',
    expandedIds: [],
  });

  const rootA = result.roots[0];
  const rootB = result.roots[1];
  assert.equal(rootA.children[0].id, 'branch-a');
  assert.equal(rootA.children[0].children[0].id, 'target');
  assert.equal(rootB.expanded, false);
  assert.equal(rootB.children.length, 0);
  assert.deepEqual(result.selectedLayerIds, ['target']);
  assert.deepEqual(result.expandedLayerIds, []);
  assert.equal(result.sortable, true);
});
