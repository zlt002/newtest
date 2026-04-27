# Agent SDK Big Bang Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一次性把当前聊天链路切换到官方化 Agent SDK 输入输出协议，删除旧协议、旧兼容分支和 SDK patch。

**Architecture:** 以 `shared/agentProtocol.js` 作为唯一协议边界，先收敛后端输入输出，再替换前端 store/projection/UI，最后清理历史兼容与回归测试。当前仓库里已经有新协议骨架，但 WebSocket 输入、前端事件建模和 `/api/agent-v2` 相关链路仍混有旧模型，因此实施顺序必须先锁协议和入口，再替换状态消费层。

**Tech Stack:** Node.js, Express, WebSocket, React, TypeScript, Vite, Node test runner

---

## 2026-04-26 验收快照

> 说明：以下状态基于 2026-04-26 的 fresh verification evidence，而不是实现意图。`已验证通过` 表示有对应命令或文件证据；`部分完成` 表示有代码和局部验证，但尚未满足计划的完整完成定义；`未完成` 表示关键创建项、删除项、全量验证或文档回写尚未落地。

### 已执行验证

- `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/subcomponents/chat-request-split.test.mjs src/components/chat/view/subcomponents/MessageComponent.jobTree.test.mjs src/hooks/chat/useChatMessages.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs src/components/chat/view/agentV2Realtime.test.mjs scripts/legacy-agent-sdk-cleanup.test.mjs`
  - 结果：`96 passed, 0 failed`
- `node --experimental-strip-types --experimental-specifier-resolution=node --test src/hooks/chat/useChatRealtimeHandlers.test.mjs src/components/chat/view/subcomponents/chat-request-split.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`
  - 结果：`66 passed, 0 failed`
- `node --experimental-strip-types --experimental-specifier-resolution=node --test src/hooks/chat/useChatRealtimeHandlers.test.mjs src/components/chat/projection/projectLiveSdkFeed.test.mjs src/components/chat/projection/projectRunCards.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`
  - 结果：`86 passed, 0 failed`
- `node --experimental-strip-types --experimental-specifier-resolution=node --test src/hooks/chat/useChatRealtimeHandlers.test.mjs src/components/chat/projection/projectLiveSdkFeed.test.mjs src/components/chat/projection/projectRunCards.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`
  - 结果：`88 passed, 0 failed`
- `node --experimental-strip-types --experimental-specifier-resolution=node --test src/hooks/chat/useChatMessages.test.mjs src/components/chat/view/subcomponents/chat-request-split.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`
  - 结果：`66 passed, 0 failed`
- `node --experimental-strip-types --experimental-specifier-resolution=node --test src/stores/useSessionStore.transport.test.mjs src/hooks/chat/useChatMessages.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`
  - 结果：`62 passed, 0 failed`
- `node --experimental-strip-types --experimental-specifier-resolution=node --test src/stores/useSessionStore.transport.test.mjs src/stores/useSessionStore.realtime-merge.test.mjs src/hooks/chat/useChatMessages.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`
  - 结果：`70 passed, 0 failed`
- `node --experimental-strip-types --experimental-specifier-resolution=node --test src/stores/useSessionStore.transport.test.mjs src/stores/useSessionStore.realtime-merge.test.mjs src/hooks/chat/useChatMessages.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`
  - 结果：`71 passed, 0 failed`
- `node --experimental-strip-types --experimental-specifier-resolution=node --test src/stores/useSessionStore.transport.test.mjs src/stores/useSessionStore.realtime-merge.test.mjs src/hooks/chat/useChatMessages.test.mjs src/components/chat/projection/projectRunCards.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`
  - 结果：`99 passed, 0 failed`
- `node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/projection/projectHistoricalChatMessages.test.mjs src/hooks/chat/useChatMessages.test.mjs src/stores/useSessionStore.transport.test.mjs src/components/chat/projection/projectRunCards.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs`
  - 结果：`102 passed, 0 failed`
- `node --experimental-strip-types --experimental-specifier-resolution=node --test src/hooks/chat/useChatComposerState.test.mjs src/components/chat/view/agentV2Realtime.test.mjs src/components/chat/view/subcomponents/MessageComponent.jobTree.test.mjs src/hooks/chat/useChatMessages.test.mjs`
  - 结果：`75 passed, 0 failed`
- `npm run typecheck`
  - 结果：通过（`tsc --noEmit -p tsconfig.json` exit `0`）
- `npm test`
  - 结果：`229 passed, 0 failed`

### 当前任务状态

