# Claude Agent V2 官方 SDK 强对齐重构设计 v1

## 背景

当前项目的 Agent V2 已经建立了完整的运行链路：

- 后端通过 Claude Agent SDK 创建和续接 session
- 应用层围绕 `session + run + event` 组织执行
- SQLite 通过 `agent_sessions / agent_runs / agent_run_events` 保存 V2 私有历史
- 前端同时消费 realtime 事件和历史回放 projection

这套架构已经能工作，但它把“官方 session/history 心智”和“项目自定义 run/event 心智”同时保留下来了，导致长期维护负担明显偏高：

- 历史真相源不清楚
- `sessionId` 与 `conversationId` 双身份并存
- realtime 与 history 使用不同主模型
- adapter 里存在 `jsonl` 历史与数据库 run/event 的混合叠加
- 前端存在 `historyMode`、`legacy-fallback`、`eventsByRun` 等过渡结构

本轮目标不是改成驱动 Claude Code CLI 进程，也不是简单做一层兼容包装，而是：

**在继续使用 Claude Agent SDK 作为 runtime 的前提下，把 Agent V2 重构成“官方真相源优先、应用抽象最薄、前端保留更多原始 SDK 实时反馈”的版本。**

## 用户约束

本设计以本次讨论中已经明确的约束为准：

1. 不改成 CLI 子进程 runtime，继续使用官方 SDK。
2. 历史语义要强对齐官方 session / `jsonl` 心智。
3. 前端应展示更多 SDK 实时反馈的原始内容，不做过度精简。
4. 允许保留极小的本地表，但它不能再承担历史真相源职责。
5. 保留一层调试日志，方便排障与 raw feed 回放。
6. 最终代码要清晰、简练，不能长期保留多套并行主模型。

## 目标

1. 让官方 `session` 和官方 `jsonl` 成为历史语义的主准绳。
2. 让 SDK live session / stream 成为 realtime 的唯一真相源。
3. 删除 `agent_sessions / agent_runs / agent_run_events` 三张主表及其主链路职责。
4. 删除 `historyMode`、`legacy-fallback`、`runs + eventsByRun` 这套过渡历史协议。
5. 删除 `conversationId` 作为一等身份，只保留 `sessionId`。
6. 前端改成 `official-message-first`，尽量原样展示 SDK realtime 反馈。
7. 只保留极小的本地 metadata 表和独立 debug log。

## 非目标

- 不改写 Claude 官方 `~/.claude/projects/.../*.jsonl` 文件。
- 不在本轮引入新的重型 execution tree / job tree 产品抽象。
- 不以“兼容旧接口”作为主目标。
- 不继续保留 `run/event` 数据库持久化作为正式历史主链路。
- 不为了保留旧三表数据而再引入新的长期 archive 主模型。

## 官方对齐依据

本设计的边界以 Claude 官方 SDK 文档的核心心智为准：

- session 是 create / resume / continue 的主单位
- streaming output 属于 live runtime 语义，而不是历史数据库语义
- permissions / user input / hooks 属于当前运行交互语义
- 官方历史文件属于官方会话记录，不应被应用层改写或替代

因此本设计把：

- 官方 `jsonl` 视为 history truth
- SDK stream 视为 realtime truth
- 本地产品层限制在 metadata、debug、projection 三类薄职责中

## 设计原则

### 1. `session-first`

系统的一等身份是 `sessionId`。

`conversationId`、`runId` 不再承担“是否可以继续会话”“是否存在该会话”“历史属于谁”的主判断职责。

### 2. `official-history-first`

官方 `jsonl` 是历史真相源。

前端历史回放、history API、sidebar session 汇总都要优先围绕官方 session/message 语义组织。

### 3. `sdk-realtime-first`

实时执行中的真相源不是数据库事件，而是 SDK live session 与 `session.stream()`。

所有 approval、ask-user、tool、hook、thinking、assistant 输出都从 live stream 建模。

### 4. `raw-feedback-visible`

精简的是系统抽象，不是用户反馈。

只要 SDK 已经给出了真实反馈，前端就应尽量展示出来，而不是再包装成一套厚重的私有协议再回推给前端。

### 5. `no-new-legacy-store`

如果某些历史只存在于旧三表而不属于官方 history，本轮不再为它们新增长期保留的新主模型。

本轮重构的重点是清理旧私有历史体系，而不是把旧体系复制一份继续延续。

## 方案对比

### 方案 A：保守兼容型

继续保留 SQLite 三表为主历史，只在接口语义上尽量靠近官方。

优点：

- 风险低
- 迁移成本低

缺点：

- 真相源仍然混乱
- 无法真正删掉多套主模型
- 不符合本次“彻底重构”的目标

### 方案 B：双轨过渡型

新链路以官方 history + SDK realtime 为主，但长期保留旧三表和旧 projection 作为兼容分支。

优点：

- 迁移平滑
- 回滚容易

缺点：

- 会长期保留双链路
- 维护复杂度仍高

### 方案 C：官方真相源型

