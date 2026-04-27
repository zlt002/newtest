# Chat Single Assistant Turn Unification Design

## 背景

当前聊天页同时存在多套并行渲染体系：

- legacy transcript 气泡
- `ConversationStream` / 旧 V2 stream 展示
- `RunExecutionPanel` / `ConversationTimeline` 一类独立执行面板
- `ToolRenderer` 导出的工具卡片、参数卡片、详情块
- 原始协议文本泄漏到普通 assistant 消息中的路径

用户已经明确指出这些问题会直接破坏体验：

1. 同一轮问答会被拆成多种风格完全不同的块
2. 过程反馈和正式回答之间没有稳定边界
3. 历史会话与当前会话看起来像两套产品
4. 用户无法稳定判断“系统还在工作”还是“页面卡住了”
5. Claude Agent V2 事件虽然已接入，但前端没有形成单一真相源和单一主渲染路径

同时，仓库已经在 V2 方向上做了若干收口：

- 主路径开始引入 `AssistantRuntimeTurn`
- `agentEventStore + projection` 已成为当前执行态的核心基础
- 部分旧执行组件已退出源码主路径

但页面体验仍然混杂，说明问题已经不再是“再补一个组件”，而是必须完成一次真正的消息组织模型收口。

## 目标

1. 让一次用户发送在前端只呈现为一个统一的 assistant 容器，而不是多类顶层卡片。
2. 让后端的实时动态能够持续反馈给用户，但反馈必须属于这次 assistant 回答的内部结构。
3. 让当前运行态与历史回放态共用同一套渲染模型。
4. 借鉴 `claude-code-viewer-main` 的 schema-first / single-list 组织思路，但不照搬其多卡片 viewer 视觉。
5. 彻底清退会重新把页面带乱的旧主路径渲染分支。

## 非目标

- 本设计不要求减少、隐藏、节流或合并后端事件。
- 本设计不把聊天页改造成日志查看器或终端页。
- 本设计不重做右侧面板与项目导航信息架构。
- 本设计不要求当前轮次就改造所有底层存储表结构。
- 本设计不复制 `claude-code-viewer-main` 的全部组件、侧栏和工具可视化体系。

## 参考项目结论

参考目录：

- `/Users/zhanglt21/Desktop/claude-code-viewer-main`

该项目有明确参考价值，但只能借其组织层，不能直接整套复刻。

### 可借鉴部分

- 严格 schema 化的会话数据组织
- 单一列表主路径渲染
- 历史与实时尽量走同一数据模型
- sidechain / task / tool 等能力通过投影归并，而不是前端临时拼装

### 不直接照搬部分

- `thinking / tool / system` 作为顶层独立卡片的大量 viewer 式视觉
- 偏日志分析而非对话阅读的视觉重心
- 将一轮回答自然拆成多条并列“内容类型消息”的主视图结构

### 原因

`claude-code-viewer-main` 面向的是“会话日志查看与分析”，它把类型拆开是合理的。

当前项目要解决的问题则是“让用户在一个正常聊天界面中持续知道 AI 在做什么”。如果照搬其多卡片结构，会再次回到：

- 一轮提问被拆成 thinking 卡、tool 卡、system 卡、summary 卡
- 实时态能看，历史态像 viewer
- 多轮 assistant 回复进一步碎片化

因此，本设计的原则是：

**借 viewer 的组织层，不借 viewer 的多卡片视觉层。**

## 核心设计结论

### 1. 顶层只保留两类会话单元

聊天主视图中，顶层只允许出现：

- 用户消息
- 一个统一的 `AssistantTurn`

不再允许以下内容以顶层并列消息块形式进入主会话区：

- thinking 块
- tool_use / tool_result 卡片
- system / progress / hook 卡片
- 子代理 / task 独立卡片
- 灰色状态条、独立 stream 块、旧 context bar

### 2. 一次用户发送 = 一个 run = 一个 AssistantTurn

一次用户发送启动一次 run。

无论这次 run 内部发生多少事件，前端都只投影为一个 `AssistantTurn`。该 turn 负责承载：

- 这次执行的整体状态
- 全部实时过程动态
- 中间阶段性答复
- 最终正式答复

这条规则是本次收口的核心边界。

### 3. AssistantTurn 内部固定为三层结构

每个 `AssistantTurn` 固定包含以下三层：

#### a. 状态头

显示当前这次执行的整体状态，例如：

- 正在执行
- 等待权限
- 正在调用工具
- 正在汇总
- 已完成
- 已失败
- 已中止

状态头只负责让用户快速判断当前是否还在运行，不承载详细事件流水。

#### b. 动态流

