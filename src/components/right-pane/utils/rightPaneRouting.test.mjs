import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCodeTarget,
  createVisualHtmlTarget,
  resolveRightPaneTargetForFile,
  normalizeBrowserUrl,
} from './rightPaneRouting.ts';
import { createClosedRightPaneState } from '../types.ts';

test('resolveRightPaneTargetForFile returns a visual-html target for html files by default', () => {
  const result = resolveRightPaneTargetForFile('/demo/index.html', {
    projectName: 'demo-project',
  });

  assert.deepEqual(
    result,
    createVisualHtmlTarget({
      filePath: '/demo/index.html',
      projectName: 'demo-project',
    }),
  );
});

test('resolveRightPaneTargetForFile returns a markdown target for markdown files', () => {
  const result = resolveRightPaneTargetForFile('/demo/README.md', {
    projectName: 'demo-project',
  });

  assert.deepEqual(result, {
    type: 'markdown',
    filePath: '/demo/README.md',
    fileName: 'README.md',
    projectName: 'demo-project',
  });
});

test('resolveRightPaneTargetForFile returns a code target for ts files', () => {
  const result = resolveRightPaneTargetForFile('/demo/src/main.ts', {
    projectName: 'demo-project',
  });

  assert.deepEqual(
    result,
    createCodeTarget({
      filePath: '/demo/src/main.ts',
      projectName: 'demo-project',
    }),
  );
});

test('normalizeBrowserUrl adds http for localhost-style addresses', () => {
  assert.equal(normalizeBrowserUrl('localhost:5173'), 'http://localhost:5173');
  assert.equal(normalizeBrowserUrl('127.0.0.1:3000/demo'), 'http://127.0.0.1:3000/demo');
});

test('normalizeBrowserUrl rejects invalid browser urls', () => {
  assert.throws(() => normalizeBrowserUrl('example.com'), /Invalid browser URL/);
});

test('createClosedRightPaneState clears the editor and right pane target', () => {
  assert.deepEqual(createClosedRightPaneState(), {
    tabs: [],
    activeTabId: null,
    rightPaneTarget: null,
    isVisible: false,
    editorExpanded: false,
  });
});

test('rightPaneRouting no longer uses html preview mode branches', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('./rightPaneRouting.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /htmlMode/);
  assert.doesNotMatch(source, /previewUrl/);
  assert.match(source, /createVisualHtmlTarget/);
});
