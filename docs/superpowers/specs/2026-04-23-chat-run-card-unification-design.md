# Chat Run Card 统一设计

- 日期：2026-04-23
- 状态：待评审
- 范围：统一聊天界面中“进行中的执行”“刚完成的执行”“历史会话回放”三种 Claude 轮次展示

## 背景

当前聊天 UI 会把同一轮 assistant 执行拆成多条并行展示通路：

1. `AssistantRuntimeTurn` 展示一张偏摘要风格的 assistant 卡片。
2. `realtimeBlocks` 展示原始 SDK live 事件，例如 `thinking`、`tool_use`、`tool_result`、`interactive_prompt`。
3. `InteractiveRequestsBanner` 和 `PermissionRequestsBanner` 在 composer 区域额外渲染交互请求面板。
4. 历史回放又会把 official messages 投影成另一套结构。

这会导致同一轮 assistant 在不同时间点呈现出完全不同的风格：

- 进行中时，过程细节很多，像日志流。
- 刚完成时，突然收缩成摘要卡，过程语义明显减少。
- 历史回看时，又更接近摘要卡路径，过程默认消失。
- 像 `AskUserQuestion` 这类交互，还可能在摘要卡、原始 realtime feed、可操作表单里重复出现。

结果就是：同一个 session 看起来像三套产品拼在一起。

## 目标

1. 让“当前执行中”“刚完成”“历史回看”三种状态共享同一套视觉结构。
2. 保留过程可见性，但不强迫历史回看默认展开全过程。
3. 让 official history 继续作为完成态和历史态的语义主准绳。
4. 让 SDK live session / stream 继续作为 realtime 的唯一真相源。
5. 不引入新的后端协议、持久化层、或新的主身份体系。
6. 消除同一轮交互和工具过程在页面上的重复渲染。

## 非目标

1. 不新增持久化 run 模型或 run 表。
2. 不复活 `historyMode`、`legacy-fallback`、`conversationId`、`eventsByRun`。
3. 不整体重做聊天产品的视觉语言。
4. 不删除过程信息，只统一它的组织方式和默认可见性。

## 产品决策

采用统一的 `Run Card` 展示模型作为 assistant 轮次的唯一主容器。

每个 user turn 后面只跟一张 assistant `Run Card`，它可以表达：

- 正在执行中的一轮
- 正在等待用户回答的一轮
- 当前 session 中已完成的一轮
- 历史回看中的一轮

这张卡片始终使用同一骨架：

1. 头部
2. 主体回答区
3. 可选的内嵌交互区
4. 可折叠的过程时间线

也就是说，变化的是状态，不是结构。

## 方案对比

### 方案 A：单轨 `Run Card` 视图模型

先从 official history 或 SDK live 数据派生一个前端展示层 view model，再统一渲染成一张 `Run Card`。

优点：

- 结构最统一
- 最容易和历史回看风格对齐
- 最容易彻底消灭重复展示
- 只要保持为展示层派生模型，就不会破坏 official-first 架构

缺点：

- 需要把当前几条渲染链收拢
- 需要处理 user turn 和 assistant run 的锚点关系

结论：采用这个方案。

### 方案 B：保留现有多条展示链，只统一视觉皮肤

优点：

- 改动更小
- 重构压力更低

缺点：

- 结构重复依旧存在
- `AskUserQuestion` 这类交互仍会重复展示
- 当前执行态与历史态的结构差异依旧存在

结论：不采用。

### 方案 C：所有状态都走“过程优先时间线”

优点：

- agent 过程透明度最高
- 全部过程节点都天然可见

缺点：

- 历史回看会很重，不适合阅读最终回答
- 和“历史默认折叠过程”的目标冲突

结论：不采用。

## 核心设计

### 1. 展示模型边界

`Run Card` 必须是**纯展示层派生模型**，不能变成新的事实源。

硬约束：

