import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getEditorContainerClassName,
  getMainContentPaneClassName,
  getEditorSidebarPaneClassName,
  shouldUseBalancedEditorLayout,
} from './editorSidebarLayout.ts';

test('uses balanced layout for chat tab only', () => {
  assert.equal(
    shouldUseBalancedEditorLayout({
      activeTab: 'chat',
      editorExpanded: false,
      hasManualWidth: false,
    }),
    true,
  );

  assert.equal(
    shouldUseBalancedEditorLayout({
      activeTab: 'preview',
      editorExpanded: false,
      hasManualWidth: false,
    }),
    false,
  );
});

test('falls back to fixed-width layout after manual resize', () => {
  assert.equal(
    shouldUseBalancedEditorLayout({
      activeTab: 'chat',
      editorExpanded: false,
      hasManualWidth: true,
    }),
    false,
  );
});

test('always uses balanced layout when editor is expanded', () => {
  assert.equal(
    shouldUseBalancedEditorLayout({
      activeTab: 'preview',
      editorExpanded: true,
      hasManualWidth: true,
    }),
    true,
  );
});

test('returns a valid fixed-width class name for the sidebar pane', () => {
  assert.equal(
    getEditorSidebarPaneClassName({ useFlexLayout: false, minEditorWidth: 280 }),
    'h-full overflow-hidden border-l border-gray-200 dark:border-gray-700 min-w-[280px] flex-shrink-0',
  );
});

test('uses zero-basis flex classes for balanced two-pane layout', () => {
  const mainPaneClasses = getMainContentPaneClassName({ editorExpanded: false, useBalancedLayout: true }).split(' ');
  const editorContainerClasses = getEditorContainerClassName({ editorExpanded: false, useFlexLayout: true }).split(' ');

  assert.deepEqual(
    mainPaneClasses.filter(className => ['basis-0', 'flex-1', 'min-w-[200px]'].includes(className)).sort(),
    ['basis-0', 'flex-1', 'min-w-[200px]'],
  );

  assert.deepEqual(
    editorContainerClasses.filter(className => ['basis-0', 'flex-1', 'min-w-0'].includes(className)).sort(),
    ['basis-0', 'flex-1', 'min-w-0'],
  );
});
