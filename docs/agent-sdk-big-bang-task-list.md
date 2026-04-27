# Agent SDK 一刀切重构任务清单

## 使用说明

这份清单服务于 [agent-sdk-big-bang-redesign.md](/C:/Users/Administrator/Desktop/ccui/cc-ui/docs/agent-sdk-big-bang-redesign.md) 的落地执行。

目标不是渐进迁移，而是一次性切换到新的官方化架构。因此这里的任务拆解强调：

- 明确删除项
- 明确唯一协议
- 明确一次性切换边界
- 避免做任何旧新双轨兼容

## 总体完成定义

只有满足以下条件，才允许认为本轮重构完成：

1. 主聊天已切换到 streaming input
2. 图片输入已切换到官方 content block
3. 前后端已统一使用新 transport protocol
4. `AskUserQuestion` 与工具审批完全分离
5. `/api/agent` 已完全重做
6. structured output 已具备完整请求和展示链路
7. 所有旧协议和 patch 已删除

## Epic 1：定义新协议与类型

### 目标

在动代码前先锁定唯一协议，避免边改边发散。

### 任务

1. 新建统一 transport event 类型定义
2. 新建 streaming input 消息类型定义
3. 新建 tool approval request / response 类型定义
4. 新建 question request / response 类型定义
5. 新建 result / structured output 类型定义
6. 新建 `/api/agent` 流式与非流式返回类型定义
7. 明确哪些字段直接透传 SDK，哪些字段属于应用层补充字段

### 产出

- 单独的协议草案文档
- 对应 TypeScript 类型文件草稿

### 完成标准

- 前后端对“唯一协议”没有歧义
- 后续改动不再引入新的历史兼容字段

## Epic 2：重写后端输入链路

### 目标

把当前“字符串 prompt 驱动”改成“会话消息流驱动”。

### 任务

1. 抽象 session 级消息输入队列
2. 改写 `queryClaudeSDK()` 的输入构造方式
3. 让用户文本输入走官方 user message
4. 让问题回答走官方 questions + answers 路径
5. 让图片输入走 content block
6. 保留中断、resume、reconnect 所需的会话控制能力
7. 删除临时文件拼 prompt 的旧逻辑

### 涉及文件

- [server/claude-sdk.js](/C:/Users/Administrator/Desktop/ccui/cc-ui/server/claude-sdk.js)

### 完成标准

- 后端不再依赖“每轮拼一个 finalCommand 字符串”
- 主聊天输入以消息流为中心

## Epic 3：重写后端输出链路

### 目标

让后端输出只保留一种正式协议，不再以 `NormalizedMessage.kind` 为主。

### 任务

1. 定义新的 `AgentTransportEvent`
2. 把 SDK 原生消息按统一结构发给前端
3. 区分 SDK 消息与系统补充事件
4. 保留 sessionId、timestamp、provider 等统一元数据
5. 删除以 `stream_delta` / `stream_end` / `tool_use_partial` 为中心的主输出逻辑
6. 只在必要时保留最小应用层事件，例如连接状态、GitHub 事件

### 涉及文件

- [server/claude-sdk.js](/C:/Users/Administrator/Desktop/ccui/cc-ui/server/claude-sdk.js)
- [server/providers/claude/adapter.js](/C:/Users/Administrator/Desktop/ccui/cc-ui/server/providers/claude/adapter.js)
- [server/providers/types.js](/C:/Users/Administrator/Desktop/ccui/cc-ui/server/providers/types.js)

### 完成标准

- 后端服务边界只存在一种正式消息协议
- 前端不再被动依赖后端 projection

## Epic 4：重做 AskUserQuestion 与工具审批

### 目标

彻底拆开两套交互模型。

### 任务

1. 后端区分 `tool_approval_request` 和 `question_request`
2. 后端区分 `tool_approval_response` 和 `question_response`
3. 前端新增独立的问题卡片组件
4. 前端新增独立的审批卡片组件
5. 问题回答严格走 `questions + answers`
6. 支持 free-text answer
7. 删除把 `AskUserQuestion` 伪装成 permission request 的逻辑

### 涉及文件

