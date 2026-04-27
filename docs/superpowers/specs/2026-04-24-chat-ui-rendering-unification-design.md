# Chat UI Rendering Unification Design

## 背景

当前聊天 UI 的主要问题不是某一个卡片组件失效，而是同一份会话内容被多条主路径共同解释和渲染：

- `projectHistoricalChatMessages(...)` 产出历史普通消息。
- `useChatSessionState(...)` 维护运行时 legacy `chatMessages`。
- `projectHistoricalRunCards(...)` 产出历史 RunCard。
- `projectLiveRunCards(...)` 产出实时 RunCard。
- `ChatMessagesPane` 内部还会裁剪 legacy assistant 消息，并合成 transient assistant RunCard。
- pending 权限或交互请求还会额外合成 fallback RunCard。

这些路径各自都有局部去重和 fallback，但没有统一的渲染所有权规则。结果是：

- 第一轮 assistant 内容可能被第二轮 live card 替换。
- 运行时和历史恢复使用不同 UI。
- `Skill`、`WebFetch`、工具错误等在某些路径走新卡片，在另一些路径回到 `Parameters / Details` 或旧红框。
- 扩展后的 skill prompt、协议文本、状态文本可能进入普通消息或 composer 灰条。
- 修一个入口后，另一个入口仍可能复现老样式。

本设计选择以 V2 `AssistantTurn` / `RunCard` 为唯一主渲染模型，停止继续给旧混合结构打补丁。

## 目标

1. 聊天主视图顶层只允许出现用户消息和 assistant turn。
2. 一次用户发送只对应一个 assistant turn，不因历史刷新、实时事件或第二轮发送互相替换。
3. 历史态和运行态共用同一套投影 view model 和同一套渲染组件。
4. 工具、skill、权限、错误、thinking、debug 事件只作为 assistant turn 内部过程展示，不再成为顶层旧工具卡片。
5. 协议文本和 expanded skill prompt 不进入用户气泡、assistant 正文或 composer 状态条。
6. composer 状态条只显示短状态，不显示完整 assistant 正文。

## 非目标

- 不在本轮重做整体视觉品牌。
- 不改 Claude Agent SDK 或后端执行协议。
- 不删除调试能力；只是把调试内容退出默认主聊天流。
- 不要求一次性迁移所有历史存储结构。
- 不把聊天页改造成完整 tracing viewer。

## 核心原则

### 1. 顶层渲染所有权唯一

`ChatMessagesPane` 不再同时消费 legacy messages、historical run cards、live run cards、transient fallback 并自行拼装。

它只消费一个统一列表：

```ts
type ConversationTurn =
  | UserTurnViewModel
  | AssistantTurnViewModel;
```

顶层渲染规则固定为：

- `UserTurnViewModel` 渲染用户气泡。
- `AssistantTurnViewModel` 渲染 assistant 容器。
- 不允许任何 tool、thinking、debug、permission、error 事件绕过 turn model 直接插入主列表。

### 2. 一次发送等于一个 assistant turn

每个 assistant turn 必须有稳定身份：

```ts
type AssistantTurnIdentity = {
  sessionId: string;
  runId: string | null;
  anchorMessageId: string;
};
```

优先级：

1. 有 `runId` 时用 `sessionId + runId`。
2. 没有 `runId` 时用 `sessionId + anchorMessageId`。
3. pending fallback 没有用户锚点时用 `sessionId + requestId`，并标记为 standalone pending turn。

这条规则用于防止第二轮回复替换第一轮内容。合并 turn 时只能更新同一身份的 turn，不能因为 anchor 空、时间接近或状态相同覆盖其他 turn。

### 3. 历史和实时走同一投影

新增统一投影入口：

```ts
type ProjectConversationTurnsInput = {
  sessionId: string | null;
  historicalMessages: CanonicalSessionMessage[];
  transientMessages: ChatMessage[];
  realtimeEvents: AgentRealtimeEvent[];
  pendingPermissionRequests: PendingPermissionRequest[];
  isLoading: boolean;
};

function projectConversationTurns(input: ProjectConversationTurnsInput): ConversationTurn[];
```

这个投影负责：

- 从 canonical history 还原历史 user turn 和 assistant turn。
- 从 realtime events 更新当前运行中的 assistant turn。
- 把 pending 权限和交互请求合并进对应 assistant turn。
- 在历史 caught up 后自然移除 stale realtime turn。
- 过滤 expanded skill prompt、协议噪声和空文本。

`projectHistoricalChatMessages(...)`、`projectHistoricalRunCards(...)`、`projectLiveRunCards(...)` 可以在过渡期作为内部 helper 存在，但不能再分别向 `ChatMessagesPane` 输出主渲染数据。

## View Model

### UserTurnViewModel

```ts
type UserTurnViewModel = {
  kind: 'user';
  id: string;
  sessionId: string;
  content: string;
  timestamp: string;
};
```

用户消息只来自真实用户输入。expanded skill prompt、协议注入、补全后的 skill 正文都不能生成用户 turn。

