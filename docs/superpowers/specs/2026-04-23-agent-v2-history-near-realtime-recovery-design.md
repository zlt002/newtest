# Agent V2 History Near-Realtime Recovery Design

## 背景

当前页面在“执行中”和“刷新后历史回看”之间仍存在明显断层：

- 执行中使用 SDK realtime 事件流，能看到较原始的 `thinking / tool_use / tool_result / interaction / session_status` 过程。
- 刷新后改走 `/api/agent-v2/sessions/:id/history`，只消费 official history 的 canonical 消息。
- 这导致刷新后虽然还能看到最终 `Run Card`，但过程层经常明显缩水，无法接近执行中用户刚刚看到的内容。
- 另外，历史消息链里 `tool_result` 的 `role=user` 语义容易误入旧消息投影，产生右侧蓝色用户气泡这类错误。

用户的目标不是让历史和 realtime 完全换一套 UI，而是：

1. 历史恢复尽可能接近 realtime
2. 同一轮依然是一张 `Run Card`
3. 工具过程尽量保留
4. 刷新后不要凭空冒出新的用户气泡

## 目标

这次设计的目标是：

1. 让历史恢复链路输出与 realtime 尽量一致的 `Run Card` 过程层。
2. 把历史事实源扩展为：
   - official session
   - agent jsonl
   - debug log
3. 历史恢复优先保留：
   - `thinking`
   - `tool_use`
   - `tool_result`
   - `interactive_prompt / permission_request`
   - `session_status`
   - `compact_boundary`
   - `debug_ref`
4. 保持前端仍然是 `official-message-first` / `run-card-first`，不回退到旧双轨展示。
5. 用“结构等价”而不是“原始 event 逐帧等价”作为恢复标准。

## 非目标

本次不做以下事情：

1. 不要求历史 100% 逐事件回放 realtime 的所有瞬时态。
2. 不把原始 debug log 全量直出给前端。
3. 不新增第二套历史 UI。
4. 不恢复旧的 `assistantTurns / realtimeBlocks / conversationStream` 展示链。
5. 不把所有底层调试字段都放进默认展开区域。

## 核心结论

### 1. 历史恢复不是直接回放 realtime store

刷新后的历史恢复不能依赖内存 realtime store，而应走稳定的落盘事实源：

- official session jsonl 负责主会话骨架
- `agent-<id>.jsonl` 负责子代理内部过程
- debug log 负责补充历史接口未直接覆盖的诊断级过程锚点

### 2. 历史恢复的产物仍是 canonical messages，而不是原始 debug events

前端已经围绕 `projectHistoricalRunCards(...)` 建立了统一展示层。为了最小化前端改动，服务端应继续返回 canonical history messages，但需要把这些消息补齐到足够接近 realtime 的粒度。

也就是说：

- 历史接口升级的是“输入内容完整度”
- 前端复用的是“现有 Run Card 投影器”

### 3. 恢复标准是“结构接近 realtime”

历史恢复成功的判定标准不是逐条 event 完全一致，而是：

1. 同一 user turn 仍只对应一张 `Run Card`
2. `Run Card.finalResponse` 与完成态结果一致
3. `Run Card.processItems` 在种类和顺序上尽量接近 realtime
4. 子代理内部 `thinking / tool_use / tool_result` 尽量不丢
5. 允许丢少量纯瞬时、无稳定语义的 live-only 中间态

## 事实源分工

### official session

职责：

1. 提供 session 主体消息顺序
2. 提供 user / assistant 主消息
3. 提供可 canonical 的 `thinking / tool_use / tool_result`
4. 提供分页边界与历史基础元数据

局限：

1. 不保证能保留所有子代理内部明细
2. 不保证能保留所有 debug 级事件

### agent jsonl

职责：

1. 提供 `Task` 子代理展开后的内部消息
2. 补全子代理内部：
   - `assistant text`
   - `thinking`
   - `function_call/custom_tool_call`
   - `function_call_output/custom_tool_call_output`
3. 让刷新后过程层尽量接近执行中的子代理时间线

局限：

1. 不是所有 live 状态都会原样保留
2. 原始结构需要 canonical 化后才能安全喂给前端

### debug log

职责：

1. 提供 debug log availability 与 session 级对账依据
2. 在 official session + agent jsonl 仍不足时，补充：
   - `session_status`
   - `debug_ref`
   - 必要的 compact / terminal 诊断锚点
3. 为“接口返回内容与真实 jsonl 文件逐项对账”提供数据基础

局限：

1. debug log 不应直接裸露为前端主历史协议
2. 必须经过服务端降噪和归一化

## 历史恢复架构

### 方案 A（推荐）：服务端合成增强版 canonical history

流程：

1. 读取 official session jsonl
2. 识别并读取关联 agent jsonl
3. 读取 debug log 中该 session 的可用补充事件
4. 在服务端合并并排序
5. 产出增强版 canonical history messages
6. 前端继续使用：
   - `projectHistoricalRunCards(...)`
   - `projectHistoricalChatMessages(...)`

优点：

1. 前端改动最小
2. 历史与 realtime 的边界更清晰
3. 适合做稳定分页与缓存
4. 最符合“official history 为主准绳”的方向

代价：

1. 服务端历史读取器会变复杂
2. 需要定义 debug log 到 canonical message 的映射规则

### 方案 B：服务端返回 history + raw debug timeline 双通道

前端同时消费 canonical messages 和 raw debug timeline，自行合并为 Run Card。

