import test from 'node:test';
import assert from 'node:assert/strict';

import { getUserMessageCollapseState, shouldCollapseUserMessage } from './messageCollapse.ts';

test('getUserMessageCollapseState clamps overflowing content by default', () => {
  assert.deepEqual(
    getUserMessageCollapseState({ isExpanded: false, isOverflowing: true }),
    {
      shouldClamp: true,
      shouldShowToggle: true,
      toggleLabel: '展开',
    },
  );
});

test('getUserMessageCollapseState expands overflowing content after toggle', () => {
  assert.deepEqual(
    getUserMessageCollapseState({ isExpanded: true, isOverflowing: true }),
    {
      shouldClamp: false,
      shouldShowToggle: true,
      toggleLabel: '收起',
    },
  );
});

test('getUserMessageCollapseState keeps short content fully visible', () => {
  assert.deepEqual(
    getUserMessageCollapseState({ isExpanded: false, isOverflowing: false }),
    {
      shouldClamp: false,
      shouldShowToggle: false,
      toggleLabel: null,
    },
  );
});

test('shouldCollapseUserMessage returns true when content exceeds five lines', () => {
  assert.equal(
    shouldCollapseUserMessage('1\n2\n3\n4\n5\n6'),
    true,
  );
});

test('shouldCollapseUserMessage returns false when content is five lines or fewer', () => {
  assert.equal(
    shouldCollapseUserMessage('1\n2\n3\n4\n5'),
    false,
  );
});
