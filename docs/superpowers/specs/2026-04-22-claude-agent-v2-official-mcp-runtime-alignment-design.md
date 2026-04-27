# Claude Agent V2 官方 MCP 运行时对齐设计

## 背景

当前项目已经接入 `@anthropic-ai/claude-agent-sdk`，并围绕 Claude Agent V2 建立了会话创建、续接、事件翻译与前端实时展示链路。

但在 MCP 集成上，当前实现仍然带有较强的产品内自定义色彩：

- 前端和后端主链路显式传递 `mcpEnabled`
- 应用保留了 MCP 开关心智
- MCP 管理能力主要围绕 Claude CLI 配置与自定义接口展开
- 运行时虽然使用 Claude Agent SDK，但尚未完全退回到 Claude 官方的 MCP 发现模型

结合官方文档与本次目标，可以明确新的方向不是“增强现有 MCP 管理系统”，而是“让 Agent V2 运行时尽量薄，回归 Claude 官方 MCP 发现机制”。

官方模型的关键点如下：

- 项目共享 MCP 通过项目根目录 `.mcp.json` 提供
- 用户私有 MCP 通过 `~/.claude.json` 提供
- Claude Agent SDK 在给定 `cwd` 的前提下，按 Claude Code 官方配置发现机制工作
- `mcpServers` 选项更适合程序化临时注入，而不是长期替代官方配置文件

本设计只讨论一件事：

如何让当前项目中的 Agent V2 运行时完全按官方 MCP 方式工作，而不再由应用自己决定 MCP 是否启用、启用哪些 server。

## 目标

1. 让 Agent V2 运行时以 Claude 官方 MCP 发现模型为唯一准则。
2. 移除应用主链路中的 `mcpEnabled` 心智与传递。
3. 不在运行时显式注入 `mcpServers`。
4. 保留对 Claude 实际发现结果的只读诊断能力。
5. 让维护者能清晰区分“Claude 官方 MCP 发现”与“应用自己的诊断展示”。

## 非目标

- 不在本轮实现 `.mcp.json` 的可视化管理器。
- 不在本轮重写或删除全部历史 MCP 管理接口。
- 不在本轮引入会话级临时 `mcpServers` 注入能力。
- 不在本轮改变非 Claude Agent V2 的其它模块行为。

## 需求约束

本轮方案由以下用户决策明确约束：

- 目标是“运行时完全按官方 MCP 方式接入”
- 不纳入“项目内可视化管理 `.mcp.json`”
- 不采用显式 `mcpServers` 注入
- 不保留应用层 MCP 开关

因此，本轮运行时的目标模型必须满足：

- 应用只提供 `cwd`
- Claude 自己决定是否发现 MCP
- 应用不参与 server 集合决策

## 现状判断

### 当前有价值的部分

- Agent V2 运行时已经收敛到 `server/agent-v2/runtime/*`
- 前端聊天提交流已经能稳定传递 `projectPath`
- 后端已经具备从 Claude 初始化事件中读取 `mcp_servers` 的基础能力
- trace 与系统事件层已有一定的 MCP 可观测性

### 当前与目标的偏差

1. 主链路仍显式传递 `mcpEnabled`。
2. 前端存在“应用开关决定 MCP 是否启用”的心智。
3. 后端 request builder 和 session pool 仍把 MCP 当成应用运行时参数之一。
4. 应用存在基于 CLI/config 的 MCP 管理入口，容易让维护者误以为运行时由应用自己控制 MCP。

## 方案选择

### 方案 A：纯官方发现，零诊断层

运行时只传官方参数，不再传 `mcpEnabled`，也不保留任何本地诊断。

优点：

- 与官方最接近
- 运行时实现最薄

缺点：

- 出现“为什么没发现 MCP”时排障困难
- 对真实项目维护不够友好

### 方案 B：纯官方发现 + 只读诊断层

运行时只传官方参数，不再传 `mcpEnabled`，但保留对 Claude 初始化结果的只读观测、日志与 UI 展示。

优点：

- 满足“运行时完全按官方方式工作”
- 保留足够的排障能力
- 不会反向演变为新的配置入口

缺点：

- 需要保留少量观测代码

### 方案 C：官方发现为主，保留可选注入

默认走官方发现，但保留 `mcpServers` 透传入口作为备用。

