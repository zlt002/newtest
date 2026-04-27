# Scrollbar Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `cc-ui` 全项目建立统一的细窄滚动条视觉与交互规则，默认弱化显示，在鼠标进入或键盘聚焦滚动容器时显示，并把 `ScrollArea` 强化为标准滚动容器入口。

**Architecture:** 先在 `src/index.css` 中增加全局滚动条设计令牌和兼容规则，让大多数原生滚动容器立即吃到统一视觉；再增强 `src/shared/view/ui/ScrollArea.tsx`，给标准滚动容器加上统一标识、焦点触发与可扩展入口；最后对几个高频区域补挂统一 class，确保聊天区、右侧预览区、设置页与弹窗等场景都稳定命中样式。

**Tech Stack:** React 18、TypeScript、Tailwind CSS、PostCSS、Node `--test`

---

## File Map

- Modify: `src/index.css`
  - 增加滚动条主题变量、浅色/深色滚动条配色、WebKit/Firefox 兼容规则、hover/focus-within 可见性规则。
- Modify: `src/index.css.test.mjs`
  - 为新的滚动条变量和关键选择器增加 CSS 构建断言。
- Modify: `src/shared/view/ui/ScrollArea.tsx`
  - 为标准滚动容器增加 `data-scroll-container` / `ui-scrollbar` 挂载点，保证 `focus-within` 可见性和触摸滚动不回退。
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
  - 为聊天主滚动区显式挂统一滚动条 class，降低全局选择器误伤风险。
- Modify: `src/components/code-editor/view/subcomponents/CodeEditorSurface.tsx`
  - 为右侧 HTML / Markdown 预览滚动区显式挂统一滚动条 class。
- Modify: `src/components/settings/view/Settings.tsx`
  - 为设置页主内容滚动区显式挂统一滚动条 class。
- Modify: `src/components/task-master/view/TaskMasterPanel.tsx`
  - 为任务面板主滚动区显式挂统一滚动条 class。
- Modify: `src/components/task-master/view/TaskDetailModal.tsx`
  - 为任务详情弹窗滚动区显式挂统一滚动条 class。
- Verify only: `src/components/sidebar/view/subcomponents/SidebarContent.tsx`
  - 已使用 `ScrollArea`，确认增强后自动继承统一样式，无需额外结构调整。
- Verify only: `src/components/file-tree/view/FileTree.tsx`
  - 已使用 `ScrollArea`，确认增强后自动继承统一样式，无需额外结构调整。

### Task 1: 锁定滚动条样式契约

**Files:**
- Modify: `src/index.css.test.mjs`
- Test: `src/index.css.test.mjs`

- [ ] **Step 1: 写出失败中的 CSS 断言，锁定滚动条变量和关键选择器**

```js
test('scrollbar theming rules survive Tailwind expansion', async () => {
  const css = await buildIndexCss();

  assert.match(
    css,
    /--scrollbar-size:\s*6px/,
  );
  assert.match(
    css,
    /\[data-scroll-container\][\s\S]*scrollbar-width:\s*thin/,
  );
  assert.match(
    css,
    /\[data-scroll-container\]:hover::-webkit-scrollbar-thumb[\s\S]*background-color:/,
  );
  assert.match(
    css,
    /\[data-scroll-container\]:focus-within::-webkit-scrollbar-thumb[\s\S]*background-color:/,
  );
});
```

- [ ] **Step 2: 运行单测确认它先失败**

Run: `node --test src/index.css.test.mjs`

Expected: FAIL，提示缺少 `--scrollbar-size` 或缺少 `data-scroll-container` 对应的滚动条样式选择器。

- [ ] **Step 3: 如果测试文件需要，补一个避免重复的辅助注释块，保持现有结构不散**

```js
// Scrollbar theming assertions protect the global hidden-until-hover/focus behavior.
test('scrollbar theming rules survive Tailwind expansion', async () => {
  // ...
});
```

