# Visual HTML Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `.html/.htm` 文件统一收口到单一 `visual-html` 工作台，并在工作台内部整合 GrapesJS 设计态与源码编辑态，共享同一套保存、重载与冲突处理。

**Architecture:** 保留现有右侧 pane 框架，但让 HTML 文件只生成 `visual-html` target，不再走独立 `code` 或 `browser(file-html)` 主路径。现有 `VisualHtmlEditor` 升级为工作台容器，新增 `visual-html` 子模块承载文档转换、状态控制、源码编辑表面和画布层，通过显式“应用到另一视图”完成 `design/source` 切换。

**Tech Stack:** React 18, TypeScript, GrapesJS, CodeMirror, node:test, Vite

---

## File Structure

### New files

- `src/components/right-pane/view/visual-html/htmlDocumentTransforms.ts`
  - 提供 HTML 文档快照、GrapesJS 画布初始数据提取、保存回写序列化等纯函数。
- `src/components/right-pane/view/visual-html/htmlDocumentTransforms.test.mjs`
  - 直接覆盖 HTML 解析与回写规则，避免核心转换逻辑只存在于组件内部。
- `src/components/right-pane/view/visual-html/useHtmlDocumentController.ts`
  - 统一管理 `documentText`、`persistedText`、`version`、`dirtySource`、`dirtyDesign`、`syncConflict`、`save/reload/apply`。
- `src/components/right-pane/view/visual-html/useHtmlDocumentController.test.mjs`
  - 覆盖控制器源码结构与关键字段，保证状态机接口稳定。
- `src/components/right-pane/view/visual-html/HtmlSourceEditorSurface.tsx`
  - HTML 工作台专用源码编辑面板，只复用通用编辑能力，不复用完整 `CodeEditor` pane 外壳。
- `src/components/right-pane/view/visual-html/HtmlSourceEditorSurface.test.mjs`
  - 覆盖源码面板的模式标识、CodeMirror 挂载和保存快捷键信号。
- `src/components/right-pane/view/visual-html/VisualCanvasPane.tsx`
  - 封装 GrapesJS 画布初始化、导入导出、dirty 监听与销毁逻辑。
- `src/components/right-pane/view/visual-html/VisualCanvasPane.test.mjs`
  - 覆盖画布组件暴露的导出/导入接口与容器挂载约束。

### Modified files

- `src/components/right-pane/utils/rightPaneRouting.ts`
  - HTML 文件默认直接路由到 `visual-html`。
- `src/components/right-pane/utils/rightPaneRouting.test.mjs`
  - 删除 HTML preview 断言，改为验证 HTML 文件默认走工作台。
- `src/components/file-tree/utils/fileOpenPayload.ts`
  - 不再为 HTML 文件生成 `previewUrl`，仅返回文件路径。
- `src/components/file-tree/utils/fileOpenPayload.test.mjs`
  - 更新为“HTML 文件不会携带 previewUrl”的断言。
- `src/components/file-tree/view/FileTree.open-payload.test.mjs`
  - 与工具层测试保持一致，覆盖窗口 origin 存在与缺失时的行为。
- `src/components/file-tree/view/FileTree.tsx`
  - 移除 `resolveHtmlPreviewTarget` 依赖，文件树点击 HTML 时直接打开工作台。
- `src/components/sidebar/types/types.ts`
  - 收紧 `onFileOpen` 签名，移除 `previewUrl` 参数。
- `src/components/main-content/types/types.ts`
  - 同步移除 `onOpenHtmlPreview` 和 `previewUrl` 文件打开签名。
- `src/components/code-editor/hooks/useEditorSidebar.ts`
  - `handleFileOpen` 只接收文件路径和 diff 信息；HTML 文件统一上屏为 `visual-html`。
- `src/components/app/AppContent.tsx`
  - 删除 `handleOpenHtmlPreview` 和 HTML 预览路由拼装。
- `src/components/main-content/view/MainContent.tsx`
  - 不再向 `RightPane` 传递 `onOpenHtmlPreview`。
- `src/components/right-pane/view/RightPane.tsx`
  - 去掉 HTML 预览透传，保持 pane 容器只负责 tabs 和内容切换。
- `src/components/right-pane/view/editorPaneProps.ts`
  - 删除 `onOpenHtmlPreview` 注入，保留 HTML 的可视化入口事件。
- `src/components/right-pane/view/RightPaneContentRouter.tsx`
  - 不再向 `CodeEditor` 组装 HTML 预览动作。
- `src/components/code-editor/view/CodeEditor.tsx`
  - 删除 HTML preview action，只保留“可视化编辑”入口和未保存源码确认逻辑。
- `src/components/code-editor/view/subcomponents/CodeEditorHeader.tsx`
  - 去掉 HTML 预览按钮。
- `src/components/code-editor/view/subcomponents/CodeEditorHeader.test.mjs`
  - 更新为仅验证“可视化编辑”按钮与源码冲突提示。
- `src/components/right-pane/view/VisualHtmlEditor.tsx`
  - 从单页 GrapesJS 编辑器升级为 `visual-html` 工作台容器。
