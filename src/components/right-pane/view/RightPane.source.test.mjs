import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('RightPane uses dynamic tab overflow calculation instead of a fixed visible-tab cap', () => {
  const source = readFileSync(new URL('./RightPane.tsx', import.meta.url), 'utf8');

  assert.match(source, /computeVisibleRightPaneTabs/);
  assert.doesNotMatch(source, /MAX_VISIBLE_TABS\s*=\s*3/);
  assert.match(source, /ResizeObserver\(updateWidth\)/);
  assert.match(source, /ref=\{tabsViewportRef\}/);
});

test('RightPane renders fresh tabs with a new badge instead of blue follow-along styling', () => {
  const source = readFileSync(new URL('./RightPane.tsx', import.meta.url), 'utf8');

  assert.match(source, /data-right-pane-tab-fresh=/);
  assert.match(source, />\s*new\s*</);
  assert.doesNotMatch(source, /border-blue-400 bg-blue-50 text-blue-700/);
});
