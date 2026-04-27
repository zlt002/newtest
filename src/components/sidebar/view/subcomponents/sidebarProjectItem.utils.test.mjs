import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getProjectDisplayLabel,
  getProjectHoverPath,
  getProjectMenuActions,
  getProjectVisualTone,
  getSessionCountDisplay,
} from './sidebarProjectItem.utils.ts';

test('getProjectDisplayLabel keeps only the terminal folder name for path-like project labels', () => {
  assert.equal(
    getProjectDisplayLabel({
      name: 'downloads',
      displayName: '/Users/demo/Downloads',
      fullPath: '/Users/demo/Downloads',
    }),
    'Downloads',
  );
});

test('getProjectHoverPath preserves the full directory for hover-only display', () => {
  assert.equal(
    getProjectHoverPath({
      name: 'downloads',
      displayName: 'Downloads',
      fullPath: '/Users/demo/Downloads',
    }),
    '/Users/demo/Downloads',
  );
});

test('getProjectMenuActions returns the desktop overflow actions in menu order', () => {
  const t = (key) => key;

  assert.deepEqual(
    getProjectMenuActions(false, t),
    [
      { id: 'open-folder', label: 'tooltips.openFolder' },
      { id: 'toggle-star', label: 'tooltips.addToFavorites' },
      { id: 'rename', label: 'tooltips.renameProject' },
      { id: 'delete', label: 'tooltips.deleteProject', danger: true },
    ],
  );
});

test('getSessionCountDisplay preserves the compact plus suffix for paged results', () => {
  assert.equal(getSessionCountDisplay(new Array(5).fill({}), true), '5+');
});

test('getProjectVisualTone emphasizes the selected project more strongly than others', () => {
  const selectedTone = getProjectVisualTone({ isSelected: true, isStarred: false });
  const idleTone = getProjectVisualTone({ isSelected: false, isStarred: false });

  assert.match(selectedTone.containerClassName, /bg-transparent/);
  assert.match(selectedTone.titleClassName, /text-foreground$/);
  assert.match(idleTone.titleClassName, /text-foreground\/60/);
  assert.match(idleTone.iconClassName, /text-muted-foreground\/50/);
});
