# 目录架构重构设计文档

**日期**: 2026-04-25
**作者**: Claude
**状态**: 设计阶段

---

## 1. 问题陈述

当前 CC-UI 项目目录结构存在**不一致性**问题：

- 有的目录按**功能**组织（如 `chat/`、`sidebar/`）
- 有的目录按**类型/位置**组织（如 `main-content/`、`right-pane/`）
- `chat/` 和 `chat-v2/` 两个版本并存，造成混乱
- `agent-v2/` 在后端是独立目录，与其他服务组织方式不一致

这导致：
- 新人难以快速定位文件
- 代码放置缺乏明确规则
- 跨功能复用不清晰

---

## 2. 设计目标

1. **统一组织原则** — 采用**技术层驱动**架构，前后端保持一致
2. **消除冗余** — 合并 `chat` 和 `chat-v2`
3. **清晰分层** — 每个目录职责单一明确
4. **可扩展性** — 支持项目未来增长

---

## 3. 架构原则

**技术层驱动（Layered Architecture）**：按技术角色划分目录，而非业务域。

| 层级 | 职责 | 前端目录 | 后端目录 |
|------|------|----------|----------|
| 表现层 | 页面入口 | `views/` | `routes/` |
| 控制层 | 请求/事件处理 | - | `controllers/` |
| 组件层 | 可复用 UI | `components/` | - |
| 业务层 | 业务逻辑 | `services/` | `services/` |
| 数据层 | 状态/数据 | `stores/` | `models/` + `database/` |
| 工具层 | 通用工具 | `utils/` | `utils/` |
| 类型层 | 类型定义 | `types/` | `types/` |

---

## 4. 前端目录结构

```
src/
├── views/                      # 路由页面级组件
│   ├── ChatPage/
│   │   └── index.tsx
│   ├── HooksPage/
│   │   └── index.tsx
│   ├── HookEditorPage/
│   │   └── index.tsx
│   ├── HookExecutionDetailPage/
│   │   └── index.tsx
│   ├── HookExecutionsPage/
│   │   └── index.tsx
│   ├── HookSourcePage/
│   │   └── index.tsx
│   └── AppPage/
│       └── index.tsx
│
├── components/                 # 可复用 UI 组件（按功能域分组）
│   ├── chat/                   # 聊天组件（合并 chat + chat-v2）
│   │   ├── ChatInterface.tsx
│   │   ├── MessageList.tsx
│   │   ├── AssistantTurn.tsx
│   │   ├── RunCard.tsx
│   │   ├── ConversationStream.tsx
│   │   └── tools/             # 工具渲染子系统
│   │       ├── components/
│   │       │   ├── OneLineDisplay.tsx
│   │       │   ├── CollapsibleDisplay.tsx
│   │       │   ├── CollapsibleSection.tsx
│   │       │   └── ContentRenderers/
│   │       │       ├── ToolDiffViewer.tsx
│   │       │       ├── MarkdownContent.tsx
│   │       │       ├── FileListContent.tsx
│   │       │       ├── TodoListContent.tsx
│   │       │       ├── TaskListContent.tsx
│   │       │       └── TextContent.tsx
│   │       ├── configs/
│   │       │   └── toolConfigs.ts
│   │       └── ToolRenderer.tsx
│   ├── editor/                 # 代码编辑器
│   │   ├── CodeMirror.tsx
│   │   └── hooks/
│   ├── sidebar/                # 侧边栏
│   │   ├── ProjectTree.tsx
│   │   ├── SessionList.tsx
│   │   └── ContextMenu.tsx
│   ├── filetree/               # 文件树浏览器
│   │   ├── FileTree.tsx
│   │   └── FileNode.tsx
│   ├── git/                    # Git 集成面板
│   ├── settings/               # 设置页面组件
│   ├── auth/                   # 认证相关
│   ├── onboarding/             # 用户引导流程
│   └── common/                 # 通用 UI 组件
│       ├── Button.tsx
│       ├── Modal.tsx
│       ├── Input.tsx
│       └── ...
│
├── hooks/                      # 自定义 Hooks（按域分组）
│   ├── chat/
│   │   ├── useChatStream.ts
│   │   ├── useToolExecution.ts
│   │   └── ...
│   ├── editor/
│   │   └── useCodeEditor.ts
│   ├── api/
│   │   └── useApiRequest.ts
│   └── shared/
│       ├── useDebounce.ts
│       └── useLocalStorage.ts
│
├── services/                   # API 调用层
│   ├── chatService.ts          # 聊天相关 API
│   ├── projectService.ts       # 项目管理 API
│   ├── sessionService.ts       # 会话管理 API
│   ├── gitService.ts           # Git 操作 API
│   ├── hookService.ts          # Hooks API
│   └── agentService.ts         # Agent API
│
├── stores/                     # 状态管理
│   └── ...
│
├── contexts/                   # React Context
│   ├── ThemeContext.tsx
│   ├── WebSocketContext.tsx
│   └── ...
│
├── utils/                      # 工具函数（按域分组）
│   ├── chat/
│   ├── editor/
│   ├── git/
│   └── shared/
│
├── types/                      # TypeScript 类型定义
│   ├── chat.ts
│   ├── agent.ts
│   └── ...
│
├── constants/                  # 常量定义
│   ├── models.ts               # 模型常量
│   ├── keys.ts                 # 键名常量
│   └── ...
│
├── i18n/                       # 国际化
│   ├── locales/
│   │   ├── en/
│   │   └── zh/
│   └── config.ts
│
└── app.tsx                     # 应用入口
```

