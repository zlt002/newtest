# Claude UI Message Architecture Design

## 背景

当前 `cc-ui` 已经接入 Claude Agent SDK、LangSmith tracing、子代理 `Task` 卡片、工具过程折叠和 usage/cost 展示，但用户层面的主聊天流仍然混入了太多底层执行细节，导致以下问题同时出现：

- 同一轮会话里，用户消息、Claude 编排说明、`Task` 子代理、子代理内部 `WebSearch/WebFetch/Bash`、最终汇总都在抢同一层级。
- 子代理内部工具过程有时被折叠进 `Task` 卡片，有时又以顶层聊天消息刷屏，表现不稳定。
- 网络抓取失败、`Sibling tool call errored` 这类中间失败，会以强红框频繁打断主聊天流，即使最终子代理已经成功回退并产出结果。
- Bash 原始命令、`WebSearch / Parameters / Details` 这类诊断细节直接暴露给普通用户，信息噪音过高。
- LangSmith/usage/cost 已经在系统中可用，但主 UI 还没有建立“用户层 vs 执行层 vs 诊断层”的边界。

结合 Claude Agent SDK 官方文档、当前 trace 记录和项目现状，这次重构的目标不是再补更多底层事件，而是建立一套稳定的 **UI 领域事件和卡片层级**，让普通用户看到清晰的任务编排和结果，诊断细节则收敛到折叠区域或诊断入口。

## 目标

这次设计的目标是：

1. 主聊天流只保留“用户真正需要理解的任务状态”和“最终结果”。
2. 子代理 `Task` 成为一等卡片，承载自己的状态、过程、警告、摘要和统计，不再让内部工具过程外泄到主聊天流。
3. 工具失败按“是否影响最终结果”决定显示级别，避免中间失败刷满红框。
4. usage / token / cost 保留，但放在更符合认知的位置。
5. 保持与 Claude Agent SDK 官方消息模型兼容，不在 UI 层依赖 LangSmith 原始 trace 结构。

## 非目标

这次不做以下事情：

- 不替换当前 SDK 响应流为 LangSmith trace 驱动。
- 不重新设计整套聊天样式语言或品牌视觉。
- 不改变 SDK/CLI 允许哪些工具运行。
- 不把所有底层工具都做成复杂的可视化工作流面板。
- 不在这一轮处理 Markdown follow-along、右侧预览等独立交互问题。

## 官方模型与当前系统的对应关系

Claude Agent SDK 当前在本项目中的关键消息可分成 4 类：

### 1. 用户与助手层

- `assistant(thinking)`
- `assistant(text)`
- `result`

这些消息适合映射为：

- 编排说明
- 最终答案
- usage/cost 汇总

### 2. 编排层

- `tool_use(name="Task")`
- `tool_result(Task)`

这些消息本质上表达：

- 派发了哪个子代理
- 子代理最终返回了什么

这类消息不应该继续展示成普通工具卡片，而应该映射为 **子代理卡片生命周期事件**。

### 3. 过程层

- `task_started`
- `task_progress`
- `task_notification`
- `tool_progress`
- `tool_use_summary`
- 子代理内部 `tool_use/tool_result`（如 `WebSearch`、`WebFetch`、`Bash`）

这些消息适合进入 **子代理卡片的过程时间线**，而不是主聊天流。

### 4. 诊断层

- `thinking` 原文
- `WebSearch / Parameters / Details`
- `WebFetch / Parameters`
- Bash 原始命令全文
- LangSmith trace spans
- 低层 usage 细分字段

这些信息对开发/排障有价值，但普通用户不应默认看到。

## 信息架构

新的 UI 结构分为 3 层：

### 用户层

用户默认看到的主聊天区域，仅展示：

1. 用户消息
2. Claude 编排卡片
3. 子代理卡片
4. 最终答案卡片

### 执行层

由每个 `Task` 子代理卡片内部承载：

- 当前状态
- 最近步骤
- 警告
- 结果摘要
- usage 统计

默认折叠，只显示关键摘要；展开后看过程时间线。

### 诊断层

放在 LangSmith 或诊断入口，不进主聊天流：

