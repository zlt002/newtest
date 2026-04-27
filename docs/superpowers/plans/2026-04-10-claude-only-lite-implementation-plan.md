# Claude Only Lite 验证版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前项目裁剪为仅支持 Claude Code、免登录、无内置终端、无其他 Agent 的验证版本，并补齐 Windows `vbs` 启动入口，便于在仅有 Node 24 的 Windows 环境中验证运行。

**Architecture:** 保留现有 `Express + Vite` 单体结构，优先移除运行时原生依赖和多 Provider 分支，再把前端入口、状态与设置页收敛到 Claude Only 模式，最后增加 Windows 启动脚本与分发说明。整个改造以最小侵入为原则，优先保住聊天、文件树、代码编辑、Git 四条主链路。

**Tech Stack:** Node.js 24、Express、Vite、React、React Router、WebSocket、Claude CLI、本地文件系统与 Git 命令。

---

## 文件结构与职责

- `package.json`
  负责运行时依赖、脚本入口与安装流程；需要移除原生依赖与不再使用的脚本。
- `server/index.js`
  当前服务端总入口；需要移除 shell、codex、gemini、cursor、数据库认证依赖，并切到本地免登录模式。
- `server/middleware/auth.js`
  当前认证中间件；需要改成本地放行的轻量实现。
- `server/routes/auth.js`
  当前登录注册接口；需要停用或改成返回固定“已登录”状态。
- `server/routes/agent.js`
  当前多 Agent 调度入口；需要只保留 Claude 分支。
- `server/routes/messages.js`
  当前统一消息读取接口；需要确认只走 Claude 仍可正常返回。
- `server/projects.js`
  当前项目发现逻辑；需要切掉 Cursor/Codex/Gemini 相关聚合能力。
- `server/providers/registry.js`
  Provider 注册中心；需要只保留 Claude。
- `src/App.tsx`
  应用总装配；需要移除认证 Provider 和登录保护。
- `src/components/auth/*`
  登录与认证上下文；验证版要么删除引用，要么替换为简单本地实现。
- `src/contexts/WebSocketContext.tsx`
  当前依赖 token 建立连接；需要改成免 token 连接。
- `src/hooks/useProjectsState.ts`
  当前聚合多 Provider 会话与标签；需要默认固定 Claude，并去掉 shell/provider 切换影响。
- `src/types/app.ts`
  项目/会话/provider 类型定义；需要收敛到 Claude-only。
- `src/components/sidebar/*`
  当前会话与项目侧栏；需要隐藏其他 Agent 相关入口。
- `src/components/main-content/*`
  主内容区标签页编排；需要移除 Shell 标签。
- `src/components/settings/*`
  设置页当前包含多 Agent、登录、权限模式等；需要裁剪到验证版可用范围。
- `windows/start.cmd`
  Windows 命令行启动入口。
- `windows/start.vbs`
  Windows 双击静默启动入口。
- `docs/windows-lite-run.md`
  Windows 运行说明。

### Task 1: 清理运行时依赖与入口假设

**Files:**
- Modify: `package.json`
- Modify: `server/index.js`
- Modify: `server/providers/registry.js`
- Modify: `shared/modelConstants.js`

- [ ] **Step 1: 写出本次裁剪涉及的运行时依赖清单**

```json
{
  "removeDependencies": [
    "bcrypt",
    "better-sqlite3",
    "node-pty",
    "sqlite3",
    "@openai/codex-sdk"
  ],
  "removeDevDependencies": [
    "sharp",
    "node-gyp"
  ],
  "keepProvider": "claude"
}
```

- [ ] **Step 2: 先在计划里明确 `package.json` 目标状态**

```json
{
  "scripts": {
    "dev": "concurrently --kill-others \"npm run server\" \"npm run client\"",
    "server": "node server/index.js",
    "client": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "start": "npm run build && npm run server"
  }
}
```

- [ ] **Step 3: 修改 `server/providers/registry.js`，只注册 Claude**

```js
import { claudeAdapter } from './claude/adapter.js';

const providers = new Map();
providers.set('claude', claudeAdapter);

export function getProvider(name) {
  return providers.get(name);
}

export function getAllProviders() {
  return Array.from(providers.keys());
}
```

- [ ] **Step 4: 修改 `shared/modelConstants.js`，只保留 Claude 所需导出**

```js
export const CLAUDE_MODELS = {
  OPTIONS: [
    { value: 'sonnet', label: 'Sonnet' },
    { value: 'opus', label: 'Opus' }
  ],
  DEFAULT: 'sonnet'
};
```

- [ ] **Step 5: 运行依赖引用扫描，确认运行时不再依赖已移除包**

Run: `rg -n "node-pty|better-sqlite3|sqlite3|bcrypt|codex-sdk" package.json server src shared`
Expected: 仅剩计划中的待修改残留，且后续任务会继续清掉。

- [ ] **Step 6: Commit**

```bash
git add package.json server/providers/registry.js shared/modelConstants.js server/index.js
git commit -m "refactor: reduce runtime to Claude-only dependencies"
```