- `src/components/right-pane/view/VisualHtmlEditor.test.mjs`
  - 覆盖工作台模式切换、源码回退提示、设计/源码挂载入口。

## Task 1: 收口 HTML 文件入口，只保留 `visual-html`

**Files:**
- Modify: `src/components/right-pane/utils/rightPaneRouting.ts`
- Modify: `src/components/right-pane/utils/rightPaneRouting.test.mjs`
- Modify: `src/components/file-tree/utils/fileOpenPayload.ts`
- Modify: `src/components/file-tree/utils/fileOpenPayload.test.mjs`
- Modify: `src/components/file-tree/view/FileTree.open-payload.test.mjs`
- Modify: `src/components/file-tree/view/FileTree.tsx`
- Modify: `src/components/sidebar/types/types.ts`
- Modify: `src/components/main-content/types/types.ts`
- Modify: `src/components/code-editor/hooks/useEditorSidebar.ts`

- [ ] **Step 1: 先写 HTML 路由与文件树 payload 的失败测试**

```js
test('resolveRightPaneTargetForFile returns a visual-html target for html files by default', () => {
  const result = resolveRightPaneTargetForFile('/demo/index.html', {
    projectName: 'demo-project',
  });

  assert.deepEqual(
    result,
    createVisualHtmlTarget({
      filePath: '/demo/index.html',
      projectName: 'demo-project',
    }),
  );
});

test('getFileOpenPayload keeps html open payload free of previewUrl', () => {
  const result = getFileOpenPayload({
    item: {
      type: 'file',
      name: 'preview.html',
      path: '/demo/reports/preview.html',
    },
    selectedProject: {
      name: 'demo-project',
      path: '/demo',
    },
  });

  assert.deepEqual(result, {
    filePath: '/demo/reports/preview.html',
  });
});
```

- [ ] **Step 2: 跑这组测试，确认它们先失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/utils/rightPaneRouting.test.mjs src/components/file-tree/utils/fileOpenPayload.test.mjs src/components/file-tree/view/FileTree.open-payload.test.mjs`

Expected: FAIL，输出里包含 HTML 仍返回 `browser` 或 payload 仍包含 `previewUrl` 的断言差异。

- [ ] **Step 3: 把 HTML 路由默认值改成 `visual-html`**

```ts
export function resolveRightPaneTargetForFile(
  filePath: string,
  {
    projectName,
    diffInfo = null,
  }: {
    projectName?: string;
    diffInfo?: CodeEditorDiffInfo | null;
  } = {},
): RightPaneTarget {
  if (HTML_FILE_PATTERN.test(filePath)) {
    return createVisualHtmlTarget({
      filePath,
      projectName,
    });
  }

  if (MARKDOWN_FILE_PATTERN.test(filePath)) {
    return {
      type: 'markdown',
      filePath,
      fileName: getFileName(filePath),
      projectName,
    };
  }

  return createCodeTarget({
    filePath,
    projectName,
    diffInfo,
  });
}
```

- [ ] **Step 4: 去掉文件树和侧边栏打开 HTML 时的 `previewUrl` 负担**

```ts
export function getFileOpenPayload({
  item,
}: {
  item: FileOpenPayloadItem;
}) {
  return {
    filePath: item.path,
  };
}
```

```ts
type FileTreeProps = {
  selectedProject: Project | null;
  onFileOpen?: (filePath: string, diffInfo?: CodeEditorDiffInfo | null) => void;
  onAppendToChatInput?: ((text: string) => void) | null;
  embedded?: boolean;
};
```

```ts
export type SidebarProps = {
  projects: Project[];
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  onProjectSelect: (project: Project) => void;
  onSessionSelect: (session: ProjectSession) => void;
  onNewSession: (project: Project) => void;
  onSessionDelete?: (sessionId: string) => void;
  onProjectDelete?: (projectName: string) => void;
  isLoading: boolean;
  loadingProgress: LoadingProgress | null;
  onRefresh: () => Promise<void> | void;
  onShowSettings: () => void;
  showSettings: boolean;
  settingsInitialTab: string;
  onCloseSettings: () => void;
  isMobile: boolean;
  initialWorkspaceView?: WorkspaceView;
  onFileOpen?: (filePath: string, diffInfo?: CodeEditorDiffInfo | null) => void;
  onAppendToChatInput?: ((text: string) => void) | null;
  onCommitPreviewOpen?: (commit: GitCommitSummary, diff: string) => void;
};
```

```ts
export type MainContentProps = {
  selectedProject: Project | null;
  selectedSession: ProjectSession | null;
  activeTab: AppTab;
  setActiveTab: Dispatch<SetStateAction<AppTab>>;
  ws: WebSocket | null;
  sendMessage: (message: unknown) => void;
  latestMessage: unknown;
  isMobile: boolean;
  onMenuClick: () => void;
  isLoading: boolean;
  onInputFocusChange: (focused: boolean) => void;
  onSessionActive: SessionLifecycleHandler;
  onSessionInactive: SessionLifecycleHandler;
  onSessionProcessing: SessionLifecycleHandler;
  onSessionNotProcessing: SessionLifecycleHandler;
  processingSessions: Set<string>;
  onReplaceTemporarySession: SessionLifecycleHandler;
  onNavigateToSession: (targetSessionId: string) => void;
  onStartNewSession: (project: Project) => void;
  hasRightPaneContent: boolean;
  isRightPaneVisible: boolean;
  onToggleRightPaneVisibility: () => void;
  onShowSettings: () => void;
  externalMessageUpdate: number;
  onComposerAppendReady?: ((append: ((text: string) => void) | null) => void) | null;
  onFileChangeEvent?: (event: FileChangeEvent) => void;
  rightPaneTabs: RightPaneTab[];
  activeRightPaneTabId: string | null;
  rightPaneTarget: RightPaneTarget | null;
  editorWidth: number;
  editorExpanded: boolean;
  hasManualWidth: boolean;
  isResizing: boolean;
  resizeHandleRef: RefObject<HTMLDivElement | null>;
  browserRefreshVersion?: number;
  browserDependencySnapshot?: BrowserDependencySnapshot | null;
  codeFollowAlongState?: CodeFollowAlongState | null;
  onFileOpen: (filePath: string, diffInfo?: CodeEditorDiffInfo | null) => void;
  onOpenUrl: (url: string, source?: 'address-bar' | 'chat-link' | 'external-link') => void;
  onClosePane: () => void;
  onSelectRightPaneTab: (tabId: string) => void;
  onCloseRightPaneTab: (tabId: string) => void;
  onTogglePaneExpand: () => void;
  onResizeStart: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onBrowserDependenciesChange?: ((snapshot: BrowserDependencySnapshot) => void) | null;
};
```

```ts
const handleFileOpen = useCallback(
  (filePath: string, diffInfo: CodeEditorDiffInfo | null = null) => {
    const nextTarget = resolveRightPaneTargetForFile(filePath, {
      projectName: selectedProject?.name,
      diffInfo,
    });

    openTarget(nextTarget);
  },
  [openTarget, selectedProject?.name],
);
```

- [ ] **Step 5: 跑入口相关测试，确认 HTML 只会进入 `visual-html`**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/utils/rightPaneRouting.test.mjs src/components/file-tree/utils/fileOpenPayload.test.mjs src/components/file-tree/view/FileTree.open-payload.test.mjs`

