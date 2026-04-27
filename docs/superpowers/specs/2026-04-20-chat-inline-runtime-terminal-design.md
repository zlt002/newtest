# Chat Inline Runtime Activity Design

## 背景

当前聊天页已经接上 Claude Agent V2 的实时事件流，但前端展示层仍然存在明显分裂：

- 主聊天区里仍有 legacy transcript 节奏
- 旧 `ConversationTimeline` / `RunExecutionPanel` 路径曾把执行态拆成独立卡片
- `ConversationStream` / task blocks / decision blocks 仍保留另一套 V2-first 展示思路
- 某些原始任务/工具/协议内容会通过 legacy message 或中间投影直接泄漏到聊天区

当前代码状态补充：

- `ChatInterface` 主路径已经切到 `AssistantRuntimeTurn + InlineRuntimeActivity`
- `ConversationTimeline`、`RunExecutionPanel`、`AgentConversationShell`、`projectConversationTimeline` 已从源码主路径移除

用户当前的明确偏好不是“减少反馈”，而是：

1. 后端只要有反应，前端就要实时显示
2. 过程反馈要跟当前问答放在一起，而不是飘到侧边或另一块完全分离的区域
3. 页面不能再被一张张大灰卡撑爆
4. 用户要持续知道 AI 当前在干什么
5. 现有已经失去价值的样式层和过渡组件要趁机清理

## 用户确认的设计方向

本设计基于以下已确认选择：

- 过程反馈继续放在主聊天区内
- 不对后端事件做“为了降噪而隐藏”的产品裁剪
- 后端只要有反应，就允许前端回馈
- 不再把过程反馈渲染成多张大块灰卡
- 改成“当前 assistant 回答中的内嵌执行动态文本区”
- 过程区固定高度、内部滚动、可展开查看全量
- 正式回答继续自然接在过程区下方
- 要顺便评估并清理不再需要的样式组件和展示壳

## 目标

1. 把当前 assistant 执行过程收口为一种稳定的主聊天区展示模式。
2. 让用户持续看到后端 AI 的实时动态，而不是只看到模糊的 `Processing`。
3. 用 UI 容器化方式承接全量反馈，避免大面积灰块和页面高度失控。
4. 让正式回答与运行过程属于同一个 assistant turn，而不是多个并列表面。
5. 让运行态与历史态共用同一套 assistant turn 结构，而不是形成两套独立 UI。
6. 明确收口后哪些组件继续保留，哪些已经完成清理。

## 非目标

- 本设计不要求后端减少事件、合并事件、去重事件或隐藏协议细节。
- 本设计不改造右侧面板的信息架构。
- 本设计不在本轮决定最终的事件文案翻译策略。
- 本设计不要求立刻删除所有 legacy transcript 能力。
- 本设计不把聊天页改造成纯黑底日志页或工程终端页。

## 设计结论

### 1. 一个 assistant turn 只保留一个主容器

当前同一轮 assistant 执行可能同时出现在：

- 聊天气泡/markdown 区
- `ConversationTimeline`
- `RunExecutionPanel`
- 某些 raw task / tool / notification 泄漏消息

收口后，一个 assistant turn 只保留一个稳定主容器：

- 顶部：运行状态摘要
- 中部：执行动态文本区
- 底部：正式回答内容

这三个区域属于同一条 assistant turn，不再拆成多块并列表面。

### 2. 执行动态文本区是新的过程承载体

过程反馈继续留在主聊天区，但不再使用大块卡片堆叠。

新的主过程容器定义为 `Inline Runtime Activity`：

- 紧跟在当前 assistant turn 顶部
- 固定高度
- 内部自动滚动
- 默认展示实时流
- 支持“展开全部”查看全量历史
- 可接受原始协议级内容进入，但必须放在轻量动态文本容器内

换句话说，不是减少反馈，而是把反馈改成“滚动动态文本流”而不是“卡片流”。

### 3. 正式回答与过程反馈同区不同层

主聊天区内，一个 assistant turn 的结构如下：

1. 状态摘要条
2. 执行动态文本区
3. 正式回答 markdown

阅读顺序仍然自然：

- 先知道现在在干什么
- 再看运行过程有没有新动作
- 最后看正式回答何时继续生成

用户不需要在主区和侧边区之间来回跳转。

### 4. 运行态与历史态使用同一套结构

这套结构不只是“过程展示”，而是这条 assistant 回答的完整结构。

同一个 assistant turn 在运行中和回看历史时都使用同一个容器：

- 状态摘要
- 执行动态文本区
- 正式回答正文

区别只在于展示强度：

- 运行态：执行动态默认展开，自动滚动，强调实时感
- 历史态：执行动态默认收起或弱展开，不再自动滚动，强调回看和复盘

