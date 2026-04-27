# Windows Lite Launch Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Windows Lite package launch only through `windows-lite/start.vbs` and `windows-lite/start.cmd`, start the local Node service reliably, and open `http://127.0.0.1:3001` only after the service is ready.

**Architecture:** Keep the existing runtime shape: `server/index.js` remains the only application server, while `windows-lite/start.cmd` becomes a robust launcher that performs prerequisite checks, starts the server, polls the local HTTP endpoint, and opens the browser after readiness is confirmed. Update the Windows-facing documentation so `dist/index.html` is explicitly treated as a build artifact served over HTTP rather than a supported launch entry.

**Tech Stack:** Windows Batch (`.cmd`), VBScript (`.vbs`), Node.js runtime, Express static serving, Markdown documentation

---

## File Structure

- Modify: `claudecodeui-claude-only-lite-windows/windows-lite/start.cmd`
  Responsibility: Windows launcher preflight checks, server startup, readiness polling, browser open timing, failure exit behavior, log creation
- Verify or optionally modify: `claudecodeui-claude-only-lite-windows/windows-lite/start.vbs`
  Responsibility: Silent desktop entry that invokes `start.cmd` from the project root
- Modify: `claudecodeui-claude-only-lite-windows/windows-lite/README.zh-CN.md`
  Responsibility: User-facing Windows launch instructions, supported entry clarification, troubleshooting guidance

No backend code changes are planned unless the readiness probe proves impossible against the existing `/` route in `server/index.js`.

### Task 1: Harden the Windows launcher

**Files:**
- Modify: `claudecodeui-claude-only-lite-windows/windows-lite/start.cmd:1-26`
- Verify: `claudecodeui-claude-only-lite-windows/server/index.js:2328-2349`

- [ ] **Step 1: Read the current launcher and confirm the readiness target**

Run:

```bash
nl -ba /Users/zhanglt21/Downloads/claudecodeui-main/claudecodeui-claude-only-lite-windows/windows-lite/start.cmd | sed -n '1,80p'
nl -ba /Users/zhanglt21/Downloads/claudecodeui-main/claudecodeui-claude-only-lite-windows/server/index.js | sed -n '2328,2349p'
```

Expected:

```text
start.cmd currently opens the browser after a fixed 3-second sleep
server/index.js serves dist/index.html for GET /
```

- [ ] **Step 2: Replace the fixed-delay open with a readiness-polling launcher**

Update `claudecodeui-claude-only-lite-windows/windows-lite/start.cmd` to this shape:

```bat
@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0.."

set "SERVER_PORT=3001"
set "SERVER_URL=http://127.0.0.1:%SERVER_PORT%"
set "LOG_DIR=windows-lite\logs"
set "LOG_FILE=%LOG_DIR%\server.log"
set "STARTUP_TIMEOUT_SECONDS=30"

if not exist "dist\index.html" (
  echo [错误] 未找到 dist\index.html，请先执行 npm run build
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先安装或把 node 加入 PATH
  exit /b 1
)

where powershell >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 PowerShell，无法执行启动探测
  exit /b 1
)

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo [%date% %time%] Starting Windows Lite server on port %SERVER_PORT%>>"%LOG_FILE%"
start "ClaudeCodeUI Windows Lite" /b cmd /c "node server\index.js 1>>\"%LOG_FILE%\" 2>>&1"

set "READY=0"
for /L %%I in (1,1,%STARTUP_TIMEOUT_SECONDS%) do (
  powershell -NoProfile -Command ^
    "try { $response = Invoke-WebRequest -UseBasicParsing '%SERVER_URL%' -TimeoutSec 2; if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { exit 0 } else { exit 1 } } catch { exit 1 }"
  if not errorlevel 1 (
    set "READY=1"
    goto :server_ready
  )
  timeout /t 1 /nobreak >nul
)

:server_ready
if "%READY%"=="1" (
  start "" "%SERVER_URL%"
  exit /b 0
)

echo [错误] 服务未能在 %STARTUP_TIMEOUT_SECONDS% 秒内就绪，请查看 %LOG_FILE%
exit /b 1
```

- [ ] **Step 3: Review the script for quoting and control-flow issues**

Run:

```bash
sed -n '1,220p' /Users/zhanglt21/Downloads/claudecodeui-main/claudecodeui-claude-only-lite-windows/windows-lite/start.cmd
```