Expected: PASS

- [ ] **Step 6: 提交这一小步**

```bash
git add src/components/right-pane/utils/rightPaneRouting.ts \
  src/components/right-pane/utils/rightPaneRouting.test.mjs \
  src/components/file-tree/utils/fileOpenPayload.ts \
  src/components/file-tree/utils/fileOpenPayload.test.mjs \
  src/components/file-tree/view/FileTree.open-payload.test.mjs \
  src/components/file-tree/view/FileTree.tsx \
  src/components/sidebar/types/types.ts \
  src/components/main-content/types/types.ts \
  src/components/code-editor/hooks/useEditorSidebar.ts
git commit -m "refactor: route html files to visual workspace"
```

## Task 2: 删除 HTML 浏览器预览 UI 和透传链路

**Files:**
- Modify: `src/components/app/AppContent.tsx`
- Modify: `src/components/main-content/view/MainContent.tsx`
- Modify: `src/components/right-pane/view/RightPane.tsx`
- Modify: `src/components/right-pane/view/editorPaneProps.ts`
- Modify: `src/components/right-pane/view/RightPaneContentRouter.tsx`
- Modify: `src/components/code-editor/view/CodeEditor.tsx`
- Modify: `src/components/code-editor/view/subcomponents/CodeEditorHeader.tsx`
- Modify: `src/components/code-editor/view/subcomponents/CodeEditorHeader.test.mjs`

- [ ] **Step 1: 先把源码级回归测试补上**

```js
test('CodeEditorHeader only keeps the visual html action for html files', async () => {
  const source = await readFile(new URL('./CodeEditorHeader.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /showHtmlPreviewAction/);
  assert.doesNotMatch(source, /onOpenHtmlPreview/);
  assert.match(source, /showVisualHtmlAction/);
  assert.match(source, /可视化编辑/);
});

test('CodeEditor still confirms before discarding unsaved html source edits', async () => {
  const source = await readFile(new URL('../CodeEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /window\\.confirm\\('当前源码存在未保存修改，是否放弃这些改动并进入可视化编辑？'\\)/);
  assert.match(source, /window\\.dispatchEvent\\(new CustomEvent\\(VISUAL_HTML_OPEN_REQUEST_EVENT_NAME/);
});
```

