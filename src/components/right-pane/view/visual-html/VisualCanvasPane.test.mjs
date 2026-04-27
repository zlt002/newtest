import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('VisualCanvasPane source defines an isolated design surface around GrapesJS', async () => {
  const source = await readFile(new URL('./VisualCanvasPane.tsx', import.meta.url), 'utf8');

  assert.match(source, /data-visual-html-mode="design"/);
  assert.match(source, /grapesjs\.init/);
  assert.match(source, /registerVisualHtmlComponentTypes/);
  assert.match(source, /registerVisualHtmlBlocks/);
  assert.match(source, /grapesjsZhCn/);
  assert.match(source, /locale: 'zh-CN'/);
  assert.match(source, /messagesAdd/);
  assert.match(source, /editor\.on\('update'/);
  assert.match(source, /onDirtyChange/);
  assert.match(source, /onEditorReady/);
  assert.match(source, /editor\.Panels\.getPanel\('options'\)/);
  assert.match(source, /optionsPanel\.set\('visible', false\)/);
});

test('VisualCanvasPane source owns editor lifecycle and reload wiring', async () => {
  const source = await readFile(new URL('./VisualCanvasPane.tsx', import.meta.url), 'utf8');

  assert.match(source, /editor\.destroy\(\)/);
  assert.match(source, /editor\.clearDirtyCount\(\)/);
  assert.match(source, /bodyHtml/);
  assert.match(source, /styles/);
  assert.match(source, /onEditorReadyRef/);
  assert.match(source, /onDirtyChangeRef/);
  assert.match(source, /\}, \[bodyHtml, styles\]\)/);
  assert.doesNotMatch(source, /\}, \[bodyHtml, onDirtyChange, onEditorReady, styles\]\)/);
});

test('VisualCanvasPane source separates design and source toolbar states', async () => {
  const source = await readFile(new URL('./VisualCanvasPane.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /ccui-switch-source/);
  assert.doesNotMatch(source, /ccui-switch-design/);
  assert.doesNotMatch(source, /ccui-reload/);
  assert.doesNotMatch(source, /ccui-save/);
});

test('VisualCanvasPane source wires official-style Basic and Forms block registries', async () => {
  const source = await readFile(new URL('./VisualCanvasPane.tsx', import.meta.url), 'utf8');

  assert.match(source, /registerVisualHtmlComponentTypes\(editorInstance\)/);
  assert.match(source, /registerVisualHtmlBlocks\(editorInstance\)/);
});
