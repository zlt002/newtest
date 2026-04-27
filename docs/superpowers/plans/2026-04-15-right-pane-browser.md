# 右侧统一内容面板与内嵌浏览器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前右侧编辑器侧栏升级为统一内容面板，支持代码、Markdown 和可交互浏览器三种视图，并让 `html` 文件与聊天链接统一在右侧浏览器打开。

**Architecture:** 先把 `useEditorSidebar` 抽象成统一的 `useRightPane` 状态模型，再引入 `RightPane` 容器和按类型路由的渲染层。普通文件继续走代码编辑器，Markdown 文件进入独立 Markdown 视图，`html` 文件和聊天链接统一经过浏览器目标解析后进入浏览器视图。

**Tech Stack:** React, TypeScript, Vite, react-markdown, node:test, tsx

---

### Task 1: 建立右侧面板状态模型与纯函数路由

**Files:**
- Create: `src/components/right-pane/types.ts`
- Create: `src/components/right-pane/utils/rightPaneRouting.ts`
- Test: `src/components/right-pane/utils/rightPaneRouting.test.mjs`
- Modify: `src/components/code-editor/hooks/useEditorSidebar.ts`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCodeTarget,
  createBrowserTarget,
  resolveRightPaneTargetForFile,
  normalizeBrowserUrl,
} from './rightPaneRouting.ts';

test('resolveRightPaneTargetForFile returns a browser target for html files', () => {
  const result = resolveRightPaneTargetForFile('/demo/index.html', {
    projectName: 'demo-project',
    previewUrl: 'http://localhost:5173/index.html',
  });

  assert.deepEqual(result, createBrowserTarget({
    url: 'http://localhost:5173/index.html',
    source: 'file-html',
    filePath: '/demo/index.html',
    title: 'index.html',
  }));
});

test('resolveRightPaneTargetForFile returns a code target for ts files', () => {
  const result = resolveRightPaneTargetForFile('/demo/src/main.ts', {
    projectName: 'demo-project',
  });

  assert.deepEqual(result, createCodeTarget({
    filePath: '/demo/src/main.ts',
    projectName: 'demo-project',
  }));
});

