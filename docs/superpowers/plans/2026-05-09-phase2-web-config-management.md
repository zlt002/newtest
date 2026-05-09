# 第二阶段 Web 配置管理实施计划

> **给执行代理：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 逐任务执行。所有步骤使用 checkbox（`- [ ]`）跟踪。

**目标：** 让用户可以不依赖 Claude Code CLI，在网页里维护 Claude 运行配置、MCP、插件、skills、commands 和 hooks 入口。

**架构：** 后端先建立统一的“可管理来源 + 目录服务 + 修改服务”，UI 只调用稳定 API，不直接拼文件路径。第一阶段已有 JSON 文件读写、MCP 写入、Lite 插件 registry、SDK 插件解析和插件路由；第二阶段在这些能力上补齐管理动作和设置页 UI。远程 marketplace 安装不在本期。

**技术栈：** Node.js ESM、Express、`node:test`、React、TypeScript、现有 `authenticatedFetch`、现有 settings/hooks UI 组件、Claude Agent SDK。

---

## 文件结构

### 后端新增/修改

- 新增 `server/utils/managed-source.js`  
  统一生成 source 元信息：`kind/path/writable/reason`。

- 新增 `server/utils/claude-runtime-config-service.js`  
  管理 `~/.claude/settings.json` 中的 env、模型和权限字段；密钥只返回 configured 状态。

- 新增 `server/routes/claude-config.js`  
  提供 `/api/claude-config/runtime` 的读取和保存接口。

- 修改 `server/index.js`  
  挂载 `/api/claude-config`。

- 修改 `server/utils/mcp-config-service.js`  
  增加 UI list/validate 帮助方法，保留第一阶段 create/update/delete 行为。

- 修改 `server/routes/mcp.js`  
  增加 `/config/validate`，确保写接口返回统一 `message`。

- 新增 `server/utils/plugin-management-service.js`  
  合并 Lite 插件和 CLI 插件，支持启停 CLI 插件、移除 Lite 插件。

- 修改 `server/routes/plugins.js`  
  改为调用 `PluginManagementService`，增加 `DELETE /api/plugins/:id`。

- 新增 `server/utils/capability-catalog-service.js`  
  扫描 skills/commands，支持 user/project 创建、编辑、删除。

- 新增 `server/routes/capabilities.js`  
  提供 `/api/capabilities` 的列表、详情、创建、编辑、删除接口。

- 修改 `server/index.js`  
  挂载 `/api/capabilities`。

### 前端新增/修改

- 新增 `src/components/settings/view/tabs/agents-settings/sections/content/ClaudeRuntimeSettingsSection.tsx`
- 新增 `src/components/settings/view/tabs/agents-settings/sections/content/McpManagementSection.tsx`
- 新增 `src/components/settings/view/tabs/agents-settings/sections/content/PluginManagementSection.tsx`
- 新增 `src/components/settings/view/tabs/agents-settings/sections/content/CapabilityManagementSection.tsx`
- 新增 `src/components/settings/view/tabs/agents-settings/sections/content/HooksEntrySection.tsx`
- 修改 `src/components/settings/view/tabs/AgentsSettingsTab.tsx`  
  拆出区块，减少继续膨胀。

- 修改 `src/i18n/locales/zh-CN/settings.json`  
  补齐中文文案。

### 测试新增/修改

- 新增 `server/utils/managed-source.test.mjs`
- 新增 `server/utils/claude-runtime-config-service.test.mjs`
- 新增 `server/routes/claude-config.test.mjs`
- 修改 `server/utils/mcp-config-service.test.mjs`
- 修改 `server/routes/mcp.test.mjs`
- 新增 `server/utils/plugin-management-service.test.mjs`
- 修改 `server/routes/plugins.test.mjs`
- 新增 `server/utils/capability-catalog-service.test.mjs`
- 新增 `server/routes/capabilities.test.mjs`
- 新增 `src/components/settings/view/tabs/AgentsSettingsTab.phase2.test.mjs`

---

## Task 1：统一来源元信息工具

**文件：**
- 新增：`server/utils/managed-source.js`
- 新增：`server/utils/managed-source.test.mjs`

- [ ] **Step 1：写失败测试**

创建 `server/utils/managed-source.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createManagedSource,
  isWritableSource,
} from './managed-source.js';

test('createManagedSource normalizes writable source metadata', () => {
  assert.deepEqual(createManagedSource({
    kind: 'user',
    path: '/tmp/home/.claude/settings.json',
    writable: true,
  }), {
    kind: 'user',
    path: '/tmp/home/.claude/settings.json',
    writable: true,
  });
});

test('createManagedSource marks plugin sources read-only by default', () => {
  assert.deepEqual(createManagedSource({
    kind: 'plugin',
    path: '/tmp/plugin/skills/demo/SKILL.md',
  }), {
    kind: 'plugin',
    path: '/tmp/plugin/skills/demo/SKILL.md',
    writable: false,
    reason: '插件来源为只读',
  });
});

test('isWritableSource returns false for invalid or readonly sources', () => {
  assert.equal(isWritableSource(null), false);
  assert.equal(isWritableSource({ kind: 'plugin', path: '/tmp/p', writable: false }), false);
  assert.equal(isWritableSource({ kind: 'user', path: '/tmp/p', writable: true }), true);
});
```

- [ ] **Step 2：运行测试确认失败**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/utils/managed-source.test.mjs
```

期望：失败，提示找不到 `managed-source.js`。

- [ ] **Step 3：实现工具**

创建 `server/utils/managed-source.js`：

```js
const READONLY_REASONS = {
  plugin: '插件来源为只读',
  cli: 'CLI 管理的缓存目录不会由 CC UI 删除',
};

export function createManagedSource({
  kind,
  path,
  writable,
  reason,
} = {}) {
  const normalizedKind = typeof kind === 'string' && kind.trim() ? kind.trim() : 'unknown';
  const normalizedPath = typeof path === 'string' ? path.trim() : '';
  const normalizedWritable = typeof writable === 'boolean'
    ? writable
    : !['plugin', 'cli', 'external', 'unknown'].includes(normalizedKind);

  return {
    kind: normalizedKind,
    path: normalizedPath,
    writable: normalizedWritable,
    ...(!normalizedWritable ? { reason: reason || READONLY_REASONS[normalizedKind] || '来源不可写' } : {}),
  };
}

export function isWritableSource(source) {
  return Boolean(source && typeof source === 'object' && source.writable === true);
}
```

- [ ] **Step 4：运行测试确认通过**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/utils/managed-source.test.mjs
```

期望：全部通过。

- [ ] **Step 5：提交**

```bash
git add server/utils/managed-source.js server/utils/managed-source.test.mjs
git commit -m "feat: add managed source metadata helper"
```

---

## Task 2：Claude 运行配置服务和接口

**文件：**
- 新增：`server/utils/claude-runtime-config-service.js`
- 新增：`server/utils/claude-runtime-config-service.test.mjs`
- 新增：`server/routes/claude-config.js`
- 新增：`server/routes/claude-config.test.mjs`
- 修改：`server/index.js`

- [ ] **Step 1：写服务测试**

创建 `server/utils/claude-runtime-config-service.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  getClaudeRuntimeSettingsPath,
  readClaudeRuntimeConfig,
  updateClaudeRuntimeConfig,
} from './claude-runtime-config-service.js';

function createMemoryFs(initialFiles = {}) {
  const files = { ...initialFiles };
  return {
    files,
    async readFile(filepath, encoding) {
      assert.equal(encoding, 'utf8');
      if (!(filepath in files)) {
        const error = new Error(`ENOENT: ${filepath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return files[filepath];
    },
    async mkdir() {},
    async writeFile(filepath, content, encoding) {
      assert.equal(encoding, 'utf8');
      files[filepath] = content;
    },
  };
}

test('readClaudeRuntimeConfig masks secrets and preserves model/env values', async () => {
  const homeDir = '/tmp/home';
  const settingsPath = getClaudeRuntimeSettingsPath(homeDir);
  const fs = createMemoryFs({
    [settingsPath]: JSON.stringify({
      env: {
        ANTHROPIC_AUTH_TOKEN: 'secret-token',
        ANTHROPIC_BASE_URL: 'https://example.test',
        ANTHROPIC_MODEL: 'qwen3.6-plus',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'qwen3.6-plus',
      },
      permissions: { defaultMode: 'bypassPermissions' },
      unknown: { keep: true },
    }),
  });

  assert.deepEqual(await readClaudeRuntimeConfig({ homeDir, fileSystem: fs }), {
    settingsPath,
    env: {
      ANTHROPIC_AUTH_TOKEN: { configured: true },
      ANTHROPIC_API_KEY: { configured: false },
      ANTHROPIC_BASE_URL: 'https://example.test',
      ANTHROPIC_MODEL: 'qwen3.6-plus',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: '',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'qwen3.6-plus',
      ANTHROPIC_DEFAULT_OPUS_MODEL: '',
      ANTHROPIC_REASONING_MODEL: '',
    },
    permissions: { defaultMode: 'bypassPermissions' },
  });
});

