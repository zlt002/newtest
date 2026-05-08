import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('VisualHtmlEditor source declares a dedicated design workspace with a source tab toolbar action', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /data-right-pane-view="visual-html"/);
  assert.match(source, /data-visual-html-editor="true"/);
  assert.match(source, /data-visual-html-workspace="true"/);
  assert.match(source, /data-visual-html-toolbar="true"/);
  assert.doesNotMatch(source, /data-visual-html-mode-switcher="true"/);
  assert.match(source, /data-visual-html-device-switcher="true"/);
  assert.match(source, /data-visual-html-toolbar-actions="true"/);
  assert.match(source, /data-visual-html-toolbar-common="true"/);
  assert.match(source, /GrapesLikeInspectorPane/);
  assert.match(source, /editor=\{canvasEditor\}/);
  assert.doesNotMatch(source, /HtmlSourceEditorSurface/);
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
  assert.match(source, /isHiddenLayerEditing/);
  assert.match(source, /toggleHiddenLayerEditing/);
  assert.match(source, /显示隐藏层/);
  assert.match(source, /隐藏隐藏层/);
  assert.match(source, /showHiddenLayers=\{isHiddenLayerEditing\}/);
  assert.match(source, /toggleCanvasFullscreen/);
  assert.match(source, /isFullscreen/);
  assert.match(source, /title=\{isFullscreen \? '退出全屏' : '全屏'\}/);
  assert.match(source, /handleOpenSourceTab/);
  assert.match(source, /onOpenSourceTab\?\.\(target\.filePath\)/);
  assert.match(source, /title: '打开源码'/);
  assert.match(source, /dataAttribute: \{ 'data-visual-html-open-source-tab': 'true' \}/);
  assert.doesNotMatch(source, /activeMode === 'design'/);
  assert.doesNotMatch(source, /setActiveMode\('source'\)/);
  assert.doesNotMatch(source, /设计模式/);
  assert.doesNotMatch(source, /源码模式/);
  assert.match(source, /void loadFileContent\(\)/);
  assert.match(source, /void handleSave\(\)/);
  assert.match(source, /onEditorReady=\{\(editor\) => \{/);
  assert.match(source, /setIsOutlineVisible\(false\)/);
  assert.match(source, /applyCanvasOutlineVisibility\(editor, false\)/);
  assert.doesNotMatch(source, /editor\.select\?\.\(\)/);
  assert.match(source, /data-visual-html-design-workspace="true"/);
  assert.match(source, /<SpacingOverlay/);
  assert.match(source, /onUpdateStyle=\{grapesLikeBridge\.actions\.style\.updateStyle\}/);
  assert.doesNotMatch(source, /<div className="truncate text-sm font-semibold">\{target\.fileName\}<\/div>/);
  assert.doesNotMatch(source, /<div className="truncate text-xs text-slate-300">\{target\.filePath\}<\/div>/);
  assert.doesNotMatch(source, /openLayerManager/);
});

test('VisualHtmlEditor source keeps unsupported html out of the design canvas and offers a source tab', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /当前文件暂不支持可视化编辑，请点击工具栏源码按钮在独立标签页中查看。/);
  assert.match(source, /handleOpenSourceTab/);
  assert.match(source, /isHtmlEligibleForVisualEditing/);
  assert.doesNotMatch(source, /setActiveMode\('source'\)/);
  assert.doesNotMatch(source, /已回退到源码优先模式，请关闭此视图后继续在源码编辑器中处理。/);
});

