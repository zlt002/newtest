# Claude Agent V2 Conversation-Shell Run-Core Design

## 背景

当前项目里的 Claude agent 已经积累了较多能力，包括会话管理、流式输出、工具过程展示、任务树、执行时间线和消息归一化。但这些能力仍然分散在多条模型线上：

- 有些功能以“聊天消息”为中心
- 有些功能以“session / streaming patch”为中心
- 有些功能以“task / job tree / timeline”为中心
- 前后端之间还存在多种历史 shape 和兼容分支

这导致三个持续问题：

1. 前端很难从单一事实源推导出稳定 UI，经常需要补丁式拼装状态
2. 后端把 Claude SDK 事件、产品领域事件和展示层语义混在一起，边界不清
3. 用户看到的是聊天产品，但系统内部并没有真正形成“聊天外壳 + 执行内核”的统一模型

结合 `docs/v2.md` 提供的 Claude Agent SDK V2 方向，这次重构不再修补现有 Claude 链路，而是直接重新构建一套新的 Claude agent 架构，并在完成后一次性替换旧实现。

## 目标

本次设计目标如下：

1. 对用户保留自然、稳定的聊天体验
2. 对系统内部统一成 `session + run + event` 执行模型
3. 后端强绑定 Claude Agent SDK V2，不再让前端理解 SDK 原始消息细节
4. 前后端共同切换到一套新的稳定协议、状态模型和 UI 呈现
5. 新架构落地后，旧 Claude 链路尽量整体删除，而不是长期并存

## 非目标

本轮不做以下事情：

- 不为多 provider 设计通用运行时抽象
- 不追求兼容旧前端状态模型或旧 websocket message shape
- 不围绕 Claude SDK V1 保留降级路径
- 不扩展复杂的 fork / branch conversation 能力
- 不顺手改造与 Claude agent 主链路无关的右侧面板或其它产品模块

## 用户已确认的产品与技术前提

在 brainstorming 过程中，以下前提已经确认：

1. 产品形态采用混合模式
   对外是聊天体验，对内是统一 run/session 驱动
2. 技术内核强绑定 Claude Agent SDK V2
   核心设计围绕 `createSession / resumeSession / send / stream`
3. 重构范围覆盖前后端
   同时定义新的协议、状态模型和 UI 呈现
4. 迁移方式采用一次性切换
   新架构完成后直接替换旧链路，旧实现尽量删除

## 核心结论

推荐方案为 `Session shell + Run core`：

- 用户始终在一个 conversation 里进行多轮交流
- 每次用户提交都会产生一个 run
- Claude SDK V2 session 是后端私有运行时资源，不直接暴露给前端
- 前后端之间只传递稳定的执行事件协议
- 聊天消息只是对 run 事件的一种投影，而不是系统的唯一主模型

这个方案兼顾了两件事：

- 产品层面仍然保留“我在和 Claude 聊天”的心智
- 工程层面把执行、流式、工具、错误、恢复都统一到 run 生命周期里

## 方案对比

### 方案 A：Session-first

直接以 Claude V2 session 为前后端共同主模型，run 只是某次 turn 的附属概念。

优点：

- 最贴近 SDK V2 原始心智
- 上手实现快

缺点：

- 前端容易直接依赖 SDK 事件细节
- 工具、子任务、执行时间线仍然容易散落在各处
- 聊天 UI 会继续被底层 runtime shape 牵着走

### 方案 B：Run-first

每次用户请求都作为独立 run，conversation 退化成 run 列表容器。

优点：

- 执行链路最清晰
- 对任务、子任务、工具过程建模自然

缺点：

- 聊天体验会变得过于“任务系统化”
- 用户容易失去连续对话感

### 方案 C：Session shell + Run core

Session 负责承载聊天体验和会话级上下文，Run 负责承载每轮执行事实，Claude session 只在后端 runtime 层存在。

优点：

- 用户体验和工程边界同时成立
- 能强绑定 Claude V2，又不会让前端依赖 SDK 细节
- 最适合一次性替换旧 Claude 链路

缺点：

- 设计工作量最大
- 需要一次把协议、状态机和 UI 视图讲清楚