- 原始 Bash 命令
- `WebSearch / Parameters / Details`
- `WebFetch / Parameters`
- 原始 trace / spans
- 完整模型 usage 明细

## 主聊天流允许出现的卡片

### 1. 用户消息卡片

保持现有形式，不改展示语义。

### 2. Claude 编排卡片

当 assistant 先做编排说明，随后紧接一个或多个 `Task` 时，主聊天流中不再显示零散的：

- `thinking`
- “我来创建两个子代理……”
- `Task / Creating task`

而是收敛成一张编排卡：

- 标题：`已派发 2 个子代理`
- 内容：
  - `经济调研`
  - `天气调研`

如果只有一个子代理，则显示：

- `已派发 1 个子代理`

### 3. 子代理卡片

每个 `Task` 独立成卡。

卡片头部展示：

- 子代理名称（来自 `tool_input.description`）
- 状态：`运行中 / 已完成 / 失败 / 部分降级完成`
- 当前工具（若有）
- 耗时
- token
- tool 数

卡片主体分 3 区：

1. 过程摘要
2. 警告/降级信息
3. 结果摘要

展开后才展示：

- 最近过程时间线
- 原始报告全文
- 更细 usage

### 4. 最终答案卡片

主聊天流中的最终 assistant 文本只保留：

- 汇总结论
- 合并摘要
- 总 usage/cost 摘要

不再在最终答案卡里重复插入完整子代理原始报告，除非用户主动展开对应子代理卡片。

## 子代理卡片结构

### 头部

- 子代理标题：例如 `经济调研`
- 状态 badge
- `23 tools`
- `22,043 tokens`
- `336.4s`

### 过程摘要

只显示最近 1-3 个高价值步骤，文案做语义化转换，例如：

- `搜索佛山 GDP 与产业数据`
- `尝试抓取 Wikipedia 内容`
- `外部抓取受限，切换到命令行兜底`

不要显示原始：

- `WebSearch / Parameters`
- `WebFetch / Details`
- `Bash / Parameters`

### 警告区

用于承载中间失败但最终未导致整个子代理失败的情况，例如：

- `部分外部站点抓取失败，已切换备用方式`
- `多个抓取请求失败，结果基于已有知识和命令行回退生成`

如果最终子代理成功，这里用黄色/中性 warning，而不是红色错误卡。

### 结果区

默认只显示摘要：

- 2-5 条 bullet
- 或前 200-400 字摘要

用户点击展开后，查看完整原始报告。

## 错误分级规则

### A 级：最终失败

条件：

- `Task` 最终 `tool_result.is_error = true`
- 或子代理没有产出有效结果

显示方式：

- 子代理卡片红色失败状态
- 主聊天流保留失败卡

### B 级：中间失败但已成功回退

典型例子：

- `Unable to verify if domain ... is safe to fetch`
- `Sibling tool call errored`
- 某次 `WebFetch` 失败后改用 `curl` / 本地命令行兜底

显示方式：

- 不再作为顶层红框消息进入主聊天流
- 聚合为子代理卡片内 warning

### C 级：纯过程噪音

例如：

- 重复 `WebSearch / Parameters`
- 原始 Bash 命令
- 多次相同 domain 校验失败

显示方式：

- 默认不在主聊天流显示
- 只在展开的过程时间线或调试面板中可见

## 具体事件映射

前端不再直接“来什么消息渲染什么”，而是引入 UI 领域事件：

- `orchestration_started`
- `subagent_spawned`
- `subagent_step`
- `subagent_warning`
- `subagent_completed`
- `subagent_failed`
- `final_answer_ready`
- `usage_summary_ready`

映射规则：

### `assistant(thinking/text)` + 随后 `Task`

映射为：

- `orchestration_started`

主聊天区不展示原始 `thinking` 文本。

### `tool_use(name="Task")`

映射为：

- `subagent_spawned`

并创建子代理卡片。

### `task_started / task_progress / task_notification / tool_progress / tool_use_summary`

映射为：

- `subagent_step`

不作为主聊天顶层消息展示。

### 子代理内部 `tool_use/tool_result`

