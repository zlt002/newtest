# Claude Agent SDK 原生 Skill 模型重构设计

## 背景

当前项目中的 skill 体系仍然主要依赖本地兼容层：

- 后端扫描 `.claude/skills` 与 plugin 目录下的 `SKILL.md`
- `/skills` 由本地路由拼装帮助文案
- 执行 `/brainstorming`、`/debug` 这类 skill 时，先读取 skill 文件内容，再把内容注入输入框并自动提交

这套机制虽然能提供 Claude Code 风格体验，但 skill 的真相源并不在 Claude Agent SDK，而是在项目自己的：

- `server/utils/skill-loader.js`
- `server/routes/commands.js`
- `src/components/chat/hooks/useChatComposerState.ts`

如果目标是“完全原生优先”，那么 skill 的发现、加载、执行与 `/skills` 返回都必须回到 Claude Agent SDK，而 cc-ui 只保留最薄的展示与透传层。

## 目标

1. 删除项目自实现的 skill 文件扫描与内容注入主链路。
2. 让 Claude Agent SDK 成为 skill 的唯一真相源。
3. 让 `/skills` 与所有原生 slash skill command 都由 Claude runtime 原生处理。
4. 保留前端命令菜单，但其 Claude skill 数据必须来自 runtime command catalog，而不是本地文件系统。
5. 保留本地 UI 命令能力，但严格与 Claude 原生命令分层。

## 非目标

- 不在本轮重写整个 Claude Agent V2 聊天架构。
- 不改造与 skill 无关的消息卡片、右侧面板、文件树等模块。
- 不保留长期双轨运行的 skill 兼容层。
- 不尝试重新定义 Claude SDK 对 skill、plugins、CLAUDE.md 的原生语义。

## 方案选择

### 方案 1：原生替换，UI 保留最薄展示层

采用此方案。

做法：

- 删除 skill loader 与 skill 内容注入链路
- 本地只保留纯 UI 命令
- Claude 原生命令统一原样透传给 runtime
- 前端菜单展示的数据来自 runtime command catalog

优点：

- 最符合“完全原生优先”
- skill 真相源清晰
- 后续 SDK 升级认知成本最低

缺点：

- 命令菜单与执行路径需要一起收口
- 需要新增 runtime command catalog 读取与缓存能力

### 方案 2：彻底取消 skill 菜单展示

不采用。

原因：

- 虽然架构最干净，但会明显降低 skill 可发现性
- 用户将主要依赖手输 `/skills` 进行发现，体验退化较大

### 方案 3：本地保留 skill 元数据发现，只把执行交给 SDK

不采用。

原因：

- 仍然会保留双真相源
- “菜单里看到的 skill”和“runtime 真正能执行的 skill”可能继续漂移

## 目标架构与边界

### Claude Agent SDK 负责

- skill 发现
- `/skills` 实际返回
- 原生 slash skill command 的解释与执行
- `CLAUDE.md`、settings、plugins、skills 的加载与合并语义

### cc-ui 后端负责

- 创建与恢复 Claude runtime session
- 将用户原始输入原样发送给 SDK
- 将 SDK 返回的消息与事件翻译成项目内部稳定事件
- 对外提供 runtime command catalog 只读视图，供前端展示

### cc-ui 前端负责

- 输入框与 slash command 菜单
- 将选中的 command 文本插入输入框
- 展示 `/skills` 返回结果与执行过程
- 不再读取 skill 文件，不再拼 prompt，不再决定 skill 内容

## 命令分类

重构后命令必须拆成两类。

### 1. 本地 UI 命令

这些命令本质上是产品操作，继续由本地执行：

- `/config`
- `/permissions`
- `/mcp`
- `/agents`
- `/export`
- `/copy`
- 以及其他纯本地状态或 UI 行为命令

这些命令仍可保留在现有本地命令注册与执行体系中。

### 2. Claude 原生命令

这些命令必须完全交给 Claude Agent SDK：