Expected:

```text
The script contains no fixed Start-Sleep browser opener
The browser only opens after the READY flag is set
The failure path prints the log file location
```

- [ ] **Step 4: Validate the Windows batch logic in a Windows shell**

Run on Windows in the package root:

```bat
windows-lite\start.cmd
```

Expected:

```text
No immediate browser popup before the server is reachable
The browser opens to http://127.0.0.1:3001 after the service starts
```

- [ ] **Step 5: Verify the timeout path**

Temporarily force a failure on Windows by changing the node launch line to an invalid file or by reserving port `3001`, then run:

```bat
windows-lite\start.cmd
```

Expected:

```text
[错误] 服务未能在 30 秒内就绪，请查看 windows-lite\logs\server.log
```

- [ ] **Step 6: Commit the launcher hardening**

```bash
git -C /Users/zhanglt21/Downloads/claudecodeui-main add claudecodeui-claude-only-lite-windows/windows-lite/start.cmd
git -C /Users/zhanglt21/Downloads/claudecodeui-main commit -m "fix: harden windows lite launcher"
```

### Task 2: Confirm the silent VBS entry remains the supported desktop entry

**Files:**
- Verify or Modify: `claudecodeui-claude-only-lite-windows/windows-lite/start.vbs:1-8`
- Test: `claudecodeui-claude-only-lite-windows/windows-lite/start.cmd`

- [ ] **Step 1: Re-read the current VBS wrapper**

Run:

```bash
nl -ba /Users/zhanglt21/Downloads/claudecodeui-main/claudecodeui-claude-only-lite-windows/windows-lite/start.vbs | sed -n '1,40p'
```

Expected:

```text
The script resolves the project root from the script path and calls windows-lite\start.cmd
```

- [ ] **Step 2: Keep the wrapper minimal unless quoting actually breaks**

If the current wrapper still works after Task 1, keep it unchanged. If a quoting issue appears during Windows validation, replace the body with:

```vbscript
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
projectDir = fso.GetParentFolderName(baseDir)

command = "cmd.exe /c cd /d """ & projectDir & """ && call ""windows-lite\start.cmd"""
shell.Run command, 0, False
```

- [ ] **Step 3: Validate the silent desktop entry**

Run on Windows by double-clicking:

```text
claudecodeui-claude-only-lite-windows\windows-lite\start.vbs
```

Expected:

```text
No visible command prompt window remains on screen
The default browser opens to http://127.0.0.1:3001 once the server is ready
```

- [ ] **Step 4: Commit the VBS verification or quoting fix**

```bash
git -C /Users/zhanglt21/Downloads/claudecodeui-main add claudecodeui-claude-only-lite-windows/windows-lite/start.vbs
git -C /Users/zhanglt21/Downloads/claudecodeui-main commit -m "fix: keep windows lite vbs launcher aligned"
```

### Task 3: Update the Windows-facing documentation

**Files:**
- Modify: `claudecodeui-claude-only-lite-windows/windows-lite/README.zh-CN.md:1-48`

- [ ] **Step 1: Rewrite the launch section so the supported entry is unambiguous**

Update `claudecodeui-claude-only-lite-windows/windows-lite/README.zh-CN.md` so the core sections read like this:

```md
# Windows 验证版启动说明

这个目录用于 `Claude Only Lite` 验证版。

## 使用前提

- Windows 机器已经安装 `Node.js 24`
- 项目根目录已经包含 `dist/` 构建产物
- 项目根目录已经包含可运行的 `node_modules/`
- 机器上已经安装并登录 `Claude Code`

## 正确启动方式

优先双击：

- `windows-lite/start.vbs`

如果你希望看到控制台日志，也可以双击：

- `windows-lite/start.cmd`

启动脚本会先拉起本地 Node 服务，待服务就绪后自动打开：

- `http://127.0.0.1:3001`

## 不支持的启动方式

- 不要直接双击 `dist/index.html`

原因：

- `dist/index.html` 是给本地 HTTP 服务提供的前端入口，不是独立桌面应用
- `file://` 打开无法承载 Claude Code CLI 所需的本地服务能力

## 日志位置

服务日志会写入：

- `windows-lite/logs/server.log`