这是过程展示区，用于实时承接后端事件。

特点：

- 全量进入，不做产品级隐藏
- 固定高度
- 内部滚动
- 默认展示最近若干条事件
- 支持展开查看完整事件历史
- 采用统一的小号动态文本样式，而不是多种大卡片

这一层的目标不是“解释所有协议”，而是“持续告诉用户后端正在做什么”。

#### c. 正文区

这是 AI 对用户真正说的话。

正文区按时间追加 assistant 的文本输出，但这些文本仍然属于同一个 `AssistantTurn`，而不是拆成新的顶层消息。

### 4. 一次发送内的多轮 assistant 回复，用“同一容器内分段”兼容

Claude Agent V2 以及 Claude Code 原生日志都存在一种常见情况：

- 同一次发送后
- AI 会在中途给出阶段性说明
- 然后继续调用工具或子代理
- 最后再给出总汇总

为了兼容这种模式，本设计不把每次阶段性回复都提升成新的顶层 assistant 消息，而是在同一个 `AssistantTurn` 的正文区内按阶段累积。

正文片段允许分成三类语义段：

- 启动回应
- 阶段回应
- 最终回应

但这些只是正文区内部的段落语义，不形成第二套 UI 层级。

## 信息架构

收口后的聊天主区结构如下：

1. `UserTurn`
2. `AssistantTurn`

`AssistantTurn` 的 view model 建议统一为：

```ts
type AssistantTurnViewModel = {
  runId: string;
  sessionId: string;
  status: "running" | "waiting_permission" | "completed" | "failed" | "aborted";
  headerLabel: string;
  activityItems: RuntimeActivityItem[];
  bodySegments: AssistantBodySegment[];
  startedAt: string | null;
  finishedAt: string | null;
  isHistorical: boolean;
};
```

其中：

- `activityItems` 承载所有过程事件
- `bodySegments` 承载阶段性文本与最终文本
- `isHistorical` 只影响交互强度，不影响结构

## 事件到 UI 的映射原则

### 1. 所有后端动态先进 store，再做单一投影

前端当前执行态继续以：

- `agentEventStore`

作为全量事件真相源。

但不允许各类组件直接各自消费原始事件并渲染自己的块。必须通过统一 projection，把事件归并成 `AssistantTurnViewModel`。

### 2. 事件只分为三类角色

#### a. 状态事件

用于驱动状态头：

- run started
- waiting permission
- resumed
- completed
- failed
- aborted

#### b. 动态事件

用于驱动动态流：

- thinking / planning
- tool start / tool result
- task updated
- sidechain / subagent lifecycle
- hook / progress / compact / system 信息
- 未知但需要可见的协议事件

#### c. 正文事件

用于驱动正文区：

- assistant 文本 delta
- assistant 阶段性文本
- final result / synthesis

### 3. 未支持的 SDK 事件不伪装成业务终态

对于尚未被明确建模的新 SDK 事件：

- 不允许直接混进普通聊天 markdown
- 不允许伪装成 `completed` 或其他业务状态
- 允许以受控 fallback 的形式进入动态流

UI 上应显示为“协议事件/未分类事件”的统一动态项，而不是突然变成另一套卡片样式。

## 实时态设计

### 1. 过程反馈放在 assistant 回答内部

运行中的用户阅读顺序应为：

1. 看到这轮 assistant 已经开始工作
2. 能持续看到动态流在更新
3. 能看到正文在逐步形成

用户不需要在不同区域来回跳转，也不会因为短时间没有正文就误判为系统挂住。

### 2. 动态流展示规则

建议行为：

- 默认展示最近 5 条事件
- 超过后显示“展开查看全部 N 条”
- 展开后看到这轮完整动态历史
- 运行中默认自动滚动到最新
- 完成后停止自动滚动

注意：

- 本设计不通过隐藏事件来控噪
- 控噪完全依赖单一容器、低视觉权重、小字号、内部滚动

### 3. 动态流不是“过程终端”

用户已明确不希望它是乌漆麻黑的大终端块。

因此视觉方向应为：

- 轻量、浅层、低对比
- 小字号动态文本
- 类似“深度思考过程”而不是“终端面板”
- 与正文区明显区分，但不抢主视觉

## 历史态设计

### 1. 历史态不是另一套 UI

历史回放必须复用与实时态相同的 `AssistantTurn` 结构。

唯一区别在于行为，而不是结构：

- 实时态：默认展开、自动滚动、强调进行中
- 历史态：默认弱展开或折叠、不自动滚动、强调复盘

但两者都必须包含：

- 状态头
- 动态流
- 正文区

### 2. 历史回放仍走同一个 projection

