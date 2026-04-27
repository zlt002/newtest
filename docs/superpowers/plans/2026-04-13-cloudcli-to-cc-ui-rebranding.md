# CloudCLI → CC UI 品牌重命名实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将项目中所有 "cloudcli" 相关信息替换为 "CC UI"，同时保持 NPM 包名不变以确保向后兼容。

**Architecture:** 使用混合方案进行替换 — 批量字符串替换配合手动排除特定模式（NPM 包名 `@cloudcli-ai/cloudcli` 保持不变）。

**Tech Stack:** Node.js 项目，修改内容包括 JSON 配置文件、Shell 脚本、JavaScript 文件和 Markdown 文档。

---

## 文件结构映射

| 文件路径 | 修改内容 |
|---------|---------|
| `package.json` | bin 字段: `cloudcli` → `ccui` |
| `server/cli.js` | 命令提示文本: `cloudcli` → `ccui` |
| `.env.example` | 命令提示文本 |
| `.gitmodules` | submodule URL: 移除或更新 |
| `docker/shared/start-cloudcli.sh` | 命令调用: `cloudcli` → `ccui` |
| `docker/shared/install-cloudcli.sh` | 保持不变（仅安装） |
| `docker/*/Dockerfile` | 文件名引用更新 |
| `docker/README.md` | 文档内容更新 |
| `redirect-package/*` | 包引用和文档更新 |
| `release/windows-lite/package.json` | bin 字段更新 |

---

## Task 1: 修改主 package.json 的 bin 字段

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 修改 bin 字段**

```json
// 原内容:
"bin": {
  "cloudcli": "server/cli.js"
}

// 修改为:
"bin": {
  "ccui": "server/cli.js"
}
```

使用 Edit 工具进行精确替换。

- [ ] **Step 2: 验证修改**

```bash
cat package.json | grep -A2 '"bin"'
```

Expected output:
```
"bin": {
  "ccui": "server/cli.js"
}
```

- [ ] **Step 3: 提交**

```bash
git add package.json
git commit -m "chore: rename CLI command from cloudcli to ccui"
```

---

## Task 2: 修改 server/cli.js 中的命令提示

**Files:**
- Modify: `server/cli.js`

- [ ] **Step 1: 替换 status 命令中的 cloudcli 引用**

找到第 134-136 行，将：
```javascript
console.log(`      ${c.dim('>')} Use ${c.bright('cloudcli --port 8080')} to run on a custom port`);
console.log(`      ${c.dim('>')} Use ${c.bright('cloudcli --database-path /path/to/db')} for custom database`);
console.log(`      ${c.dim('>')} Run ${c.bright('cloudcli help')} for all options`);
```

替换为：
```javascript
console.log(`      ${c.dim('>')} Use ${c.bright('ccui --port 8080')} to run on a custom port`);
console.log(`      ${c.dim('>')} Use ${c.bright('ccui --database-path /path/to/db')} for custom database`);
console.log(`      ${c.dim('>')} Run ${c.bright('ccui help')} for all options`);
```

- [ ] **Step 2: 替换 help 命令中的 Usage 部分**

找到第 147-150 行，将：
```javascript
Usage:
  claude-code-ui [command] [options]
  cloudcli [command] [options]
```

替换为：
```javascript
Usage:
  ccui [command] [options]
```

- [ ] **Step 3: 替换 help 命令中的 Examples 部分**

找到第 164-169 行，将：
```javascript
  $ cloudcli                        # Start with defaults
  $ cloudcli --port 8080            # Start on port 8080
  $ cloudcli -p 3000                # Short form for port
  $ cloudcli start --port 4000      # Explicit start command
  $ cloudcli status                 # Show configuration
```

替换为：
```javascript
  $ ccui                            # Start with defaults
  $ ccui --port 8080                # Start on port 8080
  $ ccui -p 3000                    # Short form for port
  $ ccui start --port 4000          # Explicit start command
  $ ccui status                     # Show configuration
```

- [ ] **Step 4: 替换 update 命令中的提示**

找到第 211 行，将：
```javascript
console.log(`         Run ${c.bright('cloudcli update')} to update\n`);
```

替换为：
```javascript
console.log(`         Run ${c.bright('npm update -g @cloudcli-ai/cloudcli')} to update\n`);
```

找到第 239 行，将：
```javascript
console.log(`${c.ok('[OK]')} Update complete! Restart cloudcli to use the new version.`);
```

替换为：
```javascript
console.log(`${c.ok('[OK]')} Update complete! Restart ccui to use the new version.`);
```

- [ ] **Step 5: 替换 main 函数中的错误提示**

找到第 321 行，将：
```javascript
console.log('   Run "cloudcli help" for usage information.\n');
```

替换为：
```javascript
console.log('   Run "ccui help" for usage information.\n');
```

- [ ] **Step 6: 验证修改**

```bash
grep -n "cloudcli" server/cli.js
```

