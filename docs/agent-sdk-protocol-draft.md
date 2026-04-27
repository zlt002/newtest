# Agent SDK 官方化协议草案

## 目标

这份文档定义一刀切重构后的唯一协议草案，作为前后端共享的边界契约。

设计目标：

- 最大限度贴近官方 Agent SDK 语义
- 最小化应用层自定义字段
- 明确区分 SDK 原生消息与应用级控制事件
- 明确区分普通聊天输入、审批响应和问答响应

## 协议原则

### 1. SDK 原生消息不再被压扁成另一套主协议

后端可以增加统一包裹层，但不能把原生消息重新设计成另一套中心语义。

### 2. 应用层事件只用于补充 SDK 不直接提供的能力

例如：

- 连接就绪
- 运行开始 / 结束
- GitHub branch / PR 附加事件

而不是用来替代 SDK 原生消息。

### 3. 审批与问题必须是两类独立协议

不能再混成一种 request / response。

## 顶层协议

## 一、前端 -> 后端

前端向后端发送的事件统一定义为：

```ts
type ClientToServerEvent =
  | ChatRunStartEvent
  | ChatUserMessageEvent
  | ToolApprovalResponseEvent
  | QuestionResponseEvent
  | ChatInterruptEvent
  | ChatReconnectEvent;
```

## 二、后端 -> 前端

后端向前端发送的事件统一定义为：

```ts
type ServerToClientEvent =
  | AgentLifecycleEvent
  | AgentSdkMessageEvent
  | ToolApprovalRequestEvent
  | QuestionRequestEvent
  | AgentErrorEvent
  | GitIntegrationEvent;
```

## 前端 -> 后端协议

## 1. 启动运行

```ts
type ChatRunStartEvent = {
  type: 'chat_run_start';
  sessionId: string | null;
  projectPath: string;
  model?: string;
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
  message: UserContent;
  outputFormat?: OutputFormatConfig;
};
```

说明：

- `sessionId === null` 表示新会话
- `message` 是第一条用户输入
- 不再传“拼好的 prompt 字符串”

## 2. 追加用户消息

```ts
type ChatUserMessageEvent = {
  type: 'chat_user_message';
  sessionId: string;
  message: UserContent;
};
```

说明：

- 用于多轮对话
- 用于中途继续追问
- 用于 streaming input 模式下的自然追加

## 3. 工具审批响应

```ts
type ToolApprovalResponseEvent = {
  type: 'tool_approval_response';
  sessionId: string;
  requestId: string;
  decision: 'allow' | 'deny';
  rememberEntry?: string;
  updatedInput?: unknown;
  message?: string;
};
```

说明：

- 仅用于普通工具审批
- 不用于 `AskUserQuestion`

## 4. 问题回答响应

```ts
type QuestionResponseEvent = {
  type: 'question_response';
  sessionId: string;
  requestId: string;
  questions: QuestionSpec[];
  answers: Record<string, string>;
};
```

说明：

- 严格保留 questions
- answers 的 key 必须是 question 文本

## 5. 中断运行

```ts
type ChatInterruptEvent = {
  type: 'chat_interrupt';
  sessionId: string;
};
```

## 6. 会话重连

```ts
type ChatReconnectEvent = {
  type: 'chat_reconnect';
  sessionId: string;
};
```

## 用户消息内容模型

```ts
type UserContent = {
  role: 'user';
  content: string | UserContentBlock[];
};

type UserContentBlock =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image';
      source: {
        type: 'base64';
        media_type: string;
        data: string;
      };
    };
```

说明：

- 如果只有文本，可直接传 string
- 如果有图片，统一传 block array

## 后端 -> 前端协议

## 1. 生命周期事件

```ts
type AgentLifecycleEvent = {
  type: 'agent_lifecycle';
  sessionId: string | null;
  phase:
    | 'run_started'
    | 'session_created'
    | 'run_completed'
    | 'run_interrupted'
    | 'reconnected';
  timestamp: string;
  data?: Record<string, unknown>;
};
```

用途：

- 表示应用层运行状态
- 不替代 SDK 原生消息

## 2. SDK 原生消息事件

```ts
type AgentSdkMessageEvent = {
  type: 'agent_sdk_message';
  sessionId: string | null;
  timestamp: string;
  sdkMessage: SdkMessageEnvelope;
};
```

其中：

