# Agent SDK 官方化一刀切重构方案

## 背景

当前项目已经接入 `@anthropic-ai/claude-agent-sdk`，但整体架构仍然保留了较多历史包袱：

- 主聊天输入仍然偏向单字符串 prompt 驱动
- 图片输入通过临时文件路径拼接进 prompt
- 后端把 SDK 原生消息压扁成自定义协议
- `AskUserQuestion` 与普通工具审批在前端语义混杂
- `/api/agent` 仍残留旧响应模型
- 项目通过 patch 修改 SDK 的 `AskUserQuestion` 限制

如果继续做渐进式兼容迁移，短期会稳，但中长期一定会把协议、状态和前端投影层越拖越脏。

由于项目目前尚未正式对外发布，本次建议采用 **一刀切重构**：

- 不保留旧协议主路径
- 不做双轨并行
- 不做历史兼容层
- 直接以官方 Agent SDK 模型作为唯一标准重建输入输出链路

目标是让后续维护更干净、更简单、更接近官方文档，不再让系统长期处于“SDK 一套、后端一套、前端再一套”的状态。

## 重构目标

本次重构完成后，项目需要达到以下目标：

1. 后端仅保留一种对外消息协议，语义以官方 SDK 为准。
2. 主聊天仅保留一种输入模型，采用官方推荐的 streaming input。
3. 图片输入直接走官方 content block。
4. 前端仅保留一种状态模型，不再同时兼容多种历史消息格式。
5. `AskUserQuestion` 与工具审批彻底拆分为两类独立交互。
6. structured output 成为正式的一等能力。
7. `/api/agent` 的流式和非流式响应统一到新的官方化协议。
8. 删除所有 patch、历史兼容逻辑和旧协议残留。

## 核心设计原则

### 1. 官方 SDK 是唯一事实来源

重构后，后端必须以 Agent SDK 原生消息类型为基础建模。也就是说，系统内部的核心语义只承认以下官方消息层次：

- `system`
- `assistant`
- `user`
- `stream_event`
- `result`

以及这些消息承载的官方字段：

- `message`
- `event`
- `subtype`
- `structured_output`
- `modelUsage`
- `session_id`

后端可以做轻量封装，但不能再把协议改造成另一套主语义体系。

### 2. 输入链路必须官方化

主聊天不再基于：

- 单条字符串 prompt
- 每轮靠 resume 补会话连续性
- 把附加信息硬拼进 prompt

而是改成官方推荐的 streaming input：

- 会话是长生命周期的
- 用户消息按顺序流入
- 用户回答问题按消息送入
- 图片作为 content block 送入

### 3. 前端只理解一种正式协议

当前前端之所以复杂，根本原因不是 UI 复杂，而是它承担了多个历史时期协议的兼容责任。

重构后，前端只消费一种正式 transport event，不再兼容：

- 旧 `NormalizedMessage` 主协议
- 历史 SSE 包装格式
- 旧的 `claude-response`
- 混杂语义的 permission event

### 4. 删除优于兼容

只要某条逻辑的存在是为了兼容旧模型，而不是为了实现新模型，都应该删除，不应该保留。

## 重构后的目标架构

## 一、统一输入模型

### 设计目标

所有聊天输入统一为会话消息流。

### 输入类型

允许的输入类型只有：

1. 用户文本消息
2. 用户图片消息
3. 用户对 `AskUserQuestion` 的回答
4. 中断 / 恢复控制信号

### 标准输入形态

后端内部应统一成类似结构：

```ts
type AgentInputMessage =
  | {
      type: 'user';
      message: {
        role: 'user';
        content: string | Array<
          | { type: 'text'; text: string }
          | {
              type: 'image';
              source: {
                type: 'base64';
                media_type: string;
                data: string;
              };
            }
        >;
      };
    }
  | {
      type: 'ask_user_question_response';
      sessionId: string;
      answers: Record<string, string>;
      questions: Array<{
        question: string;
        header?: string;
        options: Array<{ label: string; description?: string; preview?: string }>;
        multiSelect?: boolean;
      }>;
    };
```

### 关键决策

- 不再把图片写入临时目录后把路径拼进 prompt
- 不再把回答问题伪装成普通 chat text
- 不再把“当前轮 prompt”当成唯一输入实体

## 二、统一输出模型

### 设计目标

后端对前端输出唯一 transport event。这个 event 保留官方语义，不再另造一套主消息体系。

### 建议结构

```ts
type AgentTransportEvent = {
  provider: 'claude';
  sessionId: string | null;
  sdk: {
    type: 'system' | 'assistant' | 'user' | 'stream_event' | 'result';
    payload: unknown;
  };
  timestamp: string;
};
```

如果前端需要展示友好的 UI 结构，应在前端做 projection，而不是让后端把协议压扁成另一种主模型。

### 明确禁止

重构后不再以这些作为主协议：

- `stream_delta`
- `stream_end`
- `tool_use_partial`
- `permission_request`
- `tool_use_summary`
- 其他以 `NormalizedMessage.kind` 为中心的协议

这些概念如果还存在，只能是前端 view model，不应再是服务边界协议。

## 三、统一交互模型

### 工具审批

工具审批保留官方 `canUseTool` 语义，但前端协议单独定义为审批事件。

建议前端使用专门的审批事件模型：

```ts
type ToolApprovalRequest = {
  type: 'tool_approval_request';
  requestId: string;
  sessionId: string | null;
  toolName: string;
  input: unknown;
};
```

### AskUserQuestion

`AskUserQuestion` 必须与普通工具审批彻底分离。

建议定义：