Expected output: 只有 `@cloudcli-ai/cloudcli` 的引用保留。

- [ ] **Step 7: 提交**

```bash
git add server/cli.js
git commit -m "chore: update CLI help text to use ccui command"
```

---

## Task 3: 修改 .env.example 文件

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: 替换命令提示文本**

将第 4 行：
```
# TIP: Run 'cloudcli status' to see where this file should be located
```

替换为：
```
# TIP: Run 'ccui status' to see where this file should be located
```

将第 9-12 行：
```
#   claude-code-ui    - Start the server (default)
#   cloudcli start    - Start the server
#   cloudcli status   - Show configuration and data locations
#   cloudcli help     - Show help information
#   cloudcli version  - Show version information
```

替换为：
```
#   ccui              - Start the server (default)
#   ccui start        - Start the server
#   ccui status       - Show configuration and data locations
#   ccui help         - Show help information
#   ccui version      - Show version information
```

- [ ] **Step 2: 验证修改**

```bash
grep -n "cloudcli" .env.example
```

Expected output: 无匹配结果（所有 cloudcli 已替换）

- [ ] **Step 3: 提交**

```bash
git add .env.example
git commit -m "chore: update .env.example command references to ccui"
```

---

## Task 4: 更新 .gitmodules

**Files:**
- Modify: `.gitmodules`

- [ ] **Step 1: 移除或更新 submodule URL**

将第 3 行：
```
url = https://github.com/cloudcli-ai/cloudcli-plugin-starter.git
```

选项 A - 移除 submodule（如果不再使用）：
删除整个 `[submodule "plugins/starter"]` 段落

选项 B - 更新为新的组织（如果存在）：
替换为新的 URL

选项 C - 保持不变（如果暂时不需要修改）

根据实际情况选择。对于本任务，选择**移除 submodule**：

删除第 1-4 行：
```
[submodule "plugins/starter"]
	path = plugins/starter
	url = https://github.com/cloudcli-ai/cloudcli-plugin-starter.git
```

- [ ] **Step 2: 验证修改**

```bash
cat .gitmodules
```

Expected output: 文件为空或仅包含注释。

- [ ] **Step 3: 提交**

```bash
git add .gitmodules
git commit -m "chore: remove cloudcli-ai submodule reference"
```

---

## Task 5: 更新 docker/shared/start-cloudcli.sh

**Files:**
- Modify: `docker/shared/start-cloudcli.sh`

- [ ] **Step 1: 替换 cloudcli 命令为 ccui**

将第 8 行：
```bash
nohup cloudcli start --port 3001 > /tmp/cloudcli-ui.log 2>&1 &
```

替换为：
```bash
nohup ccui start --port 3001 > /tmp/ccui-ui.log 2>&1 &
```

- [ ] **Step 2: 验证修改**

```bash
grep -n "cloudcli" docker/shared/start-cloudcli.sh
```

Expected output: 仅剩 `@cloudcli-ai/cloudcli` 在 npm update 命令中。

- [ ] **Step 3: 提交**

```bash
git add docker/shared/start-cloudcli.sh
git commit -m "chore: update docker startup script to use ccui command"
```

---

## Task 6: 更新 Docker 文件引用

**Files:**
- Modify: `docker/claude-code/Dockerfile`
- Modify: `docker/codex/Dockerfile`
- Modify: `docker/gemini/Dockerfile`

- [ ] **Step 1: 更新 claude-code/Dockerfile**

将第 10 行：
```dockerfile
COPY shared/start-cloudcli.sh /home/agent/.cloudcli-start.sh
```

替换为：
```dockerfile
COPY shared/start-cloudcli.sh /home/agent/.ccui-start.sh
```

- [ ] **Step 2: 更新 codex/Dockerfile**

同样的修改。

- [ ] **Step 3: 更新 gemini/Dockerfile**

同样的修改。

- [ ] **Step 4: 验证修改**

```bash
grep -n "cloudcli" docker/*/Dockerfile
```

Expected output: 仅剩 npm install 命令中的 `@cloudcli-ai/cloudcli`。

- [ ] **Step 5: 提交**

```bash
git add docker/*/Dockerfile
git commit -m "chore: rename docker startup script reference to ccui"
```

---

## Task 7: 更新 docker/README.md

**Files:**
- Modify: `docker/README.md`

- [ ] **Step 1: 替换镜像名称引用**

将第 11-13 行：
```markdown
| `cloudcli-ai/sandbox:claude-code` | docker/sandbox-templates:claude-code | Claude Code |
| `cloudcli-ai/sandbox:codex` | docker/sandbox-templates:codex | OpenAI Codex |
| `cloudcli-ai/sandbox:gemini` | docker/sandbox-templates:gemini | Gemini CLI |
```

替换为（移除这些外部镜像引用，或使用新名称）：
```markdown
| CC UI (Claude) | local build | Claude Code |
| CC UI (Codex) | local build | OpenAI Codex |
| CC UI (Gemini) | local build | Gemini CLI |
```