test('updateClaudeRuntimeConfig writes env changes without returning secret values', async () => {
  const homeDir = '/tmp/home';
  const settingsPath = getClaudeRuntimeSettingsPath(homeDir);
  const fs = createMemoryFs({
    [settingsPath]: JSON.stringify({
      env: { EXISTING: 'keep' },
      unknown: 'preserve',
    }),
  });

  const result = await updateClaudeRuntimeConfig({
    homeDir,
    fileSystem: fs,
    patch: {
      env: {
        ANTHROPIC_AUTH_TOKEN: 'new-token',
        ANTHROPIC_BASE_URL: 'https://api.example',
        ANTHROPIC_MODEL: 'sonnet',
      },
      permissions: { defaultMode: 'default' },
    },
  });

  assert.equal(result.env.ANTHROPIC_AUTH_TOKEN.configured, true);
  assert.equal(result.env.ANTHROPIC_BASE_URL, 'https://api.example');
  const written = JSON.parse(fs.files[settingsPath]);
  assert.equal(written.env.EXISTING, 'keep');
  assert.equal(written.env.ANTHROPIC_AUTH_TOKEN, 'new-token');
  assert.equal(written.unknown, 'preserve');
});
```

- [ ] **Step 2：写路由测试**

创建 `server/routes/claude-config.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { createClaudeConfigRouter } from './claude-config.js';

async function startServer({ service }) {
  const app = express();
  app.use(express.json());
  app.use('/api/claude-config', createClaudeConfigRouter({ service }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  };
}

test('claude config runtime routes read and update runtime config', async () => {
  const calls = [];
  const service = {
    async readRuntimeConfig() {
      calls.push(['read']);
      return { env: { ANTHROPIC_MODEL: 'sonnet' } };
    },
    async updateRuntimeConfig({ patch }) {
      calls.push(['update', patch]);
      return { env: { ANTHROPIC_MODEL: patch.env.ANTHROPIC_MODEL } };
    },
  };
  const { server, baseUrl } = await startServer({ service });

  try {
    const readResponse = await fetch(`${baseUrl}/api/claude-config/runtime`);
    assert.equal(readResponse.status, 200);
    assert.deepEqual(await readResponse.json(), {
      success: true,
      config: { env: { ANTHROPIC_MODEL: 'sonnet' } },
    });

    const updateResponse = await fetch(`${baseUrl}/api/claude-config/runtime`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ env: { ANTHROPIC_MODEL: 'opus' } }),
    });
    assert.equal(updateResponse.status, 200);
    assert.deepEqual((await updateResponse.json()).config.env, { ANTHROPIC_MODEL: 'opus' });
    assert.deepEqual(calls, [
      ['read'],
      ['update', { env: { ANTHROPIC_MODEL: 'opus' } }],
    ]);
  } finally {
    server.close();
  }
});
```

- [ ] **Step 3：运行测试确认失败**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/utils/claude-runtime-config-service.test.mjs server/routes/claude-config.test.mjs
```

期望：失败，提示模块不存在。

- [ ] **Step 4：实现运行配置服务**

创建 `server/utils/claude-runtime-config-service.js`：

```js
import os from 'node:os';
import path from 'node:path';

import { readJsonObjectFile, updateJsonObjectFile } from './json-file-store.js';

const SECRET_KEYS = new Set(['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY']);
const RUNTIME_ENV_KEYS = [
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_REASONING_MODEL',
];

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toPublicEnv(env = {}) {
  const normalizedEnv = normalizeObject(env);
  return Object.fromEntries(RUNTIME_ENV_KEYS.map((key) => {
    if (SECRET_KEYS.has(key)) {
      return [key, { configured: Boolean(normalizeString(normalizedEnv[key])) }];
    }
    return [key, normalizeString(normalizedEnv[key])];
  }));
}

function normalizePatchEnv(value) {
  const env = normalizeObject(value);
  const result = {};
  for (const key of RUNTIME_ENV_KEYS) {
    if (!Object.hasOwn(env, key)) {
      continue;
    }
    const normalized = normalizeString(env[key]);
    if (normalized) {
      result[key] = normalized;
    }
  }
  return result;
}

export function getClaudeRuntimeSettingsPath(homeDir = os.homedir()) {
  return path.join(homeDir, '.claude', 'settings.json');
}

export async function readClaudeRuntimeConfig({
  homeDir = os.homedir(),
  fileSystem,
} = {}) {
  const settingsPath = getClaudeRuntimeSettingsPath(homeDir);
  const settings = await readJsonObjectFile(settingsPath, { fileSystem });
  return {
    settingsPath,
    env: toPublicEnv(settings.env),
    permissions: normalizeObject(settings.permissions),
  };
}

export async function updateClaudeRuntimeConfig({
  homeDir = os.homedir(),
  fileSystem,
  patch = {},
} = {}) {
  const settingsPath = getClaudeRuntimeSettingsPath(homeDir);
  await updateJsonObjectFile(settingsPath, (current) => {
    const nextEnv = {
      ...normalizeObject(current.env),
      ...normalizePatchEnv(patch.env),
    };
    const next = {
      ...current,
      env: nextEnv,
    };
    if (patch.permissions && typeof patch.permissions === 'object' && !Array.isArray(patch.permissions)) {
      next.permissions = {
        ...normalizeObject(current.permissions),
        ...patch.permissions,
      };
    }
    return next;
  }, { fileSystem });

  return readClaudeRuntimeConfig({ homeDir, fileSystem });
}

export function createClaudeRuntimeConfigService(options = {}) {
  return {
    readRuntimeConfig() {
      return readClaudeRuntimeConfig(options);
    },
    updateRuntimeConfig({ patch }) {
      return updateClaudeRuntimeConfig({ ...options, patch });
    },
  };
}
```

- [ ] **Step 5：实现路由并挂载**

创建 `server/routes/claude-config.js`：

```js
import express from 'express';

import { createClaudeRuntimeConfigService } from '../utils/claude-runtime-config-service.js';

function sendError(res, error) {
  const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  res.status(status).json({
    success: false,
    message: error?.message || 'Claude 配置操作失败',
    error: error?.message || 'Claude 配置操作失败',
  });
}

export function createClaudeConfigRouter({
  service = createClaudeRuntimeConfigService(),
} = {}) {
  const router = express.Router();

  router.get('/runtime', async (_req, res) => {
    try {
      res.json({ success: true, config: await service.readRuntimeConfig() });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch('/runtime', async (req, res) => {
    try {
      res.json({
        success: true,
        config: await service.updateRuntimeConfig({ patch: req.body || {} }),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}

export default createClaudeConfigRouter();
```

修改 `server/index.js`：

```js
import claudeConfigRoutes from './routes/claude-config.js';
```

在 settings 路由附近加入：

```js
app.use('/api/claude-config', claudeConfigRoutes);
```

- [ ] **Step 6：运行测试**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/utils/claude-runtime-config-service.test.mjs server/routes/claude-config.test.mjs
```

期望：全部通过。

- [ ] **Step 7：提交**

```bash
git add server/utils/claude-runtime-config-service.js server/utils/claude-runtime-config-service.test.mjs server/routes/claude-config.js server/routes/claude-config.test.mjs server/index.js
git commit -m "feat: add claude runtime config api"
```

---

## Task 3：MCP 管理能力补齐

**文件：**
- 修改：`server/utils/mcp-config-service.js`
- 修改：`server/utils/mcp-config-service.test.mjs`
- 修改：`server/routes/mcp.js`
- 修改：`server/routes/mcp.test.mjs`

- [ ] **Step 1：写服务测试**

追加到 `server/utils/mcp-config-service.test.mjs`：

```js
import {
  validateMcpServerConfig,
  toManagedMcpServers,
} from './mcp-config-service.js';

test('validateMcpServerConfig accepts stdio and http configs', () => {
  assert.deepEqual(validateMcpServerConfig({
    name: 'context7',
    config: { type: 'stdio', command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
  }), {
    name: 'context7',
    config: { type: 'stdio', command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
  });

  assert.deepEqual(validateMcpServerConfig({
    name: 'web-reader',
    config: { type: 'http', url: 'https://example.test/mcp' },
  }), {
    name: 'web-reader',
    config: { type: 'http', url: 'https://example.test/mcp' },
  });
});

test('validateMcpServerConfig rejects missing command or url', () => {
  assert.throws(() => validateMcpServerConfig({
    name: 'bad-stdio',
    config: { type: 'stdio' },
  }), /requires command/);

  assert.throws(() => validateMcpServerConfig({
    name: 'bad-http',
    config: { type: 'http' },
  }), /requires url/);
});

test('toManagedMcpServers marks duplicate names across scopes', () => {
  const managed = toManagedMcpServers([
    {
      id: 'user:context7',
      name: 'context7',
      scope: 'user',
      type: 'stdio',
      sourcePath: '/tmp/home/.claude/settings.json',
      config: { command: 'npx' },
    },
    {
      id: 'project:context7',
      name: 'context7',
      scope: 'project',
      type: 'stdio',
      sourcePath: '/tmp/project/.mcp.json',
      config: { command: 'npx' },
    },
  ]);

  assert.equal(managed.length, 2);
  assert.equal(managed[0].duplicateName, true);
  assert.equal(managed[1].duplicateName, true);
  assert.equal(managed[0].source.writable, true);
});
```

- [ ] **Step 2：写路由测试**

追加到 `server/routes/mcp.test.mjs`：

```js
test('mcp config validate route reports valid configs without writing files', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/mcp', mcpRoutes);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/mcp/config/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'reader',
        config: { type: 'http', url: 'https://example.test/mcp' },
      }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      success: true,
      server: {
        name: 'reader',
        config: { type: 'http', url: 'https://example.test/mcp' },
      },
    });
  } finally {
    server.close();
  }
});
```

- [ ] **Step 3：运行测试确认失败**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/utils/mcp-config-service.test.mjs server/routes/mcp.test.mjs
```

