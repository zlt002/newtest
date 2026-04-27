# Chat Execution Message Unification Design

## 背景

当前聊天区的 assistant 执行过程存在多套并行样式：

- 普通 assistant 文本消息
- 独立的 `Thinking...`
- 工具调用块（如 `Bash` / `Read` / `Write`）
- 子代理 `Task` 卡片
- `JobTree` 树状执行块
- 底部或中间的状态通知

这会造成两个直接问题：

1. 同一条会话在运行过程中会出现样式切换
2. 同一个项目、不同对话会因为执行路径不同而表现出五花八门的左侧 UI

用户的明确目标不是“某些场景用树”，而是：

- 同一条 assistant 回答从开始到结束只使用一种左侧容器样式
- 整个项目内所有 assistant 执行过程尽可能统一、清晰、结构化

## 目标

把当前聊天区中所有 assistant 过程态与结果态，统一收敛到一个通用的 `Execution Message` 容器中。

该容器统一承载：

- thinking
- 单工具执行
- 多工具串行执行
- 子代理 / Task 编排
- 权限等待
- 可恢复告警
- 失败与中止
- 最终答案

## 非目标

本次设计不包含：

- 改造用户消息气泡样式
- 新增独立 tracing 页面或右侧执行面板
- 改造底层 provider 协议
- 让所有原始工具日志默认完全展开
- 改造聊天区以外的 UI 系统

## 设计结论

### 1. 一个 assistant turn 只允许一种左侧容器样式

用户消息继续保留右侧气泡。

assistant 侧不再根据消息种类分别渲染成：

- 普通文本块
- thinking 块
- tool 块
- orchestration 卡
- job tree 块

而是统一成一个 `Execution Message`。

### 2. Execution Message 是所有 assistant 执行过程的唯一外层容器

assistant 相关内容无论底层来自什么消息类型，都先归并为一次执行会话，再由统一容器渲染。

容器内允许出现的节点类型：

- `planning`
- `thinking`
- `tool`
- `subagent_dispatch`
- `subagent`
- `warning`
- `waiting`
- `synthesis`
- `final_answer`

重点不是让所有节点长得完全一样，而是：

- 外层容器统一
- 内层节点按语义变化

### 3. JobTree 不是单独特判，而是 Execution Message 的一个子集

当前的 `JobTree` 只覆盖：

- orchestration 文案 + Task
- thinking + Task

新的目标是扩大为通用模型：

- 普通直答：`thinking -> final_answer`
- 单工具：`thinking -> tool -> final_answer`
- 多工具：`thinking -> tool -> tool -> final_answer`
- 子代理：`thinking -> task -> subagent -> synthesis -> final_answer`

也就是说：

- `JobTree` 仍然可以保留内部数据结构能力
- 但在产品层面，统一命名与统一渲染应提升为 `Execution Message`

### 4. 运行中和完成后必须共用同一个容器

禁止同一条会话在运行中是普通消息/卡片，完成后再突然切成树状块。

正确行为应为：

- 一旦 assistant turn 开始，就创建同一个 `Execution Message`
- 后续节点增量写入这个容器
- 完成后容器只做状态变化，不更换外层样式

### 5. 所有 assistant 过程都尽量结构化，但保留少量兜底

目标覆盖范围：

1. 普通直答
2. 单工具执行
3. 多工具串行
4. 子代理编排
5. 权限等待
6. 可恢复告警
7. 中止/失败
8. 最终答案流式生成

少量兜底场景：

- 纯系统控制事件
- 无法可靠归类的历史脏数据
- 极短且无过程信息的简单回复

兜底要求：

- 即便走 fallback，也必须仍然使用统一的外层容器
- 不允许 fallback 回到另一套独立 assistant 样式

## 容器结构

### 顶部：Execution Header

统一显示这次 assistant 执行的总状态：

- 标题
- 当前阶段
- 运行时长
- 是否存在警告
- 是否等待中
- 是否已完成/失败

标题生成优先级：

1. 已知任务摘要
2. orchestration 文案摘要
3. 第一条 assistant thinking 的简要归纳
4. 默认标题 `执行过程`

### 中部：Execution Tree

用统一树状结构承载执行步骤。

典型结构：

```text
主代理
├─ 规划 / 思考
├─ 工具执行
│  ├─ Bash: ls /Users/...
│  └─ Read: PRD.md
├─ 子代理派发
│  └─ 子代理 A
│     ├─ 步骤
│     ├─ 工具
│     ├─ 告警
│     └─ 结果摘要
├─ 汇总
└─ 最终答案
```

### 底部：Final Answer

最终答案不再回到独立 markdown assistant block，而是挂在同一个容器的末尾。

当尚未产出最终答案时，底部区域可显示：