历史主链路切换为官方 `jsonl`，实时主链路切换为 SDK stream，SQLite 三表直接退出主系统。

优点：

- 真相源清晰
- 删除最彻底
- 长期维护成本最低

缺点：

- 迁移设计要求高
- 前后端协议需要破坏性调整

结论：采用方案 C。

## 最终架构

### 历史真相源

- 官方 `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`
- 官方 `agent-*.jsonl` 子文件

职责：

- 会话历史回放
- message 序列
- tool_use / tool_result 的历史归档
- compact 后的连续历史语义

### 实时真相源

- SDK live session
- `session.send()`
- `session.stream()`

职责：

- thinking / delta / assistant body
- tool / hook 执行反馈
- approval / ask-user 等待态
- 当前会话是否仍处于 live 状态

### 本地极小状态层

只保留极小本地表：

- `session_metadata`

职责：

- 用户自定义标题
- 收藏 / 置顶
- 最近查看时间
- 本地 UI 偏好

明确不承担：

- 会话历史主存储
- continue/resume 主判定
- realtime 主事实
- 官方 history 替代建模

### 调试日志层

独立 append-only debug log：

- `sdk_debug_log`

职责：

- 记录 raw SDK realtime message
- 记录 permission / interaction 诊断
- 用于故障排查和 raw timeline 回放

明确不承担：

- 正式 history API 主数据
- 用户聊天主视图真相源

保留策略：

- 只保留有限窗口或滚动归档
- 允许按 session 查询
- 不允许被前端主 history 依赖为必要数据源

## 模块边界

### 后端 history 模块

新增：

- `server/agent-v2/history/official-history-reader.js`
- `server/agent-v2/history/session-history-service.js`

职责划分：

- `official-history-reader` 只读官方 `jsonl`
- `session-history-service` 负责把 official history 组织成 canonical session history

### 后端 runtime 模块

保留并瘦身：

- `server/agent-v2/runtime/claude-v2-session-pool.js`
- `server/agent-v2/runtime/claude-v2-request-builder.js`
- permission / hooks 相关模块

新增：

- `server/agent-v2/runtime/live-session-registry.js`
- `server/agent-v2/runtime/pending-interaction-registry.js`
- `server/agent-v2/debug/sdk-debug-log.js`

职责划分：

- session pool 只负责 create / resume / live reuse
- live session registry 负责查找当前活跃 session
- pending interaction registry 负责 approval / ask-user 等待态
- debug log 负责写 raw realtime 诊断

### 后端 application 层

需要重写：

- `create-agent-v2-services.js`
- `continue-conversation-run.js`
- `start-conversation-run.js`
- `handle-claude-command.js`

新职责：

- 围绕 `sessionId` 编排 create / resume / continue
- 不再依赖 repository 三表决定 continue / history / abort
- history 统一从 `session-history-service` 获取
- abort 直接针对 live session / interaction registry 处理

### 前端 history / realtime 模块

重写：

- `fetchSessionRunHistory.ts`
- `useHistoricalAgentConversation.ts`
- `projectAssistantTurnsForSession.ts`
- `projectConversationStream.ts`
- `ChatInterface.tsx`

新增：

- `projectOfficialSession.ts`
- `projectLiveSdkFeed.ts`

新职责：

- history 只消费 canonical session/message
- realtime 只消费 live SDK message feed
- 不再依赖 `historyMode`、`eventsByRun`、`legacy-fallback`

## 数据模型

### 新 history API

`GET /api/agent-v2/sessions/:id/history`

返回结构改为：

```ts
type SessionHistoryResponse = {
  sessionId: string;
  cwd: string | null;
  metadata: {
    title: string | null;
    pinned: boolean;
    starred: boolean;
    lastViewedAt: string | null;
  };
  messages: CanonicalSessionMessage[];
  diagnosticsSummary: {
    officialMessageCount: number;
    debugLogAvailable: boolean;
  };
};
```

其中 `CanonicalSessionMessage` 以官方 message/session 语义为核心，允许补充少量本地字段用于 UI 和调试定位，但不能再退回 `runs + eventsByRun` 模型。

### 新 realtime 协议

WebSocket 或等价 realtime 通道只保留少量事件族：

- `sdk.message`
- `session.status`
- `interaction.required`
- `interaction.resolved`
- `debug.ref`

说明：

- `sdk.message` 尽量原样承载 SDK realtime feed
- `session.status` 只表达最薄的 session 生命周期状态
- `interaction.required` / `interaction.resolved` 负责 approval / ask-user 之类的强交互状态
- `debug.ref` 提供 raw debug log 的引用位置

不再保留：

- `run.started`
- `run.completed`
- `run.failed`
- `sdk.system.*`
- `tool.call.*`
- 产品自定义 task/job 树命名空间

如果某些本地 UI 需要更友好的字段，应作为 `sdk.message` 的附加展示字段，而不是重新发明新的主事件体系。

## 旧表删除策略

最终删除：

- `agent_sessions`
- `agent_runs`
- `agent_run_events`

删除前必须完成替代：

