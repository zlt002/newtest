import test from 'node:test';
import assert from 'node:assert/strict';
import { getDesktopSidebarActionSlots } from './sidebarDesktopActions.ts';

test('desktop sidebar actions place create in the search row and settings/refresh/collapse in the footer', () => {
  assert.deepEqual(getDesktopSidebarActionSlots(), {
    header: [],
    searchBar: ['create'],
    footer: ['settings', 'refresh', 'collapse'],
  });
});