优点：

- 扩展性更强

缺点：

- 会在架构上持续保留“双模型”
- 与本次“纯官方发现模式”的目标不一致

结论：采用方案 B。

## 设计原则

### 1. `cwd` 是唯一与 MCP 发现直接相关的应用输入

应用只负责把会话绑定到正确项目目录。

在本轮设计里，`projectPath -> cwd` 是应用对 MCP 的唯一实质性贡献。除此之外，应用不再参与 Claude 的 MCP 发现决策。

### 2. 运行时不得决定 MCP server 集合

任何会影响 MCP server 集合的逻辑，都不能存在于 Agent V2 runtime 层。

禁止：

- 运行时合并 MCP 配置
- 运行时过滤 MCP server
- 运行时显式构造 `mcpServers`
- 运行时通过应用开关决定是否启用 MCP

### 3. 诊断只能观察，不能控制

应用可以观察 Claude 实际发现到了什么，但不能根据这份观察结果反向修改本次运行行为。

诊断层允许：

- 展示 `mcp_servers`
- 记录失败 server
- 输出调试信息

诊断层禁止：

- 根据本地探测结果决定是否注入 server
- 根据 UI 状态开关改变 Claude 是否加载 MCP

### 4. 用户排障应回到官方文件体系

当用户发现“MCP 没生效”时，应用应把排障指向：

- 项目根 `.mcp.json`
- `~/.claude.json`

而不是指向应用内部的 MCP 开关或运行时专用配置。

## 运行时架构边界

### 前端职责

前端聊天提交流只负责提交：

- `prompt`
- `sessionId`
- `projectPath`
- `model`
- `effort`
- `permissionMode`
- `toolsSettings`
- 图片等普通会话输入

前端不再负责：

- 读取并发送 `mcpEnabled`
- 根据本地设置决定 MCP 是否启用
- 传递任何 `mcpServers`

### 后端 transport 职责

WebSocket / HTTP transport 只负责透传官方会话参数，不再承载应用层 MCP 开关。

### Agent V2 runtime 职责

`server/agent-v2/runtime/*` 的职责收敛为：

- 根据 `cwd` 创建或续接 Claude session
- 传递官方支持的常规会话参数
- 接收 Claude stream 并翻译为产品事件

它不再负责：

- 注入 `mcpEnabled`
- 注入 `mcpServers`
- 构造 MCP 发现输入

### Claude SDK 职责

Claude Agent SDK 根据当前 `cwd` 和官方配置体系自行发现 MCP。

在本设计中，Claude SDK 是 MCP 发现与加载的唯一权威执行者。

## 代码层收敛方向

### 主链路需要移除的能力

1. 从前端 run 提交负载中移除 `mcpEnabled`
2. 从后端 `agent-run` transport 中移除 `mcpEnabled`
3. 从 `buildClaudeV2RuntimeOptions()` 中移除 `mcpEnabled`
4. 从 `buildSessionOptions()` 到 SDK 的参数传递中移除 `mcpEnabled`
5. 不新增 `mcpServers` 透传入口

### 需要保留但重新定位的能力

1. 保留对 Claude 初始化事件中 `mcp_servers` 的读取
2. 保留对失败 MCP server 的记录
3. 保留 latency trace 中与 MCP 观测相关的信息
4. 保留只读的 UI 状态展示

### 需要降级为兼容层的能力

以下现有逻辑不再属于 Agent V2 官方 MCP 运行时模型的一部分：

- 基于 Claude CLI 的 MCP 增删改接口
- 自定义 MCP detector
- 将 MCP 当作应用主配置的一组设置 UI

这些逻辑如果继续保留，只能以以下角色存在：

- 历史兼容
- 辅助排障
- 与 Agent V2 运行时解耦的附属能力

## 错误处理

### 无 MCP 被发现

如果 Claude 在当前 `cwd` 下没有发现任何 MCP：

- 不报应用错误
- 会话按普通无 MCP 模式继续运行
- UI 可以显示“当前会话未发现 MCP server”，但不能提示用户去打开应用开关

### 部分 MCP server 初始化失败

如果 Claude 返回的 `mcp_servers` 中某些 server 失败：

- 不阻断整个 run
- 把失败状态作为只读诊断信息记录和展示
- 将问题归因保持在 Claude 配置或 server 可用性层面

