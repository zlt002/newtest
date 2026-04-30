# Project Cleanup Design Spec

> **档案状态：历史设计（已归档）** 本文档为历史清理设计说明，当前仓库以实际落地为准，部分条目仅保留决策追踪用途。

Date: 2026-04-25
Status: Draft
Scope: Full project cleanup — dead code removal, JS→TS migration, structural simplification

## Background

CC UI 项目经过多轮迭代，积累了大量遗留代码：未使用的后端路由、无人引用的前端组件、混合的 .js/.ts 文件格式、重复的工具函数。本次清理目标是一次性解决所有已知问题。

## Phase 1: 删除确定的死代码

### 1.1 后端：删除无引用文件

| 文件 | 原因 |
|------|------|
| `server/controllers/projectController.js` | 无任何文件 import，与 routes/projects.js 功能重复 |
| `server/controllers/gitController.js` | 无任何文件 import |
| `server/models/Session.js` | 无任何文件 import |

删除 `server/controllers/` 目录（仅含上述两个文件）。

### 1.2 后端：删除未使用的路由

| 路由文件 | 端点 | 原因 |
|----------|------|------|
| `server/routes/cli-auth.js` | `GET /claude/status` | 前端无 API 调用 |
| `server/routes/agent.js` | 多个 agent HTTP 端点 | 前端通过 WebSocket 交互，不走 HTTP 路由 |

同时从 `server/routes/index.js` 移除对应的 import 和 `app.use()` 注册。

### 1.3 前端：删除未使用的 chat 组件

`src/components/chat/components/` 目录中以下文件无外部引用：

| 文件 | 操作 |
|------|------|
| `AssistantRuntimeTurn.ts` | 删除 |
| `ConversationStream.tsx` | 删除 |
| `InlineRuntimeActivity.ts` | 删除 |
| `RunCard.tsx` | 删除 |
| `RunCardInteraction.tsx` | 删除 |
| `RunCardProcessTimeline.tsx` | 删除 |
| `RuntimeMarkdown.ts` | 删除 |
| `stream-blocks/` (整个目录) | 删除 |

**保留**：
- `ComposerContextBar.ts` — 被 ChatInterface.tsx 引用

删除后需清理相关 test 文件（如有）。

### 1.4 清理残留引用

删除上述文件后，全局搜索并清理：
- 指向已删除文件的 import 语句
- 指向已删除文件的 re-export
- package.json test 脚本中对已删除文件的引用

## Phase 2: JS→TS 统一迁移

### 2.1 迁移清单（32 个文件）

#### contexts/ (3 个)
| 原文件 | 目标 |
|--------|------|
| `src/contexts/AuthContext.jsx` | → `.tsx` |
| `src/contexts/ThemeContext.jsx` | → `.tsx` |
| `src/contexts/socketSendQueue.js` | → `.ts` |

#### hooks/chat/ (10 个)
| 原文件 | 目标 |
|--------|------|
| `src/hooks/chat/builtInCommandBehavior.js` | → `.ts` |
| `src/hooks/chat/chatComposerSessionTarget.js` | → `.ts` |
| `src/hooks/chat/chatMessagePresentation.js` | → `.ts` |
| `src/hooks/chat/chatRealtimeFileChangeEvents.js` | → `.ts` |
| `src/hooks/chat/pendingUserMessage.js` | → `.ts` |
| `src/hooks/chat/sessionCompletionSync.js` | → `.ts` |
| `src/hooks/chat/sessionStreamingRouting.js` | → `.ts` |
| `src/hooks/chat/sessionTranscript.js` | → `.ts` |
| `src/hooks/chat/slashCommandData.js` | → `.ts` |

#### hooks/shared/ (1 个)
| 原文件 | 目标 |
|--------|------|
| `src/hooks/shared/useLocalStorage.jsx` | → `.tsx` |

#### components/chat/ (4 个)
| 原文件 | 目标 |
|--------|------|
| `src/components/chat/projection/runFailureMessage.js` | → `.ts` |
| `src/components/chat/projection/taskBlockGrouping.js` | → `.ts` |
| `src/components/chat/utils/chatFormatting.js` | → `.ts` |
| `src/components/chat/utils/chatStorage.js` | → `.ts` |

#### components/其他 (5 个)
| 原文件 | 目标 |
|--------|------|
| `src/components/chat/tools/utils/questionNormalization.js` | → `.ts` |
| `src/components/chat/view/subcomponents/commandMenuGroups.js` | → `.ts` |
| `src/components/git-panel/utils/gitPanelErrorText.js` | → `.ts` |
| `src/components/right-pane/utils/rightPaneTargetIdentity.js` | → `.ts` |
| `src/components/settings/utils/settingsStorage.js` | → `.ts` |

#### 其他 (5 个)
| 原文件 | 目标 |
|--------|------|
| `src/main.jsx` | → `.tsx` |
| `src/lib/utils.js` | → `.ts` |
| `src/stores/sessionStoreRebind.js` | → `.ts` |
| `src/utils/api.js` | → `.ts` |

### 2.2 迁移规则

- 纯逻辑文件 `.js` → `.ts`，添加类型注解
- React 组件 `.jsx` → `.tsx`，添加 Props 类型
- 更新所有 import 路径中的扩展名引用（如有）
- 每个 .d.ts + .js 配对文件合并为单个 .ts 文件
- 迁移后运行 typecheck 确认无错误

### 2.3 特殊处理

- `src/main.jsx` 需确认 Vite 入口配置是否需要同步更新
- `.d.ts` + `.js` 配对（如 `questionNormalization`）合并后删除 `.d.ts`

## Phase 3: 结构精简

### 3.1 合并重复的 draft preview 逻辑

**现状**：
- `src/components/app/utils/draftPreviewFollowAlong.ts`
- `src/components/code-editor/utils/draftPreview.ts`

**方案**：分析两者职责差异，如功能重叠则合并到 `src/utils/draftPreview.ts`。

### 3.2 统一 contexts 目录

**现状**：`src/contexts/` 中有新旧两种格式文件：
- AuthContext.jsx（旧）+ AuthContext（在 components/auth/context/ 中已有新版本）
- ThemeContext.jsx（旧）
- WebSocketContext.tsx（新）
- socketSendQueue.js（旧）

**方案**：
- 检查 `src/contexts/AuthContext.jsx` 与 `src/components/auth/context/AuthContext.tsx` 是否重复，若是则删除旧版
- `ThemeContext.jsx` 迁移为 `.tsx`
- `socketSendQueue.js` 迁移为 `.ts`

### 3.3 清理 sessionStoreRebind.js

**现状**：`src/stores/sessionStoreRebind.js` 疑似遗留的会话重绑定逻辑。

**方案**：验证是否仍被使用，若无用则删除。

### 3.4 更新 CLAUDE.md

CLAUDE.md 中提到的 `components-v2/` 目录实际不存在，需要更新文档中的目录描述以反映当前实际结构。

## 执行策略

由于用户选择"一步到位"方案，所有 Phase 将在一次实施中完成。但每个 Phase 完成后仍需运行测试验证。

### 验证步骤

1. 每个 Phase 完成后运行 `npm run typecheck`
2. 全部完成后运行 `npm run test`
3. 全部完成后运行 `npm run lint`
4. 最终 `npm run build` 确认生产构建通过

### 风险控制

- 删除前确认无引用（已通过 agent 扫描验证）
- 迁移 .js→.ts 时保持功能不变，仅添加类型
- 使用 git 的原子提交，每个 Phase 一个提交，便于回滚
