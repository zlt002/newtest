# Lite CLI-Independent Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CC UI Lite core runtime configuration, MCP management, and local plugin loading work without requiring Claude Code CLI.

**Architecture:** Phase 1 keeps Claude Agent SDK as the runtime, moves MCP add/edit/delete to JSON file services, and resolves plugins from Lite-managed local paths plus existing Claude CLI install records. CLI remains detectable, but no core Phase 1 write path should spawn `claude`.

**Tech Stack:** Node.js ESM, Express routes, `node:test`, React/TypeScript settings UI, `@anthropic-ai/claude-agent-sdk`.

---

## Scope Check

The approved design covers multiple subsystems. This plan implements the first independently testable slice:

- JSON-based MCP management.
- Lite local plugin registry and local plugin import support.
- SDK runtime plugin resolution from Lite registry and existing CLI install records.
- Command/skill catalog read-only groundwork.
- Minimal UI wiring needed to prove the new non-CLI backend paths.

Remote marketplace install, full plugin marketplace UI, full command editor, and runtime status dashboard are intentionally left for later phase plans.

## File Structure

- Create `server/utils/json-file-store.js`: shared safe JSON read-merge-write helpers.
- Create `server/utils/lite-registry.js`: read/write `~/.ccui/lite-registry.json` and normalize plugin metadata.
- Create `server/utils/mcp-config-service.js`: MCP read/create/update/delete against config files.
- Modify `server/routes/mcp.js`: keep `/config/read`, add JSON write routes, deprecate CLI write routes from the UI path.
- Create `server/routes/plugins.js`: plugin list/import/enable/disable/reload APIs.
- Modify `server/index.js`: mount plugin routes.
- Modify `server/utils/claude-plugin-config.js`: merge Lite registry plugins with existing CLI `installed_plugins.json`.
- Modify `server/services/agent/application/create-agent-v2-services.js`: expose live session listing for plugin reload.
- Modify `src/components/settings/view/tabs/AgentsSettingsTab.tsx`: keep MCP reads on JSON config routes and add a minimal plugin list/reload section.
- Tests:
  - `server/utils/json-file-store.test.mjs`
  - `server/utils/lite-registry.test.mjs`
  - `server/utils/mcp-config-service.test.mjs`
  - `server/routes/mcp.test.mjs`
  - `server/routes/plugins.test.mjs`
  - `server/utils/claude-plugin-config.test.mjs`
  - focused frontend/source tests where existing patterns allow static assertions.

---

### Task 1: Shared JSON File Store

**Files:**
- Create: `server/utils/json-file-store.js`
- Create: `server/utils/json-file-store.test.mjs`

- [ ] **Step 1: Write failing tests for safe JSON read and merge-write**

Create `server/utils/json-file-store.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  readJsonObjectFile,
  updateJsonObjectFile,
} from './json-file-store.js';

function createMemoryFs(initialFiles = {}) {
  const files = { ...initialFiles };
  const mkdirCalls = [];
  return {
    files,
    mkdirCalls,
    async readFile(filepath, encoding) {
      assert.equal(encoding, 'utf8');
      if (!(filepath in files)) {
        const error = new Error(`ENOENT: ${filepath}`);
        error.code = 'ENOENT';
        throw error;
      }
      return files[filepath];
    },
    async mkdir(filepath, options) {
      mkdirCalls.push({ filepath, options });
    },
    async writeFile(filepath, content, encoding) {
      assert.equal(encoding, 'utf8');
      files[filepath] = content;
    },
  };
}

test('readJsonObjectFile returns empty object for missing or invalid files', async () => {
  const fs = createMemoryFs({
    '/bad.json': 'not json',
    '/array.json': '[]',
  });

  assert.deepEqual(await readJsonObjectFile('/missing.json', { fileSystem: fs }), {});
  assert.deepEqual(await readJsonObjectFile('/bad.json', { fileSystem: fs }), {});
  assert.deepEqual(await readJsonObjectFile('/array.json', { fileSystem: fs }), {});
});

test('updateJsonObjectFile preserves unknown fields and writes formatted JSON', async () => {
  const fs = createMemoryFs({
    '/tmp/settings.json': JSON.stringify({
      permissions: { allow: ['Read(*)'] },
      env: { EXISTING: 'keep' },
    }),
  });

  const result = await updateJsonObjectFile('/tmp/settings.json', (current) => ({
    ...current,
    env: {
      ...current.env,
      ANTHROPIC_MODEL: 'sonnet',
    },
  }), { fileSystem: fs });

  assert.deepEqual(result, {
    permissions: { allow: ['Read(*)'] },
    env: {
      EXISTING: 'keep',
      ANTHROPIC_MODEL: 'sonnet',
    },
  });
  assert.equal(
    fs.files['/tmp/settings.json'],
    `${JSON.stringify(result, null, 2)}\n`,
  );
  assert.deepEqual(fs.mkdirCalls, [
    { filepath: '/tmp', options: { recursive: true } },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/utils/json-file-store.test.mjs
```