- [server/claude-sdk.js](/C:/Users/Administrator/Desktop/ccui/cc-ui/server/claude-sdk.js)
- [server/utils/ask-user-question.js](/C:/Users/Administrator/Desktop/ccui/cc-ui/server/utils/ask-user-question.js)
- 前端 chat message 渲染与交互文件

### 完成标准

- 审批与问题在协议、UI、提交逻辑上完全分离

## Epic 5：重做前端消息接收和 store

### 目标

把前端状态模型从“兼容多种历史消息”重构成“围绕新 transport protocol 建模”。

### 任务

1. 重写 chat WebSocket 消息接收层
2. 重写 chat store 的消息入库逻辑
3. 统一消息投影层
4. 重写 pending user message 的合并逻辑
5. 重写 reconnect 后的 session 同步逻辑
6. 重写 thinking / tool call / result 的前端 view model
7. 删除所有依赖旧协议字段的分支

### 涉及范围

- `src/components/chat/hooks/`
- `src/components/chat/store/`
- `src/components/chat/view/`
- `src/components/chat/types/`

### 完成标准

- 前端不再需要同时理解旧格式和新格式
- 所有聊天状态都基于新协议生成

## Epic 6：structured output 产品化

### 目标

让 structured output 变成正式产品能力。

### 任务

1. 请求侧支持 `outputFormat`
2. 后端保留 `structured_output`、`resultSubtype`、`modelUsage`
3. 前端新增 structured output card
4. 区分 text result 与 structured result
5. 补 structured output 错误态展示
6. 补复制 / 查看原始 JSON 能力

### 完成标准

- structured output 能从请求到渲染完整跑通

## Epic 7：重做 `/api/agent`

### 目标

把外部 API 完全切换到新的官方化协议。

### 任务

1. 删除旧 `ResponseCollector` 思路
2. 重写流式返回结构
3. 重写非流式返回结构
4. 统一结果中的 `result`、`structuredOutput`、`usage`
5. 重新整理 branch / PR 相关附加事件
6. 删除对旧 `claude-response` 的任何依赖
7. 明确 `permissionMode` 参数策略，不再默认隐藏式 bypass

### 涉及文件

- [server/routes/agent.js](/C:/Users/Administrator/Desktop/ccui/cc-ui/server/routes/agent.js)

### 完成标准

- `/api/agent` 完全基于新协议工作

## Epic 8：删除旧逻辑与 patch

### 目标

彻底把历史包袱清出代码库。

### 任务

1. 删除 `scripts/patch-ask-user-question-limit.mjs`
2. 删除 `package.json` 中 `postinstall` patch
3. 删除图片临时文件拼 prompt 的逻辑
4. 删除旧消息协议相关类型和工具函数
5. 删除不再使用的 adapter 映射代码
6. 删除前端历史兼容分支
7. 删除只为旧协议存在的测试

### 完成标准

- 代码库中不存在已弃用协议主路径
- 不存在 SDK patch

## Epic 9：测试与验收

### 目标

用新的协议模型建立完整回归保护。

### 必测场景

1. 新会话首轮发送文本
2. 多轮连续对话
3. 图片 + 文本混合输入
4. tool approval allow / deny
5. `AskUserQuestion` 单选
6. `AskUserQuestion` 多选
7. `AskUserQuestion` free-text
8. structured output success
9. structured output error
10. session interrupt
11. reconnect 后继续会话
12. `/api/agent` 流式模式
13. `/api/agent` 非流式模式

### 完成标准

- 所有主链路有自动化测试或最小契约测试
- 不再测试旧协议兼容行为

## 推荐执行顺序

虽然最终是一次性切换，但开发阶段建议按这个顺序推进：

1. Epic 1：定义新协议与类型
2. Epic 2：重写后端输入链路
3. Epic 3：重写后端输出链路
4. Epic 4：重做 AskUserQuestion 与审批
5. Epic 5：重做前端消息接收和 store
6. Epic 6：structured output 产品化
7. Epic 7：重做 `/api/agent`
8. Epic 8：删除旧逻辑与 patch
9. Epic 9：测试与验收

## 开工建议

建议第一个开发批次只做下面这些，作为主干：

1. 新协议类型定义
2. 后端输入重写
3. 后端输出重写

这三个完成后，系统的骨架就已经换掉了，后续前端和 `/api/agent` 重写会更顺。

