# Chat Run-Centric Execution Design

## 背景

当前聊天区的统一容器方案虽然把多种 assistant 消息折进了同一个外壳，但仍然保留了“消息卡片思维”的核心问题：

- 同一轮请求里，assistant 可能多次输出文本、thinking、tool_use、tool_result、warning、permission、subagent 结果
- 前端必须猜测哪一段 assistant 文本是“最终答案”
- 当后续还有工具、thinking 或二次总结时，页面会出现“先有结果、后续又继续跑”的错位体验
- 首屏还有独立的 `Processing` 占位，和后续执行结构不是同一种语言

用户反馈已经明确表明：这套信息架构本身不成立。问题不只是某个判定 bug，而是模型选错了。

## 目标

把聊天区从“猜哪条消息是答案”的消息拼装模型，改为“一个用户问题 = 一个 run”的执行流模型。

这次设计的目标是：

1. 同一轮用户问题只对应一个稳定的左侧 assistant 容器
2. 运行中的所有内容都先进入 timeline，而不是提前显示为最终答案
3. 只有在 run 真正结束后，才生成正式结果区
4. 同一 run 内允许多次 assistant 文本输出，但这些文本默认都属于过程事件
5. 如果完成后又来了新一轮执行事件，它必须被视为新 run，而不是继续污染旧 run

## 非目标

本轮不追求：

- 继续扩展旧 `JobTree` 的视觉层级
- 继续在现有 `Execution Message` 上追加更多特判
- 为所有 provider 做统一协议适配
- 一次性重做右侧文件预览、草稿预览、diff 面板

## 核心结论

### 0. 默认时间线，按需展开子树

当前 UI 的一个根本问题不是“不够结构化”，而是“结构过度”：

- 同一条事实被重复展示在多个层级里
- `派发任务 / 派发轮次 / 子代理 / 步骤 / 状态 / 汇总` 被同时铺开
- 用户还没理解发生了什么，就先被迫理解框架

新的默认原则是：

- **默认展示单列时间线**
- **只有在确实存在并行或独立执行单元时，才展开子树**
- **一条事实只展示一次**
- **不预置“汇总”“派发轮次”“状态”这类抽象框架节点**

换句话说，UI 的第一责任不是“看起来像 tracing”，而是“让用户顺着时间就能看懂发生了什么”。

### 1. 一个用户问题不是“一条 assistant 消息”

它应该被建模为一个 `Run`。

一个 run 从用户发送问题开始，到模型显式完成、失败、中止、或进入等待为止。

### 2. run 内只有两类信息

#### A. Timeline

时间线负责承载所有运行事件，包括：

- thinking
- tool_use
- tool_result
- warning
- error
- permission_request
- task / subagent
- 中间说明文案
- 中间阶段性结论

这些都属于“过程事件”，即使是自然语言文本，也默认不算正式答案。

#### B. Committed Answer

正式答案区只在 run 已完成时才出现。

它是“提交结果”，不是“任意 assistant 文本”。

在 run 处于执行中、等待中、失败中时：

- 不显示“最终答案”
- 不显示“回答结果”
- 不允许把中间说明文案塞进结果区

只有当 run 进入 `completed` 状态后，才从 timeline 尾部提取最终可提交结果。

### 3. 结果可以晚于多次中间输出

同一轮里允许这种顺序：

1. thinking
2. assistant 说明
3. Bash
4. tool_result
5. thinking
6. assistant 中间结论
7. Write
8. tool_result
9. thinking
10. committed answer

前 1-9 都属于 timeline。

只有第 10 步才进入正式结果区。

### 4. 完成后再来事件 = 新 run

如果旧 run 已完成，之后又收到新的 thinking / tool_use / subagent / assistant 阶段文本，这不能继续挂在旧 run 下面。

必须开启一个新的 assistant run。

这条规则是为了杜绝：

- 旧 run 已经完成，UI 还继续变化
- 结果已经展示，后面又被更多过程污染
- 用户分不清现在是在补充旧答案，还是开始了新一轮执行

## 信息架构

### 运行中

运行中只显示：

- Run Header
- Timeline

不显示结果区。

Run Header 只表达：

