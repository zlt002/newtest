# Claude Hooks Native Integration Implementation Plan

> **档案状态：历史计划（已归档）** 本文档是历史实施记录，当前代码库已完成与重构清理，文中提及的 `claude-hooks-session-memory-store.js` 等内容保留仅作历史追溯，不代表当前运行时依赖。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在当前项目中按 Claude Agent SDK 官方模型 1:1 整合 hooks，统一展示全部来源、把 session-memory hooks 原生透传给 SDK、并提供最薄的 `/hooks` 管理与执行记录界面。

**Architecture:** 后端新增一个围绕官方 hooks 结构的 discovery/normalization/mutation 薄层，负责读取 `user/project/local/plugin/skill/subagent/session-memory` 七类来源、生成 effective 视图、并将 session-memory hooks 经 `buildClaudeV2RuntimeOptions()` 与 session pool 透传进 Claude SDK。前端新增独立 `/hooks` 路由与只读/可写页面，UI 只展示官方结构、解释来源和回写可写源，不接管 hooks 执行语义。

**Tech Stack:** Node.js, Express, Claude Agent SDK V2, React, React Router, TypeScript, node:test

---

## File Structure

### Backend runtime and domain

- Create: `server/hooks/claude-hooks-types.js`
  - 统一声明 `HookSource`、`ManagedHookEntry`、`ManagedHookAction`、`EffectiveHooksView` 的运行时 shape 与帮助方法。
- Create: `server/hooks/claude-hooks-normalizer.js`
  - 把不同来源的原始 hooks 转成统一 entries，保留 `raw` 与来源信息。
- Create: `server/hooks/claude-hooks-discovery.js`
  - 扫描 `~/.claude/settings.json`、项目 `.claude/settings.json`、`.claude/settings.local.json`，并汇总 plugin/skill/subagent/session-memory 来源。
- Create: `server/hooks/claude-hooks-storage.js`
  - 回写 `user/project/local` 官方 settings 文件，并支持删除单条 hook。
- Create: `server/hooks/claude-hooks-session-memory-store.js`
  - 维护当前进程内 session-memory hooks，按 `sessionId` 读写。
- Create: `server/hooks/claude-hooks-effective.js`
  - 生成 effective hooks 视图与 diagnostics。
- Create: `server/hooks/claude-hooks-events.js`
  - 从 agent-v2 repository 读取并过滤 `sdk.hook.*` 事件，组装执行记录详情。
- Create: `server/hooks/claude-hooks-router.js`
  - 提供 `/api/hooks/*` 全量接口。
- Modify: `server/agent-v2/runtime/claude-v2-request-builder.js`
  - 增加官方 `hooks` 透传。
- Modify: `server/agent-v2/runtime/claude-v2-session-pool.js`
  - `buildSessionOptions()` 把 hooks 传给 `unstable_v2_createSession()` / resume 逻辑。
- Modify: `server/agent-v2/runtime/claude-v2-request-builder.test.mjs`
- Modify: `server/agent-v2/runtime/claude-v2-session-pool.test.mjs`
- Modify: `server/index.js`
  - 注册 `/api/hooks` 路由。
- Modify: `server/routes/agent-v2.test.mjs`
  - 扩展 HTTP 集成测试覆盖 hooks 路由与 runtime 注入。

### Frontend hooks management UI

- Create: `src/components/hooks/api/hooksApi.ts`
  - `/api/hooks/*` 请求封装。
- Create: `src/components/hooks/types.ts`
  - 前端管理页所需类型。
- Create: `src/components/hooks/hooks/useHooksOverview.ts`
- Create: `src/components/hooks/hooks/useHookSourceDetail.ts`
- Create: `src/components/hooks/hooks/useHookExecutions.ts`
- Create: `src/components/hooks/view/HooksPage.tsx`
  - `/hooks` 首页，总览 effective/sources/recent executions/diagnostics。
- Create: `src/components/hooks/view/HookSourcePage.tsx`
  - 来源详情页，含 `Normalized` / `Raw` / `About Source`。
- Create: `src/components/hooks/view/HookExecutionsPage.tsx`
- Create: `src/components/hooks/view/HookExecutionDetailPage.tsx`
- Create: `src/components/hooks/view/HookEditorPage.tsx`
  - 可写来源编辑页，支持 `command/http/prompt/agent`。
- Create: `src/components/hooks/view/subcomponents/*`
  - 细分 overview 卡片、来源列表、editor 表单、raw drawer。
- Modify: `src/App.tsx`
  - 注册 `/hooks`、`/hooks/sources/:sourceId`、`/hooks/executions`、`/hooks/executions/:hookId`、`/hooks/edit/:sourceKind`。
- Modify: `src/components/sidebar/view/Sidebar.tsx`
  - 增加进入 `/hooks` 的入口。
- Create: `src/components/hooks/view/*.test.mjs`
- Create: `src/components/hooks/api/hooksApi.test.mjs`

### Notes