```ts
type QuestionRequest = {
  type: 'question_request';
  requestId: string;
  sessionId: string | null;
  questions: Array<{
    question: string;
    header?: string;
    options: Array<{
      label: string;
      description?: string;
      preview?: string;
    }>;
    multiSelect?: boolean;
  }>;
};
```

对应应答结构必须贴近官方：

```ts
type QuestionResponse = {
  type: 'question_response';
  requestId: string;
  sessionId: string;
  questions: QuestionRequest['questions'];
  answers: Record<string, string>;
};
```

### 原则

- 工具审批是 allow / deny
- 问题回答是 questions / answers
- 不再把这两者统一叫 `permission_request`

## 四、structured output 正式化

### 设计目标

structured output 不再只是 `result` 里的附带字段，而是正式产品能力。

### 请求能力

请求侧允许显式声明：

```ts
type OutputFormatConfig = {
  type: 'json_schema';
  schema: Record<string, unknown>;
};
```

### 结果能力

结果统一保留：

- `result`
- `subtype`
- `structured_output`
- `modelUsage`
- `usage`

前端需要有专门的 structured output card，不再把它当普通文本结果附带展示。

## 五、/api/agent 重做

当前 `/api/agent` 有明显历史遗留，不适合继续修补。

### 新原则

`/api/agent` 直接基于统一的新协议重做，不兼容旧返回格式。

### 流式模式

仅返回：

- 新版 `AgentTransportEvent`
- GitHub branch / PR 相关事件
- done / error 事件

### 非流式模式

仅返回：

```ts
type AgentRunResponse = {
  success: boolean;
  sessionId: string | null;
  result?: string;
  resultSubtype?: string;
  structuredOutput?: unknown;
  usage?: unknown;
  modelUsage?: unknown;
  branch?: unknown;
  pullRequest?: unknown;
  error?: string;
};
```

### 明确删除

- 不再从旧 `claude-response` 中提取 assistant messages
- 不再维护旧 `ResponseCollector` 思路
- 不再让 `/api/agent` 输出历史包装协议

## 明确删除项

本次一刀切重构应删除以下内容：

1. 图片临时文件拼接 prompt 的逻辑
2. 以 `NormalizedMessage.kind` 为核心的主传输协议
3. 把 `AskUserQuestion` 伪装成 permission request 的逻辑
4. `/api/agent` 中依赖旧 `claude-response` 的收集逻辑
5. `patch-ask-user-question-limit.mjs`
6. `postinstall` 中对 SDK 的 patch 行为
7. 所有仅为兼容旧协议存在的前端映射逻辑

## 代码层面的重构范围

本次重构应视为协议级重构，不是局部修补，建议覆盖以下区域：

### 后端

- `server/claude-sdk.js`
- `server/providers/claude/adapter.js`
- `server/providers/types.js`
- `server/routes/agent.js`
- 与 WebSocket 写入相关的会话管理逻辑
- 与 `AskUserQuestion`、Todo、tool preview 相关的适配代码

### 前端

- chat WebSocket 消息接收层
- chat store
- permission / question UI
- session 消息投影层
- result / structured output 展示层
- pending user message / reconnect 相关状态逻辑

### 配置与脚本

- `package.json` 中的 `postinstall`
- `scripts/patch-ask-user-question-limit.mjs`

## 一次性验收标准

只有同时满足以下条件，这次一刀切重构才算完成：

1. 主聊天基于 streaming input 工作。
2. 图片可通过官方 content block 正常发送和理解。
3. 前端只消费一套正式 transport protocol。
4. `AskUserQuestion` 与审批 UI 完全分离。
5. structured output 可以从请求到展示完整跑通。
6. `/api/agent` 不再依赖旧包装协议。
7. 代码库中不存在 SDK patch。
8. 不再有旧协议兼容分支或双轨逻辑。

## 建议实施顺序

虽然是“一刀切”，但实际编码仍要有内部执行顺序。建议按下面顺序组织开发，而不是按模块乱改。

1. 先定义新的统一协议和前后端类型
2. 再重写后端输入链路
3. 再重写后端输出链路
4. 再重写前端消息接收与 store
5. 再重做审批和问答交互
6. 再重做 `/api/agent`
7. 最后删除旧逻辑、patch 和遗留脚本

注意，这里的“顺序”只是实现顺序，不代表保留兼容状态。最终合入时必须是完整切换后的代码，不允许半新半旧。

## 风险点

本次重构的主要风险不是功能缺失，而是“看起来能跑，但协议边界没真正收干净”。需要重点避免：

- 后端虽然改了，但前端还在偷偷依赖旧字段
- `AskUserQuestion` UI 换了，提交流程还是旧协议
- 图片表面能上传，底层仍然在拼 prompt
- `/api/agent` 新外壳下仍是旧收集逻辑
- 删除 patch 后，前端却仍按 8 个选项渲染

所以本次验收必须以“是否彻底删除旧思路”为核心，而不是只看页面是否能显示。

## 官方参考

- Agent loop: https://code.claude.com/docs/en/agent-sdk/agent-loop
- Streaming input vs single mode: https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode
- User input and approvals: https://code.claude.com/docs/en/agent-sdk/user-input
- Streaming output: https://code.claude.com/docs/en/agent-sdk/streaming-output
- Structured outputs: https://code.claude.com/docs/en/agent-sdk/structured-outputs

## 下一步

这份文档确定之后，下一步不应该再继续讨论“要不要兼容”，而是直接进入实现准备。

建议下一步直接做两件事：

1. 把这份方案再收敛成具体的开发任务清单
2. 直接开始代码级一刀切重构

如果继续推进，我下一步可以直接帮你产出：

- 重构任务拆解清单
- 新协议 TypeScript 类型草案
- 第一批要删和要改的文件列表