- Task 1：`部分完成`
  - 证据：`shared/agentProtocol.js` / `shared/agentProtocol.d.ts` 已有 `agent_sdk_message`、`tool_approval_request`、`question_request`；`src/components/chat/types/transport.ts` 已存在；transport 相关测试通过。
- Task 2：`已验证通过`
  - 证据：`agentV2Realtime.test.mjs`、`WebSocketContext.test.mjs`、`server/index.test.mjs` fresh 通过，发送链路已使用 `chat_run_start` / `chat_user_message`。
- Task 3：`已验证通过`
  - 证据：`agent-transport.test.mjs`、`claude-v2-event-translator.test.mjs` fresh 通过，后端已稳定发 transport event。
- Task 4：`部分完成`
  - 证据：`src/components/chat/components/QuestionRequestCard.tsx`、`src/components/chat/components/ToolApprovalCard.tsx` 已创建并接入 `InteractiveRequestsBanner.tsx` / `PermissionRequestsBanner.tsx`；`chat-request-split.test.mjs` fresh 通过。
- Task 5：`部分完成`
  - 证据：conversation/projection 相关回归通过；`useChatRealtimeHandlers.helpers.ts` 已把 pending decision recovery realtime 投影从 `collectRealtimeEventsFromNormalizedMessage()` 中拆出，旧 `interactive_prompt`/`permission_request` 不再作为该 helper 的交互恢复入口；`projectLiveSdkFeed.ts` / `projectRunCards.ts` 已停止把 legacy `stream_delta`、`tool_use_partial`、live `tool_result` 当作主实时路径；`useChatMessages.ts` 已停止把 legacy `permission_request + AskUserQuestion` 升级成 `interactive_prompt`，并显式把 canonical `session_status / debug_ref` 视为 process-only records，不再落入普通聊天气泡投影；`projectHistoricalChatMessages.ts` 也已显式忽略 `session_status / debug_ref`，避免 legacy pane 将它们误投成普通消息；`useSessionStore.ts` 现已把 legacy `stream_delta -> text`、`tool_use_partial -> tool_use` 仅作为收口期兼容映射处理，且 `reconcileRealtimeMessages()` 会在 server 已有 canonical message 时清掉对应 legacy realtime 残影；`toNormalizedHistoryMessage()` 也已不再把 legacy `interactive_prompt / permission_request` 作为正式 history kind 继续保留，而是优先保留 `question_request / tool_approval_request`，同时把 transcript-only control kinds `stream_end / complete / session_created` 降级为普通 `text`，避免它们继续以正式 history 控制消息身份参与 store 合并；此外 store 已正式保留 canonical `session_status / debug_ref` history kind，减少 store fallback 与 official history run-card 投影之间的语义分叉；但 store / projection 仍保留部分旧命名兼容层。
- Task 6：`部分完成`
  - 证据：`src/components/chat/components/StructuredOutputCard.tsx` 已创建并接入 `MessageComponent.tsx`；`useChatComposerState.ts`、`ChatInterface.tsx`、`agentV2Realtime.ts` 已把可选 `outputFormat` 从前端提交路径贯通到 `chat_run_start` transport payload，且不会污染续聊 `chat_user_message`；`MessageComponent.jobTree.test.mjs`、`agentV2Realtime.test.mjs`、`useChatComposerState.test.mjs`、`useChatMessages.test.mjs` fresh 通过。
- Task 7：`已验证通过`
  - 证据：`server/routes/agent-v2.js` 已存在，`server/routes/agent-v2.test.mjs` fresh 通过。
- Task 8：`部分完成`
  - 证据：`scripts/patch-ask-user-question-limit.mjs` 已删除，`package.json` 已移除对应 `postinstall`，新增并增强了 `scripts/legacy-agent-sdk-cleanup.test.mjs` 守护回归，现会同时防止 `agent-run`、`claude-permission-response` 等旧 WebSocket transport 事件名重新回到 `agentV2Realtime.ts`、`useChatRealtimeHandlers.ts`、`server/websocket/handlers/chatHandler.js`；`npm run typecheck` 与 `npm test` 已 fresh 通过，但“删除所有旧兼容死分支”的范围仍未完全验收。
- Task 9：`未完成`
  - 证据：手工联调矩阵未执行；`docs/agent-sdk-big-bang-task-list.md` 与 `docs/agent-sdk-protocol-draft.md` 尚未按最终状态回写。

## 实施前说明