如果启动失败，请优先检查这个日志文件。
```

- [ ] **Step 2: Add troubleshooting guidance for the known failure cases**

Append a short troubleshooting section like this:

```md
## 常见问题

### 双击后没有打开页面

- 先查看 `windows-lite/logs/server.log`
- 确认 `Node.js` 已安装并在 PATH 中可用
- 确认 `3001` 端口没有被其他程序占用

### 打开了浏览器但无法对话

- 确认本机已经安装并登录 `Claude Code`
- 确认是通过 `windows-lite/start.vbs` 或 `windows-lite/start.cmd` 启动，而不是直接打开 `dist/index.html`
```

- [ ] **Step 3: Review the final documentation for consistency with the spec**

Run:

```bash
sed -n '1,220p' /Users/zhanglt21/Downloads/claudecodeui-main/claudecodeui-claude-only-lite-windows/windows-lite/README.zh-CN.md
```

Expected:

```text
The README names start.vbs as the preferred entry
The README names start.cmd as the visible-log entry
The README explicitly says dist/index.html is unsupported as a launch entry
```

- [ ] **Step 4: Commit the documentation update**

```bash
git -C /Users/zhanglt21/Downloads/claudecodeui-main add claudecodeui-claude-only-lite-windows/windows-lite/README.zh-CN.md
git -C /Users/zhanglt21/Downloads/claudecodeui-main commit -m "docs: clarify windows lite launch entry"
```

### Task 4: Final verification and handoff

**Files:**
- Verify: `claudecodeui-claude-only-lite-windows/windows-lite/start.cmd`
- Verify: `claudecodeui-claude-only-lite-windows/windows-lite/start.vbs`
- Verify: `claudecodeui-claude-only-lite-windows/windows-lite/README.zh-CN.md`

- [ ] **Step 1: Run the supported launch path end-to-end**

Run on Windows by double-clicking:

```text
claudecodeui-claude-only-lite-windows\windows-lite\start.vbs
```

Expected:

```text
The service starts in the background
The browser opens to http://127.0.0.1:3001
The UI loads through HTTP rather than file://
```

- [ ] **Step 2: Check that the root route still serves the built frontend**

Run after startup:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3001 | Select-Object -ExpandProperty StatusCode
```

Expected:

```text
200
```

- [ ] **Step 3: Verify the log file is populated**

Run on Windows:

```powershell
Get-Content .\windows-lite\logs\server.log -Tail 20
```

Expected:

```text
Startup log lines are present and there is no repeated crash loop
```

- [ ] **Step 4: Confirm the unsupported path is no longer part of the release instructions**

Run:

```bash
rg -n "dist/index.html|start.vbs|start.cmd" /Users/zhanglt21/Downloads/claudecodeui-main/claudecodeui-claude-only-lite-windows/windows-lite/README.zh-CN.md
```

Expected:

```text
The README promotes start.vbs and start.cmd
The README mentions dist/index.html only inside the unsupported-use warning
```

- [ ] **Step 5: Create the final integration commit**

```bash
git -C /Users/zhanglt21/Downloads/claudecodeui-main add \
  claudecodeui-claude-only-lite-windows/windows-lite/start.cmd \
  claudecodeui-claude-only-lite-windows/windows-lite/start.vbs \
  claudecodeui-claude-only-lite-windows/windows-lite/README.zh-CN.md
git -C /Users/zhanglt21/Downloads/claudecodeui-main commit -m "feat: stabilize windows lite startup flow"
```

## Self-Review

### Spec coverage

- “双击 `start.vbs` 自动启动服务” is covered by Task 1 and Task 2
- “服务就绪后再打开 `http://127.0.0.1:3001`” is covered by Task 1
- “不再把 `dist/index.html` 当运行入口” is covered by Task 3 and Task 4
- “日志和失败可诊断” is covered by Task 1, Task 3, and Task 4

### Placeholder scan

- No `TODO`, `TBD`, or deferred implementation markers remain
- Every code-changing step includes concrete code or exact text replacements
- Every validation step includes an exact command and expected result

### Type consistency

- The plan consistently uses `SERVER_PORT=3001`, `SERVER_URL=http://127.0.0.1:3001`, and `windows-lite\logs\server.log`
- The supported launch entries are consistently `start.vbs` and `start.cmd`