- [ ] **Step 4: 再跑一次单测，确认当前仍然失败且失败信息集中在滚动条规则缺失**

Run: `node --test src/index.css.test.mjs`

Expected: FAIL，且不出现其他无关语法错误。

- [ ] **Step 5: 提交这一小步**

```bash
git add src/index.css.test.mjs
git commit -m "test: lock scrollbar styling contract"
```

### Task 2: 实现全局滚动条规则并增强 ScrollArea

**Files:**
- Modify: `src/index.css`
- Modify: `src/shared/view/ui/ScrollArea.tsx`
- Test: `src/index.css.test.mjs`

- [ ] **Step 1: 在 `src/index.css` 中添加滚动条设计令牌**

```css
:root {
  --scrollbar-size: 6px;
  --scrollbar-radius: 999px;
  --scrollbar-track: transparent;
  --scrollbar-thumb: hsl(215 16% 47% / 0.14);
  --scrollbar-thumb-hover: hsl(215 16% 47% / 0.32);
  --scrollbar-thumb-active: hsl(215 16% 47% / 0.42);
}

.dark {
  --scrollbar-track: transparent;
  --scrollbar-thumb: hsl(215 20% 65% / 0.16);
  --scrollbar-thumb-hover: hsl(215 20% 65% / 0.34);
  --scrollbar-thumb-active: hsl(215 20% 65% / 0.46);
}
```

- [ ] **Step 2: 在 `src/index.css` 中加入统一滚动条规则，默认隐藏、hover/focus-within 显示**

```css
[data-scroll-container],
.ui-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}

[data-scroll-container]::-webkit-scrollbar,
.ui-scrollbar::-webkit-scrollbar {
  width: var(--scrollbar-size);
  height: var(--scrollbar-size);
}

[data-scroll-container]::-webkit-scrollbar-track,
.ui-scrollbar::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
}

[data-scroll-container]::-webkit-scrollbar-thumb,
.ui-scrollbar::-webkit-scrollbar-thumb {
  border-radius: var(--scrollbar-radius);
  background-color: transparent;
}

[data-scroll-container]:hover,
[data-scroll-container]:focus-within,
.ui-scrollbar:hover,
.ui-scrollbar:focus-within {
  scrollbar-color: var(--scrollbar-thumb-hover) var(--scrollbar-track);
}

[data-scroll-container]:hover::-webkit-scrollbar-thumb,
[data-scroll-container]:focus-within::-webkit-scrollbar-thumb,
.ui-scrollbar:hover::-webkit-scrollbar-thumb,
.ui-scrollbar:focus-within::-webkit-scrollbar-thumb {
  background-color: var(--scrollbar-thumb-hover);
}

[data-scroll-container]:active::-webkit-scrollbar-thumb,
.ui-scrollbar:active::-webkit-scrollbar-thumb {
  background-color: var(--scrollbar-thumb-active);
}
```

- [ ] **Step 3: 增强 `ScrollArea`，给内层滚动视口加统一标识**

```tsx
const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, ...props }, ref) => (
    <div className={cn(className, 'group relative overflow-hidden')} {...props}>
      <div
        ref={ref}
        data-scroll-container="true"
        className="ui-scrollbar h-full w-full overflow-auto rounded-[inherit]"
        style={{
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
        }}
      >
        {children}
      </div>
    </div>
  ),
);
```

- [ ] **Step 4: 运行 CSS 测试，确认新规则已通过**

Run: `node --test src/index.css.test.mjs`

Expected: PASS，包含新加的滚动条规则断言。

- [ ] **Step 5: 做一次构建验证，确保 CSS 没引入语法问题**

Run: `npm run build`

Expected: 构建成功，且输出中不包含 `[css-syntax-error]`。

- [ ] **Step 6: 提交这一小步**

```bash
git add src/index.css src/shared/view/ui/ScrollArea.tsx src/index.css.test.mjs
git commit -m "feat: add unified scrollbar styling"
```