### Task 2: 后端切换为本地免登录与 Claude-only 模式

**Files:**
- Modify: `server/index.js`
- Modify: `server/middleware/auth.js`
- Modify: `server/routes/auth.js`
- Modify: `server/routes/agent.js`
- Modify: `server/routes/user.js`

- [ ] **Step 1: 在 `server/middleware/auth.js` 中写一个本地固定用户上下文**

```js
const LOCAL_USER = {
  id: 1,
  username: 'local',
  created_at: new Date().toISOString(),
  last_login: null
};

const validateApiKey = (req, _res, next) => {
  req.user = LOCAL_USER;
  next();
};

const authenticateToken = async (req, _res, next) => {
  req.user = LOCAL_USER;
  next();
};

const authenticateWebSocket = (_request, callback) => {
  callback(true, LOCAL_USER);
};
```

- [ ] **Step 2: 在 `server/routes/auth.js` 中把登录相关接口改为免登录返回**

```js
router.get('/setup-status', (_req, res) => {
  res.json({ needsSetup: false });
});

router.post('/login', (_req, res) => {
  res.json({
    success: true,
    token: 'local-mode',
    user: { id: 1, username: 'local' }
  });
});

router.get('/user', (_req, res) => {
  res.json({ user: { id: 1, username: 'local' } });
});
```

- [ ] **Step 3: 在 `server/routes/agent.js` 中只接受 `claude` provider**

```js
const provider = 'claude';

if (req.body.provider && req.body.provider !== 'claude') {
  return res.status(400).json({ error: '验证版仅支持 claude provider' });
}
```

- [ ] **Step 4: 在 `server/index.js` 中移除 Codex/Gemini/Cursor 路由和导入**

```js
app.use('/api/auth', authRoutes);
app.use('/api/projects', authenticateToken, projectsRoutes);
app.use('/api/git', authenticateToken, gitRoutes);
app.use('/api/settings', authenticateToken, settingsRoutes);
app.use('/api/sessions', authenticateToken, messagesRoutes);
app.use('/api/agent', agentRoutes);
```

- [ ] **Step 5: 在 `server/routes/user.js` 中让 Git 配置接口不依赖数据库用户表**

```js
router.get('/git-config', async (_req, res) => {
  res.json({
    git_name: '',
    git_email: ''
  });
});
```

- [ ] **Step 6: 启动后端并确认基础接口可访问**

Run: `node server/index.js`
Expected: 服务成功启动，无数据库依赖报错、无 codex/gemini/cursor/node-pty 加载报错。

- [ ] **Step 7: Commit**

```bash
git add server/index.js server/middleware/auth.js server/routes/auth.js server/routes/agent.js server/routes/user.js
git commit -m "refactor: switch backend to local Claude-only mode"
```

### Task 3: 移除 Shell 与多 Provider 项目聚合

**Files:**
- Modify: `server/index.js`
- Modify: `server/projects.js`
- Modify: `src/types/app.ts`
- Modify: `src/hooks/useProjectsState.ts`

- [ ] **Step 1: 从 `server/index.js` 中删除 `/shell` WebSocket 分支与 `node-pty` 逻辑**

```js
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;

  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
    return;
  }

  socket.destroy();
});
```

- [ ] **Step 2: 在 `server/projects.js` 中移除 Cursor/Codex/Gemini 会话聚合字段**

```js
return {
  name: projectName,
  displayName,
  fullPath: actualProjectDir,
  sessions: claudeSessions,
  sessionMeta,
  taskmaster
};
```

- [ ] **Step 3: 在 `src/types/app.ts` 中收敛 provider 与项目类型**

```ts
export type SessionProvider = 'claude';

export type Project = {
  name: string;
  displayName: string;
  fullPath: string;
  sessions?: ProjectSession[];
  sessionMeta?: Record<string, unknown>;
};
```

- [ ] **Step 4: 在 `src/hooks/useProjectsState.ts` 中去掉其他 provider 的会话合并逻辑**

```ts
const getProjectSessions = (project: Project): ProjectSession[] => {
  return [...(project.sessions ?? [])];
};
```

- [ ] **Step 5: 运行类型检查，确认项目与会话类型已收敛**

Run: `npm run typecheck`
Expected: 若失败，报错应集中在仍残留的多 provider / shell / auth 前端引用处，进入下一任务继续清理。

- [ ] **Step 6: Commit**

```bash
git add server/index.js server/projects.js src/types/app.ts src/hooks/useProjectsState.ts
git commit -m "refactor: remove shell and non-Claude project aggregation"
```

