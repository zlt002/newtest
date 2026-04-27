import test from 'node:test';
import assert from 'node:assert/strict';
import { getSidebarSearchPlaceholderKey } from './SidebarSearchMode.shared.ts';

test('getSidebarSearchPlaceholderKey returns project placeholder for project mode', () => {
  assert.equal(getSidebarSearchPlaceholderKey('projects'), 'projects.searchPlaceholder');
});

test('getSidebarSearchPlaceholderKey returns conversation placeholder for conversation mode', () => {
  assert.equal(getSidebarSearchPlaceholderKey('conversations'), 'search.conversationsPlaceholder');
});