- `等待结果`
- `正在汇总`
- 流式答案草稿

## 场景适配

### 场景 A：普通直答

输入形态：

- user
- thinking
- assistant text

渲染结果：

- 一个 `Execution Message`
- 包含 `thinking` 节点
- 包含 `final_answer` 节点

### 场景 B：单工具执行

输入形态：

- user
- thinking
- tool_use / tool_result
- thinking
- assistant text

渲染结果：

- 一个 `Execution Message`
- thinking 与工具都进入同一棵树
- tool 节点可折叠查看输入/输出

### 场景 C：多工具串行

输入形态：

- user
- thinking
- tool A
- tool B
- tool C
- final answer

渲染结果：

- 一个 `Execution Message`
- 工具节点按顺序排列
- 中间的 thinking 不再独立漂浮

### 场景 D：子代理 / Task

输入形态：

- user
- orchestration text 或 root thinking
- Task
- subagent tool_result / progress
- synthesis thinking
- final answer

渲染结果：

- 一个 `Execution Message`
- 子代理作为树节点嵌套
- `JobTree` 的层级组织保留，但提升为统一容器内部结构

### 场景 E：等待权限 / 中止 / 失败

输入形态：

- permission_request
- permission_cancelled
- complete(aborted)
- error

渲染结果：

- 不再漂浮成独立通知块
- 作为 execution 节点或状态块并入统一容器

## 交互原则

### 1. 默认突出主流程

默认展示：

- 当前阶段
- 最近步骤
- 当前工具/子代理
- 告警摘要
- 最终答案

默认折叠：

- 原始 tool input
- 原始 tool result
- 冗长中间日志

### 2. 不允许样式跳变

一旦 assistant turn 被识别为执行过程，就立刻进入统一容器。

后续只允许：

- 节点增量增加
- 节点状态变化
- 最终答案填充

不允许：

- 前半段普通消息，后半段再切到另一套容器
- 运行中是 tool/task 卡片，完成后再切成树

### 3. 允许信息逐步长出来

统一容器不要求一开始就拥有完整结构。

允许：

- 先只有 header + thinking
- 后续出现 tool 节点
- 再后续出现 subagent 节点
- 最后出现 final answer

但这些变化必须发生在同一个外层容器内。

## 数据模型建议

当前 `ChatMessage` 已经存在：

- `isThinking`
- `isToolUse`
- `isOrchestrationCard`
- `isJobTree`
- `jobTreeState`

下一步应收敛成更稳定的数据模型：

- `isExecutionMessage`
- `executionState`
- `executionStatus`
- `executionMode`

其中：

- `executionMode = direct | tool | orchestration | mixed`

这样 `MessageComponent` 不再做多分支判断，而是：

1. 用户消息走用户气泡
2. assistant 消息统一优先尝试 `ExecutionMessage`
3. 极少数兜底消息走 fallback

## 实现边界

### 第一阶段

目标：

- assistant 过程全部进入统一外层容器
- 保留现有 `JobTreeContainer` 作为内部树渲染基础
- 把单工具 / 普通直答也纳入统一壳子

允许暂时复用：

- 现有 `JobTree` 数据结构
- 现有工具渲染片段

### 第二阶段

目标：

- 进一步统一节点样式
- 收敛 tool 节点与 subagent 节点视觉语言
- 压缩重复的标题、badge、摘要文案

## 风险

### 风险 1：实时流重组

消息往往先到 thinking，后到 tool_use，再到 result。

应对：

- 使用增量构建的 execution state
- 允许容器逐步长出节点，不依赖一次性完整数据

### 风险 2：历史会话兼容

不同 provider / 不同时间的会话消息形态不完全一致。

应对：

- 优先识别通用执行模式
- 保留统一容器 fallback
- 禁止因为识别失败而退回多套旧样式

### 风险 3：信息密度过高

所有 assistant 过程统一后，默认信息量可能过大。

应对：

- 默认只展示主流程
- 明细按节点折叠
- 低价值重复事件合并

## 验收标准

以下条件全部满足时，视为设计达标：

1. 同一条 assistant 会话从开始到结束只使用一种左侧外层容器样式
2. 普通直答、单工具、多工具、子代理场景都能进入统一容器
3. 运行中与完成后不再切换外层样式
4. 同一个项目中，assistant 侧的主要视觉语言保持一致
5. thinking、tool、Task、最终答案不再散落为多套并行块
6. 识别失败时也不会退回五花八门的旧样式，而是进入统一 fallback 容器

## 推荐结论

后续实现不应继续围绕“补更多 `JobTree` 入口”展开，而应改为：

**把当前 `JobTree` 升级为通用 `Execution Message`，统一承载所有 assistant 过程。**