优点：

1. 理论上更接近 realtime

缺点：

1. 前端复杂度显著升高
2. 会重新引入“多事实源前端混合”的风险
3. 更容易失去 `official-message-first` 的收敛效果

### 方案选择

采用方案 A。

理由：

1. 用户要的是“刷新后尽可能像 realtime”，不是前端重新发明第二套时序协议。
2. 当前系统已经把展示层统一到 `Run Card`，服务端补齐 canonical history 是最顺的延伸。
3. 方案 A 更适合分页、缓存、对账和测试。

## Canonical 增强规则

服务端最终输出的 history messages 至少应覆盖以下 kinds：

1. `text`
2. `thinking`
3. `tool_use`
4. `tool_result`
5. `interactive_prompt`
6. `permission_request`
7. `session_status`
8. `compact_boundary`
9. `debug_ref`
10. `error`

### 排序规则

统一按：

1. `timestamp`
2. `stable id`

排序，保持与现有 `compareCanonicalMessages(...)` 一致。

### 去重规则

需要避免以下重复：

1. official session 与 agent jsonl 同一语义消息重复出现
2. tool_result 同时出现在主 session 和 agent file
3. debug log 事件与已 canonical 出的 session_status/debug_ref 重复

推荐去重 key：

- `kind`
- `toolId`
- `timestamp`
- 标准化文本签名

### role 规则

关键约束：

1. `tool_result` 即使底层来自 `role=user` 的 content block，也不允许再被前端旧消息链投成用户气泡。
2. user 气泡只允许来自真正的 user `text/message`。

## 前端数据流

前端保持当前主链：

1. `fetchSessionHistory(...)`
2. `useHistoricalAgentConversation(...)`
3. `projectHistoricalRunCards(...)`
4. `projectHistoricalChatMessages(...)`
5. `mergeHistoricalChatMessages(...)`
6. `ChatMessagesPane`

前端只做两类增量工作：

### 1. 修正 legacy message 投影边界

确保：

1. `tool_result` 不再被误投成 user bubble
2. 只有真正 user `text/message` 进入右侧用户消息流

### 2. 扩展历史 Run Card 过程项支持

如服务端新增了更完整的 canonical kinds，前端投影器需要继续接收并渲染：

1. `session_status`
2. `debug_ref`
3. 可能新增的稳定历史过程 kind

## 分页与缓存策略

历史接口已经支持分页。增强后保持：

1. 默认分页读取最近窗口
2. `full=1` 用于强对账或调试
3. 缓存 key 继续按 `sessionId + offset + limit + full`

约束：

1. 不允许因为补充 agent jsonl/debug log 就打破现有分页语义
2. 同一页内返回的 `messages` 必须是完整排序后的 canonical 片段
3. `diagnosticsSummary` 应补充对账辅助信息

## 对账能力

为了满足“接口返回内容与真实 jsonl 文件逐项对账”的要求，历史接口应新增或强化 diagnostics 字段，例如：

1. `officialMessageCount`
2. `agentMessageCount`
3. `debugAugmentedCount`
4. `historySourceCoverage`
5. `debugLogAvailable`

此外建议增加一个仅调试使用的对账接口或调试开关，输出：

1. 当前 history 返回的 canonical ids
2. session jsonl 原始条数
3. agent jsonl 原始条数
4. 被忽略/去重条数与原因

这不是主 UI 协议的一部分，但能显著降低排查成本。

## 失败与降级策略

### 情况 1：agent jsonl 缺失

行为：

1. 仍返回 official history
2. diagnostics 标记 `agentCoverage = partial`
3. 前端继续渲染历史 Run Card，但过程可能较少

### 情况 2：debug log 不可用

行为：

1. 不影响主 history 读取
2. diagnostics 标记 `debugLogAvailable = false`
3. 不因 debug log 缺失而回退到旧消息链

### 情况 3：增强 history 与 realtime 不一致

行为：

1. 以 official history + canonical 结果为准
2. 对账信息进入 diagnostics
3. 不把不可信的 raw debug event 直接展示给用户

## 测试策略

### 服务端测试

新增或补强：

1. official session + agent jsonl 合并排序测试
2. 子代理 `thinking/tool_use/tool_result` 恢复测试
3. debug log 补充 `session_status/debug_ref` 测试
4. 去重测试
5. 分页后仍保持顺序与完整性的测试
6. diagnostics 对账字段测试

### 前端测试

新增或补强：

1. 历史恢复后 `Run Card.processItems` 接近 realtime 的投影测试
2. `tool_result(role=user)` 不再进入用户气泡测试
3. 刷新后同一轮仍只渲染一张 `Run Card`
4. history 有更多过程项时默认仍折叠测试

## 成功标准

本次改造完成后，应满足：

1. 刷新后不再凭空出现 assistant 内容的右侧蓝色用户气泡
2. 同一 session 的历史回看结构与执行中保持同一套 `Run Card`
3. 刷新后能恢复大部分 `thinking / tool_use / tool_result / 子代理过程`
4. 用户主观感受上，历史回看与刚才 realtime 展示“明显接近”
5. 对账层能回答“history 为什么缺了某个过程”

## 推荐实施顺序

1. 先修历史消息投影中的 user/tool_result 边界
2. 再扩展服务端 history reader：official session + agent jsonl 合并
3. 再补 debug log 到 canonical history 的最小增强
4. 最后补 diagnostics 对账字段与测试
