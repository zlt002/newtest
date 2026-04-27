# 目录架构重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-step. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标:** 重构 CC-UI 项目目录结构，采用技术层驱动架构，统一前后端组织原则

**架构:** 按技术角色分层：表现层(routes/views) → 控制层(controllers) → 组件层(components) → 业务层(services) → 数据层(stores/models) → 工具层(utils) → 类型层(types)

**技术栈:** React, Vite, TypeScript, Express.js, Node.js

---

## 阶段 0: 准备工作

### Task 1: 配置路径别名

**Files:**
- Modify: `tsconfig.json`
- Modify: `vite.config.js`

- [ ] **Step 1: 更新 tsconfig.json paths**

打开 `tsconfig.json`，在 `compilerOptions.paths` 中添加：

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "react-i18next": ["./src/i18n/react-i18next.ts"],
      "i18next": ["./src/i18n/i18next.ts"],
      "@/*": ["src/*"],
      "@views/*": ["src/views/*"],
      "@components/*": ["src/components/*"],
      "@hooks/*": ["src/hooks/*"],
      "@services/*": ["src/services/*"],
      "@utils/*": ["src/utils/*"],
      "@types/*": ["src/types/*"],
      "@constants/*": ["src/constants/*"],
      "@stores/*": ["src/stores/*"]
    }
  }
}
```

- [ ] **Step 2: 更新 vite.config.js alias**

打开 `vite.config.js`，在 `resolve.alias` 中添加：

```js
export default defineConfig({
  resolve: {
    alias: {
      'react-i18next': path.resolve(process.cwd(), 'src/i18n/react-i18next.ts'),
      '@': path.resolve(__dirname, 'src'),
      '@views': path.resolve(__dirname, 'src/views'),
      '@components': path.resolve(__dirname, 'src/components'),
      '@hooks': path.resolve(__dirname, 'src/hooks'),
      '@services': path.resolve(__dirname, 'src/services'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@types': path.resolve(__dirname, 'src/types'),
      '@constants': path.resolve(__dirname, 'src/constants'),
      '@stores': path.resolve(__dirname, 'src/stores'),
    }
  }
})
```

- [ ] **Step 3: 验证配置**

运行: `npm run typecheck`
预期: 通过（路径别名不影响现有代码）

- [ ] **Step 4: 提交**

```bash
git add tsconfig.json vite.config.js
git commit -m "refactor: add path aliases for new directory structure"
```

---

### Task 2: 创建新目录骨架

**Files:**
- Create: `src/views/`
- Create: `src/services/`
- Create: `src/constants/`
- Create: `server/controllers/`
- Create: `server/models/`
- Create: `server/websocket/`

- [ ] **Step 1: 创建前端目录**

```bash
mkdir -p src/views
mkdir -p src/services
mkdir -p src/constants
mkdir -p src/hooks/chat
mkdir -p src/hooks/editor
mkdir -p src/hooks/api
mkdir -p src/hooks/shared
mkdir -p src/utils/chat
mkdir -p src/utils/editor
mkdir -p src/utils/git
mkdir -p src/utils/shared
mkdir -p src/components/common
```

- [ ] **Step 2: 创建后端目录**

```bash
mkdir -p server/controllers
mkdir -p server/models
mkdir -p server/websocket/handlers
mkdir -p server/websocket/middleware
```

- [ ] **Step 3: 创建 .gitkeep 保持空目录**

```bash
touch src/views/.gitkeep
touch src/services/.gitkeep
touch src/constants/.gitkeep
touch server/controllers/.gitkeep
touch server/models/.gitkeep
touch server/websocket/.gitkeep
```

- [ ] **Step 4: 提交**

```bash
git add src/views src/services src/constants server/controllers server/models server/websocket
git commit -m "refactor: create new directory skeleton"
```

---

## 阶段 1: 前端迁移

### Task 3: 移动页面组件到 views/

**Files:**
- Create: `src/views/ChatPage/index.tsx`
- Create: `src/views/HooksPage/index.tsx`
- Create: `src/views/HookEditorPage/index.tsx`
- Create: `src/views/HookExecutionDetailPage/index.tsx`
- Create: `src/views/HookExecutionsPage/index.tsx`
- Create: `src/views/HookSourcePage/index.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 移动 Hooks 页面组件**

```bash
git mv src/components/hooks/view/HooksPage.tsx src/views/HooksPage/index.tsx
git mv src/components/hooks/view/HookEditorPage.tsx src/views/HookEditorPage/index.tsx
git mv src/components/hooks/view/HookExecutionDetailPage.tsx src/views/HookExecutionDetailPage/index.tsx
git mv src/components/hooks/view/HookExecutionsPage.tsx src/views/HookExecutionsPage/index.tsx
git mv src/components/hooks/view/HookSourcePage.tsx src/views/HookSourcePage/index.tsx
git mv src/components/hooks/view/HooksOverviewContent.tsx src/views/HooksPage/OverviewContent.tsx
git mv src/components/hooks/view/HooksOverviewModal.tsx src/views/HooksPage/OverviewModal.tsx
git mv src/components/hooks/view/subcomponents src/views/HooksPage/subcomponents
```

- [ ] **Step 2: 更新 App.tsx 中的导入路径**

打开 `src/App.tsx`，将：

```tsx
import HooksPage from './components/hooks/view/HooksPage';
import HookEditorPage from './components/hooks/view/HookEditorPage';
import HookExecutionDetailPage from './components/hooks/view/HookExecutionDetailPage';
import HookExecutionsPage from './components/hooks/view/HookExecutionsPage';
import HookSourcePage from './components/hooks/view/HookSourcePage';
```

改为：

```tsx
import HooksPage from './views/HooksPage';
import HookEditorPage from './views/HookEditorPage';
import HookExecutionDetailPage from './views/HookExecutionDetailPage';
import HookExecutionsPage from './views/HookExecutionsPage';
import HookSourcePage from './views/HookSourcePage';
```

- [ ] **Step 3: 更新 Hooks 页面内部导入**

由于组件移动，需要更新 `src/views/HooksPage/index.tsx` 中的导入：

将：
```tsx
import HooksOverviewContent from './HooksOverviewContent';
import HooksOverviewModal from './HooksOverviewModal';
```

改为：
```tsx
import HooksOverviewContent from './OverviewContent';
import HooksOverviewModal from './OverviewModal';
```

- [ ] **Step 4: 验证**

运行: `npm run typecheck`
预期: 通过

- [ ] **Step 5: 提交**

```bash
git add src/views src/App.tsx
git commit -m "refactor: move page components to views/"
```

---

### Task 4: 合并 chat 和 chat-v2 到 components/chat/

**Files:**
- Modify: `src/components/chat/` (合并目标)
- Delete: `src/components/chat-v2/` (合并后删除)

- [ ] **Step 1: 移动 chat-v2/components 到 chat/components-v2**

```bash
mkdir -p src/components/chat/components-v2
git mv src/components/chat-v2/components/* src/components/chat/components-v2/
```

- [ ] **Step 2: 移动 chat-v2/hooks 到 chat/hooks**

```bash
git mv src/components/chat-v2/hooks src/components/chat/
```

- [ ] **Step 3: 移动 chat-v2/store 到 chat/store**

```bash
git mv src/components/chat-v2/store src/components/chat/
```

- [ ] **Step 4: 移动 chat-v2/projection 到 chat/projection**

```bash
git mv src/components/chat-v2/projection src/components/chat/
```

- [ ] **Step 5: 移动 chat-v2/api 到 services/**

```bash
git mv src/components/chat-v2/api/fetchSessionHistory.ts src/services/chatHistoryService.ts
```

- [ ] **Step 6: 移动 chat-v2/types**

```bash
git mv src/components/chat-v2/types src/components/chat/
```

- [ ] **Step 7: 更新所有导入路径**

在 `src/components/chat/` 下，将所有对 chat-v2 的引用更新：

查找: `from ['"]\.\.?/.*chat-v2/`
替换为: `from './chat/`

具体文件需要更新：
- `src/components/chat/components-v2/*` 中的相对导入
- `src/components/chat/hooks/*` 中的导入
- `src/components/chat/store/*` 中的导入
- `src/components/chat/projection/*` 中的导入
- `src/services/chatHistoryService.ts` 中的导入

- [ ] **Step 8: 删除空的 chat-v2 目录**

```bash
rm -rf src/components/chat-v2
```

- [ ] **Step 9: 验证**

运行: `npm run typecheck`
预期: 通过

- [ ] **Step 10: 提交**

```bash
git add src/components/chat src/services src/components/chat-v2
git commit -m "refactor: merge chat-v2 into components/chat/"
```

---

### Task 5: 重组 hooks/ 按域分组

**Files:**
- Move: `src/hooks/*`

- [ ] **Step 1: 分类现有 hooks**

当前 hooks 目录包含：
- `activeTabPersistence.ts` → shared
- `useDeviceSettings.ts` → shared
- `useLocalStorage.jsx` → shared
- `useProjectsRouteSelection.ts` → api (与项目路由相关)
- `useProjectsState.ts` → api
- `useSessionProtection.ts` → shared
- `useUiPreferences.ts` → shared
- `useVersionCheck.ts` → shared

- [ ] **Step 2: 移动 hooks 到对应域**

```bash
git mv src/hooks/useProjectsRouteSelection.ts src/hooks/api/
git mv src/hooks/useProjectsState.ts src/hooks/api/
git mv src/hooks/activeTabPersistence.ts src/hooks/shared/
git mv src/hooks/useDeviceSettings.ts src/hooks/shared/
git mv src/hooks/useLocalStorage.jsx src/hooks/shared/
git mv src/hooks/useSessionProtection.ts src/hooks/shared/
git mv src/hooks/useUiPreferences.ts src/hooks/shared/
git mv src/hooks/useVersionCheck.ts src/hooks/shared/
```

- [ ] **Step 3: 移动测试文件**

```bash
git mv src/hooks/activeTabPersistence.test.mjs src/hooks/shared/
git mv src/hooks/useProjectsRouteSelection.test.mjs src/hooks/api/
git mv src/hooks/useProjectsState.test.mjs src/hooks/api/
```

- [ ] **Step 4: 更新 tsconfig.json include**

确保 `tsconfig.json` 的 `include` 包含新的 hooks 子目录：
```json
"include": ["src", "shared", "vite.config.js"]
```
这已经通过 `src/**` 覆盖，无需修改。

- [ ] **Step 5: 更新导入引用**

查找所有导入这些 hooks 的文件，更新路径：

- `useProjectsRouteSelection` 和 `useProjectsState` 的导入者需要更新路径为 `@hooks/api/...`
- 其他 hooks 更新为 `@hooks/shared/...`

- [ ] **Step 6: 验证**

运行: `npm run typecheck`
预期: 通过

- [ ] **Step 7: 提交**

```bash
git add src/hooks
git commit -m "refactor: organize hooks by domain (chat/editor/api/shared)"
```

---

### Task 6: 创建 services/ 并抽取 API 调用

**Files:**
- Create: `src/services/chatService.ts`
- Create: `src/services/projectService.ts`
- Create: `src/services/sessionService.ts`

- [ ] **Step 1: 从现有代码中找出 API 调用**

查找包含 `fetch`、`axios`、WebSocket 消息的文件：

```bash
grep -r "fetch\|websocket" src/components --include="*.ts" --include="*.tsx" | head -20
```

- [ ] **Step 2: 创建 chatService.ts**

创建 `src/services/chatService.ts`：

```typescript
import { fetchSessionHistory } from './chatHistoryService';

export class ChatService {
  async getSessionHistory(sessionId: string) {
    return fetchSessionHistory(sessionId);
  }

  // 从 chat-v2/api 抽取的其他方法
}

export const chatService = new ChatService();
```

- [ ] **Step 3: 创建 projectService.ts**

创建 `src/services/projectService.ts`：

```typescript
export interface Project {
  id: string;
  name: string;
  path: string;
}

export class ProjectService {
  async getProjects(): Promise<Project[]> {
    // 从 src/hooks/api/useProjectsState.ts 抽取
    const response = await fetch('/api/projects');
    return response.json();
  }

  async selectProject(projectId: string): Promise<void> {
    await fetch(`/api/projects/${projectId}/select`, { method: 'POST' });
  }
}

export const projectService = new ProjectService();
```

- [ ] **Step 4: 创建 sessionService.ts**

创建 `src/services/sessionService.ts`：

```typescript
export interface Session {
  id: string;
  projectId: string;
  createdAt: string;
}

export class SessionService {
  async getSessions(projectId: string): Promise<Session[]> {
    const response = await fetch(`/api/sessions?projectId=${projectId}`);
    return response.json();
  }

  async createSession(projectId: string): Promise<Session> {
    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId })
    });
    return response.json();
  }
}

export const sessionService = new SessionService();
```

- [ ] **Step 5: 验证**

运行: `npm run typecheck`
预期: 通过

- [ ] **Step 6: 提交**

```bash
git add src/services
git commit -m "refactor: create services layer for API calls"
```

---

### Task 7: 创建 constants/ 目录并集中常量

**Files:**
- Create: `src/constants/models.ts`
- Create: `src/constants/keys.ts`

- [ ] **Step 1: 从各处收集常量**

查找项目中的常量定义：

```bash
grep -r "export const" src --include="*.ts" | grep -i "model\|key\|constant" | head -20
```

- [ ] **Step 2: 创建 models.ts**

从 `shared/modelConstants.js` 移植到 `src/constants/models.ts`：

```typescript
export const SUPPORTED_MODELS = {
  claude: [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
  ],
  gemini: [
    'gemini-2.0-flash-exp',
  ]
} as const;

export type ModelId = typeof SUPPORTED_MODELS[keyof typeof SUPPORTED_MODELS][number];
```

- [ ] **Step 3: 创建 keys.ts**

集中管理 localStorage keys、query keys 等：

```typescript
export const STORAGE_KEYS = {
  UI_PREFERENCES: 'cc-ui-preferences',
  PROJECT_SELECTION: 'cc-project-selection',
  SESSION_PROTECTION: 'cc-session-protection',
} as const;

export const QUERY_KEYS = {
  PROJECTS: 'projects',
  SESSIONS: 'sessions',
  CHAT_HISTORY: 'chat-history',
} as const;
```

- [ ] **Step 4: 更新使用这些常量的文件**

将散落在各处的常量字面量替换为 `@constants/...` 的引用

- [ ] **Step 5: 验证**

运行: `npm run typecheck`
预期: 通过

- [ ] **Step 6: 提交**

```bash
git add src/constants
git commit -m "refactor: centralize constants in src/constants/"
```

---

## 阶段 2: 后端迁移

### Task 8: 抽离路由定义到 routes/

**Files:**
- Modify: `server/index.js`
- Create: `server/routes/index.js`

- [ ] **Step 1: 创建 routes/index.js**

创建 `server/routes/index.js` 作为路由聚合：

```javascript
import express from 'express';
import authRoutes from './auth.js';
import projectRoutes from './projects.js';
import sessionRoutes from './sessions.js';
import gitRoutes from './git.js';
import mcpRoutes from './mcp.js';
import taskmasterRoutes from './taskmaster.js';
import settingsRoutes from './settings.js';
import agentRoutes from './agent.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/projects', projectRoutes);
router.use('/sessions', sessionRoutes);
router.use('/git', gitRoutes);
router.use('/mcp', mcpRoutes);
router.use('/taskmaster', taskmasterRoutes);
router.use('/settings', settingsRoutes);
router.use('/agent', agentRoutes);

export default router;
```

- [ ] **Step 2: 验证现有 routes 目录**

现有 `server/routes/` 已经包含各路由文件，保持不变

- [ ] **Step 3: 提交**

```bash
git add server/routes
git commit -m "refactor: create routes aggregator"
```

---

### Task 9: 移动 agent-v2 到 services/agent/

**Files:**
- Move: `server/agent-v2/*` → `server/services/agent/`

- [ ] **Step 1: 创建 services/agent 目录**

```bash
mkdir -p server/services/agent
```

- [ ] **Step 2: 移动所有 agent-v2 文件**

```bash
git mv server/agent-v2/application server/services/agent/
git mv server/agent-v2/domain server/services/agent/
git mv server/agent-v2/runtime server/services/agent/
git mv server/agent-v2/history server/services/agent/
git mv server/agent-v2/debug server/services/agent/
git mv server/agent-v2/test-support server/services/agent/
git mv server/agent-v2/default-services.js server/services/agent/
git mv server/agent-v2/create-agent-v2-services.js server/services/agent/application/
```

- [ ] **Step 3: 更新 server/index.js 中的导入**

将：
```javascript
import { handleClaudeCommandWithAgentV2 } from './agent-v2/application/handle-claude-command.js';
```

改为：
```javascript
import { handleClaudeCommandWithAgentV2 } from './services/agent/application/handle-claude-command.js';
```

- [ ] **Step 4: 更新 server/routes/agent-v2.js 中的导入**

打开 `server/routes/agent-v2.js`，更新所有对 `../../agent-v2/` 的引用为 `../../services/agent/`

- [ ] **Step 5: 删除空的 agent-v2 目录**

```bash
rm -rf server/agent-v2
```

- [ ] **Step 6: 验证**

运行: `npm run typecheck` (如果后端有类型检查)
或 `npm run test` 确保测试通过

- [ ] **Step 7: 提交**

```bash
git add server/services/agent server/index.js server/routes/agent-v2.js server/agent-v2
git commit -m "refactor: move agent-v2 to services/agent/"
```

---

### Task 10: 创建 controllers/ 目录

**Files:**
- Create: `server/controllers/projectController.js`
- Create: `server/controllers/sessionController.js`
- Create: `server/controllers/gitController.js`

- [ ] **Step 1: 从 server/routes/projects.js 抽离控制器**

打开 `server/routes/projects.js`，将业务逻辑抽离到 `server/controllers/projectController.js`：

```javascript
// server/controllers/projectController.js
export async function getProjects(req, res) {
  try {
    const projects = await req.app.locals.projectsService.list();
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

export async function selectProject(req, res) {
  try {
    const { projectId } = req.params;
    await req.app.locals.projectsService.select(projectId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

- [ ] **Step 2: 更新 routes/projects.js 使用控制器**

```javascript
import express from 'express';
import * as projectController from '../controllers/projectController.js';

const router = express.Router();

router.get('/', projectController.getProjects);
router.post('/:projectId/select', projectController.selectProject);

export default router;
```

- [ ] **Step 3: 创建其他控制器**

类似地创建：
- `server/controllers/sessionController.js`
- `server/controllers/gitController.js`
- `server/controllers/mcpController.js`
- `server/controllers/agentController.js`

- [ ] **Step 4: 提交**

```bash
git add server/controllers server/routes
git commit -m "refactor: extract controllers from routes"
```

---

### Task 11: 创建 websocket/ 目录

**Files:**
- Create: `server/websocket/handlers/chatHandler.js`
- Create: `server/websocket/handlers/shellHandler.js`
- Create: `server/websocket/utils.js`

- [ ] **Step 1: 从 server/index.js 抽离 WebSocket 处理**

打开 `server/index.js`，找到 `handleChatConnection` 和 `handleShellConnection` 函数

- [ ] **Step 2: 创建 chatHandler.js**

创建 `server/websocket/handlers/chatHandler.js`：

```javascript
export function handleChatConnection(ws, req) {
  // 从 server/index.js 的 handleChatConnection 移动过来
  // ...
}
```

- [ ] **Step 3: 创建 shellHandler.js**

创建 `server/websocket/handlers/shellHandler.js`：

```javascript
export function handleShellConnection(ws, req) {
  // 从 server/index.js 的 handleShellConnection 移动过来
  // ...
}
```

- [ ] **Step 4: 创建 websocket/utils.js**

移动 WebSocket 相关工具函数

- [ ] **Step 5: 更新 server/index.js**

```javascript
import { handleChatConnection } from './websocket/handlers/chatHandler.js';
import { handleShellConnection } from './websocket/handlers/shellHandler.js';
```

- [ ] **Step 6: 提交**

```bash
git add server/websocket server/index.js
git commit -m "refactor: extract WebSocket handlers to websocket/"
```

---

### Task 12: 创建 models/ 目录

**Files:**
- Create: `server/models/Session.js`
- Create: `server/models/Project.js`

- [ ] **Step 1: 创建 models 目录**

```bash
mkdir -p server/models/schemas
```

- [ ] **Step 2: 创建 Session 模型**

创建 `server/models/Session.js`：

```javascript
export class Session {
  constructor(id, projectId, createdAt) {
    this.id = id;
    this.projectId = projectId;
    this.createdAt = createdAt;
  }

  static fromDb(row) {
    return new Session(row.id, row.project_id, row.created_at);
  }
}
```

- [ ] **Step 3: 创建 Project 模型**

创建 `server/models/Project.js`：

```javascript
export class Project {
  constructor(id, name, path) {
    this.id = id;
    this.name = name;
    this.path = path;
  }
}
```

- [ ] **Step 4: 提交**

```bash
git add server/models
git commit -m "refactor: create models layer for data structures"
```

---

## 阶段 3: 验证与收尾

### Task 13: 全量导入路径更新

**Files:**
- Modify: 所有受影响的文件

- [ ] **Step 1: 查找所有需要更新的导入**

```bash
grep -r "from.*components/chat-v2" src --include="*.ts" --include="*.tsx"
grep -r "from.*agent-v2" server --include="*.js"
grep -r "from.*hooks/view" src --include="*.ts" --include="*.tsx"
```

- [ ] **Step 2: 批量更新导入路径**

使用 IDE 的重构功能或手动更新：

| 原导入模式 | 新导入模式 |
|-----------|-----------|
| `from '../../components/chat-v2/...'` | `from '@components/chat/...'` |
| `from '../../../agent-v2/...'` | `from '../../../services/agent/...'` |
| `from '../../hooks/view/...'` | `from '@views/...'` |
| `from '../../hooks/...'` | `from '@hooks/...'` |

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "refactor: update all import paths after directory restructure"
```

---

### Task 14: 最终验证

**Files:**
- Test: 所有测试文件

- [ ] **Step 1: 运行类型检查**

运行: `npm run typecheck`
预期: 通过，无类型错误

- [ ] **Step 2: 运行 Lint**

运行: `npm run lint`
预期: 通过，无 lint 错误

- [ ] **Step 3: 运行测试**

运行: `npm run test`
预期: 所有测试通过

- [ ] **Step 4: 启动开发服务器验证**

运行: `npm run dev`
预期: 服务器正常启动，无错误日志

- [ ] **Step 5: 手动测试核心功能**

1. 打开浏览器访问 `http://localhost:5173`
2. 检查聊天功能是否正常
3. 检查侧边栏项目列表
4. 检查代码编辑器
5. 检查 Hooks 页面

- [ ] **Step 6: 提交验证通过标记**

```bash
git commit --allow-empty -m "refactor: directory restructure verified and complete"
```

---

### Task 15: 更新文档

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 更新 CLAUDE.md 中的目录结构描述**

打开 `CLAUDE.md`，更新"前端组件结构"和"后端目录结构"部分，反映新的目录组织：

将旧的路径描述更新为：
- 前端: `src/views/`, `src/components/`, `src/hooks/`, `src/services/`, `src/utils/`, `src/types/`, `src/constants/`
- 后端: `server/routes/`, `server/controllers/`, `server/services/`, `server/models/`, `server/websocket/`, `server/middleware/`

- [ ] **Step 2: 提交**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for new directory structure"
```

---

## 完成标准

- [ ] 所有文件移动到新位置
- [ ] 所有 import 路径更新
- [ ] `npm run typecheck` 通过
- [ ] `npm run lint` 通过
- [ ] `npm run test` 通过
- [ ] 核心功能手动测试通过
- [ ] CLAUDE.md 更新完成