本次设计采用方案 C。

## 领域模型

新 Claude agent 只保留 4 个一等概念，其他状态和展示都从它们派生。

### 1. Conversation

Conversation 是用户看到的聊天会话，负责承载：

- 会话标题与元信息
- 当前绑定的 Claude session 标识
- 会话级设置
- run 列表和排序关系

Conversation 不代表某次执行，它只提供连续聊天的产品外壳。

### 2. Run

Run 是一次用户提交对应的一次执行，是真正的系统工作单元。它负责记录：

- 本轮用户输入
- 本轮执行状态
- 本轮工具调用和过程事件
- 最终答案、失败原因和产物
- 使用量、耗时和恢复信息

系统的“停止”“重试”“继续追问”“恢复执行”都围绕 run 定义。

### 3. Claude Session Runtime

Claude session runtime 是后端私有层，强绑定 Claude Agent SDK V2。它负责：

- `createSession`
- `resumeSession`
- `session.send`
- `session.stream`
- `session.close`

同时负责把 Claude SDK 原始消息翻译成项目自己的领域事件。

### 4. Execution Event

Execution event 是前后端共享的稳定事实协议。前端只消费这种事件，不直接消费 Claude SDK message shape。

## 整体架构

### 前端

前端负责三件事：

1. `conversation shell`
   聊天主界面、输入区、run 切换、用户可读时间线
2. `run projection`
   把执行事件投影成聊天消息、执行面板、工具卡片和状态提示
3. `event consumption`
   从 HTTP 和 WebSocket 获取事件并增量更新本地状态

### 后端

后端负责四件事：

1. `conversation / run orchestration`
2. `Claude SDK V2 runtime management`
3. `event translation and broadcasting`
4. `persistence and replay`

### Claude SDK V2 的位置

Claude SDK V2 只允许存在于后端 runtime 层。前端永远不理解以下原语：

- SDK session 对象
- SDK 原始消息类型
- Claude 特有的 delta / stop 事件结构

前端看到的永远是项目自定义的稳定事件协议。

## 后端分层

后端建议重建成 5 层，自上而下单向依赖。

### 1. Routes / Transport

职责：

- HTTP / WebSocket 接入
- 鉴权
- 参数校验
- 请求与响应序列化

限制：

- 不做 Claude 业务判断
- 不做状态拼装
- 不直接操作 SDK

建议接口：

- `POST /api/agent/conversations`
- `GET /api/agent/conversations/:id`
- `GET /api/agent/conversations/:id/runs`
- `POST /api/agent/conversations/:id/runs`
- `POST /api/agent/runs/:id/abort`
- `GET /api/agent/runs/:id/events`

WebSocket 只负责推送统一事件包络，不再推多种历史消息 shape。

### 2. Application / Orchestration

职责：

- 创建 conversation
- 创建并启动 run
- 在已有 conversation 上发起新 run
- 中断 run
- 恢复会话绑定的 Claude session

这一层只编排仓储、runtime 和 event bus，不直接理解 SDK message 细节。

### 3. Domain

职责：

- 定义 `Conversation`
- 定义 `Run`
- 定义 `ExecutionEvent`
- 定义 `ToolCall`
- 定义 `Artifact`
- 定义 run 状态机与状态转换约束

这层是系统语义的唯一来源，前端和 infrastructure 都要服从这里的命名和边界。

### 4. Infrastructure / Claude Runtime

职责：

- 封装 Claude Agent SDK V2
- 维护 session 生命周期
- 执行 run
- 翻译 SDK 消息为领域事件

建议拆分为：

- `claudeSessionPool`
- `claudeRunExecutor`
- `claudeEventTranslator`
- `claudeResumeStore`

### 5. Persistence

职责：

- 存储 conversation
- 存储 run
- 记录 run events
- 记录 artifact
- 记录 conversation 与 Claude session 的绑定关系

## 数据模型

底层事实源不再是“消息列表”，而是以下表或集合：

- `conversations`
- `runs`
- `run_events`
- `artifacts`
- `conversation_runtime_binding`

