import test from 'node:test';
import assert from 'node:assert/strict';
import { readLayerSnapshot, readLayerTree } from '../layerAdapter.ts';
import { applyLayerVisibilityPatch } from '../layerMapper.ts';

test('readLayerSnapshot returns selected and expanded ids for the tree', () => {
  const result = readLayerSnapshot({
    roots: [
      {
        id: 'hero',
        label: '区块 #hero',
        visible: true,
        selected: false,
        expanded: true,
        children: [
          { id: 'cta', label: '按钮 #cta', visible: true, selected: true, expanded: false, children: [] },
        ],
      },
    ],
  });

  assert.deepEqual(result.selectedLayerIds, ['cta']);
  assert.deepEqual(result.expandedLayerIds, ['hero']);
});

test('readLayerTree returns nested nodes with visibility metadata', () => {
  const result = readLayerTree({
    visible: true,
    selected: false,
    expanded: true,
    children: [
      { label: '区块 #hero', id: 'hero', visible: true, selected: true, expanded: true, children: [] },
      { label: '按钮 #cta', id: 'cta', visible: false, selected: false, expanded: false, children: [] },
    ],
  });

  assert.equal(result.children.length, 2);
  assert.equal(result.children[1].visible, false);
  assert.equal(result.children[1].label, '按钮 #cta');
  assert.equal(result.children[0].selected, true);
  assert.equal(result.expanded, true);
  assert.equal(result.selected, false);
});

test('applyLayerVisibilityPatch preserves references when target id is missing', () => {
  const root = readLayerTree({
    id: 'root',
    visible: true,
    selected: false,
    expanded: true,
    children: [
      { id: 'hero', label: '区块 #hero', visible: true, selected: true, expanded: true, children: [] },
    ],
  });

  const next = applyLayerVisibilityPatch(root, 'missing', false);

  assert.strictEqual(next, root);
  assert.strictEqual(next.children[0], root.children[0]);
});
