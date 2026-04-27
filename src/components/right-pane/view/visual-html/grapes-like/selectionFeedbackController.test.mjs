import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createSelectionFeedbackController,
  readSelectedComponentSummary,
} from './selectionFeedbackController.ts';

function createComponent({ id, name = 'button' } = {}) {
  return {
    getId: () => id,
    getName: () => name,
    getType: () => name,
    get: (key) => (key === 'id' ? id : undefined),
  };
}

test('readSelectedComponentSummary handles a null component', () => {
  const summary = readSelectedComponentSummary(null);

  assert.deepEqual(summary, {
    selectedIds: [],
    primarySelectedId: null,
    selectedLabel: '',
    isMultiSelection: false,
    revision: 0,
  });
});

test('readSelectedComponentSummary falls back to get("id") when getId is missing', () => {
  const summary = readSelectedComponentSummary({
    get: (key) => (key === 'id' ? 'cta-fallback' : undefined),
    getName: () => 'button',
    getType: () => 'button',
  });

  assert.deepEqual(summary, {
    selectedIds: ['cta-fallback'],
    primarySelectedId: 'cta-fallback',
    selectedLabel: 'button #cta-fallback',
    isMultiSelection: false,
    revision: 0,
  });
});

test('readSelectedComponentSummary falls back to 组件 when name and type are empty', () => {
  const summary = readSelectedComponentSummary({
    getId: () => 'cta',
    getName: () => '',
    getType: () => '',
    get: () => undefined,
  });

  assert.deepEqual(summary, {
    selectedIds: ['cta'],
    primarySelectedId: 'cta',
    selectedLabel: '组件 #cta',
    isMultiSelection: false,
    revision: 0,
  });
});

test('readSelectedComponentSummary trims whitespace from ids', () => {
  const summary = readSelectedComponentSummary({
    getId: () => '  cta  ',
    getName: () => 'button',
    getType: () => 'button',
    get: () => undefined,
  });

  assert.deepEqual(summary, {
    selectedIds: ['cta'],
    primarySelectedId: 'cta',
    selectedLabel: 'button #cta',
    isMultiSelection: false,
    revision: 0,
  });
});

test('readSelectedComponentSummary ignores non-string id name and type values', () => {
  const summary = readSelectedComponentSummary({
    getId: () => ({ value: 'cta' }),
    getName: () => ({ value: 'button' }),
    getType: () => ({ value: 'button' }),
    get: (key) => (key === 'id' ? { value: 'fallback' } : undefined),
  });

  assert.deepEqual(summary, {
    selectedIds: [],
    primarySelectedId: null,
    selectedLabel: '',
    isMultiSelection: false,
    revision: 0,
  });
});

test('readSelectedComponentSummary returns minimal data required for fast feedback', () => {
  const summary = readSelectedComponentSummary(createComponent({ id: 'cta', name: 'button' }));

  assert.deepEqual(summary, {
    selectedIds: ['cta'],
    primarySelectedId: 'cta',
    selectedLabel: 'button #cta',
    isMultiSelection: false,
    revision: 0,
  });
});

test('createSelectionFeedbackController bumps revision and drops stale selection tasks', () => {
  const controller = createSelectionFeedbackController();
  const first = controller.beginSelection(createComponent({ id: 'first' }));
  const second = controller.beginSelection(createComponent({ id: 'second' }));

  assert.equal(first.revision, 1);
  assert.equal(second.revision, 2);
  assert.equal(controller.isRevisionCurrent(1), false);
  assert.equal(controller.isRevisionCurrent(2), true);
});