### Task 3: 给高频原生滚动区显式接入统一滚动条类并回归验证

**Files:**
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.tsx`
- Modify: `src/components/code-editor/view/subcomponents/CodeEditorSurface.tsx`
- Modify: `src/components/settings/view/Settings.tsx`
- Modify: `src/components/task-master/view/TaskMasterPanel.tsx`
- Modify: `src/components/task-master/view/TaskDetailModal.tsx`
- Verify only: `src/components/sidebar/view/subcomponents/SidebarContent.tsx`
- Verify only: `src/components/file-tree/view/FileTree.tsx`
- Test: `src/index.css.test.mjs`

- [ ] **Step 1: 为聊天消息主滚动容器补统一类名**

```tsx
<div
  ref={messagesContainerRef}
  data-scroll-container="true"
  className="ui-scrollbar relative flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-0 py-3 sm:space-y-4 sm:p-4"
>
```

- [ ] **Step 2: 为右侧源码/预览滚动容器补统一类名**

```tsx
<div
  ref={previewViewportRef}
  data-scroll-container="true"
  className="ui-scrollbar h-full overflow-y-auto bg-white dark:bg-gray-900"
>
```

- [ ] **Step 3: 为设置页和任务面板滚动容器补统一类名**

```tsx
<main
  data-scroll-container="true"
  className="ui-scrollbar flex-1 overflow-y-auto"
>
```

```tsx
<div
  data-scroll-container="true"
  className="ui-scrollbar flex-1 overflow-y-auto p-4"
>
```

- [ ] **Step 4: 为任务详情弹窗滚动容器补统一类名**

```tsx
<div
  data-scroll-container="true"
  className="ui-scrollbar flex-1 space-y-6 overflow-y-auto p-4 md:p-6"
>
```

- [ ] **Step 5: 验证已使用 `ScrollArea` 的侧边栏和文件树无需额外改结构**

Run: `rg -n "ScrollArea" src/components/sidebar/view/subcomponents/SidebarContent.tsx src/components/file-tree/view/FileTree.tsx`

Expected: 两个文件都已直接使用 `ScrollArea`，因此在 `ScrollArea` 增强后自动获得统一滚动条行为。

- [ ] **Step 6: 运行定向测试与构建验证**

Run: `node --test src/index.css.test.mjs`

Expected: PASS

Run: `npm run build`

Expected: 构建成功，无 CSS 语法警告。

- [ ] **Step 7: 手动回归高频界面**

Run: `npm run client`

Expected:
- 聊天消息区默认滚动条很淡，鼠标进入显示
- 右侧预览区默认滚动条很淡，聚焦表单后显示
- 设置页和任务详情弹窗 hover / focus-within 都能看到细窄滚动条
- 文件树和左侧项目列表通过 `ScrollArea` 自动继承统一风格

- [ ] **Step 8: 提交这一小步**

```bash
git add \
  src/components/chat/view/subcomponents/ChatMessagesPane.tsx \
  src/components/code-editor/view/subcomponents/CodeEditorSurface.tsx \
  src/components/settings/view/Settings.tsx \
  src/components/task-master/view/TaskMasterPanel.tsx \
  src/components/task-master/view/TaskDetailModal.tsx
git commit -m "feat: apply unified scrollbar styling to core panels"
```

## Self-Review

- Spec coverage:
  - 全局统一样式：Task 2
  - `ScrollArea` 强化：Task 2
  - 首轮高频区域接入：Task 3
  - hover / focus-within 规则与深浅主题变量：Task 2
  - 构建与手动回归：Task 2、Task 3
- Placeholder scan:
  - 无 `TODO`、`TBD`、`later` 等占位词。
- Type consistency:
  - 统一使用 `data-scroll-container="true"` 与 `ui-scrollbar` 两个挂载点，避免后续任务命名漂移。
