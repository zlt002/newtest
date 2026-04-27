# Claude 官方 Hooks 1:1 整合设计

日期：2026-04-21

## 背景

当前项目已经具备 Claude hooks 的部分原生能力，但实现层级仍停留在“配置透传 + hook 事件观测/UI 展示”：

- 运行时会把 `settingSources`、`plugins`、`settings` 等透传给 Claude Agent SDK
- Claude/SDK 产出的 `hook_started`、`hook_progress`、`hook_response` 事件会被翻译为内部事件并展示
- 但项目尚未实现：
  - SDK session 级 `hooks` 注入
  - 官方 hooks 多来源统一发现/浏览
  - hooks 全量管理界面
  - 可写来源的官方结构编辑与回写

本设计目标是在**不自实现 hooks 执行引擎**的前提下，将当前项目升级为与 Claude 官方 hooks 模型 1:1 对齐的管理与运行平台。

## 目标

实现 Claude 官方 hooks 的全表面整合，覆盖：

- 官方来源发现
  - `user`
  - `project`
  - `local`
  - `plugin`
  - `skill`
  - `subagent`
  - `session-memory`
- 官方 hooks 结构展示与编辑
- SDK session 级 `hooks` 注册
- hooks 执行事件观测、持久化与查看
- `/hooks` 管理界面

## 非目标

以下内容明确不做：

- 不实现项目私有 hooks DSL
- 不实现项目私有 hooks 执行器
- 不让项目自己执行 `command/http/prompt/agent`
- 不把 plugin/skill/subagent 只读来源伪装成可编辑来源
- 不修改官方 hooks 语义、优先级和运行时判定方式

## 用户体验目标

用户应当能够：

1. 在 `/hooks` 页面看到所有 hooks 来源
2. 看清楚每个来源的可写性、原始配置、标准化视图与参与状态
3. 查看当前项目/当前会话的 effective hooks 视图
4. 编辑 `user/project/local/session-memory` 四类可写来源
5. 查看 hook 执行记录、输出、错误和关联 run/session
6. 明确区分“全局/项目/本地持久配置”和“当前 session 临时 hooks”

## 方案选择

采用“原生镜像式整合”：

- 内部不发明 hooks 中间语言
- 数据模型贴官方结构
- 运行时执行完全交给 Claude/SDK
- 项目只负责：
  - 来源发现
  - 结构标准化
  - 可写来源回写
  - session hooks 注入
  - 事件接收
  - UI 展示与管理

这是最贴近官方 SDK 的方案，也是后续官方扩展 hooks 时变更成本最低的方案。

## 架构概览

整体拆为 5 层：

1. Discovery 层
2. Normalization 层
3. Mutation 层
4. Runtime 层
5. Management UI 层

### 1. Discovery 层

负责从所有官方来源收集 hooks：

- `~/.claude/settings.json`
- `<project>/.claude/settings.json`
- `<project>/.claude/settings.local.json`
- plugin
- skill / subagent frontmatter
- 当前 session memory hooks

此层只读取，不做覆盖或执行推断。

### 2. Normalization 层

把各来源的 hooks 转成统一的“官方 hooks 视图对象”，但保持语义不变：

- 标准化 event
- 标准化 matcher
- 标准化 action 结构
- 保留原始 `raw`
- 注入来源元数据

### 3. Mutation 层

只对可写来源开放写能力：

- `user`
- `project`
- `local`
- `session-memory`

只读来源：

- `plugin`
- `skill`
- `subagent`

Mutation 层必须是“官方配置 round-trip 修改器”，不能将 hooks 存入项目数据库作为主真相源。

### 4. Runtime 层

当前项目继续复用 Claude/SDK 作为 hooks 执行真相：

- 文件来源 hooks：由 Claude 原生加载
- session-memory hooks：通过 SDK session 选项 `hooks` 注入
- 执行产生的生命周期事件继续进入现有 translator / event store / UI

### 5. Management UI 层

新增 `/hooks` 管理界面，包括：

- hooks 首页总览
- 来源详情页
- effective hooks 视图
- 编辑器
- 执行记录页

## 数据模型

### HookSource

表示一个 hooks 来源。

字段：

- `id`
- `kind`
  - `user`
  - `project`
  - `local`
  - `plugin`
  - `skill`
  - `subagent`
  - `session-memory`
