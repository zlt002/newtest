# 目录架构重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成目录架构重构的剩余工作，实现清晰的分层架构和统一组织原则。

**Architecture:** 采用技术层驱动架构，前后端保持一致：routes（路由）→ controllers（控制器）→ services（业务逻辑）→ models（数据层）。

**Tech Stack:** Node.js/Express (后端), React/TypeScript (前端)

---

## Phase 1: 后端路由与控制器分离

### Task 1.1: 创建 GitController（从 git.js 抽离业务逻辑）

**Files:**
- Create: `server/controllers/gitController.js`
- Modify: `server/routes/git.js`

- [ ] **Step 1: 创建 gitController.js 基础结构**

```javascript
// server/controllers/gitController.js
import { spawn } from 'child_process';
import path from 'path';
import { extractProjectDirectory } from '../projects.js';
import { getClaudeAgentSdk } from '../utils/langsmith-claude-sdk.js';
import { resolveProjectEditorFilePath } from '../utils/resolveProjectEditorFilePath.js';

const COMMIT_DIFF_CHARACTER_LIMIT = 500_000;

function spawnAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      shell: false,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const error = new Error(`Command failed: ${command} ${args.join(' ')}`);
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

function validateCommitRef(commit) {
  if (!/^[a-zA-Z0-9._~^{}@\/-]+$/.test(commit)) {
    throw new Error('Invalid commit reference');
  }
  return commit;
}

function validateBranchName(branch) {
  if (!/^[a-zA-Z0-9._\/-]+$/.test(branch)) {
    throw new Error('Invalid branch name');
  }
  return branch;
}

function validateFilePath(file, projectPath) {
  if (!file || file.includes('\0')) {
    throw new Error('Invalid file path');
  }
  if (projectPath) {
    const resolved = path.resolve(projectPath, file);
    const normalizedRoot = path.resolve(projectPath) + path.sep;
    if (!resolved.startsWith(normalizedRoot) && resolved !== path.resolve(projectPath)) {
      throw new Error('Invalid file path: path traversal detected');
    }
  }
  return file;
}

function validateRemoteName(remote) {
  if (!remote || !/^[a-zA-Z0-9._-]+$/.test(remote)) {
    throw new Error('Invalid remote name');
  }
  return remote;
}

function validateIntegerParameter(value, { fieldName, allowZero = false }) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const normalized = String(value).trim();
  const integerPattern = allowZero ? /^(?:0|[1-9]\d*)$/ : /^(?:[1-9]\d*)$/;
  if (!integerPattern.test(normalized)) {
    throw new Error(`${fieldName} must be a ${allowZero ? 'non-negative' : 'positive'} integer`);
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${fieldName} is too large`);
  }
  return parsed;
}

export const gitController = {
  spawnAsync,
  validateCommitRef,
  validateBranchName,
  validateFilePath,
  validateRemoteName,
  validateIntegerParameter,
  COMMIT_DIFF_CHARACTER_LIMIT,
};
```

- [ ] **Step 2: 运行 typecheck 确保无语法错误**

```bash
npm run typecheck
```

Expected: PASS（gitController.js 是 JS 文件，无需类型检查）

- [ ] **Step 3: 提交 gitController.js**

```bash
git add server/controllers/gitController.js
git commit -m "refactor: create gitController with business logic from routes"
```

- [ ] **Step 4: 更新 git.js 使用 gitController**

```javascript
// server/routes/git.js
import express from 'express';
import { gitController } from '../controllers/gitController.js';
import { extractProjectDirectory } from '../projects.js';

const router = express.Router();

// 使用 gitController 的方法替代内联函数
router.post('/diff', async (req, res, next) => {
  try {
    const { projectPath } = await extractProjectDirectory(req.body.projectId);
    const commitA = gitController.validateCommitRef(req.body.a);
    const commitB = gitController.validateCommitRef(req.body.b);

    const { stdout } = await gitController.spawnAsync('git', [
      '-C', projectPath,
      'diff', `${commitA}..${commitB}`,
    ]);

    if (stdout.length > gitController.COMMIT_DIFF_CHARACTER_LIMIT) {
      res.status(400).json({ error: 'Diff too large' });
      return;
    }

    res.json({ diff: stdout });
  } catch (error) {
    next(error);
  }
});

