# Visual HTML Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为现有 `.html/.htm` 文件增加 GrapesJS 可视化编辑视图，并直接回写原文件，同时保留源码编辑和浏览器预览。

**Architecture:** 在现有 `RightPaneTarget -> RightPaneContentRouter` 体系中新增 `visual-html` 目标类型，并用独立的 `VisualHtmlEditor` 组件承载 GrapesJS。HTML 文件文本继续作为唯一真实来源；后端文件读写接口补充版本校验，前端通过显式保存和文件变更广播实现源码、可视化、预览三视图协同。

**Tech Stack:** React 18, Vite, TypeScript, Express, GrapesJS, node:test

---

## File Structure

### New files

- `src/components/right-pane/view/VisualHtmlEditor.tsx`
  - GrapesJS 可视化编辑器容器，负责初始化、保存、冲突提示、失败回退。
- `src/components/right-pane/view/VisualHtmlEditor.test.mjs`
  - 覆盖可视化视图渲染、失败回退和保存成功提示的源码级测试。
- `src/components/right-pane/utils/htmlVisualEligibility.ts`
  - 判断某个 HTML 文件是否适合进入可视化编辑。
- `src/components/right-pane/utils/htmlVisualEligibility.test.mjs`
  - 覆盖模板语法、脚本过重等拦截规则。
- `src/utils/fileSyncEvents.ts`
  - 跨 pane 的文件更新广播与订阅工具。
- `src/utils/fileSyncEvents.test.mjs`
  - 覆盖广播载荷和过滤规则。
- `server/utils/fileVersion.js`
  - 生成文件版本摘要，用于读写冲突校验。

### Modified files

- `src/components/right-pane/types.ts`
  - 增加 `visual-html` target 类型。
- `src/components/right-pane/utils/rightPaneRouting.ts`
  - 支持为 HTML 文件生成可视化 target。
- `src/components/right-pane/utils/rightPaneRouting.test.mjs`
  - 补充 `visual-html` 目标测试。
- `src/components/right-pane/utils/rightPaneTabs.ts`
  - 为 `visual-html` target 输出易读 tab 文案。
- `src/components/right-pane/utils/rightPaneTabs.test.mjs`
  - 覆盖新文案分支。
- `src/components/right-pane/view/RightPaneContentRouter.tsx`
  - 路由到 `VisualHtmlEditor`。
- `src/components/code-editor/types/types.ts`
  - 如有必要，为 HTML 文件增加“可视化模式可用”标记或文件元信息。
- `src/components/code-editor/hooks/useCodeEditorDocument.ts`
  - 读取版本信息、保存时传递版本校验参数、监听文件刷新广播。
- `src/components/code-editor/view/CodeEditor.tsx`
  - 为 HTML 文件头部增加“可视化编辑”入口并处理源码未保存冲突。
- `src/components/code-editor/view/subcomponents/CodeEditorHeader.tsx`
  - 暴露“打开可视化编辑”按钮。
- `src/components/code-editor/view/subcomponents/CodeEditorHeader.test.mjs`
  - 覆盖 HTML 文件按钮展示逻辑。
- `src/utils/api.js`
  - 读写文件接口增加版本字段和冲突响应支持。
- `server/index.js`
  - 读取文件时返回版本摘要，保存文件时校验 `expectedVersion`。

## Task 1: 扩展右侧视图模型，支持 `visual-html` target

**Files:**
- Modify: `src/components/right-pane/types.ts`
- Modify: `src/components/right-pane/utils/rightPaneRouting.ts`
- Modify: `src/components/right-pane/utils/rightPaneTabs.ts`
- Test: `src/components/right-pane/utils/rightPaneRouting.test.mjs`
- Test: `src/components/right-pane/utils/rightPaneTabs.test.mjs`

- [ ] **Step 1: 写目标类型与路由测试**

```js
test('resolveRightPaneTargetForFile returns visual-html target for supported html files', () => {
  const result = resolveRightPaneTargetForFile('/demo/index.html', {
    projectName: 'demo',
    htmlMode: 'visual',
  });

  assert.deepEqual(result, {
    type: 'visual-html',
    filePath: '/demo/index.html',
    fileName: 'index.html',
    projectName: 'demo',
  });
});

test('getRightPaneTabLabel returns visual label for visual-html target', () => {
  assert.equal(getRightPaneTabLabel({
    type: 'visual-html',
    filePath: '/demo/index.html',
    fileName: 'index.html',
    projectName: 'demo',
  }), 'index.html');
});
```

- [ ] **Step 2: 运行目标路由测试并确认失败**