- `/skills`
- 所有 runtime skill slash commands
- 未来 SDK 暴露的其他原生命令

这些命令不允许再经过本地 skill 展开、文件读取、prompt 注入链路。

## 数据流设计

### 本地 UI 命令

1. 用户输入本地 UI 命令。
2. 前端识别为本地命令。
3. 调用本地命令执行接口。
4. 后端返回 UI action。
5. 前端执行对应产品行为。

### Claude 原生命令

1. 用户输入 `/brainstorming` 或 `/skills`。
2. 前端识别为 Claude runtime command。
3. 不经过本地 skill 展开逻辑。
4. 原始文本作为用户输入发送到 Claude session。
5. Claude Agent SDK 在 runtime 内部解释并执行命令。
6. 返回的 assistant/result/system/stream_event 继续走现有 V2 runtime event 翻译链路。

### 前端菜单展示

前端菜单继续存在，但 Claude skill 列表的来源改为 runtime command catalog，而不是本地扫描目录。

## Runtime Command Catalog

### 定义

Runtime command catalog 表示“当前 Claude runtime 实际可见、实际可执行的 slash commands / skills”。

它的职责只有：

1. 为前端菜单提供展示、搜索与补全数据。
2. 帮助前端判断某个 slash command 更可能属于本地 UI 命令还是 Claude runtime command。

它不负责：

- 执行 skill
- 读取 skill 内容
- 生成 prompt
- 决定命令最终语义

### 粒度

catalog 采用 session 级或 session-context 级粒度，因为不同 session 的：

- `cwd`
- `projectPath`
- `settingSources`
- plugins
- `.claude` 配置

都可能导致实际可见 skill 集合不同。

### 初始化时机

- 新建 session 后初始化
- 恢复 session 后按需刷新
- projectPath 或 cwd 变化时刷新
- 相关 settings / plugin / `.claude` 配置变化时失效

### 缓存原则

- 允许缓存，但缓存只服务 UI 加速
- 缓存不是真相源
- catalog 缺失时，手输 `/brainstorming` 仍必须能执行

### 对前端暴露的最小字段

- `name`
- `description`
- `argumentHint`
- `sourceType`
- `isEnabled`
- `scopeKey` 或 `sessionId`

其中 `sourceType` 只需要区分：

- `local-ui`
- `claude-runtime`

## SDK 接入面重构

### Session 创建参数必须原生化

当前 runtime option builder 主要聚焦模型、目录和工具权限。重构后需要升级为完整的 Claude runtime config builder，纳入：

- `settingSources`
- `plugins`
- 必要时的 `settings`
- 与 skill shell 执行相关的 SDK 原生设置

### 显式声明 settingSources

为了让 SDK 原生加载 project/user/local 范围内的：

- skills
- `CLAUDE.md`
- `.claude/settings.json`

session options 必须显式设置 `settingSources`。

默认策略采用：

- `['user', 'project', 'local']`

理由：

- 最接近 Claude Code 原生行为
- 能覆盖项目级与用户级 skill/CLAUDE.md 语义
- 满足“完全原生优先”的目标

### Plugin 语义

不再通过本地遍历 `~/.claude/plugins/**/skills` 来定义 skill 可见性。

plugin 是否生效，改由：

- Claude SDK settings
- runtime 构建时传入的 plugin 配置

共同决定。

### Slash Command 执行语义

执行 `/brainstorming`、`/debug`、`/skills` 等原生命令时，必须保持：

- 原始文本不变
- 不做前置文件读取
- 不做 prompt 注入
- 不做 skill 内容展开

也就是说，slash command 的解释权回到 Claude Agent SDK，而不是路由层。

## 前端交互调整

### 菜单行为

- 菜单展示本地 UI 命令与 Claude runtime commands
- 用户选择 Claude runtime command 时，只插入文本
- 不自动展开 skill 内容

### 提交流程

