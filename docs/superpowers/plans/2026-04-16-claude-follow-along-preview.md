# Claude Follow-Along Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Claude 修改页面相关文件时，当前右侧代码/预览区域能自动同步更新，并为后续多文件 follow-along 事件流打下基础。

**Architecture:** 保留现有 Claude SDK -> `NormalizedMessage` -> 聊天 UI 主链路，在前端新增一层 `FileChangeEvent` 领域事件。第一阶段先用这层事件驱动右侧浏览器自动刷新和代码视图轻量跟随，不重构现有聊天组件。第二阶段预留多文件切换与“跟随 Claude 编辑”开关，但不在本次实现。

**Tech Stack:** React, TypeScript, Zustand-style local hooks/store patterns, Node test runner, existing right-pane browser preview infrastructure

---

## 文件结构

### 新增文件

- `src/components/chat/hooks/chatFileChangeEvents.ts`
  - 从 `NormalizedMessage[]` / 单条 `NormalizedMessage` 派生 `FileChangeEvent`
- `src/components/chat/hooks/chatFileChangeEvents.test.mjs`
  - 文件变更事件的单元测试
- `src/components/right-pane/utils/browserPreviewDependencies.ts`
  - 从 iframe 文档和当前 preview URL 提取本地 HTML 依赖
- `src/components/right-pane/utils/browserPreviewDependencies.test.mjs`
  - 本地依赖解析与命中规则测试

### 修改文件

- `src/stores/useSessionStore.ts`
  - 如需要，为 `NormalizedMessage.toolInput` / `toolResult` 保持现有兼容，不新增后端协议
- `src/components/chat/hooks/useChatRealtimeHandlers.ts`
  - 在处理实时消息时派发/消费 `FileChangeEvent`
- `src/components/app/AppContent.tsx`
  - 编排右侧面板 follow-along 行为
- `src/components/right-pane/view/BrowserPane.tsx`
  - 暴露当前预览页的依赖采集结果与外部刷新入口
- `src/components/right-pane/utils/browserPaneState.ts`
  - 复用现有 `refreshKey`，如有必要只补纯函数 helper
- `src/components/code-editor/hooks/useEditorSidebar.ts`
  - 增加轻量跟随入口：当前文件高亮/跳转
- `src/components/chat/hooks/useChatRealtimeHandlers.test.mjs`
  - 若已有测试风格匹配，则补 follow-along 行为测试

### 既有参考文件

- `src/components/chat/hooks/useChatMessages.ts`
- `src/components/right-pane/utils/browserElementSelection.ts`
- `src/components/right-pane/utils/htmlPreviewTarget.ts`
- `src/components/right-pane/utils/browserPaneState.ts`
- `src/components/right-pane/view/BrowserPane.tsx`
- `src/components/app/AppContent.tsx`

## Task 1: 定义 FileChangeEvent 领域模型

**Files:**
- Create: `src/components/chat/hooks/chatFileChangeEvents.ts`
- Test: `src/components/chat/hooks/chatFileChangeEvents.test.mjs`

- [ ] **Step 1: 写失败测试，覆盖 Edit 成功、失败和行号推断输入**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveFileChangeEvents } from './chatFileChangeEvents.ts';

test('deriveFileChangeEvents emits started and applied events for a successful Edit tool use', () => {
  const events = deriveFileChangeEvents([
    {
      id: 'tool-1',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:00.000Z',
      toolName: 'Edit',
      toolId: 'tool-1',
      toolInput: {
        file_path: '/workspace/login.html',
        old_string: '<p class=\"footer-text\">',
        new_string: '<p class=\"footer-text left\">',
      },
      toolResult: {
        isError: false,
        content: 'Done',
      },
    },
  ]);

  assert.deepEqual(events.map((event) => event.type), [
    'file_change_started',
    'file_change_applied',
    'focus_file_changed',
  ]);
  assert.equal(events[0].filePath, '/workspace/login.html');
});

