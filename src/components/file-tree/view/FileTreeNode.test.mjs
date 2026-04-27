import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('FileTreeNode keeps send-to-chat as an overlay and preserves stable detailed columns', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/file-tree/view/FileTreeNode.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(
    source,
    /col-span-2 [^"]*text-xs[^"]*tabular-nums[^"]*whitespace-nowrap[^"]*text-muted-foreground/,
  );
  assert.match(
    source,
    /col-span-2 text-xs truncate text-muted-foreground/,
  );
  assert.match(
    source,
    /className="inline-flex absolute right-2 top-1\/2 z-10/,
  );
  assert.doesNotMatch(
    source,
    /className=\{cn\(rowClassName, canSendToChat && 'pr-9'\)\}/,
  );
});
