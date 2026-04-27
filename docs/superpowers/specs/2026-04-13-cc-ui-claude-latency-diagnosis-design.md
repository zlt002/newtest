# CC UI Claude 首包延迟排查设计

**日期**: 2026-04-13
**作者**: Codex
**状态**: 已批准

## 背景

在 `release/windows-lite` 的 CC UI 中向 Claude 发送消息时，即使输入非常短的内容，例如 `hi` 或 `1+1`，也会先进入较长时间的“处理中 / thinking”阶段，正文通常要 `10-30` 秒后才开始出现。

同样的项目目录、同样的账号配置、同样的模型下，直接在 Claude Code CLI 中发送同样内容，通常会在 `5` 秒内开始返回正文。

这说明问题更像是 CC UI 这条调用链在“正文首个 token 出现之前”做了额外工作，而不是模型本身或项目上下文大小导致的常规延迟。

## 目标

定位 CC UI 中 Claude 消息首包延迟的主要耗时位置，并明确它属于以下哪一类问题：

- 前端发送到后端前存在额外准备阶段
- 后端已发起 SDK 调用，但 Claude SDK 在正文前停留在较长的 thinking 阶段
- 后端已收到正文流，但前端没有及时渲染
- UI 调用参数与 CLI 不一致，导致 Claude 在 UI 模式下执行了更重的前置推理

本次工作只做诊断设计，不直接修改现有产品行为。

## 非目标

- 不在本次设计中直接优化 Claude 首包延迟
- 不引入新的 provider 切换逻辑
- 不重写现有聊天协议或消息结构
- 不提前假设是前端、后端或 SDK 某一方单独有问题

## 现状理解

当前 `release/windows-lite` 的 Claude 调用链不是直接 shell 调用 `claude` 命令，而是：

`CC UI 前端 -> Chat WebSocket -> server/claude-sdk.js -> @anthropic-ai/claude-agent-sdk -> WebSocket 回传 -> 前端消息列表渲染`

从已读代码看，后端具备流式转发能力：

- `server/index.js` 中的聊天 WebSocket 收到 `claude-command` 后直接调用 `queryClaudeSDK()`
- `server/claude-sdk.js` 中通过 `query()` 创建 SDK 查询实例
- 后端使用 `for await ... of queryInstance` 逐条读取 SDK 事件
- 事件经 `claudeAdapter.normalizeMessage()` 归一化后立刻通过 WebSocket 发回前端

因此，若用户感受到“thinking 很久但正文很晚出现”，最可疑的差异点不是“后端不支持流式”，而是：

- SDK 在首个正文 delta 之前输出了较长的 thinking 阶段
- UI 调用参数触发了比 CLI 更重的 agent 模式
- 前端对第一条正文 delta 的消费或展示存在延迟

## 约束

- 诊断埋点必须尽量只读，不改变现有聊天行为
- 不修改线上协议结构，优先复用现有日志和事件
- 所有测量点需要能按 `sessionId` 串联
- 需要支持在同一项目、同一句提示词下做 UI 与 CLI 的对照实验
- 当前工作区存在其他未提交改动，本次只新增诊断 spec，不混入无关修改

## 推荐方案

推荐采用“两段式排查”：

1. 对 CC UI 首包链路做精确埋点，确认时间耗在哪一段
2. 对齐 CC UI 与 Claude Code CLI 的运行参数，确认 UI 是否默认进入了更重的执行模式

这是最稳妥的方案，因为它先回答“慢在什么位置”，再回答“为什么会慢”，能避免在没有证据的情况下直接改 SDK 参数或前端逻辑。

## 方案对比

### 方案 A：只做链路埋点

优点：

- 能快速判断慢在前端、后端还是 SDK
- 对现有功能侵入最小

缺点：

- 只能告诉我们“慢在哪里”，不能单独说明“为什么 UI 比 CLI 慢”

### 方案 B：直接对齐 CLI 参数

优点：

- 一旦找对差异项，有机会直接得到修复方向

缺点：

- 如果没有时间戳证据，很容易误判真正瓶颈
- 可能把多个因素混在一起，难以复现

### 方案 C：先做轻量模式实验，再回头埋点

优点：

- 有机会尽快看到“改轻后是否明显变快”

缺点：

- 风险最高
- 在原因未确认前就改行为，容易引入新的偏差

### 结论

采用“方案 A + 方案 B”的组合最合适。先定位，再比对参数，最后如果需要，再进入轻量模式实验。

## 诊断架构

本次排查把一次 UI 发消息拆成四段：

1. 前端发起发送
2. 后端开始创建 Claude SDK 查询
3. 后端收到第一条 SDK 事件
4. 前端收到并渲染第一条正文 `stream_delta`

需要关注的关键问题不是“总耗时”，而是以下三个子耗时：

- `send_clicked -> sdk_query_started`
- `sdk_query_started -> first_sdk_event`
- `first_sdk_event -> first_stream_delta_rendered`