### AssistantTurnViewModel

```ts
type AssistantTurnViewModel = {
  kind: 'assistant';
  id: string;
  sessionId: string;
  runId: string | null;
  anchorMessageId: string;
  status: 'queued' | 'running' | 'waiting_for_input' | 'completed' | 'failed' | 'aborted';
  headline: string;
  activityItems: RuntimeActivityItem[];
  bodySegments: AssistantBodySegment[];
  activeInteraction: RunCardInteraction | null;
  startedAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  source: 'official-history' | 'sdk-live' | 'mixed' | 'fallback';
};
```

`bodySegments` 承载 assistant 真正对用户说的话：

```ts
type AssistantBodySegment = {
  id: string;
  kind: 'phase' | 'final';
  body: string;
  timestamp: string | null;
};
```

`activityItems` 承载运行过程：

```ts
type RuntimeActivityItem = {
  id: string;
  kind:
    | 'thinking'
    | 'tool_use'
    | 'tool_result'
    | 'permission_request'
    | 'interactive_prompt'
    | 'session_status'
    | 'compact_boundary'
    | 'debug_ref'
    | 'notice';
  title: string;
  body: string;
  timestamp: string | null;
  tone?: 'neutral' | 'warning' | 'danger' | 'success';
};
```

未知协议事件允许进入 `activityItems`，但只能以 `notice` 或受控 fallback 展示，不能伪装成普通 markdown 回复。

## 渲染结构

### ChatMessagesPane

`ChatMessagesPane` 的职责缩小为：

- 接收 `ConversationTurn[]`。
- 按顺序渲染 user turn 和 assistant turn。
- 处理滚动、空状态、加载状态。
- 把权限交互 handler 传给 assistant turn。

它不再负责：

- 裁剪 legacy assistant 消息。
- 判断 assistant 是否被 RunCard 重复。
- 合成 transient assistant RunCard。
- 按时间把 standalone RunCard 插入 message 列表。

这些逻辑全部进入 `projectConversationTurns(...)`。

### AssistantTurnCard

建议从当前 `RunCard` 演进出 `AssistantTurnCard`，或在保持组件名的情况下让 `RunCard` 消费新的 turn model。

默认结构：

1. 状态头：Claude、短 headline、状态 badge。
2. 过程预览：最近 5 条 activity，低视觉权重，可打开完整过程。
3. 交互区：权限请求或 `AskUserQuestion`。
4. 正文区：phase/final segments，使用统一 markdown 渲染。

工具、skill、WebFetch、Bash、debug_ref、session_status 都只出现在过程预览或完整过程里。

### MessageComponent

`MessageComponent` 不再承担 assistant/tool 主渲染。

保留范围：

- 用户消息气泡，或迁移为更小的 `UserTurnBubble`。
- 受控 legacy fallback，用于无法映射的极旧历史文本。

禁止范围：

- assistant 正文主路径。
- tool input/result 主路径。
- tool error 红框主路径。
- thinking/task notification 主路径。

### ToolRenderer

`ToolRenderer` 保留为内部详情或调试能力，不再是主聊天流默认渲染路径。

规则：

- 新聊天主视图不直接调用 `ToolRenderer` 渲染顶层工具。
- 如果完整过程弹窗需要更丰富的工具详情，可以由 `RuntimeActivityItem` 显式选择是否调用。
- 错误也必须走同一活动项模型，不能回到旧红框。

### ComposerContextBar

`resolveAgentComposerState(...)` 不能使用完整 `execution.assistantText` 作为 label。

状态条 label 只能来自短状态：

- `处理中`
- `等待你的回答`
- `等待授权`
- `正在汇总`
- `正在接收回复`

如果需要显示 assistant 正文，只能进入当前 assistant turn 的正文区。

## 数据流

目标数据流：

```text
canonical history ┐
transient messages ├─ projectConversationTurns ── ConversationTurn[] ── ChatMessagesPane
realtime events   ┤
pending requests  ┘
```

过渡期允许内部复用现有投影函数，但主 UI 出口必须只有 `ConversationTurn[]`。

## 合并规则

### 历史 turn 与实时 turn

当历史刷新追上实时内容时：

- 如果 identity 相同，合并为一个 `source: 'mixed'` turn。
- `bodySegments` 按 id 去重，优先保留历史中的稳定 id。
- `activityItems` 按 id 去重，历史缺少的实时过程可保留，直到确认已持久化或清理。
- 终态以历史 terminal status 为准。

### 多轮发送

当新用户消息出现：

- 必须创建新的 user turn。
- 后续实时事件必须锚到最新匹配的 user turn。
- 已完成的旧 assistant turn 不得因最新 live events 被替换。
- 没有可靠 anchor 时宁可生成 standalone fallback turn，也不能覆盖上一轮。

### pending 请求

pending 请求优先匹配：

1. requestId 已存在的 assistant turn。
2. 相同 session 中当前 running/waiting assistant turn。
3. standalone pending turn。

请求 resolved 后移除 active interaction，但保留一条低权重 activity。