- 提交时，如果是本地 UI 命令，则走本地执行器
- 如果是 Claude runtime command，则直接提交给 `submitAgentRun`

### `/skills`

`/skills` 不再映射为本地 help 页面，而是：

- 插入 `/skills`
- 作为原始用户输入发送到 runtime
- 将 Claude 返回直接展示给用户

## 删除与收缩清单

### 后端删除

- `server/utils/skill-loader.js`
- `server/utils/skill-loader.test.mjs`
- `server/routes/commands.js` 中的：
  - skill 扫描逻辑
  - `loadSkill(...)`
  - skill content 返回逻辑
  - 本地 `/skills` 帮助逻辑
  - `skill_prompt` built-in action

### 前端删除或重写

- `useChatComposerState.ts` 中的 `skill_prompt` 分支
- 与 skill 注入相关的 custom-command 自动提交路径
- `slashCommandData.js` 中按 `skills` 分类的结构
- `commandMenuGroups.js` 中旧的 `skills/project/user` 心智分组
- `builtInCommandBehavior.js` 中与 `skill_prompt` 绑定的行为

### 保留

- 纯本地 UI 命令体系
- Claude Agent V2 session/run/event 主链路
- 菜单展示、搜索和插入体验

## 测试设计

### 1. Runtime option 构建测试

- session 创建时显式包含 `settingSources`
- plugin/settings 组装符合预期
- skill 相关设置不会被旧逻辑吞掉

### 2. Runtime command catalog 测试

- 新 session 可拉取 catalog
- projectPath/cwd 改变时触发刷新
- catalog 缺失时不影响手输原生命令执行

### 3. 命令路由测试

- 本地 UI 命令仍可经本地命令执行器完成
- Claude runtime commands 不再触发 skill loader 或内容注入
- `/skills` 不再走本地 help 路径

### 4. 前端交互测试

- 选择 runtime skill 仅插入文本
- 提交 `/brainstorming` 时，发给 runtime 的仍是原始 slash command
- 菜单分组、搜索、过滤仍正常

## 迁移策略

本次采用一次性切换，不保留长期双轨。

### Step 1

先接通 runtime command catalog 与原生 session options。

### Step 2

切前端 slash command 执行路径，让 Claude runtime command 直接透传。

### Step 3

删除 skill loader、本地 `/skills` 帮助页、`skill_prompt` 与相关测试。

这样可以确保：

- 在删除旧链路前，原生能力已经接通
- 删除动作只是收尾，而不是高风险切换点

## 错误处理

### Runtime command catalog 获取失败

- 前端菜单中不展示 Claude runtime commands 或显示降级状态
- 不阻塞普通文本对话
- 不阻塞手输 slash command 执行

### Slash command 不存在

- 由 Claude runtime 返回原生错误或帮助信息
- 本地不猜测命令是否存在

### Settings / plugins 配置异常

- session 初始化阶段记录明确错误
- 命令菜单只展示 runtime 成功加载的结果
- 不再根据本地文件存在性“乐观展示” skill

## 验收标准

1. 仓库中不再存在 skill 文件扫描与内容注入主链路。
2. `/skills` 的结果来自 Claude runtime，而不是本地拼装 markdown。
3. `/brainstorming` 等 skill 执行时，发送给 SDK 的是原始 slash command 文本。
4. session 创建参数显式包含原生 skill 配置来源。
5. 前端菜单中的 Claude skills 来自 runtime command catalog，而不是本地文件系统。
6. 即使菜单缓存失败，用户手输原生命令仍可执行。
7. 本地 UI 命令仍能独立运行，不受 Claude 原生命令接管影响。

## 实施范围判断

本设计聚焦单一子系统：Claude skill 原生化。

它会波及：

- runtime option builder
- session pool / runtime catalog 获取
- commands route
- chat composer slash command 分发
- command menu 数据结构与测试

但仍然属于一个可以单独规划并实施的收敛型改造，不需要再拆成多个独立 spec。