- [ ] **Step 2: 替换 Quick Start 中的镜像引用**

将第 20 行：
```markdown
sbx run --template docker.io/cloudcli-ai/sandbox:claude-code claude ~/my-project
```

替换为：
```markdown
# 使用本地构建的镜像
# sbx run --template ccui-sandbox:claude-code claude ~/my-project
```

- [ ] **Step 3: 替换构建命令中的镜像名称**

将第 52、55、58 行的 `cloudcli-sandbox:` 前缀改为 `ccui-sandbox:`

- [ ] **Step 4: 替换环境变量说明**

将第 66 行：
```markdown
2. **CC UI** — Installed globally via `npm install -g @cloudcli-ai/cloudcli`
```

替换为：
```markdown
2. **CC UI** — Installed globally via npm
```

将第 77 行：
```markdown
| `DATABASE_PATH` | `~/.cloudcli/auth.db` | SQLite database location |
```

替换为：
```markdown
| `DATABASE_PATH` | `~/.ccui/auth.db` | SQLite database location |
```

- [ ] **Step 5: 验证修改**

```bash
grep -n "cloudcli" docker/README.md
```

Expected output: 仅剩必要的 NPM 包名引用。

- [ ] **Step 6: 提交**

```bash
git add docker/README.md
git commit -m "chore: update docker README to reflect CC UI branding"
```

---

## Task 8: 更新 redirect-package

**Files:**
- Modify: `redirect-package/package.json`
- Modify: `redirect-package/README.md`
- Modify: `redirect-package/bin.js`
- Modify: `redirect-package/index.js`

- [ ] **Step 1: 更新 redirect-package/package.json 的 bin 字段**

将：
```json
"bin": {
  "claude-code-ui": "./bin.js",
  "cloudcli": "./bin.js"
}
```

替换为：
```json
"bin": {
  "ccui": "./bin.js"
}
```

- [ ] **Step 2: 更新 redirect-package/README.md**

将所有 `@cloudcli-ai/cloudcli` 包引用保持不变（这是向后兼容的重定向包），但更新显示文本。

将 "CloudCLI" 替换为 "CC UI"。

- [ ] **Step 3: 验证修改**

```bash
grep -ni "cloudcli" redirect-package/*
```

Expected output: 只有 `@cloudcli-ai/cloudcli` 包导入保留。

- [ ] **Step 4: 提交**

```bash
git add redirect-package/
git commit -m "chore: update redirect package to use ccui command"
```

---

## Task 9: 更新 release/windows-lite/package.json

**Files:**
- Modify: `release/windows-lite/package.json`

- [ ] **Step 1: 更新 bin 字段**

将：
```json
"bin": {
  "cloudcli": "server/cli.js"
}
```

替换为：
```json
"bin": {
  "ccui": "server/cli.js"
}
```

- [ ] **Step 2: 验证修改**

```bash
cat release/windows-lite/package.json | grep -A2 '"bin"'
```

Expected output: 显示 `ccui` 作为 bin 命令。

- [ ] **Step 3: 提交**

```bash
git add release/windows-lite/package.json
git commit -m "chore: update windows-lite package bin to ccui"
```

---

## Task 10: 验证所有更改

**Files:**
- 全局验证

- [ ] **Step 1: 搜索残留的 cloudcli 引用**

```bash
grep -r "cloudcli" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude=package-lock.json --exclude=release/windows-lite/package-lock.json
```

Expected output: 只有以下内容保留：
- `@cloudcli-ai/cloudcli` (NPM 包名)
- `@cloudcli-ai/` (scope)

- [ ] **Step 2: 运行类型检查**

```bash
npm run typecheck
```

Expected: 通过，无错误。

- [ ] **Step 3: 运行 lint**

```bash
npm run lint
```

Expected: 通过或仅有预期的格式问题。

- [ ] **Step 4: 测试 CLI 帮助命令**

```bash
node server/cli.js help
```

Expected output: 显示 CC UI 帮助信息，命令示例使用 `ccui`。

- [ ] **Step 5: 提交最终验证**

如果有额外的修正需要：

```bash
git add .
git commit -m "chore: final cleanup for cloudcli to ccui migration"
```

---

## 排除模式（保持不变）

以下内容**不修改**：
1. `@cloudcli-ai/cloudcli` — NPM 包导入语句
2. `@cloudcli-ai/` — scope 包引用
3. npm install/update 命令中的包名

---

## 验收标准

1. ✅ 所有用户可见的 `cloudcli` 命令引用已替换为 `ccui`
2. ✅ NPM 包名 `@cloudcli-ai/cloudcli` 保持不变
3. ✅ 所有文档中的 "CloudCLI" 文本已替换为 "CC UI"
4. ✅ `grep -r "cloudcli"` 结果仅包含必要的包名引用
5. ✅ `npm run typecheck` 通过
6. ✅ `node server/cli.js help` 显示正确的命令名称
