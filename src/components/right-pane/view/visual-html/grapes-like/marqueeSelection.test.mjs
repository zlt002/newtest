import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMarqueeSelectionBox,
  collectMarqueeSelectionComponents,
  isMarqueeSelectionDistanceMet,
} from './marqueeSelection.ts';

function element(rect, children = []) {
  return {
    getBoundingClientRect: () => rect,
    contains: (node) => children.includes(node),
  };
}

test('buildMarqueeSelectionBox normalizes drag direction', () => {
  assert.deepEqual(
    buildMarqueeSelectionBox({ x: 120, y: 80 }, { x: 20, y: 140 }),
    { left: 20, top: 80, width: 100, height: 60 },
  );
});

test('isMarqueeSelectionDistanceMet ignores tiny click jitter', () => {
  assert.equal(isMarqueeSelectionDistanceMet({ x: 10, y: 10 }, { x: 14, y: 15 }), false);
  assert.equal(isMarqueeSelectionDistanceMet({ x: 10, y: 10 }, { x: 17, y: 12 }), true);
});

test('collectMarqueeSelectionComponents selects candidates whose centers are inside the box', () => {
  const first = { id: 'first' };
  const second = { id: 'second' };
  const candidates = [
    {
      component: first,
      element: element({ left: 10, top: 10, right: 30, bottom: 30, width: 20, height: 20 }),
    },
    {
      component: second,
      element: element({ left: 80, top: 80, right: 100, bottom: 100, width: 20, height: 20 }),
    },
  ];

  assert.deepEqual(
    collectMarqueeSelectionComponents(candidates, { left: 0, top: 0, width: 50, height: 50 }),
    [first],
  );
});

test('collectMarqueeSelectionComponents keeps the deepest hit and caps results', () => {
  const parent = { id: 'parent' };
  const child = { id: 'child' };
  const sibling = { id: 'sibling' };
  const childElement = element({ left: 20, top: 20, right: 30, bottom: 30, width: 10, height: 10 });
  const parentElement = element(
    { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 },
    [childElement],
  );
  const siblingElement = element({ left: 40, top: 40, right: 50, bottom: 50, width: 10, height: 10 });

  assert.deepEqual(
    collectMarqueeSelectionComponents([
      { component: parent, element: parentElement },
      { component: child, element: childElement },
      { component: sibling, element: siblingElement },
    ], { left: 0, top: 0, width: 100, height: 100 }, 1),
    [child],
  );
});