- 本计划把 [agent-sdk-big-bang-redesign.md](/Users/zhanglt21/Desktop/accrnew/cc-ui/docs/agent-sdk-big-bang-redesign.md)、[agent-sdk-big-bang-task-list.md](/Users/zhanglt21/Desktop/accrnew/cc-ui/docs/agent-sdk-big-bang-task-list.md)、[agent-sdk-protocol-draft.md](/Users/zhanglt21/Desktop/accrnew/cc-ui/docs/agent-sdk-protocol-draft.md) 视为已确认设计输入。
- 文档中提到的 `server/routes/agent.js` 在当前仓库不存在，实际 HTTP 入口是 `server/routes/agent-v2.js`，实时入口是 `server/websocket/handlers/chatHandler.js`。执行时以仓库现状为准。
- 当前仓库已经存在协议骨架：
  - `shared/agentProtocol.js`
  - `server/utils/agent-transport.js`
  - `src/stores/useSessionStore.ts` 中的 transport 映射
- 当前最大风险不是“缺少新协议”，而是“新旧协议并存”。所有任务都必须以删除兼容分支为目标，而不是继续加桥接层。

## 文件分组

### 协议与共享类型

- Modify: `shared/agentProtocol.js`
- Modify: `shared/agentProtocol.d.ts`
- Create: `src/components/chat/types/transport.ts`
- Modify: `src/components/chat/types/agentEvents.ts`
- Modify: `src/components/chat/types/types.ts`

### 后端输入输出与运行时

- Modify: `server/websocket/handlers/chatHandler.js`
- Modify: `server/utils/agent-transport.js`
- Modify: `server/utils/ask-user-question.js`
- Modify: `server/services/agent/default-services.js`
- Modify: `server/services/agent/application/`
- Modify: `server/services/agent/runtime/`
- Modify: `server/routes/agent-v2.js`
- Modify: `server/routes/agent-v2.test.mjs`

### 前端实时链路与状态

- Modify: `src/hooks/chat/useChatComposerState.ts`
- Modify: `src/hooks/chat/useChatRealtimeHandlers.ts`
- Modify: `src/hooks/chat/useChatRealtimeHandlers.helpers.ts`
- Modify: `src/hooks/chat/sessionStreamingRouting.ts`
- Modify: `src/stores/useSessionStore.ts`
- Modify: `src/stores/useSessionStore.transport.test.mjs`
- Modify: `src/components/chat/store/createAgentEventStore.ts`
- Modify: `src/components/chat/store/createSessionRealtimeStore.ts`
- Modify: `src/components/chat/projection/projectLiveSdkFeed.ts`
- Modify: `src/components/chat/projection/projectOfficialSession.ts`
- Modify: `src/components/chat/projection/projectRunExecution.ts`
- Modify: `src/components/chat/projection/projectRunCards.ts`

### 前端交互与展示

- Modify: `src/components/chat/view/agentV2Realtime.ts`
- Modify: `src/components/chat/view/subcomponents/ChatComposer.tsx`
- Modify: `src/components/chat/view/subcomponents/ImageAttachment.tsx`
- Modify: `src/components/chat/view/subcomponents/PermissionRequestsBanner.tsx`
- Modify: `src/components/chat/view/subcomponents/InteractiveRequestsBanner.tsx`
- Modify: `src/components/chat/view/subcomponents/MessageComponent.tsx`
- Modify: `src/components/chat/tools/components/InteractiveRenderers/AskUserQuestionPanel.tsx`
- Create: `src/components/chat/components/QuestionRequestCard.tsx`
- Create: `src/components/chat/components/ToolApprovalCard.tsx`
- Create: `src/components/chat/components/StructuredOutputCard.tsx`

### 删除项

- Delete: `scripts/patch-ask-user-question-limit.mjs`
- Modify: `package.json`
- Delete or shrink: 仅为旧协议存在的测试、旧类型映射和兼容 helper

## Task 1: 锁定唯一协议并补齐共享类型 `【当前状态：部分完成】`

**Files:**
- Modify: `shared/agentProtocol.js`
- Modify: `shared/agentProtocol.d.ts`
- Create: `src/components/chat/types/transport.ts`
- Modify: `src/components/chat/types/agentEvents.ts`
- Test: `server/utils/agent-transport.test.mjs`
- Test: `src/stores/useSessionStore.transport.test.mjs`

- [ ] **Step 1: 先盘点当前协议差异**

Run:

```bash
rg -n "agent_sdk_message|tool_approval_request|question_request|agent-run|claude-permission-response|interactive_prompt|permission_request" shared server src
```

Expected: 能看到 `shared/agentProtocol.js` 已定义新协议，但 WebSocket 输入和前端事件类型仍依赖 `agent-run`、`claude-permission-response`、`interactive_prompt` 等旧命名。

- [ ] **Step 2: 统一共享协议常量与事件字段**