- [ ] **Step 2: 运行 header 测试并确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/code-editor/view/subcomponents/CodeEditorHeader.test.mjs`

Expected: FAIL，输出里仍能看到 `showHtmlPreviewAction` 或 `onOpenHtmlPreview`。

- [ ] **Step 3: 从 `AppContent -> MainContent -> RightPane -> CodeEditor` 链路移除 HTML 预览透传**

```tsx
<MainContent
  selectedProject={selectedProject}
  selectedSession={selectedSession}
  activeTab={activeTab}
  setActiveTab={setActiveTab}
  ws={ws}
  sendMessage={sendMessage}
  latestMessage={latestMessage}
  isMobile={isMobile}
  onMenuClick={() => setSidebarOpen(true)}
  isLoading={isLoadingProjects}
  onInputFocusChange={setIsInputFocused}
  onSessionActive={markSessionAsActive}
  onSessionInactive={markSessionAsInactive}
  onSessionProcessing={markSessionAsProcessing}
  onSessionNotProcessing={markSessionAsNotProcessing}
  processingSessions={processingSessions}
  onReplaceTemporarySession={replaceTemporarySession}
  onNavigateToSession={(targetSessionId: string) => navigate(`/session/${targetSessionId}`)}
  onStartNewSession={(project) => sidebarSharedProps.onNewSession(project)}
  hasRightPaneContent={tabs.length > 0}
  isRightPaneVisible={isRightPaneVisible}
  onToggleRightPaneVisibility={handleToggleRightPaneVisibility}
  onShowSettings={() => setShowSettings(true)}
  onComposerAppendReady={handleComposerAppendReady}
  externalMessageUpdate={externalMessageUpdate}
  onFileChangeEvent={handleFileChangeEvent}
  rightPaneTabs={tabs}
  activeRightPaneTabId={activeTabId}
  rightPaneTarget={rightPaneTarget}
  editorWidth={editorWidth}
  editorExpanded={editorExpanded}
  hasManualWidth={hasManualWidth}
  isResizing={isResizing}
  resizeHandleRef={resizeHandleRef}
  browserRefreshVersion={browserRefreshVersion}
  browserDependencySnapshot={browserDependencySnapshot}
  codeFollowAlongState={codeFollowAlongState}
  onFileOpen={handleFileOpen}
  onOpenUrl={handleUrlOpen}
  onClosePane={handleCloseEditor}
  onSelectRightPaneTab={handleOpenExistingTab}
  onCloseRightPaneTab={handleCloseTab}
  onTogglePaneExpand={handleToggleEditorExpand}
  onResizeStart={handleResizeStart}
  onBrowserDependenciesChange={handleBrowserDependenciesChange}
/>
```

```tsx
type RightPaneProps = {
  tabs: RightPaneTab[];
  activeTabId: string | null;
  target: RightPaneTarget | null;
  isMobile: boolean;
  editorExpanded: boolean;
  editorWidth: number;
  hasManualWidth: boolean;
  isResizing: boolean;
  resizeHandleRef: MutableRefObject<HTMLDivElement | null>;
  onResizeStart: (event: ReactMouseEvent<HTMLDivElement>) => void;
  browserRefreshVersion?: number;
  codeFollowAlongState?: CodeFollowAlongState | null;
  onClosePane: () => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onTogglePaneExpand: () => void;
  projectPath?: string;
  fillSpace?: boolean;
  onAppendToChatInput?: ((text: string) => void) | null;
  onBrowserDependenciesChange?: ((snapshot: BrowserDependencySnapshot) => void) | null;
};
```

```ts
type CreateEditorPanePropsParams = {
  target: EditorPaneTarget;
  projectPath?: string;
  onClosePane: () => void;
  onTogglePaneExpand?: (() => void) | null;
  onAppendToChatInput?: ((text: string) => void) | null;
  onPopOut?: (() => void) | null;
  isExpanded?: boolean;
  isSidebar?: boolean;
};
```

```tsx
const editorProps = createEditorPaneProps({
  target,
  projectPath,
  onClosePane,
  onTogglePaneExpand,
  onAppendToChatInput,
  onPopOut,
  isExpanded,
  isSidebar,
});

return <CodeEditor {...editorProps} />;
```

- [ ] **Step 4: 删除 `CodeEditor` 里的 HTML preview action，只保留 visual action**

```tsx
type CodeEditorProps = {
  file: CodeEditorFile;
  onClose: () => void;
  projectPath?: string;
  isSidebar?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: (() => void) | null;
  onPopOut?: (() => void) | null;
  onAppendToChatInput?: ((text: string) => void) | null;
};
```

```tsx
<CodeEditorHeader
  file={file}
  isSidebar={isSidebar}
  isFullscreen={isFullscreen}
  isMarkdownFile={isMarkdownFile}
  markdownPreview={markdownPreview}
  onToggleMarkdownPreview={setMarkdownPreview}
  hasUnsavedChanges={hasUnsavedChanges}
  saving={saving}
  saveSuccess={saveSuccess}
  saveError={saveError}
  onSave={handleSave}
  onDownload={handleDownload}
  onClose={onClose}
  onToggleFullscreen={() => setIsFullscreen((previous) => !previous)}
  showVisualHtmlAction={isHtmlFile && !file.diffInfo}
  onOpenVisualHtmlEditor={handleOpenVisualEditor}
