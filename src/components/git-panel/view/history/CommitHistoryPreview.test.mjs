import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('GitPanel history wires commit preview callbacks from GitPanel to HistoryView', () => {
  const source = readFileSync(new URL('../GitPanel.tsx', import.meta.url), 'utf8');

  assert.match(source, /onCommitPreviewOpen,\s*\n\s*embedded = false,/);
  assert.match(source, /<HistoryView[\s\S]*onOpenCommitPreview=\{onCommitPreviewOpen\}/);
});

test('HistoryView loads commit diff and opens right pane commit preview', () => {
  const source = readFileSync(new URL('./HistoryView.tsx', import.meta.url), 'utf8');

  assert.match(source, /onOpenCommitPreview\?: \(commit: GitCommitSummary, diff: string\) => void;/);
  assert.match(source, /const handleCommitOpen = useCallback\(/);
  assert.match(source, /const diff = commitDiffs\[commit\.hash\] \?\? await onFetchCommitDiff\(commit\.hash\);/);
  assert.match(source, /onOpenCommitPreview\?\.\(commit, diff\);/);
  assert.match(source, /onOpen=\{\(\) => void handleCommitOpen\(commit\)\}/);
  assert.doesNotMatch(source, /expandedCommits/);
  assert.doesNotMatch(source, /onToggle=/);
});

test('CommitHistoryItem keeps the left side as a compact list and only opens the right pane preview', () => {
  const source = readFileSync(new URL('./CommitHistoryItem.tsx', import.meta.url), 'utf8');

  assert.match(source, /onOpen\?: \(\) => void \| Promise<void>;/);
  assert.match(source, /onClick=\{\(\) => \{\s*void onOpen\?\.\(\);\s*\}\}/);
  assert.doesNotMatch(source, /onToggle:/);
  assert.doesNotMatch(source, /GitDiffViewer/);
  assert.doesNotMatch(source, /isExpanded/);
  assert.doesNotMatch(source, /Changed files list/);
});