---

## 5. 后端目录结构

```
server/
├── routes/                     # 路由定义（仅路由，无逻辑）
│   ├── index.js                # 路由聚合
│   ├── auth.js                 # /api/auth/*
│   ├── projects.js             # /api/projects/*
│   ├── sessions.js             # /api/sessions/*
│   ├── git.js                  # /api/git/*
│   ├── mcp.js                  # /api/mcp/*
│   ├── taskmaster.js           # /api/taskmaster/*
│   ├── settings.js             # /api/settings/*
│   └── agent.js                # /api/agent/*
│
├── controllers/                # 请求处理逻辑
│   ├── authController.js       # 认证控制器
│   ├── projectController.js    # 项目控制器
│   ├── sessionController.js    # 会话控制器
│   ├── gitController.js        # Git 控制器
│   ├── mcpController.js        # MCP 控制器
│   └── agentController.js      # Agent 控制器
│
├── services/                   # 业务逻辑
│   ├── agent/                  # Agent V2（原 agent-v2/）
│   │   ├── application/        # 应用层
│   │   │   └── handle-command.js
│   │   ├── domain/             # 领域层
│   │   │   ├── run-state-machine.js
│   │   │   └── ...
│   │   ├── runtime/            # 运行时
│   │   │   └── claude-run-executor.js
│   │   ├── history/            # 事件历史
│   │   └── default-services.js # 服务单例
│   ├── projectService.js       # 项目管理业务
│   ├── sessionService.js       # 会话管理业务
│   ├── fileService.js          # 文件操作业务
│   ├── gitService.js           # Git 操作业务
│   ├── hookService.js          # Hooks 业务逻辑
│   └── taskmasterService.js    # TaskMaster 集成
│
├── models/                     # 数据模型/Schema
│   ├── Session.js
│   ├── Project.js
│   ├── Hook.js
│   └── schemas/
│
├── middleware/                 # Express 中间件
│   ├── auth.js                 # JWT 认证
│   ├── cors.js                 # CORS 配置
│   ├── errorHandler.js         # 错误处理
│   └── validation.js           # 请求验证
│
├── websocket/                  # WebSocket 处理
│   ├── handlers/
│   │   ├── chatHandler.js      # /ws 聊天连接
│   │   └── shellHandler.js     # /shell 终端连接
│   ├── middleware/             # WS 中间件
│   └── utils.js
│
├── database/                   # 数据库操作
│   ├── connection.js
│   └── migrations/
│
├── hooks/                      # Claude Hooks 系统
│   ├── claude-hooks-router.js
│   ├── discovery.js
│   └── storage.js
│
├── providers/                  # AI Provider 集成
│   ├── claude/
│   ├── cursor/
│   ├── codex/
│   ├── gemini/
│   └── base.js
│
├── utils/                      # 工具函数
│   ├── file.js
│   ├── git.js
│   └── ...
│
├── types/                      # TypeScript 类型
│   └── ...
│
├── constants/                  # 常量定义
│   └── ...
│
└── index.js                    # 服务入口
```

---

## 6. 关键变更

### 6.1 chat + chat-v2 合并