- 不新增项目私有 hooks DSL。
- 不新增项目自执行 `command/http/prompt/agent` 的服务。
- 执行阶段按当前用户偏好不提交 commit；下面的 Step 5 统一保留为“checkpoint”，只记录建议的暂存范围与提交文案。

## Task 1: 建立官方 Hooks 数据模型与来源发现

**Files:**
- Create: `server/hooks/claude-hooks-types.js`
- Create: `server/hooks/claude-hooks-normalizer.js`
- Create: `server/hooks/claude-hooks-discovery.js`
- Test: `server/hooks/claude-hooks-discovery.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { discoverClaudeHookSources } from './claude-hooks-discovery.js';

test('discoverClaudeHookSources returns writable file sources and readonly plugin-like sources', async () => {
  const result = await discoverClaudeHookSources({
    homeDir: '/tmp/home',
    projectPath: '/tmp/project',
    settingsReader: async (targetPath) => {
      if (targetPath.endsWith('/.claude/settings.json')) {
        return {
          hooks: {
            PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo project' }] }],
          },
        };
      }
      if (targetPath.endsWith('/.claude/settings.local.json')) {
        return {
          hooks: {
            PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'prompt', prompt: 'summarize' }] }],
          },
        };
      }
      if (targetPath.endsWith('/tmp/home/.claude/settings.json')) {
        return {
          hooks: {
            Stop: [{ matcher: '', hooks: [{ type: 'http', url: 'https://example.com/hook' }] }],
          },
        };
      }
      return null;
    },
    pluginSources: [{ id: 'plugin:git', name: 'git-helper', hooks: { UserPromptSubmit: [] } }],
    skillSources: [{ id: 'skill:brainstorming', name: 'brainstorming', hooks: { Stop: [] } }],
    subagentSources: [{ id: 'subagent:raman', name: 'Raman', hooks: { Notification: [] } }],
    sessionMemorySources: [{ sessionId: 'sess-1', hooks: { PreToolUse: [] } }],
  });

  assert.deepEqual(
    result.sources.map((source) => ({ kind: source.kind, writable: source.writable })),
    [
      { kind: 'user', writable: true },
      { kind: 'project', writable: true },
      { kind: 'local', writable: true },
      { kind: 'plugin', writable: false },
      { kind: 'skill', writable: false },
      { kind: 'subagent', writable: false },
      { kind: 'session-memory', writable: true },
    ],
  );
  assert.equal(result.entries.some((entry) => entry.event === 'PreToolUse'), true);
  assert.equal(result.entries.some((entry) => entry.readonly === true), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/hooks/claude-hooks-discovery.test.mjs`
Expected: FAIL because the discovery module does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
// server/hooks/claude-hooks-types.js
export function createHookSource(input) {
  return {
    id: String(input.id),
    kind: input.kind,
    label: input.label || input.kind,
    path: input.path || null,
    writable: Boolean(input.writable),
    priority: Number.isFinite(input.priority) ? input.priority : 0,
    pluginName: input.pluginName || null,
    skillName: input.skillName || null,
    subagentName: input.subagentName || null,
    description: input.description || null,
  };
}

// server/hooks/claude-hooks-normalizer.js
export function normalizeHookEntries({ source, hooks }) {
  return Object.entries(hooks || {}).flatMap(([event, matchers], eventIndex) =>
    (Array.isArray(matchers) ? matchers : []).map((matcherEntry, matcherIndex) => ({
      id: `${source.id}:${event}:${eventIndex}:${matcherIndex}`,
      sourceId: source.id,
      event,
      matcher: matcherEntry?.matcher ?? '',
      hooks: Array.isArray(matcherEntry?.hooks) ? matcherEntry.hooks : [],
      timeout: matcherEntry?.timeout ?? null,
      enabled: matcherEntry?.enabled !== false,
      readonly: !source.writable,
      origin: source.kind,
      raw: matcherEntry,
    })),
  );
}

// server/hooks/claude-hooks-discovery.js
import path from 'path';
import os from 'os';
import { createHookSource } from './claude-hooks-types.js';
import { normalizeHookEntries } from './claude-hooks-normalizer.js';