要落地的最小契约：

```ts
export const CLIENT_EVENT_TYPES = {
  CHAT_RUN_START: 'chat_run_start',
  CHAT_USER_MESSAGE: 'chat_user_message',
  TOOL_APPROVAL_RESPONSE: 'tool_approval_response',
  QUESTION_RESPONSE: 'question_response',
  CHAT_INTERRUPT: 'chat_interrupt',
  CHAT_RECONNECT: 'chat_reconnect',
} as const;

export const SERVER_EVENT_TYPES = {
  AGENT_LIFECYCLE: 'agent_lifecycle',
  AGENT_SDK_MESSAGE: 'agent_sdk_message',
  TOOL_APPROVAL_REQUEST: 'tool_approval_request',
  QUESTION_REQUEST: 'question_request',
  AGENT_ERROR: 'agent_error',
  GIT_BRANCH_CREATED: 'git_branch_created',
  GIT_PR_CREATED: 'git_pr_created',
  DONE: 'done',
} as const;
```

要求：

- `sdkMessage` 包裹层保持稳定
- `question_request` 与 `tool_approval_request` 必须彻底分离
- 前端本地 `AgentEventType` 不再把旧协议名当事实源

- [ ] **Step 3: 补一套前端 transport 类型入口**

在 `src/components/chat/types/transport.ts` 里定义：

```ts
export type ClientToServerEvent =
  | ChatRunStartEvent
  | ChatUserMessageEvent
  | ToolApprovalResponseEvent
  | QuestionResponseEvent
  | ChatInterruptEvent
  | ChatReconnectEvent;

export type ServerToClientEvent =
  | AgentLifecycleEvent
  | AgentSdkMessageEvent
  | ToolApprovalRequestEvent
  | QuestionRequestEvent
  | AgentErrorEvent
  | GitIntegrationEvent;
```

要求：

- 前端 WebSocket 发送与接收都改为引用这一层
- `src/components/chat/types/agentEvents.ts` 保留投影事件，但不能再承担 transport 契约职责

- [ ] **Step 4: 写/改测试，锁定协议契约**

Run:

```bash
node --test server/utils/agent-transport.test.mjs src/stores/useSessionStore.transport.test.mjs
```

Expected: 只验证新 transport 协议，不再新增任何旧字段回填断言。

- [ ] **Step 5: 提交协议收敛**

```bash
git add shared/agentProtocol.js shared/agentProtocol.d.ts src/components/chat/types/transport.ts src/components/chat/types/agentEvents.ts src/components/chat/types/types.ts server/utils/agent-transport.test.mjs src/stores/useSessionStore.transport.test.mjs
git commit -m "refactor: lock shared agent transport protocol"
```

## Task 2: 重写 WebSocket 输入入口，切到消息流模型 `【当前状态：已验证通过】`

**Files:**
- Modify: `server/websocket/handlers/chatHandler.js`
- Modify: `src/components/chat/view/agentV2Realtime.ts`
- Modify: `src/hooks/chat/useChatComposerState.ts`
- Test: `src/components/chat/view/agentV2Realtime.test.mjs`
- Test: `src/contexts/WebSocketContext.test.mjs`

- [ ] **Step 1: 先让测试暴露旧输入协议**

目标替换：

```ts
// old
{ type: 'agent-run', prompt: 'hello' }

// new
{
  type: 'chat_run_start',
  sessionId: null,
  projectPath,
  message: { role: 'user', content: 'hello' },
}
```

Run:

```bash
node --test src/components/chat/view/agentV2Realtime.test.mjs src/contexts/WebSocketContext.test.mjs
```

Expected: 旧断言失败，提示仍在发送 `agent-run`。

- [ ] **Step 2: 修改前端发送模型**

要求：

- 首轮发送 `chat_run_start`
- 已有 session 发送 `chat_user_message`
- 图片输入走 content block array
- 中断发送 `chat_interrupt`
- 重连发送 `chat_reconnect`

建议核心函数形态：

```ts
sendMessage({
  type: currentSessionId ? 'chat_user_message' : 'chat_run_start',
  sessionId: currentSessionId,
  projectPath,
  message: buildUserContent({ text, attachments }),
  outputFormat,
  permissionMode,
});
```

- [ ] **Step 3: 修改后端 WebSocket 入口解析**

`server/websocket/handlers/chatHandler.js` 要求：

- 删除 `data.type === 'agent-run'` 主分支
- 改成处理 `chat_run_start` / `chat_user_message` / `tool_approval_response` / `question_response` / `chat_interrupt` / `chat_reconnect`
- 不再从 `data.prompt` 读取文本
- 把 `message` 原样传给 Agent V2 服务层