**现状**：`src/components/chat/` 和 `src/components/chat-v2/` 两个目录并存

**变更**：统一合并到 `src/components/chat/`

| 原路径 | 新路径 |
|--------|--------|
| `chat-v2/components/...` | `chat/components/...` |
| `chat-v2/store/...` | `stores/chat/...` |
| `chat-v2/hooks/...` | `hooks/chat/...` |
| `chat-v2/api/...` | `services/chatService.ts` |
| `chat-v2/projection/...` | `chat/projection/...` |

### 6.2 agent-v2 归入 services

**现状**：`server/agent-v2/` 是独立顶层目录

**变更**：移动到 `server/services/agent/`

| 原路径 | 新路径 |
|--------|--------|
| `server/agent-v2/application/...` | `server/services/agent/application/...` |
| `server/agent-v2/domain/...` | `server/services/agent/domain/...` |
| `server/agent-v2/runtime/...` | `server/services/agent/runtime/...` |
| `server/agent-v2/history/...` | `server/services/agent/history/...` |
| `server/agent-v2/default-services.js` | `server/services/agent/default-services.js` |

### 6.3 路由与控制器分离

**现状**：路由和请求处理逻辑混合在 `server/index.js` 和各 `routes/*.js` 中

**变更**：
- `routes/` — 仅包含路由定义
- `controllers/` — 请求处理逻辑

---

## 7. 迁移计划

### 7.1 准备阶段

1. 更新 `tsconfig.json` paths
2. 更新 `vite.config.js` alias
3. 创建新目录骨架

### 7.2 前端迁移

| 步骤 | 操作 | 涉及文件 |
|------|------|----------|
| 1 | 创建 `views/`，移动路由页面组件 | ~6 |
| 2 | 合并 `chat/` + `chat-v2/` 到 `components/chat/` | ~50 |
| 3 | 重组 `hooks/` 按域分组 | ~20 |
| 4 | 创建 `services/`，抽取 API 调用 | ~15 |
| 5 | 整理 `utils/` 按域分组 | ~10 |
| 6 | 移动 `types/` 到顶层 | ~8 |
| 7 | 创建 `constants/`，集中常量 | ~5 |
| 8 | 全量更新 import 路径 | ~200 处 |

### 7.3 后端迁移

| 步骤 | 操作 | 涉及文件 |
|------|------|----------|
| 1 | 创建 `routes/`，抽离路由定义 | ~8 |
| 2 | 创建 `controllers/`，抽离请求处理 | ~8 |
| 3 | 移动 `agent-v2/` → `services/agent/` | ~15 |
| 4 | 整理 `services/`，统一业务逻辑 | ~10 |
| 5 | 创建 `models/`，集中数据模型 | ~5 |
| 6 | 创建 `websocket/`，抽离 WS 处理 | ~5 |
| 7 | 整理 `middleware/` | ~4 |
| 8 | 全量更新 import 路径 | ~150 处 |

### 7.4 验证阶段

1. `npm run typecheck` — 类型检查通过
2. `npm run lint` — 代码规范检查通过
3. `npm run test` — 所有测试通过
4. 手动测试核心功能 — 聊天、编辑器、侧边栏

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Import 路径大规模破坏 | 高 | 使用 IDE 重构功能；路径别名过渡期 |
| Git history 分散 | 中 | 使用 `git mv` 保留文件历史 |
| 短暂不可用 | 低 | 选择非工作时间执行 |
| 遗漏边缘文件 | 中 | 迁移后全量 typecheck + lint |
| 命名冲突 | 低 | 逐文件检查，重命名时加前缀 |

---

## 9. 路径别名配置

### tsconfig.json

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
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

### vite.config.js

```js
export default defineConfig({
  resolve: {
    alias: {
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

---

## 10. 实施原则

1. **使用 `git mv`** — 保留文件历史
2. **原子提交** — 每个目录迁移一个 commit
3. **逐步验证** — 每步完成后立即 typecheck
4. **保持功能不变** — 这是重构，不改行为
5. **同步更新 CLAUDE.md** — 迁移完成后更新文档

---

## 11. 完成标准

- [ ] 所有文件移动到新位置
- [ ] 所有 import 路径更新
- [ ] `npm run typecheck` 通过
- [ ] `npm run lint` 通过
- [ ] `npm run test` 通过
- [ ] 核心功能手动测试通过
- [ ] CLAUDE.md 更新完成