规则：

- 进入子代理卡片的过程时间线
- 只抽取语义化步骤，不直接展示原始工具名/参数

### 中间抓取失败

如：

- `Unable to verify if domain ... is safe to fetch`
- `Sibling tool call errored`

映射为：

- `subagent_warning`

最终任务成功时，不升格为主聊天错误。

### `tool_result(Task)` 成功

映射为：

- `subagent_completed`

结果写入对应子代理卡片的结果区。

### `tool_result(Task)` 失败

映射为：

- `subagent_failed`

### 最终 assistant 汇总 text

映射为：

- `final_answer_ready`

主聊天只显示这一份正式汇总。

### `result / modelUsage / total_cost_usd`

映射为：

- `usage_summary_ready`

挂在最终答案卡片底部，以及子代理卡片头部的轻量统计。

## 去重与接管规则

为了避免“先出来、后消失、再重排”，主聊天区需要遵守以下接管规则：

1. 主聊天流中的 `Task` 卡片是子代理的唯一顶层载体。
2. 一旦某条过程消息已被归属到某个 `Task` 卡片，就不再以独立聊天消息出现。
3. assistant 编排说明如果只是为了引出随后的 `Task`，则折叠进编排卡，不再单独显示。
4. 最终答案卡接管前面的临时编排说明，但不接管 `Task` 卡片。
5. 原始重复 user replay/system replay 一律不进主聊天流。

## LangSmith 与诊断入口的角色

LangSmith 继续作为旁路诊断层，不直接驱动主 UI。

用途：

- 查看 spans
- 调试任务因果链
- 分析 token/cost
- 分析工具失败点

主 UI 只消费当前系统中的规范化消息，不直接把 LangSmith 原始字段呈现给普通用户。

## 分阶段落地

### Phase 1：主聊天流瘦身

- suppress 顶层 `WebSearch/WebFetch/Bash`
- suppress 顶层中间错误红框
- 建立编排卡
- `Task` 作为唯一子代理顶层卡片

### Phase 2：子代理卡片重构

- 头部统计
- 步骤摘要
- warning 聚合
- 结果摘要和展开全文

### Phase 3：最终答案与 usage 收口

- 只保留一份正式汇总
- usage/cost 放到最终答案底部
- 子代理卡片保留轻量统计

### Phase 4：诊断层分离

- LangSmith 链接与 session 关联
- 可选调试抽屉
- 原始步骤与命令行只进调试层

## 风险与兼容性

### 风险 1：过度隐藏过程导致用户缺乏信任

缓解：

- 子代理卡片默认展示最近 1-3 个步骤
- 保留展开查看完整过程的能力

### 风险 2：某些失败被误判为可降级 warning

缓解：

- 只有在 `Task` 最终成功时，才把中间失败降为 warning
- 最终失败一律升格为红色失败状态

### 风险 3：现有消息测试大量依赖原始 kind

缓解：

- 保留底层 `NormalizedMessage` 不变
- 新增 UI 领域映射层
- 在 `useChatMessages` 附近增量重构

## 测试策略

至少覆盖以下场景：

1. 一个用户请求派发两个子代理
2. 子代理内部 `WebSearch/WebFetch/Bash` 不再进入主聊天流
3. 中间 `WebFetch` 失败但最终 `Task` 成功，只显示 warning
4. 最终 assistant 汇总只出现一次
5. 子代理卡片能显示 token/tool/duration
6. assistant 编排说明被折叠进编排卡，不再单独露出
7. 真正失败的 `Task` 仍保留错误状态

## 完成标准

完成后，用户在“派发经济和天气子代理调研佛山”这类场景里应看到：

- 一条用户消息
- 一张“已派发 2 个子代理”的编排卡
- 两张子代理卡（经济 / 天气）
- 每张卡里有简洁过程、状态、warning、统计
- 一张最终汇总答案卡

而不应再看到：

- 满屏 `WebSearch / Parameters`
- 满屏 `WebFetch / Parameters`
- 原始 Bash 命令刷屏
- 多个中间错误红框重复打断主聊天流
- 同一轮结果在多个层级重复出现