历史数据不应该继续通过 legacy normalized message 直接控制主视图。

正确路径应为：

- 读取 run
- 读取 run 下的 persisted events / transcript segments
- 走与实时相同的 unified projection
- 得到同一个 `AssistantTurnViewModel`

这样才能保证：

- 当前会话和历史会话看起来是同一个产品
- 页面不会因为切换到历史而重新长回旧样式

## 需要退出主路径的旧能力

以下内容不得再作为聊天主视图的一部分继续生效：

- `MessageComponent` 中 assistant / thinking / tool / task / system 相关主渲染分支
- `ConversationStream`
- `RunExecutionPanel`
- `ConversationTimeline`
- `AgentConversationShell`
- `ToolRenderer` 以及其衍生的 `Agent / Parameters / Details` 主视图块
- 原始 `<task-notification>`、`<tool-use-id>` 等协议文本进入普通 assistant 气泡的路径
- composer 上方和消息区中的旧状态条、灰色 context bar、旧 loading 壳

这些能力要么彻底删除，要么降级成调试用途，但不能继续参与默认聊天视图。

## 需要统一归位到 AssistantTurn 的内容

以下内容不是删除，而是从“独立顶层块”改为“同一 assistant turn 的内部信息”：

- thinking
- tool_use
- tool_result
- system
- progress
- hook
- task_updated
- sidechain / subagent 状态
- compact / protocol fallback
- assistant 阶段性文本
- assistant 最终文本

## 前后端职责划分

### 后端职责

- 保持 Claude Agent V2 事件翻译的稳定边界
- 将 SDK 事件区分为状态事件、动态事件、正文事件
- 对未知 SDK 事件提供受控 fallback 分类
- 持久化 run 与 event，使历史回放可重建同一 `AssistantTurn`

### 前端职责

- `agentEventStore` 作为当前执行态唯一事件真相源
- 新的 unified projection 负责把实时和历史都投影成同一种 turn view model
- `ChatMessagesPane` 只认统一的 user turn / assistant turn 列表
- 不再让任意组件绕过 projection 直接消费原始事件做主渲染

## 实施边界建议

本设计对应的实现收口建议分成两阶段：

### 阶段 1：统一主视图

- 固定 `AssistantTurn` 成为唯一 assistant 主容器
- 将动态流与正文区组合成单一结构
- 退出旧执行面板和旧工具卡片主路径

### 阶段 2：统一历史回放

- 让历史态也改为基于 unified projection
- 清退 legacy message 主导历史渲染的残留
- 确保任意 session 的任意 run 都能回放成同一结构

## 验收标准

设计完成后的主观与客观判断标准如下：

### 1. 用户视角

打开任意当前会话或历史会话时，只能看到：

- 用户消息
- 一个统一的 assistant 容器
- 容器内部的状态、动态流和正文

### 2. 不应再出现的现象

- 蓝色工具卡片单独插入聊天流
- 灰色状态条或大面积过程卡片漂浮在正文之间
- `Claude / 思考中 / MD` 头部切换样式
- `Agent / Parameters / Details` 独立块
- 原始协议文本进入普通聊天气泡
- 当前态和历史态明显是两套不同样式

### 3. 多轮回复兼容性

同一轮 run 中即使出现：

- 中间阶段性回答
- 多次工具调用
- 子代理往返
- 最终总结

前端仍然只呈现为同一个 `AssistantTurn`。

## 风险与取舍

### 风险 1：短期内会出现双轨代码并存

在收口过程中，旧组件和新 projection 可能暂时并存。

取舍：

- 允许代码层过渡
- 不允许产品默认视图双轨并存

### 风险 2：事件映射不完整时，动态流信息量会先大于正文量

在初期，正文可能较少而动态项很多。

取舍：

- 先保证“全量可见且结构统一”
- 再逐步优化文案翻译和事件分层

### 风险 3：历史数据存在脏格式或 legacy message 依赖

某些旧 run 可能暂时无法完整映射。

取舍：

- 允许少量受控 fallback
- 不允许 fallback 回到另一套顶层视觉体系

## 最终结论

本次收口的长期正确方向不是继续增加新的执行卡片，而是：

- 借鉴 `claude-code-viewer-main` 的 schema-first / projection-first 组织方式
- 把一次用户发送统一映射成一个 `AssistantTurn`
- 把所有过程信息收进该 turn 的内部动态流
- 把历史态和实时态都统一到同一个 view model
- 清退旧的 assistant / tool / system / stream 多轨渲染

一句话总结：

**从“按消息类型散渲染”收口到“按 run 渲染单一 assistant turn”。**