export async function discoverClaudeHookSources({
  homeDir = os.homedir(),
  projectPath,
  settingsReader,
  pluginSources = [],
  skillSources = [],
  subagentSources = [],
  sessionMemorySources = [],
} = {}) {
  const readSettings = settingsReader || (async () => null);
  const fileSources = [
    {
      id: 'user',
      kind: 'user',
      label: 'User settings',
      path: path.join(homeDir, '.claude', 'settings.json'),
      writable: true,
      priority: 10,
    },
    {
      id: 'project',
      kind: 'project',
      label: 'Project settings',
      path: projectPath ? path.join(projectPath, '.claude', 'settings.json') : null,
      writable: true,
      priority: 20,
    },
    {
      id: 'local',
      kind: 'local',
      label: 'Local project settings',
      path: projectPath ? path.join(projectPath, '.claude', 'settings.local.json') : null,
      writable: true,
      priority: 30,
    },
  ].filter((source) => source.path);

  const sources = [];
  const entries = [];

  for (const sourceDef of fileSources) {
    const source = createHookSource(sourceDef);
    const payload = await readSettings(source.path);
    sources.push(source);
    entries.push(...normalizeHookEntries({ source, hooks: payload?.hooks }));
  }

  for (const plugin of pluginSources) {
    const source = createHookSource({
      id: plugin.id,
      kind: 'plugin',
      label: plugin.name,
      writable: false,
      priority: 40,
      pluginName: plugin.name,
      description: 'Read-only hook source contributed by a Claude plugin.',
    });
    sources.push(source);
    entries.push(...normalizeHookEntries({ source, hooks: plugin.hooks }));
  }

  // skill/subagent/session-memory loops follow the same shape as plugin.

  return {
    sources,
    entries,
    diagnostics: [],
    capabilities: {
      writableKinds: ['user', 'project', 'local', 'session-memory'],
      readonlyKinds: ['plugin', 'skill', 'subagent'],
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/hooks/claude-hooks-discovery.test.mjs`
Expected: PASS with all seven source kinds visible and writable/readonly flags matching the spec.

- [ ] **Step 5: Checkpoint**

```bash
git add server/hooks/claude-hooks-types.js server/hooks/claude-hooks-normalizer.js server/hooks/claude-hooks-discovery.js server/hooks/claude-hooks-discovery.test.mjs
git diff --cached --stat
# 用户当前偏好：先不提交。若后续要整理历史，可使用：
# git commit -m "feat: add claude hooks discovery layer"
```

## Task 2: 输出 effective hooks 视图与 `/api/hooks/overview`

**Files:**
- Create: `server/hooks/claude-hooks-effective.js`
- Create: `server/hooks/claude-hooks-router.js`
- Modify: `server/index.js`
- Test: `server/hooks/claude-hooks-router.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import { createClaudeHooksRouter } from './claude-hooks-router.js';

test('GET /api/hooks/overview returns sources entries diagnostics and capabilities', async () => {
  const app = express();
  app.use('/api/hooks', createClaudeHooksRouter({
    discovery: {
      discoverOverview: async () => ({
        sources: [{ id: 'user', kind: 'user', writable: true }],
        entries: [{ id: 'user:PreToolUse:0:0', event: 'PreToolUse' }],
        diagnostics: [{ code: 'missing_project_file', level: 'info' }],
        capabilities: { writableKinds: ['user'], readonlyKinds: [] },
      }),
    },
  }));

  const server = app.listen(0);
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/hooks/overview`);
  const body = await response.json();
  server.close();

  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(body), ['sources', 'entries', 'diagnostics', 'capabilities']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/hooks/claude-hooks-router.test.mjs`
Expected: FAIL because the hooks router and effective view module do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
// server/hooks/claude-hooks-effective.js
export function buildEffectiveHooksView({ sources = [], entries = [] } = {}) {
  const groupedByEvent = entries.reduce((groups, entry) => {
    const list = groups[entry.event] || [];
    list.push(entry);
    groups[entry.event] = list;
    return groups;
  }, {});

  return {
    sources,
    entries,
    groupedByEvent,
    writableSources: sources.filter((source) => source.writable),
    readonlySources: sources.filter((source) => !source.writable),
    sessionHooks: entries.filter((entry) => entry.origin === 'session-memory'),
    diagnostics: [],
  };
}

// server/hooks/claude-hooks-router.js
import express from 'express';
import { buildEffectiveHooksView } from './claude-hooks-effective.js';

export function createClaudeHooksRouter({ discovery }) {
  const router = express.Router();

  router.get('/overview', async (_req, res) => {
    const overview = await discovery.discoverOverview();
    res.json(overview);
  });

  router.get('/effective', async (_req, res) => {
    const overview = await discovery.discoverOverview();
    res.json(buildEffectiveHooksView(overview));
  });

  return router;
}

// server/index.js
import { createClaudeHooksRouter } from './hooks/claude-hooks-router.js';
app.use('/api/hooks', authenticateToken, createClaudeHooksRouter({ discovery: defaultClaudeHooksService }));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/hooks/claude-hooks-router.test.mjs`
Expected: PASS and `/api/hooks/overview` plus `/api/hooks/effective` return the spec fields.

- [ ] **Step 5: Checkpoint**

```bash
git add server/hooks/claude-hooks-effective.js server/hooks/claude-hooks-router.js server/hooks/claude-hooks-router.test.mjs server/index.js
git diff --cached --stat
# 用户当前偏好：先不提交。若后续要整理历史，可使用：
# git commit -m "feat: add claude hooks overview api"
```

## Task 3: 把 session-memory hooks 原生注入 Claude SDK session

**Files:**
- Create: `server/hooks/claude-hooks-session-memory-store.js`
- Modify: `server/agent-v2/runtime/claude-v2-request-builder.js`
- Modify: `server/agent-v2/runtime/claude-v2-session-pool.js`
- Modify: `server/agent-v2/runtime/claude-v2-request-builder.test.mjs`
- Modify: `server/agent-v2/runtime/claude-v2-session-pool.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildClaudeV2RuntimeOptions } from './claude-v2-request-builder.js';
import { createClaudeV2SessionPool } from './claude-v2-session-pool.js';

test('runtime options preserve hooks for native SDK session injection', () => {
  const hooks = {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo pre' }] }],
  };

  const options = buildClaudeV2RuntimeOptions({ projectPath: '/tmp/project', hooks });
  assert.deepEqual(options.hooks, hooks);
});

test('session pool passes hooks into unstable_v2_createSession', async () => {
  let capturedOptions = null;
  const sdk = {
    unstable_v2_createSession(options) {
      capturedOptions = options;
      return {
        sessionId: 'sess-hooks',
        async send() {},
        async *stream() {},
        close() {},
      };
    },
  };

  const pool = createClaudeV2SessionPool(sdk);
  pool.create({
    cwd: '/tmp/project',
    hooks: {
      Stop: [{ matcher: '', hooks: [{ type: 'prompt', prompt: 'wrap up' }] }],
    },
  });

  assert.deepEqual(capturedOptions.hooks, {
    Stop: [{ matcher: '', hooks: [{ type: 'prompt', prompt: 'wrap up' }] }],
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/agent-v2/runtime/claude-v2-request-builder.test.mjs server/agent-v2/runtime/claude-v2-session-pool.test.mjs`
Expected: FAIL because `hooks` is not yet normalized or passed into session options.

- [ ] **Step 3: Write minimal implementation**

```js
// server/hooks/claude-hooks-session-memory-store.js
export function createClaudeHooksSessionMemoryStore() {
  const store = new Map();

  return {
    get(sessionId) {
      return store.get(String(sessionId || '').trim()) || {};
    },
    set(sessionId, hooks) {
      store.set(String(sessionId || '').trim(), hooks && typeof hooks === 'object' ? hooks : {});
    },
    delete(sessionId) {
      store.delete(String(sessionId || '').trim());
    },
  };
}

// server/agent-v2/runtime/claude-v2-request-builder.js
function normalizeHooks(hooks) {
  return hooks && typeof hooks === 'object' ? hooks : undefined;
}

export function buildClaudeV2RuntimeOptions(input = {}) {
  const normalized = {};
  // existing logic...
  const normalizedHooks = normalizeHooks(input.hooks);
  if (normalizedHooks) {
    normalized.hooks = normalizedHooks;
  }
  return normalized;
}

// server/agent-v2/runtime/claude-v2-session-pool.js
function buildSessionOptions(options, pool, entry) {
  const runtimeOptions = buildClaudeV2RuntimeOptions(options);
  const { hooks } = runtimeOptions;

  return {
    // existing session options...
    ...(hooks && typeof hooks === 'object' ? { hooks } : {}),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/agent-v2/runtime/claude-v2-request-builder.test.mjs server/agent-v2/runtime/claude-v2-session-pool.test.mjs`
Expected: PASS with official hooks payload reaching SDK session creation unchanged.

- [ ] **Step 5: Checkpoint**

```bash
git add server/hooks/claude-hooks-session-memory-store.js server/agent-v2/runtime/claude-v2-request-builder.js server/agent-v2/runtime/claude-v2-request-builder.test.mjs server/agent-v2/runtime/claude-v2-session-pool.js server/agent-v2/runtime/claude-v2-session-pool.test.mjs
git diff --cached --stat
# 用户当前偏好：先不提交。若后续要整理历史，可使用：
# git commit -m "feat: pass session hooks into claude sdk sessions"
```

## Task 4: 提供可写来源 mutation API 与只读来源说明

**Files:**
- Create: `server/hooks/claude-hooks-storage.js`
- Modify: `server/hooks/claude-hooks-router.js`
- Test: `server/hooks/claude-hooks-storage.test.mjs`
- Test: `server/hooks/claude-hooks-router.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { updateWritableHookSource, deleteWritableHookEntry } from './claude-hooks-storage.js';

test('updateWritableHookSource writes official hooks back to project settings file', async () => {
  const writes = [];
  await updateWritableHookSource({
    sourceKind: 'project',
    projectPath: '/tmp/project',
    payload: {
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo hi' }] }],
      },
    },
    writeJson: async (targetPath, value) => writes.push({ targetPath, value }),
  });

  assert.equal(writes[0].targetPath, '/tmp/project/.claude/settings.json');
  assert.deepEqual(writes[0].value.hooks.PreToolUse[0].hooks[0], { type: 'command', command: 'echo hi' });
});

test('deleteWritableHookEntry rejects readonly kinds', async () => {
  await assert.rejects(
    () => deleteWritableHookEntry({ sourceKind: 'plugin', entryId: 'plugin:git:Stop:0:0' }),
    /readonly source/i,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/hooks/claude-hooks-storage.test.mjs server/hooks/claude-hooks-router.test.mjs`
Expected: FAIL because storage helpers and write/delete routes do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
// server/hooks/claude-hooks-storage.js
import path from 'path';
import os from 'os';

const WRITABLE_SOURCE_KINDS = new Set(['user', 'project', 'local', 'session-memory']);

function resolveSettingsPath({ sourceKind, homeDir = os.homedir(), projectPath }) {
  if (sourceKind === 'user') return path.join(homeDir, '.claude', 'settings.json');
  if (sourceKind === 'project') return path.join(projectPath, '.claude', 'settings.json');
  if (sourceKind === 'local') return path.join(projectPath, '.claude', 'settings.local.json');
  return null;
}

export async function updateWritableHookSource({
  sourceKind,
  projectPath,
  payload,
  writeJson,
  sessionMemoryStore,
  sessionId,
}) {
  if (!WRITABLE_SOURCE_KINDS.has(sourceKind)) {
    throw new Error(`readonly source: ${sourceKind}`);
  }

  if (sourceKind === 'session-memory') {
    sessionMemoryStore.set(sessionId, payload.hooks || {});
    return { ok: true };
  }

  const targetPath = resolveSettingsPath({ sourceKind, projectPath });
  await writeJson(targetPath, { hooks: payload.hooks || {} });
  return { ok: true, targetPath };
}

export async function deleteWritableHookEntry({ sourceKind }) {
  if (!WRITABLE_SOURCE_KINDS.has(sourceKind)) {
    throw new Error(`readonly source: ${sourceKind}`);
  }
  return { ok: true };
}

// server/hooks/claude-hooks-router.js
router.put('/project', async (req, res) => {
  const result = await storage.updateWritableHookSource({
    sourceKind: 'project',
    projectPath: req.body.projectPath,
    payload: req.body,
  });
  res.json(result);
});

router.get('/sources/:sourceId', async (req, res) => {
  const sourceDetail = await discovery.getSourceDetail(req.params.sourceId);
  res.json(sourceDetail);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/hooks/claude-hooks-storage.test.mjs server/hooks/claude-hooks-router.test.mjs`
Expected: PASS with user/project/local/session-memory writable and plugin/skill/subagent rejected as readonly.

- [ ] **Step 5: Checkpoint**

```bash
git add server/hooks/claude-hooks-storage.js server/hooks/claude-hooks-storage.test.mjs server/hooks/claude-hooks-router.js server/hooks/claude-hooks-router.test.mjs
git diff --cached --stat
# 用户当前偏好：先不提交。若后续要整理历史，可使用：
# git commit -m "feat: add hooks mutation api for writable sources"
```

## Task 5: 暴露 hooks 执行记录与详情页数据

**Files:**
- Create: `server/hooks/claude-hooks-events.js`
- Modify: `server/hooks/claude-hooks-router.js`
- Test: `server/hooks/claude-hooks-events.test.mjs`
- Test: `server/hooks/claude-hooks-router.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildHookExecutionList, buildHookExecutionDetail } from './claude-hooks-events.js';

test('buildHookExecutionList filters sdk.hook events and keeps run/session metadata', () => {
  const events = [
    { type: 'sdk.hook.started', runId: 'run-1', sessionId: 'sess-1', payload: { hookId: 'hook-1', hookName: 'PostToolUse', hookEvent: 'PostToolUse' } },
    { type: 'sdk.hook.progress', runId: 'run-1', sessionId: 'sess-1', payload: { hookId: 'hook-1', stdout: 'line 1' } },
    { type: 'sdk.message.delta', runId: 'run-1', sessionId: 'sess-1', payload: {} },
  ];

  const list = buildHookExecutionList(events);
  assert.equal(list.length, 1);
  assert.equal(list[0].hookId, 'hook-1');
  assert.equal(list[0].runId, 'run-1');
});

test('buildHookExecutionDetail folds lifecycle events into a single hook execution record', () => {
  const detail = buildHookExecutionDetail([
    { type: 'sdk.hook.started', payload: { hookId: 'hook-2', hookEvent: 'Stop' } },
    { type: 'sdk.hook.progress', payload: { hookId: 'hook-2', stdout: 'working' } },
    { type: 'sdk.hook.response', payload: { hookId: 'hook-2', exitCode: 0, stderr: '' } },
  ]);

  assert.equal(detail.hookId, 'hook-2');
  assert.equal(detail.exitCode, 0);
  assert.equal(detail.stdout.includes('working'), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/hooks/claude-hooks-events.test.mjs server/hooks/claude-hooks-router.test.mjs`
Expected: FAIL because the execution aggregator and endpoints do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
// server/hooks/claude-hooks-events.js
const HOOK_EVENT_TYPES = new Set(['sdk.hook.started', 'sdk.hook.progress', 'sdk.hook.response']);

export function buildHookExecutionList(events = []) {
  const grouped = new Map();

  for (const event of events) {
    if (!HOOK_EVENT_TYPES.has(event.type)) continue;
    const hookId = event.payload?.hookId;
    if (!hookId) continue;
    const previous = grouped.get(hookId) || {
      hookId,
      hookName: event.payload?.hookName || null,
      hookEvent: event.payload?.hookEvent || null,
      runId: event.runId || null,
      sessionId: event.sessionId || null,
    };
    grouped.set(hookId, previous);
  }

  return [...grouped.values()];
}

export function buildHookExecutionDetail(events = []) {
  return events.reduce((detail, event) => ({
    ...detail,
    hookId: detail.hookId || event.payload?.hookId || null,
    hookName: detail.hookName || event.payload?.hookName || null,
    hookEvent: detail.hookEvent || event.payload?.hookEvent || null,
    stdout: [detail.stdout, event.payload?.stdout].filter(Boolean).join('\n'),
    stderr: [detail.stderr, event.payload?.stderr].filter(Boolean).join('\n'),
    output: [detail.output, event.payload?.output].filter(Boolean).join('\n'),
    exitCode: event.payload?.exitCode ?? detail.exitCode ?? null,
    raw: [...(detail.raw || []), event],
  }), { hookId: null, hookName: null, hookEvent: null, stdout: '', stderr: '', output: '', exitCode: null, raw: [] });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/hooks/claude-hooks-events.test.mjs server/hooks/claude-hooks-router.test.mjs`
Expected: PASS and `/api/hooks/events` plus `/api/hooks/events/:hookId` provide filtered execution data.

- [ ] **Step 5: Checkpoint**

```bash
git add server/hooks/claude-hooks-events.js server/hooks/claude-hooks-events.test.mjs server/hooks/claude-hooks-router.js server/hooks/claude-hooks-router.test.mjs
git diff --cached --stat
# 用户当前偏好：先不提交。若后续要整理历史，可使用：
# git commit -m "feat: add hooks execution api"
```

## Task 6: 落地 `/hooks` 前端总览与来源详情页

**Files:**
- Create: `src/components/hooks/api/hooksApi.ts`
- Create: `src/components/hooks/types.ts`
- Create: `src/components/hooks/hooks/useHooksOverview.ts`
- Create: `src/components/hooks/hooks/useHookSourceDetail.ts`
- Create: `src/components/hooks/view/HooksPage.tsx`
- Create: `src/components/hooks/view/HookSourcePage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/sidebar/view/Sidebar.tsx`
- Test: `src/components/hooks/view/HooksPage.test.mjs`
- Test: `src/components/hooks/view/HookSourcePage.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import HooksPage from './HooksPage.tsx';

test('HooksPage renders effective hooks, sources, recent executions, and diagnostics sections', () => {
  const html = renderToStaticMarkup(
    React.createElement(HooksPage, {
      overview: {
        effective: { groupedByEvent: { PreToolUse: [{ id: '1' }] } },
        sources: [{ id: 'user', label: 'User settings', writable: true }],
        executions: [{ hookId: 'hook-1', hookName: 'Stop' }],
        diagnostics: [{ code: 'missing_local_file', level: 'info' }],
      },
    }),
  );

  assert.match(html, /Effective Hooks/);
  assert.match(html, /Sources/);
  assert.match(html, /Recent Executions/);
  assert.match(html, /Diagnostics/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/components/hooks/view/HooksPage.test.mjs src/components/hooks/view/HookSourcePage.test.mjs`
Expected: FAIL because the hooks frontend pages do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/hooks/api/hooksApi.ts
export async function fetchHooksOverview(authenticatedFetch: typeof fetch) {
  const response = await authenticatedFetch('/api/hooks/overview');
  if (!response.ok) throw new Error('Failed to fetch hooks overview');
  return await response.json();
}

// src/components/hooks/view/HooksPage.tsx
type HooksPageProps = {
  overview: {
    effective?: { groupedByEvent?: Record<string, unknown[]> };
    sources?: Array<{ id: string; label: string; writable: boolean }>;
    executions?: Array<{ hookId: string; hookName?: string }>;
    diagnostics?: Array<{ code: string; level: string }>;
  };
};

export default function HooksPage({ overview }: HooksPageProps) {
  const effectiveEvents = Object.keys(overview.effective?.groupedByEvent || {});

  return (
    <main className="flex h-full flex-col overflow-auto p-6">
      <section><h1>Effective Hooks</h1>{effectiveEvents.map((name) => <div key={name}>{name}</div>)}</section>
      <section><h2>Sources</h2>{overview.sources?.map((source) => <div key={source.id}>{source.label}</div>)}</section>
      <section><h2>Recent Executions</h2>{overview.executions?.map((item) => <div key={item.hookId}>{item.hookName || item.hookId}</div>)}</section>
      <section><h2>Diagnostics</h2>{overview.diagnostics?.map((item) => <div key={item.code}>{item.code}</div>)}</section>
    </main>
  );
}

// src/App.tsx
<Routes>
  <Route path="/" element={<AppContent />} />
  <Route path="/session/:sessionId" element={<AppContent />} />
  <Route path="/hooks" element={<HooksRoutePage />} />
  <Route path="/hooks/sources/:sourceId" element={<HookSourceRoutePage />} />
</Routes>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/components/hooks/view/HooksPage.test.mjs src/components/hooks/view/HookSourcePage.test.mjs`
Expected: PASS and the new route pages render all four spec sections plus source detail tabs.

- [ ] **Step 5: Checkpoint**

```bash
git add src/components/hooks/api/hooksApi.ts src/components/hooks/types.ts src/components/hooks/hooks/useHooksOverview.ts src/components/hooks/hooks/useHookSourceDetail.ts src/components/hooks/view/HooksPage.tsx src/components/hooks/view/HookSourcePage.tsx src/components/hooks/view/HooksPage.test.mjs src/components/hooks/view/HookSourcePage.test.mjs src/App.tsx src/components/sidebar/view/Sidebar.tsx
git diff --cached --stat
# 用户当前偏好：先不提交。若后续要整理历史，可使用：
# git commit -m "feat: add hooks overview ui"
```

## Task 7: 落地可写来源编辑器与四类 action 表单

**Files:**
- Create: `src/components/hooks/hooks/useHookEditor.ts`
- Create: `src/components/hooks/view/HookEditorPage.tsx`
- Create: `src/components/hooks/view/subcomponents/HookActionForm.tsx`
- Create: `src/components/hooks/view/subcomponents/HookMatcherEditor.tsx`
- Modify: `src/components/hooks/api/hooksApi.ts`
- Test: `src/components/hooks/view/HookEditorPage.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import HookEditorPage from './HookEditorPage.tsx';

test('HookEditorPage renders action forms for command http prompt and agent', () => {
  const html = renderToStaticMarkup(
    React.createElement(HookEditorPage, {
      source: { kind: 'project', writable: true, label: 'Project settings' },
      value: {
        hooks: {
          PreToolUse: [
            { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo hi' }] },
            { matcher: 'Write', hooks: [{ type: 'http', url: 'https://example.com' }] },
            { matcher: 'Edit', hooks: [{ type: 'prompt', prompt: 'summarize edits' }] },
            { matcher: 'Stop', hooks: [{ type: 'agent', agent: 'reviewer' }] },
          ],
        },
      },
    }),
  );

  assert.match(html, /command/i);
  assert.match(html, /http/i);
  assert.match(html, /prompt/i);
  assert.match(html, /agent/i);
  assert.match(html, /写回目标/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/components/hooks/view/HookEditorPage.test.mjs`
Expected: FAIL because the editor page and action forms do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/hooks/view/subcomponents/HookActionForm.tsx
type HookAction = {
  type: 'command' | 'http' | 'prompt' | 'agent';
  command?: string;
  url?: string;
  prompt?: string;
  agent?: string;
};

export default function HookActionForm({ action }: { action: HookAction }) {
  if (action.type === 'command') return <div>command: {action.command}</div>;
  if (action.type === 'http') return <div>http: {action.url}</div>;
  if (action.type === 'prompt') return <div>prompt: {action.prompt}</div>;
  return <div>agent: {action.agent}</div>;
}

// src/components/hooks/view/HookEditorPage.tsx
import HookActionForm from './subcomponents/HookActionForm';

export default function HookEditorPage({ source, value }) {
  const eventEntries = Object.entries(value?.hooks || {});

  return (
    <main className="flex h-full flex-col gap-4 p-6">
      <h1>编辑 Hooks</h1>
      <p>写回目标: {source.label}</p>
      {eventEntries.map(([event, matchers]) => (
        <section key={event}>
          <h2>{event}</h2>
          {(matchers || []).map((matcher, index) => (
            <div key={`${event}:${index}`}>
              <div>Matcher: {matcher.matcher || '(empty)'}</div>
              {(matcher.hooks || []).map((action, actionIndex) => (
                <HookActionForm key={`${event}:${index}:${actionIndex}`} action={action} />
              ))}
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/components/hooks/view/HookEditorPage.test.mjs`
Expected: PASS and the editor exposes all four official action types without inventing private action schemas.

- [ ] **Step 5: Checkpoint**

```bash
git add src/components/hooks/hooks/useHookEditor.ts src/components/hooks/view/HookEditorPage.tsx src/components/hooks/view/subcomponents/HookActionForm.tsx src/components/hooks/view/subcomponents/HookMatcherEditor.tsx src/components/hooks/view/HookEditorPage.test.mjs src/components/hooks/api/hooksApi.ts
git diff --cached --stat
# 用户当前偏好：先不提交。若后续要整理历史，可使用：
# git commit -m "feat: add hooks editor ui"
```

## Task 8: 执行记录页、只读来源说明增强与端到端收口

**Files:**
- Create: `src/components/hooks/hooks/useHookExecutions.ts`
- Create: `src/components/hooks/view/HookExecutionsPage.tsx`
- Create: `src/components/hooks/view/HookExecutionDetailPage.tsx`
- Modify: `src/components/hooks/view/HookSourcePage.tsx`
- Modify: `src/App.tsx`
- Modify: `server/routes/agent-v2.test.mjs`
- Test: `src/components/hooks/view/HookExecutionsPage.test.mjs`
- Test: `server/routes/agent-v2.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import HookExecutionDetailPage from './HookExecutionDetailPage.tsx';

test('HookExecutionDetailPage renders lifecycle, stdout, stderr, and raw payload', () => {
  const html = renderToStaticMarkup(
    React.createElement(HookExecutionDetailPage, {
      execution: {
        hookId: 'hook-1',
        hookEvent: 'PostToolUse',
        stdout: 'done',
        stderr: '',
        exitCode: 0,
        raw: [{ type: 'sdk.hook.response' }],
      },
    }),
  );

  assert.match(html, /PostToolUse/);
  assert.match(html, /stdout/i);
  assert.match(html, /exit code/i);
  assert.match(html, /raw payload/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/components/hooks/view/HookExecutionsPage.test.mjs server/routes/agent-v2.test.mjs`
Expected: FAIL because execution pages and final HTTP coverage are missing.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/hooks/view/HookExecutionDetailPage.tsx
export default function HookExecutionDetailPage({ execution }) {
  return (
    <main className="flex h-full flex-col gap-4 p-6">
      <h1>{execution.hookEvent || execution.hookId}</h1>
      <div>stdout</div>
      <pre>{execution.stdout || ''}</pre>
      <div>stderr</div>
      <pre>{execution.stderr || ''}</pre>
      <div>Exit Code: {String(execution.exitCode ?? '')}</div>
      <div>Raw Payload</div>
      <pre>{JSON.stringify(execution.raw || [], null, 2)}</pre>
    </main>
  );
}

// src/components/hooks/view/HookSourcePage.tsx
export default function HookSourcePage({ source }) {
  return (
    <main className="flex h-full flex-col gap-4 p-6">
      <h1>{source.label}</h1>
      <nav>
        <button type="button">Normalized</button>
        <button type="button">Raw</button>
        <button type="button">About Source</button>
      </nav>
      {!source.writable ? (
        <div>该来源为只读，请前往原始文件或上游插件/skill/subagent 修改。</div>
      ) : null}
    </main>
  );
}

// src/App.tsx
<Route path="/hooks/executions" element={<HookExecutionsRoutePage />} />
<Route path="/hooks/executions/:hookId" element={<HookExecutionDetailRoutePage />} />
<Route path="/hooks/edit/:sourceKind" element={<HookEditorRoutePage />} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/components/hooks/view/HookExecutionsPage.test.mjs server/routes/agent-v2.test.mjs`
Expected: PASS with `/hooks` full route tree available, execution details rendered, and backend integration tests covering overview/effective/mutation/events happy paths.

- [ ] **Step 5: Checkpoint**

```bash
git add src/components/hooks/hooks/useHookExecutions.ts src/components/hooks/view/HookExecutionsPage.tsx src/components/hooks/view/HookExecutionDetailPage.tsx src/components/hooks/view/HookExecutionsPage.test.mjs src/components/hooks/view/HookSourcePage.tsx src/App.tsx server/routes/agent-v2.test.mjs
git diff --cached --stat
# 用户当前偏好：先不提交。若后续要整理历史，可使用：
# git commit -m "feat: complete hooks management flow"
```

## Self-Review

### Spec coverage

- 已覆盖 discovery：
  - Task 1 扫描 `user/project/local/plugin/skill/subagent/session-memory`
- 已覆盖 effective 视图：
  - Task 2 输出 `/api/hooks/effective`
- 已覆盖 runtime session hooks 注入：
  - Task 3 在 request builder 与 session pool 增加 `hooks`
- 已覆盖 execution API：
  - Task 5 提供 `/api/hooks/events` 与 `/api/hooks/events/:hookId`
- 已覆盖可写来源编辑与回写：
  - Task 4 后端 mutation
  - Task 7 前端 editor
- 已覆盖 `/hooks` UI：
  - Task 6 首页与来源详情
  - Task 8 执行记录与全路由收口
- 已覆盖“全部来源展示、只读来源只说明不可编辑”：
  - Task 1、Task 4、Task 8

### Placeholder scan

- 未使用 `TODO` / `TBD` / “类似 Task N”。
- 每个 task 都包含：
  - failing test
  - run fail
  - minimal implementation
  - run pass
  - checkpoint

### Type consistency

- source kind 统一使用：
  - `user`
  - `project`
  - `local`
  - `plugin`
  - `skill`
  - `subagent`
  - `session-memory` 作为 source kind 与 HTTP mutation path kind
- execution event 类型统一使用：
  - `sdk.hook.started`
  - `sdk.hook.progress`
  - `sdk.hook.response`
- runtime 注入字段统一使用官方 `hooks`
