# `/model` 命令菜单接入设计

## 背景

当前聊天输入框的 slash command 菜单由两部分数据拼接而成：

- 本地 UI 命令注册表
- Claude Agent SDK runtime catalog

官方 Claude Code 文档中存在 `/model [model]` 命令，但当前项目的 runtime catalog 展示链路并不会稳定返回这条命令，因此它不会稳定出现在现有菜单中。与此同时，项目内部已经存在：

- Claude 模型常量定义 `shared/modelConstants.js`
- 前端聊天 provider 状态 `claudeModel / setClaudeModel`
- 后端 runtime request builder 对 `model` 字段的支持

目标不是重新设计模型体系，而是在保持现有聊天架构的前提下，让 `/model` 稳定出现在菜单中，并与当前模型状态保持一致。

## 目标

- 让 slash command 菜单中始终出现 `/model`
- `/model` 在菜单分组中表现为“Claude 运行时命令”，而不是“本地命令”
- `/model` 与现有 `claudeModel` 持久化状态共用同一语义
- 不要求纯依赖官方 runtime catalog
- 不修改其他运行时命令的发现机制

## 非目标

- 不尝试让 SDK runtime catalog 自身补齐 `/model`
- 不重构现有 command menu 的分组系统
- 不在本阶段承诺“切换模型后立即影响已绑定 live session 的下一轮 run”
- 不新增新的模型来源接口

## 约束与现状

### 官方能力边界

官方文档中 `/model` 是 Claude Code 的内建命令，但当前 Agent SDK 侧暴露给本项目的 command catalog 不能保证返回这条命令。因此，“只依赖 runtime catalog”无法满足“菜单里必须出现 `/model`”这个产品要求。

### 项目现状

- 菜单列表接口为 `/api/commands/list`
- 菜单数据结构区分 `localUi`、`runtime`、`skills`
- 前端 command menu 使用 `metadata.group` 和 `sourceType/type` 决定分组展示
- 现有聊天状态已经有 `claudeModel` 持久化，但模型切换 UI 尚未接入 `ChatInputControls`

## 方案概述

采用“官方 runtime catalog 优先，本地补一条伪 runtime `/model` 命令”的方案。

核心思想：

- 继续读取官方 runtime catalog
- 如果 catalog 中已经存在 `/model`，直接使用官方返回结果
- 如果 catalog 中不存在 `/model`，由服务端 `/api/commands/list` 在返回 `runtime` 列表前补一条 `/model`
- 该命令在前端展示时归类到“Claude 运行时命令”
- 该命令在执行路径上由本地 `/api/commands/execute` 处理，以便读取和更新现有 `claudeModel` 状态

这样做可以同时满足两个要求：

- 用户菜单里始终能看到 `/model`
- 产品观感上它仍然属于 Claude 运行时命令

## 详细设计

### 1. 命令发现与注入

在 `/api/commands/list` 中保留现有 runtime catalog 拉取逻辑。

新增一段“运行时命令补洞”逻辑：

- 检查 `runtimeCatalog.runtime` 中是否已包含 `/model`
- 若包含，则原样透传
- 若不包含，则向 `runtime` 数组追加一条命令对象

建议注入对象结构：

```json
{
  "name": "/model",
  "description": "View or switch the active Claude model",
  "type": "claude-runtime",
  "sourceType": "claude-runtime",
  "metadata": {
    "group": "claude-runtime",
    "injected": true
  }
}
```

关键点：

- 逻辑上注入到 `runtime`，不是 `localUi`
- 分组标签仍然显示在“Claude 运行时命令”
- `metadata.injected` 仅用于调试或后续测试识别，不参与用户展示

### 2. 执行语义

`/model` 保持两种行为：

- `/model`
  返回当前模型和可选模型列表
- `/model <name>`
  校验模型名是否合法；合法则切换当前模型，不合法则返回错误提示

执行仍走本地 `/api/commands/execute`，原因是：

- 当前 UI 需要稳定读取当前模型
- 当前 UI 需要使用本地常量完成模型合法性校验
- 当前 UI 需要把切换结果同步到前端持久化状态

这里的“本地执行”是实现路径，不改变它在菜单中的“运行时命令”展示归属。

### 3. 前端状态同步

`/model` 的执行结果需要与现有 `claudeModel / setClaudeModel` 共用同一份状态语义。

预期行为：

- 切换成功后，更新 `localStorage('claude-model')`
- 更新当前聊天 provider state 中的 `claudeModel`
- 后续新发起的 run 使用新的 `model`

这要求后续实现时把 `setClaudeModel` 往 `ChatComposer` / `ChatInputControls` 方向继续透传，但该设计文档不要求本阶段同时完成按钮式模型切换 UI。

### 4. 与 `ChatInputControls` 的关系

`ChatInputControls.tsx:67~98` 是后续新增模型切换控件的合理落点，但这项工作与“菜单里必须出现 `/model`”是两个并列交互入口。

本设计将两者统一为同一状态源：

- slash command `/model`
- 控件式模型切换器

无论用户走哪条入口，底层都更新同一个 `claudeModel`。

### 5. 已有 session 的语义边界

本阶段明确保证：

- 新会话一定使用切换后的模型

本阶段不强制保证：

- 当前已绑定 live session 在下一轮继续发送时一定立即切到新模型

原因是当前前端对“新 run”和“继续已有 session”的发送路径并不完全一致，后者是否显式透传 `model` 仍需在实现计划中单独收口。

为避免 UI 误导，后续实现中应优先保证：

- 模型切换成功后的提示文案不要承诺“当前 live session 已立即切换”
- 如需承诺，应先补齐续跑路径的 `model` 透传

## 错误处理

- 用户输入未知模型时，返回明确错误，并附上可选模型列表
- 如果命令注入失败，不应影响其他 runtime command 展示
- 如果持久化模型状态失败，需返回“切换未保存”的错误提示，而不是静默成功

## 测试策略

至少补充以下测试：

- `/api/commands/list` 在 runtime catalog 缺少 `/model` 时会注入该命令
- `/api/commands/list` 在 runtime catalog 已包含 `/model` 时不会重复注入
- `/model` 被归类到 `claude-runtime` 分组，而不是 `local-ui`
- `/model` 无参数时返回当前模型与候选模型
- `/model <name>` 对合法模型更新状态
- `/model <name>` 对非法模型返回错误
- 前端菜单数据转换不会把注入后的 `/model` 归错组

## 风险

- “展示归类为运行时命令，但执行由本地处理”属于产品语义折中，需要在代码注释和测试中写清楚
- 如果后续官方 SDK 开始稳定返回 `/model`，注入逻辑必须避免重复
- 如果后续支持更多 provider，当前 `/model` 语义仍然默认绑定 Claude 模型集合，需要在多 provider 设计时重新审视

## 实施建议

实现顺序建议为：

1. 服务端命令列表注入 `/model`
2. 本地执行路径补齐 `/model` 的读写语义
3. 前端 provider state 衔接 `setClaudeModel`
4. 视需求再补 `ChatInputControls` 中的可视模型切换控件

## 结论

为了满足“菜单里必须出现 `/model`”这一刚性要求，本项目不能单纯依赖官方 runtime catalog。最小且稳定的方案，是在保留官方 catalog 为主数据源的前提下，由本地在 `runtime` 分组中补注入 `/model`，并让它与现有 `claudeModel` 状态共用同一套语义与持久化路径。
