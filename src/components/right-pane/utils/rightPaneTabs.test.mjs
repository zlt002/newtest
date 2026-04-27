import test from 'node:test';
import assert from 'node:assert/strict';
import { closeRightPaneTab, getRightPaneTabLabel, upsertRightPaneTab } from './rightPaneTabs.ts';

test('upsertRightPaneTab 新目标会追加 tab 并切为激活项', () => {
  const result = upsertRightPaneTab([], {
    type: 'code',
    filePath: '/demo/src/main.ts',
    fileName: 'main.ts',
    projectName: 'demo',
    diffInfo: null,
  });

  assert.equal(result.tabs.length, 1);
  assert.equal(result.activeTabId, 'code:/demo/src/main.ts');
});

test('upsertRightPaneTab 相同 identity 会复用已有 tab 并更新 target', () => {
  const result = upsertRightPaneTab([
    {
      id: 'browser:http://localhost:5173',
      target: {
        type: 'browser',
        url: 'http://localhost:5173',
        source: 'address-bar',
      },
    },
  ], {
    type: 'browser',
    url: 'http://localhost:5173',
    source: 'address-bar',
    title: 'Home',
  });

  assert.equal(result.tabs.length, 1);
  assert.equal(result.activeTabId, 'browser:http://localhost:5173');
  assert.equal(result.tabs[0].target.title, 'Home');
});

test('closeRightPaneTab 关闭当前 tab 后会切到相邻 tab', () => {
  const result = closeRightPaneTab([
    {
      id: 'code:/demo/a.ts',
      target: {
        type: 'code',
        filePath: '/demo/a.ts',
        fileName: 'a.ts',
        projectName: 'demo',
        diffInfo: null,
      },
    },
    {
      id: 'code:/demo/b.ts',
      target: {
        type: 'code',
        filePath: '/demo/b.ts',
        fileName: 'b.ts',
        projectName: 'demo',
        diffInfo: null,
      },
    },
  ], 'code:/demo/a.ts', 'code:/demo/a.ts');

  assert.equal(result.tabs.length, 1);
  assert.equal(result.activeTabId, 'code:/demo/b.ts');
});

test('getRightPaneTabLabel 优先返回可读标题', () => {
  assert.equal(getRightPaneTabLabel({
    type: 'browser',
    url: 'http://localhost:5173/demo',
    source: 'address-bar',
    title: '预览页',
  }), '预览页');

  assert.equal(getRightPaneTabLabel({
    type: 'git-commit',
    commitHash: 'abc',
    shortHash: 'abc',
    message: 'fix: something',
    author: 'demo',
    date: '2026-04-16',
    diff: 'diff --git a b',
  }), 'fix: something');

  assert.equal(getRightPaneTabLabel({
    type: 'visual-html',
    filePath: '/demo/index.html',
    fileName: 'index.html',
    projectName: 'demo',
  }), 'index.html');
});
