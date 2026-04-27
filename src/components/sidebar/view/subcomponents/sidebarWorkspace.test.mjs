import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_WORKSPACE_VIEW,
  WORKSPACE_VIEWS,
  getWorkspaceTabMeta,
  getWorkspacePanelState,
} from './sidebarWorkspace.shared.ts';
import { getDesktopSidebarActionSlots } from './sidebarDesktopActions.ts';

test('WORKSPACE_VIEWS keeps projects, files, git order', () => {
  assert.deepEqual(WORKSPACE_VIEWS, ['projects', 'files', 'git']);
});

test('DEFAULT_WORKSPACE_VIEW starts on projects', () => {
  assert.equal(DEFAULT_WORKSPACE_VIEW, 'projects');
});

test('getWorkspacePanelState requires a project for files and git', () => {
  assert.equal(getWorkspacePanelState('projects', null), 'ready');
  assert.equal(getWorkspacePanelState('files', null), 'needs-project');
  assert.equal(getWorkspacePanelState('git', null), 'needs-project');
  assert.equal(getWorkspacePanelState('files', { name: 'otp-domain' }), 'ready');
  assert.equal(getWorkspacePanelState('git', { name: 'otp-domain' }), 'ready');
});

test('getWorkspaceTabMeta returns the files tab metadata', () => {
  assert.deepEqual(getWorkspaceTabMeta('files'), {
    value: 'files',
    labelKey: 'workspace.files',
    icon: 'folder',
  });
});

test('SidebarWorkspaceTabs.tsx keeps the three workspace tabs and icon labels', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/sidebar/view/subcomponents/SidebarWorkspaceTabs.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /workspace\.projects/);
  assert.match(source, /workspace\.files/);
  assert.match(source, /workspace\.git/);
  assert.match(source, /MessageSquare/);
  assert.match(source, /Folder/);
  assert.match(source, /GitBranch/);
});

test('SidebarWorkspaceTabs.tsx supports a label mode without tooltips for footer tabs', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/sidebar/view/subcomponents/SidebarWorkspaceTabs.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /showLabels\?: boolean/);
  assert.match(source, /stretch\?: boolean/);
  assert.match(source, /showLabels = false/);
  assert.match(source, /stretch = false/);
  assert.match(source, /showLabels \? createElement\('span'/);
  assert.match(source, /stretch \? 'w-full justify-stretch'/);
  assert.match(source, /stretch \? 'flex-1'/);
  assert.match(source, /if \(showLabels\) \{/);
});

test('SidebarContent.tsx routes the files workspace into FileTree rendering', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/sidebar/view/subcomponents/SidebarContent.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /selectedProject/);
  assert.match(source, /FileTree/);
  assert.match(source, /workspaceView === 'files'/);
});

test('SidebarContent.tsx routes the git workspace into GitPanel rendering', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/sidebar/view/subcomponents/SidebarContent.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /GitPanel/);
  assert.match(source, /workspaceView === 'git'/);
  assert.match(source, /embedded/);
  assert.match(source, /<GitPanel[\s\S]*onFileOpen=\{onFileOpen\}/);
});

test('SidebarFooter.tsx keeps the mobile public actions on settings refresh and collapse', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/sidebar/view/subcomponents/SidebarFooter.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /actions\.settings/);
  assert.match(source, /actions\.refresh/);
  assert.match(source, /tooltips\.hideSidebar/);
  assert.match(source, /grid grid-cols-3/);
  assert.doesNotMatch(source, /actions\.joinCommunity/);
  assert.doesNotMatch(source, /discord\.gg/);
});

test('desktop sidebar action slots keep refresh with the project toolbar instead of the footer', () => {
  const slots = getDesktopSidebarActionSlots();

  assert.deepEqual(slots.header, ['settings', 'collapse']);
  assert.deepEqual(slots.searchBar, ['refresh', 'create']);
  assert.deepEqual(slots.footer, []);
});

test('SidebarHeader.tsx hides desktop project toolbar actions while the search input is focused', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/sidebar/view/subcomponents/SidebarHeader.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /const \[isDesktopSearchFocused, setIsDesktopSearchFocused\] = React\.useState\(false\);/);
  assert.match(source, /const desktopSearchInputRef = React\.useRef<HTMLInputElement \| null>\(null\);/);
  assert.match(source, /onFocus=\{\(\) => setIsDesktopSearchFocused\(true\)\}/);
  assert.match(source, /onBlur=\{\(\) => setIsDesktopSearchFocused\(false\)\}/);
  assert.match(source, /!isDesktopSearchFocused && desktopActionSlots\.searchBar\.includes\('refresh'\)/);
  assert.match(source, /!isDesktopSearchFocused && desktopActionSlots\.searchBar\.includes\('create'\)/);
  assert.match(source, /onMouseDown=\{\(event\) => \{\s*event\.preventDefault\(\);/);
  assert.match(source, /onClearSearchFilter\(\);[\s\S]*desktopSearchInputRef\.current\?\.focus\(\);/);
});

test('SidebarHeader.tsx renders desktop settings and collapse actions in the top toolbar', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/sidebar/view/subcomponents/SidebarHeader.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /desktopActionSlots\.header\.includes\('settings'\)/);
  assert.match(source, /desktopActionSlots\.header\.includes\('collapse'\)/);
  assert.match(source, /onShowSettings/);
  assert.match(source, /onCollapseSidebar/);
});

test('SidebarProjectItem.tsx starts a new session without re-selecting the project first', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/sidebar/view/subcomponents/SidebarProjectItem.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /onNewSession\(project\);/);
  assert.doesNotMatch(source, /onProjectSelect\(project\);\s*onNewSession\(project\);/);
});

