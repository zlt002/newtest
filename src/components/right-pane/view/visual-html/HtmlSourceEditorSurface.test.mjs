import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('HtmlSourceEditorSurface renders a dedicated source workspace surface', async () => {
  const source = await readFile(new URL('./HtmlSourceEditorSurface.tsx', import.meta.url), 'utf8');

  assert.match(source, /data-visual-html-mode="source"/);
  assert.match(source, /flex h-full min-h-0 flex-col/);
  assert.match(source, /CodeMirror/);
  assert.match(source, /getLanguageExtensions\('index\.html'\)/);
  assert.match(source, /EditorView\.lineWrapping/);
});

test('HtmlSourceEditorSurface forwards cursor updates from CodeMirror selection changes', async () => {
  const source = await readFile(new URL('./HtmlSourceEditorSurface.tsx', import.meta.url), 'utf8');

  assert.match(source, /onCursorChange\??:\s*\(position:/);
  assert.match(source, /onUpdate=\{\(viewUpdate\) => \{/);
  assert.match(source, /viewUpdate\.selectionSet/);
  assert.match(source, /viewUpdate\.state\.selection\.main\.head/);
  assert.match(source, /viewUpdate\.state\.doc\.lineAt\(head\)/);
  assert.match(source, /onCursorChange\?\.\(\{/);
  assert.match(source, /line:\s*line\.number/);
  assert.match(source, /column:\s*head - line\.from \+ 1/);
  assert.match(source, /offset:\s*head/);
});
