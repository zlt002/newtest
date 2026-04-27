# Runtime Single Assistant Card Design

- 日期：2026-04-26
- 状态：待评审
- 范围：聊天主视图中的运行时会话组织、刷新恢复、一发一回渲染约束

## 背景

当前聊天运行时已经接入了 Agent SDK 新协议和新的实时投影链路，但前端主视图仍然同时混用多套中间模型：

- `chatMessages` / `visibleMessages`
- `conversationTurns`
- `runCards`
- `fallback` / transient assistant run card

这些模型都在尝试描述“同一轮对话”，只是视角不同：

- `conversationTurns` 想表达轮次
- `runCards` 想表达 assistant 运行过程
- `fallback` 想在历史未追上时补出可见 assistant 内容

问题不在于某一个模型错误，而在于它们仍然共同拥有主渲染权。结果就是：

1. 一次用户发送后的 assistant 展示可能被拆成多张不同风格的卡或气泡
2. 下一条用户输入可能被上一轮 assistant 卡片继续吸收
3. `session_status`、`starting {}`、工具过程、子代理过程在正文区和过程区之间摇摆
4. 运行时是一种结构，刷新后又被另一种结构重建
5. 同一轮会同时出现历史卡、实时卡和 fallback 卡的竞争

这个问题与 [2026-04-25-agent-sdk-big-bang-redesign-implementation-plan.md](/Users/zhanglt21/Desktop/accrnew/cc-ui/docs/superpowers/plans/2026-04-25-agent-sdk-big-bang-redesign-implementation-plan.md) 直接相关，尤其是其中 Task 5 “重写前端 store 与 projection，让新 transport 成为唯一事实源”。本设计是该大计划下的一条更聚焦的 UI/投影收口子工程。

## 目标

1. 聊天主视图严格呈现为“一次发送，一个回复卡”。
2. 每个用户气泡后面只允许跟一张 Claude 回复卡。
3. 回复卡内部同时承载：
   - 阶段性回复
   - 最终回复
   - 工具过程
   - 子代理过程
   - 会话状态过程
   - 审批 / 提问交互
4. 运行中默认展示最近 5 条过程，用户可通过弹框查看完整过程。
5. 下一条用户消息一旦开始，上一轮 assistant 卡立刻封口，不再吸收后续内容。
6. 刷新前后结构保持同构：运行时是一发一回，刷新后仍是一发一回。

## 非目标

1. 不重做整个聊天产品的视觉品牌和配色。
2. 不引入新的后端持久化 run 表。
3. 不重写 Agent SDK 后端协议。
4. 不把聊天页改造成完整 tracing viewer。
5. 不在本轮清退所有历史兼容代码；本轮只收紧主渲染路径和运行时恢复路径。

## 用户确认的产品行为

本设计基于以下已确认行为：

1. 聊天主区始终按“右侧用户气泡 + 左侧 Claude 回复卡”成对呈现。
2. Claude 回复卡是该轮 assistant 的唯一容器。
3. 运行中卡片默认展开过程预览。
4. 过程预览最多展示最近 5 条。
5. 用户可点击进入弹框查看完整过程。
6. 如果 assistant 产生阶段性回复，这些回复应累加到同一张卡片正文中，而不是拆成新的顶层消息。

## 方案对比

### 方案 A：轮次卡片模型

上游数据可以继续来自多条链路，但在进入渲染层前统一压成 `ConversationRound[]`：

- `userMessage`
- `assistantCard`

优点：

- 最贴合“一发一回”
- 可以从结构上阻止串位、重复和吞下一轮输入
- 运行时与刷新恢复都可以围绕同一个 round 模型组织

缺点：

- 需要继续收紧当前 `conversationTurns + runCards + fallback` 的混合路径
- 需要重写一部分 fallback 合并逻辑

结论：采用。

### 方案 B：保留多模型，在渲染末端临时合并

优点：

- 改动表面更小

缺点：

- 上游仍然存在多个事实源
- 后续很容易再次出现“数据正确、展示错误”的回归

结论：不采用。