Run: `node --test src/components/right-pane/utils/rightPaneRouting.test.mjs src/components/right-pane/utils/rightPaneTabs.test.mjs`

Expected: FAIL，报错包含 `visual-html` 分支缺失或断言不匹配。

- [ ] **Step 3: 扩展 `RightPaneTarget` 与路由实现**

```ts
export type RightPaneVisualHtmlTarget = {
  type: 'visual-html';
  filePath: string;
  fileName: string;
  projectName?: string;
};

export type RightPaneTarget =
  | RightPaneCodeTarget
  | RightPaneMarkdownTarget
  | RightPaneBrowserTarget
  | RightPaneGitCommitTarget
  | RightPaneVisualHtmlTarget;
```

```ts
export function createVisualHtmlTarget({
  filePath,
  projectName,
}: {
  filePath: string;
  projectName?: string;
}): RightPaneVisualHtmlTarget {
  return {
    type: 'visual-html',
    filePath,
    fileName: getFileName(filePath),
    projectName,
  };
}
```

```ts
if (HTML_FILE_PATTERN.test(filePath) && htmlMode === 'visual') {
  return createVisualHtmlTarget({ filePath, projectName });
}
```

- [ ] **Step 4: 为 tab 文案补充 `visual-html` 分支**

```ts
export function getRightPaneTabLabel(target: RightPaneTarget): string {
  if (target.type === 'browser') {
    return target.title?.trim() || target.url;
  }

  if (target.type === 'git-commit') {
    return target.message.trim() || target.shortHash;
  }

  if (target.type === 'visual-html') {
    return target.fileName;
  }

  return target.fileName;
}
```

- [ ] **Step 5: 重新运行目标与文案测试**

Run: `node --test src/components/right-pane/utils/rightPaneRouting.test.mjs src/components/right-pane/utils/rightPaneTabs.test.mjs`

Expected: PASS

- [ ] **Step 6: 提交这一小步**

```bash
git add src/components/right-pane/types.ts \
  src/components/right-pane/utils/rightPaneRouting.ts \
  src/components/right-pane/utils/rightPaneRouting.test.mjs \
  src/components/right-pane/utils/rightPaneTabs.ts \
  src/components/right-pane/utils/rightPaneTabs.test.mjs
git commit -m "feat: add visual html right pane target"
```

## Task 2: 为文件读写补充版本校验，支持冲突检测

**Files:**
- Create: `server/utils/fileVersion.js`
- Modify: `server/index.js`
- Modify: `src/utils/api.js`
- Modify: `src/components/code-editor/hooks/useCodeEditorDocument.ts`
- Test: `server/routes/projects.test.mjs`

- [ ] **Step 1: 为后端文件接口写冲突测试**

```js
test('PUT /api/projects/:projectName/file rejects stale expectedVersion', async () => {
  const readResponse = await request(app)
    .get(`/api/projects/${projectName}/file`)
    .query({ filePath });

  const staleVersion = readResponse.body.version;

  await writeFile(filePath, '<html>external change</html>', 'utf8');

  const saveResponse = await request(app)
    .put(`/api/projects/${projectName}/file`)
    .send({
      filePath,
      content: '<html>visual change</html>',
      expectedVersion: staleVersion,
    });

  assert.equal(saveResponse.status, 409);
  assert.equal(saveResponse.body.error, 'File has changed since last load');
});
```

- [ ] **Step 2: 运行服务端文件路由测试并确认失败**

Run: `node --test server/routes/projects.test.mjs`

Expected: FAIL，`expectedVersion` 尚未生效或接口未返回 `version`。

- [ ] **Step 3: 添加版本摘要工具**

```js
import crypto from 'node:crypto';

export function createFileVersion(content) {
  return crypto.createHash('sha1').update(content, 'utf8').digest('hex');
}
```

- [ ] **Step 4: 扩展读文件接口返回版本信息，保存接口校验冲突**

```js
const content = await fsPromises.readFile(resolved, 'utf8');
res.json({
  content,
  path: resolved,
  version: createFileVersion(content),
});
```

```js
const currentContent = await fsPromises.readFile(resolved, 'utf8');
const currentVersion = createFileVersion(currentContent);

if (expectedVersion && expectedVersion !== currentVersion) {
  return res.status(409).json({
    error: 'File has changed since last load',
    currentVersion,
  });
}

await fsPromises.writeFile(resolved, content, 'utf8');

res.json({
  success: true,
  path: resolved,
  version: createFileVersion(content),
});
```

- [ ] **Step 5: 更新前端 API 与源码编辑读取/保存钩子**