test('VisualHtmlEditor source keeps source editing in a separate right-pane code tab', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /dirtyDesign/);
  assert.match(source, /applyCurrentEditorDocument\(nextHtml, 'design'\)/);
  assert.match(source, /syncCanvasDocumentFromHtml\(nextHtml\)/);
  assert.doesNotMatch(source, /handleSwitchToSource/);
  assert.doesNotMatch(source, /handleSwitchToDesign/);
  assert.doesNotMatch(source, /dirtySource/);
  assert.doesNotMatch(source, /setCanvasDocument\(createWorkspaceDocument\(controllerRef\.current\.documentText\)\)/);
  assert.match(source, /const canFlushDesignDocument = Boolean\(canvasEditorRef\.current\)/);
  assert.match(source, /if \(canvasEditorRef\.current\?\.Canvas\?\.refresh\) \{/);
  assert.match(source, /canvasEditorRef\.current\.refresh\(\{ tools: true \}\)/);
  assert.match(source, /api\.readFile/);
  assert.match(source, /api\.saveFile/);
  assert.match(source, /broadcastFileSyncEvent/);
});

test('VisualHtmlEditor does not mount an internal source workspace', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /isSourceWorkspaceOpen/);
  assert.doesNotMatch(source, /setIsSourceWorkspaceOpen\(true\)/);
  assert.doesNotMatch(source, /setIsSourceWorkspaceOpen\(false\)/);
  assert.match(source, /data-visual-html-design-workspace="true"/);
  assert.doesNotMatch(source, /data-visual-html-source-workspace="true"/);
  assert.doesNotMatch(source, /HtmlSourceEditorSurface/);
});

test('VisualHtmlEditor opens source through a separate right pane tab action', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /onOpenSourceTab\?: \(\(filePath: string\) => void\) \| null;/);
  assert.match(source, /const handleOpenSourceTab = useCallback\(\(\) => \{/);
  assert.match(source, /onOpenSourceTab\?\.\(target\.filePath\);/);
  assert.match(source, /id: 'source-tab'/);
  assert.match(source, /onClick: handleOpenSourceTab/);
  assert.doesNotMatch(source, /const handleCloseSourceWorkspace = useCallback/);
  assert.doesNotMatch(source, /onClick: onClosePane,\s*dataAttribute: \{ 'data-visual-html-close-source': 'true' \}/);
});

test('VisualHtmlEditor quiets hidden tabs and defers design refresh until after activation', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /isActive\?: boolean;/);
  assert.match(source, /isActive = true/);
  assert.match(source, /if \(!isActive\) \{\s*return undefined;\s*\}/);
  assert.match(source, /if \(!isActive\) \{\s*return;\s*\}/);
  assert.match(source, /refreshFrame = window\.requestAnimationFrame\(\(\) => \{/);
  assert.match(source, /canvasEditorRef\.current\.Canvas\.refresh\(\);/);
  assert.match(source, /const showSpacingOverlay = isActive && !isPreviewActive/);
  assert.match(source, /const showInspectorPane = isActive && !isPreviewActive && grapesLikeBridge/);
});

test('VisualHtmlEditor source passes preview-based asset url context to the design canvas', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /function resolveCanvasAssetBaseUrl/);
  assert.match(source, /const canvasAssetBaseUrl = useMemo\(\(\) => resolveCanvasAssetBaseUrl\(previewRouteUrl\), \[previewRouteUrl\]\);/);
  assert.match(source, /logVisualHtmlPerf\('preview-route-resolved'/);
  assert.match(source, /logVisualHtmlPerf\('design-canvas-context'/);
  assert.match(source, /previewRouteUrlLength: nextPreviewUrl\?\.length \?\? 0/);
  assert.match(source, /assetBaseUrlLength: canvasAssetBaseUrl\?\.length \?\? 0/);
  assert.match(source, /<VisualCanvasPane[\s\S]*assetBaseUrl=\{canvasAssetBaseUrl\}/);
});

test('VisualHtmlEditor save flow blocks when a sync conflict is active', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /controller\.syncConflictError/);
  assert.match(source, /文件已在磁盘上变化，请先重新加载后再保存/);
  assert.match(source, /broadcastFileSyncEvent/);
});

