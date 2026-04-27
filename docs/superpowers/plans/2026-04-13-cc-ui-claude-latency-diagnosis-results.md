# CC UI Claude 延迟与无响应排查结果

## 最终结论

`cc ui` 在 `release/windows-lite` 中“发送消息后长时间停在 Thinking / 处理中，甚至没有正文返回”的问题，不是单一性能问题，而是两类问题叠加：

1. Node 运行时兼容性问题
2. 新会话被错误当成 Claude resume 会话的问题

其中，用户体感上“连 `hi` / `1+1` 都很慢甚至没响应”的直接主因，是第 2 类问题。

## 排查过程摘要

### 1. 基线对照

- `Claude Code CLI` 直接执行 `claude -p "hi"`，约 1-2 秒返回
- 根项目开发环境 UI 发送 `hi`，也可以较快返回
- `release/windows-lite` 独立服务则会长时间停留在 `Thinking / 处理中`

这说明问题不在 Anthropic 账号、模型或项目目录本身，而在 `windows-lite` 这条中间链路。

### 2. 运行时兼容性异常

排查早期在 `windows-lite` 中先后观察到：

- `Object not disposable`
- `crypto is not defined`

这说明 `release/windows-lite` 实际运行的 Node 环境与 `@anthropic-ai/claude-agent-sdk` / Claude Code 子进程之间存在兼容性风险，错误甚至会在异常处理链路里被二次放大。

### 3. 会话恢复逻辑异常

进一步复现后确认：

- 前端新会话会先生成一个临时 `sessionId`
- 后端原来只要看到 `sessionId` 就会把请求按 resume 处理
- Claude SDK / Claude Code 的 resume 路径要求 `sessionId` 必须是合法 UUID

因此，新会话会被误送进 `--resume` 路径，导致 Claude Code 进程失败或卡住。这个问题正是用户感知“每次都慢、甚至无响应”的直接触发器。

## 具体修复

### 1. 修复 Node 运行时链路

- 新增 [server/utils/symbol-dispose-polyfill.js](../../../../server/utils/symbol-dispose-polyfill.js)，在 SDK 加载前补齐 `Symbol.dispose` / `Symbol.asyncDispose`
- 在 [server/providers/types.js](../../../../server/providers/types.js) 中显式使用 `node:crypto`，避免错误处理路径再次触发 `crypto is not defined`
- 新增 [server/utils/claude-code-runtime.js](../../../../server/utils/claude-code-runtime.js)，动态解析更合适的 Claude Code 子进程 Node 运行时，并在 [server/claude-sdk.js](../../../../server/claude-sdk.js) 中接管子进程启动

### 2. 修复新会话误 resume

- 新增 [server/utils/claude-session.js](../../../../server/utils/claude-session.js)
- 将“前端临时 `sessionId`”和“真正用于 Claude resume 的 `sessionId`”拆开处理
- 只有在显式允许 resume 且 `sessionId` 为合法 UUID 时，才把它传给 Claude SDK
- 临时 `sessionId` 继续保留给前端 trace 和新会话关联使用

### 3. 补充诊断与测试

- 新增后端延迟链路 trace 工具与测试
- 保留前端 trace，用于观察 `send_clicked -> first_thinking -> first_stream_delta`
- 为 `types`、runtime、session 解析、dispose polyfill 增加单测

## 修复后的验证结果

已完成以下验证：

- `node --test server/utils/claude-session.test.mjs server/utils/claude-latency-trace.test.mjs server/providers/types.test.mjs server/utils/symbol-dispose-polyfill.test.mjs src/components/chat/utils/latencyTrace.test.mjs`
- `npm run build`
- `npm run release:windows-lite`

此外，使用 fresh 的 `release/windows-lite` 服务进行了实际消息验证：

1. 新会话发送 `hi`
   - 服务端正确识别为 `Session: New`
   - 正常收到 `session_created`
   - 不再错误走 resume

2. 同一会话继续发送 `1+1`
   - 可以正常 resume
   - 返回结果 `2`

因此，本次“发送消息很慢 / 一直处理中 / 无响应”的核心问题已修复。

## 对原始问题的回答

“为什么我在 cc ui 里面发送消息很久才有回应，但是我直接在 Claude code cli 上面发送消息很快？”

最接近事实的答案是：

- 不是 CLI 单纯更快
- 而是 `release/windows-lite` 中的 CC UI 后端链路当时没有稳定地把新消息作为“新会话”送进 Claude SDK
- 同时旧 Node 运行时还放大了 Claude SDK 的异常
- CLI 没经过这条有问题的中间层，所以体感明显更快

## 当前遗留问题

1. Windows 兼容目前是“代码层面已考虑”，但还没有在真实 Windows 环境完成端到端实机验证
2. 当前 Node runtime 解析逻辑不依赖固定安装目录，但仍建议后续补一组更明确的 Windows 路径测试
3. 前端 trace 已可用，但如果要做严格的首 token 性能对比，仍建议在真实 Windows 发布环境再做一次完整对照实验
