import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('VisualHtmlEditor source declares a unified visual-html workspace with toolbar modes', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /data-right-pane-view="visual-html"/);
  assert.match(source, /data-visual-html-editor="true"/);
  assert.match(source, /data-visual-html-workspace="true"/);
  assert.match(source, /data-visual-html-toolbar="true"/);
  assert.match(source, /data-visual-html-mode-switcher="true"/);
  assert.match(source, /data-visual-html-device-switcher="true"/);
  assert.match(source, /data-visual-html-toolbar-actions="true"/);
  assert.match(source, /data-visual-html-toolbar-common="true"/);
  assert.match(source, /GrapesLikeInspectorPane/);
  assert.match(source, /editor=\{canvasEditor\}/);
  assert.match(source, /HtmlSourceEditorSurface/);
  assert.match(source, /VisualCanvasPane/);
  assert.match(source, /SpacingOverlay/);
  assert.match(source, /setDevice\(/);
  assert.match(source, /桌面/);
  assert.match(source, /平板/);
  assert.match(source, /手机/);
  assert.match(source, /togglePreview/);
  assert.match(source, /toggleComponentOutline/);
  assert.match(source, /Commands\.isActive\(COMPONENT_OUTLINE_COMMAND_ID\)/);
  assert.match(source, /runCommand\(COMPONENT_OUTLINE_COMMAND_ID\)/);
  assert.match(source, /stopCommand\(COMPONENT_OUTLINE_COMMAND_ID\)/);
  assert.match(source, /const syncCanvasOutlineVisibility = \(\) => \{\s*applyCanvasOutlineVisibility\(canvasEditor, isOutlineVisible\);\s*\};/);
  assert.match(source, /canvasEditor\.on\?\.\('canvas:frame:load', syncCanvasOutlineVisibility\)/);
  assert.match(source, /canvasEditor\.off\?\.\('canvas:frame:load', syncCanvasOutlineVisibility\)/);
  assert.match(source, /const dashedClassName = `\$\{editor\.getConfig\(\)\.stylePrefix\}dashed`/);
  assert.match(source, /applyCanvasOutlineVisibility/);
  assert.match(source, /ccui-hide-component-outlines/);
  assert.match(source, /\.gjs-com-dashed,\s*\n\s*html\.ccui-hide-component-outlines \.gjs-com-dashed \*/);
  assert.match(source, /ensureCanvasOutlineOverrideStyle/);
  assert.match(source, /隐藏组件轮廓/);
  assert.match(source, /显示组件轮廓/);
  assert.match(source, /toggleCanvasFullscreen/);
  assert.match(source, /isFullscreen/);
  assert.match(source, /title=\{isFullscreen \? '退出全屏' : '全屏'\}/);
  assert.match(source, /activeMode === 'design'/);
  assert.match(source, /setActiveMode\('source'\)/);
  assert.match(source, /设计模式/);
  assert.match(source, /源码模式/);
  assert.match(source, /void loadFileContent\(\)/);
  assert.match(source, /void handleSave\(\)/);
  assert.match(source, /onEditorReady=\{\(editor\) => \{/);
  assert.match(source, /setIsOutlineVisible\(false\)/);
  assert.match(source, /applyCanvasOutlineVisibility\(editor, false\)/);
  assert.match(source, /data-visual-html-design-workspace="true"/);
  assert.match(source, /<SpacingOverlay/);
  assert.match(source, /onUpdateStyle=\{grapesLikeBridge\.actions\.style\.updateStyle\}/);
  assert.doesNotMatch(source, /<div className="truncate text-sm font-semibold">\{target\.fileName\}<\/div>/);
  assert.doesNotMatch(source, /<div className="truncate text-xs text-slate-300">\{target\.filePath\}<\/div>/);
  assert.doesNotMatch(source, /openLayerManager/);
});

test('VisualHtmlEditor source keeps unsupported html in the workspace and switches to source mode', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /当前文件暂不支持可视化编辑，已切换到源码模式/);
  assert.match(source, /setActiveMode\('source'\)/);
  assert.match(source, /isHtmlEligibleForVisualEditing/);
  assert.doesNotMatch(source, /已回退到源码优先模式，请关闭此视图后继续在源码编辑器中处理。/);
});

test('VisualHtmlEditor source converges design and source state only on mode switch or save', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /handleSwitchToSource/);
  assert.match(source, /dirtyDesign/);
  assert.match(source, /applyCurrentEditorDocument\(nextHtml, 'design'\)/);
  assert.match(source, /handleSwitchToDesign/);
  assert.match(source, /dirtySource/);
  assert.match(source, /setCanvasDocument\(createWorkspaceDocument\(controllerRef\.current\.documentText\)\)/);
  assert.match(source, /activeMode === 'design' && canvasEditorRef\.current/);
  assert.match(source, /if \(canvasEditorRef\.current\?\.Canvas\?\.refresh\) \{/);
  assert.match(source, /canvasEditorRef\.current\.refresh\(\{ tools: true \}\)/);
  assert.match(source, /api\.readFile/);
  assert.match(source, /api\.saveFile/);
  assert.match(source, /broadcastFileSyncEvent/);
});