/>
```

- [ ] **Step 5: 重新运行 HTML action 测试和工作台基础测试**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/code-editor/view/subcomponents/CodeEditorHeader.test.mjs src/components/right-pane/view/VisualHtmlEditor.test.mjs`

Expected: PASS

- [ ] **Step 6: 提交这一小步**

```bash
git add src/components/app/AppContent.tsx \
  src/components/main-content/view/MainContent.tsx \
  src/components/right-pane/view/RightPane.tsx \
  src/components/right-pane/view/editorPaneProps.ts \
  src/components/right-pane/view/RightPaneContentRouter.tsx \
  src/components/code-editor/view/CodeEditor.tsx \
  src/components/code-editor/view/subcomponents/CodeEditorHeader.tsx \
  src/components/code-editor/view/subcomponents/CodeEditorHeader.test.mjs
git commit -m "refactor: remove html preview pane actions"
```

## Task 3: 抽出 HTML 工作台内核与源码编辑表面

**Files:**
- Create: `src/components/right-pane/view/visual-html/htmlDocumentTransforms.ts`
- Create: `src/components/right-pane/view/visual-html/htmlDocumentTransforms.test.mjs`
- Create: `src/components/right-pane/view/visual-html/useHtmlDocumentController.ts`
- Create: `src/components/right-pane/view/visual-html/useHtmlDocumentController.test.mjs`
- Create: `src/components/right-pane/view/visual-html/HtmlSourceEditorSurface.tsx`
- Create: `src/components/right-pane/view/visual-html/HtmlSourceEditorSurface.test.mjs`

- [ ] **Step 1: 先写纯函数和控制器接口测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDocumentSnapshot,
  createWorkspaceDocument,
  buildSavedHtml,
} from './htmlDocumentTransforms.ts';