### `cwd/projectPath` 无效

如果应用无法提供有效 `projectPath` 或传递后的 `cwd` 无效：

- 应用直接报错
- 因为这是应用唯一真正控制的 MCP 前提条件

## 诊断设计

### 运行后诊断

以 Claude 初始化事件为准，读取：

- 发现了哪些 server
- 每个 server 的状态
- 哪些失败
- 失败 server 名称

运行后诊断是 MCP 状态的权威展示来源。

### 运行前轻量提示

应用可以做极薄的本地只读检查，例如：

- 当前项目根是否存在 `.mcp.json`
- 文件是否是合法 JSON

但这些信息只能作为提示，不能当成“Claude 一定会按此结果运行”的依据。

### 排障文案原则

所有排障文案应引导用户回到官方配置体系：

- 检查项目根 `.mcp.json`
- 检查 `~/.claude.json`
- 检查对应 MCP server 是否可连通

禁止出现“去应用设置里打开 MCP”这类文案。

## 测试与验证

### 单元测试

覆盖以下收敛点：

- `mcpEnabled` 已从 request builder 移除
- `mcpEnabled` 已从 session pool 传参移除
- 前后端提交链路不再包含 `mcpEnabled`
- `cwd` 仍被正确传递
- `mcp_servers` 事件仍能被读取与记录

### 集成测试

模拟 Claude 初始化事件的三类情况：

1. 无 `mcp_servers`
2. 存在成功 server
3. 同时存在成功与失败 server

验证：

- 会话都能正常继续
- 诊断与 trace 展示符合只读观察原则

### 手工验收

准备一个真实项目根 `.mcp.json`，验证：

1. 当前项目目录下运行时，Claude 能发现 MCP
2. 删除或改名 `.mcp.json` 后，Claude 不再发现项目级 MCP
3. 应用不需要任何 MCP 开关也能完成同样行为
4. 失败 MCP server 不阻断正常 run

## 风险与缓解

### 风险 1：维护者仍沿用旧心智

风险：
维护者继续认为 MCP 由应用开关或 CLI 管理入口控制。

缓解：
在代码注释、spec、后续 plan 中明确“运行时纯官方发现”的边界。

### 风险 2：旧 UI 或接口继续暗示应用控制 MCP

风险：
用户从旧 UI 文案中继续形成错误认知。

缓解：
后续实现中将相关 UI 与接口降级为兼容/辅助层，并修正文案。

### 风险 3：排障能力退化

风险：
移除应用层开关后，问题更难定位。

缓解：
保留只读诊断层，并以 Claude init 事件作为权威状态来源。

## 实施结果定义

当以下条件同时成立时，说明本轮目标完成：

1. Agent V2 主链路不再传递 `mcpEnabled`
2. Agent V2 runtime 不再传递 `mcpServers`
3. 运行时只依赖 `cwd` 触发 Claude 官方 MCP 发现
4. 应用仍能展示 Claude 实际发现到的 `mcp_servers` 状态
5. 用户排障路径已回归 `.mcp.json` / `~/.claude.json`

## 涉及文件

本设计直接影响或约束的主链路文件包括：

- `src/components/chat/hooks/useChatComposerState.ts`
- `server/index.js`
- `server/agent-v2/application/start-conversation-run.js`
- `server/agent-v2/application/continue-conversation-run.js`
- `server/agent-v2/application/create-agent-v2-services.js`
- `server/agent-v2/application/handle-claude-command.js`
- `server/agent-v2/runtime/claude-v2-request-builder.js`
- `server/agent-v2/runtime/claude-v2-session-pool.js`
- `server/utils/claude-mcp-runtime.js`
- `server/utils/claude-latency-trace.js`

本设计刻意不把 `.mcp.json` 可视化管理器纳入范围。

## 结论

本轮不做“CC UI 自己的 MCP 系统”，只做“Claude 官方 MCP 发现模型在 Agent V2 运行时中的薄封装回归”。

最终的正确心智应是：

- 应用负责把 Claude 带到正确项目目录
- Claude 负责发现和加载 MCP
- 应用负责观察和解释 Claude 实际发现到了什么

这能在不牺牲排障能力的前提下，使当前项目的 MCP 运行时行为与 Claude 官方模型保持一致。