### 方案 C：message-first，过程作为附属抽屉

优点：

- 视觉更像传统聊天

缺点：

- 与当前已有 run card 能力不匹配
- 会让子代理和工具过程再次分裂为附属分支

结论：不采用。

## 目标结构

### ConversationRound

主视图最终只消费统一轮次模型：

```ts
type ConversationRound = {
  id: string;
  sessionId: string;
  userMessage: UserTurnViewModel;
  assistantCard: AssistantCardViewModel;
};
```

### UserTurnViewModel

```ts
type UserTurnViewModel = {
  id: string;
  sessionId: string;
  content: string;
  timestamp: string;
};
```

### AssistantCardViewModel

```ts
type AssistantCardViewModel = {
  id: string;
  sessionId: string;
  runId: string | null;
  anchorMessageId: string;
  status: 'queued' | 'starting' | 'running' | 'waiting_for_input' | 'completed' | 'failed' | 'aborted';
  headline: string;
  responseSegments: AssistantResponseSegment[];
  processItems: RuntimeActivityItem[];
  previewItems: RuntimeActivityItem[];
  activeInteraction: RunCardInteraction | null;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  source: 'official-history' | 'sdk-live' | 'mixed' | 'fallback';
};
```

### AssistantResponseSegment

```ts
type AssistantResponseSegment = {
  id: string;
  kind: 'phase' | 'final';
  body: string;
  timestamp: string | null;
};
```

其中：

- `responseSegments` 用于累加阶段性回复和最终回复
- `processItems` 保存完整过程
- `previewItems` 固定取最近 5 条
- `activeInteraction` 用于挂工具审批或提问交互

## 运行时更新规则

### 1. 用户发送即创建新 round

当用户发送消息时，立即创建一个新 `ConversationRound`：

- `userMessage` 立即可见
- 同时创建一个空的 `assistantCard`
- 初始状态为 `queued` 或 `starting`

这样即使 assistant 还没出正文，页面上也已经存在该轮的 Claude 容器，避免“已完成但回复区空白”。

### 2. realtime 事件只更新当前活跃 round

以下事件只允许追加到当前活跃 round 的 `assistantCard`：

- `session_status`
- `thinking`
- `tool_use`
- `tool_result`
- `interactive_prompt`
- `permission_request`
- 子代理 task / progress / notification / tool progress
- `assistant.message.delta`

UI 层不再直接渲染零散 realtime 事件，而是只读已归并后的 `assistantCard`。

### 3. 阶段性回复累加到同一卡正文

assistant 在一次 run 内的阶段性回复不再拆成多个顶层 assistant 块，而是进入同一个 `responseSegments` 列表：

- 启动回应
- 阶段回应
- 最终回应

这些段落在同一张卡片正文区按时间累加显示。

### 4. 主卡仅显示最近 5 条过程

运行中默认展开过程预览，但只展示最近 5 条：

- 降低主列表噪音
- 仍然保留“系统正在工作”的可感知性

完整 `processItems` 保存在模型中，由“查看更多过程”弹框展示。

### 5. 下一轮消息出现时，上一轮立即封口

当检测到新的用户消息时：

- 当前活跃 round 关闭
- 旧 round 的 `assistantCard` 不再接受新内容
- 新事件只能进入新 round

这是防止上一轮吸收下一轮用户输入和过程的硬边界。

## 刷新恢复规则

刷新后不能重新猜测 UI，而必须按与运行时相同的 round 规则重建。

### 1. 先恢复用户轮次边界

历史恢复时先以用户消息作为稳定锚点，切出一组 `ConversationRound`。

### 2. 再将 assistant 内容挂回 round

历史中的 assistant 正文、过程、交互、状态分别回填到对应 `assistantCard`：

- 正文进入 `responseSegments`
- 工具 / 子代理 / 状态进入 `processItems`
- 交互进入 `activeInteraction` 或历史交互记录

### 3. 恢复优先级固定

恢复优先级明确为：

1. `official history`
2. `sdk-live`
3. `fallback`

