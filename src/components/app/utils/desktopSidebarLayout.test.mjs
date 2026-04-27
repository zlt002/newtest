import test from 'node:test';
import assert from 'node:assert/strict';

import { getDesktopSidebarPresentation } from './desktopSidebarLayout.ts';

test('keeps the desktop sidebar docked at full width when the right pane is hidden', () => {
  assert.deepEqual(
    getDesktopSidebarPresentation({
      isMobile: false,
      isRightPaneVisible: false,
      isPeekOpen: false,
      isSidebarVisible: true,
    }),
    {
      shouldAutoCollapse: false,
      dockWidthClassName: 'w-72',
      shouldRenderOverlay: false,
    },
  );
});

test('auto-collapses the desktop sidebar into a rail when the right pane is visible', () => {
  assert.deepEqual(
    getDesktopSidebarPresentation({
      isMobile: false,
      isRightPaneVisible: true,
      isPeekOpen: false,
      isSidebarVisible: true,
    }),
    {
      shouldAutoCollapse: true,
      dockWidthClassName: 'w-12',
      shouldRenderOverlay: false,
    },
  );
});

test('renders the temporary overlay when the collapsed desktop sidebar is peeked open', () => {
  assert.deepEqual(
    getDesktopSidebarPresentation({
      isMobile: false,
      isRightPaneVisible: true,
      isPeekOpen: true,
      isSidebarVisible: true,
    }),
    {
      shouldAutoCollapse: true,
      dockWidthClassName: 'w-12',
      shouldRenderOverlay: true,
    },
  );
});

test('never auto-collapses the sidebar on mobile', () => {
  assert.deepEqual(
    getDesktopSidebarPresentation({
      isMobile: true,
      isRightPaneVisible: true,
      isPeekOpen: true,
      isSidebarVisible: true,
    }),
    {
      shouldAutoCollapse: false,
      dockWidthClassName: 'w-72',
      shouldRenderOverlay: false,
    },
  );
});

test('keeps only the narrow rail width when the desktop sidebar is manually collapsed', () => {
  assert.deepEqual(
    getDesktopSidebarPresentation({
      isMobile: false,
      isRightPaneVisible: false,
      isPeekOpen: false,
      isSidebarVisible: false,
    }),
    {
      shouldAutoCollapse: false,
      dockWidthClassName: 'w-12',
      shouldRenderOverlay: false,
    },
  );
});
