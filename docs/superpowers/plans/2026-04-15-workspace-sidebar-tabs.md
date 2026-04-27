# Workspace Sidebar Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将左侧区域升级为统一的三态工作台，在桌面端和移动端都支持 `项目 / 文件 / 版本` 一级切换，并在左侧内容区挂接现有项目列表、文件树和 Git 面板。

**Architecture:** 以现有 [Sidebar.tsx](/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/sidebar/view/Sidebar.tsx) 为外层容器，新增 `workspaceView` 一级状态和独立 tab 配置文件，让 [SidebarHeader.tsx](/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/sidebar/view/subcomponents/SidebarHeader.tsx) 渲染 `logo + workspace tabs + tab 专属工具栏`，再由 [SidebarContent.tsx](/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/sidebar/view/subcomponents/SidebarContent.tsx) 按视图分发到项目列表、[FileTree.tsx](/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/file-tree/view/FileTree.tsx) 与 [GitPanel.tsx](/Users/zhanglt21/Desktop/ccui0414/cc-ui/src/components/git-panel/view/GitPanel.tsx)。第一阶段尽量保留 `FileTree` 和 `GitPanel` 内部逻辑，仅补充左栏嵌入所需的轻量 header / empty state / sidebar mode 开关。

**Tech Stack:** React 18、TypeScript、lucide-react、node:test、现有 i18n JSON 资源、Tailwind 工具类。

---

## File Map

**Create:**
- `src/components/sidebar/view/subcomponents/sidebarWorkspace.shared.ts`
- `src/components/sidebar/view/subcomponents/sidebarWorkspace.test.mjs`
- `src/components/sidebar/view/subcomponents/SidebarWorkspaceTabs.tsx`

**Modify:**
- `src/components/sidebar/view/Sidebar.tsx`
- `src/components/sidebar/types/types.ts`
- `src/components/sidebar/view/subcomponents/SidebarHeader.tsx`
- `src/components/sidebar/view/subcomponents/SidebarContent.tsx`
- `src/components/sidebar/view/subcomponents/SidebarFooter.tsx`
- `src/components/file-tree/view/FileTree.tsx`
- `src/components/file-tree/view/FileTreeHeader.tsx`
- `src/components/git-panel/view/GitPanel.tsx`
- `src/components/git-panel/view/GitPanelHeader.tsx`
- `src/i18n/locales/zh-CN/sidebar.json`
- `src/i18n/locales/zh-CN/common.json`
- `src/index.css`
- `package.json`

**Test:**
- `src/components/sidebar/view/subcomponents/sidebarWorkspace.test.mjs`
- `src/components/git-panel/utils/gitPanel.resources.test.mjs`
- `src/components/sidebar/view/subcomponents/sidebarDesktopActions.test.mjs`

---

### Task 1: 建立 workspace view 基础类型与测试

**Files:**
- Create: `src/components/sidebar/view/subcomponents/sidebarWorkspace.shared.ts`
- Test: `src/components/sidebar/view/subcomponents/sidebarWorkspace.test.mjs`
- Modify: `src/components/sidebar/types/types.ts`
- Modify: `package.json`

- [ ] **Step 1: 写失败测试，锁定三态视图和无项目空状态规则**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WORKSPACE_VIEW,
  getWorkspacePanelState,
  WORKSPACE_VIEWS,
} from './sidebarWorkspace.shared.ts';

test('workspace views keep projects/files/git order', () => {
  assert.deepEqual(WORKSPACE_VIEWS, ['projects', 'files', 'git']);
});

test('default workspace view is projects', () => {
  assert.equal(DEFAULT_WORKSPACE_VIEW, 'projects');
});

test('files and git require a selected project', () => {
  assert.equal(getWorkspacePanelState('projects', null), 'ready');
  assert.equal(getWorkspacePanelState('files', null), 'needs-project');
  assert.equal(getWorkspacePanelState('git', null), 'needs-project');
  assert.equal(getWorkspacePanelState('git', { name: 'otp-domain' }), 'ready');
});
```

- [ ] **Step 2: 运行测试，确认现在失败**

Run: `node --test src/components/sidebar/view/subcomponents/sidebarWorkspace.test.mjs`  
Expected: FAIL，提示 `sidebarWorkspace.shared.ts` 不存在或导出缺失。

- [ ] **Step 3: 写最小实现，提供统一 workspace 配置**

```ts
import type { Project } from '../../../../types/app';

