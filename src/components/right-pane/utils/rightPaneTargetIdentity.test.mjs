import test from 'node:test';
import assert from 'node:assert/strict';
import { getRightPaneTargetIdentity } from './rightPaneTargetIdentity.ts';

test('getRightPaneTargetIdentity 对 browser target 包含 url，避免不同页面共用同一 identity', () => {
  assert.notEqual(
    getRightPaneTargetIdentity({
      type: 'browser',
      url: 'http://localhost:5173/one',
      source: 'chat-link',
    }),
    getRightPaneTargetIdentity({
      type: 'browser',
      url: 'http://localhost:5173/two',
      source: 'chat-link',
    }),
  );
});

test('getRightPaneTargetIdentity 对 code 和 markdown target 继续使用 filePath', () => {
  assert.equal(
    getRightPaneTargetIdentity({
      type: 'code',
      filePath: '/demo/src/main.ts',
      fileName: 'main.ts',
      projectName: 'demo',
      diffInfo: null,
    }),
    'code:/demo/src/main.ts',
  );

  assert.equal(
    getRightPaneTargetIdentity({
      type: 'markdown',
      filePath: '/demo/README.md',
      fileName: 'README.md',
      projectName: 'demo',
    }),
    'markdown:/demo/README.md',
  );

  assert.equal(
    getRightPaneTargetIdentity({
      type: 'markdown-draft',
      filePath: '/demo/README.md',
      fileName: 'README.md',
      projectName: 'demo',
      content: '正在起草',
      statusText: '正在起草...',
    }),
    'markdown:/demo/README.md',
  );
});

test('getRightPaneTargetIdentity 对 git-commit target 使用 commit hash，避免不同提交共用同一 identity', () => {
  assert.equal(
    getRightPaneTargetIdentity({
      type: 'git-commit',
      commitHash: 'a8d7a898062b04918f3368189a3e3b2300000000',
      shortHash: 'a8d7a89',
      message: 'fix: preview local html file',
      author: 'zhanglt21',
      date: '2026-04-16T09:00:14+08:00',
      diff: 'diff --git a/index.html b/index.html',
      projectName: 'demo',
    }),
    'git-commit:a8d7a898062b04918f3368189a3e3b2300000000',
  );
});
