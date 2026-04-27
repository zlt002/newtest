import test from 'node:test';
import assert from 'node:assert/strict';

import { createInspectorSnapshotScheduler } from './inspectorSnapshotScheduler.ts';

test('scheduler applies selection and layers immediately and defers style and selector', async () => {
  const applied = [];
  const scheduler = createInspectorSnapshotScheduler({
    scheduleFrame: (task) => Promise.resolve().then(task),
    applyPatch: (patch) => applied.push(Object.keys(patch)),
  });

  scheduler.scheduleSelection({
    immediate: {
      selection: { primarySelectedId: 'cell-1' },
      layers: { roots: [], selectedLayerIds: ['cell-1'] },
    },
    deferred: () => ({
      style: { sectors: [] },
      selector: { commonClasses: [] },
    }),
  });

  assert.deepEqual(applied[0].sort(), ['layers', 'selection']);
  await Promise.resolve();
  assert.deepEqual(applied[1].sort(), ['selector', 'style']);
});

test('scheduler ignores stale deferred work after a newer selection', async () => {
  const applied = [];
  const queue = [];
  const scheduler = createInspectorSnapshotScheduler({
    scheduleFrame: (task) => {
      queue.push(task);
    },
    applyPatch: (patch) => applied.push(patch),
  });

  scheduler.scheduleSelection({
    immediate: {
      selection: { primarySelectedId: 'first' },
      layers: { roots: [{ id: 'first' }], selectedLayerIds: ['first'] },
    },
    deferred: () => ({
      style: { sectors: [{ key: 'first' }] },
      selector: { commonClasses: [{ name: 'first' }] },
    }),
  });
  scheduler.scheduleSelection({
    immediate: {
      selection: { primarySelectedId: 'second' },
      layers: { roots: [{ id: 'second' }], selectedLayerIds: ['second'] },
    },
    deferred: () => ({
      style: { sectors: [{ key: 'second' }] },
      selector: { commonClasses: [{ name: 'second' }] },
    }),
  });

  assert.equal(queue.length, 2);
  queue.shift()();
  queue.shift()();

  assert.deepEqual(applied, [
    {
      selection: { primarySelectedId: 'first' },
      layers: { roots: [{ id: 'first' }], selectedLayerIds: ['first'] },
    },
    {
      selection: { primarySelectedId: 'second' },
      layers: { roots: [{ id: 'second' }], selectedLayerIds: ['second'] },
    },
    {
      style: { sectors: [{ key: 'second' }] },
      selector: { commonClasses: [{ name: 'second' }] },
    },
  ]);
});