```js
readFile: (projectName, filePath) =>
  authenticatedFetch(`/api/projects/${projectName}/file?filePath=${encodeURIComponent(filePath)}`),
saveFile: (projectName, filePath, content, expectedVersion = null) =>
  authenticatedFetch(`/api/projects/${projectName}/file`, {
    method: 'PUT',
    body: JSON.stringify({ filePath, content, expectedVersion }),
  }),
```

```ts
const [version, setVersion] = useState<string | null>(null);

const data = await response.json();
setContent(data.content);
setVersion(data.version ?? null);

const response = await api.saveFile(fileProjectName, filePath, content, version);
const data = await response.json();
setVersion(data.version ?? version);
```

- [ ] **Step 6: 重新运行服务端与前端相关测试**

Run: `node --test server/routes/projects.test.mjs src/types/app.test.mjs`

Expected: PASS

- [ ] **Step 7: 提交这一小步**

```bash
git add server/utils/fileVersion.js \
  server/index.js \
  server/routes/projects.test.mjs \
  src/utils/api.js \
  src/components/code-editor/hooks/useCodeEditorDocument.ts
git commit -m "feat: add file version conflict checks"
```

## Task 3: 新增 HTML 可视化适配判断与 GrapesJS 容器壳

**Files:**
- Create: `src/components/right-pane/utils/htmlVisualEligibility.ts`
- Create: `src/components/right-pane/utils/htmlVisualEligibility.test.mjs`
- Create: `src/components/right-pane/view/VisualHtmlEditor.tsx`
- Create: `src/components/right-pane/view/VisualHtmlEditor.test.mjs`
- Modify: `src/components/right-pane/view/RightPaneContentRouter.tsx`

- [ ] **Step 1: 为适配判断写测试**

```js
test('isHtmlEligibleForVisualEditing returns false for template-heavy files', () => {
  assert.equal(
    isHtmlEligibleForVisualEditing('<div>{{ title }}</div><% if (x) { %></div>'),
    false,
  );
});

test('isHtmlEligibleForVisualEditing returns true for simple html document', () => {
  assert.equal(
    isHtmlEligibleForVisualEditing('<!doctype html><html><body><h1>Hello</h1></body></html>'),
    true,
  );
});
```

- [ ] **Step 2: 为 `VisualHtmlEditor` 路由写失败回退测试**

```js
test('RightPaneContentRouter renders VisualHtmlEditor for visual-html target', async () => {
  const source = readFileSync(new URL('./RightPaneContentRouter.tsx', import.meta.url), 'utf8');
  assert.match(source, /target\.type === 'visual-html'/);
  assert.match(source, /VisualHtmlEditor/);
});
```

- [ ] **Step 3: 运行新测试并确认失败**

Run: `node --test src/components/right-pane/utils/htmlVisualEligibility.test.mjs src/components/right-pane/view/VisualHtmlEditor.test.mjs`

Expected: FAIL，文件或函数尚不存在。

- [ ] **Step 4: 实现适配判断工具**

```ts
const TEMPLATE_PATTERN = /(\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|<%[\s\S]*?%>)/;
const HEAVY_SCRIPT_PATTERN = /<script[\s\S]{400,}<\/script>/i;

export function isHtmlEligibleForVisualEditing(content: string): boolean {
  if (!content.trim()) return false;
  if (TEMPLATE_PATTERN.test(content)) return false;
  if (HEAVY_SCRIPT_PATTERN.test(content)) return false;
  return /<html[\s>]/i.test(content) || /<body[\s>]/i.test(content);
}
```

- [ ] **Step 5: 搭建 `VisualHtmlEditor` 空壳组件**

```tsx
export default function VisualHtmlEditor({ target, projectPath, onClosePane }: VisualHtmlEditorProps) {
  return (
    <div className="flex h-full flex-col bg-background" data-right-pane-view="visual-html">
      <div className="border-b border-border/60 px-3 py-2 text-sm font-medium">
        {target.fileName}
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        Visual HTML Editor loading...
      </div>
    </div>
  );
}
```

- [ ] **Step 6: 将 `RightPaneContentRouter` 接到新视图**

```tsx
if (target.type === 'visual-html') {
  return (
    <div className="h-full min-h-0" data-right-pane-view="visual-html">
      <VisualHtmlEditor
        target={target}
        projectPath={projectPath}
        onClosePane={onClosePane}
      />
    </div>
  );
}
```

- [ ] **Step 7: 重新运行路由与适配测试**

Run: `node --test src/components/right-pane/utils/htmlVisualEligibility.test.mjs src/components/right-pane/view/VisualHtmlEditor.test.mjs src/components/right-pane/view/GitCommitPane.source.test.mjs`

