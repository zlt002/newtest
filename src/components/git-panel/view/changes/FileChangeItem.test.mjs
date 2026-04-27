import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('FileChangeItem keeps the left side as a compact list and opens the right pane from the file row', () => {
  const source = readFileSync(new URL('./FileChangeItem.tsx', import.meta.url), 'utf8');

  assert.match(
    source,
    /<div[\s\S]*className="flex min-w-0 flex-1 items-center cursor-pointer"[\s\S]*onClick=\{\(event\) => \{\s*event\.stopPropagation\(\);\s*onOpenFile\(filePath\);\s*\}\}/,
  );
  assert.doesNotMatch(source, /onToggleExpanded:/);
  assert.doesNotMatch(source, /GitDiffViewer/);
  assert.doesNotMatch(source, /ChevronRight/);
  assert.doesNotMatch(source, /max-h-96 overflow-y-auto cursor-pointer/);
  assert.match(source, /className="flex min-w-0 flex-1 items-center cursor-pointer"/);
});