- `label`
- `path`
- `writable`
- `priority`
- `pluginName`
- `skillName`
- `subagentName`
- `description`

### ManagedHookEntry

表示一条标准化后的官方 hook 定义。

字段：

- `id`
- `sourceId`
- `event`
- `matcher`
- `hooks`
- `timeout`
- `enabled`
- `readonly`
- `origin`
- `raw`

### ManagedHookAction

表示单个 hook 动作，严格贴官方类型。

字段：

- `type`
  - `command`
  - `http`
  - `prompt`
  - `agent`
- `command`
- `args`
- `url`
- `method`
- `headers`
- `prompt`
- `agent`
- `timeout`
- `raw`

### EffectiveHooksView

表示某个项目或会话当前的 hooks 可见状态。

字段：

- `sources`
- `entries`
- `groupedByEvent`
- `writableSources`
- `readonlySources`
- `sessionHooks`
- `diagnostics`

## 来源展示策略

项目展示所有来源，但只允许写可写来源。

### 可写来源

- `user`
- `project`
- `local`
- `session-memory`

### 只读来源

- `plugin`
- `skill`
- `subagent`

只读来源页面必须显示：

- 来源路径
- 来源类型
- 原始定义
- 为什么不可编辑
- 如需修改，应去哪个原文件修改

## 生效视图与来源视图的区别

系统必须明确区分两种视图：

### 来源视图

回答“哪里定义了什么 hooks”。

### 生效视图

回答“当前 session / 当前项目会看到什么 hooks”。

UI 不能把两者混成一个列表。这样才能避免用户误解来源与执行的关系。

## 后端 API 设计

### Discovery API

#### `GET /api/hooks/overview`

返回：

- `sources`
- `entries`
- `diagnostics`
- `capabilities`

用于 `/hooks` 首页总览。

#### `GET /api/hooks/sources/:sourceId`

返回单个来源的：

- 原始定义
- 标准化结果
- 来源说明

#### `GET /api/hooks/effective`

参数：

- `projectPath`
- `sessionId`
- `settingSources`
- `plugins`

返回当前项目/会话的 effective hooks 视图。

### Mutation API

#### `PUT /api/hooks/user`

回写 `~/.claude/settings.json`

#### `PUT /api/hooks/project`

回写 `<project>/.claude/settings.json`

#### `PUT /api/hooks/local`

回写 `<project>/.claude/settings.local.json`

#### `PUT /api/hooks/session-memory`

更新当前活跃 session 的 memory hooks

#### `DELETE /api/hooks/:sourceKind/:entryId`

删除一条 hook，仅支持可写来源

### Execution API

#### `GET /api/hooks/events`

参数：

- `sessionId`
- `runId`
- `hookEvent`
- `hookName`

返回 hooks 执行列表。

#### `GET /api/hooks/events/:hookId`

返回一次 hooks 执行详情：

- started
- progress
- response
- stdout/stderr
- exitCode
- 关联 run/session

## Runtime 接入设计

### 当前现状

当前 runtime 已透传：

- `settingSources`
- `plugins`
- `settings`
- `mcpEnabled`
- `toolsSettings`
- `canUseTool`

但没有透传：

- `hooks`

### 目标改造

在 runtime options 中增加官方 `hooks` 透传：

1. `buildClaudeV2RuntimeOptions()` 新增 `hooks`
2. `buildSessionOptions()` 把 `hooks` 传给 `unstable_v2_createSession(...)`

### 关键原则

- 文件来源 hooks 继续由 Claude 原生加载
- session-memory hooks 通过 SDK `hooks` 注入
- 所有 hooks 的执行继续由 Claude/SDK 负责
- 项目不自己实现 `command/http/prompt/agent`

## Hook 生命周期事件处理

当前项目已经有原生事件接入基础，继续沿用：

- `hook_started`
- `hook_progress`
- `hook_response`

translator 继续映射为：

- `sdk.hook.started`
- `sdk.hook.progress`
- `sdk.hook.response`

并保留：

- `hookId`
- `hookName`
- `hookEvent`
- `stdout`
- `stderr`
- `output`
- `exitCode`
- 原始 `sdk` payload

这些事件会进入：

- run event pipeline
- event store
- task grouping / inline runtime activity
- hooks execution 页面

## `/hooks` 界面设计

### 首页 `/hooks`

