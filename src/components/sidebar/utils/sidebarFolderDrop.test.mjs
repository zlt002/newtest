import test from 'node:test';
import assert from 'node:assert/strict';

import { extractDroppedFolder } from './sidebarFolderDrop.ts';

test('returns the first dropped directory entry', async () => {
  const result = await extractDroppedFolder({
    items: [
      {
        kind: 'file',
        webkitGetAsEntry() {
          return {
            isDirectory: true,
            isFile: false,
            name: 'demo-folder',
            fullPath: '/demo-folder',
          };
        },
      },
    ],
  });

  assert.deepEqual(result, {
    name: 'demo-folder',
    relativePath: '/demo-folder',
  });
});

test('ignores non-directory drag payloads', async () => {
  const result = await extractDroppedFolder({
    items: [
      {
        kind: 'file',
        webkitGetAsEntry() {
          return {
            isDirectory: false,
            isFile: true,
            name: 'notes.md',
          };
        },
      },
    ],
  });

  assert.equal(result, null);
});

test('falls back to file metadata when webkit entry API is unavailable', async () => {
  const result = await extractDroppedFolder({
    items: [],
    files: [
      {
        name: 'demo-folder',
        type: '',
      },
    ],
  });

  assert.deepEqual(result, {
    name: 'demo-folder',
    relativePath: null,
  });
});