如果第二段耗时长，说明问题更偏向 SDK 初始化或首轮推理。

如果第三段耗时长，并且第一条事件只是 thinking，说明 Claude 在 UI 调用模式下先进行了更重的 thinking 阶段。

如果第四段耗时长，说明问题更偏向前端对流式正文的消费或渲染。

## 埋点设计

### 前端埋点

前端需要记录以下时间点：

- `send_clicked`
- `ws_message_first_received`
- `first_thinking_received`
- `first_stream_delta_received`
- `first_stream_delta_rendered`

前端埋点要求：

- 以 `sessionId` 为主键串联
- 临时会话和正式会话切换时，保留同一条链路的关联信息
- 如果第一条正文未出现，也要明确记录为 `missing`

### 后端埋点

后端需要记录以下时间点：

- `sdk_query_started`
- `sdk_query_instance_created`
- `first_sdk_event`
- `first_thinking_event`
- `first_stream_delta_sent`
- `complete_sent`
- `error_sent`

后端埋点要求：

- 记录 `sessionId`、`projectPath`、`model`、`permissionMode`
- 如果是新会话，能够把“sessionId 未确定前”的时间点与后续正式 `sessionId` 关联起来
- 日志内容要可读，不新增复杂存储结构

## 参数对比设计

除了时间埋点，还需要核对 CC UI 与 Claude Code CLI 的执行参数是否等价。

重点核对的参数与行为：

- `cwd`
- `model`
- `sessionId / resume` 行为
- `permissionMode`
- `toolsSettings.skipPermissions`
- `allowedTools / disallowedTools`
- SDK 注入的 `systemPrompt: { preset: 'claude_code' }`
- SDK 注入的 `settingSources: ['project', 'user', 'local']`

核对目标不是证明某个参数“配置错误”，而是确认：

- CC UI 是否比 CLI 多加载了上下文来源
- CC UI 是否总是在 resume 旧会话
- CC UI 是否总是以更重的 agent 运行模式发起请求

## 对照实验设计

在埋点完成后，使用统一实验条件做对照：

- 同一项目目录
- 同一 Anthropic 账号与配置
- 同一模型
- 同一句输入，例如 `hi`
- 至少重复 3 次

实验分两组：

### 实验 A：现状测量

保持现有 UI 逻辑不变，只记录时间数据。

目标是确认当前稳定表现是否为：

- `first_thinking_received` 很快
- `first_stream_delta_received` 很慢

### 实验 B：轻量因素验证

在不重构架构的前提下，逐步减少可能导致前置推理的因素，验证首包是否显著缩短。

优先验证的因素：

- 避免不必要的 resume
- 减少额外上下文来源
- 降低工具/权限相关附加设置的影响

本实验的目的是判断“UI 慢”是否来自调用模式差异，而不是直接定义最终修复方案。

## 判定标准

如果出现以下结果，可分别得出对应结论：

- `sdk_query_started -> first_sdk_event` 很长：SDK 初始化或调用模式本身偏重
- `first_sdk_event` 很快但长期只有 thinking：Claude 在 UI 模式下进入较长前置思考
- `first_stream_delta_sent` 很快但 `first_stream_delta_rendered` 很晚：前端消费或渲染有延迟
- 轻量实验后首包显著变快：UI 默认参数或上下文加载策略是主要原因

“显著变快”的首轮判断标准可以先采用经验阈值：

- UI 首个正文 token 从 `10-30` 秒下降到接近 CLI 的 `5` 秒以内
- 或者至少下降 `50%` 以上且稳定复现

## 风险

- 新会话在首条事件前没有正式 `sessionId`，需要额外处理关联关系
- UI 可能存在临时 session 替换机制，导致前后端时间线不易直接对齐
- 只看一两次样本可能受网络波动影响，需要至少 3 次重复
- 如果 CLI 本身也存在隐式配置差异，需要补充 CLI 侧启动参数核对

## 验证策略

设计落地后，验证应分三层：

1. 埋点是否完整
   - 每次对话都能看到关键时间点
   - 缺失点会被明确标记

2. 时间线是否可解释
   - 能按 `sessionId` 串起一次完整请求
   - 能清楚区分 thinking 与正文首 delta

3. 结论是否可复现
   - 同一句 `hi` 做至少 3 次对照
   - UI 与 CLI 的差异有稳定模式，而不是偶发抖动

## 预期产出

本次诊断设计完成后，后续实施阶段应产出：

- 一组用于排查首包延迟的前后端埋点
- 一份 UI 与 CLI 参数差异记录
- 一组最小对照实验结果
- 一份明确指向下一步修复方向的结论

## 后续实现边界

后续实现阶段只做以下事情：

- 加入最小必要埋点
- 记录参数差异
- 执行对照实验

在拿到证据前，不直接做以下改动：

- 不默认关闭现有 agent 能力
- 不擅自移除工具或权限逻辑
- 不重构聊天消息结构
- 不把“thinking 长”直接等同于前端性能问题
