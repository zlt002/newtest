import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const currentDir = dirname(fileURLToPath(import.meta.url));
const fileTreeSource = readFileSync(resolve(currentDir, './FileTree.tsx'), 'utf8');

test('FileTree no longer depends on resolveHtmlPreviewTarget for file open payloads', () => {
  assert.doesNotMatch(fileTreeSource, /resolveHtmlPreviewTarget/);
});

test('FileTree clicks call onFileOpen with filePath and undefined diffInfo only', () => {
  assert.match(fileTreeSource, /const \{ filePath \} = getFileOpenPayload\(\{ item \}\);/);
  assert.match(fileTreeSource, /onFileOpen\?\.\(filePath, undefined\);/);
});