test('normalizeBrowserUrl adds http for localhost addresses', () => {
  assert.equal(normalizeBrowserUrl('localhost:5173'), 'http://localhost:5173');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/components/right-pane/utils/rightPaneRouting.test.mjs`
Expected: FAIL with module or exported function not found

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/right-pane/types.ts
import type { CodeEditorDiffInfo } from '../code-editor/types/types';

export type RightPaneTarget =
  | {
      type: 'code';
      filePath: string;
      fileName: string;
      projectName?: string;
      diffInfo?: CodeEditorDiffInfo | null;
    }
  | {
      type: 'markdown';
      filePath: string;
      fileName: string;
      projectName?: string;
    }
  | {
      type: 'browser';
      url: string;
      source: 'address-bar' | 'chat-link' | 'file-html' | 'external-link';
      title?: string;
      filePath?: string;
    };
```

```ts
// src/components/right-pane/utils/rightPaneRouting.ts
const HTML_FILE_PATTERN = /\.html?$/i;
const MARKDOWN_FILE_PATTERN = /\.(md|markdown)$/i;

export const normalizeBrowserUrl = (value: string): string => {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  throw new Error('Invalid browser URL');
};

export const createCodeTarget = ({ filePath, projectName, diffInfo = null }) => ({
  type: 'code',
  filePath,
  fileName: filePath.split('/').pop() || filePath,
  projectName,
  diffInfo,
});

export const createBrowserTarget = ({ url, source, filePath, title }) => ({
  type: 'browser',
  url,
  source,
  filePath,
  title,
});

export const resolveRightPaneTargetForFile = (
  filePath: string,
  { projectName, previewUrl, diffInfo = null } = {},
) => {
  if (HTML_FILE_PATTERN.test(filePath) && previewUrl) {
    return createBrowserTarget({
      url: previewUrl,
      source: 'file-html',
      filePath,
      title: filePath.split('/').pop() || filePath,
    });
  }

  if (MARKDOWN_FILE_PATTERN.test(filePath)) {
    return {
      type: 'markdown',
      filePath,
      fileName: filePath.split('/').pop() || filePath,
      projectName,
    };
  }

  return createCodeTarget({ filePath, projectName, diffInfo });
};
```

```ts
// src/components/code-editor/hooks/useEditorSidebar.ts
// replace editingFile state with rightPaneTarget and keep width/expand logic intact
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/components/right-pane/utils/rightPaneRouting.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/right-pane/types.ts src/components/right-pane/utils/rightPaneRouting.ts src/components/right-pane/utils/rightPaneRouting.test.mjs src/components/code-editor/hooks/useEditorSidebar.ts
git commit -m "feat: add right pane routing model"
```

### Task 2: 接入统一 RightPane 容器并保持代码文件行为不回退

**Files:**
- Create: `src/components/right-pane/view/RightPane.tsx`
- Create: `src/components/right-pane/view/RightPaneContentRouter.tsx`
- Modify: `src/components/main-content/view/MainContent.tsx`
- Modify: `src/components/main-content/types/types.ts`
- Modify: `src/components/file-tree/view/FileTree.tsx`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import RightPane from './RightPane.tsx';

test('RightPane renders the browser shell when target type is browser', () => {
  const html = renderToStaticMarkup(
    <RightPane
      target={{ type: 'browser', url: 'http://localhost:5173', source: 'address-bar' }}
      isMobile={false}
      paneWidth={420}
      isExpanded={false}
      onClose={() => {}}
      onToggleExpand={() => {}}
      onResizeStart={() => {}}
      resizeHandleRef={{ current: null }}
    />,
  );

  assert.match(html, /data-right-pane-type="browser"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/components/right-pane/view/RightPane.test.mjs`
Expected: FAIL with component file not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/right-pane/view/RightPane.tsx
export default function RightPane({
  target,
  isMobile,
  paneWidth,
  isExpanded,
  resizeHandleRef,
  onResizeStart,
  onClose,
  onToggleExpand,
}) {
  if (!target) return null;

  return (
    <aside
      data-right-pane-type={target.type}
      className="relative flex h-full flex-col border-l border-border bg-background"
      style={isMobile || isExpanded ? undefined : { width: `${paneWidth}px` }}
    >
      <div ref={resizeHandleRef} onMouseDown={onResizeStart} className="absolute inset-y-0 left-0 w-1 cursor-col-resize" />
      <RightPaneContentRouter target={target} onClose={onClose} onToggleExpand={onToggleExpand} />
    </aside>
  );
}
```

```tsx
// src/components/right-pane/view/RightPaneContentRouter.tsx
import CodeEditor from '../../code-editor/view/CodeEditor';
import BrowserPane from './BrowserPane';
import MarkdownPane from './MarkdownPane';

export default function RightPaneContentRouter({ target, ...actions }) {
  if (target.type === 'browser') {
    return <BrowserPane target={target} {...actions} />;
  }
  if (target.type === 'markdown') {
    return <MarkdownPane target={target} {...actions} />;
  }
  return (
    <CodeEditor
      file={{
        name: target.fileName,
        path: target.filePath,
        projectName: target.projectName,
        diffInfo: target.diffInfo ?? null,
      }}
      isSidebar
      onClose={actions.onClose}
      onToggleExpand={actions.onToggleExpand}
      projectPath={target.projectName}
    />
  );
}
```

```tsx
// src/components/main-content/view/MainContent.tsx
// swap EditorSidebar usage for RightPane and pass handleFileOpen through unchanged
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/components/right-pane/view/RightPane.test.mjs`
Expected: PASS

- [ ] **Step 5: Run a focused regression check**

Run: `npx tsx --test src/components/right-pane/utils/rightPaneRouting.test.mjs src/components/right-pane/view/RightPane.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/right-pane/view/RightPane.tsx src/components/right-pane/view/RightPaneContentRouter.tsx src/components/main-content/view/MainContent.tsx src/components/main-content/types/types.ts src/components/file-tree/view/FileTree.tsx
git commit -m "feat: render unified right pane shell"
```

### Task 3: 将 Markdown 文件从代码视图分流到独立 Markdown 面板

**Files:**
- Create: `src/components/right-pane/view/MarkdownPane.tsx`
- Modify: `src/components/code-editor/view/CodeEditor.tsx`
- Modify: `src/components/code-editor/view/subcomponents/CodeEditorHeader.tsx`
- Test: `src/components/right-pane/view/MarkdownPane.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import MarkdownPane from './MarkdownPane.tsx';

test('MarkdownPane renders a markdown target with preview controls', () => {
  const html = renderToStaticMarkup(
    <MarkdownPane
      target={{ type: 'markdown', filePath: '/demo/readme.md', fileName: 'readme.md', projectName: 'demo' }}
      onClose={() => {}}
      onToggleExpand={() => {}}
    />,
  );

  assert.match(html, /readme\.md/);
  assert.match(html, /preview/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/components/right-pane/view/MarkdownPane.test.mjs`
Expected: FAIL with component file not found

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/right-pane/view/MarkdownPane.tsx
import CodeEditor from '../../code-editor/view/CodeEditor';

export default function MarkdownPane({ target, onClose, onToggleExpand }) {
  return (
    <CodeEditor
      file={{
        name: target.fileName,
        path: target.filePath,
        projectName: target.projectName,
      }}
      isSidebar
      onClose={onClose}
      onToggleExpand={onToggleExpand}
      projectPath={target.projectName}
    />
  );
}
```

```ts
// src/components/code-editor/view/CodeEditor.tsx
// allow markdown targets to default to preview mode when opened through RightPane
```

```tsx
// src/components/code-editor/view/subcomponents/CodeEditorHeader.tsx
// keep existing markdown preview toggle labels intact so MarkdownPane inherits current toolbar behavior
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/components/right-pane/view/MarkdownPane.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/right-pane/view/MarkdownPane.tsx src/components/code-editor/view/CodeEditor.tsx src/components/code-editor/view/subcomponents/CodeEditorHeader.tsx src/components/right-pane/view/MarkdownPane.test.mjs
git commit -m "feat: route markdown files through right pane"
```

### Task 4: 新增浏览器面板、地址栏与 html 文件预览解析

**Files:**
- Create: `src/components/right-pane/view/BrowserPane.tsx`
- Create: `src/components/right-pane/utils/htmlPreviewTarget.ts`
- Test: `src/components/right-pane/utils/htmlPreviewTarget.test.mjs`
- Test: `src/components/right-pane/view/BrowserPane.test.mjs`
- Modify: `src/components/code-editor/hooks/useEditorSidebar.ts`
- Modify: `src/components/file-tree/view/FileTree.tsx`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveHtmlPreviewTarget } from './htmlPreviewTarget.ts';

test('resolveHtmlPreviewTarget prefers an explicit dev server url', () => {
  const result = resolveHtmlPreviewTarget({
    filePath: '/workspace/public/help.html',
    projectPath: '/workspace',
    devServerUrl: 'http://localhost:5173',
  });

  assert.equal(result, 'http://localhost:5173/help.html');
});
```

```js
import { renderToStaticMarkup } from 'react-dom/server';
import BrowserPane from './BrowserPane.tsx';

test('BrowserPane renders navigation controls and the current url', () => {
  const html = renderToStaticMarkup(
    <BrowserPane
      target={{ type: 'browser', url: 'http://localhost:5173', source: 'address-bar' }}
      onClose={() => {}}
      onToggleExpand={() => {}}
    />,
  );

  assert.match(html, /localhost:5173/);
  assert.match(html, /Back|后退/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/components/right-pane/utils/htmlPreviewTarget.test.mjs src/components/right-pane/view/BrowserPane.test.mjs`
Expected: FAIL with module or component not found

- [ ] **Step 3: Write minimal implementation**

```ts
// src/components/right-pane/utils/htmlPreviewTarget.ts
export const resolveHtmlPreviewTarget = ({ filePath, projectPath, devServerUrl }) => {
  if (!devServerUrl) return null;
  const relativePath = filePath.replace(`${projectPath}/public`, '').replace(/\\/g, '/');
  return `${devServerUrl.replace(/\/$/, '')}${relativePath}`;
};
```

```tsx
// src/components/right-pane/view/BrowserPane.tsx
import { useState } from 'react';
import { normalizeBrowserUrl } from '../utils/rightPaneRouting';

export default function BrowserPane({ target }) {
  const [draftUrl, setDraftUrl] = useState(target.url);
  const [currentUrl, setCurrentUrl] = useState(target.url);

  const handleSubmit = (event) => {
    event.preventDefault();
    setCurrentUrl(normalizeBrowserUrl(draftUrl));
  };

  return (
    <section className="flex h-full flex-col">
      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-b border-border p-2">
        <button type="button">后退</button>
        <button type="button">前进</button>
        <button type="button">刷新</button>
        <input value={draftUrl} onChange={(event) => setDraftUrl(event.target.value)} className="flex-1 rounded-md border px-3 py-1.5" />
      </form>
      <div className="min-h-0 flex-1">
        <iframe title={currentUrl} src={currentUrl} className="h-full w-full border-0" />
      </div>
    </section>
  );
}
```

```ts
// src/components/code-editor/hooks/useEditorSidebar.ts
// when opening an html file, resolve preview url first and set browser target when available
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/components/right-pane/utils/htmlPreviewTarget.test.mjs src/components/right-pane/view/BrowserPane.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/right-pane/view/BrowserPane.tsx src/components/right-pane/utils/htmlPreviewTarget.ts src/components/right-pane/utils/htmlPreviewTarget.test.mjs src/components/right-pane/view/BrowserPane.test.mjs src/components/code-editor/hooks/useEditorSidebar.ts src/components/file-tree/view/FileTree.tsx
git commit -m "feat: add right pane browser preview"
```

### Task 5: 改造聊天 Markdown 链接和工具入口，统一走右侧浏览器

**Files:**
- Modify: `src/components/chat/view/subcomponents/Markdown.tsx`
- Modify: `src/components/chat/view/ChatInterface.tsx`
- Modify: `src/components/chat/types/types.ts`
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
- Modify: `src/components/chat/view/subcomponents/MessageComponent.tsx`
- Test: `src/components/chat/view/subcomponents/Markdown.link-routing.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown } from './Markdown.tsx';

test('Markdown links render with in-app browser routing instead of target blank', () => {
  const html = renderToStaticMarkup(
    <Markdown onOpenUrl={() => {}}>
      {'[Open](http://localhost:5173)'}
    </Markdown>,
  );

  assert.doesNotMatch(html, /target="_blank"/);
  assert.match(html, /data-open-in-right-pane="true"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/components/chat/view/subcomponents/Markdown.link-routing.test.mjs`
Expected: FAIL because Markdown does not accept onOpenUrl and still renders target blank

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/chat/view/subcomponents/Markdown.tsx
type MarkdownProps = {
  children: React.ReactNode;
  className?: string;
  onOpenUrl?: ((url: string) => void) | null;
};

const createMarkdownComponents = (onOpenUrl) => ({
  a: ({ href, children }) => (
    <a
      href={href}
      data-open-in-right-pane="true"
      className="text-blue-600 hover:underline dark:text-blue-400"
      onClick={(event) => {
        if (!href || !onOpenUrl) return;
        event.preventDefault();
        onOpenUrl(href);
      }}
    >
      {children}
    </a>
  ),
});
```

```tsx
// src/components/chat/view/ChatInterface.tsx
// add onOpenUrl prop and wire it to openUrlInRightPane
```

```ts
// src/components/chat/types/types.ts
onOpenUrl?: (url: string) => void;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/components/chat/view/subcomponents/Markdown.link-routing.test.mjs`
Expected: PASS

- [ ] **Step 5: Run focused message rendering tests**

Run: `npx tsx --test src/components/chat/view/subcomponents/providerSelectionContent.test.mjs src/components/chat/view/subcomponents/messageCollapse.test.mjs src/components/chat/view/subcomponents/Markdown.link-routing.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/view/subcomponents/Markdown.tsx src/components/chat/view/ChatInterface.tsx src/components/chat/types/types.ts src/components/chat/view/subcomponents/ChatMessagesPane.tsx src/components/chat/view/subcomponents/MessageComponent.tsx src/components/chat/view/subcomponents/Markdown.link-routing.test.mjs
git commit -m "feat: route chat links into right pane browser"
```

### Task 6: 验证、文案与回归保护

**Files:**
- Modify: `src/components/main-content/view/subcomponents/MainContentTabSwitcher.tsx`
- Modify: `src/types/app.ts`
- Modify: `src/i18n/locales/zh-CN/common.json`
- Modify: `package.json`

- [ ] **Step 1: Add the browser tab entry and localized label**

```ts
// src/types/app.ts
export type AppTab = 'chat' | 'files' | 'git' | 'preview';
```

```tsx
// src/components/main-content/view/subcomponents/MainContentTabSwitcher.tsx
const BASE_TABS = [
  { id: 'chat', labelKey: 'tabs.chat', icon: MessageSquare },
  { id: 'files', labelKey: 'tabs.files', icon: Folder },
  { id: 'git', labelKey: 'tabs.git', icon: GitBranch },
  { id: 'preview', labelKey: 'tabs.preview', icon: Globe },
];
```

```json
// src/i18n/locales/zh-CN/common.json
{
  "tabs": {
    "preview": "浏览器"
  }
}
```

- [ ] **Step 2: Run focused tests for main content and right pane routing**

Run: `npx tsx --test src/components/right-pane/utils/rightPaneRouting.test.mjs src/components/right-pane/view/RightPane.test.mjs src/components/right-pane/view/BrowserPane.test.mjs src/components/chat/view/subcomponents/Markdown.link-routing.test.mjs`
Expected: PASS

- [ ] **Step 3: Run the broader quality gate**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Manual sanity check**

Run:
1. 打开普通 `.ts` 文件，确认右侧仍是代码编辑器
2. 打开 `.md` 文件，确认右侧默认进入 Markdown 预览
3. 打开 `.html` 文件，确认右侧切到浏览器视图
4. 在聊天里点击 `http://localhost:5173`，确认右侧浏览器接管打开
5. 在右侧地址栏输入一个外网地址，确认可加载或给出嵌入失败提示

Expected: 五步都符合预期，没有导致原有文件打开流程失效

- [ ] **Step 6: Commit**

```bash
git add src/components/main-content/view/subcomponents/MainContentTabSwitcher.tsx src/types/app.ts src/i18n/locales/zh-CN/common.json package.json
git commit -m "test: verify right pane browser flow"
```
