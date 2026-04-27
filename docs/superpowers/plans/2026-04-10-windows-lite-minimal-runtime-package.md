# Windows Lite 最小运行包实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为当前 Claude Only Lite 验证版补齐最小运行包生成链路，只分发运行所需文件与生产依赖，将 Windows 压缩包体积和文件数显著降低。

**Architecture:** 继续保留现有 `Express + Vite` 单体结构，不再分发整个源码仓库，而是在 macOS 上生成独立的 `release/windows-lite/` 目录作为运行镜像。运行镜像只包含前端构建产物、后端运行文件、Windows 启动脚本和生产依赖，并通过白名单复制、依赖裁剪与验证脚本保证体积、功能和可重复出包。

**Tech Stack:** Node.js、Vite、Express、React、原生 `fs/promises`、`child_process`、ZIP 分发、Windows `cmd/vbs` 启动脚本。

---

## 文件结构与职责

- `package.json`
  负责暴露新的最小运行包脚本，例如 `release:windows-lite`、`verify:release`。
- `scripts/build-release.mjs`
  新建。负责创建 `release/windows-lite/`、按白名单复制运行文件、生成精简 `package.json`、清理旧产物。
- `scripts/prune-release-node-modules.mjs`
  新建。负责在 `release/windows-lite/` 内二次删除不允许进入运行包的依赖目录。
- `scripts/verify-release.mjs`
  新建。负责校验 `release/windows-lite/` 目录结构、缺失文件、误带目录和已禁用依赖残留。
- `windows-lite/start.cmd`
  需要确认在 `release/windows-lite/` 根目录中启动 `server/index.js` 的相对路径是否正确。
- `windows-lite/start.vbs`
  需要确认静默启动逻辑与 `start.cmd` 一致，且打开本地浏览器地址。
- `windows-lite/README.zh-CN.md`
  更新为新的运行镜像分发说明，不再要求用户接触源码仓库。
- `docs/superpowers/plans/2026-04-10-windows-lite-minimal-runtime-package.md`
  当前实施计划，供后续子代理逐任务执行。

## 运行包边界

### 必须进入运行包

- `dist/`
- `server/`
- `shared/`
- `public/`
- `windows-lite/`
- `package.json`
- 生产依赖 `node_modules/`

### 绝对不能进入运行包

- `src/`
- `docs/`
- `.git/`
- `.github/`
- `tests/`、`test/`、`__tests__/`
- `coverage/`
- `tmp/`
- `logs/`
- `patches/`
- 各类开发配置文件，如 `tsconfig*.json`、`vite.config.*`、`eslint*`、`tailwind*`、`postcss*`

### 运行包内必须清理的依赖

- `node-pty`
- `better-sqlite3`
- `sqlite3`
- `bcrypt`
- `@openai/*`
- `@xterm/*`

## 任务拆分

### Task 1: 固化运行包白名单与脚本入口

**Files:**
- Modify: `package.json`
- Create: `scripts/build-release.mjs`
- Create: `scripts/verify-release.mjs`

- [ ] **Step 1: 在计划里明确新的脚本入口目标**

```json
{
  "scripts": {
    "release:windows-lite": "node scripts/build-release.mjs",
    "verify:release": "node scripts/verify-release.mjs"
  }
}
```

- [ ] **Step 2: 在 `scripts/build-release.mjs` 中定义运行包白名单常量**

```js
const RELEASE_ROOT = 'release/windows-lite';
const COPY_ITEMS = [
  'dist',
  'server',
  'shared',
  'public',
  'windows-lite',
  'package.json'
];

const EXCLUDED_ROOT_NAMES = new Set([
  'src',
  'docs',
  '.git',
  '.github',
  'tests',
  'test',
  '__tests__',
  'coverage',
  'tmp',
  'logs'
]);
```

- [ ] **Step 3: 在 `scripts/verify-release.mjs` 中定义必须存在与禁止存在的目录清单**

```js
const REQUIRED_PATHS = [
  'dist/index.html',
  'server/index.js',
  'shared',
  'public',
  'windows-lite/start.cmd',
  'windows-lite/start.vbs',
  'package.json'
];

const FORBIDDEN_PATHS = [
  'src',
  'docs',
  '.git',
  '.github',
  'tests',
  'test',
  '__tests__'
];
```

- [ ] **Step 4: 运行脚本文件语法检查**