`fallback` 只能补进当前 round 的 assistantCard，不能额外长出新的展示层。

### 4. 历史追上后并回同一 round

一旦 official history 已包含该轮 assistant 内容：

- stale realtime 残影必须并回同一个 round
- 不允许保留第二张卡
- 不允许刷新前是一张卡、刷新后变三段消息

## 异常与边界处理

### 1. assistant 暂无正文

即使还没有任何可读正文，assistantCard 也必须存在，并展示：

- 当前状态
- 过程预览
- 子代理过程

不能因为正文为空就让整张卡消失。

### 2. 只有阶段性回复，没有最终回复

正文区显示已有 `responseSegments`，仍然只使用这一张 assistantCard。

### 3. 工具或子代理过程很多

主卡只保留最近 5 条过程预览；完整时间线进入弹框，不把主聊天流刷成日志流。

### 4. waiting for input

审批和问答中断继续挂在当前 round 的 `assistantCard` 中，状态切为 `waiting_for_input`，不再平行漂出第二块主展示面。

### 5. failed / aborted

即使执行失败或中止，也保留这一轮的用户气泡和 assistantCard：

- 卡片状态改为 `failed` 或 `aborted`
- 已产生的阶段性回复和过程完整保留

## 影响范围

### 主要代码范围

- [src/components/chat/view/ChatInterface.tsx](/Users/zhanglt21/Desktop/accrnew/cc-ui/src/components/chat/view/ChatInterface.tsx)
- [src/components/chat/projection/projectConversationTurns.ts](/Users/zhanglt21/Desktop/accrnew/cc-ui/src/components/chat/projection/projectConversationTurns.ts)
- [src/components/chat/projection/projectRunCards.ts](/Users/zhanglt21/Desktop/accrnew/cc-ui/src/components/chat/projection/projectRunCards.ts)
- [src/components/chat/view/subcomponents/ChatMessagesPane.tsx](/Users/zhanglt21/Desktop/accrnew/cc-ui/src/components/chat/view/subcomponents/ChatMessagesPane.tsx)
- [src/components/chat/components/RunCard.tsx](/Users/zhanglt21/Desktop/accrnew/cc-ui/src/components/chat/components/RunCard.tsx)

### 建议新增或重构的中间层

建议新增统一 round 投影层，或让 `projectConversationTurns(...)` 升级为 round 投影入口，但无论采用哪种落点，都必须满足：

- `ChatMessagesPane` 不再同时理解 `conversationTurns`、`runCards`、`fallback`
- 渲染层只消费单一 round 模型

## 测试策略

必须覆盖以下回归：

1. 一条 user 只对应一张 assistantCard。
2. 阶段性回复会累加到同一卡正文。
3. 子代理过程进入同一卡过程区。
4. 下一条 user 不会被上一轮 assistantCard 吞掉。
5. 运行时 assistant 暂无正文时，卡片也不会消失。
6. 历史追上后不会额外多出第二张卡。
7. 刷新前后仍保持一发一回。
8. waiting-for-input 不会再平行长出第二个主展示面。

## 与大计划的关系

本设计是 [2026-04-25-agent-sdk-big-bang-redesign-implementation-plan.md](/Users/zhanglt21/Desktop/accrnew/cc-ui/docs/superpowers/plans/2026-04-25-agent-sdk-big-bang-redesign-implementation-plan.md) 的一个聚焦子设计，主要落在：

- Task 5：前端 store 与 projection 收敛
- Task 8：删除旧兼容死分支

这份设计不替代大计划，而是把“运行时一发一回、单卡承载全过程”从大计划里抽出来，作为实现时的明确 UI/投影边界。

## 设计结论

最终结论是：

1. 采用轮次卡片模型。
2. 聊天主视图只渲染 `ConversationRound[]`。
3. 每个用户消息后面只允许一张 Claude 回复卡。
4. 过程、子代理、交互、阶段性回复全部归入同一卡。
5. 运行时和刷新恢复都必须围绕同一个 round 规则重建，不再让 `conversationTurns + runCards + fallback` 共同拥有最终渲染权。
