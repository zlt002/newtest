import test from 'node:test';
import assert from 'node:assert/strict';
import { createUrlOpenState, shouldFocusCodeTarget } from './editorSidebarUrlOpenState.ts';

test('createUrlOpenState 打开 URL 时清空 editingFile 并切到 browser target', () => {
  const result = createUrlOpenState({
    url: 'localhost:5173/docs',
    source: 'chat-link',
    editorExpanded: true,
  });

  assert.equal(result.editingFile, null);
  assert.equal(result.rightPaneTarget.type, 'browser');
  assert.equal(result.rightPaneTarget.url, 'http://localhost:5173/docs');
  assert.equal(result.rightPaneTarget.source, 'chat-link');
  assert.equal(result.editorExpanded, true);
});

test('shouldFocusCodeTarget 仅在当前 code target 命中同一路径时返回 true', () => {
  assert.equal(
    shouldFocusCodeTarget({
      type: 'code',
      filePath: '/workspace/demo/login.html',
      fileName: 'login.html',
      projectName: 'demo',
      diffInfo: null,
    }, '/workspace/demo/login.html'),
    true,
  );

  assert.equal(
    shouldFocusCodeTarget({
      type: 'browser',
      url: 'http://localhost:5173',
      source: 'address-bar',
    }, '/workspace/demo/login.html'),
    false,
  );
});
