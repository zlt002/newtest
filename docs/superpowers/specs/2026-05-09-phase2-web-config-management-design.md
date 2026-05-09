# 第二阶段：Claude 运行配置的网页管理台

## 目标

CC UI 应该让用户可以直接在网页里维护本地 Claude Code 运行配置，日常配置工作不再依赖 Claude Code CLI。

第二阶段建立在第一阶段的 Lite 非 CLI 依赖能力之上。第一阶段已经证明 CC UI 可以读写 JSON 配置文件，可以把 Lite 插件和 Claude CLI 插件解析成 Claude Agent SDK 可用的参数，也可以在设置页展示 MCP 和插件。第二阶段要把这些后端能力变成真正可用的网页管理入口。

产品目标是：

- 网页 UI 是主要管理入口。
- Claude Agent SDK 继续作为运行时。
- Claude 兼容配置文件继续作为和 Claude Code CLI 打通的桥梁。
- Claude Code CLI 保持兼容，但不是必需依赖。

## 不做的范围

第二阶段暂不做远程插件市场安装。

这一阶段不会做：

- 从远程 marketplace 安装插件。
- 发布插件。
- 从 marketplace 自动更新插件。
- 完整复刻 Claude Code CLI 的所有交互诊断界面。
- 删除不是 CC UI 创建的 Claude CLI 插件缓存目录。
- 保存后在网页明文回显密钥。

远程插件安装、插件更新、远程来源信任控制，应该放到本地配置管理稳定之后的后续阶段。

## 用户结果

第二阶段完成后，用户可以：

- 在网页里新增、编辑、删除 MCP 服务器。
- 不通过 `claude mcp` 管理 user、project、local 作用域的 MCP。
- 在一个列表里查看 Claude CLI 已安装插件和 Lite 管理插件。
- 通过网页导入本地插件目录。
- 在来源可写时，通过网页启用或停用插件。
- 通过网页移除 Lite 管理的插件。
- 查看来自 user、project、plugin 来源的 skills 和 commands。
- 创建、编辑、删除 user/project 级别的 skills 和 commands。
- 以只读方式查看插件提供的 skills 和 commands。
- 从同一个 Claude 设置区域进入 hooks 管理。
- 在网页里配置 Claude 运行时的环境变量、模型和权限设置。
- 看清楚每个配置项来自哪个文件。

## 信息架构

Claude / 智能体设置区域应该升级成运行配置管理台，包含这些部分：

1. 账号与运行配置
2. 权限
3. MCP
4. 插件
5. Skills
6. Commands
7. Hooks

当前的 `AgentsSettingsTab.tsx` 不应该继续无限变大。第二阶段需要把设置页拆成更小的区块和共享 hooks：

- `ClaudeRuntimeSettingsSection`
- `McpManagementSection`
- `PluginManagementSection`
- `SkillManagementSection`
- `CommandManagementSection`
- `HooksEntrySection`

现有 hooks 页面可以继续作为详细编辑器。Claude 设置页只需要展示一个简洁的生效摘要，并跳转到已有 hooks 编辑页面。

## 数据模型

### 来源信息

返回给 UI 的每个条目都应该带来源信息：

```ts
type ManagedSource = {
  kind: "user" | "project" | "local" | "legacy" | "lite" | "cli" | "plugin";
  path: string;
  writable: boolean;
  reason?: string;
};
```

`writable` 表示 CC UI 可以安全地通过 JSON 或文件服务修改这个条目。插件提供的条目通常是只读的。

### MCP 条目

```ts
type ManagedMcpServer = {
  id: string;
  name: string;
  scope: "user" | "project" | "local" | "legacy";
  type: "stdio" | "http" | "sse";
  source: ManagedSource;
  config: {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
  };
  enabled: boolean;
};
```

### 插件条目

```ts
type ManagedPlugin = {
  id: string;
  name: string;
  version?: string;
  path: string;
  enabled: boolean;
  source: ManagedSource;
  sdkResolved: boolean;
  removable: boolean;
};
```

CLI 插件只有在启用状态写在 `~/.claude/settings.json` 时，才允许通过网页启用或停用。第二阶段不删除 CLI 管理的插件缓存目录。

Lite 插件通过 `~/.ccui/lite-registry.json` 管理，可以启停，也可以移除 registry 条目。

### Skill 和 Command 条目

```ts
type ManagedCapability = {
  id: string;
  type: "skill" | "command";
  name: string;
  description?: string;
  path: string;
  source: ManagedSource;
  pluginId?: string;
  editable: boolean;
  enabled: boolean;
};
```