这样可以避免：

- 运行中是一套 UI
- 完成后又切成另一套 UI

也可以保证用户回看历史时，仍能理解这条回答是如何产生的。

### 5. 不靠数据裁剪控噪，靠视觉权重控噪

因为用户已明确要求“不做筛选，不做隐藏”，所以控噪手段只能来自视觉结构：

- 固定高度
- 单一动态文本容器
- 低对比背景
- 紧凑行高
- 时间戳 + 事件类型 + 摘要单行排列
- 正式回答区保持高可读性
- 动态历史通过内部滚动承接，而不是持续向下铺页面

### 6. 原始协议不再进入用户消息气泡

用户接受看到更多反馈，甚至接受原始协议内容，但这些内容不能再被当作“正式聊天文本消息”渲染。

例如：

- `<task-notification>`
- `<tool-use-id>`
- `<output-file>`

允许保留在执行动态文本区中，但不允许作为蓝色/白色聊天气泡正文的一部分出现。

这不是隐藏信息，而是纠正错误的 UI 语义归属。

## 信息架构

收口后的聊天区结构如下：

### 1. User Bubble

保持现状，继续承载用户输入。

### 2. Assistant Runtime Turn

这是新的主容器，内部包含三层：

#### a. Runtime Header

显示本轮运行的高层状态，例如：

- 正在思考
- 正在运行 2 个子代理
- 正在调用工具
- 等待权限
- 正在汇总
- 已完成 / 已失败 / 已中止

这一层不是详细日志，而是高层状态。

#### b. Inline Runtime Activity

显示后端的实时事件流：

- 全量进入
- 固定高度
- 内部滚动
- 可展开全量

默认布局建议：

- 高度：约 180 到 240px
- 风格：浅底、弱边框、低对比，不使用纯黑终端背景
- 字体：比正文小一档，可使用较紧凑的系统字体或弱 monospace
- 单行结构：`时间戳 + 事件种类 + 摘要`
- 最新事件自动滚动到可见区

#### c. Final Answer Body

正式回答 markdown 仍在执行动态文本区下方按正常节奏显示。

这样用户既能看到过程，也不会把过程误认成正式结论。

## 交互规则

### 默认状态

- 执行动态区默认展开
- 默认显示固定高度窗口
- 新事件进入后自动滚动到底部

### 超过可视高度

- 不增加页面整体高度
- 只在执行动态区内部滚动
- 顶部保留“展开全部”入口

### 展开全部

展开后展示本轮 assistant turn 的完整事件历史。

展开只影响本轮 turn，不影响整页其他消息。

### 完成后行为

run 完成后：

- 执行动态区停止自动滚动
- 仍保留已产生的事件
- 正式回答继续展示在其下方
- 本轮 turn 自动从“运行态”切换到“历史态”
- 切换到历史态后，执行动态区默认进入折叠或弱展开模式

### 历史查看行为

历史态下：

- 仍然使用同一套 assistant turn 容器
- 正式回答仍然是主内容
- 执行动态区默认不抢主视觉焦点
- 用户点击后可以展开查看完整过程

历史态的目标不是继续强调“实时”，而是强调“可回看、可复盘”。

### 失败/中止

失败或中止时：

- header 变为失败/中止状态
- 执行动态区保留失败前最后事件
- 若存在恢复动作，则放在正式回答区上方或下方的 action row，不再额外起独立 execution panel

## 事件展示原则

因为本轮不依赖后端裁剪，所以前端展示原则必须足够简单稳定：

### 1. 执行动态区接全量实时事件

包括但不限于：

- `run.started`
- `sdk.system.init`
- `sdk.task.*`
- `sdk.hook.*`
- `tool.call.*`
- `assistant.message.delta`
- `run.completed`
- `run.failed`
- `run.aborted`
- interactive / permission 相关事件
- 原始协议结构片段

### 2. 正式回答区只接正式 assistant 内容

正式回答区只承载用户理解为“答案正文”的内容。

工具、任务、原始协议、任务标签、输出文件路径等过程信息全部停留在执行动态区。

### 3. 用户态动作必须可见

这类事件在 header 层也要有显著反馈：

- 子代理启动
- 工具开始
- 权限等待
- 用户问题等待
- 完成
- 失败

## 对现有组件的影响

### 应保留并演进

#### `ComposerContextBar`

继续保留，但职责收紧为：

- 显示当前高层运行态
- 不再尝试承载过多执行细节

#### `agentEventStore`

继续保留，作为当前执行态唯一事实源。

#### `useAgentConversation`

继续保留，但要新增对 `Inline Runtime Activity` 所需事件序列的稳定暴露。