export type WorkspaceView = 'projects' | 'files' | 'git';
export type WorkspacePanelState = 'ready' | 'needs-project';

export const WORKSPACE_VIEWS: WorkspaceView[] = ['projects', 'files', 'git'];
export const DEFAULT_WORKSPACE_VIEW: WorkspaceView = 'projects';

export function getWorkspacePanelState(
  view: WorkspaceView,
  selectedProject: Pick<Project, 'name'> | null,
): WorkspacePanelState {
  if (view === 'projects') {
    return 'ready';
  }

  return selectedProject ? 'ready' : 'needs-project';
}
```

- [ ] **Step 4: 在 Sidebar 类型层接入 WorkspaceView**

```ts
import type { WorkspaceView } from '../view/subcomponents/sidebarWorkspace.shared';

export type SidebarProps = {
  // existing props...
  initialWorkspaceView?: WorkspaceView;
};
```

- [ ] **Step 5: 把新测试加入 `package.json` 的 `test` 脚本**

```json
"test": "node --experimental-strip-types --test ... \"src/components/sidebar/view/subcomponents/sidebarWorkspace.test.mjs\" ..."
```

- [ ] **Step 6: 运行测试，确认通过**

Run: `node --test src/components/sidebar/view/subcomponents/sidebarWorkspace.test.mjs`  
Expected: PASS，3 个测试全部通过。

- [ ] **Step 7: 提交**

```bash
git add src/components/sidebar/view/subcomponents/sidebarWorkspace.shared.ts \
  src/components/sidebar/view/subcomponents/sidebarWorkspace.test.mjs \
  src/components/sidebar/types/types.ts \
  package.json
git commit -m "test: add workspace sidebar view config"
```

### Task 2: 接入 logo 右侧一级 tabs 和项目视图外壳

**Files:**
- Create: `src/components/sidebar/view/subcomponents/SidebarWorkspaceTabs.tsx`
- Modify: `src/components/sidebar/view/Sidebar.tsx`
- Modify: `src/components/sidebar/view/subcomponents/SidebarHeader.tsx`
- Modify: `src/components/sidebar/view/subcomponents/SidebarContent.tsx`
- Modify: `src/components/sidebar/view/subcomponents/SidebarFooter.tsx`
- Modify: `src/i18n/locales/zh-CN/sidebar.json`
- Modify: `src/index.css`
- Test: `src/components/sidebar/view/subcomponents/sidebarWorkspace.test.mjs`

- [ ] **Step 1: 先补失败测试，锁定 tab meta 文案和图标槽位**

```js
import { getWorkspaceTabMeta } from './sidebarWorkspace.shared.ts';