期望：失败，提示新函数或新路由不存在。

- [ ] **Step 4：实现服务方法**

在 `server/utils/mcp-config-service.js` 导出：

```js
export function validateMcpServerConfig({ name, config } = {}) {
  return {
    name: normalizeName(name),
    config: normalizeConfig(config),
  };
}

export function toManagedMcpServers(servers = []) {
  const counts = new Map();
  for (const server of Array.isArray(servers) ? servers : []) {
    counts.set(server.name, (counts.get(server.name) || 0) + 1);
  }

  return (Array.isArray(servers) ? servers : []).map((server) => ({
    ...server,
    enabled: server.enabled !== false,
    duplicateName: (counts.get(server.name) || 0) > 1,
    source: {
      kind: server.scope || 'unknown',
      path: server.sourcePath || '',
      writable: Boolean(server.sourcePath),
    },
  }));
}
```

- [ ] **Step 5：实现 validate 路由**

在 `server/routes/mcp.js` 中引入 `validateMcpServerConfig`，并加入：

```js
router.post('/config/validate', async (req, res) => {
  try {
    res.json({
      success: true,
      server: validateMcpServerConfig({
        name: req.body?.name,
        config: req.body?.config,
      }),
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({
      success: false,
      message: error.message,
      error: error.message,
    });
  }
});
```

- [ ] **Step 6：运行测试**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/utils/mcp-config-service.test.mjs server/routes/mcp.test.mjs
```

期望：全部通过。

- [ ] **Step 7：提交**

```bash
git add server/utils/mcp-config-service.js server/utils/mcp-config-service.test.mjs server/routes/mcp.js server/routes/mcp.test.mjs
git commit -m "feat: add mcp management validation"
```

---

## Task 4：插件管理服务扩展

**文件：**
- 新增：`server/utils/plugin-management-service.js`
- 新增：`server/utils/plugin-management-service.test.mjs`
- 修改：`server/routes/plugins.js`
- 修改：`server/routes/plugins.test.mjs`

- [ ] **Step 1：写服务测试**

创建 `server/utils/plugin-management-service.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  listManagedPlugins,
  setManagedPluginEnabled,
  removeManagedPlugin,
} from './plugin-management-service.js';
import { getLiteRegistryPath } from './lite-registry.js';