- [ ] **Step 4: 回归发送链路**

Run:

```bash
node --test src/components/chat/view/agentV2Realtime.test.mjs src/contexts/WebSocketContext.test.mjs server/index.test.mjs
```

Expected: 前端和 WebSocket 测试全部以新事件名通过。

- [ ] **Step 5: 提交输入链路切换**

```bash
git add server/websocket/handlers/chatHandler.js src/components/chat/view/agentV2Realtime.ts src/hooks/chat/useChatComposerState.ts src/components/chat/view/agentV2Realtime.test.mjs src/contexts/WebSocketContext.test.mjs server/index.test.mjs
git commit -m "refactor: switch chat transport to streaming input events"
```

## Task 3: 重写后端输出链路，禁止旧 NormalizedMessage 成为主协议 `【当前状态：已验证通过】`

**Files:**
- Modify: `server/utils/agent-transport.js`
- Modify: `server/services/agent/runtime/`
- Modify: `server/services/agent/application/`
- Modify: `server/websocket/handlers/chatHandler.js`
- Test: `server/utils/agent-transport.test.mjs`
- Test: `server/services/agent/runtime/claude-v2-event-translator.test.mjs`

- [ ] **Step 1: 识别所有旧输出投影点**

Run:

```bash
rg -n "NormalizedMessage|stream_delta|stream_end|tool_use_partial|permission_request|interactive_prompt" server src
```

Expected: 找到所有仍以旧协议为中心的后端发包点和前端依赖点。

- [ ] **Step 2: 统一只发 transport event**

目标输出：

```ts
writer.send(createTransportSdkMessage(message, { sessionId, provider: 'claude' }));
writer.send(createTransportToolApprovalRequest({ sessionId, requestId, toolName, input }));
writer.send(createTransportQuestionRequest({ sessionId, requestId, questions }));
writer.send(createAgentRunCompletedEvent({ sessionId }));
```

要求：

- SDK 原生消息走 `agent_sdk_message`
- 生命周期走 `agent_lifecycle`
- 审批与问题走独立事件
- 错误走 `agent_error`
- 不再向前端发送“兼容旧 UI 的归一化文本流”作为服务边界

- [ ] **Step 3: 明确哪些仍可保留为应用层附加事件**

允许保留：

- `git_branch_created`
- `git_pr_created`
- `done`

不允许继续保留：

- 以旧 delta 事件命名的主链路
- 以 `NormalizedMessage.kind` 为 transport 契约的输出

- [ ] **Step 4: 跑后端 translator/transport 测试**

Run:

```bash
node --test server/utils/agent-transport.test.mjs server/services/agent/runtime/claude-v2-event-translator.test.mjs
```

Expected: 测试断言围绕 transport event，而不是围绕旧 kind。

- [ ] **Step 5: 提交输出链路重写**

```bash
git add server/utils/agent-transport.js server/services/agent/runtime server/services/agent/application server/websocket/handlers/chatHandler.js server/utils/agent-transport.test.mjs server/services/agent/runtime/claude-v2-event-translator.test.mjs
git commit -m "refactor: unify backend agent output transport"
```

## Task 4: 把 AskUserQuestion 与工具审批彻底拆开 `【当前状态：未完成】`

**Files:**
- Modify: `server/utils/ask-user-question.js`
- Modify: `server/websocket/handlers/chatHandler.js`
- Modify: `src/hooks/chat/useChatRealtimeHandlers.ts`
- Modify: `src/hooks/chat/useChatRealtimeHandlers.helpers.ts`
- Modify: `src/components/chat/view/subcomponents/PermissionRequestsBanner.tsx`
- Modify: `src/components/chat/view/subcomponents/InteractiveRequestsBanner.tsx`
- Modify: `src/components/chat/tools/components/InteractiveRenderers/AskUserQuestionPanel.tsx`
- Create: `src/components/chat/components/QuestionRequestCard.tsx`
- Create: `src/components/chat/components/ToolApprovalCard.tsx`
- Test: `server/utils/ask-user-question.test.mjs`
- Test: `src/components/chat/utils/chatPermissions.test.mjs`

- [ ] **Step 1: 先让响应类型分叉**

目标响应包：

```ts
{ type: 'tool_approval_response', sessionId, requestId, decision: 'allow' }

{ type: 'question_response', sessionId, requestId, questions, answers }
```

要求：

- 不再使用 `claude-permission-response`
- 不再把 `AskUserQuestion` 伪装成 permission request

- [ ] **Step 2: 让后端待处理请求分别存取**