Run: `node --check scripts/build-release.mjs && node --check scripts/verify-release.mjs`
Expected: 不输出语法错误，命令退出码为 `0`。

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/build-release.mjs scripts/verify-release.mjs
git commit -m "build: add windows lite release script entrypoints"
```

### Task 2: 生成 `release/windows-lite` 运行镜像

**Files:**
- Modify: `scripts/build-release.mjs`
- Test: `release/windows-lite/`

- [ ] **Step 1: 先写出清理并创建 `release/windows-lite/` 的最小实现**

```js
import { mkdir, rm } from 'node:fs/promises';

await rm(RELEASE_ROOT, { recursive: true, force: true });
await mkdir(RELEASE_ROOT, { recursive: true });
```

- [ ] **Step 2: 写出白名单复制逻辑，只复制运行态目录**

```js
import { cp } from 'node:fs/promises';
import path from 'node:path';

for (const item of COPY_ITEMS) {
  await cp(item, path.join(RELEASE_ROOT, item), {
    recursive: true,
    force: true
  });
}
```

- [ ] **Step 3: 在复制后删除不该进入运行包的说明和垃圾文件**

```js
const POST_COPY_REMOVALS = [
  'public/convert-icons.md',
  'windows-lite/logs',
  '.DS_Store'
];

for (const target of POST_COPY_REMOVALS) {
  await rm(path.join(RELEASE_ROOT, target), { recursive: true, force: true });
}
```

- [ ] **Step 4: 运行构建脚本，确认 `release/windows-lite/` 结构生成**

Run: `node scripts/build-release.mjs`
Expected: 新生成 `release/windows-lite/`，目录下只出现白名单项。

- [ ] **Step 5: 用目录检查确认没有把源码仓库整体复制进去**

Run: `find release/windows-lite -maxdepth 2 -type d | sort`
Expected: 能看到 `dist`、`server`、`shared`、`public`、`windows-lite`，看不到 `src`、`docs`、`.git`。

- [ ] **Step 6: Commit**

```bash
git add scripts/build-release.mjs
git commit -m "build: assemble windows lite release directory"
```

### Task 3: 为运行包生成精简 `package.json` 与生产依赖

**Files:**
- Modify: `scripts/build-release.mjs`
- Create: `scripts/prune-release-node-modules.mjs`
- Modify: `package.json`

- [ ] **Step 1: 在 `scripts/build-release.mjs` 中写出精简运行包 `package.json` 生成逻辑**

```js
const releasePackageJson = {
  name: '@cloudcli-ai/cloudcli-windows-lite',
  private: true,
  type: 'module',
  main: 'server/index.js',
  scripts: {
    server: 'node server/index.js'
  },
  dependencies: rootPackageJson.dependencies
};
```

- [ ] **Step 2: 在 `scripts/build-release.mjs` 中把精简 `package.json` 写入运行目录**

```js
import { readFile, writeFile } from 'node:fs/promises';

const rootPackageJson = JSON.parse(await readFile('package.json', 'utf8'));
await writeFile(
  path.join(RELEASE_ROOT, 'package.json'),
  `${JSON.stringify(releasePackageJson, null, 2)}\n`,
  'utf8'
);
```

- [ ] **Step 3: 在 `scripts/prune-release-node-modules.mjs` 中定义依赖清理名单**

```js
const PRUNE_TARGETS = [
  'node_modules/node-pty',
  'node_modules/better-sqlite3',
  'node_modules/sqlite3',
  'node_modules/bcrypt',
  'node_modules/@openai',
  'node_modules/@xterm'
];
```

- [ ] **Step 4: 用生产依赖安装命令生成运行态 `node_modules`**

Run: `cd release/windows-lite && npm install --omit=dev --ignore-scripts`
Expected: 只安装生产依赖，不下载或执行开发依赖脚本。

- [ ] **Step 5: 执行依赖清理脚本并确认大依赖已删除**

Run: `node scripts/prune-release-node-modules.mjs && du -sh release/windows-lite/node_modules`
Expected: `PRUNE_TARGETS` 中的目录不存在，`node_modules` 体积明显低于源码目录全量依赖。

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/build-release.mjs scripts/prune-release-node-modules.mjs
git commit -m "build: generate production-only windows lite dependencies"
```

### Task 4: 校验运行包目录、依赖与启动入口

**Files:**
- Modify: `scripts/verify-release.mjs`
- Modify: `windows-lite/start.cmd`
- Modify: `windows-lite/start.vbs`
- Modify: `windows-lite/README.zh-CN.md`