#### `projectRunExecution`

继续保留，但输出结构要从“execution summary only”扩展为：

- high-level run summary
- terminal feed items
- final answer body inputs

### 应弱化或删除

#### `ConversationTimeline`

当前它把 run 压成独立卡片，和“主聊天区内嵌执行动态文本区”目标冲突。

收口后不再作为主聊天区主要展示单元。

结论：

- 从主路径移除
- 若无其他明确用途，进入删除候选

#### `RunExecutionPanel`

当前它是独立执行面板，和新方案中的 `Inline Runtime Activity` 语义重叠。

收口后：

- 不再作为主聊天区独立面板存在
- 其失败恢复按钮能力可以迁移到新 assistant turn 容器底部

结论：

- 主路径删除
- 组件本身进入删除或局部能力迁移候选

#### `AgentConversationShell`

当前是旧 V2-first shell 思路残留，且已不在主路径。

如果后续不再作为独立页面壳复用，应进入删除候选。

#### `projectConversationTimeline`

如果 `ConversationTimeline` 退出主路径，这层投影也将失去主价值。

需要评估是否还有测试/回放用途；若无，进入删除候选。

#### `projectConversationStream` 与 stream blocks

这部分当前服务于另一套 V2 stream block UI：

- `TaskBlock`
- `TurnBlock`
- `DecisionBlock`
- `ArtifactBlock`
- `RecoveryBlock`
- `StatusInline`

新方案中，主路径改为“assistant runtime turn + terminal + final answer”，这些 block 不再是核心渲染单元。

结论：

- 若确认不再走 stream-block 路线，则整体进入清理候选
- 如果保留，只能作为调试态或二级视图，而不是主聊天区主表面

### 需要专项排查的 legacy 泄漏点

#### `useChatMessages.ts`

当前能看到：

- `tool_progress`
- `<task-notification>` 正则
- 某些 legacy 结构化内容被转成普通消息

这是原始协议进入聊天气泡的重要风险点。

新方案要求：

- 这些内容改道进入执行动态 feed
- 不再进入正式聊天消息正文

## 推荐实施方式

### Phase 1: 建立新 turn 容器

- 在 `ChatInterface` 主路径里引入新的 assistant runtime turn 结构
- 保留现有数据源，不立即大拆
- 先让 header + activity + answer 在一个容器里工作
- 同时定义运行态与历史态的同构结构

### Phase 2: 迁移执行反馈

- 把 `RunExecutionPanel` 的执行反馈迁到 terminal
- 把 `ConversationTimeline` 从主路径拿掉
- 把 raw protocol 泄漏内容从普通消息区挪走

### Phase 3: 清理冗余组件

- 清理不再使用的 timeline / shell / stream block 组件与测试
- 收紧样式层
- 删除与新主路径不一致的 fallback UI

## 风险

### 1. 全量事件导致执行动态区更新非常频繁

这是用户接受的设计选择，但实现时要确保：

- 执行动态区是单容器 append，而不是多卡片重渲染
- 否则性能和抖动仍会很差

### 2. assistant delta 与 terminal event 可能交错

需要明确：

- terminal feed 是过程区
- answer body 是正文区

两者可以同时增长，但不能互相污染。

### 3. 旧测试与旧组件耦合较深

当前大量测试绑定在：

- `ConversationTimeline`
- `RunExecutionPanel`
- `AgentConversationShell`
- `projectConversationStream`

实施时要同步设计“删除哪些测试、迁移哪些测试”。

## 测试要求

实施后至少要覆盖：

1. 发送消息后，assistant turn 内立即出现 runtime header 与 terminal
2. 后端事件连续进入时，terminal 内部滚动而非页面整体撑高
3. 原始 task/tool/protocol 内容不再进入正式消息气泡
4. 正式回答继续在 terminal 下方自然流出
5. 失败/中止时恢复动作仍然存在
6. 旧 `ConversationTimeline` / `RunExecutionPanel` 主路径引用被清掉

## 最终结论

这次收口不再试图通过“少展示事件”解决混乱，而是承认用户需要看到更多后端动态，并用更适合的 UI 载体承接这些动态。

最终方向是：

- 主聊天区继续承载完整问答
- 过程反馈继续与问答放在一起
- 但过程反馈改成一个内嵌的执行动态文本区
- 正式回答和执行动态区同属一个 assistant turn
- 运行态和历史态共用同一个 assistant turn 结构
- 现有 timeline / execution panel / shell / stream block 主路径逐步退出

这条路线既保留“Claude Code CLI 式的实时可见感”，也能把当前聊天区从“大灰卡堆叠”收回到一个稳定、可持续维护的结构上。