test('VisualHtmlEditor save flow blocks when a sync conflict is active', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /controller\.syncConflictError/);
  assert.match(source, /文件已在磁盘上变化，请先重新加载后再保存/);
  assert.match(source, /broadcastFileSyncEvent/);
});

test('VisualHtmlEditor rebuilds source-location mapping from the current editor document', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /buildSourceLocationMap/);
  assert.match(source, /const sourceLocationMapRef = useRef/);
  assert.match(source, /const rebuildSourceLocationMap = useCallback\(/);
  assert.match(source, /sourceLocationMapRef\.current = mapping/);
  assert.match(source, /controllerRef\.current\.setSourceLocationResult\(\{/);
  assert.match(source, /revision,\s*status: mapping\.status/);
  assert.match(source, /reason: mapping\.status === 'unavailable' \? mapping\.reason : null/);
  assert.match(source, /const applyCurrentEditorDocument = useCallback\(/);
  assert.match(source, /const revision = controllerRef\.current\.updateCurrentDocument\(nextHtml, origin\)/);
  assert.match(source, /rebuildSourceLocationMap\(nextHtml, revision\)/);
});

test('VisualHtmlEditor initializes and refreshes mapping on load and before saving design html', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /controllerRef\.current\.setPersistedDocument\(\{ content: fileContent, version: data\.version \?\? null \}\)/);
  assert.match(source, /const revision = controllerRef\.current\.editorRevision \+ 1/);
  assert.match(source, /rebuildSourceLocationMap\(fileContent, revision\)/);
  assert.match(source, /nextHtml = collectCanvasHtml\(\)/);
  assert.match(source, /flushedFromDesign = true/);
  assert.match(source, /applyCurrentEditorDocument\(nextHtml, 'design'\)/);
  assert.match(source, /const flushDocumentToFile = useCallback\(async \(\{/);
  assert.match(source, /reason: 'manual-save'/);
  assert.match(source, /if \(!flushedFromDesign \|\| activeMode !== 'design'\) \{\s*setCanvasDocument\(createWorkspaceDocument\(nextHtml\)\);\s*\}/);
  assert.doesNotMatch(source, /controllerRef\.current\.applyDesignToSource\(nextHtml\);/);
});

test('VisualHtmlEditor exposes live source-location mapping and a freshness helper to SpacingOverlay', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /const ensureFreshSourceLocationMap = useCallback\(/);
  assert.match(source, /const ensureLatestSourceContextForChat = useCallback\(async \(\) => \{/);
  assert.match(source, /const flushDocumentToFile = useCallback\(async \(\{/);
  assert.match(source, /reason: 'send-to-ai'/);
  assert.match(source, /if \(pendingDesignSyncFrameRef\.current !== null\) \{\s*window\.cancelAnimationFrame\(pendingDesignSyncFrameRef\.current\);\s*flushDesignDocumentSync\(\);\s*return sourceLocationMapRef\.current;\s*\}/);
  assert.match(source, /controllerRef\.current\.sourceLocationState\.isStale/);
  assert.match(source, /sourceLocationMapRef\.current/);
  assert.match(source, /const nextHtml = activeMode === 'design' && canvasEditorRef\.current/);
  assert.match(source, /rebuildSourceLocationMap\(nextHtml, controllerRef\.current\.editorRevision\)/);
  assert.match(source, /sourceLocationMap=\{sourceLocationMapRef\.current\}/);
  assert.match(source, /ensureFreshSourceLocationMap=\{ensureFreshSourceLocationMap\}/);
  assert.match(source, /ensureLatestSourceContextForChat=\{ensureLatestSourceContextForChat\}/);
  assert.match(source, /showComponentOutlines=\{isOutlineVisible\}/);
});

test('VisualHtmlEditor hides the inspector pane while preview mode is active', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /const showInspectorPane = !isPreviewActive && grapesLikeBridge/);
  assert.match(source, /showInspectorPane \? \(/);
  assert.match(source, /<GrapesLikeInspectorPane/);
});

test('VisualHtmlEditor treats preview as a read-only browser-like canvas state', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /function stripStyleMarkupFromHtml\(markup: string\)/);
  assert.match(source, /const css = \[editorCss, canvasDocument\.styles\]/);
  assert.match(source, /bodyHtml: stripStyleMarkupFromHtml\(canvasEditorRef\.current\.getHtml\(\)\)/);
  assert.match(source, /const showSpacingOverlay = !isPreviewActive && !eligibilityError && activeMode === 'design' && canvasEditor && grapesLikeBridge/);
  assert.match(source, /const previewDocument = buildSavedHtml\(\{/);
  assert.match(source, /const previewViewportWidth = canvasDevice === 'desktop'\s*\?\s*'100%'\s*:\s*canvasDevice === 'tablet'\s*\?\s*'770px'\s*:\s*'320px';/);
  assert.match(source, /setCanvasDevice\(device\);/);
  assert.match(source, /if \(!editor\) \{\s*return;\s*\}/);
  assert.match(source, /setCanvasDocument\(createWorkspaceDocument\(nextHtml\)\);/);
  assert.match(source, /if \(isPreviewActive\) \{\s*applyPreviewRuntimeStateToDesign\(\);\s*setIsPreviewActive\(false\);\s*return;\s*\}/);
  assert.match(source, /if \(!editor\) \{\s*return;\s*\}/);
  assert.match(source, /editor\.stopCommand\('preview'\);/);
  assert.match(source, /editor\.select\?\.\(\);/);
  assert.match(source, /isPreviewActive \? \(/);
  assert.match(source, /<iframe/);
  assert.match(source, /ref=\{previewFrameRef\}/);
  assert.match(source, /srcDoc=\{previewDocument\}/);
  assert.match(source, /data-visual-html-preview="true"/);
  assert.match(source, /data-visual-html-preview-frame="true"/);
  assert.match(source, /className="flex h-full min-h-0 w-full items-start justify-center overflow-auto bg-\[#f5f5f5\]"/);
  assert.match(source, /className="h-full min-h-0 max-w-full overflow-hidden bg-white"/);
  assert.match(source, /style=\{\{ width: previewViewportWidth \}\}/);
  assert.match(source, /className="block h-full min-h-0 w-full border-0 bg-white"/);
  assert.match(source, /showSpacingOverlay \? \(/);
  assert.match(source, /<SpacingOverlay/);
});

test('VisualHtmlEditor applies live preview DOM state back to the design canvas when preview closes', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /const previewFrameRef = useRef<HTMLIFrameElement \| null>\(null\)/);
  assert.match(source, /const pendingPreviewRuntimeStylesRef = useRef<PreviewRuntimeElementStyles \| null>\(null\)/);
  assert.match(source, /const applyPreviewRuntimeStateToDesign = useCallback\(\(\) => \{/);
  assert.match(source, /const previewBodyHtml = previewDocument\.body\.innerHTML/);
  assert.match(source, /pendingPreviewRuntimeStylesRef\.current = collectPreviewRuntimeElementStyles\(previewDocument\)/);
  assert.match(source, /setCanvasDocument\(createWorkspaceDocument\(nextHtml\)\)/);
  assert.match(source, /buildSavedHtml\(\{\s*snapshot: canvasDocument\.snapshot,\s*bodyHtml: previewBodyHtml,\s*css: canvasDocument\.styles,\s*\}\)/);
  assert.match(source, /schedulePreviewRuntimeElementStyleRestore\(editor, pendingPreviewRuntimeStyles\)/);
  assert.match(source, /editor\.Canvas\.getDocument\?\.\(\)\?\.getElementById\(elementId\)/);
  assert.match(source, /component\?\.addAttributes\?\.\(\{ style: styleText \}/);
  assert.match(source, /CCUI_PREVIEW_RUNTIME_STYLE_ID/);
  assert.match(source, /style\.textContent = buildPreviewRuntimeStyleOverride\(elementStyles\)/);
  assert.match(source, /pendingPreviewRuntimeStylesRef\.current = null/);
});

test('VisualHtmlEditor disables undo redo and save actions while preview is active', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /id: 'undo'[\s\S]*disabled: Boolean\(eligibilityError\) \|\| isPreviewActive,/);
  assert.match(source, /id: 'redo'[\s\S]*disabled: Boolean\(eligibilityError\) \|\| isPreviewActive,/);
  assert.match(source, /id: 'save'[\s\S]*disabled: saving \|\| loading \|\| Boolean\(loadError\) \|\| isPreviewActive,/);
});

test('VisualHtmlEditor shows an unavailable source-location notice instead of failing silently', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /controller\.sourceLocationState\.status === 'unavailable'/);
  assert.match(source, /源码位置映射当前不可用/);
  assert.match(source, /controller\.sourceLocationState\.reason/);
});

test('VisualHtmlEditor maps source cursor changes to the nearest source-location entry and canvas selection', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /findNearestSourceLocationEntry/);
  assert.match(source, /findCanvasComponentForSourceEntry/);
  assert.match(source, /selectCanvasComponentForSourceEntry/);
  assert.match(source, /const handleSourceCursorChange = useCallback\(/);
  assert.match(source, /const mapping = ensureFreshSourceLocationMap\(\)/);
  assert.match(source, /const nextEntry = findNearestSourceLocationEntry\(mapping, position\)/);
  assert.match(source, /pendingSourceCursorEntryRef\.current = nextEntry/);
  assert.match(source, /editor\.select\?\.\(nextComponent\)/);
  assert.match(source, /scrollTo\?: \(component: unknown\) => void \}\)\.scrollTo\?\.\(nextComponent\)/);
  assert.match(source, /onCursorChange=\{handleSourceCursorChange\}/);
});

test('VisualHtmlEditor source cursor plumbing rejects weak tagName-only canvas matches', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /if \(!entry\.componentId && !entry\.domPath && !entry\.fingerprint\) \{\s*return null;\s*\}/);
  assert.match(source, /return bestScore >=/);
  assert.doesNotMatch(source, /return bestScore > 0 \? bestComponent : null;/);
});

