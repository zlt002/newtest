import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('FileTree 把粘贴事件绑定到文件树上传区域', () => {
  const source = readFileSync(new URL('./FileTree.tsx', import.meta.url), 'utf8');

  assert.match(source, /tabIndex=\{0\}/);
  assert.match(source, /data-file-tree-upload-surface="true"/);
  assert.match(source, /onPaste=\{upload\.handlePaste\}/);
});
