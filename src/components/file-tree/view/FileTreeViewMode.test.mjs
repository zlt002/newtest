import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('file tree exposes only simple and detailed view modes and migrates compact storage', async () => {
  const typesPath = path.join(process.cwd(), 'src/components/file-tree/types/types.ts');
  const constantsPath = path.join(process.cwd(), 'src/components/file-tree/constants/constants.ts');
  const hookPath = path.join(process.cwd(), 'src/components/file-tree/hooks/useFileTreeViewMode.ts');
  const headerPath = path.join(process.cwd(), 'src/components/file-tree/view/FileTreeHeader.tsx');

  const [typesSource, constantsSource, hookSource, headerSource] = await Promise.all([
    fs.readFile(typesPath, 'utf8'),
    fs.readFile(constantsPath, 'utf8'),
    fs.readFile(hookPath, 'utf8'),
    fs.readFile(headerPath, 'utf8'),
  ]);

  assert.match(typesSource, /export type FileTreeViewMode = 'simple' \| 'detailed';/);
  assert.doesNotMatch(typesSource, /'compact'/);

  assert.match(constantsSource, /FILE_TREE_VIEW_MODES: FileTreeViewMode\[] = \['simple', 'detailed'\]/);
  assert.doesNotMatch(constantsSource, /'compact'/);

  assert.match(hookSource, /savedViewMode === 'compact' \? 'detailed' : savedViewMode/);
  assert.doesNotMatch(headerSource, /compactView/);
  assert.doesNotMatch(headerSource, /onViewModeChange\('compact'\)/);
});
