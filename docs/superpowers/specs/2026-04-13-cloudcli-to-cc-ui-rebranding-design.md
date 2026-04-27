# CloudCLI → CC UI 品牌重命名设计

**日期**: 2026-04-13
**作者**: Claude
**状态**: 已批准

## 概述

将项目中所有 "cloudcli" 相关信息替换为 "CC UI"，同时保持 NPM 包名不变以确保向后兼容。

## 替换规则

| 原始内容 | 替换为 | 说明 |
|---------|--------|------|
| `bin: { "cloudcli": ... }` | `bin: { "ccui": ... }` | CLI 命令名称 |
| `cloudcli start/status/help/version` | `ccui start/status/help/version` | 命令行提示文档 |
| `cloudcli.ai` | *(移除)* | URL 域名引用 |
| `@cloudcli-ai/cloudcli` | *(保持不变)* | NPM 包名 |
| "CloudCLI" / "cloudcli" | "CC UI" | 显示文本 |
| "cloudcli-ai" org 引用 | *(移除)* | GitHub org 引用 |

## 需要修改的文件

### 核心配置
- `package.json` - bin 字段, homepage
- `.env.example` - 命令提示文本
- `.gitmodules` - submodule URL

### 服务端
- `server/cli.js` - CLI 入口文件名引用
- `server/index.js` - 可能有日志/提示文本

### 重定向包
- `redirect-package/package.json` - 包引用
- `redirect-package/README.md` - 文档引用
- `redirect-package/bin.js` - 导入路径
- `redirect-package/index.js` - 导入路径

### Docker
- `docker/shared/start-cloudcli.sh` - 脚本名和内容
- `docker/README.md` - 文档引用
- `docker/*/Dockerfile` - 可能的引用

### 文档
- `docs/superpowers/plans/*.md` - 历史文档中的引用

### Release 包
- `release/windows-lite/package.json` - 包引用
- `release/windows-lite/server/*.js` - 可能的引用

## 排除模式（不替换）

以下内容保持不变：

1. **NPM 包导入**: `@cloudcli-ai/cloudcli`
2. **Scope 包**: `@cloudcli-ai/` 开头

## 验证步骤

1. 搜索确认残留: `grep -ri "cloudcli" . --exclude-dir=node_modules --exclude-dir=.git`
2. 测试 CLI: 确认 `ccui start` 能正常工作
3. 构建测试: `npm run build` 成功
4. 类型检查: `npm run typecheck` 通过

## 风险评估

- **低风险**: 文本替换不影响功能逻辑
- **向后兼容**: NPM 包名保持不变，现有导入不受影响
- **CLI 命令变更**: 用户需要使用新命令 `ccui` 而非 `cloudcli`