1. history 接口彻底不再读取三表
2. continue / resume 不再依赖 `repo.getSession()`
3. abort 不再依赖 “session -> latest run -> active run” 的反查链路
4. realtime 不再写 `agent_run_events`
5. sidebar 和前端历史投影不再消费 DB overlay

## 旧表退役方案

本轮不再为旧三表设计长期迁移归宿。

处理原则：

1. 只要官方 `jsonl` 已能承担目标 history 语义，就以它为唯一 history 主源。
2. 旧三表只在退役期间用于对照、排障和删除前核查。
3. 删除旧三表后，系统不再依赖旧 V2 私有历史存活。

### 退役前核查

在删除旧表前，只做有限核查：

1. 现网主流程的会话是否都能从官方 `jsonl` 正常回放
2. continue / resume / abort 是否已完全脱离旧表
3. 前端历史与 realtime 展示是否已完全脱离旧表 projection
4. 删除旧表后是否不存在必经调用链断裂

### 明确约束

旧三表的价值定义为“历史债务”，不是“长期保留资产”。

因此本轮不新增：

- legacy archive sidecar
- migrated legacy history API
- 依赖旧表数据的新主模型

## 前端展示策略

### 历史主视图

历史主视图围绕 canonical session/message 展示。

默认展示：

- user / assistant turns
- tool_use / tool_result
- compact boundary
- session resume boundary

### realtime 执行视图

realtime 视图尽量原样显示 SDK feed。

允许展示更多原始反馈，包括：

- thinking
- delta / partial body
- tool execution lifecycle
- hook lifecycle
- approval / ask-user 阻塞原因
- reconnect / resume 状态

不要求把这些都压扁成统一的聊天气泡。

### 调试视图

需要时可展开：

- raw SDK message timeline
- interaction id
- debug log reference
- stream/source diagnostics

调试视图不进入正式 history 主模型。

## 对现有文件的影响

### 直接删除或退役

- `server/agent-v2/repository/sqlite-agent-v2-repository.js`
- `server/agent-v2/repository/agent-v2-repository.js`
- `server/agent-v2/application/run-event-pipeline.js`
- `src/components/chat-v2/api/fetchSessionRunHistory.ts`
- `src/components/chat-v2/hooks/useHistoricalAgentConversation.ts`
- `src/components/chat-v2/projection/projectAssistantTurnsForSession.ts`
- `src/components/chat-v2/projection/projectConversationStream.ts`

### 重点重写

- `server/agent-v2/application/create-agent-v2-services.js`
- `server/agent-v2/application/continue-conversation-run.js`
- `server/routes/agent-v2.js`
- `server/providers/claude/adapter.js`
- `src/components/chat/view/ChatInterface.tsx`

### schema 变化

删除：

- `agent_sessions`
- `agent_runs`
- `agent_run_events`

新增：

- `session_metadata`
- `sdk_debug_log`

本轮不存在新的 legacy archive 存储。

## 错误处理

### history 读取失败

- 官方 `jsonl` 读取失败时返回明确错误分类
- 不再用旧 DB history 自动兜底

### realtime 中断

- live session registry 标记 session 状态
- pending interaction registry 保留未完成交互
- 前端显示 “连接中断 / 等待恢复 / 需重新连接” 等状态

### 退役检查失败

- 只要仍发现关键流程依赖旧表，就不能进入删除旧表阶段
- 必须输出可复查的依赖残留清单

## 测试策略

1. official history reader 测试
2. history service 测试
3. create / resume / continue 行为测试
4. abort 与 pending interaction 测试
5. realtime raw feed UI projection 测试
6. 旧表退役 integration 测试
7. schema 删除迁移测试

## 风险

1. 官方 `jsonl` 与旧 DB event 的语义并不完全一一对应
2. realtime feed 比当前 UI 抽象更“原始”，前端展示复杂度会上升
3. 删除旧表后，任何漏迁职责都会直接暴露

## 风险缓解

1. 先做双读比对，再切主链路
2. realtime 与 history 分轨，不强求统一为一套气泡模型
3. debug log 独立保留，减少主协议承载诊断信息的压力
4. 删除三表前，按职责建立替代清单和校验门槛

## 实施顺序

1. 引入 official history reader、history service
2. 引入 live session registry、pending interaction registry、debug log
3. 改造 history API 为 canonical session/message 结构
4. 改造前端 history projection
5. 改造 realtime 协议与前端 realtime 展示
6. 完成旧三表退役前核查
7. 移除三表读取路径
8. 删除三表 schema 与旧 projection / 旧接口

## 最终结论

本设计选择“官方真相源型”重构：

- 官方 `jsonl` 负责历史真相
- SDK live stream 负责 realtime 真相
- 本地数据库只保留极小 metadata 表和独立 debug log
- 前端展示更多 SDK 原始反馈
- 删除旧三表、旧 history 协议、旧 overlay 和 `conversationId` 主身份

这版方案的本质不是“在现有 V2 上继续叠一层兼容”，而是：

**把当前项目收敛成一套清晰的官方对齐架构，只在真正需要的地方保留极薄的产品层。**