聊天时间线可以由 run 和 run events 投影得到，但消息本身不再是最底层事实源。

## Run 状态模型

Run 状态建议定义为：

- `queued`
- `starting`
- `streaming`
- `waiting_for_tool`
- `completing`
- `completed`
- `failed`
- `aborted`

补充原则：

1. 任何 UI loading 状态都只能从 run 状态派生
2. 任何错误都必须体现在 run 生命周期中，而不是散落在消息层
3. run 的最终完成、失败或中断必须有明确终态事件

## 事件协议

前后端统一使用自定义事件协议，不暴露 Claude SDK 原始消息。

### 统一包络

```ts
type AgentEventEnvelope = {
  eventId: string;
  conversationId: string;
  runId: string;
  sessionId: string | null;
  sequence: number;
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
};
```

### 第一版主事件

- `run.created`
- `run.started`
- `run.status_changed`
- `assistant.message.started`
- `assistant.message.delta`
- `assistant.message.completed`
- `tool.call.started`
- `tool.call.delta`
- `tool.call.completed`
- `tool.call.failed`
- `artifact.created`
- `usage.updated`
- `run.completed`
- `run.failed`
- `run.aborted`

### 协议约束

必须满足以下约束：

1. 前端只认 `AgentEventEnvelope`
2. 一个 run 的 UI 状态必须可以由事件序列完整重放
3. 后端可以新增 payload 字段，但不能破坏已发布事件类型语义
4. Claude SDK 原始 message 只允许存在于 translator 内部

## 前端状态模型

前端核心不再是“消息数组 + streaming patch”，而是 `conversation shell + run projection store`。

### 1. Conversation State

负责：

- 当前 conversation 元信息
- active run
- 绑定的 Claude session 标识
- 输入框和会话级 UI 状态

### 2. Run State

负责：

- run 当前状态
- 用户输入
- assistant 最终文本
- 工具调用状态
- artifact
- usage
- error
- 起止时间

### 3. Event Store

负责：

- 按 run 保存事件序列
- 支持增量消费与回放
- 作为 projection 的唯一输入

建议结构：

```ts
type ConversationState = {
  conversationId: string;
  activeRunId: string | null;
  claudeSessionId: string | null;
  title: string;
};

type RunState = {
  runId: string;
  conversationId: string;
  status:
    | 'queued'
    | 'starting'
    | 'streaming'
    | 'waiting_for_tool'
    | 'completing'
    | 'completed'
    | 'failed'
    | 'aborted';
  userInput: string;
  assistantText: string;
  toolCalls: ToolCallState[];
  artifacts: ArtifactState[];
  usage: UsageState | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

type EventStore = {
  byRunId: Map<string, AgentEventEnvelope[]>;
};
```

## UI 信息架构

新的前端采用三层结构：

### 1. Conversation Timeline

这是用户默认主视图。用户看到的仍然是一问一答，但 assistant 的每次回答本质上是一个 run 的摘要投影，而不是零散消息拼接。

### 2. Run Execution Panel

每一轮回答都可展开执行面板，展示：

- 当前阶段
- 流式输出
- 工具调用过程
- 子任务或 task 进度
- 文件产物
- usage / latency / error

现有 thinking、tool、job tree、run timeline 等能力都应收拢到这里。

### 3. Composer Context Bar

输入框区域显示当前 conversation / run 状态，例如：

- 正在生成
- 正在调用工具
- 已中断，可继续
- 上一轮失败，可重试

这样用户不需要从聊天消息里猜系统状态。

## UI 呈现原则

后续所有 Claude agent UI 都应遵守以下规则：

1. 聊天主视图只展示对用户有语义价值的内容
2. 工具细节、task 细节、流式中间态默认进入 execution panel
3. assistant 最终回答和执行过程分离展示
4. 所有 loading / processing 状态都从 run 状态派生
5. “继续追问”定义为对同一 conversation 创建新 run，而不是继续拼接旧消息

## 错误模型

错误不再只是某条消息失败，而是 run 生命周期的一部分。

建议分为四类：

- `runtime_error`
- `tool_error`
- `protocol_error`
- `user_abort`

对应规则：