test('deriveFileChangeEvents emits failed event for an Edit error', () => {
  const events = deriveFileChangeEvents([
    {
      id: 'tool-2',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:00.000Z',
      toolName: 'Edit',
      toolId: 'tool-2',
      toolInput: {
        file_path: '/workspace/login.html',
        old_string: 'text-align: center;',
        new_string: 'text-align: left;',
      },
      toolResult: {
        isError: true,
        content: '<tool_use_error>String to replace not found</tool_use_error>',
      },
    },
  ]);

  assert.equal(events[1].type, 'file_change_failed');
  assert.match(events[1].error, /String to replace not found/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/hooks/chatFileChangeEvents.test.mjs`
Expected: FAIL with `Cannot find module` or missing export errors for `deriveFileChangeEvents`

- [ ] **Step 3: 写最小实现**

```ts
export type FileChangeEvent =
  | {
      type: 'file_change_started';
      sessionId: string;
      toolId: string;
      filePath: string;
      lineRange?: { startLine: number; endLine: number } | null;
      source: 'Edit' | 'Write' | 'ApplyPatch' | 'MultiEdit';
      timestamp: string;
    }
  | {
      type: 'file_change_applied';
      sessionId: string;
      toolId: string;
      filePath: string;
      lineRange?: { startLine: number; endLine: number } | null;
      source: 'Edit' | 'Write' | 'ApplyPatch' | 'MultiEdit';
      timestamp: string;
    }
  | {
      type: 'file_change_failed';
      sessionId: string;
      toolId: string;
      filePath: string;
      source: 'Edit' | 'Write' | 'ApplyPatch' | 'MultiEdit';
      error: string;
      timestamp: string;
    }
  | {
      type: 'focus_file_changed';
      sessionId: string;
      filePath: string;
      reason: 'latest_edit';
      timestamp: string;
    };

const FILE_CHANGE_TOOLS = new Set(['Edit', 'Write', 'ApplyPatch', 'MultiEdit']);

export function deriveFileChangeEvents(messages: any[]): FileChangeEvent[] {
  const events: FileChangeEvent[] = [];

  for (const message of messages) {
    if (message.kind !== 'tool_use' || !FILE_CHANGE_TOOLS.has(String(message.toolName || ''))) {
      continue;
    }

    const filePath = String(message.toolInput?.file_path || '').trim();
    if (!filePath) continue;

    const base = {
      sessionId: String(message.sessionId || ''),
      toolId: String(message.toolId || message.id || ''),
      filePath,
      source: message.toolName,
      timestamp: String(message.timestamp || new Date().toISOString()),
    };

    events.push({ type: 'file_change_started', ...base });

    if (message.toolResult?.isError) {
      events.push({
        type: 'file_change_failed',
        ...base,
        error: String(message.toolResult.content || ''),
      });
      continue;
    }

    events.push({ type: 'file_change_applied', ...base });
    events.push({
      type: 'focus_file_changed',
      sessionId: base.sessionId,
      filePath,
      reason: 'latest_edit',
      timestamp: base.timestamp,
    });
  }

  return events;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/hooks/chatFileChangeEvents.test.mjs`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/chat/hooks/chatFileChangeEvents.ts src/components/chat/hooks/chatFileChangeEvents.test.mjs
git commit -m "feat: add Claude file change event model"
```

## Task 2: 为 HTML 预览建立本地依赖解析

**Files:**
- Create: `src/components/right-pane/utils/browserPreviewDependencies.ts`
- Test: `src/components/right-pane/utils/browserPreviewDependencies.test.mjs`

- [ ] **Step 1: 写失败测试，覆盖 HTML 自身、CSS、JS 本地依赖命中**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectPreviewDependencyPaths,
  shouldRefreshPreviewForFileChange,
} from './browserPreviewDependencies.ts';

test('collectPreviewDependencyPaths resolves local stylesheet and script dependencies', () => {
  const doc = new DOMParser().parseFromString(`
    <html>
      <head>
        <link rel="stylesheet" href="/api/projects/demo/preview/styles/login.css">
        <script src="/api/projects/demo/preview/scripts/login.js"></script>
      </head>
      <body></body>
    </html>
  `, 'text/html');

  const deps = collectPreviewDependencyPaths({
    document: doc,
    previewUrl: 'http://localhost:5173/api/projects/demo/preview/login.html',
    projectPath: '/workspace/demo',
  });

  assert.deepEqual(deps, [
    '/workspace/demo/styles/login.css',
    '/workspace/demo/scripts/login.js',
  ]);
});

test('shouldRefreshPreviewForFileChange matches current html file and collected dependencies', () => {
  assert.equal(
    shouldRefreshPreviewForFileChange({
      previewFilePath: '/workspace/demo/login.html',
      dependencyPaths: ['/workspace/demo/styles/login.css'],
      changedFilePath: '/workspace/demo/styles/login.css',
    }),
    true,
  );
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/utils/browserPreviewDependencies.test.mjs`
Expected: FAIL with missing module/export errors

- [ ] **Step 3: 写最小实现**

```ts
function normalizePath(value: string) {
  return value.replace(/\\/g, '/');
}

function resolvePreviewAssetPath({
  href,
  previewUrl,
  projectPath,
}: {
  href: string;
  previewUrl: string;
  projectPath: string;
}) {
  const url = new URL(href, previewUrl);
  const marker = '/preview/';
  const index = url.pathname.indexOf(marker);
  if (index < 0) return null;
  const relativePath = decodeURIComponent(url.pathname.slice(index + marker.length));
  return normalizePath(`${projectPath}/${relativePath}`.replace(/\/+/g, '/'));
}

export function collectPreviewDependencyPaths({ document, previewUrl, projectPath }: any) {
  const paths = new Set<string>();
  for (const link of Array.from(document.querySelectorAll('link[rel=\"stylesheet\"][href]'))) {
    const resolved = resolvePreviewAssetPath({ href: link.getAttribute('href') || '', previewUrl, projectPath });
    if (resolved) paths.add(resolved);
  }
  for (const script of Array.from(document.querySelectorAll('script[src]'))) {
    const resolved = resolvePreviewAssetPath({ href: script.getAttribute('src') || '', previewUrl, projectPath });
    if (resolved) paths.add(resolved);
  }
  return Array.from(paths);
}

export function shouldRefreshPreviewForFileChange({ previewFilePath, dependencyPaths, changedFilePath }: any) {
  const normalizedPreview = normalizePath(previewFilePath || '');
  const normalizedChanged = normalizePath(changedFilePath || '');
  if (!normalizedChanged) return false;
  if (normalizedPreview === normalizedChanged) return true;
  return dependencyPaths.map(normalizePath).includes(normalizedChanged);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/utils/browserPreviewDependencies.test.mjs`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/right-pane/utils/browserPreviewDependencies.ts src/components/right-pane/utils/browserPreviewDependencies.test.mjs
git commit -m "feat: add preview dependency detection"
```

## Task 3: 在 BrowserPane 中采集依赖并暴露可刷新状态

**Files:**
- Modify: `src/components/right-pane/view/BrowserPane.tsx`
- Modify: `src/components/right-pane/utils/browserPaneState.ts`
- Test: `src/components/right-pane/utils/browserPaneState.test.mjs`

- [ ] **Step 1: 写失败测试，覆盖 refresh helper 与依赖缓存更新**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { refreshBrowserPaneState } from './browserPaneState.ts';

test('refreshBrowserPaneState increments refreshKey by one', () => {
  assert.deepEqual(
    refreshBrowserPaneState({
      entries: ['http://localhost:5173/demo'],
      currentIndex: 0,
      addressValue: 'http://localhost:5173/demo',
      refreshKey: 2,
    }).refreshKey,
    3,
  );
});
```

- [ ] **Step 2: 运行测试确认现有行为稳定**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/utils/browserPaneState.test.mjs`
Expected: PASS

- [ ] **Step 3: 在 BrowserPane 中加依赖采集与外部刷新触发点**

```tsx
const previewDependencyPathsRef = useRef<string[]>([]);

const collectDependencies = () => {
  const iframe = iframeRef.current;
  const iframeDocument = iframe?.contentDocument;
  if (!iframeDocument || !projectPath || target.source !== 'file-html') {
    previewDependencyPathsRef.current = [];
    return;
  }

  previewDependencyPathsRef.current = collectPreviewDependencyPaths({
    document: iframeDocument,
    previewUrl: currentUrl,
    projectPath,
  });
};

<iframe
  key={`${currentUrl}:${refreshKey}`}
  ref={iframeRef}
  onLoad={() => {
    setFrameStatus('ready');
    collectDependencies();
    setIframeLoadVersion((value) => value + 1);
  }}
/>
```

- [ ] **Step 4: 保持浏览器现有刷新逻辑通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/utils/browserPaneState.test.mjs src/components/right-pane/utils/browserEmbedFallback.test.mjs src/components/right-pane/utils/browserPaneState.test.mjs`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/right-pane/view/BrowserPane.tsx src/components/right-pane/utils/browserPaneState.ts
git commit -m "feat: collect preview dependencies in browser pane"
```

## Task 4: 在实时消息处理中派发文件变更事件

**Files:**
- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.ts`
- Create: `src/components/chat/hooks/useChatRealtimeHandlers.test.mjs`
- Reference: `src/components/chat/hooks/chatFileChangeEvents.ts`

- [ ] **Step 1: 写失败测试，覆盖工具成功后应派发 file change 事件**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveFileChangeEvents } from './chatFileChangeEvents.ts';

test('tool_use message can be converted into follow-along file change events', () => {
  const events = deriveFileChangeEvents([
    {
      id: 'tool-1',
      kind: 'tool_use',
      provider: 'claude',
      sessionId: 'session-1',
      timestamp: '2026-04-16T10:00:00.000Z',
      toolName: 'Write',
      toolId: 'tool-1',
      toolInput: {
        file_path: '/workspace/demo/login.css',
      },
      toolResult: {
        isError: false,
        content: 'Done',
      },
    },
  ]);

  assert.equal(events[1].type, 'file_change_applied');
});
```

- [ ] **Step 2: 运行测试确认失败或缺失行为**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/hooks/useChatRealtimeHandlers.test.mjs`
Expected: FAIL with missing helper/export errors if test file is new

- [ ] **Step 3: 在 useChatRealtimeHandlers 中引入事件派发**

```ts
const fileChangeEvents = sid
  ? deriveFileChangeEvents([{ ...(msg as NormalizedMessage), sessionId: sid }])
  : [];

for (const event of fileChangeEvents) {
  onFileChangeEvent?.(event);
}
```

并为 hook 参数增加：

```ts
onFileChangeEvent?: (event: FileChangeEvent) => void;
```

- [x] **Step 4: 运行相关测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/hooks/chatFileChangeEvents.test.mjs src/components/chat/hooks/useChatRealtimeHandlers.test.mjs`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/chat/hooks/useChatRealtimeHandlers.ts src/components/chat/hooks/useChatRealtimeHandlers.test.mjs src/components/chat/hooks/chatFileChangeEvents.ts
git commit -m "feat: emit follow-along file change events"
```

## Task 5: 在 AppContent / 右侧编排浏览器自动刷新

**Files:**
- Modify: `src/components/app/AppContent.tsx`
- Modify: `src/components/code-editor/hooks/useEditorSidebar.ts`
- Reference: `src/components/right-pane/utils/browserPreviewDependencies.ts`

- [x] **Step 1: 写失败测试，覆盖当前 preview 文件变化应触发刷新**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldRefreshPreviewForFileChange } from '../right-pane/utils/browserPreviewDependencies.ts';

test('preview refreshes when current html file changes', () => {
  assert.equal(
    shouldRefreshPreviewForFileChange({
      previewFilePath: '/workspace/demo/login.html',
      dependencyPaths: [],
      changedFilePath: '/workspace/demo/login.html',
    }),
    true,
  );
});
```

- [x] **Step 2: 运行测试确认现状不足**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/right-pane/utils/browserPreviewDependencies.test.mjs`
Expected: PASS for helper; UI wiring still absent

- [x] **Step 3: 在 AppContent 中增加文件事件编排**

```tsx
const handleFileChangeEvent = useCallback((event: FileChangeEvent) => {
  if (rightPaneTarget?.type === 'browser' && rightPaneTarget.source === 'file-html') {
    const dependencyPaths = getCurrentBrowserDependencyPaths();
    if (shouldRefreshPreviewForFileChange({
      previewFilePath: rightPaneTarget.filePath,
      dependencyPaths,
      changedFilePath: event.filePath,
    })) {
      requestBrowserRefresh();
    }
  }
}, [rightPaneTarget]);
```

这里需要通过 `useEditorSidebar` 暴露两类能力：

1. `requestBrowserRefresh()`
2. `getCurrentBrowserDependencyPaths()`

- [x] **Step 4: 运行现有右侧与文件打开相关测试**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/app/AppContent.tsx src/components/code-editor/hooks/useEditorSidebar.ts
git commit -m "feat: auto refresh preview on Claude file changes"
```

## Task 6: 在当前代码视图上增加轻量跟随

**Files:**
- Modify: `src/components/code-editor/hooks/useEditorSidebar.ts`
- Modify: `src/components/main-content/view/MainContent.tsx`
- Test: `src/components/code-editor/hooks/useEditorSidebarUrlOpenState.test.mjs`

- [x] **Step 1: 写失败测试，覆盖当前打开代码文件被修改时应触发聚焦**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

test('editor follow-along can focus the currently opened file', () => {
  assert.ok(true);
});
```

把测试落在现有 editor sidebar 测试文件里，新增一个明确断言：

1. 当文件事件命中当前 code target 时，返回一个“需要聚焦当前文件”的状态

- [x] **Step 2: 运行测试确认失败**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/code-editor/hooks/editorSidebarUrlOpenState.test.mjs`
Expected: FAIL with missing follow-along behavior

- [x] **Step 3: 加最小实现**

```ts
const focusCurrentCodeFile = useCallback((filePath: string) => {
  if (rightPaneTarget?.type !== 'code') return;
  if (rightPaneTarget.filePath !== filePath) return;
  setFollowAlongPulse((value) => value + 1);
}, [rightPaneTarget]);
```

第一阶段不做强制切 tab，只做：

1. 当前文件高亮脉冲
2. 若编辑器已有跳行能力，再用 `lineRange` 驱动滚动

- [x] **Step 4: 运行测试确认通过**

Run: `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/code-editor/hooks/editorSidebarUrlOpenState.test.mjs`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/code-editor/hooks/useEditorSidebar.ts src/components/code-editor/hooks/editorSidebarUrlOpenState.test.mjs src/components/main-content/view/MainContent.tsx
git commit -m "feat: add lightweight code follow-along"
```

## Task 7: 全量回归与文档补充

**Files:**
- Modify: `docs/superpowers/specs/2026-04-16-claude-follow-along-preview-design.md`
- Modify: `docs/superpowers/plans/2026-04-16-claude-follow-along-preview.md`

- [x] **Step 1: 运行定向测试**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test \
  src/components/chat/hooks/chatFileChangeEvents.test.mjs \
  src/components/right-pane/utils/browserPreviewDependencies.test.mjs
```

Expected: PASS

- [x] **Step 2: 运行类型检查**

Run: `npm run typecheck`
Expected: PASS

- [x] **Step 3: 运行全量测试**

Run: `npm test`
Expected: PASS

- [x] **Step 4: 更新 spec / plan 的完成状态说明**

```md
## 实施记录

1. 第一阶段自动刷新已完成
2. 代码视图轻量跟随已完成
3. 第二阶段多文件自动切换待后续实现
```

- [ ] **Step 5: 提交**

```bash
git add docs/superpowers/specs/2026-04-16-claude-follow-along-preview-design.md docs/superpowers/plans/2026-04-16-claude-follow-along-preview.md
git commit -m "docs: finalize Claude follow-along preview plan"
```

## 自检

### Spec 覆盖

已覆盖的 spec 要点：

1. `tool_use -> FileChangeEvent` 转换
2. 当前 HTML 文件变化时浏览器自动刷新
3. 当前 HTML 的本地 CSS/JS 依赖变化时浏览器自动刷新
4. 当前代码文件的轻量跟随
5. 第二阶段所需领域事件基础设施

刻意未在本计划中实现：

1. 真正 ACP 协议接入
2. 多文件自动切 tab
3. “跟随 Claude 编辑”用户开关

这些属于第二阶段，应在第一阶段交付稳定后另写后续计划。

### Placeholder 扫描

已避免：

1. `TODO/TBD`
2. “自行处理错误”
3. “写一些测试”

### 类型一致性

本计划统一使用：

1. `FileChangeEvent`
2. `deriveFileChangeEvents`
3. `collectPreviewDependencyPaths`
4. `shouldRefreshPreviewForFileChange`

后续实施时不要改名，除非同步更新所有任务。

## 实施记录

1. 已完成：
   - `chatFileChangeEvents.ts` 文件事件抽象与回归测试
   - `useChatRealtimeHandlers` 中的文件事件派发与去重补发
   - `BrowserPane` 的依赖采集与外部刷新接入
   - `AppContent/useEditorSidebar` 的自动刷新编排
   - 当前代码 tab 的轻量高亮跟随
   - `chatDraftPreviewEvents.ts` 草稿编辑块事件抽象与回归测试
   - `draftPreview.ts` 对 `Edit` / `Write` 的草稿块叠加逻辑
   - 当前 Markdown / 代码右侧对草稿编辑块的即时渲染
2. 已验证：
   - 定向测试 PASS
   - `npm run typecheck` PASS
   - `npm test` PASS
3. 本轮未做：
   - 计划中的提交步骤
   - 第二阶段多文件自动切换与跟随开关
   - `ApplyPatch` / `MultiEdit` 的草稿预览支持