1. 不新增后端协议。
2. 不新增持久化 run store。
3. 不新增除 `sessionId` 之外的一等身份。
4. 不引入 `conversationId`。
5. 不引入 `historyMode`。
6. 不引入 `legacyFallbackUsed`。
7. 不引入 `eventsByRun`。

它唯一允许依赖的上游来源只有：

- `official-history`：完成态和历史态
- `sdk-live`：进行中的 realtime 态

### 2. `Run Card` 字段

每张卡只包含展示需要的派生字段：

- `sessionId`
- `anchorMessageId`
- `cardStatus`
  - `running`
  - `waiting_for_input`
  - `completed`
  - `failed`
  - `aborted`
- `headline`
- `finalResponse`
- `processItems`
- `activeInteraction`
- `startedAt`
- `updatedAt`
- `completedAt`
- `defaultExpanded`
- `source`
  - `official-history`
  - `sdk-live`

`anchorMessageId` 用来表示这张卡挂在哪个 user message 后面。  
如果 live 执行期间 official message id 还没到，可以在内存里临时用本地锚点，但不能把它升级成新的持久化身份。

### 3. 统一视觉骨架

每张 assistant 卡都使用以下结构：

#### 头部

- Claude 身份
- 状态标签
- 时间
- `查看过程` 开关

#### 主体回答区

- 有最终回答时，显示最终回答
- 没有最终回答时，显示当前阶段摘要
- 如果正在等待用户输入，则显示一句清晰状态文案，例如 `等待你的回答后继续`

#### 内嵌交互区

- 只有 `activeInteraction` 存在时才展示
- 交互 UI 必须嵌在同一张卡片里
- 不再作为独立的 composer 区域平行面板存在

#### 过程时间线

- 按状态决定默认展开或折叠
- 节点类型按原始语义保留：
  - thinking
  - tool use
  - tool result
  - interactive prompt
  - permission request
  - session status
  - compact boundary
  - debug ref（仅在明确要暴露时）

## 三种状态的统一交互规范

### 进行中

- 与其他状态共用同一张卡片
- 过程区默认展开
- 主体区优先显示正在生成的回答；如果还没有可读回答，则显示简短执行文案
- 过程时间线随 live 事件实时追加

### Waiting For Input

- 与其他状态共用同一张卡片
- 头部状态为 `等待你的回答`
- 交互表单直接嵌入卡片内部
- 过程区仍然保留，但默认折叠成摘要
- 同一个交互只能有一个可操作入口

### Completed（当前 session）

- 与其他状态共用同一张卡片
- 头部状态为 `已完成`
- 主体区显示最终回答
- 过程区默认折叠

### 历史回看

- 与其他状态共用同一张卡片
- 头部状态为 `已完成`
- 主体区显示最终回答
- 过程区默认折叠
- 用户展开后，可以看到基于 official history 重建出的过程节点序列

## 过程可见性策略

目标不是删除过程，而是让过程“保留但不打扰阅读”。

默认策略：

- 过程记录保留
- 完成态和历史态默认折叠
- 通过统一的“查看过程”入口访问

这意味着：

1. 过程记录不能被删掉。
2. 历史会话依然能看到 thinking、tool activity、interactive prompt。
3. 页面上不再同时出现“摘要卡 + raw feed + 独立交互面板”三套重复信息。

## 渲染链收拢策略

### 保留

1. official history reader 和 official message 解析能力
2. SDK live realtime 事件接入
3. `Run Card` 内部的过程时间线子组件
4. 现有交互渲染器，例如 `AskUserQuestionPanel`，但只能作为卡片内部内容

### 改造成输入源

1. `AssistantRuntimeTurn`
   - 变成 `Run Card` 的基础壳或其内部一部分
2. `projectLiveSdkFeed`
   - 不再直接渲染到页面，而是转成 `processItems`
3. `projectHistoricalChatMessages`
   - 不再单独形成 assistant 消息流，而是给卡片主体和过程时间线供数
4. `pendingPermissionRequests`
   - 不再驱动页面外的独立交互面板，而是成为 `activeInteraction`