- [ ] **Step 1: 在 `scripts/verify-release.mjs` 中写出目录存在性断言**

```js
import { access } from 'node:fs/promises';

for (const relativePath of REQUIRED_PATHS) {
  await access(path.join(RELEASE_ROOT, relativePath));
}
```

- [ ] **Step 2: 在 `scripts/verify-release.mjs` 中写出禁止路径与禁止依赖断言**

```js
const FORBIDDEN_DEPENDENCY_PATHS = [
  'node_modules/node-pty',
  'node_modules/better-sqlite3',
  'node_modules/sqlite3',
  'node_modules/bcrypt',
  'node_modules/@openai',
  'node_modules/@xterm'
];
```

- [ ] **Step 3: 校准 `windows-lite/start.cmd` 的运行根目录**

```bat
@echo off
cd /d "%~dp0.."
node server\index.js
```

- [ ] **Step 4: 校准 `windows-lite/start.vbs` 的静默启动逻辑**

```vbscript
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run Chr(34) & ".\windows-lite\start.cmd" & Chr(34), 0
WScript.Sleep 3000
WshShell.Run "http://127.0.0.1:3001"
Set WshShell = Nothing
```

- [ ] **Step 5: 更新 `windows-lite/README.zh-CN.md` 为运行镜像说明**

```md
## 目录要求

请直接解压 `windows-lite` 发布包，不要从源码仓库启动。

## 启动方式

1. 确认系统已安装 Node 24
2. 确认 `claude` 命令可用且已登录
3. 双击 `windows-lite/start.vbs`
```

- [ ] **Step 6: 运行运行包校验脚本**

Run: `node scripts/verify-release.mjs`
Expected: 输出 `release verification passed`，且退出码为 `0`。

- [ ] **Step 7: Commit**

```bash
git add scripts/verify-release.mjs windows-lite/start.cmd windows-lite/start.vbs windows-lite/README.zh-CN.md
git commit -m "build: verify windows lite release package"
```

### Task 5: 验证最小运行包可用性并记录出包流程

**Files:**
- Modify: `windows-lite/README.zh-CN.md`
- Test: `release/windows-lite/`

- [ ] **Step 1: 运行前端构建并重新生成运行包**

Run: `npm run build && npm run release:windows-lite`
Expected: `dist/` 更新成功，`release/windows-lite/` 重新生成成功。

- [ ] **Step 2: 运行运行包校验与目录检查**

Run: `npm run verify:release && find release/windows-lite -maxdepth 2 -type d | sort`
Expected: 校验通过，目录中不包含 `src`、`docs`、`.git`、`.github`。

- [ ] **Step 3: 在运行目录中启动后端，确认不依赖源码仓库根目录**

Run: `cd release/windows-lite && node server/index.js`
Expected: 服务启动成功；若本地端口被占用，允许出现端口占用错误，但不能出现缺文件、缺模块、原生依赖加载报错。

- [ ] **Step 4: 记录 Windows 分发与验证步骤到 `windows-lite/README.zh-CN.md`**

```md
## 出包步骤

1. 在 macOS 执行 `npm run build`
2. 执行 `npm run release:windows-lite`
3. 压缩 `release/windows-lite/`
4. 将 zip 发给 Windows 用户
```

- [ ] **Step 5: 用体积命令记录结果，确认已经明显低于旧包**

Run: `du -sh release/windows-lite && find release/windows-lite | wc -l`
Expected: 体积和文件数明显低于当前 700M+ / 近 5 万文件的旧分发方式。

- [ ] **Step 6: Commit**

```bash
git add windows-lite/README.zh-CN.md
git commit -m "docs: document windows lite release workflow"
```

## 自检

### Spec 覆盖

- “只分发运行所需文件” 由 Task 1、Task 2 实现。
- “只保留生产依赖并清理禁用依赖” 由 Task 3、Task 4 实现。
- “Windows `vbs` 启动与分发流程” 由 Task 4、Task 5 实现。
- “验证包体积与文件数明显下降” 由 Task 5 实现。

### 占位符扫描

- 计划中没有 `TODO`、`TBD`、`稍后实现` 之类占位描述。
- 每个代码步骤都提供了具体代码块，每个验证步骤都给出明确命令和预期。

### 类型与命名一致性

- 运行目录统一使用 `release/windows-lite/`。
- 脚本名称统一为 `build-release.mjs`、`prune-release-node-modules.mjs`、`verify-release.mjs`。
- 禁止依赖清单在 Task 3 与 Task 4 保持一致。