test('VisualHtmlEditor save flow keeps only canvas body html and strips browser injected markup', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /function extractCanvasBodyHtmlForSave/);
  assert.match(source, /function stripCanvasRuntimeArtifacts/);
  assert.match(source, /DOMParser/);
  assert.match(source, /<body>\$\{markup\}<\/body>/);
  assert.match(source, /plasmo-csui/);
  assert.match(source, /buildSavedHtmlPreservingHead/);
  assert.match(source, /sourceHtml: controllerRef\.current\.documentText/);
  assert.match(source, /bodyHtml: extractCanvasBodyHtmlForSave\(canvasEditorRef\.current\.getHtml\(\)\)/);
  assert.match(source, /canvasCss: canvasEditorRef\.current\.getCss\(\)/);
  assert.doesNotMatch(source, /bodyHtml: stripStyleMarkupFromHtml\(canvasEditorRef\.current\.getHtml\(\)\)/);
});

test('VisualHtmlEditor rebuilds source-location mapping from the current editor document', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /buildSourceLocationMap/);
  assert.match(source, /const sourceLocationMapRef = useRef/);
  assert.match(source, /const persistedSourceLocationMapRef = useRef/);
  assert.match(source, /const rebuildSourceLocationMap = useCallback\(/);
  assert.match(source, /sourceLocationMapRef\.current = mapping/);
  assert.match(source, /controllerRef\.current\.setSourceLocationResult\(\{/);
  assert.match(source, /revision,\s*status: mapping\.status/);
  assert.match(source, /reason: mapping\.status === 'unavailable' \? mapping\.reason : null/);
  assert.match(source, /const applyCurrentEditorDocument = useCallback\(/);
  assert.match(source, /const revision = controllerRef\.current\.updateCurrentDocument\(nextHtml, origin\)/);
  assert.match(source, /rebuildSourceLocationMap\(nextHtml, revision\)/);
  assert.doesNotMatch(source, /useMemo\(\s*\(\) => buildSourceLocationMap\(controller\.persistedText/);
});

test('VisualHtmlEditor performance diagnostics cover load, parsing, and source mapping', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /CCUI_DEBUG_VISUAL_CANVAS_PERF/);
  assert.match(source, /function logVisualHtmlPerf/);
  assert.match(source, /logVisualHtmlPerf\('load-start'/);
  assert.match(source, /logVisualHtmlPerf\('read-file'/);
  assert.match(source, /logVisualHtmlPerf\('create-workspace-document'/);
  assert.match(source, /logVisualHtmlPerf\('source-location-map'/);
  assert.match(source, /logVisualHtmlPerf\('load-complete'/);
});

test('VisualHtmlEditor always clears the loading overlay for the latest load request, including sync refreshes', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /if \(requestId === loadRequestSequenceRef\.current\) \{\s*setLoading\(false\);\s*\}/);
  assert.match(source, /void loadFileContent\(\{ markLoading: false \}\)/);
  assert.doesNotMatch(source, /finally \{\s*if \(markLoading && requestId === loadRequestSequenceRef\.current\) \{\s*setLoading\(false\);\s*\}\s*\}/);
});

test('VisualHtmlEditor initializes and refreshes mapping on load and before saving design html', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /controllerRef\.current\.setPersistedDocument\(\{ content: fileContent, version: data\.version \?\? null \}\)/);
  assert.match(source, /const revision = controllerRef\.current\.editorRevision \+ 1/);
  assert.match(source, /rebuildSourceLocationMap\(fileContent, revision, \{ synchronous: true \}\)/);
  assert.match(source, /nextHtml = collectCanvasHtml\(\)/);
  assert.match(source, /flushedFromDesign = true/);
  assert.match(source, /applyCurrentEditorDocument\(nextHtml, 'design', \{ rebuildSourceLocation: 'sync' \}\)/);
  assert.match(source, /const canFlushDesignDocument = Boolean\(canvasEditorRef\.current\)/);
  assert.match(source, /let discoveredDesignChange = false/);
  assert.match(source, /discoveredDesignChange = true/);
  assert.match(source, /const flushDocumentToFile = useCallback\(async \(\{/);
  assert.match(source, /reason: 'manual-save'/);
  assert.doesNotMatch(source, /if \(!flushedFromDesign \|\| activeMode !== 'design'\) \{\s*syncCanvasDocumentFromHtml\(nextHtml\);\s*\}/);
  assert.doesNotMatch(source, /controllerRef\.current\.applyDesignToSource\(nextHtml\);/);
});

test('VisualHtmlEditor defers expensive source-location mapping for large editor changes', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /LARGE_HTML_SOURCE_LIGHTWEIGHT_THRESHOLD/);
  assert.match(source, /function shouldDeferSourceLocationRebuild/);
  assert.match(source, /function createDeferredSourceLocationMap/);
  assert.match(source, /pendingSourceLocationRebuildRef/);
  assert.match(source, /scheduleSourceLocationMapRebuild/);
  assert.match(source, /cancelPendingSourceLocationMapRebuild/);
  assert.match(source, /rebuildSourceLocation: 'defer'/);
  assert.match(source, /requestIdleCallback/);
  assert.match(source, /rebuildSourceLocationMap\(nextHtml, revision\)/);
  assert.match(source, /rebuildSourceLocationMap\(nextHtml, revision, \{ synchronous: true \}\)/);
  assert.match(source, /if \(shouldDeferSourceLocationRebuild\(nextHtml\)\) \{/);
  assert.match(source, /sourceLocationMapRef\.current = createDeferredSourceLocationMap\(revision,/);
  assert.match(source, /controllerRef\.current\.setSourceLocationResult\(\{\s*revision,\s*status: 'unavailable',\s*reason,/);
  assert.match(source, /scheduleSourceLocation:\s*false/);
  assert.doesNotMatch(source, /if \(controllerRef\.current\.documentText\.length >= LARGE_HTML_SOURCE_LIGHTWEIGHT_THRESHOLD\)/);
});

test('VisualHtmlEditor avoids synchronous source-location parsing on large load and save paths', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /const markSourceLocationRebuildDeferred = useCallback\(/);
  assert.match(source, /markSourceLocationRebuildDeferred\(nextHtml, revision, '大页面已启用按需源码定位，保存不会阻塞界面。', \{ scheduleSourceLocation: false \}\)/);
  assert.match(source, /markSourceLocationRebuildDeferred\(fileContent, revision, '大页面已启用按需源码定位，页面会先进入可视化编辑。', \{ scheduleSourceLocation: false \}\)/);
  assert.match(source, /const mapping = shouldDeferSourceLocationRebuild\(nextHtml\)\s*\?\s*markSourceLocationRebuildDeferred/);
  assert.match(source, /const mapping = shouldDeferSourceLocationRebuild\(fileContent\)\s*\?\s*markSourceLocationRebuildDeferred/);
  assert.match(source, /源码位置将在发送到聊天时按需定位，不影响可视化编辑。/);
});

test('VisualHtmlEditor does not start a full source-location worker for large html by default', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /new Worker\(new URL\('\.\/visual-html\/sourceLocationMapping\.worker\.ts'/);
  assert.doesNotMatch(source, /scheduleSourceLocationMapWorkerRebuild\(nextHtml, revision\)/);
  assert.doesNotMatch(source, /scheduleSourceLocation:\s*'worker'/);
  assert.match(source, /markSourceLocationRebuildDeferred\(nextHtml, revision, SOURCE_LOCATION_DEFERRED_REASON, \{ scheduleSourceLocation: false \}\)/);
});

test('VisualHtmlEditor avoids full design html serialization during routine dirty notifications', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /DESIGN_SYNC_DEBOUNCE_MS = 4000/);
  assert.match(source, /AUTO_FLUSH_DELAY_MS = 6000/);
  assert.match(source, /controllerRef\.current\.setDirtyDesign\(true\)/);
  assert.doesNotMatch(source, /if \(controllerRef\.current\.dirtySource\) \{\s*return;\s*\}/);
  assert.doesNotMatch(source, /requestDesignDocumentSync\(\);\s*scheduleDocumentFlush\(\);/);
});

test('VisualHtmlEditor exposes live source-location mapping and a freshness helper to SpacingOverlay', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /const ensureFreshSourceLocationMap = useCallback\(/);
  assert.match(source, /const ensureLatestSourceContextForChat = useCallback\(async \(\) => \{/);
  assert.match(source, /const flushDocumentToFile = useCallback\(async \(\{/);
  assert.match(source, /const sourceText = controllerRef\.current\.documentText;/);
  assert.match(source, /const mapping = sourceLocationMapRef\.current;/);
  assert.doesNotMatch(source, /reason: 'send-to-ai'/);
  assert.match(source, /if \(pendingDesignSyncTimeoutRef\.current !== null\) \{\s*window\.clearTimeout\(pendingDesignSyncTimeoutRef\.current\);\s*flushDesignDocumentSync\(\);\s*return sourceLocationMapRef\.current;\s*\}/);
  assert.match(source, /controllerRef\.current\.sourceLocationState\.isStale/);
  assert.match(source, /sourceLocationMapRef\.current/);
  assert.match(source, /const nextHtml = canvasEditorRef\.current/);
  assert.match(source, /markSourceLocationRebuildDeferred\(nextHtml, controllerRef\.current\.editorRevision, SOURCE_LOCATION_DEFERRED_REASON, \{ scheduleSourceLocation: false \}\)/);
  assert.doesNotMatch(source, /rebuildSourceLocationMap\(nextHtml, controllerRef\.current\.editorRevision, \{ synchronous: true \}\)/);
  assert.match(source, /sourceLocationMap=\{sourceLocationMapRef\.current\}/);
  assert.match(source, /ensureFreshSourceLocationMap=\{ensureFreshSourceLocationMap\}/);
  assert.match(source, /ensureLatestSourceContextForChat=\{ensureLatestSourceContextForChat\}/);
  assert.match(source, /showComponentOutlines=\{isOutlineVisible\}/);
  assert.match(source, /sourceText=\{controller\.documentText\}/);
  assert.doesNotMatch(source, /sourceText=\{collectCanvasHtml\(\)\}/);
});

test('VisualHtmlEditor hides the inspector pane while preview mode is active', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /const showInspectorPane = isActive && !isPreviewActive && grapesLikeBridge/);
  assert.match(source, /showInspectorPane \? \(/);
  assert.match(source, /<GrapesLikeInspectorPane/);
});

test('VisualHtmlEditor exposes hidden-layer filters for design canvas editing', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /type HiddenLayerReason = 'display-none' \| 'visibility-hidden' \| 'opacity-zero' \| 'zero-size' \| 'offscreen' \| 'ancestor-hidden'/);
  assert.match(source, /type HiddenLayerFilter = \{/);
  assert.match(source, /const ALL_HIDDEN_LAYER_REASONS: HiddenLayerReason\[] = \[/);
  assert.match(source, /const HIDDEN_LAYER_REASON_LABELS: Record<HiddenLayerReason, string> = \{/);
  assert.match(source, /const \[hiddenLayerFilter, setHiddenLayerFilter\] = useState<HiddenLayerFilter>\(\{/);
  assert.match(source, /reasons: ALL_HIDDEN_LAYER_REASONS/);
  assert.match(source, /includeInternal: false/);
  assert.match(source, /includeDescendants: true/);
  assert.match(source, /textQuery: ''/);
  assert.match(source, /const toggleHiddenLayerReason = useCallback\(\(reason: HiddenLayerReason\) => \{/);
  assert.match(source, /const toggleHiddenLayerFilterFlag = useCallback\(\(flag: 'includeInternal' \| 'includeDescendants'\) => \{/);
  assert.match(source, /const updateHiddenLayerTextQuery = useCallback\(\(textQuery: string\) => \{/);
  assert.match(source, /data-visual-html-hidden-layer-filters="true"/);
  assert.match(source, /data-visual-html-hidden-layer-text-filter="true"/);
  assert.match(source, /value=\{hiddenLayerFilter\.textQuery\}/);
  assert.match(source, /updateHiddenLayerTextQuery\(event\.target\.value\)/);
  assert.match(source, /placeholder="按文本过滤，如 123888"/);
  assert.match(source, /display:none/);
  assert.match(source, /visibility:hidden/);
  assert.match(source, /opacity:0/);
  assert.match(source, /零尺寸/);
  assert.match(source, /屏幕外/);
  assert.match(source, /祖先隐藏/);
  assert.match(source, /递归显示子隐藏层/);
  assert.match(source, /包含编辑器内部节点/);
  assert.match(source, /hiddenLayerFilter=\{hiddenLayerFilter\}/);
});

test('VisualHtmlEditor treats preview as a read-only browser-like canvas state', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /resolveHtmlPreviewTarget/);
  assert.match(source, /api\.projects\(\)/);
  assert.match(source, /const \[previewRouteUrl, setPreviewRouteUrl\] = useState<string \| null>\(null\)/);
  assert.match(source, /const nextPreviewUrl = resolveHtmlPreviewTarget\(target\.filePath,/);
  assert.match(source, /src=\{activePreviewUrl\}/);
  assert.doesNotMatch(source, /srcDoc=\{previewDocument\}/);
  assert.match(source, /bodyHtml: extractCanvasBodyHtmlForSave\(canvasEditorRef\.current\.getHtml\(\)\)/);
  assert.match(source, /const showSpacingOverlay = isActive && !isPreviewActive && !eligibilityError && canvasEditor && grapesLikeBridge/);
  assert.match(source, /const previewViewportWidth = canvasDevice === 'desktop'\s*\?\s*'100%'\s*:\s*canvasDevice === 'tablet'\s*\?\s*'770px'\s*:\s*'320px';/);
  assert.match(source, /setCanvasDevice\(device\);/);
  assert.match(source, /if \(!editor\) \{\s*return;\s*\}/);
  assert.match(source, /syncCanvasDocumentFromHtml\(nextHtml\);/);
  assert.match(source, /if \(isPreviewActive\) \{\s*applyPreviewRuntimeStateToDesign\(\);\s*setIsPreviewActive\(false\);\s*return;\s*\}/);
  assert.match(source, /if \(!editor\) \{\s*return;\s*\}/);
  assert.match(source, /editor\.stopCommand\('preview'\);/);
  assert.doesNotMatch(source, /editor\.select\?\.\(\);/);
  assert.match(source, /isPreviewActive \? \(/);
  assert.match(source, /<iframe/);
  assert.match(source, /ref=\{previewFrameRef\}/);
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
  assert.match(source, /syncCanvasDocumentFromHtml\(nextHtml\)/);
  assert.match(source, /buildSavedHtmlPreservingHead\(\{\s*sourceHtml: controllerRef\.current\.documentText,\s*bodyHtml: previewBodyHtml,\s*\}\)/);
  assert.match(source, /schedulePreviewRuntimeElementStyleRestore\(editor, pendingPreviewRuntimeStyles\)/);
  assert.match(source, /resolveCanvasDocument\(editor\)\?\.getElementById\(elementId\)/);
  assert.match(source, /component\?\.addAttributes\?\.\(\{ style: styleText \}/);
  assert.match(source, /CCUI_PREVIEW_RUNTIME_STYLE_ID/);
  assert.match(source, /style\.textContent = buildPreviewRuntimeStyleOverride\(elementStyles\)/);
  assert.match(source, /pendingPreviewRuntimeStylesRef\.current = null/);
  assert.match(source, /if \(previewModeRef\.current !== 'srcdoc'\) \{\s*return;\s*\}/);
});

test('VisualHtmlEditor disables undo redo and save actions while preview is active', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /id: 'undo'[\s\S]*disabled: Boolean\(eligibilityError\) \|\| isPreviewActive,/);
  assert.match(source, /id: 'redo'[\s\S]*disabled: Boolean\(eligibilityError\) \|\| isPreviewActive,/);
  assert.match(source, /id: 'save'[\s\S]*disabled: saving \|\| loading \|\| Boolean\(loadError\) \|\| isPreviewActive,/);
});

test('VisualHtmlEditor shows source-location status inside the toolbar instead of above the canvas', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /controller\.sourceLocationState\.status === 'unavailable'/);
  assert.match(source, /源码位置映射当前不可用/);
  assert.match(source, /controller\.sourceLocationState\.reason/);
  assert.match(source, /const sourceLocationToolbarStatus =/);
  assert.match(source, /data-visual-html-source-location-status="true"/);
  assert.doesNotMatch(source, /mx-4 mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3[\s\S]*源码位置映射当前不可用/);
  assert.doesNotMatch(source, /mx-4 mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3[\s\S]*SOURCE_LOCATION_DEFERRED_REASON/);
});

test('VisualHtmlEditor leaves source cursor handling to the separate code tab', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /findNearestSourceLocationEntry/);
  assert.match(source, /findCanvasComponentForSourceEntry/);
  assert.match(source, /selectCanvasComponentForSourceEntry/);
  assert.doesNotMatch(source, /const handleSourceCursorChange = useCallback\(/);
  assert.doesNotMatch(source, /const mapping = ensureFreshSourceLocationMap\(\)/);
  assert.doesNotMatch(source, /const nextEntry = findNearestSourceLocationEntry\(mapping, position\)/);
  assert.doesNotMatch(source, /pendingSourceCursorEntryRef\.current = nextEntry/);
  assert.match(source, /editor\.select\?\.\(nextComponent\)/);
  assert.match(source, /scrollTo\?: \(component: unknown\) => void \}\)\.scrollTo\?\.\(nextComponent\)/);
  assert.doesNotMatch(source, /onCursorChange=\{handleSourceCursorChange\}/);
});

test('VisualHtmlEditor source cursor plumbing rejects weak tagName-only canvas matches', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /if \(!entry\.componentId && !entry\.domPath && !entry\.fingerprint\) \{\s*return null;\s*\}/);
  assert.match(source, /return bestScore >=/);
  assert.doesNotMatch(source, /return bestScore > 0 \? bestComponent : null;/);
});

test('VisualHtmlEditor clears pending source cursor entries when loading or activating the design canvas', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /const clearPendingSourceCursorEntry = useCallback\(\(\) => \{\s*pendingSourceCursorEntryRef\.current = null;\s*\}, \[\]\);/);
  assert.match(source, /clearPendingSourceCursorEntry\(\);\s*controllerRef\.current\.setPersistedDocument\(\{ content: fileContent, version: data\.version \?\? null \}\)/);
  assert.match(source, /clearPendingSourceCursorEntry\(\);\s*controllerRef\.current\.setPersistedDocument\(\{ content: nextHtml, version: data\.version \?\? null \}\)/);
  assert.doesNotMatch(source, /if \(mapping\.status !== 'ready' \|\| !nextEntry\) \{\s*clearPendingSourceCursorEntry\(\);\s*return;\s*\}/);
  assert.match(source, /if \(!selectCanvasComponentForSourceEntry\(canvasEditor, pendingSourceCursorEntryRef\.current\)\) \{\s*clearPendingSourceCursorEntry\(\);\s*\}/);
});

test('VisualHtmlEditor delays heavy design serialization to keep inspector edits responsive', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /const DESIGN_SYNC_DEBOUNCE_MS = 4000/);
  assert.match(source, /const AUTO_FLUSH_DELAY_MS = 6000/);
  assert.match(source, /const pendingDesignSyncTimeoutRef = useRef<number \| null>\(null\)/);
  assert.match(source, /const flushDesignDocumentSync = useCallback\(/);
  assert.match(source, /const nextHtml = collectCanvasHtml\(\)/);
  assert.match(source, /applyCurrentEditorDocument\(nextHtml, 'design'\)/);
  assert.match(source, /pendingDesignSyncTimeoutRef\.current = null/);
  assert.match(source, /onDirtyChange=\{\(isDirty, editor\) => \{/);
  assert.match(source, /if \(isDirty\) \{\s*controllerRef\.current\.setDirtyDesign\(true\);\s*scheduleDocumentFlush\(\);\s*\}/);
  assert.match(source, /const scheduleDocumentFlush = useCallback\(\(\) => \{/);
  assert.match(source, /AUTO_FLUSH_DELAY_MS/);
  assert.doesNotMatch(source, /requestDesignDocumentSync\(\)/);
  assert.doesNotMatch(source, /if \(isDirty && !controllerRef\.current\.dirtyDesign\) \{/);
  assert.match(source, /window\.clearTimeout\(pendingDesignSyncTimeoutRef\.current\)/);
  assert.doesNotMatch(source, /pendingDesignSyncFrameRef/);
});

test('VisualHtmlEditor ignores out-of-order load responses and only applies the latest load', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /const loadRequestSequenceRef = useRef\(0\)/);
  assert.match(source, /const requestId = loadRequestSequenceRef\.current \+ 1/);
  assert.match(source, /loadRequestSequenceRef\.current = requestId/);
  assert.match(source, /if \(requestId !== loadRequestSequenceRef\.current\) \{\s*return;\s*\}/);
  assert.match(source, /if \(requestId === loadRequestSequenceRef\.current\) \{\s*setLoading\(false\);\s*\}/);
});

test('RightPaneContentRouter source routes visual-html targets to VisualHtmlEditor', async () => {
  const source = await readFile(new URL('./RightPaneContentRouter.tsx', import.meta.url), 'utf8');

  assert.match(source, /const VisualHtmlEditor = lazy\(\(\) => import\('\.\/VisualHtmlEditor'\)\);/);
  assert.match(source, /const MemoizedVisualHtmlEditor = React\.memo\(function MemoizedVisualHtmlEditor/);
  assert.match(source, /if \(target\.type === 'visual-html'\)/);
  assert.match(source, /const renderedVisualHtmlTargets = useMemo\(\(\) => \{/);
  assert.match(source, /const openVisualHtmlTargets = tabs\s*\.filter\(\(tab\): tab is RightPaneTab & \{ target: RightPaneVisualHtmlTarget \} => tab\.target\.type === 'visual-html'\)/);
  assert.match(source, /if \(target\.type !== 'visual-html'\) \{\s*return openVisualHtmlTargets;\s*\}/);
  assert.match(source, /if \(openVisualHtmlTargets\.some\(\(entry\) => getRightPaneTargetIdentity\(entry\) === activeIdentity\)\) \{\s*return openVisualHtmlTargets;\s*\}/);
  assert.match(source, /return \[\.\.\.openVisualHtmlTargets, target\];/);
  assert.match(source, /data-right-pane-visual-html-tab=/);
  assert.match(source, /renderedVisualHtmlTargets\.map/);
  assert.match(source, /isActive=\{isActive\}/);
  assert.match(source, /onOpenSourceTab=\{onCodeFileOpen\}/);
  assert.match(source, /<VisualHtmlEditor/);
  assert.match(source, /data-right-pane-view="visual-html"/);
});

test('RightPane plumbing exposes a forced code-tab opener for visual html source', async () => {
  const routerSource = await readFile(new URL('./RightPaneContentRouter.tsx', import.meta.url), 'utf8');
  const paneSource = await readFile(new URL('./RightPane.tsx', import.meta.url), 'utf8');
  const sidebarSource = await readFile(new URL('../../code-editor/hooks/useEditorSidebar.ts', import.meta.url), 'utf8');

  assert.match(routerSource, /onCodeFileOpen\?: \(\(filePath: string\) => void\) \| null;/);
  assert.match(routerSource, /onOpenSourceTab=\{onCodeFileOpen\}/);
  assert.match(paneSource, /onCodeFileOpen\?: \(\(filePath: string\) => void\) \| null;/);
  assert.match(paneSource, /onCodeFileOpen=\{onCodeFileOpen\}/);
  assert.match(sidebarSource, /const handleCodeFileOpen = useCallback/);
  assert.match(sidebarSource, /createCodeTarget\(\{/);
  assert.match(sidebarSource, /handleCodeFileOpen,/);
});