user/project 级别的 skills 和 commands 是可编辑的 Markdown 文件。插件提供的 skills 和 commands 是只读的。

## 后端架构

第二阶段应该增加统一的管理层，而不是让 UI 直接拼接多个互不相关的路由。

### ClaudeRuntimeConfigService

职责：

- 读取和写入 `~/.claude/settings.json`。
- 管理这些运行时环境变量：
  - `ANTHROPIC_AUTH_TOKEN`
  - `ANTHROPIC_API_KEY`
  - `ANTHROPIC_BASE_URL`
  - `ANTHROPIC_MODEL`
  - `ANTHROPIC_DEFAULT_HAIKU_MODEL`
  - `ANTHROPIC_DEFAULT_SONNET_MODEL`
  - `ANTHROPIC_DEFAULT_OPUS_MODEL`
  - `ANTHROPIC_REASONING_MODEL`
- 管理当前项目已支持的权限默认值。
- 密钥只返回是否已配置，例如 `configured: true`，不返回明文。
- 保留 settings 文件里的未知字段。

### McpConfigService

第一阶段已经创建核心服务。第二阶段需要继续补齐：

- 校验待保存 MCP 配置的接口。
- 面向 UI 的列表结构，带来源信息和 `writable` 字段。
- 稳定给 UI 使用的新增、编辑、删除接口。
- 跨作用域重名检测。
- env 和 headers 使用结构化键值对编辑器，减少手写 JSON 出错。

### PluginManagementService

职责：

- 从 `~/.ccui/lite-registry.json` 列出 Lite 管理插件。
- 从 `~/.claude/plugins/installed_plugins.json` 列出 CLI 已安装插件。
- 从 `~/.claude/settings.json.enabledPlugins` 读取启用状态。
- 合并成统一的 `ManagedPlugin[]`。
- 把本地插件目录导入 Lite registry。
- 启用或停用 Lite 插件。
- 通过更新 `enabledPlugins` 启用或停用 CLI 插件。
- 从 Lite registry 移除 Lite 插件。
- 生成 Claude Agent SDK 可用的插件参数。

删除规则：

- 删除 Lite 插件时，移除 Lite registry 条目。
- 删除 CLI 插件时，第二阶段只做停用，并返回 `removed: false, disabled: true`。不删除 CLI 管理的缓存目录。

### CapabilityCatalogService

职责：

- 扫描 user 级 skills 和 commands。
- 扫描 project 级 skills 和 commands。
- 扫描已启用插件目录里的 skills 和 commands。
- 解析 `SKILL.md` 的 frontmatter，或解析标题、描述。
- 解析 command Markdown 元数据。
- 返回统一的 `ManagedCapability[]`。
- 创建、编辑、删除 user/project 来源的 skills 和 commands。

初始扫描路径：

- 用户 commands：`~/.claude/commands/**/*.md`
- 项目 commands：`<project>/.claude/commands/**/*.md`
- 用户 skills：`~/.claude/skills/**/SKILL.md`
- 项目 skills：`<project>/.claude/skills/**/SKILL.md`
- 插件 skills/commands：由 `PluginManagementService` 解析出的已启用插件路径

服务不要假设只有一个生态目录。如果当前项目里也有 `.codex/skills` 或 `.agents/skills`，第二阶段可以把它们显示为只读或外部来源，但主要写入目标应保持 Claude 兼容路径。

### Hooks 整合

仓库里已经有 hooks 发现、总览、生效视图、来源详情、修改路由和 hooks 页面。第二阶段应该整合，而不是重写。

需要做：

- 在 Claude 设置里增加简洁的 Hooks 区块。
- 展示生效 hook 来源，以及可写/只读状态。
- 跳转到现有 hooks 编辑和来源详情页面。
- 插件提供的 hooks 保持只读。

## API 形状

### 运行配置

```text
GET   /api/claude-config/runtime
PATCH /api/claude-config/runtime
```

### MCP

复用并完善第一阶段路由：

```text
GET    /api/mcp/config/read
POST   /api/mcp/config
PATCH  /api/mcp/config/:name
DELETE /api/mcp/config/:name
POST   /api/mcp/config/validate
```

### 插件

扩展第一阶段路由：

```text
GET    /api/plugins
POST   /api/plugins/import-directory
PATCH  /api/plugins/:id
DELETE /api/plugins/:id
POST   /api/plugins/reload
```

`DELETE /api/plugins/:id` 的行为：

