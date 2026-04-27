import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('FileTreeNode renders an explorer button alongside send-to-chat actions', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/file-tree/view/FileTreeNode.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /onOpenInFileExplorer\?: \(item: FileTreeNodeType\) => void;/);
  assert.match(source, /aria-label=\{`打开 .*资源管理器`\}/);
  assert.match(source, /title="在资源管理器中打开"/);
});