test('workspace tab meta exposes icon and label keys', () => {
  assert.deepEqual(getWorkspaceTabMeta('files'), {
    value: 'files',
    labelKey: 'workspace.files',
    icon: 'folder',
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test src/components/sidebar/view/subcomponents/sidebarWorkspace.test.mjs`  
Expected: FAIL，提示 `getWorkspaceTabMeta` 未定义。

- [ ] **Step 3: 扩展共享配置，补足 tab meta**

```ts
export type WorkspaceTabMeta = {
  value: WorkspaceView;
  labelKey: 'workspace.projects' | 'workspace.files' | 'workspace.git';
  icon: 'message-square' | 'folder' | 'git-branch';
};

const WORKSPACE_TAB_META: Record<WorkspaceView, WorkspaceTabMeta> = {
  projects: { value: 'projects', labelKey: 'workspace.projects', icon: 'message-square' },
  files: { value: 'files', labelKey: 'workspace.files', icon: 'folder' },
  git: { value: 'git', labelKey: 'workspace.git', icon: 'git-branch' },
};

export function getWorkspaceTabMeta(view: WorkspaceView): WorkspaceTabMeta {
  return WORKSPACE_TAB_META[view];
}
```

- [ ] **Step 4: 新建 `SidebarWorkspaceTabs.tsx`，只负责 tab 行为**

```tsx
type SidebarWorkspaceTabsProps = {
  value: WorkspaceView;
  onChange: (view: WorkspaceView) => void;
  isMobile: boolean;
  t: TFunction<'sidebar'>;
};

export default function SidebarWorkspaceTabs({ value, onChange, isMobile, t }: SidebarWorkspaceTabsProps) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-muted/60 p-1">
      {WORKSPACE_VIEWS.map((view) => {
        const meta = getWorkspaceTabMeta(view);
        const isActive = value === view;
        return (
          <button
            key={view}
            type="button"
            onClick={() => onChange(view)}
            aria-pressed={isActive}
            aria-label={t(meta.labelKey)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-colors',
              isActive ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              isMobile && 'px-2'
            )}
          >
            <WorkspaceTabIcon icon={meta.icon} className="h-3.5 w-3.5" />
            <span className={cn('hidden md:inline', isMobile && 'inline')}>{t(meta.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: 在 `Sidebar.tsx` 提升 `workspaceView`，默认值取 `DEFAULT_WORKSPACE_VIEW`**

```tsx
const [workspaceView, setWorkspaceView] = useState<WorkspaceView>(
  initialWorkspaceView ?? DEFAULT_WORKSPACE_VIEW,
);
```

- [ ] **Step 6: 在 `SidebarHeader.tsx` 第一行改成 `Logo + SidebarWorkspaceTabs`，第二行仅在 `projects` 视图显示项目工具栏**

```tsx
<div className="flex items-center justify-between gap-2">
  <LogoBlock />
  <SidebarWorkspaceTabs
    value={workspaceView}
    onChange={onWorkspaceViewChange}
    isMobile={isMobile}
    t={t}
  />
</div>

{workspaceView === 'projects' && (
  <ProjectsToolbar
    searchFilter={searchFilter}
    searchMode={searchMode}
    onSearchFilterChange={onSearchFilterChange}
    onSearchModeChange={onSearchModeChange}
    onCreateProject={onCreateProject}
    onClearSearchFilter={onClearSearchFilter}
    t={t}
  />
)}
```

- [ ] **Step 7: 在 `SidebarContent.tsx` 先只分发 `projects` 和占位空状态**

```tsx
{workspaceView === 'projects' ? (
  showConversationSearch ? <ConversationSearchResults ... /> : <SidebarProjectList {...projectListProps} />
) : (
  <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
    {t('workspace.comingSoon')}
  </div>
)}
```

- [ ] **Step 8: 补 i18n 文案**

```json
"workspace": {
  "projects": "项目",
  "files": "文件",
  "git": "版本",
  "selectProjectTitle": "请先选择项目",
  "selectProjectDescription": "先回到项目页选择一个项目，然后再查看文件或版本信息。",
  "backToProjects": "返回项目"
}
```

- [ ] **Step 9: 跑测试和类型检查**

Run: `node --test src/components/sidebar/view/subcomponents/sidebarWorkspace.test.mjs`  
Expected: PASS

Run: `npx tsc --noEmit -p tsconfig.json`  
Expected: PASS

- [ ] **Step 10: 提交**

```bash
git add src/components/sidebar/view/Sidebar.tsx \
  src/components/sidebar/view/subcomponents/SidebarHeader.tsx \
  src/components/sidebar/view/subcomponents/SidebarContent.tsx \
  src/components/sidebar/view/subcomponents/SidebarFooter.tsx \
  src/components/sidebar/view/subcomponents/SidebarWorkspaceTabs.tsx \
  src/components/sidebar/view/subcomponents/sidebarWorkspace.shared.ts \
  src/components/sidebar/view/subcomponents/sidebarWorkspace.test.mjs \
  src/i18n/locales/zh-CN/sidebar.json \
  src/index.css
git commit -m "feat: add workspace tabs to sidebar shell"
```

### Task 3: 接入文件 tab 和文件树左栏模式

**Files:**
- Modify: `src/components/sidebar/view/subcomponents/SidebarContent.tsx`
- Modify: `src/components/sidebar/view/subcomponents/SidebarHeader.tsx`
- Modify: `src/components/file-tree/view/FileTree.tsx`
- Modify: `src/components/file-tree/view/FileTreeHeader.tsx`
- Test: `src/components/sidebar/view/subcomponents/sidebarWorkspace.test.mjs`

- [ ] **Step 1: 写失败测试，锁定 `files` 在无项目时需要空状态**

```js
test('files view requires project before rendering panel', () => {
  assert.equal(getWorkspacePanelState('files', null), 'needs-project');
});
```

- [ ] **Step 2: 运行测试确认仍由逻辑保护**

Run: `node --test src/components/sidebar/view/subcomponents/sidebarWorkspace.test.mjs`  
Expected: PASS，确认共享逻辑可直接复用到 UI 分支。

- [ ] **Step 3: 给 `FileTree` 增加轻量 `embedded` 模式参数**

```tsx
type FileTreeProps = {
  selectedProject: Project | null;
  onFileOpen?: (filePath: string) => void;
  embedded?: boolean;
};

export default function FileTree({ selectedProject, onFileOpen, embedded = false }: FileTreeProps) {
  // ...
  return (
    <div className={cn('relative flex h-full flex-col bg-background', embedded && 'border-0 bg-transparent')}>
      <FileTreeHeader
        embedded={embedded}
        // existing props...
      />
    </div>
  );
}
```

- [ ] **Step 4: 让 `FileTreeHeader` 在 `embedded` 模式下去掉重复的标题边框，只保留工具操作**

```tsx
type FileTreeHeaderProps = {
  // existing props...
  embedded?: boolean;
};

<div className={cn('space-y-2 px-3 pb-2 pt-3', embedded ? 'border-b-0 pt-2' : 'border-b border-border')}>
  {!embedded && <h3 className="text-sm font-medium text-foreground">{t('fileTree.files')}</h3>}
  // existing toolbar + search
</div>
```

- [ ] **Step 5: 在 `SidebarHeader.tsx` 为 `files` 视图渲染轻量工具栏**

```tsx
{workspaceView === 'files' && (
  <div className="mt-2 flex items-center justify-between">
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-foreground">
        {selectedProject?.displayName ?? t('workspace.selectProjectTitle')}
      </p>
      <p className="text-xs text-muted-foreground">{t('workspace.files')}</p>
    </div>
  </div>
)}
```

- [ ] **Step 6: 在 `SidebarContent.tsx` 分发 `files` 视图**

```tsx
const panelState = getWorkspacePanelState(workspaceView, selectedProject);

if (workspaceView === 'files') {
  return panelState === 'needs-project' ? (
    <WorkspaceEmptyState
      title={t('workspace.selectProjectTitle')}
      description={t('workspace.selectProjectDescription')}
      actionLabel={t('workspace.backToProjects')}
      onAction={() => onWorkspaceViewChange('projects')}
    />
  ) : (
    <FileTree selectedProject={selectedProject} onFileOpen={onFileOpen} embedded />
  );
}
```

- [ ] **Step 7: 跑针对性验证**

Run: `node --test src/components/sidebar/view/subcomponents/sidebarWorkspace.test.mjs`  
Expected: PASS

Run: `npx tsc --noEmit -p tsconfig.json`  
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add src/components/sidebar/view/subcomponents/SidebarContent.tsx \
  src/components/sidebar/view/subcomponents/SidebarHeader.tsx \
  src/components/file-tree/view/FileTree.tsx \
  src/components/file-tree/view/FileTreeHeader.tsx \
  src/components/sidebar/view/subcomponents/sidebarWorkspace.test.mjs
git commit -m "feat: add file tree workspace tab"
```

### Task 4: 接入版本 tab 和 Git 面板左栏模式

**Files:**
- Modify: `src/components/sidebar/view/subcomponents/SidebarContent.tsx`
- Modify: `src/components/sidebar/view/subcomponents/SidebarHeader.tsx`
- Modify: `src/components/git-panel/view/GitPanel.tsx`
- Modify: `src/components/git-panel/view/GitPanelHeader.tsx`
- Modify: `src/components/git-panel/utils/gitPanel.resources.test.mjs`
- Modify: `src/i18n/locales/zh-CN/common.json`

- [ ] **Step 1: 先补资源测试，锁定 sidebar 文案已进入资源**

```js
test('sidebar workspace translations are registered in i18n resources', () => {
  const resourceFile = readFileSync(resourcesPath, 'utf8');
  assert.match(resourceFile, /import sidebar from '\.\/locales\/zh-CN\/sidebar\.json';/);
  assert.match(resourceFile, /sidebar,/);
});
```

- [ ] **Step 2: 运行测试，确认资源测试通过**

Run: `node --test src/components/git-panel/utils/gitPanel.resources.test.mjs`  
Expected: PASS

- [ ] **Step 3: 给 `GitPanel` 增加 `embedded` 模式参数**

```tsx
type GitPanelProps = {
  selectedProject: Project | null;
  isMobile?: boolean;
  onFileOpen?: FileOpenHandler;
  embedded?: boolean;
};

export default function GitPanel({ selectedProject, isMobile = false, onFileOpen, embedded = false }: GitPanelProps) {
  // ...
  return (
    <div className={cn('flex h-full flex-col bg-background', embedded && 'bg-transparent')}>
      <GitPanelHeader embedded={embedded} ... />
      {!embedded && (
        <GitViewTabs
          activeView={activeView}
          isHidden={hasExpandedFiles}
          changeCount={changeCount}
          onChange={setActiveView}
        />
      )}
      {embedded && (
        <GitViewTabs
          activeView={activeView}
          isHidden={hasExpandedFiles}
          changeCount={changeCount}
          onChange={setActiveView}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: 让 `GitPanelHeader` 在 `embedded` 模式下使用更紧凑 padding**

```tsx
type GitPanelHeaderProps = {
  // existing props...
  embedded?: boolean;
};

<div className={cn('border-b border-border px-3 py-2', embedded && 'px-2 py-1.5')}>
  {/* existing branch selector and refresh actions */}
</div>
```

- [ ] **Step 5: 在 `SidebarHeader.tsx` 为 `git` 视图渲染轻量工具栏**

```tsx
{workspaceView === 'git' && (
  <div className="mt-2 flex items-center justify-between">
    <div className="min-w-0">
      <p className="truncate text-sm font-medium text-foreground">
        {selectedProject?.displayName ?? t('workspace.selectProjectTitle')}
      </p>
      <p className="text-xs text-muted-foreground">{t('workspace.git')}</p>
    </div>
  </div>
)}
```

- [ ] **Step 6: 在 `SidebarContent.tsx` 分发 `git` 视图**

```tsx
if (workspaceView === 'git') {
  return panelState === 'needs-project' ? (
    <WorkspaceEmptyState
      title={t('workspace.selectProjectTitle')}
      description={t('workspace.selectProjectDescription')}
      actionLabel={t('workspace.backToProjects')}
      onAction={() => onWorkspaceViewChange('projects')}
    />
  ) : (
    <GitPanel selectedProject={selectedProject} isMobile={isMobile} onFileOpen={onFileOpen} embedded />
  );
}
```

- [ ] **Step 7: 跑类型检查和资源测试**

Run: `node --test src/components/git-panel/utils/gitPanel.resources.test.mjs`  
Expected: PASS

Run: `npx tsc --noEmit -p tsconfig.json`  
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add src/components/sidebar/view/subcomponents/SidebarContent.tsx \
  src/components/sidebar/view/subcomponents/SidebarHeader.tsx \
  src/components/git-panel/view/GitPanel.tsx \
  src/components/git-panel/view/GitPanelHeader.tsx \
  src/components/git-panel/utils/gitPanel.resources.test.mjs \
  src/i18n/locales/zh-CN/common.json
git commit -m "feat: add git workspace tab"
```

### Task 5: 收口移动端、底部操作和回归验证

**Files:**
- Modify: `src/components/sidebar/view/subcomponents/SidebarFooter.tsx`
- Modify: `src/components/sidebar/view/subcomponents/SidebarHeader.tsx`
- Modify: `src/components/sidebar/view/subcomponents/sidebarDesktopActions.ts`
- Modify: `src/components/sidebar/view/subcomponents/sidebarDesktopActions.test.mjs`
- Modify: `src/index.css`
- Test: `src/components/sidebar/view/subcomponents/sidebarWorkspace.test.mjs`

- [ ] **Step 1: 写失败测试，锁定桌面端按钮布局不被 workspace tabs 回退**

```js
import { getDesktopSidebarActionSlots } from './sidebarDesktopActions.ts';

test('desktop sidebar actions keep create in project toolbar and settings/refresh/collapse in footer', () => {
  assert.deepEqual(getDesktopSidebarActionSlots(), {
    header: [],
    searchBar: ['create'],
    footer: ['settings', 'refresh', 'collapse'],
  });
});
```

- [ ] **Step 2: 跑测试确认当前仍然通过，避免改 footer 时退回旧结构**

Run: `node --test src/components/sidebar/view/subcomponents/sidebarDesktopActions.test.mjs`  
Expected: PASS

- [ ] **Step 3: 调整 `SidebarFooter.tsx`，让底部公共操作不依赖当前 tab**

```tsx
<div className="flex items-center gap-1 px-0.5">
  <button onClick={onShowSettings}>...</button>
  <Button onClick={onRefresh}>...</Button>
  <Button onClick={onCollapseSidebar}>...</Button>
</div>
```

- [ ] **Step 4: 调整移动端 tabs 和工具栏间距，保证一级 tabs 始终可点**

```tsx
<SidebarWorkspaceTabs
  value={workspaceView}
  onChange={onWorkspaceViewChange}
  isMobile={isMobile}
  t={t}
/>

<div className={cn('mt-2.5', isMobile && 'space-y-2')}>
  {renderToolbar()}
</div>
```

- [ ] **Step 5: 跑最终回归命令**

Run: `node --test src/components/sidebar/view/subcomponents/sidebarWorkspace.test.mjs src/components/sidebar/view/subcomponents/sidebarDesktopActions.test.mjs src/components/git-panel/utils/gitPanel.resources.test.mjs`  
Expected: PASS

Run: `npx tsc --noEmit -p tsconfig.json`  
Expected: PASS

Run: `npm test`  
Expected: PASS，至少不新增 sidebar / git / i18n 相关失败。

- [ ] **Step 6: 提交**

```bash
git add src/components/sidebar/view/subcomponents/SidebarFooter.tsx \
  src/components/sidebar/view/subcomponents/SidebarHeader.tsx \
  src/components/sidebar/view/subcomponents/sidebarDesktopActions.ts \
  src/components/sidebar/view/subcomponents/sidebarDesktopActions.test.mjs \
  src/components/sidebar/view/subcomponents/sidebarWorkspace.test.mjs \
  src/index.css
git commit -m "feat: polish workspace sidebar tabs"
```

## Self-Review

### Spec coverage

1. 一级 tab：Task 2 实现 `SidebarWorkspaceTabs` 与 header 接入。
2. 左侧内容切换：Task 2/3/4 分别接入 `projects`、`files`、`git`。
3. 顶部工具栏按 tab 切换：Task 2/3/4 在 `SidebarHeader.tsx` 完成。
4. 无项目空状态：Task 3 和 Task 4 使用 `getWorkspacePanelState()` 与统一空状态。
5. 桌面端与移动端共用：Task 2 和 Task 5 负责 tab 与间距适配。
6. 尽量复用现有模块：Task 3/4 采用 `embedded` 模式而非重写 `FileTree` / `GitPanel`。

### Placeholder scan

1. 计划中没有未完成占位语句或“以后再补”的描述。
2. 每个代码步骤都给了具体代码块或命令。
3. 每个测试步骤都包含实际命令和预期结果。

### Type consistency

1. 全文统一使用 `WorkspaceView = 'projects' | 'files' | 'git'`。
2. `embedded` 作为 `FileTree` 和 `GitPanel` 的布尔开关保持一致。
3. 空状态判断统一通过 `getWorkspacePanelState()`，避免 later task 引入不同判断名。
