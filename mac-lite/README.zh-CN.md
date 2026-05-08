# macOS 运行镜像说明

这个目录用于发布后的 `Mac Lite` 运行镜像。

## 使用前提

- macOS 机器已经安装 `Node.js 24`
- 机器上已经安装并登录 `Claude Code`
- 你已经拿到发布包并直接解压完成，不需要从源码仓库启动

## 正确启动方式

第一次解压后，如果系统提示 `start.command` 无法打开，可以在终端进入解压目录后执行：

```bash
chmod +x start.command stop.command
```

然后双击：

- `start.command`

启动脚本会先拉起本地 Node 服务，待服务就绪后自动打开：

- `http://127.0.0.1:3001`

如果启动失败，请查看 `logs/server.log`。

如果你想手动停止本地服务，可以双击：

- `stop.command`

## 不支持的启动方式

- 不要直接双击 `dist/index.html`

原因：

- `dist/index.html` 是给本地 HTTP 服务提供的前端入口，不是独立桌面应用
- `file://` 打开无法承载 Claude Code CLI 所需的本地服务能力

## 日志位置

服务日志会写入：

- `logs/server.log`

如果启动失败，请优先检查这个日志文件。

## 常见问题

### 双击后没有打开页面

- 先查看 `logs/server.log`
- 确认 `Node.js` 已安装并在 PATH 中可用
- 确认 `3001` 端口没有被其他程序占用
- 如遇到 macOS 权限限制，请执行 `chmod +x start.command stop.command`

### 打开了浏览器但无法对话

- 确认本机已经安装并登录 `Claude Code`
- 确认是通过 `start.command` 启动，而不是直接打开 `dist/index.html`

### 关闭浏览器后，3001 端口还在

- 这是正常现象，浏览器关闭不会自动停止本地 Node 服务
- 如需停止服务，请运行 `stop.command`

## 在线更新

Mac Lite 会检查 `cc-ui-mac-lite-arm64.zip` 是否可用。

如果更新按钮没有出现，通常说明：

- 当前更新包地址不可访问
- 或当前已经是最新可用包
- 或你正在源码开发模式下运行，而不是运行 `Mac Lite` 发布包

## 当前验证版精简内容

- 仅保留 `Claude Code`
- 已移除内置 Shell 入口
- 已移除登录/注册要求
- 已移除 Cursor / Codex / Gemini 主流程

## 出包步骤

1. 在 macOS 上执行：

   ```bash
   npm run build
   ```

2. 执行：

   ```bash
   npm run release:mac-lite:arm64:zip
   ```

3. 将生成的 zip 文件发送给 macOS 用户：

   ```text
   release/cc-ui-mac-lite-arm64.zip
   ```