test('VisualHtmlEditor clears pending source cursor entries when loading or invalidating mappings', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /const clearPendingSourceCursorEntry = useCallback\(\(\) => \{\s*pendingSourceCursorEntryRef\.current = null;\s*\}, \[\]\);/);
  assert.match(source, /clearPendingSourceCursorEntry\(\);\s*controllerRef\.current\.setPersistedDocument\(\{ content: fileContent, version: data\.version \?\? null \}\)/);
  assert.match(source, /clearPendingSourceCursorEntry\(\);\s*controllerRef\.current\.setPersistedDocument\(\{ content: nextHtml, version: data\.version \?\? null \}\)/);
  assert.match(source, /if \(mapping\.status !== 'ready' \|\| !nextEntry\) \{\s*clearPendingSourceCursorEntry\(\);\s*return;\s*\}/);
  assert.match(source, /if \(!selectCanvasComponentForSourceEntry\(canvasEditor, pendingSourceCursorEntryRef\.current\)\) \{\s*clearPendingSourceCursorEntry\(\);\s*\}/);
});

test('VisualHtmlEditor schedules merged design sync to refresh current document and mapping', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /const pendingDesignSyncFrameRef = useRef<number \| null>\(null\)/);
  assert.match(source, /const flushDesignDocumentSync = useCallback\(/);
  assert.match(source, /const nextHtml = collectCanvasHtml\(\)/);
  assert.match(source, /applyCurrentEditorDocument\(nextHtml, 'design'\)/);
  assert.match(source, /const requestDesignDocumentSync = useCallback\(/);
  assert.match(source, /if \(pendingDesignSyncFrameRef\.current !== null\) \{\s*return;\s*\}/);
  assert.match(source, /pendingDesignSyncFrameRef\.current = window\.requestAnimationFrame\(/);
  assert.match(source, /pendingDesignSyncFrameRef\.current = null/);
  assert.match(source, /onDirtyChange=\{\(isDirty, editor\) => \{/);
  assert.match(source, /if \(isDirty\) \{\s*requestDesignDocumentSync\(\);\s*scheduleDocumentFlush\(\);\s*\}/);
  assert.match(source, /const scheduleDocumentFlush = useCallback\(\(\) => \{/);
  assert.match(source, /AUTO_FLUSH_DELAY_MS/);
  assert.match(source, /requestDesignDocumentSync\(\)/);
  assert.doesNotMatch(source, /if \(isDirty && !controllerRef\.current\.dirtyDesign\) \{/);
  assert.match(source, /window\.cancelAnimationFrame\(pendingDesignSyncFrameRef\.current\)/);
});

test('VisualHtmlEditor ignores out-of-order load responses and only applies the latest load', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /const loadRequestSequenceRef = useRef\(0\)/);
  assert.match(source, /const requestId = loadRequestSequenceRef\.current \+ 1/);
  assert.match(source, /loadRequestSequenceRef\.current = requestId/);
  assert.match(source, /if \(requestId !== loadRequestSequenceRef\.current\) \{\s*return;\s*\}/);
  assert.match(source, /if \(markLoading && requestId === loadRequestSequenceRef\.current\) \{/);
});

test('RightPaneContentRouter source routes visual-html targets to VisualHtmlEditor', async () => {
  const source = await readFile(new URL('./RightPaneContentRouter.tsx', import.meta.url), 'utf8');

  assert.match(source, /const VisualHtmlEditor = lazy\(\(\) => import\('\.\/VisualHtmlEditor'\)\);/);
  assert.match(source, /if \(target\.type === 'visual-html'\)/);
  assert.match(source, /<VisualHtmlEditor/);
  assert.match(source, /data-right-pane-view="visual-html"/);
});
