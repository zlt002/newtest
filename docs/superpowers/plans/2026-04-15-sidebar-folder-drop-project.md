# Sidebar Folder Drop Project Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持将本地文件夹拖入侧边栏项目区，在确认后直接创建项目。

**Architecture:** 在侧边栏内容组件新增拖拽接收态和确认态；将拖拽目录解析逻辑抽到纯工具函数中进行测试；创建项目时复用现有 `createWorkspaceRequest`，成功后通过父层回调刷新并选中新项目。

**Tech Stack:** React, TypeScript, node:test, 现有 workspace API

---

### Task 1: 拖拽目录解析工具

**Files:**
- Create: `src/components/sidebar/utils/sidebarFolderDrop.ts`
- Test: `src/components/sidebar/utils/sidebarFolderDrop.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('returns the first dropped directory path when the drag payload contains a folder', async () => {
  const result = await extractDroppedFolder({
    dataTransfer: {
      items: [
        {
          kind: 'file',
          webkitGetAsEntry() {
            return { isDirectory: true, isFile: false, name: 'demo', fullPath: '/demo' };
          },
        },
      ],
    },
  });

  assert.deepEqual(result, { name: 'demo', path: '/demo' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/components/sidebar/utils/sidebarFolderDrop.test.mjs`
Expected: FAIL with module/function not found

- [ ] **Step 3: Write minimal implementation**

```ts
export async function extractDroppedFolder(eventLike) {
  const items = eventLike.dataTransfer?.items;
  // iterate items, pick first directory entry, return { name, path }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/components/sidebar/utils/sidebarFolderDrop.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/utils/sidebarFolderDrop.ts src/components/sidebar/utils/sidebarFolderDrop.test.mjs
git commit -m "test: cover sidebar folder drop parsing"
```

### Task 2: 侧边栏拖拽确认交互

**Files:**
- Modify: `src/components/sidebar/view/subcomponents/SidebarContent.tsx`
- Modify: `src/components/sidebar/view/Sidebar.tsx`
- Modify: `src/components/project-creation-wizard/data/workspaceApi.ts`

- [ ] **Step 1: Write the failing test**

```js
test('createDroppedProjectRequest creates an existing workspace from the dropped folder path', async () => {
  // mock api.createWorkspace and assert payload.workspaceType/path
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/components/sidebar/utils/sidebarFolderDrop.test.mjs`
Expected: FAIL because create helper does not exist

- [ ] **Step 3: Write minimal implementation**

```ts
export const createDroppedProjectRequest = (folderPath: string) =>
  createWorkspaceRequest({ workspaceType: 'existing', path: folderPath });
```

```tsx
// SidebarContent:
// add drag enter/over/leave/drop handlers
// add pending folder confirm card
// confirm calls parent callback and clears local state
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/components/sidebar/utils/sidebarFolderDrop.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/view/subcomponents/SidebarContent.tsx src/components/sidebar/view/Sidebar.tsx src/components/project-creation-wizard/data/workspaceApi.ts
git commit -m "feat: support sidebar folder drop project creation"
```

### Task 3: 验证与回归保护

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add new tests to the project test script**

```json
"src/components/sidebar/utils/sidebarFolderDrop.test.mjs"
```

- [ ] **Step 2: Run focused tests**

Run: `npx tsx --test src/components/sidebar/utils/sidebarFolderDrop.test.mjs`
Expected: PASS

- [ ] **Step 3: Run typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: PASS

- [ ] **Step 4: Sanity check the UI flow manually**

Run: drag a folder into the sidebar project area in the local app
Expected: highlight appears, confirm card opens, confirm creates project

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "test: cover sidebar project drop flow"
```