// ... 其他路由类似处理
```

- [ ] **Step 5: 运行测试验证变更**

```bash
npm test
```

Expected: 现有测试通过

- [ ] **Step 6: 提交 git.js 更新**

```bash
git add server/routes/git.js
git commit -m "refactor: git routes use gitController"
```

---

### Task 1.2: 创建 ProjectController（从 projects.js 抽离业务逻辑）

**Files:**
- Create: `server/controllers/projectController.js`
- Modify: `server/routes/projects.js`

- [ ] **Step 1: 创建 projectController.js**

```javascript
// server/controllers/projectController.js
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import os from 'os';

export const WORKSPACES_ROOT = process.env.WORKSPACES_ROOT || os.homedir();

export const FORBIDDEN_PATHS = [
  '/', '/etc', '/bin', '/sbin', '/usr', '/dev', '/proc', '/sys', '/var', '/boot', '/root', '/lib', '/lib64', '/opt', '/tmp', '/run',
  'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\ProgramData', 'C:\\System Volume Information', 'C:\\$Recycle.Bin'
];

export async function validateWorkspacePath(requestedPath) {
  try {
    let absolutePath = path.resolve(requestedPath);
    const normalizedPath = path.normalize(absolutePath);

    if (FORBIDDEN_PATHS.includes(normalizedPath) || normalizedPath === '/') {
      return { valid: false, error: 'Cannot use system-critical directories as workspace locations' };
    }

    try {
      const stats = await fs.stat(absolutePath);
      if (!stats.isDirectory()) {
        return { valid: false, error: 'Path exists but is not a directory' };
      }
    } catch (statError) {
      if (statError.code !== 'ENOENT') {
        return { valid: false, error: statError.message };
      }
    }

    return { valid: true, resolvedPath: absolutePath };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

export function getOpenDirectoryCommand(targetPath, platform = process.platform) {
  if (platform === 'darwin') {
    return { command: 'open', args: [targetPath] };
  }
  if (platform === 'win32') {
    return { command: 'explorer.exe', args: [targetPath] };
  }
  if (platform === 'linux') {
    return { command: 'xdg-open', args: [targetPath] };
  }
  throw new Error(`Unsupported platform: ${platform}`);
}

export async function detectWorkspaceTypeForPath(targetPath) {
  try {
    const stats = await fs.stat(targetPath);
    if (!stats.isDirectory()) {
      throw new Error('Path exists but is not a directory');
    }
    const entries = await fs.readdir(targetPath);
    if (entries.length > 0) {
      return 'existing';
    }
    return 'new';
  } catch (error) {
    if (error.code === 'ENOENT') {
      return 'new';
    }
    throw error;
  }
}

export function resolveProjectPreviewFilePath(projectRoot, relativePath) {
  if (!relativePath || relativePath.trim() === '') {
    return null;
  }
  if (relativePath.includes('..')) {
    return null;
  }
  const resolved = path.resolve(projectRoot, relativePath);
  const normalizedRoot = path.resolve(projectRoot);
  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    return null;
  }
  return resolved;
}

export const projectController = {
  WORKSPACES_ROOT,
  FORBIDDEN_PATHS,
  validateWorkspacePath,
  getOpenDirectoryCommand,
  detectWorkspaceTypeForPath,
  resolveProjectPreviewFilePath,
};
```

- [ ] **Step 2: 提交 projectController.js**

```bash
git add server/controllers/projectController.js
git commit -m "refactor: create projectController with business logic"
```

- [ ] **Step 3: 更新 projects.js 测试文件导入**

```javascript
// server/routes/projects.test.mjs
// 更新导入路径
import {
  clearProjectDirectoryCache,
  getProjects,
  getSessions
} from '../projects.js';
import {
  getOpenDirectoryCommand,
  detectWorkspaceTypeForPath,
  resolveProjectPreviewFilePath
} from '../controllers/projectController.js';
```

- [ ] **Step 4: 运行相关测试**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/routes/projects.test.mjs
```

Expected: 所有测试通过（修复之前失败的 2 个测试）

- [ ] **Step 5: 提交测试修复**

```bash
git add server/routes/projects.test.mjs server/routes/projects.js
git commit -m "refactor: projects routes use projectController, fix imports"
```

---

### Task 1.3: 重命名 agent-v2.js 为 agent.js

**Files:**
- Rename: `server/routes/agent-v2.js` → `server/routes/agent.js`
- Modify: `server/routes/index.js`

- [ ] **Step 1: 使用 git mv 重命名文件**

```bash
git mv server/routes/agent-v2.js server/routes/agent.js
```

- [ ] **Step 2: 更新 index.js 导入**

```javascript
// server/routes/index.js
// 将 agentV2Routes 改为 agentRoutes
import agentRoutes from './agent.js';

export {
  // ...
  agentRoutes,
};

export default {
  // ...
  agent: agentRoutes,
};
```

- [ ] **Step 3: 搜索并更新所有导入 agent-v2 路由的地方**

```bash
grep -r "agent-v2" server/ --include="*.js" | grep -v ".git"
```

在 `server/index.js` 中更新：
```javascript
// 将
import { agentV2Routes } from './routes/index.js';
// 改为
import { agentRoutes } from './routes/index.js';

// 将
app.use('/api/agent-v2', agentV2Routes);
// 改为
app.use('/api/agent', agentRoutes);
```

- [ ] **Step 4: 运行测试验证**

```bash
npm run typecheck && npm test
```

Expected: 类型检查通过，测试通过

- [ ] **Step 5: 提交重命名**

```bash
git add server/routes/agent.js server/routes/index.js server/index.js
git commit -m "refactor: rename agent-v2 route to agent"
```

---

## Phase 2: 前端 hooks 按域重组

### Task 2.1: 创建 src/hooks/chat/ 并移动 hooks

**Files:**
- Create: `src/hooks/chat/` (directory)
- Move: `src/components/chat/hooks/*` → `src/hooks/chat/*`

- [ ] **Step 1: 创建 hooks/chat 目录结构**

```bash
mkdir -p src/hooks/chat
```

- [ ] **Step 2: 使用 git mv 移动 hooks 文件**

```bash
cd src/components/chat/hooks
git move_files .
```

具体移动命令：
```bash
# 从 src/components/chat/hooks 移动到 src/hooks/chat
git mv src/components/chat/hooks/*.ts src/hooks/chat/
git mv src/components/chat/hooks/*.tsx src/hooks/chat/
git mv src/components/chat/hooks/*.js src/hooks/chat/
```

- [ ] **Step 3: 移动测试文件**

```bash
git mv src/components/chat/hooks/*.test.mjs src/hooks/chat/
```

- [ ] **Step 4: 更新所有导入路径**

在受影响的文件中：
```typescript
// 将
import { useChatMessages } from '../hooks/useChatMessages';
// 改为
import { useChatMessages } from '@/hooks/chat/useChatMessages';

// 将
import { useChatSessionState } from '../../hooks/useChatSessionState';
// 改为
import { useChatSessionState } from '@/hooks/chat/useChatSessionState';
```

- [ ] **Step 5: 运行 typecheck**

```bash
npm run typecheck
```

Expected: 类型检查通过（可能有路径别名问题，需要修复）

- [ ] **Step 6: 提交 hooks 移动**

```bash
git add src/hooks/chat/ src/components/
git commit -m "refactor: move chat hooks to src/hooks/chat/"
```

---

### Task 2.2: 移动 chat utils 到 src/utils/chat/

**Files:**
- Create: `src/utils/chat/` (directory)
- Move: `src/components/chat/utils/*` → `src/utils/chat/*`

- [ ] **Step 1: 创建 utils/chat 目录**

```bash
mkdir -p src/utils/chat
```

- [ ] **Step 2: 移动 utils 文件**

```bash
git mv src/components/chat/utils/*.ts src/utils/chat/
git mv src/components/chat/utils/*.js src/utils/chat/
git mv src/components/chat/utils/*.test.mjs src/utils/chat/
```

- [ ] **Step 3: 更新导入路径**

```typescript
// 将
import { formatMessage } from '../utils/chatFormatting';
// 改为
import { formatMessage } from '@/utils/chat/chatFormatting';
```

- [ ] **Step 4: 运行测试验证**

```bash
npm run typecheck && npm test
```

Expected: 测试通过

- [ ] **Step 5: 提交 utils 移动**

```bash
git add src/utils/chat/ src/components/chat/
git commit -m "refactor: move chat utils to src/utils/chat/"
```

---

### Task 2.3: 移动 chat types 到 src/types/chat/

**Files:**
- Create: `src/types/chat/` (directory)
- Move: `src/components/chat/types/*` → `src/types/chat/*`

- [ ] **Step 1: 创建 types/chat 目录**

```bash
mkdir -p src/types/chat
```

- [ ] **Step 2: 移动 types 文件**

```bash
git mv src/components/chat/types/*.ts src/types/chat/
```

- [ ] **Step 3: 更新导入路径**

```typescript
// 将
import type { Message } from '../types/types';
// 改为
import type { Message } from '@/types/chat/types';
```

- [ ] **Step 4: 运行 typecheck**

```bash
npm run typecheck
```

Expected: 类型检查通过

- [ ] **Step 5: 提交 types 移动**

```bash
git add src/types/chat/ src/components/chat/
git commit -m "refactor: move chat types to src/types/chat/"
```

---

### Task 2.4: 移动 chat store 到 src/stores/chat/

**Files:**
- Create: `src/stores/chat/` (directory)
- Move: `src/components/chat/store/*` → `src/stores/chat/*`

- [ ] **Step 1: 创建 stores/chat 目录**

```bash
mkdir -p src/stores/chat
```

- [ ] **Step 2: 移动 store 文件**

```bash
git mv src/components/chat/store/*.ts src/stores/chat/
git mv src/components/chat/store/*.test.mjs src/stores/chat/
```

- [ ] **Step 3: 更新导入路径**

```typescript
// 将
import { useAgentEventStore } from '../store/createAgentEventStore';
// 改为
import { useAgentEventStore } from '@/stores/chat/createAgentEventStore';
```

- [ ] **Step 4: 运行测试验证**

```bash
npm run typecheck && npm test
```

Expected: 测试通过

- [ ] **Step 5: 提交 stores 移动**

```bash
git add src/stores/chat/ src/components/chat/
git commit -m "refactor: move chat stores to src/stores/chat/"
```

---

### Task 2.5: 移动 chat constants 到 src/constants/chat/

**Files:**
- Create: `src/constants/chat/` (directory)
- Move: `src/components/chat/constants/*` → `src/constants/chat/*`

- [ ] **Step 1: 创建 constants/chat 目录**

```bash
mkdir -p src/constants/chat
```

- [ ] **Step 2: 移动 constants 文件**

```bash
git mv src/components/chat/constants/*.ts src/constants/chat/
```

- [ ] **Step 3: 更新导入路径**

```typescript
// 将
import { THINKING_MODES } from '../constants/thinkingModes';
// 改为
import { THINKING_MODES } from '@/constants/chat/thinkingModes';
```

- [ ] **Step 4: 运行 typecheck**

```bash
npm run typecheck
```

Expected: 类型检查通过

- [ ] **Step 5: 提交 constants 移动**

```bash
git add src/constants/chat/ src/components/chat/
git commit -m "refactor: move chat constants to src/constants/chat/"
```

---

### Task 2.6: 移动 chat projection 到 src/components/chat/projection/

**Files:**
- Already in place, verify structure

- [ ] **Step 1: 验证 projection 目录结构**

```bash
ls src/components/chat/projection/
```

Expected: 包含 `projectConversationTurns.ts`, `projectRunCards.ts` 等

- [ ] **Step 2: 更新导入使用路径别名**

```typescript
// 将相对路径导入改为
import { projectConversationTurns } from '@/components/chat/projection/projectConversationTurns';
```

- [ ] **Step 3: 运行 typecheck**

```bash
npm run typecheck
```

Expected: 类型检查通过

- [ ] **Step 4: 提交导入更新**

```bash
git add src/components/chat/
git commit -m "refactor: use path aliases for chat projection imports"
```

---

## Phase 3: 失败测试修复

### Task 3.1: 修复 sidebar utils 测试

**Files:**
- Modify: `src/components/sidebar/utils/utils.test.mjs`

- [ ] **Step 1: 查看失败详情**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/sidebar/utils/utils.test.mjs
```

- [ ] **Step 2: 根据错误修复测试**

常见问题：导入路径变更后的更新
```javascript
// 更新导入路径
import { functionUnderTest } from './utils';
```

- [ ] **Step 3: 重新运行测试**

```bash
npm test
```

Expected: `utils.test.mjs` 通过

- [ ] **Step 4: 提交修复**

```bash
git add src/components/sidebar/utils/utils.test.mjs
git commit -m "fix: update sidebar utils test imports"
```

---

### Task 3.2: 修复 ChatMessagesPane 测试

**Files:**
- Modify: `src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`

- [ ] **Step 1: 查看测试代码**

检查是否有 mock 路径需要更新

- [ ] **Step 2: 更新 mock 路径**

```javascript
// 如果使用了 ../hooks/ 路径，更新为
import { useChatMessages } from '@/hooks/chat/useChatMessages';
```

- [ ] **Step 3: 运行测试**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs
```

Expected: 测试通过

- [ ] **Step 4: 提交修复**

```bash
git add src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs
git commit -m "fix: update ChatMessagesPane test for new import paths"
```

---

### Task 3.3: 修复 agentV2Realtime 测试

**Files:**
- Modify: `src/components/chat/view/agentV2Realtime.test.mjs`

- [ ] **Step 1: 更新导入路径**

```javascript
// 检查并更新所有相对路径导入为路径别名
```

- [ ] **Step 2: 运行测试**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/agentV2Realtime.test.mjs
```

Expected: 测试通过

- [ ] **Step 3: 提交修复**

```bash
git add src/components/chat/view/agentV2Realtime.test.mjs
git commit -m "fix: update agentV2Realtime test imports"
```

---

### Task 3.4: 修复历史记录相关测试

**Files:**
- Modify: `server/providers/claude/adapter.test.mjs`
- Modify: `server/routes/projects.test.mjs`

- [ ] **Step 1: 检查 legacy run overlay 测试**

问题可能与官方历史输出和 legacy run overlay 的处理有关

- [ ] **Step 2: 更新测试期望**

```javascript
// 根据新的历史记录格式更新测试断言
```

- [ ] **Step 3: 运行测试**

```bash
npm test
```

Expected: 所有测试通过

- [ ] **Step 4: 提交修复**

```bash
git add server/providers/claude/adapter.test.mjs server/routes/projects.test.mjs
git commit -m "fix: update history-related tests for official session format"
```

---

## Phase 4: 清理和验证

### Task 4.1: 删除空的 components/chat/hooks 目录

**Files:**
- Remove: `src/components/chat/hooks/` (if empty after move)

- [ ] **Step 1: 检查目录是否为空**

```bash
ls src/components/chat/hooks/
```

- [ ] **Step 2: 如果为空，删除目录**

```bash
git rm -r src/components/chat/hooks/
```

- [ ] **Step 3: 提交清理**

```bash
git add src/components/chat/
git commit -m "chore: remove empty chat/hooks directory"
```

---

### Task 4.2: 同样清理其他空目录

**Files:**
- Remove: `src/components/chat/utils/` (if empty)
- Remove: `src/components/chat/types/` (if empty)
- Remove: `src/components/chat/store/` (if empty)
- Remove: `src/components/chat/constants/` (if empty)

- [ ] **Step 1: 检查并列出空目录**

```bash
find src/components/chat -type d -empty
```

- [ ] **Step 2: 删除空目录**

```bash
# 对每个空目录执行
git rm -r src/components/chat/<empty-dir>/
```

- [ ] **Step 3: 提交清理**

```bash
git add src/components/chat/
git commit -m "chore: remove empty directories after refactor"
```

---

### Task 4.3: 运行完整测试套件

- [ ] **Step 1: 运行 typecheck**

```bash
npm run typecheck
```

Expected: ✅ PASS

- [ ] **Step 2: 运行 lint**

```bash
npm run lint
```

Expected: ✅ 无错误（警告可接受）

- [ ] **Step 3: 运行所有测试**

```bash
npm run test
```

Expected: ✅ 所有 226 个测试通过

- [ ] **Step 4: 启动开发服务器验证**

```bash
npm run dev
```

Expected: ✅ 服务器正常启动，无控制台错误

- [ ] **Step 5: 提交最终状态**

```bash
git add .
git commit -m "chore: directory refactoring complete, all tests passing"
```

---

### Task 4.4: 更新 CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 更新目录结构文档**

在 CLAUDE.md 中更新前端目录结构部分：

```markdown
### 前端目录结构

```
src/
├── views/                      # 路由页面级组件
├── components/                 # 可复用 UI 组件
│   ├── chat/                   # 聊天组件
│   │   ├── components/         # V2 组件
│   │   ├── projection/         # 投影层
│   │   ├── tools/              # 工具渲染
│   │   └── view/               # 视图组件
│   ├── sidebar/                # 侧边栏
│   ├── code-editor/            # 代码编辑器
│   └── ...
├── hooks/                      # 自定义 Hooks（按域分组）
│   ├── chat/                   # 聊天相关 hooks
│   ├── api/                    # API hooks
│   ├── editor/                 # 编辑器 hooks
│   └── shared/                 # 共享 hooks
├── services/                   # API 调用层
├── stores/                     # 状态管理
│   └── chat/                   # 聊天状态
├── utils/                      # 工具函数
│   └── chat/                   # 聊天工具
├── types/                      # TypeScript 类型
│   └── chat/                   # 聊天类型
├── constants/                  # 常量
│   └── chat/                   # 聊天常量
└── ...
```
```

- [ ] **Step 2: 更新后端目录结构**

```markdown
### 后端目录结构

```
server/
├── routes/                     # 路由定义
│   ├── index.js
│   ├── agent.js                # Agent 路由（原 agent-v2.js）
│   ├── auth.js
│   ├── projects.js
│   └── ...
├── controllers/                # 请求处理逻辑
│   ├── gitController.js
│   ├── projectController.js
│   └── ...
├── services/                   # 业务逻辑
│   ├── agent/                  # Agent V2
│   └── ...
└── ...
```
```

- [ ] **Step 3: 提交文档更新**

```bash
git add CLAUDE.md
git commit -m "docs: update directory structure in CLAUDE.md"
```

---

### Task 4.5: 更新设计文档状态

**Files:**
- Modify: `docs/superpowers/specs/2026-04-25-directory-refactoring-design.md`

- [ ] **Step 1: 更新完成标准**

将所有 `- [ ]` 改为 `- [x]`

```markdown
## 11. 完成标准

- [x] 所有文件移动到新位置
- [x] 所有 import 路径更新
- [x] `npm run typecheck` 通过
- [x] `npm run lint` 通过
- [x] `npm run test` 通过
- [x] 核心功能手动测试通过
- [x] CLAUDE.md 更新完成
```

- [ ] **Step 2: 更新状态**

```markdown
**状态**: 已完成
```

- [ ] **Step 3: 添加完成日期**

```markdown
**完成日期**: 2026-04-25
```

- [ ] **Step 4: 提交文档更新**

```bash
git add docs/superpowers/specs/2026-04-25-directory-refactoring-design.md
git commit -m "docs: mark directory refactoring as complete"
```

---

## 验收标准

完成所有任务后：

1. **目录结构清晰**
   - `src/hooks/chat/` 存在且包含所有聊天 hooks
   - `src/utils/chat/` 存在且包含所有聊天工具
   - `src/types/chat/` 存在且包含所有聊天类型
   - `src/stores/chat/` 存在且包含所有聊天状态
   - `src/constants/chat/` 存在且包含所有聊天常量
   - `server/controllers/` 存在且包含控制器

2. **代码质量**
   - `npm run typecheck` ✅ 无错误
   - `npm run lint` ✅ 无错误
   - `npm run test` ✅ 226/226 通过

3. **导入规范**
   - 使用路径别名 `@/` 而非相对路径
   - 无 `components-v2` 残留命名
   - 无 `agent-v2` 残留命名

4. **文档同步**
   - CLAUDE.md 反映新目录结构
   - 设计文档标记为完成