test('SidebarProjectSessions.tsx starts a new session without re-selecting the project first', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/sidebar/view/subcomponents/SidebarProjectSessions.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /onNewSession\(project\);/);
  assert.doesNotMatch(source, /onProjectSelect\(project\);\s*onNewSession\(project\);/);
});

test('SidebarProjectSessions.tsx allows collapsing back to the default session count after loading more', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/sidebar/view/subcomponents/SidebarProjectSessions.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /onResetVisibleSessions: \(project: Project\) => void;/);
  assert.match(source, /const hasExpandedSessions = sessions.length > \(project\.sessions\?\.length \|\| 0\);/);
  assert.match(source, /hasMoreSessions && \(/);
  assert.match(source, /onClick=\{\(\) => onLoadMoreSessions\(project\)\}/);
  assert.match(source, /t\('sessions\.showMore'\)/);
  assert.match(source, /hasExpandedSessions && \(/);
  assert.match(source, /onClick=\{\(\) => onResetVisibleSessions\(project\)\}/);
  assert.match(source, /t\('sessions\.showLess'\)/);
});

test('SidebarFooter.tsx renders desktop workspace tabs in the footer area', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/sidebar/view/subcomponents/SidebarFooter.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /SidebarWorkspaceTabs/);
  assert.match(source, /workspaceView/);
  assert.match(source, /onWorkspaceViewChange/);
  assert.match(source, /showLabels=\{true\}/);
  assert.match(source, /stretch=\{true\}/);
});

test('GitPanel.tsx and GitPanelHeader.tsx support an embedded sidebar mode', async () => {
  const gitPanelPath = path.join(process.cwd(), 'src/components/git-panel/view/GitPanel.tsx');
  const gitPanelHeaderPath = path.join(process.cwd(), 'src/components/git-panel/view/GitPanelHeader.tsx');
  const gitPanelSource = await fs.readFile(gitPanelPath, 'utf8');
  const gitPanelHeaderSource = await fs.readFile(gitPanelHeaderPath, 'utf8');

  assert.match(gitPanelSource, /embedded\?: boolean/);
  assert.match(gitPanelSource, /GitPanelHeader/);
  assert.match(gitPanelHeaderSource, /embedded\?: boolean/);
  assert.match(gitPanelHeaderSource, /embedded/);
});

test('FileTreeHeader.tsx supports an embedded sidebar mode', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/file-tree/view/FileTreeHeader.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /embedded\?: boolean/);
  assert.match(source, /embedded/);
});

test('Sidebar.tsx supports temporary peek presentations for the auto-collapsed desktop rail', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/sidebar/view/Sidebar.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /presentation = 'default'/);
  assert.match(source, /presentation === 'peek-collapsed'/);
  assert.match(source, /presentation === 'peek-expanded'/);
  assert.match(source, /surfaceMode=/);
  assert.match(source, /onRequestPeekOpen/);
  assert.match(source, /onRequestPeekClose/);
});

test('Sidebar.tsx opens hooks from sidebar chrome without routing to a standalone page', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/sidebar/view/Sidebar.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /showHooksOverview/);
  assert.match(source, /setShowHooksOverview/);
  assert.match(source, /onOpenHooksOverview=\{\(\) => setShowHooksOverview\(true\)\}/);
  assert.doesNotMatch(source, /navigate\('\/hooks'\)/);
});

test('SidebarModals.tsx hosts the hooks overview inside the existing modal system', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/sidebar/view/subcomponents/SidebarModals.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /showHooksOverview: boolean/);
  assert.match(source, /onCloseHooksOverview: \(\) => void/);
  assert.match(source, /HooksOverviewModal/);
  assert.match(source, /showHooksOverview/);
});

test('SidebarContent.tsx supports a solid overlay surface without translucent blur', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/sidebar/view/subcomponents/SidebarContent.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /surfaceMode\?: 'default' \| 'overlay'/);
  assert.match(source, /surfaceMode = 'default'/);
  assert.match(source, /const isOverlaySurface = surfaceMode === 'overlay'/);
  assert.match(source, /shadow-none bg-background|bg-background shadow-none/);
  assert.match(source, /backdrop-blur-sm.*bg-background\/80|bg-background\/80.*backdrop-blur-sm/);
});

test('AppContent.tsx renders a temporary overlay sidebar when the right pane auto-collapses the dock', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/app/AppContent.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /getDesktopSidebarPresentation/);
  assert.match(source, /isDesktopSidebarPeekOpen/);
  assert.match(source, /shouldRenderOverlay/);
  assert.match(source, /presentation=\{/);
  assert.match(source, /'peek-expanded'/);
  assert.match(source, /'peek-collapsed'/);
});

test('AppContent.tsx keeps the floating sidebar open when opening a file from the tree', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/app/AppContent.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /onFileOpen: \(filePath: string, diffInfo\?: Parameters<NonNullable<typeof handleFileOpen>>\[1\]\) => \{\s*handleFileOpen\(filePath, diffInfo\);/);
  assert.doesNotMatch(source, /onFileOpen: \(filePath: string, diffInfo\?: Parameters<NonNullable<typeof handleFileOpen>>\[1\]\) => \{\s*closeDesktopSidebarPeek\(\);/);
});

test('AppContent.tsx queries pending decisions with the split recovery event name', async () => {
  const sourcePath = path.join(process.cwd(), 'src/components/app/AppContent.tsx');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /CLIENT_EVENT_TYPES\.GET_PENDING_DECISIONS|type:\s*'get-pending-decisions'/);
  assert.doesNotMatch(source, /type:\s*'get-pending-permissions'/);
});