要求：

- `listPendingApprovals(sessionId)` 只返回审批
- `listPendingInteractivePrompts(sessionId)` 只返回问题
- WebSocket 获取待处理项时返回分开的协议类型，而不是混装数组

- [ ] **Step 3: 重写前端待处理请求模型**

目标：

- `PendingPermissionRequest` 只表示工具审批
- 新增 `PendingQuestionRequest`
- `useChatRealtimeHandlers.ts` 中删除 `isInteractivePromptRequestLike`

- [ ] **Step 4: 分离 UI 组件**

要求：

- 审批卡只展示 allow / deny / remember
- 问题卡展示单选、多选、free-text
- `QuestionRequestCard.tsx` 和 `ToolApprovalCard.tsx` 由消息投影层驱动，不再借同一 banner 组件混显

- [ ] **Step 5: 回归测试**

Run:

```bash
node --test server/utils/ask-user-question.test.mjs src/components/chat/utils/chatPermissions.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs
```

Expected: 测试显式区分 question request 与 tool approval request。

- [ ] **Step 6: 提交交互模型拆分**

```bash
git add server/utils/ask-user-question.js server/websocket/handlers/chatHandler.js src/hooks/chat/useChatRealtimeHandlers.ts src/hooks/chat/useChatRealtimeHandlers.helpers.ts src/components/chat/view/subcomponents/PermissionRequestsBanner.tsx src/components/chat/view/subcomponents/InteractiveRequestsBanner.tsx src/components/chat/tools/components/InteractiveRenderers/AskUserQuestionPanel.tsx src/components/chat/components/QuestionRequestCard.tsx src/components/chat/components/ToolApprovalCard.tsx server/utils/ask-user-question.test.mjs src/components/chat/utils/chatPermissions.test.mjs src/components/chat/view/subcomponents/ChatMessagesPane.test.mjs
git commit -m "refactor: split ask-user-question from tool approvals"
```

## Task 5: 重写前端 store 与 projection，让新 transport 成为唯一事实源 `【当前状态：部分完成】`

**Files:**
- Modify: `src/stores/useSessionStore.ts`
- Modify: `src/components/chat/store/createAgentEventStore.ts`
- Modify: `src/components/chat/store/createSessionRealtimeStore.ts`
- Modify: `src/components/chat/projection/projectLiveSdkFeed.ts`
- Modify: `src/components/chat/projection/projectOfficialSession.ts`
- Modify: `src/components/chat/projection/projectRunExecution.ts`
- Modify: `src/components/chat/projection/projectRunCards.ts`
- Modify: `src/components/chat/types/agentEvents.ts`
- Test: `src/components/chat/store/createAgentEventStore.test.mjs`
- Test: `src/components/chat/store/createSessionRealtimeStore.test.mjs`
- Test: `src/components/chat/projection/projectLiveSdkFeed.test.mjs`
- Test: `src/components/chat/projection/projectOfficialSession.test.mjs`
- Test: `src/components/chat/projection/projectRunExecution.test.mjs`

- [ ] **Step 1: 先收缩本地事件模型**

要求：

- `AgentEventType` 不再继续扩张旧协议名
- 只保留对 UI 真有价值的 projection 事件
- transport event 与 projection event 分层

- [ ] **Step 2: 简化 `useSessionStore.ts`**

目标：

- `agent_sdk_message` 只做最小映射
- 不再把 transport 重新映射成历史 `NormalizedMessage.kind` 大全
- 流式文本、工具调用、结果卡由 projection 层生成

- [ ] **Step 3: 清理 `projectLiveSdkFeed.ts` 的旧 kind 依赖**

重点替换：

```ts
if (event.type === 'agent_sdk_message') {
  const { sdkType, payload } = event.sdkMessage;
  // 用 sdkType + payload subtype 做投影
}
```

而不是：

```ts
if (kind === 'stream_delta' || kind === 'tool_use_partial') { ... }
```

- [ ] **Step 4: 重写 reconnect / session handoff 逻辑**

要求：

- `session_created` 成为会话切换唯一真相
- reconnect 只恢复新 transport 流
- 删除仅服务于旧协议的 pending merge 逻辑

- [ ] **Step 5: 跑前端 store/projection 回归**

Run:

```bash
node --test src/components/chat/store/createAgentEventStore.test.mjs src/components/chat/store/createSessionRealtimeStore.test.mjs src/components/chat/projection/projectLiveSdkFeed.test.mjs src/components/chat/projection/projectOfficialSession.test.mjs src/components/chat/projection/projectRunExecution.test.mjs
```