1. `run.failed` 必须在 run 卡片和 execution panel 中同时可见
2. assistant 正文和错误状态分离展示
3. 如果已有部分输出后失败，保留已生成内容，但标记本轮未完整完成
4. 所有可恢复动作必须有明确语义，例如 `重试本轮`、`继续追问`、`重新连接`

## 迁移策略

迁移方式采用一次性切换，因此设计必须主动服务于删除旧链路。

### 迁移原则

1. 新架构使用全新核心模块，不在旧 Claude 模块上打补丁
2. 先把新链路从 route 到 UI 全链路打通
3. 打通后整体删除旧 Claude 专用 legacy shape 和兼容逻辑
4. 历史会话如果保留，只保留查看能力；新发起对话全部进入新模型

### 建议删除的旧类别

完成切换后，应尽量删除以下类型的旧实现：

- 旧 Claude message normalization 分支
- 旧 websocket 历史 shape 兼容逻辑
- 旧前端多源 streaming patch 逻辑
- 旧 session 消息主模型及其补丁式派生代码

## 测试策略

测试重点不应是零散组件，而应围绕事件驱动链路是否可靠。

### 1. Domain Tests

验证：

- run 状态机是否合法
- 事件序列是否允许相应状态转换
- 终态和错误态是否正确落盘

### 2. Runtime Translator Tests

验证：

- Claude SDK V2 典型流式消息是否能稳定翻译为项目事件
- session resume 和 send / stream 的边界条件是否被正确表达

### 3. Projection Tests

验证：

- 给定一组事件流，前端是否能正确投影出 timeline、execution panel、工具状态和最终答案

### 4. Integration Tests

验证从发起 run 到前端完成展示的完整流程，包括：

- 正常完成
- 工具调用
- 中断
- 失败
- resume conversation

## 第一阶段落地范围

为了保证重构真正落地，第一阶段只覆盖 Claude agent 主链路。

### 包含

- 新的 `session + run + event` 后端模型
- Claude SDK V2 runtime 封装
- 新 WebSocket / 事件协议
- 新前端 store 和 projection
- 新聊天主视图和 execution panel
- 中断、失败、重试、resume 基础能力
- 删除旧 Claude 运行链路

### 不包含

- 多 provider
- conversation fork
- 高级 artifact 工作流
- 复杂性能诊断面板
- 新旧 UI 的长期并存兼容

## 模块边界要求

为避免这次重构在实现时退化为“新旧混写”，需要明确以下硬边界：

1. Claude SDK V2 只能在后端 runtime 层出现
2. 前端不能直接消费 SDK 原始事件
3. Event projection 只能从 `AgentEventEnvelope` 推导 UI
4. Route 层不能直接拼装 UI 语义
5. 新架构模块命名应与旧 Claude 链路区分清楚，便于最终删除旧代码

## 风险与取舍

### 风险

1. 一次性切换意味着中途不能长期依赖旧逻辑兜底
2. 前后端一起重建，短期改动面较大
3. 强绑定 Claude SDK V2，后续 V2 预览变动会集中影响 runtime 层

### 取舍

这些风险是可接受的，因为：

- 当前主要问题本身就是模型分裂，不适合继续局部修补
- 新架构已经把 V2 风险隔离在 runtime 层
- 一次性切换有助于真正删除历史兼容债务

## 成功标准

如果实现完成后满足以下条件，就说明这次设计成立：

1. 新一轮 Claude 对话的事实源是 run 和 event，而不是消息 patch
2. 前端可以只依赖统一事件协议渲染聊天和执行视图
3. Claude SDK V2 细节不再泄漏到前端
4. 中断、失败、工具执行、resume 都能通过 run 生命周期一致表达
5. 旧 Claude 链路的大部分兼容逻辑被删除

## 最终决定

本次 Claude agent 重构正式采用以下方向：

- 产品形态：`Session shell + Run core`
- Claude 集成策略：`Strongly coupled Claude Agent SDK V2 runtime`
- 前后端契约：`Event-sourced run protocol`
- 前端组织方式：`Projection-based chat UI`
- 上线方式：`Big bang replacement with aggressive legacy deletion`
