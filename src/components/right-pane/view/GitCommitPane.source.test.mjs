import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('RightPaneContentRouter routes git-commit targets into GitCommitPane', () => {
  const source = readFileSync(new URL('./RightPaneContentRouter.tsx', import.meta.url), 'utf8');

  assert.match(source, /import GitCommitPane from '\.\/GitCommitPane';/);
  assert.match(source, /if \(target\.type === 'git-commit'\)/);
  assert.match(source, /data-right-pane-view="git-commit"/);
  assert.match(source, /<GitCommitPane target=\{target\} onClosePane=\{onClosePane\} \/>/);
});

test('GitCommitPane renders commit metadata and diff viewer shell', () => {
  const source = readFileSync(new URL('./GitCommitPane.tsx', import.meta.url), 'utf8');

  assert.match(source, /data-right-pane-view="git-commit"/);
  assert.match(source, /data-right-pane-commit-hash=\{target\.commitHash\}/);
  assert.match(source, /GitDiffViewer diff=\{target\.diff\} isMobile=\{false\} wrapText/);
  assert.match(source, /fileSummary\.totalFiles/);
});