Expected: 所有断言基于 transport + projection 分层，不再要求旧 kind 回填。

- [ ] **Step 6: 提交前端状态模型收敛**

```bash
git add src/stores/useSessionStore.ts src/components/chat/store/createAgentEventStore.ts src/components/chat/store/createSessionRealtimeStore.ts src/components/chat/projection/projectLiveSdkFeed.ts src/components/chat/projection/projectOfficialSession.ts src/components/chat/projection/projectRunExecution.ts src/components/chat/projection/projectRunCards.ts src/components/chat/types/agentEvents.ts src/components/chat/store/createAgentEventStore.test.mjs src/components/chat/store/createSessionRealtimeStore.test.mjs src/components/chat/projection/projectLiveSdkFeed.test.mjs src/components/chat/projection/projectOfficialSession.test.mjs src/components/chat/projection/projectRunExecution.test.mjs
git commit -m "refactor: make transport events the sole chat state source"
```

## Task 6: structured output 产品化 `【当前状态：未完成】`

**Files:**
- Modify: `shared/agentProtocol.js`
- Modify: `server/services/agent/runtime/`
- Modify: `server/routes/agent-v2.js`
- Modify: `src/hooks/chat/useChatComposerState.ts`
- Create: `src/components/chat/components/StructuredOutputCard.tsx`
- Modify: `src/components/chat/view/subcomponents/MessageComponent.tsx`
- Test: `src/components/chat/view/subcomponents/MessageComponent.jobTree.test.mjs`

- [ ] **Step 1: 请求端支持 outputFormat**

要求：

- `chat_run_start` 支持 `outputFormat`
- 多轮是否允许更新 `outputFormat` 要在实现时定成“仅首轮设置”或“每轮覆盖”，推荐“仅 run start 设置”

- [ ] **Step 2: 结果端透传 structured output**

目标结果结构：

```ts
{
  type: 'agent_sdk_message',
  sdkMessage: {
    sdkType: 'result',
    payload: {
      result,
      subtype,
      structured_output,
      usage,
      modelUsage,
    },
  },
}
```

- [ ] **Step 3: 新增 structured output 卡片**

要求：

- 支持 JSON 展示
- 支持复制原始 JSON
- 支持错误态
- 与普通文本结果卡并存，但不能混成同一种渲染路径

- [ ] **Step 4: 回归 structured output 展示**

Run:

```bash
node --test src/components/chat/view/subcomponents/MessageComponent.jobTree.test.mjs src/components/chat/view/agentV2Realtime.test.mjs
```

Expected: structured output 能以独立 UI 呈现并保留 usage 信息。

- [ ] **Step 5: 提交 structured output 闭环**

```bash
git add shared/agentProtocol.js server/services/agent/runtime server/routes/agent-v2.js src/hooks/chat/useChatComposerState.ts src/components/chat/components/StructuredOutputCard.tsx src/components/chat/view/subcomponents/MessageComponent.tsx src/components/chat/view/subcomponents/MessageComponent.jobTree.test.mjs src/components/chat/view/agentV2Realtime.test.mjs
git commit -m "feat: productize structured output rendering"
```

## Task 7: 重做 `/api/agent-v2`，统一 HTTP 入口协议 `【当前状态：已验证通过】`

**Files:**
- Modify: `server/routes/agent-v2.js`
- Modify: `server/routes/agent-v2.test.mjs`
- Modify: `src/services/chatHistoryService.ts`

- [ ] **Step 1: 明确 HTTP 范围**

当前仓库没有 `server/routes/agent.js`，因此本轮以 `agent-v2` 为唯一 HTTP 入口，目标是：

- 会话创建
- run 创建/继续
- 历史拉取
- structured output 和 result 聚合返回

- [ ] **Step 2: 重写流式/非流式返回结构**

要求：

- 如果存在 HTTP 流式接口，返回 `ServerToClientEvent`
- 如果存在非流式接口，最终返回统一 `result`、`structuredOutput`、`usage`
- 不再输出旧 `claude-response` 风格对象

- [ ] **Step 3: 整理 history 服务**

要求：

- `chatHistoryService.ts` 与 route 返回的历史消息要以官方 message + projection 为基准
- 不再补旧 UI 专用字段，除非它们已成为稳定 view model 的一部分

- [ ] **Step 4: 跑 route 回归**

Run:

```bash
node --test server/routes/agent-v2.test.mjs
```

Expected: route 测试断言 session-first API，不再对历史兼容路径做保证。

- [ ] **Step 5: 提交 HTTP 协议统一**