- Lite 插件：移除 registry 条目。
- CLI 插件：只停用，返回 `removed: false, disabled: true`，除非这个插件同时是 Lite 管理插件。

### 能力目录

```text
GET    /api/capabilities?type=skill|command&projectPath=...
POST   /api/capabilities
GET    /api/capabilities/:id
PATCH  /api/capabilities/:id
DELETE /api/capabilities/:id
```

ID 应该稳定、URL 安全，并包含来源类型和相对路径。

## UI 设计

### MCP 区块

MCP 区块从只读卡片升级成管理列表：

- 新增 MCP 按钮。
- 可写条目显示编辑和删除操作。
- 作用域标签。
- 类型标签。
- 来源路径展开显示。
- 同名 MCP 跨作用域重复时显示提醒。
- 表单模式：
  - stdio：command、args、env
  - http/sse：url、headers

### 插件区块

插件区块在一个列表里展示两类插件：

- Lite 管理插件。
- CLI 发现插件。

每行展示：

- 名称或 ID。
- 版本。
- 来源标签：Lite 或 CLI。
- SDK 是否已加载。
- 路径。
- 来源可写时显示启用/停用操作。
- Lite 管理插件显示移除操作。

操作：

- 导入本地目录。
- 启用/停用。
- 移除 Lite 插件。
- 重载活跃会话；不支持重载的会话显示为信息提示，不作为错误。

### Skills 区块

Skills 区块展示：

- 搜索和过滤。
- 来源过滤：user、project、plugin、external。
- 新建 skill 按钮。
- 插件 skill 显示只读标签。
- 描述预览。
- 查看/编辑抽屉。

新建默认目标：

- 默认新建到用户级 skill。
- 选中项目时可以新建到项目级 skill。

### Commands 区块

Commands 区块和 Skills 区块类似，但创建的是 command Markdown 文件。

命令名称展示时规范成 slash-command 风格，文件名要保持安全、可预测。

### 运行配置区块

运行配置区块包含：

- API auth token / API key 是否已配置。
- Base URL。
- 模型字段。
- 权限模式。
- 保存按钮。
- 已配置密钥的清除按钮。

密钥输入框不回填已保存的明文密钥。

## 错误处理

所有修改接口都应该返回统一结构：

```json
{
  "success": false,
  "message": "给用户看的错误信息",
  "error": "需要时给调试用的细节"
}
```

UI 应该区分：

- 校验错误。
- 只读来源。
- 文件解析错误。
- 运行时不支持重载。
- 已保存，但需要新会话才生效。

插件重载不支持是信息提示，不是硬错误。

## 测试策略

后端测试：

- 运行配置读写和密钥遮罩。
- MCP 按作用域新增、编辑、删除。
- 插件列表合并 Lite 和 CLI 来源。
- Lite 和 CLI 插件启用/停用。
- Lite 插件移除。
- user/project/plugin 来源的 skills 和 commands 扫描。
- user/project 来源的能力创建、编辑、删除。
- 插件来源只读修改拒绝。

前端/source 测试：

- 设置 UI 使用非 CLI 路由。
- MCP 区块暴露新增、编辑、删除控件。
- 插件区块暴露导入、启用、停用、移除控件。
- Skills 和 Commands 区块暴露创建、编辑、删除控件。
- 运行配置区块遮罩密钥。
- Hooks 区块跳转到现有 hooks 页面。

构建验证：

- `npm run build`

## 实施顺序

第二阶段按小块实施：

1. 运行配置服务和 UI。
2. 基于第一阶段服务完成 MCP 管理 UI。
3. 扩展插件管理服务和 UI 操作。
4. 增加 skills 和 commands 的能力目录服务。
5. 完成 skills 和 commands 管理 UI。
6. 整合 hooks 设置入口。
7. 最终验证和手动验收说明。

每个小块都应该可以单独评审和测试。

## 验收标准

第二阶段完成时应满足：

- 用户可以在网页里配置 API、Base URL 和模型。
- 用户可以不通过 CLI，在网页里新增、编辑、删除 MCP。
- 用户可以在网页里导入本地插件目录。
- 用户可以在安全范围内启用/停用 Lite 和 CLI 发现插件。
- 用户可以在网页里移除 Lite 管理插件。
- 用户可以列出、创建、编辑、删除 user/project skills。
- 用户可以列出、创建、编辑、删除 user/project commands。
- 插件提供的 skills、commands、hooks 可见，并标记为只读。
- Claude 设置里可以进入 hooks 管理。
- 现有 CLI 配置保持可读和兼容。
- 核心管理操作不调用 `claude` 命令。