### 退役为独立展示通路

1. 独立存在的 raw realtime block 区域
2. AskUser 流程的 detached banner
3. 任何与同一轮 assistant 内容重复的摘要卡

## 历史态与当前态的统一方式

历史回看与当前执行最大的区别，不应再是结构不同，而只应是默认展开策略不同：

- live run：默认展开过程
- completed live run：默认折叠过程
- historical run：默认折叠过程

这样用户对“当前会话”和“历史会话”的阅读心智会保持一致。

## 数据流

### Live

1. SDK live stream 产生官方 realtime 事件。
2. 前端把当前 run 派生成一份内存级 `Run Card` 展示模型。
3. 页面只渲染一张卡。
4. 过程事件持续追加进这张卡的过程时间线。
5. 如果需要用户输入，同一张卡直接展示交互表单。

### 当前 session 中刚完成

1. live run 进入完成态。
2. 卡片保留在原位，不切换成另一套组件。
3. 状态切为 `completed`。
4. 最终回答成为主体区主内容。
5. 过程时间线仍可展开查看，但默认折叠。

### 历史态

1. 加载 official session history。
2. 按 user turn 对 official messages 分组。
3. 每一轮派生成一张历史 `Run Card`。
4. 最终回答和过程时间线都只来源于 official messages。

## 错误处理

1. 如果 live 数据不完整，只展示已确认收到的过程节点，不杜撰缺失内容。
2. 如果历史重建无法精准锚定某一轮，允许退化到 `sessionId + 本地顺序` 作为内存级排序键，但不能升级成新的持久化身份。
3. 如果交互请求已经被处理，卡片中的可操作表单消失，但过程时间线里保留“发生过交互”的记录。
4. 如果历史态里某些过程信息本来就缺失，卡片仍然显示最终回答，但只展示可验证的过程节点。

## 测试策略

### 投影层测试

1. live 事件能投影成一张卡和一组有序 `processItems`
2. official history 能投影成相同结构的卡
3. interactive prompt 会进入卡片内部交互区，而不是变成独立页面通路

### UI 测试

1. `running` 状态默认展开过程
2. `waiting_for_input` 状态只出现一个可操作交互入口
3. `completed` 状态默认折叠过程
4. `historical completed` 默认折叠，点击后能展开过程

### 回归测试

1. `AskUserQuestion` 不再同时出现在摘要卡、realtime feed、banner 三处
2. 当前 session 和历史 session 使用同一张卡片壳
3. 不再重新引入 legacy assistant surface 作为平行展示链

## 分阶段落地建议

### Phase 1

先引入 `Run Card` view model 和统一卡片壳，但暂时保留现有数据入口。

### Phase 2

把 live process 渲染迁入卡片内部过程时间线，停止页面级 raw realtime block 直出。

### Phase 3

把 interactive prompt UI 合并进卡片主体，移除 AskUser 独立 banner 通路。

### Phase 4

把 historical official messages 投影进同一套 `Run Card` 结构，移除旧的 assistant 历史摘要并行路径。

### Phase 5

删除剩余重复展示通路，并用测试把“一条 user turn 只配一张 assistant card”固定下来。

## 风险

1. live 期间 official id 未到时，assistant run 与 user turn 的锚点绑定要处理好。
2. 历史数据里的过程结构化程度可能不如 live 时完整。
3. 当前代码依赖并行展示链较多，需要分阶段切换以避免回归。

## 验收标准

满足以下条件时，说明这次统一成功：

1. 一个 user turn 后面，页面上只出现一张 assistant card，而不是多条 assistant 表达面。
2. 当前执行中、刚完成、历史回看三种状态共享同一套结构。
3. 历史默认折叠过程，但展开后能看到过程，不再“过程直接消失”。
4. `AskUserQuestion` 只保留一个可操作入口，且过程仍可查看。
5. 这套设计不破坏 official-history-first 和 sdk-live-first 的总体架构边界。