```bash
git add server/routes/agent-v2.js server/routes/agent-v2.test.mjs src/services/chatHistoryService.ts
git commit -m "refactor: align agent-v2 http api with transport protocol"
```

## Task 8: 删除 patch、旧兼容逻辑和死代码 `【当前状态：未完成】`

**Files:**
- Delete: `scripts/patch-ask-user-question-limit.mjs`
- Modify: `package.json`
- Modify: `server/websocket/handlers/chatHandler.js`
- Modify: `src/stores/useSessionStore.ts`
- Modify: `src/hooks/chat/useChatRealtimeHandlers.ts`
- Modify: `src/components/chat/projection/`
- Test: 全量相关测试

- [ ] **Step 1: 删除 SDK patch 及 postinstall 依赖**

Run:

```bash
rg -n "patch-ask-user-question-limit|postinstall|claude-permission-response|agent-run" package.json scripts server src
```

Expected: 能准确看到所有残留点。

- [ ] **Step 2: 删除死分支**

删除标准：

- 仅用于旧 WebSocket 输入协议
- 仅用于旧 `NormalizedMessage.kind`
- 仅用于把 AskUserQuestion 伪装成 permission
- 仅用于图片临时文件拼 prompt

- [ ] **Step 3: 删除或重写测试**

原则：

- 测旧协议行为的测试删掉
- 仍有产品价值的行为测试改写到新协议

- [ ] **Step 4: 跑一次全量定向回归**

Run:

```bash
npm test
npm run typecheck
```

Expected: 全量测试与类型检查通过；若 `npm test` 过慢，可先局部跑完再全量补跑。

- [ ] **Step 5: 提交清理**

```bash
git add -A
git commit -m "chore: remove legacy agent sdk compatibility paths"
```

## Task 9: 验收矩阵与手工联调 `【当前状态：未完成】`

**Files:**
- Modify: `docs/agent-sdk-big-bang-task-list.md`
- Modify: `docs/agent-sdk-protocol-draft.md`
- Optional: `docs/superpowers/specs/` 中补一份实际落地差异说明

- [ ] **Step 1: 执行协议验收矩阵**

手工或自动覆盖以下场景：

1. 新会话首轮文本
2. 多轮连续对话
3. 图片 + 文本混合输入
4. tool approval allow / deny
5. AskUserQuestion 单选
6. AskUserQuestion 多选
7. AskUserQuestion free-text
8. structured output success
9. structured output error
10. interrupt
11. reconnect
12. history reload

- [ ] **Step 2: 本地联调建议**

Run:

```bash
npm run server
npm run client
```

手工确认：

- 首轮与续聊是否使用不同 client event
- 审批与提问是否显示为两种卡片
- structured output 是否能复制原始 JSON
- reconnect 后是否重复插入历史消息

- [ ] **Step 3: 回写文档**

要求：

- `agent-sdk-protocol-draft.md` 更新为“当前实际协议”
- `agent-sdk-big-bang-task-list.md` 标记已完成/未完成项
- 如有与原设计不一致的地方，写清“为什么按仓库现状调整”

- [ ] **Step 4: 最终提交**

```bash
git add docs/agent-sdk-big-bang-task-list.md docs/agent-sdk-protocol-draft.md
git commit -m "docs: finalize agent sdk big bang rollout notes"
```

## 推荐执行顺序

1. Task 1 锁协议
2. Task 2 切输入
3. Task 3 切输出
4. Task 4 拆审批与提问
5. Task 5 收敛 store/projection
6. Task 6 打通 structured output
7. Task 7 统一 HTTP 入口
8. Task 8 删兼容层
9. Task 9 验收与文档

## 风险清单

- `src/stores/useSessionStore.ts` 当前仍承担大量兼容映射，改动时最容易造成历史会话展示回退。
- `useChatRealtimeHandlers.ts` 中 session handoff、pending request、stream flush 三条逻辑耦合较深，建议拆分小提交。
- `agent-v2` 路由和 WebSocket 实时链路很可能共享运行时对象，切协议时要先确认哪些结构是服务层稳定接口，哪些只是 transport 包装。
- structured output 若与现有 result card 共用渲染逻辑，容易再次引入“同一消息多分支兼容”问题，必须单独卡片化。

## 完成定义

- 主聊天已完全改为 streaming input 消息模型
- 图片输入走官方 content block
- 后端输出只保留新 transport protocol
- AskUserQuestion 与工具审批在协议、状态、UI 上完全分离
- structured output 从请求到展示全链路可用
- `/api/agent-v2` 与实时链路协议一致
- SDK patch、旧兼容类型、旧主协议分支已删除
- 全量测试和类型检查通过