- 当前状态：执行中 / 等待中 / 失败 / 已完成
- 当前阶段：准备中 / 调工具 / 子代理执行 / 汇总中
- 是否可中断

Timeline 是单向追加的，不回溯改语义，只允许更新节点状态。

默认渲染形态应该是：

- `思考`
- `工具调用`
- `工具结果`
- `告警/等待`
- `子代理`
- `阶段结论`

这些事件按时间顺序铺开，而不是先强行塞进一棵多层树。

只有在以下情况，才允许展开一层子树：

- 明确存在 `Task / subagent`
- 明确存在并行执行
- 明确需要在同一个节点下展示工具历史

除此之外，保持一维时间线。

### 已完成

已完成时显示：

- Run Header
- Timeline
- Committed Answer

时间线保留，结果区附加在底部。

### 等待中

等待中仍属于当前 run，不新开消息。

表现：

- Header 显示等待中
- Timeline 增加 permission / input-needed 节点
- 不显示结果区

### 失败

失败时也不显示结果区，除非明确存在可提交的最终答复。

例如：

- 工具失败后模型恢复并最终完成：状态应为 completed，失败节点只存在于 timeline
- run 提前终止且没有正式答复：状态为 failed，只有 timeline，没有结果区

## 状态模型

Run 级别状态：

- `queued`
- `running`
- `waiting`
- `completed`
- `failed`
- `aborted`

节点级别状态：

- `queued`
- `running`
- `waiting`
- `completed`
- `failed`

状态优先级：

1. `aborted`
2. `waiting`
3. `running`
4. `failed`
5. `completed`
6. `queued`

补充约束：

- 一旦存在 `committedAnswer`，run 默认优先判为 `completed`
- 节点失败不自动等于 run 失败；只有 run 没有恢复、没有完成信号、没有 committed answer 时，才升级为 failed

## 分段规则

### 如何识别一个 run

一个 run 由以下边界划定：

- 起点：某条用户消息后的第一条 assistant 相关事件
- 终点：`complete` / `aborted` / `fatal error` / `waiting for input`

### 如何切出新 run

若当前 run 已结束，后面又出现新的 assistant 执行事件，则新建 run。

“新事件”的判定包括：

- thinking
- tool_use
- tool_result
- subagent
- assistant 中间说明
- streaming delta

### 如何识别 committed answer

仅当以下条件都满足时，assistant 文本才可进入结果区：

1. run 已进入 `completed`
2. 该文本位于当前 run 尾部
3. 该文本之后不存在新的可见执行事件
4. 该文本不是 orchestration preface、tool preface、permission 文案、status update

换句话说：

结果区不是“猜出来的最后一段文本”，而是“run 完成后确认提交的答复”。

## UI 规则

### 1. 移除首屏独立 Processing 壳

首屏在第一条 assistant 可见事件到来前，也应该使用 run 容器的骨架态。

不能再出现：

- 空白页面
- 一条单独的 `Processing`
- 随后再切到另一种执行树 UI

### 2. 运行中不出现“最终答案”

运行中只允许看到：

- 当前阶段
- 时间线
- 可选的“当前结论草稿”

文案统一为：

- `当前结论`
- `阶段结论`
- `回答结果`

其中：

- `最终答案` 这个词只在 completed 时使用，或者直接废弃不用

### 3. 过程节点默认更轻

当前 UI 的问题之一是过程节点信息密度过高、层级太重。

新方案要求：

- timeline 默认单列、按时间顺序展开
- 不把每个 thinking 包成大卡片
- 工具节点默认折叠参数
- 失败/告警保留，但只占一行摘要，展开后再看详情
- 同一条文案、同一个动作、同一个标题不能在多个层级重复出现
- `状态` 节点不是独立业务事实时，不单独渲染
- `汇总` 节点在真正进入汇总前，不预先占位

具体禁止项：

- 不允许同一句 `Explore project structure` 同时出现在 `子代理标题 / 子代理卡片 / 步骤 / 状态`
- 不允许为了结构完整性预渲染空的 `汇总` 节点
- 不允许 `主代理 -> 派发任务 -> 派发轮次 -> 子代理 -> 步骤` 这种深层链在信息量不足时默认展开

时间线优先的目标是：

- 用户不需要理解框架词汇
- 用户只需要顺着事件读下去
- 需要深挖时再展开局部结构