Expected: PASS

- [ ] **Step 8: 提交这一小步**

```bash
git add src/components/right-pane/utils/htmlVisualEligibility.ts \
  src/components/right-pane/utils/htmlVisualEligibility.test.mjs \
  src/components/right-pane/view/VisualHtmlEditor.tsx \
  src/components/right-pane/view/VisualHtmlEditor.test.mjs \
  src/components/right-pane/view/RightPaneContentRouter.tsx
git commit -m "feat: scaffold visual html editor pane"
```

## Task 4: 打通 GrapesJS 初始化、保存和文件更新广播

**Files:**
- Create: `src/utils/fileSyncEvents.ts`
- Create: `src/utils/fileSyncEvents.test.mjs`
- Modify: `src/components/right-pane/view/VisualHtmlEditor.tsx`
- Modify: `src/components/code-editor/hooks/useCodeEditorDocument.ts`
- Modify: `src/utils/api.js`

- [ ] **Step 1: 为文件广播工具写测试**

```js
test('emitFileSaved notifies subscribers for matching file path', () => {
  const received = [];
  const unsubscribe = subscribeToFileSaved((event) => received.push(event));

  emitFileSaved({
    projectName: 'demo',
    filePath: '/demo/index.html',
    version: 'next-version',
  });

  unsubscribe();
  assert.deepEqual(received, [{
    projectName: 'demo',
    filePath: '/demo/index.html',
    version: 'next-version',
  }]);
});
```

- [ ] **Step 2: 运行广播测试并确认失败**

Run: `node --test src/utils/fileSyncEvents.test.mjs`

Expected: FAIL，事件工具尚不存在。

- [ ] **Step 3: 实现文件保存广播工具**

```ts
const FILE_SAVED_EVENT = 'ccui:file-saved';

export function emitFileSaved(detail: FileSavedDetail) {
  window.dispatchEvent(new CustomEvent(FILE_SAVED_EVENT, { detail }));
}

export function subscribeToFileSaved(handler: (detail: FileSavedDetail) => void) {
  const listener = (event: Event) => {
    handler((event as CustomEvent<FileSavedDetail>).detail);
  };
  window.addEventListener(FILE_SAVED_EVENT, listener);
  return () => window.removeEventListener(FILE_SAVED_EVENT, listener);
}
```

- [ ] **Step 4: 在 `VisualHtmlEditor` 中接入 GrapesJS 读取与保存**

```tsx
const response = await api.readFile(target.projectName!, target.filePath);
const data = await response.json();

if (!isHtmlEligibleForVisualEditing(data.content)) {
  setLoadError('该文件暂不适合可视化编辑');
  return;
}

editorRef.current = grapesjs.init({
  container: canvasRef.current!,
  fromElement: false,
  storageManager: false,
  components: data.content,
});
setVersion(data.version ?? null);
```

```tsx
const nextHtml = editorRef.current?.getHtml() ?? '';
const response = await api.saveFile(target.projectName!, target.filePath, nextHtml, version);
const data = await response.json();
setVersion(data.version ?? version);
emitFileSaved({
  projectName: target.projectName!,
  filePath: target.filePath,
  version: data.version ?? null,
});
```

- [ ] **Step 5: 在源码编辑钩子中监听文件广播并刷新同文件内容**

```ts
useEffect(() => {
  if (!fileProjectName) return;

  return subscribeToFileSaved((event) => {
    if (event.projectName !== fileProjectName || event.filePath !== filePath) {
      return;
    }

    void loadFileContent();
  });
}, [filePath, fileProjectName, loadFileContent]);
```

- [ ] **Step 6: 重新运行广播和现有源码编辑相关测试**

Run: `node --test src/utils/fileSyncEvents.test.mjs src/components/code-editor/hooks/editorSidebarUrlOpenState.test.mjs src/components/code-editor/utils/editorSidebarPersistence.test.mjs`

Expected: PASS

- [ ] **Step 7: 提交这一小步**

```bash
git add src/utils/fileSyncEvents.ts \
  src/utils/fileSyncEvents.test.mjs \
  src/components/right-pane/view/VisualHtmlEditor.tsx \
  src/components/code-editor/hooks/useCodeEditorDocument.ts \
  src/utils/api.js
git commit -m "feat: wire visual html editor save and refresh flow"
```

## Task 5: 增加 HTML 入口、源码未保存冲突和预览联动