Expected: fails because `server/utils/json-file-store.js` does not exist.

- [ ] **Step 3: Implement JSON helpers**

Create `server/utils/json-file-store.js`:

```js
import fs from 'node:fs/promises';
import path from 'node:path';

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export async function readJsonObjectFile(filepath, {
  fileSystem = fs,
} = {}) {
  try {
    return normalizeObject(JSON.parse(await fileSystem.readFile(filepath, 'utf8')));
  } catch {
    return {};
  }
}

export async function updateJsonObjectFile(filepath, updater, {
  fileSystem = fs,
} = {}) {
  const current = await readJsonObjectFile(filepath, { fileSystem });
  const next = normalizeObject(await updater(current));
  await fileSystem.mkdir(path.dirname(filepath), { recursive: true });
  await fileSystem.writeFile(filepath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/utils/json-file-store.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/utils/json-file-store.js server/utils/json-file-store.test.mjs
git commit -m "feat: add safe json file store"
```

---

### Task 2: Lite Plugin Registry

**Files:**
- Create: `server/utils/lite-registry.js`
- Create: `server/utils/lite-registry.test.mjs`

- [ ] **Step 1: Write failing registry tests**

Create `server/utils/lite-registry.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  getLiteRegistryPath,
  listLitePlugins,
  upsertLitePlugin,
  setLitePluginEnabled,
} from './lite-registry.js';

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

test('getLiteRegistryPath uses ~/.ccui/lite-registry.json', () => {
  assert.equal(
    getLiteRegistryPath('/tmp/home'),
    path.join('/tmp/home', '.ccui', 'lite-registry.json'),
  );
});

test('upsertLitePlugin writes normalized plugin metadata and listLitePlugins reads it back', async () => {
  const fs = createMemoryFs();
  const homeDir = '/tmp/home';
  const plugin = await upsertLitePlugin({
    homeDir,
    fileSystem: fs,
    plugin: {
      id: 'superpowers@claude-plugins-official',
      name: 'Superpowers',
      version: '5.0.7',
      path: '/tmp/plugins/superpowers/5.0.7',
      source: 'local-directory',
      enabled: true,
    },
  });

  assert.deepEqual(plugin, {
    id: 'superpowers@claude-plugins-official',
    name: 'Superpowers',
    version: '5.0.7',
    path: '/tmp/plugins/superpowers/5.0.7',
    source: 'local-directory',
    enabled: true,
  });
  assert.deepEqual(await listLitePlugins({ homeDir, fileSystem: fs }), [plugin]);
});

test('setLitePluginEnabled toggles an existing plugin without dropping metadata', async () => {
  const homeDir = '/tmp/home';
  const registryPath = getLiteRegistryPath(homeDir);
  const fs = createMemoryFs({
    [registryPath]: JSON.stringify({
      plugins: [{
        id: 'demo@local',
        name: 'Demo',
        version: '1.0.0',
        path: '/tmp/demo',
        source: 'zip',
        enabled: true,
      }],
    }),
  });

  const updated = await setLitePluginEnabled({
    homeDir,
    fileSystem: fs,
    id: 'demo@local',
    enabled: false,
  });

  assert.equal(updated.enabled, false);
  assert.deepEqual(await listLitePlugins({ homeDir, fileSystem: fs }), [{
    id: 'demo@local',
    name: 'Demo',
    version: '1.0.0',
    path: '/tmp/demo',
    source: 'zip',
    enabled: false,
  }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/utils/lite-registry.test.mjs
```

Expected: fails because `lite-registry.js` does not exist.

- [ ] **Step 3: Implement Lite registry**

Create `server/utils/lite-registry.js`:

```js
import os from 'node:os';
import path from 'node:path';

import { readJsonObjectFile, updateJsonObjectFile } from './json-file-store.js';

export function getLiteRegistryPath(homeDir = os.homedir()) {
  return path.join(homeDir, '.ccui', 'lite-registry.json');
}

function normalizePlugin(plugin) {
  const id = typeof plugin?.id === 'string' ? plugin.id.trim() : '';
  const pluginPath = typeof plugin?.path === 'string' ? plugin.path.trim() : '';
  if (!id || !pluginPath) {
    return null;
  }
  return {
    id,
    name: typeof plugin.name === 'string' && plugin.name.trim() ? plugin.name.trim() : id,
    version: typeof plugin.version === 'string' && plugin.version.trim() ? plugin.version.trim() : 'local',
    path: pluginPath,
    source: typeof plugin.source === 'string' && plugin.source.trim() ? plugin.source.trim() : 'local-directory',
    enabled: plugin.enabled !== false,
  };
}

function normalizePlugins(value) {
  return (Array.isArray(value) ? value : [])
    .map(normalizePlugin)
    .filter(Boolean);
}

export async function listLitePlugins({
  homeDir = os.homedir(),
  fileSystem,
} = {}) {
  const registry = await readJsonObjectFile(getLiteRegistryPath(homeDir), { fileSystem });
  return normalizePlugins(registry.plugins);
}

export async function upsertLitePlugin({
  homeDir = os.homedir(),
  fileSystem,
  plugin,
} = {}) {
  const normalized = normalizePlugin(plugin);
  if (!normalized) {
    const error = new Error('Plugin id and path are required.');
    error.statusCode = 400;
    throw error;
  }
  await updateJsonObjectFile(getLiteRegistryPath(homeDir), (current) => {
    const plugins = normalizePlugins(current.plugins).filter((entry) => entry.id !== normalized.id);
    return {
      ...current,
      plugins: [...plugins, normalized],
    };
  }, { fileSystem });
  return normalized;
}

export async function setLitePluginEnabled({
  homeDir = os.homedir(),
  fileSystem,
  id,
  enabled,
} = {}) {
  const normalizedId = typeof id === 'string' ? id.trim() : '';
  let updated = null;
  await updateJsonObjectFile(getLiteRegistryPath(homeDir), (current) => {
    const plugins = normalizePlugins(current.plugins).map((plugin) => {
      if (plugin.id !== normalizedId) {
        return plugin;
      }
      updated = { ...plugin, enabled: Boolean(enabled) };
      return updated;
    });
    return { ...current, plugins };
  }, { fileSystem });
  if (!updated) {
    const error = new Error(`Plugin not found: ${normalizedId}`);
    error.statusCode = 404;
    throw error;
  }
  return updated;
}

export function litePluginsToSdkPlugins(plugins = []) {
  const seen = new Set();
  const sdkPlugins = [];
  for (const plugin of normalizePlugins(plugins)) {
    if (!plugin.enabled || seen.has(plugin.path)) {
      continue;
    }
    seen.add(plugin.path);
    sdkPlugins.push({ type: 'local', path: plugin.path });
  }
  return sdkPlugins;
}
```

- [ ] **Step 4: Run registry tests**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/utils/json-file-store.test.mjs server/utils/lite-registry.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/utils/lite-registry.js server/utils/lite-registry.test.mjs
git commit -m "feat: add lite plugin registry"
```

---

### Task 3: MCP Config Service Without CLI

**Files:**
- Create: `server/utils/mcp-config-service.js`
- Create: `server/utils/mcp-config-service.test.mjs`
- Modify: `server/routes/mcp.js`
- Modify: `server/routes/mcp.test.mjs`

- [ ] **Step 1: Write failing service tests**

Create `server/utils/mcp-config-service.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createMcpServerConfig,
  deleteMcpServerConfig,
  updateMcpServerConfig,
} from './mcp-config-service.js';

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

test('createMcpServerConfig writes project scope to project .mcp.json', async () => {
  const fs = createMemoryFs();
  const result = await createMcpServerConfig({
    homeDir: '/tmp/home',
    projectPath: '/tmp/project',
    fileSystem: fs,
    scope: 'project',
    name: 'context7',
    config: {
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
    },
  });

  assert.equal(result.sourcePath, '/tmp/project/.mcp.json');
  assert.deepEqual(JSON.parse(fs.files['/tmp/project/.mcp.json']), {
    mcpServers: {
      context7: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp'],
      },
    },
  });
});

test('updateMcpServerConfig edits only the named server in the selected source file', async () => {
  const fs = createMemoryFs({
    '/tmp/project/.mcp.json': JSON.stringify({
      mcpServers: {
        keep: { command: 'node', args: ['keep.js'] },
        editme: { command: 'node', args: ['old.js'] },
      },
    }),
  });

  await updateMcpServerConfig({
    fileSystem: fs,
    sourcePath: '/tmp/project/.mcp.json',
    name: 'editme',
    config: { type: 'http', url: 'https://example.test/mcp' },
  });

  assert.deepEqual(JSON.parse(fs.files['/tmp/project/.mcp.json']).mcpServers, {
    keep: { command: 'node', args: ['keep.js'] },
    editme: { type: 'http', url: 'https://example.test/mcp' },
  });
});

