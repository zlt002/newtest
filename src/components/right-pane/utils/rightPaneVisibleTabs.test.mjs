import test from 'node:test';
import assert from 'node:assert/strict';

import { computeVisibleRightPaneTabs } from './rightPaneVisibleTabs.ts';

const tabs = [
  { id: 'a', target: { type: 'code', filePath: '/demo/a.ts', fileName: 'a.ts', projectName: 'demo', diffInfo: null } },
  { id: 'b', target: { type: 'code', filePath: '/demo/b.ts', fileName: 'b.ts', projectName: 'demo', diffInfo: null } },
  { id: 'c', target: { type: 'code', filePath: '/demo/c.ts', fileName: 'c.ts', projectName: 'demo', diffInfo: null } },
  { id: 'd', target: { type: 'code', filePath: '/demo/d.ts', fileName: 'd.ts', projectName: 'demo', diffInfo: null } },
];

test('computeVisibleRightPaneTabs keeps all tabs visible when container width is sufficient', () => {
  const tabWidths = new Map([
    ['a', 120],
    ['b', 120],
    ['c', 120],
    ['d', 120],
  ]);

  const result = computeVisibleRightPaneTabs({
    tabs,
    activeTabId: 'b',
    availableWidth: 600,
    tabWidths,
    moreButtonWidth: 72,
  });

  assert.deepEqual(result.visibleTabs.map((tab) => tab.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(result.overflowTabs.map((tab) => tab.id), []);
});

test('computeVisibleRightPaneTabs moves excess tabs into overflow only when container width is insufficient', () => {
  const tabWidths = new Map([
    ['a', 120],
    ['b', 120],
    ['c', 120],
    ['d', 120],
  ]);

  const result = computeVisibleRightPaneTabs({
    tabs,
    activeTabId: 'b',
    availableWidth: 430,
    tabWidths,
    moreButtonWidth: 72,
  });

  assert.deepEqual(result.visibleTabs.map((tab) => tab.id), ['a', 'b']);
  assert.deepEqual(result.overflowTabs.map((tab) => tab.id), ['c', 'd']);
});

test('computeVisibleRightPaneTabs keeps the active tab visible when it would otherwise overflow', () => {
  const tabWidths = new Map([
    ['a', 120],
    ['b', 120],
    ['c', 120],
    ['d', 120],
  ]);

  const result = computeVisibleRightPaneTabs({
    tabs,
    activeTabId: 'd',
    availableWidth: 430,
    tabWidths,
    moreButtonWidth: 72,
  });

  assert.deepEqual(result.visibleTabs.map((tab) => tab.id), ['a', 'd']);
  assert.deepEqual(result.overflowTabs.map((tab) => tab.id), ['b', 'c']);
});
