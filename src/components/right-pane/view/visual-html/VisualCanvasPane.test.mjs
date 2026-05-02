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
  assert.match(source, /normalizeDesignCanvasHtml/);
  assert.match(source, /stripCanvasSecurityPolicyMeta/);
  assert.match(source, /http-equiv\\s\*=\\s\*\(\["'\]\)\?Content-Security-Policy/);
  assert.match(source, /extractRootCustomProperties/);
  assert.match(source, /inlineCustomPropertyReferences/);
  assert.match(source, /collectStyleMarkup/);
  assert.match(source, /injectRawCanvasStyles/);
  assert.match(source, /collectCanvasHeadMarkup/);
  assert.match(source, /createCanvasStructureHtml/);
  assert.match(source, /logCanvasPerf/);
  assert.match(source, /const canvasHtml = normalizeDesignCanvasHtml\(fullHtml\);/);
  assert.match(source, /const rawStyleMarkup = collectStyleMarkup\(canvasHtml\);/);
  assert.match(source, /const canvasHeadMarkup = collectCanvasHeadMarkup\(canvasHtml\);/);
  assert.match(source, /const canvasStructureHtml = createCanvasStructureHtml\(canvasHtml\);/);
  assert.doesNotMatch(source, /editor\.getWrapper\(\)\?\.components\(canvasHtml/);
  assert.match(source, /editor\.getWrapper\(\)\?\.components\(canvasStructureHtml/);
  assert.match(source, /asDocument: true/);
  assert.match(source, /allowScripts: true/);
  assert.match(source, /detectDocument: true/);
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
  assert.match(source, /fullHtml/);
  assert.match(source, /onEditorReadyRef/);
  assert.match(source, /onDirtyChangeRef/);
  assert.match(source, /injectCanvasHeadMarkup\(editor, canvasHeadMarkup\)/);
  assert.match(source, /injectRawCanvasStyles\(editor, rawStyleMarkup\)/);
  assert.match(source, /lastHeadSyncRef/);
  assert.match(source, /headSyncKey/);
  assert.match(source, /hasSyncedCanvasHeadMarkup/);
  assert.match(source, /logCanvasPerf\('head-sync-skip'/);
  assert.match(source, /scheduleCanvasHeadMarkupSync/);
  assert.match(source, /canvas:frame:load:body/);
  assert.match(source, /\}, \[fullHtml\]\)/);
  assert.doesNotMatch(source, /\}, \[fullHtml, onDirtyChange, onEditorReady\]\)/);
});

test('VisualCanvasPane source keeps hidden interaction nodes but disables non-visual editing by default', async () => {
  const source = await readFile(new URL('./VisualCanvasPane.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /element\.remove\(\)/);
  assert.match(source, /disableNonVisualEditableCanvasComponents/);
  assert.match(source, /isNonVisualEditableElement/);
  assert.match(source, /getComputedStyle/);
  assert.match(source, /getBoundingClientRect/);
  assert.match(source, /display === 'none'/);
  assert.match(source, /visibility === 'hidden'/);
  assert.match(source, /opacity === '0'/);
  assert.match(source, /position === 'absolute' \|\| position === 'fixed'/);
  assert.match(source, /selectable: false/);
  assert.match(source, /hoverable: false/);
});

test('VisualCanvasPane performance diagnostics stay behind a debug gate', async () => {
  const source = await readFile(new URL('./VisualCanvasPane.tsx', import.meta.url), 'utf8');

  assert.match(source, /CCUI_DEBUG_VISUAL_CANVAS_PERF/);
  assert.match(source, /function isCanvasPerfDebugEnabled\(\)/);
  assert.match(source, /if \(!isCanvasPerfDebugEnabled\(\)\) \{\s*return;\s*\}/);
  assert.match(source, /logCanvasPerf\('prepared'/);
  assert.match(source, /logCanvasPerf\('components'/);
  assert.match(source, /logCanvasPerf\('head-sync'/);
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