test('deleteMcpServerConfig removes only the named server', async () => {
  const fs = createMemoryFs({
    '/tmp/home/.claude/settings.json': JSON.stringify({
      env: { ANTHROPIC_MODEL: 'sonnet' },
      mcpServers: {
        removeMe: { command: 'node', args: ['remove.js'] },
        keepMe: { command: 'node', args: ['keep.js'] },
      },
    }),
  });

  await deleteMcpServerConfig({
    fileSystem: fs,
    sourcePath: '/tmp/home/.claude/settings.json',
    name: 'removeMe',
  });

  assert.deepEqual(JSON.parse(fs.files['/tmp/home/.claude/settings.json']), {
    env: { ANTHROPIC_MODEL: 'sonnet' },
    mcpServers: {
      keepMe: { command: 'node', args: ['keep.js'] },
    },
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/utils/mcp-config-service.test.mjs
```

Expected: fails because `mcp-config-service.js` does not exist.

- [ ] **Step 3: Implement MCP config service**

Create `server/utils/mcp-config-service.js`:

```js
import os from 'node:os';
import path from 'node:path';

import { updateJsonObjectFile } from './json-file-store.js';

function normalizeName(name) {
  const value = typeof name === 'string' ? name.trim() : '';
  if (!value) {
    const error = new Error('MCP server name is required.');
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function normalizeConfig(config = {}) {
  const next = {};
  const type = typeof config.type === 'string' && config.type.trim() ? config.type.trim() : null;
  if (type) next.type = type;
  if (typeof config.command === 'string' && config.command.trim()) next.command = config.command.trim();
  if (Array.isArray(config.args)) next.args = config.args.map(String).filter(Boolean);
  if (config.env && typeof config.env === 'object' && !Array.isArray(config.env)) next.env = config.env;
  if (typeof config.url === 'string' && config.url.trim()) next.url = config.url.trim();
  if (config.headers && typeof config.headers === 'object' && !Array.isArray(config.headers)) next.headers = config.headers;

  if ((next.type === 'http' || next.type === 'sse') && !next.url) {
    const error = new Error(`${next.type} MCP servers require a url.`);
    error.statusCode = 400;
    throw error;
  }
  if ((!next.type || next.type === 'stdio') && !next.command) {
    const error = new Error('stdio MCP servers require a command.');
    error.statusCode = 400;
    throw error;
  }
  return next;
}

function resolveSourcePath({ scope = 'user', homeDir = os.homedir(), projectPath }) {
  if (scope === 'project') {
    if (!projectPath) {
      const error = new Error('projectPath is required for project MCP servers.');
      error.statusCode = 400;
      throw error;
    }
    return path.join(projectPath, '.mcp.json');
  }
  if (scope === 'legacy') {
    return path.join(homeDir, '.claude.json');
  }
  return path.join(homeDir, '.claude', 'settings.json');
}

async function writeServer({ sourcePath, name, config, fileSystem }) {
  const serverName = normalizeName(name);
  const serverConfig = normalizeConfig(config);
  const next = await updateJsonObjectFile(sourcePath, (current) => ({
    ...current,
    mcpServers: {
      ...(current.mcpServers && typeof current.mcpServers === 'object' && !Array.isArray(current.mcpServers)
        ? current.mcpServers
        : {}),
      [serverName]: serverConfig,
    },
  }), { fileSystem });
  return { sourcePath, name: serverName, config: next.mcpServers[serverName] };
}

export async function createMcpServerConfig({
  scope = 'user',
  homeDir = os.homedir(),
  projectPath,
  fileSystem,
  name,
  config,
} = {}) {
  return await writeServer({
    sourcePath: resolveSourcePath({ scope, homeDir, projectPath }),
    name,
    config,
    fileSystem,
  });
}

export async function updateMcpServerConfig({
  sourcePath,
  fileSystem,
  name,
  config,
} = {}) {
  if (!sourcePath) {
    const error = new Error('sourcePath is required.');
    error.statusCode = 400;
    throw error;
  }
  return await writeServer({ sourcePath, name, config, fileSystem });
}

export async function deleteMcpServerConfig({
  sourcePath,
  fileSystem,
  name,
} = {}) {
  const serverName = normalizeName(name);
  if (!sourcePath) {
    const error = new Error('sourcePath is required.');
    error.statusCode = 400;
    throw error;
  }
  await updateJsonObjectFile(sourcePath, (current) => {
    const mcpServers = current.mcpServers && typeof current.mcpServers === 'object' && !Array.isArray(current.mcpServers)
      ? { ...current.mcpServers }
      : {};
    delete mcpServers[serverName];
    return { ...current, mcpServers };
  }, { fileSystem });
  return { sourcePath, name: serverName };
}
```

- [ ] **Step 4: Wire JSON MCP routes**

Modify `server/routes/mcp.js` imports:

```js
import {
  createMcpServerConfig,
  deleteMcpServerConfig,
  updateMcpServerConfig,
} from '../utils/mcp-config-service.js';
```

Add routes near `/config/read`:

```js
router.post('/config', async (req, res) => {
  try {
    const result = await createMcpServerConfig({
      homeDir: os.homedir(),
      projectPath: req.body?.projectPath,
      scope: req.body?.scope,
      name: req.body?.name,
      config: req.body?.config,
      fileSystem: fs,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.patch('/config/:name', async (req, res) => {
  try {
    const result = await updateMcpServerConfig({
      sourcePath: req.body?.sourcePath,
      name: req.params.name,
      config: req.body?.config,
      fileSystem: fs,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.delete('/config/:name', async (req, res) => {
  try {
    const result = await deleteMcpServerConfig({
      sourcePath: req.body?.sourcePath || req.query?.sourcePath,
      name: req.params.name,
      fileSystem: fs,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
```

- [ ] **Step 5: Run MCP tests**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/utils/json-file-store.test.mjs server/utils/mcp-config-service.test.mjs server/routes/mcp.test.mjs
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/utils/mcp-config-service.js server/utils/mcp-config-service.test.mjs server/routes/mcp.js server/routes/mcp.test.mjs
git commit -m "feat: manage mcp config without claude cli"
```

---

### Task 4: Resolve Lite Plugins Into SDK Options

**Files:**
- Modify: `server/utils/claude-plugin-config.js`
- Modify: `server/utils/claude-plugin-config.test.mjs`

- [ ] **Step 1: Write failing test for Lite registry plugin loading**

Append to `server/utils/claude-plugin-config.test.mjs`:

```js
test('loadClaudePluginsSync includes enabled Lite registry plugins without CLI install records', async () => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'claude-plugin-config-'));
  const ccuiDir = path.join(tempHome, '.ccui');

  await mkdir(ccuiDir, { recursive: true });
  await writeFile(
    path.join(ccuiDir, 'lite-registry.json'),
    JSON.stringify({
      plugins: [
        {
          id: 'local-demo@ccui',
          name: 'Local Demo',
          version: '1.0.0',
          path: '/tmp/plugins/local-demo',
          source: 'local-directory',
          enabled: true,
        },
        {
          id: 'disabled-demo@ccui',
          name: 'Disabled Demo',
          version: '1.0.0',
          path: '/tmp/plugins/disabled-demo',
          source: 'local-directory',
          enabled: false,
        },
      ],
    }),
  );

  try {
    assert.deepEqual(loadClaudePluginsSync({ homeDir: tempHome }), [
      { type: 'local', path: '/tmp/plugins/local-demo' },
    ]);
  } finally {
    await rm(tempHome, { recursive: true, force: true });
  }
});

test('loadClaudePluginsSync deduplicates CLI and Lite plugins by path', async () => {
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'claude-plugin-config-'));
  const claudeDir = path.join(tempHome, '.claude');
  const pluginsDir = path.join(claudeDir, 'plugins');
  const ccuiDir = path.join(tempHome, '.ccui');

  await mkdir(pluginsDir, { recursive: true });
  await mkdir(ccuiDir, { recursive: true });
  await writeFile(
    path.join(claudeDir, 'settings.json'),
    JSON.stringify({ enabledPlugins: { 'demo@market': true } }),
  );
  await writeFile(
    path.join(pluginsDir, 'installed_plugins.json'),
    JSON.stringify({
      plugins: {
        'demo@market': [{ scope: 'user', installPath: '/tmp/plugins/demo' }],
      },
    }),
  );
  await writeFile(
    path.join(ccuiDir, 'lite-registry.json'),
    JSON.stringify({
      plugins: [{ id: 'demo@ccui', path: '/tmp/plugins/demo', enabled: true }],
    }),
  );

  try {
    assert.deepEqual(loadClaudePluginsSync({ homeDir: tempHome }), [
      { type: 'local', path: '/tmp/plugins/demo' },
    ]);
  } finally {
    await rm(tempHome, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/utils/claude-plugin-config.test.mjs
```

Expected: new tests fail because Lite registry plugins are not loaded.

- [ ] **Step 3: Merge Lite registry plugins into loader**

Modify `server/utils/claude-plugin-config.js`:

```js
import { listLitePlugins, litePluginsToSdkPlugins } from './lite-registry.js';
```

Because the current loader is sync, add sync registry helpers instead of converting call sites to async:

```js
function readLiteRegistryPluginsSync(homeDir) {
  const payload = readJsonFileSync(path.join(homeDir, '.ccui', 'lite-registry.json'));
  const plugins = Array.isArray(payload?.plugins) ? payload.plugins : [];
  return litePluginsToSdkPlugins(plugins);
}
```

Then update the end of `loadClaudePluginsSync`:

```js
  for (const plugin of readLiteRegistryPluginsSync(homeDir)) {
    if (!seenPaths.has(plugin.path)) {
      seenPaths.add(plugin.path);
      resolvedPlugins.push(plugin);
    }
  }

  return resolvedPlugins;
```

If importing `litePluginsToSdkPlugins` from an ESM module creates a cycle problem in tests, move the small normalization into `claude-plugin-config.js` and keep `lite-registry.js` as the async write API.

- [ ] **Step 4: Run plugin loader tests**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/utils/lite-registry.test.mjs server/utils/claude-plugin-config.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/utils/claude-plugin-config.js server/utils/claude-plugin-config.test.mjs
git commit -m "feat: load lite registry plugins"
```

---

### Task 5: Plugin Routes for Local Import and Reload

**Files:**
- Create: `server/routes/plugins.js`
- Create: `server/routes/plugins.test.mjs`
- Modify: `server/index.js`

- [ ] **Step 1: Write failing route tests**

Create `server/routes/plugins.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';

import pluginRoutes from './plugins.js';

async function startServer(homeDir) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.testHomeDir = homeDir;
    next();
  });
  app.use('/api/plugins', pluginRoutes);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  };
}

test('plugin routes import a local directory and list it', async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), 'plugins-home-'));
  const pluginDir = await mkdtemp(path.join(os.tmpdir(), 'plugins-source-'));
  await mkdir(path.join(pluginDir, '.claude-plugin'), { recursive: true });
  await writeFile(
    path.join(pluginDir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ id: 'demo@local', name: 'Demo Plugin', version: '1.0.0' }),
  );
  const { server, baseUrl } = await startServer(homeDir);

  try {
    const importResponse = await fetch(`${baseUrl}/api/plugins/import-directory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pluginDir }),
    });
    assert.equal(importResponse.status, 200);
    assert.equal((await importResponse.json()).plugin.id, 'demo@local');

    const listResponse = await fetch(`${baseUrl}/api/plugins`);
    const listPayload = await listResponse.json();
    assert.deepEqual(listPayload.plugins.map((plugin) => ({
      id: plugin.id,
      name: plugin.name,
      enabled: plugin.enabled,
    })), [{ id: 'demo@local', name: 'Demo Plugin', enabled: true }]);
  } finally {
    server.close();
    await rm(homeDir, { recursive: true, force: true });
    await rm(pluginDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/routes/plugins.test.mjs
```

Expected: fails because `server/routes/plugins.js` does not exist.

- [ ] **Step 3: Implement plugin routes**

Create `server/routes/plugins.js`:

```js
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  listLitePlugins,
  setLitePluginEnabled,
  upsertLitePlugin,
} from '../utils/lite-registry.js';
import { loadClaudePluginsSync } from '../utils/claude-plugin-config.js';
import { defaultAgentV2Runtime } from '../services/agent/application/create-agent-v2-services.js';

const router = express.Router();

function getHomeDir(req) {
  return req.testHomeDir || os.homedir();
}

async function readPluginManifest(pluginPath) {
  const manifestPath = path.join(pluginPath, '.claude-plugin', 'plugin.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const id = typeof manifest.id === 'string' && manifest.id.trim()
    ? manifest.id.trim()
    : `${manifest.name || path.basename(pluginPath)}@local`;
  return {
    id,
    name: typeof manifest.name === 'string' && manifest.name.trim() ? manifest.name.trim() : id,
    version: typeof manifest.version === 'string' && manifest.version.trim() ? manifest.version.trim() : 'local',
  };
}

router.get('/', async (req, res) => {
  try {
    const homeDir = getHomeDir(req);
    res.json({
      success: true,
      plugins: await listLitePlugins({ homeDir }),
      sdkPlugins: loadClaudePluginsSync({ homeDir }),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/import-directory', async (req, res) => {
  try {
    const pluginPath = typeof req.body?.path === 'string' ? req.body.path.trim() : '';
    if (!pluginPath) {
      return res.status(400).json({ success: false, error: 'Plugin path is required.' });
    }
    const manifest = await readPluginManifest(pluginPath);
    const plugin = await upsertLitePlugin({
      homeDir: getHomeDir(req),
      plugin: {
        ...manifest,
        path: pluginPath,
        source: 'local-directory',
        enabled: true,
      },
    });
    res.json({ success: true, plugin });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const plugin = await setLitePluginEnabled({
      homeDir: getHomeDir(req),
      id: req.params.id,
      enabled: req.body?.enabled,
    });
    res.json({ success: true, plugin });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

router.post('/reload', async (_req, res) => {
  try {
    const liveSessions = typeof defaultAgentV2Runtime.listLiveSessions === 'function'
      ? defaultAgentV2Runtime.listLiveSessions()
      : [];
    const results = [];
    for (const session of liveSessions) {
      if (typeof session.reloadPlugins === 'function') {
        results.push(await session.reloadPlugins());
      }
    }
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
```

`defaultAgentV2Runtime.listLiveSessions` is added in Task 6. Until that task is complete, `/api/plugins/reload` returns an empty `results` array when the method is unavailable; after Task 6, the same route reloads active sessions.

- [ ] **Step 4: Mount plugin routes**

Modify `server/index.js`:

```js
import pluginRoutes from './routes/plugins.js';
```

Add near other route mounts:

```js
app.use('/api/plugins', pluginRoutes);
```

- [ ] **Step 5: Run plugin route tests**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/routes/plugins.test.mjs
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/routes/plugins.js server/routes/plugins.test.mjs server/index.js
git commit -m "feat: add lite plugin routes"
```

---

### Task 6: Runtime Plugin Reload Support

**Files:**
- Modify: `server/services/agent/runtime/claude-v2-session-pool.js`
- Modify: `server/services/agent/runtime/claude-v2-session-pool.test.mjs`
- Modify: `server/services/agent/application/create-agent-v2-services.js`
- Modify: `server/services/agent/application/create-agent-v2-services.test.mjs`

- [ ] **Step 1: Write failing runtime reload tests**

Append to `server/services/agent/runtime/claude-v2-session-pool.test.mjs`:

```js
test('tracked session exposes reloadPlugins when SDK session supports it', async () => {
  const reloadResult = {
    commands: [],
    agents: [],
    plugins: [{ name: 'Demo', path: '/tmp/demo' }],
    mcpServers: [],
    error_count: 0,
  };
  const sdk = {
    query() {
      return {
        sessionId: 'sess-reload',
        async reloadPlugins() {
          return reloadResult;
        },
        async send() {},
        async *stream() {},
      };
    },
  };
  const pool = createClaudeV2SessionPool(sdk);
  const session = await pool.create({ projectPath: '/tmp/project' });

  assert.deepEqual(await session.reloadPlugins(), reloadResult);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/services/agent/runtime/claude-v2-session-pool.test.mjs
```

Expected: fails because tracked session does not expose `reloadPlugins()`.

- [ ] **Step 3: Add reloadPlugins to tracked sessions**

Modify `createTrackedSession` in `server/services/agent/runtime/claude-v2-session-pool.js`:

```js
    async reloadPlugins() {
      if (typeof session.reloadPlugins !== 'function') {
        throw new Error('Plugin reload is not supported by this Claude Agent SDK session');
      }
      const result = await session.reloadPlugins();
      entry.commandCatalog = null;
      entry.initializationData = {
        ...(entry.initializationData || {}),
        slashCommands: Array.isArray(result?.commands) ? result.commands.map((command) => command.name || command).filter(Boolean) : [],
        skills: Array.isArray(result?.skills) ? result.skills : [],
      };
      return result;
    },
```

Place this method next to `getContextUsage()`.

- [ ] **Step 4: Expose live sessions list in application service**

Find the exported `defaultAgentV2Runtime` service shape in `server/services/agent/application/create-agent-v2-services.js`. Add:

```js
listLiveSessions() {
  if (typeof runtime.listLiveSessions === 'function') {
    return runtime.listLiveSessions();
  }
  return [];
}
```

If the pool does not have `listLiveSessions`, add this method to `createClaudeV2SessionPool`:

```js
listLiveSessions() {
  return [...sessions.values()]
    .filter(isLiveSessionEntry)
    .map((entry) => createTrackedSession(entry.session, entry, pool));
}
```

Use the existing `sessions` map and `pool` object names from the file; keep this method near `getLiveSession`.

- [ ] **Step 5: Run runtime tests**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/services/agent/runtime/claude-v2-session-pool.test.mjs server/services/agent/application/create-agent-v2-services.test.mjs
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/services/agent/runtime/claude-v2-session-pool.js server/services/agent/runtime/claude-v2-session-pool.test.mjs server/services/agent/application/create-agent-v2-services.js server/services/agent/application/create-agent-v2-services.test.mjs
git commit -m "feat: expose sdk plugin reload"
```

---

### Task 7: Minimal Settings UI for Non-CLI MCP and Plugins

**Files:**
- Modify: `src/components/settings/view/tabs/AgentsSettingsTab.tsx`
- Modify or create focused source tests following existing frontend source-test style.

- [ ] **Step 1: Add source-level assertions for non-CLI endpoints**

Create `src/components/settings/view/tabs/AgentsSettingsTab.lite.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const SOURCE = 'src/components/settings/view/tabs/AgentsSettingsTab.tsx';

test('AgentsSettingsTab uses JSON MCP config routes instead of Claude MCP CLI routes', async () => {
  const source = await readFile(SOURCE, 'utf8');

  assert.match(source, /\\/api\\/mcp\\/config\\/read/);
  assert.doesNotMatch(source, /\\/api\\/mcp\\/cli\\/add/);
  assert.doesNotMatch(source, /\\/api\\/mcp\\/cli\\/remove/);
});

test('AgentsSettingsTab exposes plugin list and reload endpoints', async () => {
  const source = await readFile(SOURCE, 'utf8');

  assert.match(source, /\\/api\\/plugins/);
  assert.match(source, /\\/api\\/plugins\\/reload/);
});
```

- [ ] **Step 2: Run test to verify plugin assertions fail**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/settings/view/tabs/AgentsSettingsTab.lite.test.mjs
```

Expected: plugin endpoint assertion fails until UI is wired.

- [ ] **Step 3: Add minimal plugin list and reload UI**

Modify `src/components/settings/view/tabs/AgentsSettingsTab.tsx`:

Add state:

```ts
  const [plugins, setPlugins] = useState<Array<{ id: string; name: string; version?: string; path: string; enabled: boolean }>>([]);
  const [pluginsLoading, setPluginsLoading] = useState(false);
  const [pluginsError, setPluginsError] = useState<string | null>(null);
```

Add loader:

```ts
  const loadPlugins = useCallback(async () => {
    setPluginsLoading(true);
    setPluginsError(null);
    try {
      const response = await authenticatedFetch('/api/plugins');
      const payload = await response.json();
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || 'Failed to load plugins');
      }
      setPlugins(Array.isArray(payload?.plugins) ? payload.plugins : []);
    } catch (error) {
      setPluginsError(error instanceof Error ? error.message : 'Unknown error');
      setPlugins([]);
    } finally {
      setPluginsLoading(false);
    }
  }, []);
```

Call it in the existing `useEffect`:

```ts
    void loadPlugins();
```

Add reload handler:

```ts
  const reloadPlugins = useCallback(async () => {
    setPluginsError(null);
    try {
      const response = await authenticatedFetch('/api/plugins/reload', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error || 'Failed to reload plugins');
      }
      await loadPlugins();
    } catch (error) {
      setPluginsError(error instanceof Error ? error.message : 'Unknown error');
    }
  }, [loadPlugins]);
```

Add a compact plugin section below MCP in the `mcp` category for Phase 1:

```tsx
          <div className="rounded-lg border border-border bg-card/50 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-medium text-foreground">Plugins</h4>
                <p className="text-xs text-muted-foreground">Local plugins loaded through Claude Agent SDK.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => { void reloadPlugins(); }}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Reload
              </Button>
            </div>
            {pluginsError && (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {pluginsError}
              </div>
            )}
            {pluginsLoading ? (
              <div className="text-sm text-muted-foreground">Loading plugins...</div>
            ) : plugins.length === 0 ? (
              <div className="text-sm text-muted-foreground">No Lite-managed plugins installed.</div>
            ) : (
              <div className="space-y-2">
                {plugins.map((plugin) => (
                  <div key={plugin.id} className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">{plugin.name || plugin.id}</div>
                      <div className="truncate text-xs text-muted-foreground">{plugin.path}</div>
                    </div>
                    <Badge variant={plugin.enabled ? 'secondary' : 'outline'} className="text-xs">
                      {plugin.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
```

This is intentionally minimal. Full import/edit controls belong to Phase 2 UI. Phase 1 exposes import through the backend API and shows installed plugins plus reload status in settings.

- [ ] **Step 4: Run frontend source test and build**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/settings/view/tabs/AgentsSettingsTab.lite.test.mjs
npm run build
```

Expected: test passes and build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/view/tabs/AgentsSettingsTab.tsx src/components/settings/view/tabs/AgentsSettingsTab.lite.test.mjs
git commit -m "feat: show lite plugins in settings"
```

---

### Task 8: Phase 1 Verification

**Files:**
- Modify only if verification exposes a Phase 1 bug.

- [ ] **Step 1: Run focused backend tests**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test \
  server/utils/json-file-store.test.mjs \
  server/utils/lite-registry.test.mjs \
  server/utils/mcp-config-service.test.mjs \
  server/routes/mcp.test.mjs \
  server/routes/plugins.test.mjs \
  server/utils/claude-plugin-config.test.mjs \
  server/services/agent/runtime/claude-v2-session-pool.test.mjs \
  server/services/agent/application/create-agent-v2-services.test.mjs
```

Expected: all tests pass.

- [ ] **Step 2: Run focused frontend/source test**

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/settings/view/tabs/AgentsSettingsTab.lite.test.mjs
```

Expected: pass.

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: Vite build succeeds.

- [ ] **Step 4: Manual no-CLI smoke test**

Run:

```bash
TEST_HOME="/tmp/ccui-lite-phase1-home"
rm -rf "$TEST_HOME" && mkdir -p "$TEST_HOME"
npm run build
npm run release:mac-lite:arm64
cd /Users/zhanglt21/Desktop/accrnew/cc-ui/release/mac-lite
HOME="$TEST_HOME" SERVER_PORT=3002 PATH="/usr/bin:/bin:/usr/sbin:/sbin" /Users/zhanglt21/.nvm/versions/node/v24.15.0/bin/node server/index.js
```

Expected:

- `GET http://127.0.0.1:3002/api/cli/claude/status` reports `cliInstalled: false`.
- Account settings can save API config.
- MCP settings can read config from `$TEST_HOME/.claude/settings.json` and project `.mcp.json`.
- Plugin list endpoint returns an empty list instead of failing.

- [ ] **Step 5: Record verification result**

If verification passes without code changes, add a short note to the implementation PR or task summary:

```text
Phase 1 verification passed:
- focused backend tests passed
- focused frontend/source test passed
- npm run build passed
- no-CLI smoke test completed
```

If verification exposes a bug, return to the task that introduced the failing behavior, add a focused failing test there, fix it, and rerun this verification task.

---

## Self-Review Checklist

- Spec coverage:
  - JSON-based MCP management: Tasks 1 and 3.
  - Lite plugin registry: Task 2.
  - Plugin SDK resolution: Task 4.
  - Plugin routes and reload: Tasks 5 and 6.
  - Minimal UI proof: Task 7.
  - No-CLI verification: Task 8.
- Known deferred items:
  - Remote marketplace install is Phase 3.
  - Full plugin manager UI is Phase 2.
  - Full command/skill editor is Phase 2.
  - Runtime status dashboard is Phase 2.
- Red flag scan:
  - No step depends on `claude mcp ...`.
  - `/compact` remains SDK runtime behavior.
  - Secret handling is covered by the already implemented Claude settings readback behavior and should remain masked.