function createMemoryFs(initialFiles = {}) {
  const files = { ...initialFiles };
  return {
    files,
    readFileSync(filepath, encoding) {
      assert.equal(encoding, 'utf8');
      if (!(filepath in files)) {
        const error = new Error(`ENOENT: ${filepath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return files[filepath];
    },
    async readFile(filepath, encoding) {
      return this.readFileSync(filepath, encoding);
    },
    async mkdir() {},
    async writeFile(filepath, content, encoding) {
      assert.equal(encoding, 'utf8');
      files[filepath] = content;
    },
  };
}

test('listManagedPlugins merges Lite and CLI plugin sources', async () => {
  const homeDir = '/tmp/home';
  const fs = createMemoryFs({
    [getLiteRegistryPath(homeDir)]: JSON.stringify({
      plugins: [{ id: 'local@ccui', name: 'Local', path: '/tmp/local', enabled: true }],
    }),
    [path.join(homeDir, '.claude', 'settings.json')]: JSON.stringify({
      enabledPlugins: { 'superpowers@claude-plugins-official': true },
    }),
    [path.join(homeDir, '.claude', 'plugins', 'installed_plugins.json')]: JSON.stringify({
      plugins: {
        'superpowers@claude-plugins-official': [
          { scope: 'user', installPath: '/tmp/superpowers', version: '5.1.0' },
        ],
      },
    }),
  });

  const plugins = await listManagedPlugins({ homeDir, fileSystem: fs });
  assert.deepEqual(plugins.map((plugin) => ({
    id: plugin.id,
    source: plugin.source.kind,
    enabled: plugin.enabled,
    sdkResolved: plugin.sdkResolved,
  })), [
    { id: 'local@ccui', source: 'lite', enabled: true, sdkResolved: true },
    { id: 'superpowers@claude-plugins-official', source: 'cli', enabled: true, sdkResolved: true },
  ]);
});

test('setManagedPluginEnabled updates CLI enabledPlugins map', async () => {
  const homeDir = '/tmp/home';
  const settingsPath = path.join(homeDir, '.claude', 'settings.json');
  const fs = createMemoryFs({
    [settingsPath]: JSON.stringify({ enabledPlugins: { 'demo@cli': true } }),
    [path.join(homeDir, '.claude', 'plugins', 'installed_plugins.json')]: JSON.stringify({
      plugins: { 'demo@cli': [{ scope: 'user', installPath: '/tmp/demo' }] },
    }),
  });

  const plugin = await setManagedPluginEnabled({
    homeDir,
    fileSystem: fs,
    id: 'demo@cli',
    sourceKind: 'cli',
    enabled: false,
  });

  assert.equal(plugin.enabled, false);
  assert.equal(JSON.parse(fs.files[settingsPath]).enabledPlugins['demo@cli'], false);
});

test('removeManagedPlugin removes Lite plugins and disables CLI plugins', async () => {
  const homeDir = '/tmp/home';
  const settingsPath = path.join(homeDir, '.claude', 'settings.json');
  const registryPath = getLiteRegistryPath(homeDir);
  const fs = createMemoryFs({
    [settingsPath]: JSON.stringify({ enabledPlugins: { 'demo@cli': true } }),
    [registryPath]: JSON.stringify({ plugins: [{ id: 'local@ccui', path: '/tmp/local' }] }),
    [path.join(homeDir, '.claude', 'plugins', 'installed_plugins.json')]: JSON.stringify({
      plugins: { 'demo@cli': [{ scope: 'user', installPath: '/tmp/demo' }] },
    }),
  });

  assert.deepEqual(await removeManagedPlugin({
    homeDir,
    fileSystem: fs,
    id: 'local@ccui',
    sourceKind: 'lite',
  }), { removed: true, disabled: false });

  assert.deepEqual(await removeManagedPlugin({
    homeDir,
    fileSystem: fs,
    id: 'demo@cli',
    sourceKind: 'cli',
  }), { removed: false, disabled: true });
});
```

- [ ] **Step 2：运行测试确认失败**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/utils/plugin-management-service.test.mjs
```

期望：失败，提示模块不存在。

- [ ] **Step 3：实现插件管理服务**

创建 `server/utils/plugin-management-service.js`：

```js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readJsonObjectFile, updateJsonObjectFile } from './json-file-store.js';
import { getLiteRegistryPath, listLitePlugins, setLitePluginEnabled } from './lite-registry.js';
import { loadClaudePluginsSync } from './claude-plugin-config.js';

function readJsonSync(filepath, fileSystem = fs) {
  try {
    return JSON.parse(fileSystem.readFileSync(filepath, 'utf8'));
  } catch {
    return {};
  }
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function getSettingsPath(homeDir) {
  return path.join(homeDir, '.claude', 'settings.json');
}

function getInstalledPluginsPath(homeDir) {
  return path.join(homeDir, '.claude', 'plugins', 'installed_plugins.json');
}

function listCliPlugins({ homeDir, fileSystem }) {
  const settings = readJsonSync(getSettingsPath(homeDir), fileSystem);
  const enabledPlugins = normalizeObject(settings.enabledPlugins);
  const installed = normalizeObject(readJsonSync(getInstalledPluginsPath(homeDir), fileSystem).plugins);
  return Object.entries(installed).map(([id, records]) => {
    const record = Array.isArray(records) ? records.find((entry) => entry?.installPath) : null;
    return {
      id,
      name: id,
      version: record?.version || '',
      path: record?.installPath || '',
      enabled: enabledPlugins[id] === true,
      source: {
        kind: 'cli',
        path: getSettingsPath(homeDir),
        writable: true,
      },
      sdkResolved: enabledPlugins[id] === true && Boolean(record?.installPath),
      removable: false,
    };
  });
}

export async function listManagedPlugins({
  homeDir = os.homedir(),
  fileSystem,
} = {}) {
  const litePlugins = await listLitePlugins({ homeDir, fileSystem });
  const sdkPaths = new Set(loadClaudePluginsSync({ homeDir }).map((plugin) => plugin.path));
  return [
    ...litePlugins.map((plugin) => ({
      ...plugin,
      source: { kind: 'lite', path: getLiteRegistryPath(homeDir), writable: true },
      sdkResolved: sdkPaths.has(plugin.path),
      removable: true,
    })),
    ...listCliPlugins({ homeDir, fileSystem }),
  ];
}

export async function setManagedPluginEnabled({
  homeDir = os.homedir(),
  fileSystem,
  id,
  sourceKind,
  enabled,
} = {}) {
  if (sourceKind === 'lite') {
    return setLitePluginEnabled({ homeDir, fileSystem, id, enabled });
  }

  const settingsPath = getSettingsPath(homeDir);
  await updateJsonObjectFile(settingsPath, (current) => ({
    ...current,
    enabledPlugins: {
      ...normalizeObject(current.enabledPlugins),
      [id]: Boolean(enabled),
    },
  }), { fileSystem });

  return {
    id,
    enabled: Boolean(enabled),
    source: { kind: 'cli', path: settingsPath, writable: true },
  };
}

export async function removeManagedPlugin({
  homeDir = os.homedir(),
  fileSystem,
  id,
  sourceKind,
} = {}) {
  if (sourceKind === 'lite') {
    await updateJsonObjectFile(getLiteRegistryPath(homeDir), (current) => ({
      ...current,
      plugins: (Array.isArray(current.plugins) ? current.plugins : []).filter((plugin) => plugin?.id !== id),
    }), { fileSystem });
    return { removed: true, disabled: false };
  }

  await setManagedPluginEnabled({ homeDir, fileSystem, id, sourceKind: 'cli', enabled: false });
  return { removed: false, disabled: true };
}
```

- [ ] **Step 4：扩展插件路由测试**

在 `server/routes/plugins.test.mjs` 追加：

```js
test('DELETE disables CLI plugins and removes Lite plugins through plugin routes', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'ccui-plugin-home-'));
  const pluginDir = await mkdtemp(path.join(os.tmpdir(), 'ccui-plugin-source-'));
  await mkdir(path.join(pluginDir, '.claude-plugin'), { recursive: true });
  await writeFile(path.join(pluginDir, '.claude-plugin', 'plugin.json'), JSON.stringify({
    id: 'local-delete@ccui',
    name: 'Local Delete',
  }));

  try {
    await withPluginTestServer({ homeDir, runtime: { listLiveSessions: () => [] } }, async (baseUrl) => {
      await fetch(`${baseUrl}/api/plugins/import-directory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pluginDir }),
      });
      const deleteLite = await fetch(`${baseUrl}/api/plugins/local-delete%40ccui?sourceKind=lite`, {
        method: 'DELETE',
      });
      assert.equal(deleteLite.status, 200);
      assert.deepEqual(await deleteLite.json(), {
        success: true,
        result: { removed: true, disabled: false },
      });
    });
  } finally {
    await rm(homeDir, { recursive: true, force: true });
    await rm(pluginDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 5：修改插件路由**

在 `server/routes/plugins.js` 中使用 `listManagedPlugins` 和 `removeManagedPlugin`：

```js
import {
  listManagedPlugins,
  removeManagedPlugin,
  setManagedPluginEnabled,
} from '../utils/plugin-management-service.js';
```

把 `GET /` 改为返回：

```js
const plugins = await listManagedPlugins({ homeDir });
const sdkPlugins = loadClaudePluginsSync({ homeDir });
res.json({ plugins, sdkPlugins });
```

把 `PATCH /:id` 改为：

```js
const plugin = await setManagedPluginEnabled({
  homeDir: getHomeDir(req),
  id: req.params.id,
  sourceKind: req.body?.sourceKind || req.query?.sourceKind || 'lite',
  enabled: req.body?.enabled,
});
```

新增 `DELETE /:id`：

```js
router.delete('/:id', async (req, res) => {
  try {
    res.json({
      success: true,
      result: await removeManagedPlugin({
        homeDir: getHomeDir(req),
        id: req.params.id,
        sourceKind: req.query?.sourceKind || req.body?.sourceKind || 'lite',
      }),
    });
  } catch (error) {
    sendError(res, error);
  }
});
```

- [ ] **Step 6：运行测试**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/utils/plugin-management-service.test.mjs server/routes/plugins.test.mjs server/utils/lite-registry.test.mjs server/utils/claude-plugin-config.test.mjs
```

期望：全部通过。

- [ ] **Step 7：提交**

```bash
git add server/utils/plugin-management-service.js server/utils/plugin-management-service.test.mjs server/routes/plugins.js server/routes/plugins.test.mjs
git commit -m "feat: add managed plugin service"
```

---

## Task 5：能力目录服务：skills 和 commands

**文件：**
- 新增：`server/utils/capability-catalog-service.js`
- 新增：`server/utils/capability-catalog-service.test.mjs`
- 新增：`server/routes/capabilities.js`
- 新增：`server/routes/capabilities.test.mjs`
- 修改：`server/index.js`

- [ ] **Step 1：写服务测试**

创建 `server/utils/capability-catalog-service.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';

import {
  listCapabilities,
  createCapability,
  updateCapability,
  deleteCapability,
} from './capability-catalog-service.js';

test('listCapabilities scans user project and plugin skills', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'cap-home-'));
  const projectPath = await mkdtemp(path.join(os.tmpdir(), 'cap-project-'));
  const pluginPath = await mkdtemp(path.join(os.tmpdir(), 'cap-plugin-'));
  try {
    await mkdir(path.join(homeDir, '.claude', 'skills', 'user-skill'), { recursive: true });
    await mkdir(path.join(projectPath, '.claude', 'skills', 'project-skill'), { recursive: true });
    await mkdir(path.join(pluginPath, 'skills', 'plugin-skill'), { recursive: true });
    await writeFile(path.join(homeDir, '.claude', 'skills', 'user-skill', 'SKILL.md'), '---\ndescription: User skill\n---\n# User Skill\n');
    await writeFile(path.join(projectPath, '.claude', 'skills', 'project-skill', 'SKILL.md'), '# Project Skill\nProject description');
    await writeFile(path.join(pluginPath, 'skills', 'plugin-skill', 'SKILL.md'), '---\ndescription: Plugin skill\n---\n# Plugin Skill\n');

    const skills = await listCapabilities({
      type: 'skill',
      homeDir,
      projectPath,
      pluginPaths: [pluginPath],
    });

    assert.deepEqual(skills.map((skill) => ({
      name: skill.name,
      source: skill.source.kind,
      editable: skill.editable,
    })), [
      { name: 'user-skill', source: 'user', editable: true },
      { name: 'project-skill', source: 'project', editable: true },
      { name: 'plugin-skill', source: 'plugin', editable: false },
    ]);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
    await rm(projectPath, { recursive: true, force: true });
    await rm(pluginPath, { recursive: true, force: true });
  }
});

test('create update delete user command markdown files', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'cap-home-'));
  try {
    const created = await createCapability({
      type: 'command',
      scope: 'user',
      homeDir,
      name: 'hello',
      content: '# Hello\nRun hello',
    });
    assert.equal(created.name, 'hello');
    assert.match(await readFile(created.path, 'utf8'), /# Hello/);

    const updated = await updateCapability({
      id: created.id,
      content: '# Hello Updated',
    });
    assert.equal(await readFile(updated.path, 'utf8'), '# Hello Updated\n');

    await deleteCapability({ id: created.id });
    await assert.rejects(readFile(created.path, 'utf8'), /ENOENT/);
  } finally {
    await rm(homeDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2：运行测试确认失败**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/utils/capability-catalog-service.test.mjs
```

期望：失败，提示模块不存在。

- [ ] **Step 3：实现能力目录服务**

创建 `server/utils/capability-catalog-service.js`：

```js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function normalizeName(value) {
  return String(value || '').trim().replace(/^\/+/, '').replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function encodeId({ type, sourceKind, filepath }) {
  return Buffer.from(JSON.stringify({ type, sourceKind, filepath }), 'utf8').toString('base64url');
}

function decodeId(id) {
  return JSON.parse(Buffer.from(id, 'base64url').toString('utf8'));
}

async function pathExists(filepath) {
  try {
    await fs.access(filepath);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(dir, matcher) {
  if (!(await pathExists(dir))) {
    return [];
  }
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(fullPath, matcher));
    } else if (entry.isFile() && matcher(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function parseDescription(content) {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const descriptionMatch = frontmatterMatch[1].match(/^description:\s*(.+)$/m);
    if (descriptionMatch) {
      return descriptionMatch[1].trim().replace(/^['"]|['"]$/g, '');
    }
  }
  return content.split('\n').find((line) => line.trim() && !line.trim().startsWith('#'))?.trim() || '';
}

async function capabilityFromFile({ type, sourceKind, filepath, rootDir }) {
  const content = await fs.readFile(filepath, 'utf8');
  const name = type === 'skill'
    ? path.basename(path.dirname(filepath))
    : path.basename(filepath, '.md');
  return {
    id: encodeId({ type, sourceKind, filepath }),
    type,
    name,
    description: parseDescription(content),
    path: filepath,
    source: {
      kind: sourceKind,
      path: rootDir,
      writable: sourceKind === 'user' || sourceKind === 'project',
      ...(sourceKind === 'plugin' ? { reason: '插件来源为只读' } : {}),
    },
    editable: sourceKind === 'user' || sourceKind === 'project',
    enabled: true,
  };
}

function getRoots({ type, homeDir, projectPath, pluginPaths = [] }) {
  const folder = type === 'skill' ? 'skills' : 'commands';
  return [
    { sourceKind: 'user', rootDir: path.join(homeDir, '.claude', folder) },
    ...(projectPath ? [{ sourceKind: 'project', rootDir: path.join(projectPath, '.claude', folder) }] : []),
    ...pluginPaths.map((pluginPath) => ({ sourceKind: 'plugin', rootDir: path.join(pluginPath, folder) })),
  ];
}

export async function listCapabilities({
  type,
  homeDir = os.homedir(),
  projectPath,
  pluginPaths = [],
} = {}) {
  const matcher = type === 'skill'
    ? (filepath) => path.basename(filepath) === 'SKILL.md'
    : (filepath) => filepath.endsWith('.md');
  const capabilities = [];
  for (const root of getRoots({ type, homeDir, projectPath, pluginPaths })) {
    const files = await walkFiles(root.rootDir, matcher);
    for (const filepath of files.sort()) {
      capabilities.push(await capabilityFromFile({ type, ...root, filepath }));
    }
  }
  return capabilities;
}

export async function createCapability({
  type,
  scope = 'user',
  homeDir = os.homedir(),
  projectPath,
  name,
  content,
} = {}) {
  const normalizedName = normalizeName(name);
  if (!normalizedName) {
    const error = new Error('能力名称不能为空');
    error.statusCode = 400;
    throw error;
  }
  const baseDir = scope === 'project'
    ? path.join(projectPath, '.claude', type === 'skill' ? 'skills' : 'commands')
    : path.join(homeDir, '.claude', type === 'skill' ? 'skills' : 'commands');
  const filepath = type === 'skill'
    ? path.join(baseDir, normalizedName, 'SKILL.md')
    : path.join(baseDir, `${normalizedName}.md`);
  await fs.mkdir(path.dirname(filepath), { recursive: true });
  await fs.writeFile(filepath, `${String(content || '').trim()}\n`, 'utf8');
  return capabilityFromFile({ type, sourceKind: scope, rootDir: baseDir, filepath });
}

export async function updateCapability({ id, content } = {}) {
  const decoded = decodeId(id);
  if (decoded.sourceKind !== 'user' && decoded.sourceKind !== 'project') {
    const error = new Error('该来源为只读，不能编辑');
    error.statusCode = 403;
    throw error;
  }
  await fs.writeFile(decoded.filepath, `${String(content || '').trim()}\n`, 'utf8');
  return capabilityFromFile({
    type: decoded.type,
    sourceKind: decoded.sourceKind,
    rootDir: path.dirname(decoded.filepath),
    filepath: decoded.filepath,
  });
}

export async function deleteCapability({ id } = {}) {
  const decoded = decodeId(id);
  if (decoded.sourceKind !== 'user' && decoded.sourceKind !== 'project') {
    const error = new Error('该来源为只读，不能删除');
    error.statusCode = 403;
    throw error;
  }
  await fs.rm(decoded.filepath, { force: true });
  return { deleted: true };
}
```

- [ ] **Step 4：写路由测试**

创建 `server/routes/capabilities.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

import { createCapabilitiesRouter } from './capabilities.js';

async function startServer({ homeDir }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.testHomeDir = homeDir;
    next();
  });
  app.use('/api/capabilities', createCapabilitiesRouter());
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

test('capability routes create list update and delete commands', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'cap-route-home-'));
  const { server, baseUrl } = await startServer({ homeDir });

  try {
    const createResponse = await fetch(`${baseUrl}/api/capabilities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'command', scope: 'user', name: 'hello', content: '# Hello' }),
    });
    assert.equal(createResponse.status, 200);
    const created = (await createResponse.json()).capability;

    const listResponse = await fetch(`${baseUrl}/api/capabilities?type=command`);
    assert.equal((await listResponse.json()).capabilities.length, 1);

    const updateResponse = await fetch(`${baseUrl}/api/capabilities/${encodeURIComponent(created.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '# Updated' }),
    });
    assert.equal(updateResponse.status, 200);

    const deleteResponse = await fetch(`${baseUrl}/api/capabilities/${encodeURIComponent(created.id)}`, {
      method: 'DELETE',
    });
    assert.equal(deleteResponse.status, 200);
  } finally {
    server.close();
    await rm(homeDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 5：实现路由并挂载**

创建 `server/routes/capabilities.js`：

```js
import express from 'express';
import os from 'node:os';

import {
  listCapabilities,
  createCapability,
  updateCapability,
  deleteCapability,
} from '../utils/capability-catalog-service.js';

function getHomeDir(req) {
  return typeof req.testHomeDir === 'string' && req.testHomeDir.trim()
    ? req.testHomeDir.trim()
    : os.homedir();
}

function sendError(res, error) {
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message,
    error: error.message,
  });
}

export function createCapabilitiesRouter() {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      res.json({
        success: true,
        capabilities: await listCapabilities({
          type: req.query.type || 'skill',
          homeDir: getHomeDir(req),
          projectPath: req.query.projectPath,
        }),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post('/', async (req, res) => {
    try {
      res.json({
        success: true,
        capability: await createCapability({
          type: req.body?.type,
          scope: req.body?.scope,
          homeDir: getHomeDir(req),
          projectPath: req.body?.projectPath,
          name: req.body?.name,
          content: req.body?.content,
        }),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.patch('/:id', async (req, res) => {
    try {
      res.json({
        success: true,
        capability: await updateCapability({
          id: req.params.id,
          content: req.body?.content,
        }),
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      res.json({ success: true, result: await deleteCapability({ id: req.params.id }) });
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}

export default createCapabilitiesRouter();
```

修改 `server/index.js`：

```js
import capabilitiesRoutes from './routes/capabilities.js';
```

挂载：

```js
app.use('/api/capabilities', capabilitiesRoutes);
```

- [ ] **Step 6：运行测试**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/utils/capability-catalog-service.test.mjs server/routes/capabilities.test.mjs
```

期望：全部通过。

- [ ] **Step 7：提交**

```bash
git add server/utils/capability-catalog-service.js server/utils/capability-catalog-service.test.mjs server/routes/capabilities.js server/routes/capabilities.test.mjs server/index.js
git commit -m "feat: add skills and commands capability catalog"
```

---

## Task 6：设置页 UI 拆分和运行配置区块

**文件：**
- 新增：`src/components/settings/view/tabs/agents-settings/sections/content/ClaudeRuntimeSettingsSection.tsx`
- 修改：`src/components/settings/view/tabs/AgentsSettingsTab.tsx`
- 修改：`src/i18n/locales/zh-CN/settings.json`
- 新增：`src/components/settings/view/tabs/AgentsSettingsTab.phase2.test.mjs`

- [ ] **Step 1：写 source 测试**

创建 `src/components/settings/view/tabs/AgentsSettingsTab.phase2.test.mjs`：

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('phase2 settings surface references runtime config and management sections', async () => {
  const source = await readFile('src/components/settings/view/tabs/AgentsSettingsTab.tsx', 'utf8');
  const runtimeSection = await readFile('src/components/settings/view/tabs/agents-settings/sections/content/ClaudeRuntimeSettingsSection.tsx', 'utf8');

  assert.match(source, /ClaudeRuntimeSettingsSection/);
  assert.match(runtimeSection, /\/api\/claude-config\/runtime/);
  assert.match(runtimeSection, /ANTHROPIC_MODEL/);
  assert.doesNotMatch(runtimeSection, /ANTHROPIC_AUTH_TOKEN.*value=/s);
});
```

- [ ] **Step 2：运行测试确认失败**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/settings/view/tabs/AgentsSettingsTab.phase2.test.mjs
```

期望：失败，提示组件不存在。

- [ ] **Step 3：实现运行配置区块**

创建 `src/components/settings/view/tabs/agents-settings/sections/content/ClaudeRuntimeSettingsSection.tsx`：

```tsx
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../../../../shared/view/ui';
import { authenticatedFetch } from '../../../../../../utils/api';

type RuntimeConfig = {
  env?: Record<string, string | { configured: boolean }>;
  permissions?: { defaultMode?: string };
};

const MODEL_KEYS = [
  'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_REASONING_MODEL',
];

export default function ClaudeRuntimeSettingsSection() {
  const { t } = useTranslation('settings');
  const [config, setConfig] = useState<RuntimeConfig>({});
  const [draftEnv, setDraftEnv] = useState<Record<string, string>>({});
  const [secretDraft, setSecretDraft] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authenticatedFetch('/api/claude-config/runtime');
      const payload = await response.json();
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || payload?.error || 'Failed to load runtime config');
      }
      setConfig(payload.config || {});
      const env = payload.config?.env || {};
      setDraftEnv(Object.fromEntries(MODEL_KEYS.map((key) => [key, typeof env[key] === 'string' ? env[key] : ''])));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const saveConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const env = {
        ...draftEnv,
        ...Object.fromEntries(Object.entries(secretDraft).filter(([, value]) => value.trim())),
      };
      const response = await authenticatedFetch('/api/claude-config/runtime', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env }),
      });
      const payload = await response.json();
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.message || payload?.error || 'Failed to save runtime config');
      }
      setConfig(payload.config || {});
      setSecretDraft({});
      setMessage(t('runtimeConfig.saved'));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [draftEnv, secretDraft, t]);

  const tokenConfigured = Boolean((config.env?.ANTHROPIC_AUTH_TOKEN as { configured?: boolean } | undefined)?.configured);
  const apiKeyConfigured = Boolean((config.env?.ANTHROPIC_API_KEY as { configured?: boolean } | undefined)?.configured);

  return (
    <section className="rounded-lg border border-border bg-card/50 p-4">
      <div className="mb-4">
        <h3 className="text-lg font-medium text-foreground">{t('runtimeConfig.title')}</h3>
        <p className="text-sm text-muted-foreground">{t('runtimeConfig.description')}</p>
      </div>

      <div className="grid gap-3">
        <label className="grid gap-1 text-sm">
          <span>{t('runtimeConfig.authToken')} {tokenConfigured ? t('runtimeConfig.configured') : ''}</span>
          <input
            className="rounded-md border border-border bg-background px-3 py-2"
            type="password"
            value={secretDraft.ANTHROPIC_AUTH_TOKEN || ''}
            onChange={(event) => setSecretDraft((current) => ({ ...current, ANTHROPIC_AUTH_TOKEN: event.target.value }))}
            placeholder={tokenConfigured ? t('runtimeConfig.secretPlaceholder') : ''}
          />
        </label>

        <label className="grid gap-1 text-sm">
          <span>{t('runtimeConfig.apiKey')} {apiKeyConfigured ? t('runtimeConfig.configured') : ''}</span>
          <input
            className="rounded-md border border-border bg-background px-3 py-2"
            type="password"
            value={secretDraft.ANTHROPIC_API_KEY || ''}
            onChange={(event) => setSecretDraft((current) => ({ ...current, ANTHROPIC_API_KEY: event.target.value }))}
            placeholder={apiKeyConfigured ? t('runtimeConfig.secretPlaceholder') : ''}
          />
        </label>

        <label className="grid gap-1 text-sm">
          <span>ANTHROPIC_BASE_URL</span>
          <input
            className="rounded-md border border-border bg-background px-3 py-2"
            value={draftEnv.ANTHROPIC_BASE_URL || ''}
            onChange={(event) => setDraftEnv((current) => ({ ...current, ANTHROPIC_BASE_URL: event.target.value }))}
          />
        </label>

        {MODEL_KEYS.map((key) => (
          <label key={key} className="grid gap-1 text-sm">
            <span>{key}</span>
            <input
              className="rounded-md border border-border bg-background px-3 py-2"
              value={draftEnv[key] || ''}
              onChange={(event) => setDraftEnv((current) => ({ ...current, [key]: event.target.value }))}
            />
          </label>
        ))}
      </div>

      {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
      {message && <div className="mt-3 text-sm text-green-700">{message}</div>}

      <div className="mt-4">
        <Button onClick={() => { void saveConfig(); }} disabled={loading}>
          {t('runtimeConfig.save')}
        </Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4：挂到设置页**

在 `src/components/settings/view/tabs/AgentsSettingsTab.tsx` 引入：

```tsx
import ClaudeRuntimeSettingsSection from './agents-settings/sections/content/ClaudeRuntimeSettingsSection';
```

在账号分类或权限分类上方插入：

```tsx
{selectedCategory === 'account' && (
  <div className="space-y-4">
    <ClaudeRuntimeSettingsSection />
    <AccountContent
      agent="claude"
      authStatus={authStatus}
      onLogin={handleClaudeLogin}
      onConfigured={() => { void loadClaudeAuthStatus(); }}
    />
  </div>
)}
```

- [ ] **Step 5：补中文文案**

在 `src/i18n/locales/zh-CN/settings.json` 添加：

```json
"runtimeConfig": {
  "title": "Claude 运行配置",
  "description": "配置 Claude Agent SDK 运行时使用的 API、Base URL 和模型默认值。",
  "authToken": "Auth Token",
  "apiKey": "API Key",
  "configured": "已配置",
  "secretPlaceholder": "已配置，留空则不修改",
  "save": "保存运行配置",
  "saved": "运行配置已保存"
}
```

- [ ] **Step 6：运行测试和构建**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/settings/view/tabs/AgentsSettingsTab.phase2.test.mjs
npm run build
```

期望：测试和构建都通过。

- [ ] **Step 7：提交**

```bash
git add src/components/settings/view/tabs/agents-settings/sections/content/ClaudeRuntimeSettingsSection.tsx src/components/settings/view/tabs/AgentsSettingsTab.tsx src/i18n/locales/zh-CN/settings.json src/components/settings/view/tabs/AgentsSettingsTab.phase2.test.mjs
git commit -m "feat: add claude runtime settings section"
```

---

## Task 7：MCP 管理 UI

**文件：**
- 新增：`src/components/settings/view/tabs/agents-settings/sections/content/McpManagementSection.tsx`
- 修改：`src/components/settings/view/tabs/AgentsSettingsTab.tsx`
- 修改：`src/i18n/locales/zh-CN/settings.json`
- 修改：`src/components/settings/view/tabs/AgentsSettingsTab.phase2.test.mjs`

- [ ] **Step 1：扩展 source 测试**

追加到 `AgentsSettingsTab.phase2.test.mjs`：

```js
test('phase2 settings surface exposes mcp management endpoints', async () => {
  const source = await readFile('src/components/settings/view/tabs/agents-settings/sections/content/McpManagementSection.tsx', 'utf8');
  assert.match(source, /\/api\/mcp\/config\/validate/);
  assert.match(source, /\/api\/mcp\/config/);
  assert.match(source, /method:\s*'POST'/);
  assert.match(source, /method:\s*'PATCH'/);
  assert.match(source, /method:\s*'DELETE'/);
});
```

- [ ] **Step 2：运行测试确认失败**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/settings/view/tabs/AgentsSettingsTab.phase2.test.mjs
```

期望：失败，提示组件不存在。

- [ ] **Step 3：实现 MCP 管理区块**

创建 `McpManagementSection.tsx`。最小可用版本必须包含：

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../../../../../shared/view/ui';
import { authenticatedFetch } from '../../../../../../utils/api';

type McpDraft = {
  name: string;
  scope: string;
  type: string;
  command: string;
  args: string;
  url: string;
};

const EMPTY_DRAFT: McpDraft = {
  name: '',
  scope: 'user',
  type: 'stdio',
  command: '',
  args: '',
  url: '',
};

export default function McpManagementSection({ selectedProjectPath }: { selectedProjectPath?: string | null }) {
  const [servers, setServers] = useState<any[]>([]);
  const [draft, setDraft] = useState<McpDraft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<any | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadServers = useCallback(async () => {
    const query = selectedProjectPath ? `?projectPath=${encodeURIComponent(selectedProjectPath)}` : '';
    const response = await authenticatedFetch(`/api/mcp/config/read${query}`);
    const payload = await response.json();
    setServers(Array.isArray(payload?.servers) ? payload.servers : []);
  }, [selectedProjectPath]);

  useEffect(() => { void loadServers(); }, [loadServers]);

  const toConfig = useCallback(() => (
    draft.type === 'stdio'
      ? { type: 'stdio', command: draft.command, args: draft.args.split(/\s+/).filter(Boolean) }
      : { type: draft.type, url: draft.url }
  ), [draft]);

  const save = useCallback(async () => {
    setError(null);
    setMessage(null);
    const body = {
      name: draft.name,
      scope: draft.scope,
      projectPath: selectedProjectPath,
      sourcePath: editing?.sourcePath,
      config: toConfig(),
    };
    await authenticatedFetch('/api/mcp/config/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: body.name, config: body.config }),
    });
    const response = await authenticatedFetch(editing ? `/api/mcp/config/${encodeURIComponent(editing.name)}` : '/api/mcp/config', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.message || payload?.error || '保存 MCP 失败');
    }
    setDraft(EMPTY_DRAFT);
    setEditing(null);
    setMessage('MCP 已保存');
    await loadServers();
  }, [draft, editing, loadServers, selectedProjectPath, toConfig]);

  const remove = useCallback(async (server: any) => {
    const response = await authenticatedFetch(`/api/mcp/config/${encodeURIComponent(server.name)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourcePath: server.sourcePath, scope: server.scope, projectPath: server.projectPath }),
    });
    const payload = await response.json();
    if (!response.ok || payload?.success === false) {
      setError(payload?.message || payload?.error || '删除 MCP 失败');
      return;
    }
    await loadServers();
  }, [loadServers]);

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card/50 p-4">
      <h3 className="text-lg font-medium text-foreground">MCP 管理</h3>
      {error && <div className="text-sm text-red-600">{error}</div>}
      {message && <div className="text-sm text-green-700">{message}</div>}
      <div className="grid gap-2">
        <input className="rounded border px-3 py-2" placeholder="名称" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
        <select className="rounded border px-3 py-2" value={draft.scope} onChange={(event) => setDraft((current) => ({ ...current, scope: event.target.value }))}>
          <option value="user">用户</option>
          <option value="project">项目</option>
          <option value="local">本地</option>
        </select>
        <select className="rounded border px-3 py-2" value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))}>
          <option value="stdio">stdio</option>
          <option value="http">http</option>
          <option value="sse">sse</option>
        </select>
        {draft.type === 'stdio' ? (
          <>
            <input className="rounded border px-3 py-2" placeholder="command" value={draft.command} onChange={(event) => setDraft((current) => ({ ...current, command: event.target.value }))} />
            <input className="rounded border px-3 py-2" placeholder="args" value={draft.args} onChange={(event) => setDraft((current) => ({ ...current, args: event.target.value }))} />
          </>
        ) : (
          <input className="rounded border px-3 py-2" placeholder="url" value={draft.url} onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))} />
        )}
        <Button onClick={() => { void save().catch((saveError) => setError(saveError.message)); }}>{editing ? '保存修改' : '新增 MCP'}</Button>
      </div>
      <div className="space-y-2">
        {servers.map((server) => (
          <div key={server.id || `${server.scope}:${server.name}`} className="flex items-center justify-between rounded border p-3">
            <div>
              <div className="font-medium">{server.name}</div>
              <div className="text-xs text-muted-foreground">{server.scope} · {server.type || server.config?.type || 'stdio'}</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => {
                setEditing(server);
                setDraft({
                  name: server.name,
                  scope: server.scope || 'user',
                  type: server.type || server.config?.type || (server.config?.url ? 'http' : 'stdio'),
                  command: server.config?.command || '',
                  args: Array.isArray(server.config?.args) ? server.config.args.join(' ') : '',
                  url: server.config?.url || '',
                });
              }}>编辑</Button>
              <Button size="sm" variant="outline" onClick={() => { void remove(server); }}>删除</Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4：挂到设置页并移除旧只读 MCP 区块**

把 `AgentsSettingsTab.tsx` 中 MCP 分类下的旧内联 MCP 列表替换成：

```tsx
{selectedCategory === 'mcp' && (
  <McpManagementSection selectedProjectPath={selectedProjectPath} />
)}
```

插件管理区块由 Task 8 追加到同一个 MCP 分类下，本任务不要引用 `PluginManagementSection`。

- [ ] **Step 5：运行测试和构建**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/settings/view/tabs/AgentsSettingsTab.phase2.test.mjs
npm run build
```

期望：全部通过。

- [ ] **Step 6：提交**

```bash
git add src/components/settings/view/tabs/agents-settings/sections/content/McpManagementSection.tsx src/components/settings/view/tabs/AgentsSettingsTab.tsx src/i18n/locales/zh-CN/settings.json src/components/settings/view/tabs/AgentsSettingsTab.phase2.test.mjs
git commit -m "feat: add mcp management ui"
```

---

## Task 8：插件管理 UI

**文件：**
- 新增：`src/components/settings/view/tabs/agents-settings/sections/content/PluginManagementSection.tsx`
- 修改：`src/components/settings/view/tabs/AgentsSettingsTab.tsx`
- 修改：`src/i18n/locales/zh-CN/settings.json`
- 修改：`src/components/settings/view/tabs/AgentsSettingsTab.phase2.test.mjs`

- [ ] **Step 1：扩展 source 测试**

追加：

```js
test('phase2 settings surface exposes plugin management actions', async () => {
  const source = await readFile('src/components/settings/view/tabs/agents-settings/sections/content/PluginManagementSection.tsx', 'utf8');
  assert.match(source, /\/api\/plugins\/import-directory/);
  assert.match(source, /\/api\/plugins\/\$\{encodeURIComponent\(plugin\.id\)\}/);
  assert.match(source, /method:\s*'PATCH'/);
  assert.match(source, /method:\s*'DELETE'/);
});
```

- [ ] **Step 2：运行测试确认失败**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/settings/view/tabs/AgentsSettingsTab.phase2.test.mjs
```

期望：失败，提示组件不存在。

- [ ] **Step 3：实现插件管理区块**

创建 `PluginManagementSection.tsx`，至少包含导入、启停、移除：

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Button, Badge } from '../../../../../../shared/view/ui';
import { authenticatedFetch } from '../../../../../../utils/api';

type PluginItem = {
  id: string;
  name?: string;
  version?: string;
  path?: string;
  enabled?: boolean;
  source?: { kind?: string; writable?: boolean };
  sdkResolved?: boolean;
  removable?: boolean;
};

export default function PluginManagementSection() {
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [directory, setDirectory] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadPlugins = useCallback(async () => {
    const response = await authenticatedFetch('/api/plugins');
    const payload = await response.json();
    setPlugins(Array.isArray(payload?.plugins) ? payload.plugins : []);
  }, []);

  useEffect(() => { void loadPlugins(); }, [loadPlugins]);

  const importDirectory = useCallback(async () => {
    const response = await authenticatedFetch('/api/plugins/import-directory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: directory }),
    });
    const payload = await response.json();
    if (!response.ok || payload?.success === false) {
      setError(payload?.message || payload?.error || '导入插件失败');
      return;
    }
    setDirectory('');
    await loadPlugins();
  }, [directory, loadPlugins]);

  const setEnabled = useCallback(async (plugin: PluginItem, enabled: boolean) => {
    const response = await authenticatedFetch(`/api/plugins/${encodeURIComponent(plugin.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, sourceKind: plugin.source?.kind || 'lite' }),
    });
    if (!response.ok) {
      setError('更新插件状态失败');
      return;
    }
    await loadPlugins();
  }, [loadPlugins]);

  const removePlugin = useCallback(async (plugin: PluginItem) => {
    const response = await authenticatedFetch(`/api/plugins/${encodeURIComponent(plugin.id)}?sourceKind=${encodeURIComponent(plugin.source?.kind || 'lite')}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      setError('移除插件失败');
      return;
    }
    await loadPlugins();
  }, [loadPlugins]);

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card/50 p-4">
      <h3 className="text-lg font-medium text-foreground">插件管理</h3>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <div className="flex gap-2">
        <input className="flex-1 rounded border px-3 py-2" value={directory} onChange={(event) => setDirectory(event.target.value)} placeholder="本地插件绝对路径" />
        <Button onClick={() => { void importDirectory(); }}>导入本地插件</Button>
      </div>
      <div className="space-y-2">
        {plugins.map((plugin) => (
          <div key={`${plugin.source?.kind}:${plugin.id}`} className="rounded border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{plugin.name || plugin.id}</div>
                <div className="text-xs text-muted-foreground">{plugin.path}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{plugin.source?.kind || 'unknown'}</Badge>
                {plugin.sdkResolved && <Badge variant="secondary">SDK 已加载</Badge>}
                <Button size="sm" variant="outline" onClick={() => { void setEnabled(plugin, plugin.enabled === false); }}>
                  {plugin.enabled === false ? '启用' : '停用'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { void removePlugin(plugin); }}>
                  {plugin.removable ? '移除' : '停用并隐藏'}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4：挂到 MCP 分类下方**

在 `AgentsSettingsTab.tsx` 的 MCP 分类中加入：

```tsx
<PluginManagementSection />
```

- [ ] **Step 5：运行测试和构建**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/settings/view/tabs/AgentsSettingsTab.phase2.test.mjs
npm run build
```

期望：全部通过。

- [ ] **Step 6：提交**

```bash
git add src/components/settings/view/tabs/agents-settings/sections/content/PluginManagementSection.tsx src/components/settings/view/tabs/AgentsSettingsTab.tsx src/i18n/locales/zh-CN/settings.json src/components/settings/view/tabs/AgentsSettingsTab.phase2.test.mjs
git commit -m "feat: add plugin management ui"
```

---

## Task 9：Skills 和 Commands 管理 UI

**文件：**
- 新增：`src/components/settings/view/tabs/agents-settings/sections/content/CapabilityManagementSection.tsx`
- 修改：`src/components/settings/view/tabs/AgentsSettingsTab.tsx`
- 修改：`src/components/settings/view/tabs/agents-settings/sections/AgentCategoryTabsSection.tsx`
- 修改：`src/components/settings/view/tabs/agents-settings/types.ts`
- 修改：`src/i18n/locales/zh-CN/settings.json`
- 修改：`src/components/settings/view/tabs/AgentsSettingsTab.phase2.test.mjs`

- [ ] **Step 1：扩展 tab 类型**

把 agent category 类型扩展为包含：

```ts
export type AgentCategory = 'account' | 'permissions' | 'mcp' | 'skills' | 'commands' | 'hooks';
```

更新 `isAgentCategory` 判断，允许 `skills`、`commands`、`hooks`。

- [ ] **Step 2：扩展 source 测试**

追加：

```js
test('phase2 settings surface exposes skills and commands management endpoints', async () => {
  const source = await readFile('src/components/settings/view/tabs/agents-settings/sections/content/CapabilityManagementSection.tsx', 'utf8');
  assert.match(source, /\/api\/capabilities\?type=\$\{type\}/);
  assert.match(source, /method:\s*'POST'/);
  assert.match(source, /method:\s*'PATCH'/);
  assert.match(source, /method:\s*'DELETE'/);
});
```

- [ ] **Step 3：实现能力管理区块**

创建 `CapabilityManagementSection.tsx`：

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Button, Badge } from '../../../../../../shared/view/ui';
import { authenticatedFetch } from '../../../../../../utils/api';

type Capability = {
  id: string;
  type: 'skill' | 'command';
  name: string;
  description?: string;
  path: string;
  editable: boolean;
  source?: { kind?: string };
};

export default function CapabilityManagementSection({
  type,
  selectedProjectPath,
}: {
  type: 'skill' | 'command';
  selectedProjectPath?: string | null;
}) {
  const [items, setItems] = useState<Capability[]>([]);
  const [selected, setSelected] = useState<Capability | null>(null);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    const projectQuery = selectedProjectPath ? `&projectPath=${encodeURIComponent(selectedProjectPath)}` : '';
    const response = await authenticatedFetch(`/api/capabilities?type=${type}${projectQuery}`);
    const payload = await response.json();
    setItems(Array.isArray(payload?.capabilities) ? payload.capabilities : []);
  }, [selectedProjectPath, type]);

  useEffect(() => { void loadItems(); }, [loadItems]);

  const createItem = useCallback(async () => {
    const response = await authenticatedFetch('/api/capabilities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, scope: selectedProjectPath ? 'project' : 'user', projectPath: selectedProjectPath, name, content }),
    });
    if (!response.ok) {
      setError('创建失败');
      return;
    }
    setName('');
    setContent('');
    await loadItems();
  }, [content, loadItems, name, selectedProjectPath, type]);

  const updateItem = useCallback(async () => {
    if (!selected) return;
    const response = await authenticatedFetch(`/api/capabilities/${encodeURIComponent(selected.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (!response.ok) {
      setError('保存失败');
      return;
    }
    setSelected(null);
    setContent('');
    await loadItems();
  }, [content, loadItems, selected]);

  const deleteItem = useCallback(async (item: Capability) => {
    const response = await authenticatedFetch(`/api/capabilities/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
    if (!response.ok) {
      setError('删除失败');
      return;
    }
    await loadItems();
  }, [loadItems]);

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card/50 p-4">
      <h3 className="text-lg font-medium text-foreground">{type === 'skill' ? 'Skills 管理' : 'Commands 管理'}</h3>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <div className="grid gap-2">
        <input className="rounded border px-3 py-2" value={name} onChange={(event) => setName(event.target.value)} placeholder="名称" />
        <textarea className="min-h-32 rounded border px-3 py-2" value={content} onChange={(event) => setContent(event.target.value)} placeholder="Markdown 内容" />
        <Button onClick={() => { void (selected ? updateItem() : createItem()); }}>
          {selected ? '保存修改' : '新建'}
        </Button>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded border p-3">
            <div>
              <div className="font-medium">{item.name}</div>
              <div className="text-xs text-muted-foreground">{item.description || item.path}</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{item.source?.kind || 'unknown'}</Badge>
              {!item.editable && <Badge variant="secondary">只读</Badge>}
              {item.editable && (
                <>
                  <Button size="sm" variant="outline" onClick={() => { setSelected(item); setName(item.name); setContent(''); }}>编辑</Button>
                  <Button size="sm" variant="outline" onClick={() => { void deleteItem(item); }}>删除</Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4：挂到设置页**

在 `AgentsSettingsTab.tsx` 中：

```tsx
{selectedCategory === 'skills' && (
  <CapabilityManagementSection type="skill" selectedProjectPath={selectedProjectPath} />
)}

{selectedCategory === 'commands' && (
  <CapabilityManagementSection type="command" selectedProjectPath={selectedProjectPath} />
)}
```

在 `AgentCategoryTabsSection.tsx` 增加 tab：

```tsx
{category === 'skills' && 'Skills'}
{category === 'commands' && 'Commands'}
```

- [ ] **Step 5：运行测试和构建**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/settings/view/tabs/AgentsSettingsTab.phase2.test.mjs
npm run build
```

期望：全部通过。

- [ ] **Step 6：提交**

```bash
git add src/components/settings/view/tabs/agents-settings/sections/content/CapabilityManagementSection.tsx src/components/settings/view/tabs/AgentsSettingsTab.tsx src/components/settings/view/tabs/agents-settings/sections/AgentCategoryTabsSection.tsx src/components/settings/view/tabs/agents-settings/types.ts src/i18n/locales/zh-CN/settings.json src/components/settings/view/tabs/AgentsSettingsTab.phase2.test.mjs
git commit -m "feat: add skills and commands management ui"
```

---

## Task 10：Hooks 入口整合

**文件：**
- 新增：`src/components/settings/view/tabs/agents-settings/sections/content/HooksEntrySection.tsx`
- 修改：`src/components/settings/view/tabs/AgentsSettingsTab.tsx`
- 修改：`src/components/settings/view/tabs/agents-settings/sections/AgentCategoryTabsSection.tsx`
- 修改：`src/i18n/locales/zh-CN/settings.json`
- 修改：`src/components/settings/view/tabs/AgentsSettingsTab.phase2.test.mjs`

- [ ] **Step 1：扩展 source 测试**

追加：

```js
test('phase2 settings surface links to hooks management pages', async () => {
  const source = await readFile('src/components/settings/view/tabs/agents-settings/sections/content/HooksEntrySection.tsx', 'utf8');
  assert.match(source, /\/api\/hooks\/overview/);
  assert.match(source, /\/hooks/);
});
```

- [ ] **Step 2：实现 Hooks 入口区块**

创建 `HooksEntrySection.tsx`：

```tsx
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Badge } from '../../../../../../shared/view/ui';
import { authenticatedFetch } from '../../../../../../utils/api';

export default function HooksEntrySection({ selectedProjectPath }: { selectedProjectPath?: string | null }) {
  const [summary, setSummary] = useState<{ total?: number; writable?: number; readonly?: number }>({});

  const loadSummary = useCallback(async () => {
    const query = selectedProjectPath ? `?projectPath=${encodeURIComponent(selectedProjectPath)}` : '';
    const response = await authenticatedFetch(`/api/hooks/overview${query}`);
    const payload = await response.json();
    const entries = Array.isArray(payload?.entries) ? payload.entries : [];
    setSummary({
      total: entries.length,
      writable: entries.filter((entry: any) => entry?.source?.writable).length,
      readonly: entries.filter((entry: any) => entry?.source && !entry.source.writable).length,
    });
  }, [selectedProjectPath]);

  useEffect(() => { void loadSummary(); }, [loadSummary]);

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card/50 p-4">
      <h3 className="text-lg font-medium text-foreground">Hooks 管理</h3>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">总数 {summary.total || 0}</Badge>
        <Badge variant="outline">可写 {summary.writable || 0}</Badge>
        <Badge variant="outline">只读 {summary.readonly || 0}</Badge>
      </div>
      <Button asChild variant="outline">
        <Link to={selectedProjectPath ? `/hooks?projectPath=${encodeURIComponent(selectedProjectPath)}` : '/hooks'}>
          打开 Hooks 管理
        </Link>
      </Button>
    </section>
  );
}
```

- [ ] **Step 3：挂到设置页**

```tsx
{selectedCategory === 'hooks' && (
  <HooksEntrySection selectedProjectPath={selectedProjectPath} />
)}
```

- [ ] **Step 4：运行测试和构建**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/settings/view/tabs/AgentsSettingsTab.phase2.test.mjs
npm run build
```

期望：全部通过。

- [ ] **Step 5：提交**

```bash
git add src/components/settings/view/tabs/agents-settings/sections/content/HooksEntrySection.tsx src/components/settings/view/tabs/AgentsSettingsTab.tsx src/components/settings/view/tabs/agents-settings/sections/AgentCategoryTabsSection.tsx src/i18n/locales/zh-CN/settings.json src/components/settings/view/tabs/AgentsSettingsTab.phase2.test.mjs
git commit -m "feat: link hooks management from claude settings"
```

---

## Task 11：最终验证和手动验收说明

**文件：**
- 新增：`docs/superpowers/verification/2026-05-09-phase2-web-config-management.md`

- [ ] **Step 1：运行后端目标测试**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test \
  server/utils/managed-source.test.mjs \
  server/utils/claude-runtime-config-service.test.mjs \
  server/routes/claude-config.test.mjs \
  server/utils/mcp-config-service.test.mjs \
  server/routes/mcp.test.mjs \
  server/utils/plugin-management-service.test.mjs \
  server/routes/plugins.test.mjs \
  server/utils/capability-catalog-service.test.mjs \
  server/routes/capabilities.test.mjs
```

期望：全部通过。

- [ ] **Step 2：运行前端 source 测试**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test \
  src/components/settings/view/tabs/AgentsSettingsTab.phase2.test.mjs \
  src/components/settings/view/tabs/AgentsSettingsTab.lite.test.mjs
```

期望：全部通过。

- [ ] **Step 3：运行构建**

```bash
npm run build
```

期望：构建成功。已有大 chunk warning 不作为失败。

- [ ] **Step 4：写验收说明**

创建 `docs/superpowers/verification/2026-05-09-phase2-web-config-management.md`：

```md
# 第二阶段网页配置管理验收说明

## 自动验证

- 后端目标测试通过。
- 前端 source 测试通过。
- `npm run build` 通过。

## 手动验收

1. 打开 `npm run dev`。
2. 进入设置页的智能体区域。
3. 在账号与运行配置里保存 Base URL 和模型字段，确认写入 `~/.claude/settings.json`。
4. 在 MCP 区块新增一个 user 级 stdio MCP，确认出现在列表。
5. 编辑刚才的 MCP，确认配置文件只改目标条目。
6. 删除刚才的 MCP，确认其它 MCP 保留。
7. 在插件区导入本地插件目录，确认显示为 Lite 来源。
8. 停用再启用一个 CLI 插件，确认 `~/.claude/settings.json.enabledPlugins` 更新。
9. 在 Skills 区块创建 user skill，确认写入 `~/.claude/skills/<name>/SKILL.md`。
10. 在 Commands 区块创建 user command，确认写入 `~/.claude/commands/<name>.md`。
11. 打开 Hooks 区块，确认可以跳转到 hooks 管理页面。
12. 关闭 Claude Code CLI，重复 MCP、插件、skill、command 管理，确认不需要 CLI。
```

- [ ] **Step 5：提交**

```bash
git add docs/superpowers/verification/2026-05-09-phase2-web-config-management.md
git commit -m "docs: add phase2 web config verification"
```

---

## 自检清单

- 运行配置：Task 2 和 Task 6 覆盖。
- MCP 增删改查：Task 3 和 Task 7 覆盖。
- 插件列表、导入、启停、移除：Task 4 和 Task 8 覆盖。
- Skills/Commands 目录和写入：Task 5 和 Task 9 覆盖。
- Hooks 入口：Task 10 覆盖。
- 最终验证：Task 11 覆盖。
- 不做远程 marketplace：所有任务均未包含远程安装。
- 不调用 `claude`：所有后端任务均通过 JSON 文件和已有服务实现。
