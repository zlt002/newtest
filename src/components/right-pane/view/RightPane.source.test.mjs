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