**Files:**
- Modify: `src/components/code-editor/view/CodeEditor.tsx`
- Modify: `src/components/code-editor/view/subcomponents/CodeEditorHeader.tsx`
- Test: `src/components/code-editor/view/subcomponents/CodeEditorHeader.test.mjs`
- Modify: `src/components/code-editor/hooks/useEditorSidebar.ts`
- Modify: `src/components/right-pane/view/VisualHtmlEditor.tsx`

- [ ] **Step 1: 为 HTML 入口和未保存冲突写测试**

```js
test('CodeEditorHeader shows visual edit action for html files', async () => {
  const source = await fs.readFile(new URL('./CodeEditorHeader.tsx', import.meta.url), 'utf8');
  assert.match(source, /showVisualHtmlAction/);
  assert.match(source, /可视化编辑|Visual Edit/);
});
```

- [ ] **Step 2: 运行编辑器头部测试并确认失败**

Run: `node --test src/components/code-editor/view/subcomponents/CodeEditorHeader.test.mjs`

Expected: FAIL，新的 HTML 可视化入口尚未存在。

- [ ] **Step 3: 在编辑器头部增加“可视化编辑”动作**

```tsx
{showVisualHtmlAction && onOpenVisualHtmlEditor && (
  <button
    type="button"
    className="..."
    onClick={onOpenVisualHtmlEditor}
  >
    可视化编辑
  </button>
)}
```

- [ ] **Step 4: 在 `CodeEditor` 中处理未保存冲突并打开 `visual-html` target**

```tsx
const [dirty, setDirty] = useState(false);

const handleOpenVisualEditor = useCallback(() => {
  if (dirty) {
    const shouldDiscard = window.confirm('当前源码存在未保存修改，是否放弃这些改动并进入可视化编辑？');
    if (!shouldDiscard) {
      return;
    }
  }

  onOpenVisualHtmlEditor?.(file);
}, [dirty, file, onOpenVisualHtmlEditor]);
```

```tsx
<CodeEditorHeader
  ...
  showVisualHtmlAction={isHtmlFile}
  onOpenVisualHtmlEditor={handleOpenVisualEditor}
/>
```

- [ ] **Step 5: 在 `useEditorSidebar` 中增加打开 `visual-html` target 的入口，并在保存后刷新已打开预览**

```ts
const handleVisualHtmlOpen = useCallback((filePath: string) => {
  openTarget(createVisualHtmlTarget({
    filePath,
    projectName: selectedProject?.name,
  }));
}, [openTarget, selectedProject?.name]);
```

```ts
return {
  ...
  handleVisualHtmlOpen,
};
```

- [ ] **Step 6: 在 `VisualHtmlEditor` 保存成功后触发预览 reload**

```tsx
if (previewFrameRef.current) {
  previewFrameRef.current.contentWindow?.location.reload();
}
```

更实际的第一版做法是发出文件保存广播，让 `BrowserPane` 在同文件预览标签命中时自刷新：

```ts
emitFileSaved({
  projectName: target.projectName!,
  filePath: target.filePath,
  version: data.version ?? null,
});
```

- [ ] **Step 7: 运行受影响的前端测试**

Run: `npm test -- --test-name-pattern="CodeEditorHeader|rightPaneRouting|rightPaneTabs"`

Expected: PASS，或在当前测试脚本不支持过滤时，运行对应单测文件并全部通过。

- [ ] **Step 8: 手动验证**

Run:

```bash
npm run client
```

Expected:

- 打开 `.html` 文件时可看到“可视化编辑”入口
- 简单 HTML 文件能进入 GrapesJS 视图
- 保存后原文件内容被覆盖
- 切回源码页能看到最新内容
- 已打开的预览页会刷新
- 含模板语法的 HTML 会提示回退源码模式

- [ ] **Step 9: 提交这一小步**

```bash
git add src/components/code-editor/view/CodeEditor.tsx \
  src/components/code-editor/view/subcomponents/CodeEditorHeader.tsx \
  src/components/code-editor/view/subcomponents/CodeEditorHeader.test.mjs \
  src/components/code-editor/hooks/useEditorSidebar.ts \
  src/components/right-pane/view/VisualHtmlEditor.tsx
git commit -m "feat: add visual html entry from code editor"
```

## Self-Review

- Spec coverage:
  - `visual-html` 右侧视图：Task 1, 3, 5
  - 单文件直接回写：Task 2, 4
  - 冲突校验：Task 2, 5
  - 失败回退：Task 3, 5
  - 预览联动：Task 4, 5
  - 文件适配范围限制：Task 3
- Placeholder scan:
  - 未保留 `TODO/TBD/implement later` 等占位项
- Type consistency:
  - 统一使用 `visual-html` 作为 target 名称
  - 统一使用 `expectedVersion` 作为写入前版本字段