```ts
type SdkMessageEnvelope =
  | {
      sdkType: 'system';
      payload: unknown;
    }
  | {
      sdkType: 'assistant';
      payload: unknown;
    }
  | {
      sdkType: 'user';
      payload: unknown;
    }
  | {
      sdkType: 'stream_event';
      payload: unknown;
    }
  | {
      sdkType: 'result';
      payload: {
        result?: string;
        subtype?: string;
        structured_output?: unknown;
        usage?: unknown;
        modelUsage?: unknown;
        total_cost_usd?: number | null;
        [key: string]: unknown;
      };
    };
```

说明：

- 这是新的主消息协议
- 前端围绕它做 projection
- 不再让 `NormalizedMessage.kind` 做主协议

## 3. 工具审批请求

```ts
type ToolApprovalRequestEvent = {
  type: 'tool_approval_request';
  sessionId: string | null;
  timestamp: string;
  requestId: string;
  toolName: string;
  input: unknown;
};
```

## 4. 问题请求

```ts
type QuestionRequestEvent = {
  type: 'question_request';
  sessionId: string | null;
  timestamp: string;
  requestId: string;
  questions: QuestionSpec[];
};
```

## 5. 错误事件

```ts
type AgentErrorEvent = {
  type: 'agent_error';
  sessionId: string | null;
  timestamp: string;
  error: {
    code?: string;
    message: string;
    details?: string;
  };
};
```

## 6. Git 集成事件

```ts
type GitIntegrationEvent =
  | {
      type: 'git_branch_created';
      sessionId: string | null;
      timestamp: string;
      branch: {
        name: string;
        url?: string;
      };
    }
  | {
      type: 'git_pr_created';
      sessionId: string | null;
      timestamp: string;
      pullRequest: {
        number: number;
        url: string;
      };
    };
```

## 问题模型

```ts
type QuestionSpec = {
  question: string;
  header?: string;
  options: QuestionOptionSpec[];
  multiSelect?: boolean;
};

type QuestionOptionSpec = {
  label: string;
  description?: string;
  preview?: string;
};
```

说明：

- `preview` 仅在 SDK 提供时存在
- 前端必须能处理无 `preview`

## structured output 模型

```ts
type OutputFormatConfig = {
  type: 'json_schema';
  schema: Record<string, unknown>;
};
```

后端 result payload 中应保留：

```ts
type ResultPayload = {
  result?: string;
  subtype?:
    | 'success'
    | 'error'
    | 'error_max_turns'
    | 'error_max_budget'
    | 'error_during_execution'
    | 'error_max_structured_output_retries'
    | string;
  structured_output?: unknown;
  usage?: unknown;
  modelUsage?: unknown;
  total_cost_usd?: number | null;
};
```

## `/api/agent` 协议草案

## 流式模式

返回 `text/event-stream`，每个事件体是：

```ts
type AgentApiStreamEvent =
  | ServerToClientEvent
  | {
      type: 'done';
      timestamp: string;
    };
```

## 非流式模式

```ts
type AgentApiResponse = {
  success: boolean;
  sessionId: string | null;
  result?: string;
  resultSubtype?: string;
  structuredOutput?: unknown;
  usage?: unknown;
  modelUsage?: unknown;
  totalCostUsd?: number | null;
  branch?: {
    name: string;
    url?: string;
  };
  pullRequest?: {
    number: number;
    url: string;
  };
  error?: string;
};
```

说明：

- 非流式模式直接返回最终结果对象
- 不再返回旧 assistant message 列表
- 不再依赖旧 `claude-response`

## 前端状态模型建议

前端不要再把 transport event 直接当 UI message。建议拆成两层：

### 1. 协议层

只接收 `ServerToClientEvent`

### 2. 视图层

投影出：

- `ChatTurn`
- `ToolApprovalCardState`
- `QuestionCardState`
- `StructuredOutputCardState`
- `ThinkingState`

这样可以把协议和展示解耦，避免后面 UI 需求变化时反过来污染协议。

## 明确废弃的旧模型

重构后，以下内容应视为废弃，不再出现在正式主链路：

1. `NormalizedMessage.kind` 作为主协议
2. `stream_delta` / `stream_end` 作为服务边界事件
3. `permission_request` 混用审批和问题
4. 图片路径拼接 prompt
5. 旧 `claude-response` 包装格式

## 下一步建议

这份协议草案确认后，建议立刻做两件事：

1. 在代码里新建正式类型文件
2. 按这份协议直接改后端输入输出主链路

不要先做“兼容层版本”的类型，否则会重新把系统带回双轨状态。

