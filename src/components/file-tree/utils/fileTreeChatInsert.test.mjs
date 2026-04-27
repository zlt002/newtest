import test from 'node:test';
import assert from 'node:assert/strict';

import { getFileTreeChatInsertText } from './fileTreeChatInsert.ts';

test('returns the file path for file tree chat insertion', () => {
  assert.equal(
    getFileTreeChatInsertText({
      type: 'file',
      name: 'table.html',
      path: 'table.html',
    }),
    'table.html',
  );
});

test('returns the directory path for directories', () => {
  assert.equal(
    getFileTreeChatInsertText({
      type: 'directory',
      name: 'src',
      path: 'src',
    }),
    'src',
  );
});