## 协议噪声过滤

统一过滤函数应覆盖所有入口：

- historical user text
- transient user text
- historical assistant text
- realtime assistant text
- activity body
- composer label

必须过滤：

- expanded skill prompt，如 `Base directory for this skill:`
- `<tool-use-id>`、`<task-notification>` 等协议片段
- 纯协议控制内容
- 空白或仅元数据文本

过滤函数可以保留当前 `protocolNoise.ts` 逻辑，但要确保不再散落在多个投影入口里各写一份。

## 错误处理

错误分三类：

1. 致命错误：assistant turn `status = failed`，正文区可显示失败说明。
2. 可恢复错误：进入 activity warning，例如 WebFetch 安全校验失败后回退。
3. 协议或未知错误：进入 activity notice/danger，不作为顶层 error message。

只有真正无法归属到任何 turn 的 session-level error 才允许顶层 fallback error，并且样式必须与新 UI 兼容。

## 迁移计划

### 阶段 1：建立统一投影和测试

- 新增 `ConversationTurn` 类型。
- 新增 `projectConversationTurns(...)`。
- 覆盖历史、实时、混合、pending、expanded skill prompt、多轮发送测试。
- 保持现有 UI 不变，只验证投影结果。

### 阶段 2：切换 ChatMessagesPane 主入口

- `ChatInterface` 改为只向 `ChatMessagesPane` 传 `conversationTurns`。
- 移除主路径上的 `mergeHistoricalChatMessages(...)`、`mergeRunCards(...)` 输出依赖。
- 删除或停用 `trimLegacyAssistantMessages(...)` 和 `buildTransientAssistantRunCard(...)`。
- 保留最小 legacy fallback。

### 阶段 3：收口组件边界

- 引入或改造 `AssistantTurnCard`。
- 让工具、错误、权限、debug 全部进入 activity 区。
- `MessageComponent` 退出 assistant/tool 主路径。
- `ComposerContextBar` 改为短状态 label。

### 阶段 4：清理旧路径和回归

- 删除不再使用的旧 assistant/tool 渲染分支。
- 更新工具 README，说明 `ToolRenderer` 不再是主聊天流入口。
- 增加 source-level guard，防止 `ChatMessagesPane` 重新接收 runCards/messages 混合输入。

## 测试策略

### 投影单元测试

覆盖：

- 单轮 user + assistant final。
- 单轮中包含 thinking、tool_use、tool_result、session_status。
- 同一轮多个 assistant phase + final。
- 第二轮发送不会替换第一轮 assistant turn。
- realtime event timestamp 轻微偏移仍锚到正确 user turn。
- expanded skill prompt 不生成 user turn。
- WebFetch/Skill 错误不产生旧 `Parameters / Details` 顶层卡。
- pending permission 合并到 running turn。
- 历史刷新追上实时后不重复、不替换旧轮次。

### 组件测试

覆盖：

- `ChatMessagesPane` 只渲染 `ConversationTurn[]`。
- assistant turn 内部显示过程预览和正文。
- tool/error 不再触发 `MessageComponent` 的旧工具分支。
- composer label 不包含长正文。

### 回归场景

手动或集成验证：

1. 第一轮长回复完成后，第二轮发送 `111`，第一轮内容保持不变。
2. 运行时看到的 assistant turn，刷新或重新打开历史后结构一致。
3. skill 命令不会显示 expanded prompt。
4. WebFetch 或 Skill 报错不会回到旧 `Parameters / Details` 样式。
5. 权限等待显示在当前 assistant turn 内，而不是孤立灰条或旧卡片。

## 验收标准

- 主聊天区顶层只出现用户气泡和 assistant turn。
- 任意一轮 run 的过程和正文都在同一个 assistant turn 内。
- 第二轮回复不会替换第一轮内容。
- 历史和运行时没有明显两套 UI。
- 默认主视图不再出现旧 `Parameters / Details`、旧工具红框、顶层 thinking/tool 卡片。
- composer 状态条不会显示完整回答正文。
- 新增测试覆盖上述关键回归。

## 风险与取舍

### 风险：改动面比止血补丁大

取舍：这是为了消除多路径抢渲染的根因。可以分阶段切换，先建投影测试，再接 UI。

### 风险：极旧历史可能无法完整映射

取舍：允许极旧历史进入受控 legacy fallback，但 fallback 必须使用新 UI 外观，不能复活旧工具卡片。

### 风险：短期内 helper 仍复用旧投影

取舍：允许内部复用，但主 UI 出口必须唯一。后续再逐步删除旧 helper。

## 最终结论

本次治理不再继续修补 `legacy message + run card + transient fallback` 的混合结构，而是把聊天主视图统一成：

```text
UserTurn
AssistantTurn
UserTurn
AssistantTurn
```

所有运行时、历史、工具、错误、权限、skill、debug 信息都先进入 `projectConversationTurns(...)`，再由同一套 assistant turn 组件渲染。这样才能从结构上避免老样式、新样式、运行时、历史态互相打架。
