# Windows Lite 启动入口设计

## 背景

`claudecodeui-claude-only-lite-windows` 用于在 Windows 环境中交付一个可直接启动的 Claude Only Lite 验证版。

当前用户在 Windows 上误打开 `dist/index.html` 时，会以 `file://` 协议加载前端页面。由于构建产物中的静态资源使用绝对路径，例如 `/assets/...`、`/manifest.json` 和 `/favicon.svg`，浏览器会把这些路径解析到磁盘根目录，最终出现资源加载失败、CORS 报错和白屏。

同时，即使解决了静态资源路径问题，`file://` 页面本身也无法替代本地 Node 服务完成 Claude Code CLI 对话、会话管理、项目访问和流式输出。因此，`dist/index.html` 不应被视为支持的桌面入口。

## 目标

为 Windows Lite 包定义唯一且稳定的启动方式：

1. 用户双击 `windows-lite/start.vbs` 后，自动启动本地 Node 服务
2. 服务就绪后自动打开默认浏览器访问 `http://127.0.0.1:3001`
3. 用户不需要手动打开 `dist/index.html`
4. 文档和交付方式明确说明：`dist/index.html` 不是受支持的运行入口

## 非目标

本设计不覆盖以下内容：

1. 不支持 `file://` 直接打开 `dist/index.html` 后完整运行 Claude UI
2. 不为误打开 `dist/index.html` 单独增加离线壳页面或兼容逻辑
3. 不改变 Claude Only Lite 的后端能力边界
4. 不引入 Electron、Tauri 或其他桌面封装方案

## 推荐方案

采用“启动脚本拉起本地服务，再打开浏览器”的单一入口方案。

用户入口固定为 `windows-lite/start.vbs`。该脚本静默调用 `windows-lite/start.cmd`。`start.cmd` 负责校验运行条件、启动 `server/index.js`、等待本地 HTTP 服务就绪，并在确认可访问后打开默认浏览器到 `http://127.0.0.1:3001`。

此方案与现有架构一致，能够保留全部 Claude Code CLI 对话能力，同时避免用户将 `dist/index.html` 误解为桌面应用入口。

## 方案对比

### 方案 A：唯一入口为启动脚本

这是推荐方案。

优点：

1. 与当前项目结构完全一致
2. 能保留完整的 Claude Code CLI 对话能力
3. 改动范围小，风险最低
4. Windows 交付说明更清晰，用户路径更统一

缺点：

1. 需要明确教育用户不要直接打开 `dist/index.html`

### 方案 B：兼容 `file://` 打开引导页

不采用。

优点：

1. 用户误打开 `dist/index.html` 时体验更柔和

缺点：

1. 增加前端打包与运行时兼容复杂度
2. 容易继续强化“`dist/index.html` 可以作为入口”的错误心智
3. 即使打开成功，也无法在无服务情况下与 CLI 对话

### 方案 C：让 `file://` 页面直接调用 Claude Code CLI

不可取。

原因：

1. 浏览器安全模型不允许可靠地直接启动本地 CLI 进程
2. 关键功能仍需本地后端承接
3. 稳定性和可维护性都不满足交付要求

## 架构设计

### 启动链路

1. 用户双击 `windows-lite/start.vbs`
2. `start.vbs` 在后台调用 `windows-lite/start.cmd`
3. `start.cmd` 切换到项目根目录
4. `start.cmd` 检查 `dist/index.html` 是否存在
5. `start.cmd` 检查 `node` 是否可用
6. `start.cmd` 确保日志目录存在
7. `start.cmd` 启动 `server/index.js`
8. 脚本探测 `http://127.0.0.1:3001` 是否已经可访问
9. 探测成功后打开默认浏览器

### 服务职责

`server/index.js` 继续作为唯一运行时入口，负责：

1. 提供前端静态资源
2. 暴露前端所需的 API
3. 承接 Claude Code CLI 的会话与流式交互
4. 处理项目、设置和日志等本地能力

### 前端职责

`dist/index.html` 仅作为服务端静态资源入口，由 `http://127.0.0.1:3001` 提供。它不再承担“桌面双击入口”的产品职责。

## 详细行为

### 启动前检查

`start.cmd` 至少需要检查以下条件：

1. `dist/index.html` 存在
2. 系统 PATH 中存在 `node`
3. 日志目录 `windows-lite/logs` 可创建

可选增强检查：

1. `claude` 命令是否可用
2. 3001 端口是否已被占用
3. 当前机器是否满足说明文档中约定的运行前提

### 浏览器打开时机

当前脚本使用固定等待 3 秒后直接打开浏览器，这种方式在慢机器或首次启动时不稳定。

设计要求改为：

1. 启动 Node 服务后，轮询本地地址是否可访问
2. 仅在服务返回成功响应后再打开浏览器
3. 超时后给出失败提示并保留日志

### 失败处理

出现以下情况时，需要让用户可定位问题：

1. `dist/index.html` 缺失
2. 未安装 Node.js 或 PATH 未配置
3. 端口被占用导致服务无法启动
4. Claude Code 未安装或未登录，导致后续对话不可用
5. 服务启动后始终未通过可访问性探测

失败信息至少写入 `windows-lite/logs/server.log`。如果通过 `start.cmd` 启动，也应在控制台输出简明错误信息。

## 文档要求

Windows Lite 相关文档需要统一表达以下结论：

1. 正确入口是 `windows-lite/start.vbs`
2. 如需查看日志，可使用 `windows-lite/start.cmd`
3. 页面实际访问地址是 `http://127.0.0.1:3001`
4. 不支持直接双击 `dist/index.html` 作为运行入口

## 验收标准

以下条件全部满足时，视为设计完成：

1. 双击 `windows-lite/start.vbs` 后可以自动拉起服务并打开 `http://127.0.0.1:3001`
2. 浏览器只在服务真正就绪后打开
3. 依赖缺失或端口异常时，用户可在日志中定位原因
4. README 或启动说明明确写明唯一支持入口
5. 团队不再以 `dist/index.html` 是否可直接打开作为验收条件

## 测试策略

### 手工验证

1. 在依赖齐全的 Windows 环境中双击 `start.vbs`，确认页面成功打开
2. 刻意延迟服务启动，确认不会过早打开空白页
3. 移除 PATH 中的 Node，确认脚本能明确报错
4. 人为占用 3001 端口，确认脚本和日志能体现失败原因
5. 通过 `start.cmd` 启动，确认控制台和日志内容可用于排查

### 回归验证

1. 通过正常入口打开后，前端静态资源仍可正常加载
2. Claude Code CLI 会话创建与消息流转不受影响
3. 现有 Windows Lite 日志路径和打包结构保持兼容

## 实施边界

本设计后续实施应优先修改以下范围：

1. `windows-lite/start.cmd`
2. `windows-lite/start.vbs`
3. `windows-lite/README.zh-CN.md`

仅当实现细节需要时，再评估是否补充服务端健康检查或更明确的启动成功判定逻辑。