展示四块内容：

1. `Effective Hooks`
2. `Sources`
3. `Recent Executions`
4. `Diagnostics`

### 来源详情页 `/hooks/sources/:sourceId`

三个 tab：

1. `Normalized`
2. `Raw`
3. `About Source`

### 编辑器

仅对可写来源开放。

编辑器结构：

1. Event Selector
2. Matcher Editor
3. Action List Editor
4. Action Form
5. Raw JSON Drawer

动作类型必须支持：

- `command`
- `http`
- `prompt`
- `agent`

### 执行记录页

路径：

- `/hooks/executions`
- `/hooks/executions/:hookId`

展示 hooks 生命周期、关联 run/session、stdout/stderr、exitCode、原始 payload。

## 关键交互规则

1. 只读来源不出现伪编辑能力
2. 编辑页必须标明写回目标
3. session-memory hooks 必须明确标注“仅当前会话生效”
4. effective 视图与 source 视图分离

## 风险与应对

### 风险 1：中间层模型漂移

风险：

- 项目为了 UI 方便发明私有 hooks DSL

应对：

- 内部仅保留官方标准结构与 `raw`

### 风险 2：项目变成 hooks 执行器

风险：

- `command/http/prompt/agent` 被项目自己执行

应对：

- 执行始终交给 Claude/SDK

### 风险 3：多来源语义解释错误

风险：

- UI 错误地使用“覆盖”解释 hooks

应对：

- 用“来源视图 + 生效视图”表达

### 风险 4：只读来源误编辑

风险：

- 用户在 UI 上改了实际上不可写的来源

应对：

- plugin/skill/subagent 完全只读

### 风险 5：session-memory 与持久来源混淆

风险：

- 用户误解其持久性

应对：

- 独立区域与强提示

## 实施顺序

### 阶段 1：只读发现

目标：

- 跑通全部来源扫描与标准化

交付：

- `/api/hooks/overview`
- `/api/hooks/sources/:id`
- `/hooks` 首页只读版

### 阶段 2：effective 视图

目标：

- 告知当前项目/会话真正可见的 hooks

交付：

- `/api/hooks/effective`
- effective hooks UI

### 阶段 3：runtime session hooks 注入

目标：

- 在 session options 中接入 `hooks`

交付：

- request builder 支持 `hooks`
- session pool 透传 `hooks`

### 阶段 4：执行记录页

目标：

- 查看 hooks 生命周期与输出

交付：

- `/api/hooks/events`
- `/api/hooks/events/:hookId`
- execution UI

### 阶段 5：可写来源编辑

目标：

- 支持编辑 `user/project/local/session-memory`

交付：

- 编辑器
- raw/structured 双模式
- 回写逻辑

### 阶段 6：只读来源增强

目标：

- 完善 plugin/skill/subagent 来源说明

交付：

- 来源说明
- 跳转原文件
- 不可编辑原因

## 验收标准

以下全部满足时，视为设计完成：

1. `/hooks` 能展示所有 hooks 来源
2. UI 能明确区分可写与只读来源
3. effective hooks 视图能按项目/会话预览
4. `user/project/local/session-memory` 可以按官方结构编辑
5. session options 能原生透传 `hooks`
6. hooks 执行事件可以查看
7. 项目没有引入自定义 hooks 执行器
8. plugin/skill/subagent 来源保持只读

## 涉及核心文件

运行时与后端：

- `server/agent-v2/runtime/claude-v2-request-builder.js`
- `server/agent-v2/runtime/claude-v2-session-pool.js`
- `server/agent-v2/runtime/claude-v2-event-translator.js`
- `server/agent-v2/application/create-agent-v2-services.js`
- 新增 `server/routes/hooks.js`
- 新增 `server/services/hooks/*`

前端：

- 新增 `/hooks` 页面及相关组件
- 复用现有 hooks 事件展示链
- 复用 event store / task grouping / runtime activity 视图

## 结论

本方案采用“原生镜像式整合”完成 Claude 官方 hooks 的 1:1 接入：

- 配置层使用官方来源
- 运行层使用官方 SDK 执行
- 管理层提供全来源可见、可写来源可编辑的 UI
- 观测层复用现有 hook 事件翻译与展示链路

这样既能满足“完全原生优先”，又避免项目演变成一套与官方 hooks 语义分叉的自实现系统。
