import test from 'node:test';
import assert from 'node:assert/strict';
import { createInspectorAdapter } from './inspectorAdapter.ts';

test('createInspectorAdapter returns a unified snapshot', () => {
  const adapter = createInspectorAdapter({
    selection: () => ({
      selectedIds: ['cmp-1'],
      primarySelectedId: 'cmp-1',
      selectedLabel: '按钮 #cta',
      isMultiSelection: false,
      isDetached: false,
    }),
    selector: () => ({
      availableStates: [{ id: '', label: '默认状态' }],
      activeState: '',
      commonClasses: [],
      canAddClass: true,
      canRemoveClass: true,
      canSyncStyle: false,
    }),
    style: () => ({
      targetKind: 'inline',
      sectors: [],
      hasMixedValues: false,
      editable: true,
    }),
    layers: () => ({
      roots: [],
      selectedLayerIds: ['cmp-1'],
      expandedLayerIds: [],
      sortable: false,
    }),
  });

  assert.deepEqual(adapter.getSnapshot().selection.selectedIds, ['cmp-1']);
  assert.equal(typeof adapter.subscribe, 'function');
});

test('createInspectorAdapter caches the snapshot until notify is called', () => {
  let selectionId = 'cmp-1';
  const adapter = createInspectorAdapter({
    selection: () => ({
      selectedIds: [selectionId],
      primarySelectedId: selectionId,
      selectedLabel: `按钮 #${selectionId}`,
      isMultiSelection: false,
      isDetached: false,
    }),
    selector: () => ({
      availableStates: [{ id: '', label: '默认状态' }],
      activeState: '',
      commonClasses: [],
      canAddClass: true,
      canRemoveClass: true,
      canSyncStyle: false,
    }),
    style: () => ({
      targetKind: 'inline',
      sectors: [],
      hasMixedValues: false,
      editable: true,
    }),
    layers: () => ({
      roots: [],
      selectedLayerIds: [selectionId],
      expandedLayerIds: [],
      sortable: false,
    }),
  });

  const first = adapter.getSnapshot();
  const second = adapter.getSnapshot();

  assert.strictEqual(second, first);

  selectionId = 'cmp-2';
  adapter.notify();

  const third = adapter.getSnapshot();
  assert.notStrictEqual(third, first);
  assert.deepEqual(third.selection.selectedIds, ['cmp-2']);
});

test('adapter patchSnapshot preserves untouched sections', () => {
  const adapter = createInspectorAdapter({
    selection: () => ({
      selectedIds: ['old'],
      primarySelectedId: 'old',
      selectedLabel: '按钮 #old',
      isMultiSelection: false,
      isDetached: false,
    }),
    selector: () => ({
      availableStates: [{ id: '', label: '默认状态' }],
      activeState: '',
      commonClasses: [],
      canAddClass: true,
      canRemoveClass: true,
      canSyncStyle: false,
    }),
    style: () => ({
      targetKind: 'inline',
      sectors: [],
      hasMixedValues: false,
      editable: true,
    }),
    layers: () => ({
      roots: [],
      selectedLayerIds: ['old'],
      expandedLayerIds: [],
      sortable: false,
    }),
  });

  adapter.patchSnapshot({
    selection: {
      selectedIds: ['new'],
      primarySelectedId: 'new',
      selectedLabel: '按钮 #new',
      isMultiSelection: false,
      isDetached: false,
    },
  });
  const snapshot = adapter.getSnapshot();

  assert.equal(snapshot.selection.primarySelectedId, 'new');
  assert.deepEqual(snapshot.layers, {
    roots: [],
    selectedLayerIds: ['old'],
    expandedLayerIds: [],
    sortable: false,
  });
});

test('adapter patchSnapshot notifies subscribers without dropping cache', () => {
  const adapter = createInspectorAdapter({
    selection: () => ({
      selectedIds: ['old'],
      primarySelectedId: 'old',
      selectedLabel: '按钮 #old',
      isMultiSelection: false,
      isDetached: false,
    }),
    selector: () => ({
      availableStates: [{ id: '', label: '默认状态' }],
      activeState: '',
      commonClasses: [],
      canAddClass: true,
      canRemoveClass: true,
      canSyncStyle: false,
    }),
    style: () => ({
      targetKind: 'inline',
      sectors: [],
      hasMixedValues: false,
      editable: true,
    }),
    layers: () => ({
      roots: [],
      selectedLayerIds: ['old'],
      expandedLayerIds: [],
      sortable: false,
    }),
  });
  let notifications = 0;
  const unsubscribe = adapter.subscribe(() => {
    notifications += 1;
  });

  adapter.patchSnapshot({
    selection: {
      selectedIds: ['new'],
      primarySelectedId: 'new',
      selectedLabel: '按钮 #new',
      isMultiSelection: false,
      isDetached: false,
    },
  });

  const snapshot = adapter.getSnapshot();
  unsubscribe();

  assert.equal(notifications, 1);
  assert.equal(snapshot.selection.primarySelectedId, 'new');
});