### Task 4: 前端切换到免登录、Claude-only、无 Shell 标签

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/contexts/WebSocketContext.tsx`
- Modify: `src/utils/api.js`
- Modify: `src/components/main-content/view/MainContent.tsx`
- Modify: `src/components/sidebar/view/Sidebar.tsx`
- Modify: `src/components/settings/view/Settings.tsx`

- [ ] **Step 1: 在 `src/App.tsx` 中移除 `AuthProvider` 和 `ProtectedRoute`**

```tsx
export default function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <ThemeProvider>
        <WebSocketProvider>
          <PluginsProvider>
            <TasksSettingsProvider>
              <TaskMasterProvider>
                <Router basename={window.__ROUTER_BASENAME__ || ''}>
                  <Routes>
                    <Route path="/" element={<AppContent />} />
                    <Route path="/session/:sessionId" element={<AppContent />} />
                  </Routes>
                </Router>
              </TaskMasterProvider>
            </TasksSettingsProvider>
          </PluginsProvider>
        </WebSocketProvider>
      </ThemeProvider>
    </I18nextProvider>
  );
}
```

- [ ] **Step 2: 在 `src/contexts/WebSocketContext.tsx` 中改为不依赖 token**

```ts
const buildWebSocketUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
};
```

- [ ] **Step 3: 在 `src/utils/api.js` 中让 `authenticatedFetch` 退化为普通 fetch 包装**

```js
export async function authenticatedFetch(url, options = {}) {
  return fetch(url, options);
}
```

- [ ] **Step 4: 在主内容区和侧栏移除 Shell 与其他 Agent 入口**

```ts
const VALID_TABS: Set<string> = new Set(['chat', 'files', 'git', 'tasks', 'preview']);
```

```tsx
{activeTab === 'chat' && <ChatPanel ... />}
{activeTab === 'files' && <CodeEditor ... />}
{activeTab === 'git' && <GitPanel ... />}
```

- [ ] **Step 5: 在设置页中隐藏登录、多 Agent、其他 Provider 相关区块**

```tsx
const visibleTabs = ['general', 'appearance', 'git'];
```

- [ ] **Step 6: 启动前端并检查主要界面是否可加载**

Run: `npm run dev`
Expected: 页面可打开，不出现登录页，不出现 Shell 标签，不出现 Codex/Gemini/Cursor 选择。

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx src/contexts/WebSocketContext.tsx src/utils/api.js src/components/main-content/view/MainContent.tsx src/components/sidebar/view/Sidebar.tsx src/components/settings/view/Settings.tsx
git commit -m "refactor: switch frontend to local Claude-only mode"
```

### Task 5: 补齐 Windows 启动脚本与验证文档

**Files:**
- Create: `windows/start.cmd`
- Create: `windows/start.vbs`
- Create: `docs/windows-lite-run.md`

- [ ] **Step 1: 创建 `windows/start.cmd`**

```bat
@echo off
setlocal
cd /d %~dp0\..
start "" http://127.0.0.1:3001
node server\index.js
```

- [ ] **Step 2: 创建 `windows/start.vbs`**

```vbscript
Set WshShell = CreateObject("WScript.Shell")
Set Fso = CreateObject("Scripting.FileSystemObject")
scriptDir = Fso.GetParentFolderName(WScript.ScriptFullName)
projectRoot = Fso.GetParentFolderName(scriptDir)
WshShell.Run "cmd.exe /c cd /d """ & projectRoot & """ && start """" http://127.0.0.1:3001 && node server\\index.js", 0
Set WshShell = Nothing
Set Fso = Nothing
```

- [ ] **Step 3: 创建中文运行说明**

```md
# Windows 验证版运行说明

1. 确认系统已安装 Node 24
2. 解压项目目录
3. 双击 `windows/start.vbs`
4. 浏览器应自动打开 `http://127.0.0.1:3001`
5. 如需看日志，执行 `windows/start.cmd`
```

- [ ] **Step 4: 手工验证脚本路径拼接**

Run: `sed -n '1,120p' windows/start.cmd && sed -n '1,120p' windows/start.vbs`
Expected: 路径均以项目根目录为基准，不依赖全局 npm 命令。

- [ ] **Step 5: Commit**

```bash
git add windows/start.cmd windows/start.vbs docs/windows-lite-run.md
git commit -m "docs: add Windows launch scripts for Claude-only Lite"
```

### Task 6: 最终验证与分发清单

**Files:**
- Modify: `package.json`
- Modify: `docs/windows-lite-run.md`

- [ ] **Step 1: 在本地执行一次构建验证**

Run: `npm run build`
Expected: 前端构建成功，不再因为被移除的 provider、shell、auth 模块而失败。

- [ ] **Step 2: 在本地执行一次启动验证**

Run: `node server/index.js`
Expected: 服务启动成功，浏览器访问首页可见 Claude-only 主界面。

- [ ] **Step 3: 运行最终依赖扫描**

Run: `rg -n "node-pty|better-sqlite3|sqlite3|bcrypt|codex|gemini|cursor" package.json server src shared`
Expected: 仅保留与文本文案或注释相关的残留；运行路径不再依赖这些能力。

- [ ] **Step 4: 补充分发清单到文档**

```md
## 分发给 Windows 的文件

- `dist/`
- `server/`
- `shared/`
- `public/`
- `src/`（如果运行时仍直接引用）
- `package.json`
- `node_modules/`
- `windows/start.cmd`
- `windows/start.vbs`
```

- [ ] **Step 5: Commit**

```bash
git add package.json docs/windows-lite-run.md
git commit -m "chore: validate Claude-only Lite distribution package"
```