### 4. 不允许结果区反复变化语义

一旦 committed answer 已生成：

- 结果区只能做流式补全
- 不能从“阶段结论”再变成“另一种最终答案”
- 如果还有新的执行轮次，应开新 run

## 数据模型建议

新增统一模型：

```ts
type AssistantRun = {
  runId: string;
  status: 'queued' | 'running' | 'waiting' | 'completed' | 'failed' | 'aborted';
  startedAt?: string | number | Date;
  completedAt?: string | number | Date;
  timeline: RunEvent[];
  committedAnswer: RunCommittedAnswer | null;
};

type RunEvent = {
  id: string;
  kind:
    | 'thinking'
    | 'tool_call'
    | 'tool_result'
    | 'status'
    | 'warning'
    | 'error'
    | 'subagent'
    | 'subagent_step'
    | 'permission'
    | 'text_note';
  status: 'queued' | 'running' | 'waiting' | 'completed' | 'failed';
  title: string;
  timestamp?: string | number | Date;
  meta?: Record<string, unknown>;
};

type RunCommittedAnswer = {
  content: string;
  timestamp?: string | number | Date;
};
```

关键变化：

- `ExecutionMessageState` 不再把 root tree 当唯一主模型
- 改为 `AssistantRun`
- tree 只是 timeline 的一种可选展开方式，而不是数据真相
- 默认渲染单位是 `RunEvent[]`，不是预制树节点

## 渲染原则

### 默认形态

默认情况下，一个 run 应该渲染成：

1. Header
2. 时间线事件列表
3. 完成后才显示结果区

### 可展开形态

只有这些节点可以拥有局部展开：

- 子代理
- 工具调用
- permission / warning / error 详情

展开的作用是“补充上下文”，不是“重复主线内容”。

### 不再作为一级结构的元素

以下元素不应该默认成为一级结构：

- 派发轮次
- 汇总
- 状态
- 阶段占位节点

它们只能在确有独立语义时，作为事件附属信息出现。

## 对现有代码的影响

### 需要废弃的假设

- “一组 assistant 消息可以直接压成一个 execution message”
- “最后一段普通文本大概率就是最终答案”
- “运行中可以先显示最终答案区，后面再修正”
- “首屏没消息时可以独立画一个 Processing 占位”

### 需要新增的边界

- run builder：把 store messages 切成 run
- committed answer extractor：只在 run 完成后工作
- timeline event classifier：把 assistant 文本分成 `text_note` vs `committed answer`
- post-complete splitter：complete 后的新事件要切新 run

## 测试要求

至少覆盖以下场景：

1. `thinking -> text_note -> tool_use -> tool_result -> final text`
   只有最后一段进入 committed answer

2. `thinking -> text_note -> tool_use -> tool_result -> thinking -> text_note -> tool_use -> tool_result -> final text`
   中间两段说明都只进入 timeline

3. `thinking -> tool error -> recovery text -> tool_use -> tool_result -> final text`
   run 最终应为 completed，错误节点保留在 timeline

4. `complete -> later thinking/tool_use`
   必须开启新 run

5. 首屏无消息但 isLoading=true
   渲染 run skeleton，而不是独立 Processing 样式

6. waiting / permission_request
   保持当前 run，不能新开消息，不能出现结果区

## 迁移策略

分三步做：

### 阶段 1：数据模型先行

- 新增 run builder
- 先只在数据层切出 run，不改全部 UI

### 阶段 2：容器替换

- 用 run 容器替代现有 execution container
- 移除首屏独立 Processing 占位
- 默认改为单列 timeline 渲染
- 仅对子代理和工具详情做按需展开

### 阶段 3：删除旧猜测逻辑

- 删除“提前最终答案”识别
- 删除旧 JobTree / ExecutionMessage 特判分支
- 统一落到 run timeline + committed answer

## 决策

本次方向正式调整为：

**聊天区不再以 assistant message 为主模型，而以 assistant run 为主模型。**

assistant 在同一用户问题内可以有多次中间输出，但这些输出默认都属于 run timeline。  
只有 run 完成后，才生成 committed answer。  
UI 默认采用**时间线优先、子树按需展开、去掉重复节点和预置框架节点**的原则。