test('createWorkspaceDocument extracts body html and styles from a full html document', () => {
  const result = createWorkspaceDocument(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <style>body { color: red; }</style>
</head>
<body><main>demo</main></body>
</html>`);

  assert.equal(result.snapshot.htmlAttributes, ' lang="zh-CN"');
  assert.match(result.bodyHtml, /<main>demo<\\/main>/);
  assert.match(result.styles, /body \\{ color: red; \\}/);
});
```

```js
test('useHtmlDocumentController source tracks the dual dirty flags and apply helpers', async () => {
  const source = await readFile(new URL('./useHtmlDocumentController.ts', import.meta.url), 'utf8');

  assert.match(source, /dirtyDesign/);
  assert.match(source, /dirtySource/);
  assert.match(source, /applyDesignToSource/);
  assert.match(source, /applySourceToDesign/);
  assert.match(source, /syncConflictError/);
});
```

```js
test('HtmlSourceEditorSurface renders a dedicated source workspace surface', async () => {
  const source = await readFile(new URL('./HtmlSourceEditorSurface.tsx', import.meta.url), 'utf8');

  assert.match(source, /data-visual-html-mode=\"source\"/);
  assert.match(source, /CodeMirror/);
  assert.match(source, /getLanguageExtensions\\('index\\.html'\\)/);
});
```

- [ ] **Step 2: 运行新测试，确认文件尚不存在时先失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/htmlDocumentTransforms.test.mjs src/components/right-pane/view/visual-html/useHtmlDocumentController.test.mjs`

Expected: FAIL，报错包含找不到模块或导出缺失。

- [ ] **Step 3: 提取 HTML 文档转换纯函数**

```ts
export type HtmlDocumentSnapshot = {
  htmlAttributes: string;
  bodyAttributes: string;
  headMarkup: string;
};

export function createDocumentSnapshot(content: string): HtmlDocumentSnapshot {
  const parsed = new DOMParser().parseFromString(content, 'text/html');
  parsed.head.querySelectorAll('style').forEach((styleNode) => {
    styleNode.remove();
  });

  return {
    htmlAttributes: serializeAttributes(parsed.documentElement),
    bodyAttributes: serializeAttributes(parsed.body),
    headMarkup: parsed.head.innerHTML.trim(),
  };
}

export function createWorkspaceDocument(content: string) {
  const parsed = new DOMParser().parseFromString(content, 'text/html');
  const styles = Array.from(parsed.head.querySelectorAll('style'))
    .map((node) => node.textContent ?? '')
    .filter(Boolean)
    .join('\n\n');

  return {
    snapshot: createDocumentSnapshot(content),
    bodyHtml: parsed.body.innerHTML,
    styles,
  };
}

export function buildSavedHtml({
  snapshot,
  bodyHtml,
  css,
}: {
  snapshot: HtmlDocumentSnapshot;
  bodyHtml: string;
  css: string;
}) {
  const headParts = [snapshot.headMarkup];
  if (css.trim()) {
    headParts.push(`<style data-ccui-visual-html-style="true">\n${css}\n</style>`);
  }

  return `<!doctype html>
<html${snapshot.htmlAttributes}>
<head>
${headParts.filter(Boolean).join('\n')}
</head>
<body${snapshot.bodyAttributes}>
${bodyHtml}
</body>
</html>
`;
}
```

- [ ] **Step 4: 创建工作台控制器和源码表面**

```ts
export function useHtmlDocumentController({
  filePath,
  projectName,
}: {
  filePath: string;
  projectName: string | null;
}) {
  const [documentText, setDocumentText] = useState('');
  const [persistedText, setPersistedText] = useState('');
  const [version, setVersion] = useState<string | null>(null);
  const [dirtyDesign, setDirtyDesign] = useState(false);
  const [dirtySource, setDirtySource] = useState(false);
  const [syncConflictError, setSyncConflictError] = useState<string | null>(null);

  const applyDesignToSource = useCallback((nextHtml: string) => {
    setDocumentText(nextHtml);
    setDirtyDesign(false);
    setDirtySource(false);
  }, []);

  const applySourceToDesign = useCallback((nextSource: string) => {
    setDocumentText(nextSource);
    setDirtySource(false);
    setDirtyDesign(false);
    return createWorkspaceDocument(nextSource);
  }, []);

  return {
    documentText,
    persistedText,
    version,
    dirtyDesign,
    dirtySource,
    syncConflictError,
    setDocumentText,
    setDirtyDesign,
    setDirtySource,
    applyDesignToSource,
    applySourceToDesign,
    setPersistedDocument(next: { content: string; version: string | null }) {
      setDocumentText(next.content);
      setPersistedText(next.content);
      setVersion(next.version);
      setDirtyDesign(false);
      setDirtySource(false);
      setSyncConflictError(null);
    },
    markSyncConflict(message: string) {
      setSyncConflictError(message);
    },
  };
}
```

```tsx
export default function HtmlSourceEditorSurface({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { isDarkMode, fontSize, showLineNumbers } = useCodeEditorSettings();
  const extensions = useMemo(() => getLanguageExtensions('index.html'), []);

  return (
    <div className="h-full min-h-0" data-visual-html-mode="source">
      <style>{getEditorStyles(isDarkMode)}</style>
      <CodeMirror
        value={value}
        onChange={onChange}
        extensions={extensions}
        theme={isDarkMode ? oneDark : undefined}
        height="100%"
        style={{ fontSize: `${fontSize}px`, height: '100%' }}
        basicSetup={{
          lineNumbers: showLineNumbers,
          foldGutter: true,
          dropCursor: false,
          allowMultipleSelections: false,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          highlightSelectionMatches: true,
          searchKeymap: true,
        }}
      />
    </div>
  );
}
```

- [ ] **Step 5: 跑新单元测试，确认工作台内核能被独立验证**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/visual-html/htmlDocumentTransforms.test.mjs src/components/right-pane/view/visual-html/useHtmlDocumentController.test.mjs src/components/right-pane/view/visual-html/HtmlSourceEditorSurface.test.mjs`

Expected: PASS

- [ ] **Step 6: 提交这一小步**

```bash
git add src/components/right-pane/view/visual-html/htmlDocumentTransforms.ts \
  src/components/right-pane/view/visual-html/htmlDocumentTransforms.test.mjs \
  src/components/right-pane/view/visual-html/useHtmlDocumentController.ts \
  src/components/right-pane/view/visual-html/useHtmlDocumentController.test.mjs \
  src/components/right-pane/view/visual-html/HtmlSourceEditorSurface.tsx \
  src/components/right-pane/view/visual-html/HtmlSourceEditorSurface.test.mjs
git commit -m "feat: add visual html workspace document controller"
```

## Task 4: 把 `VisualHtmlEditor` 升级为统一的 HTML 工作台

**Files:**
- Create: `src/components/right-pane/view/visual-html/VisualCanvasPane.tsx`
- Create: `src/components/right-pane/view/visual-html/VisualCanvasPane.test.mjs`
- Modify: `src/components/right-pane/view/VisualHtmlEditor.tsx`
- Modify: `src/components/right-pane/view/VisualHtmlEditor.test.mjs`

- [ ] **Step 1: 先写工作台模式切换和源码回退测试**

```js
test('VisualHtmlEditor exposes design and source workspace modes', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /data-right-pane-view=\"visual-html\"/);
  assert.match(source, /设计/);
  assert.match(source, /源码/);
  assert.match(source, /重新加载/);
  assert.match(source, /data-visual-html-workspace=\"true\"/);
});

test('VisualHtmlEditor keeps unsupported html inside the workspace by switching to source mode', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /当前文件暂不支持可视化编辑，已切换到源码模式/);
  assert.match(source, /activeMode === 'source'/);
  assert.match(source, /<HtmlSourceEditorSurface/);
});
```

```js
test('VisualCanvasPane initializes grapesjs inside a dedicated design surface', async () => {
  const source = await readFile(new URL('./visual-html/VisualCanvasPane.tsx', import.meta.url), 'utf8');

  assert.match(source, /grapesjs\\.init/);
  assert.match(source, /data-visual-html-mode=\"design\"/);
  assert.match(source, /editor\\.on\\('update'/);
});
```

- [ ] **Step 2: 跑工作台测试，确认旧实现不满足新交互**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/VisualHtmlEditor.test.mjs`

Expected: FAIL，输出里缺少 `设计/源码/重新加载` 或 unsupported 仍提示“关闭此视图”。

- [ ] **Step 3: 先把 GrapesJS 画布逻辑抽到 `VisualCanvasPane`**

```tsx
export default function VisualCanvasPane({
  bodyHtml,
  styles,
  onReady,
  onDirtyChange,
}: {
  bodyHtml: string;
  styles: string;
  onReady: (editor: ReturnType<typeof grapesjs.init>) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<ReturnType<typeof grapesjs.init> | null>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    containerRef.current.innerHTML = '';
    editorRef.current = grapesjs.init({
      container: containerRef.current,
      fromElement: false,
      height: '100%',
      width: 'auto',
      storageManager: false,
      noticeOnUnload: false,
      selectorManager: { componentFirst: true },
      components: bodyHtml,
      style: styles,
    });

    const editor = editorRef.current;
    const notifyDirty = () => onDirtyChange((editor.getDirtyCount() ?? 0) > 0);
    editor.on('update', notifyDirty);
    onReady(editor);

    return () => {
      editor.off('update', notifyDirty);
      editor.destroy();
      editorRef.current = null;
    };
  }, [bodyHtml, onDirtyChange, onReady, styles]);

  return <div ref={containerRef} className="h-full min-h-0" data-visual-html-mode="design" />;
}
```

- [ ] **Step 4: 重写 `VisualHtmlEditor`，让它真正成为 `design/source` 工作台**

```tsx
const [activeMode, setActiveMode] = useState<'design' | 'source'>('design');
const controller = useHtmlDocumentController({
  filePath: target.filePath,
  projectName: target.projectName ?? projectPath ?? null,
});

const handleSwitchToSource = useCallback(() => {
  if (controller.dirtyDesign && canvasEditorRef.current && workspaceSnapshotRef.current) {
    const nextHtml = buildSavedHtml({
      snapshot: workspaceSnapshotRef.current,
      bodyHtml: canvasEditorRef.current.getHtml(),
      css: canvasEditorRef.current.getCss() ?? '',
    });
    controller.applyDesignToSource(nextHtml);
  }

  setActiveMode('source');
}, [controller]);

const handleSwitchToDesign = useCallback(() => {
  if (controller.dirtySource) {
    const nextWorkspace = controller.applySourceToDesign(controller.documentText);
    setCanvasDocument(nextWorkspace);
  }

  setActiveMode('design');
}, [controller]);
```

```tsx
<div
  className="flex flex-col h-full min-h-0 bg-background"
  data-right-pane-view="visual-html"
  data-visual-html-editor="true"
  data-visual-html-workspace="true"
  data-right-pane-file-path={target.filePath}
>
  <div className="flex gap-3 justify-between items-center px-4 py-3 border-b border-border">
    <div className="flex gap-2 items-center">
      <button
        className={activeMode === 'design' ? 'bg-accent text-foreground' : 'text-muted-foreground'}
        onClick={handleSwitchToDesign}
        type="button"
      >
        设计
      </button>
      <button
        className={activeMode === 'source' ? 'bg-accent text-foreground' : 'text-muted-foreground'}
        onClick={handleSwitchToSource}
        type="button"
      >
        源码
      </button>
    </div>
    <div className="flex gap-2 items-center">
      <button onClick={() => void handleReload()} type="button">重新加载</button>
      <button onClick={() => void handleSave()} type="button">
        {saveSuccess ? '已保存' : saving ? '保存中...' : '保存'}
      </button>
      <button data-right-pane-close="true" onClick={onClosePane} type="button">Close</button>
    </div>
  </div>

  {eligibilityError ? (
    <div className="p-3 mx-4 mt-4 text-sm rounded-lg border border-amber-300 bg-amber-50 text-amber-900">
      当前文件暂不支持可视化编辑，已切换到源码模式。
    </div>
  ) : null}

  <div className="flex-1 min-h-0">
    {activeMode === 'design' && !eligibilityError ? (
      <VisualCanvasPane
        bodyHtml={canvasDocument.bodyHtml}
        styles={canvasDocument.styles}
        onReady={(editor) => {
          canvasEditorRef.current = editor;
        }}
        onDirtyChange={(dirty) => controller.setDirtyDesign(dirty)}
      />
    ) : (
      <HtmlSourceEditorSurface
        value={controller.documentText}
        onChange={(value) => {
          controller.setDocumentText(value);
          controller.setDirtySource(value !== controller.persistedText);
        }}
      />
    )}
  </div>
</div>
```

- [ ] **Step 5: 跑工作台测试并做一次类型检查**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/VisualHtmlEditor.test.mjs src/components/right-pane/view/visual-html/VisualCanvasPane.test.mjs src/components/right-pane/view/visual-html/HtmlSourceEditorSurface.test.mjs src/components/right-pane/view/visual-html/useHtmlDocumentController.test.mjs`

Expected: PASS

Run: `npm run typecheck`

Expected: PASS

- [ ] **Step 6: 提交这一小步**

```bash
git add src/components/right-pane/view/visual-html/VisualCanvasPane.tsx \
  src/components/right-pane/view/visual-html/VisualCanvasPane.test.mjs \
  src/components/right-pane/view/VisualHtmlEditor.tsx \
  src/components/right-pane/view/VisualHtmlEditor.test.mjs
git commit -m "feat: unify html design and source workspace"
```

## Task 5: 统一保存/重载/冲突回归验证并完成手动验收脚本

**Files:**
- Modify: `src/components/right-pane/view/VisualHtmlEditor.tsx`
- Modify: `src/components/right-pane/view/VisualHtmlEditor.test.mjs`
- Modify: `src/components/code-editor/view/subcomponents/CodeEditorHeader.test.mjs`
- Modify: `src/components/right-pane/utils/rightPaneRouting.test.mjs`
- Modify: `src/components/file-tree/utils/fileOpenPayload.test.mjs`

- [ ] **Step 1: 补充回归测试，锁住“单一工作台”与冲突处理**

```js
test('VisualHtmlEditor save flow blocks when a sync conflict is active', async () => {
  const source = await readFile(new URL('./VisualHtmlEditor.tsx', import.meta.url), 'utf8');

  assert.match(source, /if \\(controller\\.syncConflictError\\)/);
  assert.match(source, /文件已在磁盘上变化，请先重新加载后再保存/);
  assert.match(source, /broadcastFileSyncEvent/);
});

test('rightPaneRouting no longer uses html preview mode branches', async () => {
  const source = await readFile(new URL('../utils/rightPaneRouting.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /htmlMode/);
  assert.doesNotMatch(source, /previewUrl/);
  assert.match(source, /createVisualHtmlTarget/);
});
```

- [ ] **Step 2: 跑最终回归测试，确认它们先暴露缺口**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/VisualHtmlEditor.test.mjs src/components/code-editor/view/subcomponents/CodeEditorHeader.test.mjs src/components/right-pane/utils/rightPaneRouting.test.mjs src/components/file-tree/utils/fileOpenPayload.test.mjs`

Expected: 如果前面尚未完全收口，这里会先 FAIL；完成补丁后应全部 PASS。

- [ ] **Step 3: 收尾保存与重载提示文案，保证工作台是唯一 HTML 编辑出口**

```tsx
{controller.syncConflictError ? (
  <div className="flex gap-3 justify-between items-center p-3 mx-4 mt-4 text-sm rounded-lg border border-amber-300 bg-amber-50 text-amber-900">
    <span>{controller.syncConflictError}</span>
    <button
      className="px-3 py-1 text-xs font-medium rounded-md border border-current transition-opacity hover:opacity-80"
      onClick={() => {
        void handleReload();
      }}
      type="button"
    >
      重新加载
    </button>
  </div>
) : null}
```

```tsx
<div className="flex flex-wrap gap-y-1 gap-x-2 items-center mt-1 text-xs text-muted-foreground">
  <span>Visual HTML Workspace</span>
  <span>{activeMode === 'design' ? '设计模式' : '源码模式'}</span>
  {controller.dirtyDesign || controller.dirtySource ? <span>未保存修改</span> : null}
</div>
```

- [ ] **Step 4: 运行完整回归命令**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/view/VisualHtmlEditor.test.mjs src/components/right-pane/view/visual-html/VisualCanvasPane.test.mjs src/components/right-pane/view/visual-html/HtmlSourceEditorSurface.test.mjs src/components/right-pane/view/visual-html/useHtmlDocumentController.test.mjs src/components/right-pane/view/visual-html/htmlDocumentTransforms.test.mjs src/components/right-pane/utils/rightPaneRouting.test.mjs src/components/file-tree/utils/fileOpenPayload.test.mjs src/components/file-tree/view/FileTree.open-payload.test.mjs src/components/code-editor/view/subcomponents/CodeEditorHeader.test.mjs`

Expected: PASS

Run: `npm run typecheck`

Expected: PASS

- [ ] **Step 5: 做一轮手动验收**

Run: `npm run client`

Expected:
- 打开 `.html` 文件时只出现一个 `visual-html` tab
- 顶部只看到 `设计`、`源码`、`保存`、`重新加载`
- 从 `源码` 切回 `设计` 时会应用源码修改
- 含脚本或模板语法的 HTML 进入工作台后直接落到源码模式
- 文件外部改动后保存会先提示冲突，不会静默覆盖

- [ ] **Step 6: 提交这一小步**

```bash
git add src/components/right-pane/view/VisualHtmlEditor.tsx \
  src/components/right-pane/view/VisualHtmlEditor.test.mjs \
  src/components/code-editor/view/subcomponents/CodeEditorHeader.test.mjs \
  src/components/right-pane/utils/rightPaneRouting.test.mjs \
  src/components/file-tree/utils/fileOpenPayload.test.mjs
git commit -m "test: cover visual html workspace regressions"
```
