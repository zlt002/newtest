# Claude Native Skill Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the project-local skill loading and prompt injection pipeline with the Claude Agent SDK native skill model, while keeping only a thin UI catalog and passthrough layer.

**Architecture:** The backend runtime becomes the single source of truth for Claude slash commands and skills by explicitly wiring native session settings, loading a runtime command catalog, and passing raw slash command text through unchanged. The commands route shrinks to local UI commands only plus a read-only runtime catalog endpoint, and the frontend menu switches from `skills/custom` semantics to `local-ui/claude-runtime` semantics without injecting skill content.

**Tech Stack:** Node.js, Express, Claude Agent SDK V2, existing `agent-v2` runtime/session pool, React, TypeScript, node:test

---

## File Structure

### Runtime and backend files

- Modify: `server/agent-v2/runtime/claude-v2-request-builder.js`
  - Expand runtime option building to include native skill-loading inputs such as `settingSources`, `plugins`, and any explicit settings payload needed by the SDK.
- Modify: `server/agent-v2/runtime/claude-v2-request-builder.test.mjs`
  - Lock the new runtime option behavior with focused tests.
- Modify: `server/agent-v2/runtime/claude-v2-session-pool.js`
  - Add runtime command catalog loading/caching on session create/resume and expose a read-only accessor.
- Modify: `server/agent-v2/runtime/claude-v2-session-pool.test.mjs`
  - Verify session options and command catalog behavior.
- Modify: `server/agent-v2/runtime/claude-v2-event-translator.js`
  - Preserve native init metadata needed for thin UI display of runtime commands/skills.
- Modify: `server/agent-v2/runtime/claude-v2-event-translator.test.mjs`
  - Verify command metadata survives translation.
- Modify: `server/routes/commands.js`
  - Remove skill loading/execution logic, keep local UI commands, and serve runtime command catalog data.
- Delete: `server/utils/skill-loader.js`
  - Remove project-owned skill scanning.
- Delete: `server/utils/skill-loader.test.mjs`
  - Remove obsolete skill-loader tests.

### Frontend files

- Modify: `src/components/chat/hooks/slashCommandData.js`
  - Convert API payload normalization from `builtIn/skills/custom` to `localUi/runtime`.
- Modify: `src/components/chat/hooks/slashCommandData.test.mjs`
  - Cover the new response shape.
- Modify: `src/components/chat/hooks/useSlashCommands.ts`
  - Request runtime catalog-backed command data and keep local UI commands distinct from runtime commands.
- Modify: `src/components/chat/hooks/useChatComposerState.ts`
  - Stop executing runtime skills through `/api/commands/execute`; submit raw slash command text to Claude runtime.
- Modify: `src/components/chat/hooks/builtInCommandBehavior.js`
  - Remove `skill_prompt` behavior.
- Modify: `src/components/chat/hooks/builtInCommandBehavior.test.mjs`
  - Update expectations after removing `skill_prompt`.
- Modify: `src/components/chat/view/subcomponents/commandMenuGroups.js`
  - Replace `skills/project/user` grouping with `local-ui/claude-runtime`.
- Modify: `src/components/chat/view/subcomponents/commandMenuGroups.test.mjs`
  - Lock the new grouping labels and order.

### Integration tests

- Modify: `server/routes/agent-v2.test.mjs` or `server/routes/commands.js`-adjacent tests if existing coverage is the closest fit
  - Verify runtime skill passthrough and `/skills` behavior at the HTTP boundary.
- Modify: `src/components/chat/hooks/useChatComposerState.test.mjs`
  - Verify runtime slash commands are passed through unchanged and local UI commands still execute locally.

## Task 1: Native Runtime Options for Claude Skills

**Files:**
- Modify: `server/agent-v2/runtime/claude-v2-request-builder.js`
- Test: `server/agent-v2/runtime/claude-v2-request-builder.test.mjs`

- [ ] **Step 1: Write the failing runtime option tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildClaudeV2RuntimeOptions } from './claude-v2-request-builder.js';

test('runtime options enable native Claude settings sources for skill loading by default', () => {
  const options = buildClaudeV2RuntimeOptions({
    projectPath: '/tmp/project',
  });

  assert.deepEqual(options.settingSources, ['user', 'project', 'local']);
});

test('runtime options keep explicit plugin and settings payloads for native skill resolution', () => {
  const options = buildClaudeV2RuntimeOptions({
    projectPath: '/tmp/project',
    plugins: [{ type: 'local', path: '/tmp/plugin' }],
    settings: { disableSkillShellExecution: true },
  });

  assert.deepEqual(options.plugins, [{ type: 'local', path: '/tmp/plugin' }]);
  assert.deepEqual(options.settings, { disableSkillShellExecution: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/agent-v2/runtime/claude-v2-request-builder.test.mjs`
Expected: FAIL because `settingSources`, `plugins`, and `settings` are not returned yet.

- [ ] **Step 3: Write the minimal runtime option implementation**

```js
const DEFAULT_SETTING_SOURCES = ['user', 'project', 'local'];

function normalizeSettingSources(settingSources) {
  if (!Array.isArray(settingSources) || settingSources.length === 0) {
    return [...DEFAULT_SETTING_SOURCES];
  }

  return settingSources
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
}

function normalizePlugins(plugins) {
  return Array.isArray(plugins) ? plugins.filter(Boolean) : undefined;
}

function normalizeSettings(settings) {
  return settings && typeof settings === 'object' ? settings : undefined;
}

export function buildClaudeV2RuntimeOptions({
  model,
  cwd,
  projectPath,
  env,
  settingsEnv,
  permissionMode,
  toolsSettings,
  mcpEnabled,
  writer,
  settingSources,
  plugins,
  settings,
} = {}) {
  const normalized = {};

  // existing model/cwd/env/tool setup remains

  normalized.settingSources = normalizeSettingSources(settingSources);

  const normalizedPlugins = normalizePlugins(plugins);
  if (normalizedPlugins) {
    normalized.plugins = normalizedPlugins;
  }

  const normalizedSettings = normalizeSettings(settings);
  if (normalizedSettings) {
    normalized.settings = normalizedSettings;
  }

  return normalized;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/agent-v2/runtime/claude-v2-request-builder.test.mjs`
Expected: PASS with native setting-source defaults and explicit plugin/settings preservation.

- [ ] **Step 5: Commit**

```bash
git add server/agent-v2/runtime/claude-v2-request-builder.js server/agent-v2/runtime/claude-v2-request-builder.test.mjs
git commit -m "feat: add native claude skill runtime options"
```

## Task 2: Session Pool Native Command Catalog

**Files:**
- Modify: `server/agent-v2/runtime/claude-v2-session-pool.js`
- Modify: `server/agent-v2/runtime/claude-v2-session-pool.test.mjs`
- Modify: `server/agent-v2/runtime/claude-v2-event-translator.js`
- Modify: `server/agent-v2/runtime/claude-v2-event-translator.test.mjs`

- [ ] **Step 1: Write the failing session-pool tests**

```js
test('session pool stores a runtime command catalog returned by the native SDK session', async () => {
  const fakeSdk = {
    unstable_v2_createSession() {
      return {
        commandCatalog: async () => ({
          localUi: [],
          runtime: [{ name: '/brainstorming', description: 'Brainstorm', argumentHint: '' }],
        }),
        async send() {},
        async *stream() {
          yield { type: 'system', subtype: 'init', session_id: 'sess-catalog' };
        },
        get sessionId() {
          return 'sess-catalog';
        },
        close() {},
      };
    },
    unstable_v2_resumeSession() {
      throw new Error('not used');
    },
  };

  const pool = createClaudeV2SessionPool(fakeSdk);
  const session = pool.create({ cwd: '/tmp/project' });
  for await (const _message of session.stream()) {}

  assert.deepEqual(await pool.getCommandCatalog('sess-catalog'), {
    localUi: [],
    runtime: [{ name: '/brainstorming', description: 'Brainstorm', argumentHint: '' }],
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test server/agent-v2/runtime/claude-v2-session-pool.test.mjs server/agent-v2/runtime/claude-v2-event-translator.test.mjs`
Expected: FAIL because the pool does not yet store or expose a command catalog.

- [ ] **Step 3: Implement command catalog loading and translation support**

```js
async function readCommandCatalog(session) {
  if (typeof session?.commandCatalog === 'function') {
    return await session.commandCatalog();
  }
  if (typeof session?.listSlashCommands === 'function') {
    const runtime = await session.listSlashCommands();
    return { localUi: [], runtime };
  }
  return { localUi: [], runtime: [] };
}

function createTrackedSession(session, entry, pool) {
  return {
    async refreshCommandCatalog() {
      entry.commandCatalog = await readCommandCatalog(session);
      return entry.commandCatalog;
    },
    // existing session methods...
  };
}

export function createClaudeV2SessionPool(sdk = getClaudeAgentSdk(process.env)) {
  // existing pool setup...
  return {
    async getCommandCatalog(sessionId) {
      const entry = getEntry(pool, sessionId);
      if (!entry) {
        return { localUi: [], runtime: [] };
      }
      if (!entry.commandCatalog) {
        entry.commandCatalog = await entry.session.refreshCommandCatalog();
      }
      return entry.commandCatalog;
    },
  };
}
```

```js
if (sdkMessage.type === 'system' && sdkMessage.subtype === 'init') {
  return [
    buildSdkMappedEvent(base, sequence, 'sdk.system.init', sdkMessage, {
      cwd: sdkMessage.cwd || null,
      model: sdkMessage.model || null,
      permissionMode: sdkMessage.permissionMode || null,
      tools: Array.isArray(sdkMessage.tools) ? sdkMessage.tools : [],
      slashCommands: Array.isArray(sdkMessage.slash_commands) ? sdkMessage.slash_commands : [],
      skills: Array.isArray(sdkMessage.skills) ? sdkMessage.skills : [],
      plugins: Array.isArray(sdkMessage.plugins) ? sdkMessage.plugins : [],
    }),
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test server/agent-v2/runtime/claude-v2-session-pool.test.mjs server/agent-v2/runtime/claude-v2-event-translator.test.mjs`
Expected: PASS with stored catalog access and translated native init metadata.

- [ ] **Step 5: Commit**

```bash
git add server/agent-v2/runtime/claude-v2-session-pool.js server/agent-v2/runtime/claude-v2-session-pool.test.mjs server/agent-v2/runtime/claude-v2-event-translator.js server/agent-v2/runtime/claude-v2-event-translator.test.mjs
git commit -m "feat: expose native claude command catalog"
```

## Task 3: Shrink Commands Route to Local UI Commands Plus Runtime Catalog

**Files:**
- Modify: `server/routes/commands.js`
- Delete: `server/utils/skill-loader.js`
- Delete: `server/utils/skill-loader.test.mjs`
- Test: `shared/claudeCommandRegistry.test.mjs`
- Test: `server/routes/agent-v2.test.mjs`

- [ ] **Step 1: Write the failing route tests**

```js
test('commands list returns local UI commands and runtime command catalog entries', async () => {
  const response = await request(app)
    .post('/api/commands/list')
    .send({ projectPath: '/tmp/project', sessionId: 'sess-1' });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.runtime, [
    { name: '/skills', description: 'List skills', argumentHint: '' },
  ]);
  assert.equal(response.body.skills, undefined);
});

test('commands execute does not load or inject a native skill file', async () => {
  const response = await request(app)
    .post('/api/commands/execute')
    .send({ commandName: '/brainstorming', context: { projectPath: '/tmp/project' } });

  assert.equal(response.status, 400);
  assert.match(response.body.message, /runtime command/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test shared/claudeCommandRegistry.test.mjs server/routes/agent-v2.test.mjs`
Expected: FAIL because the route still returns `skills` and still resolves skill files.

- [ ] **Step 3: Implement the route and delete obsolete loader code**

```js
const builtInCommands = getBuiltInCommands().filter((command) => command.metadata?.type !== 'skill');

router.post('/list', async (req, res) => {
  const { projectPath, sessionId } = req.body;
  const runtimeCatalog = sessionId
    ? await defaultAgentV2Runtime.getCommandCatalog(sessionId)
    : { localUi: [], runtime: [] };

  res.json({
    localUi: builtInCommands,
    runtime: runtimeCatalog.runtime,
    count: builtInCommands.length + runtimeCatalog.runtime.length,
  });
});

router.post('/execute', async (req, res) => {
  const { commandName } = req.body;
  const resolvedBuiltInCommand = findBuiltInCommand(commandName);
  if (resolvedBuiltInCommand && resolvedBuiltInCommand.metadata?.type !== 'skill') {
    // existing local UI command path
  }

  return res.status(400).json({
    error: 'Runtime command must be sent through Claude session execution',
    message: `${commandName} is a Claude runtime command and cannot be executed through /api/commands/execute`,
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test shared/claudeCommandRegistry.test.mjs server/routes/agent-v2.test.mjs`
Expected: PASS with no local skill loading route left.

- [ ] **Step 5: Commit**

```bash
git add server/routes/commands.js shared/claudeCommandRegistry.js shared/claudeCommandRegistry.test.mjs server/routes/agent-v2.test.mjs
git rm server/utils/skill-loader.js server/utils/skill-loader.test.mjs
git commit -m "refactor: remove local skill loader route path"
```

## Task 4: Frontend Slash Menu Consumes Runtime Catalog and Stops Skill Injection

**Files:**
- Modify: `src/components/chat/hooks/slashCommandData.js`
- Modify: `src/components/chat/hooks/slashCommandData.test.mjs`
- Modify: `src/components/chat/hooks/useSlashCommands.ts`
- Modify: `src/components/chat/hooks/useChatComposerState.ts`
- Modify: `src/components/chat/hooks/useChatComposerState.test.mjs`
- Modify: `src/components/chat/hooks/builtInCommandBehavior.js`
- Modify: `src/components/chat/hooks/builtInCommandBehavior.test.mjs`
- Modify: `src/components/chat/view/subcomponents/commandMenuGroups.js`
- Modify: `src/components/chat/view/subcomponents/commandMenuGroups.test.mjs`

- [ ] **Step 1: Write the failing frontend tests**

```js
test('buildSlashCommandsFromResponse keeps local UI and runtime commands visible to the menu', () => {
  const commands = buildSlashCommandsFromResponse({
    localUi: [{ name: '/help', sourceType: 'local-ui' }],
    runtime: [{ name: '/brainstorming', sourceType: 'claude-runtime' }],
  });

  assert.deepEqual(
    commands.map((command) => ({ name: command.name, type: command.type })),
    [
      { name: '/help', type: 'local-ui' },
      { name: '/brainstorming', type: 'claude-runtime' },
    ],
  );
});

test('runtime slash commands are submitted raw instead of being executed through the local command endpoint', async () => {
  // render hook with input '/brainstorming'
  // expect submitAgentRun to receive prompt '/brainstorming'
  // expect authenticatedFetch('/api/commands/execute') not to be called
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/components/chat/hooks/slashCommandData.test.mjs src/components/chat/hooks/builtInCommandBehavior.test.mjs src/components/chat/view/subcomponents/commandMenuGroups.test.mjs src/components/chat/hooks/useChatComposerState.test.mjs`
Expected: FAIL because the frontend still expects `skills/custom` shape and still supports `skill_prompt`.

- [ ] **Step 3: Implement the menu and composer changes**

```js
export function buildSlashCommandsFromResponse(data = {}) {
  return [
    ...((data.localUi || []).map((command) => ({
      ...command,
      type: 'local-ui',
      sourceType: 'local-ui',
    }))),
    ...((data.runtime || []).map((command) => ({
      ...command,
      type: 'claude-runtime',
      sourceType: 'claude-runtime',
    }))),
  ];
}
```

```js
const ACTIONS_THAT_KEEP_COMPOSER_INPUT = new Set(['compact']);
```

```js
if (command.sourceType === 'local-ui') {
  await executeCommand(command, currentInput);
  return;
}

await submitAgentRun({
  prompt: currentInput,
  projectPath: resolvedProjectPath,
  sessionId: effectiveSessionId,
  model: claudeModel,
  permissionMode,
  sessionSummary,
  images: uploadedImages,
  toolsSettings,
  mcpEnabled: chatMcpEnabled,
  traceId,
});
```

```js
export const COMMAND_MENU_GROUP_LABELS = {
  frequent: '常用命令',
  'claude-runtime': 'Claude Runtime',
  'local-ui': '本地命令',
  other: '其他命令',
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/components/chat/hooks/slashCommandData.test.mjs src/components/chat/hooks/builtInCommandBehavior.test.mjs src/components/chat/view/subcomponents/commandMenuGroups.test.mjs src/components/chat/hooks/useChatComposerState.test.mjs`
Expected: PASS with runtime commands inserted and submitted unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/hooks/slashCommandData.js src/components/chat/hooks/slashCommandData.test.mjs src/components/chat/hooks/useSlashCommands.ts src/components/chat/hooks/useChatComposerState.ts src/components/chat/hooks/useChatComposerState.test.mjs src/components/chat/hooks/builtInCommandBehavior.js src/components/chat/hooks/builtInCommandBehavior.test.mjs src/components/chat/view/subcomponents/commandMenuGroups.js src/components/chat/view/subcomponents/commandMenuGroups.test.mjs
git commit -m "refactor: passthrough native claude slash commands"
```

## Task 5: End-to-End Verification and Cleanup

**Files:**
- Modify: `server/agent-v2/runtime/claude-v2-sdk-contract.test.mjs`
- Modify: `server/routes/commands.js` if minor cleanup remains
- Modify: `docs/superpowers/specs/2026-04-21-claude-native-skill-model-design.md` only if wording must reflect the delivered implementation

- [ ] **Step 1: Add the final regression test coverage**

```js
test('Claude Agent SDK contract still exposes slash-command metadata needed for runtime catalogs', async () => {
  const sdkDts = await readFile(SDK_DTS_PATH, 'utf8');
  assert.match(sdkDts, /export declare type SlashCommand = \\{/);
  assert.match(sdkDts, /settingSources\\?: SettingSource\\[\\];/);
});
```

- [ ] **Step 2: Run the full focused verification suite**

Run: `node --test shared/claudeCommandRegistry.test.mjs server/agent-v2/runtime/claude-v2-request-builder.test.mjs server/agent-v2/runtime/claude-v2-session-pool.test.mjs server/agent-v2/runtime/claude-v2-event-translator.test.mjs server/agent-v2/runtime/claude-v2-sdk-contract.test.mjs server/routes/agent-v2.test.mjs src/components/chat/hooks/slashCommandData.test.mjs src/components/chat/hooks/builtInCommandBehavior.test.mjs src/components/chat/view/subcomponents/commandMenuGroups.test.mjs src/components/chat/hooks/useChatComposerState.test.mjs`
Expected: PASS across backend runtime, command routing, SDK contract, and frontend composer/menu behavior.

- [ ] **Step 3: Perform manual smoke checks**

Run:

```bash
npm test -- --help >/dev/null
```

Then verify manually in the app:

- Open a Claude chat session and confirm the command menu shows local UI commands plus runtime commands
- Insert `/skills` and confirm the submitted prompt remains `/skills`
- Insert `/brainstorming` and confirm no local skill file is read or injected
- Trigger `/config` and confirm the local UI action still opens settings

Expected: Runtime slash commands are thin passthroughs and local UI commands remain local.

- [ ] **Step 4: Commit**

```bash
git add server/agent-v2/runtime/claude-v2-sdk-contract.test.mjs
git commit -m "test: lock native claude skill runtime behavior"
```

## Self-Review

### Spec coverage

- Native skill source of truth: covered by Tasks 1-3
- Runtime command catalog: covered by Tasks 2 and 4
- Removal of local skill loader and prompt injection: covered by Tasks 3 and 4
- Raw slash command passthrough: covered by Task 4
- Verification and contract locking: covered by Task 5

### Placeholder scan

- No `TBD`, `TODO`, or deferred implementation notes remain.
- Every task includes explicit files, code snippets, test commands, and commit commands.

### Type consistency

- `settingSources`, `plugins`, and `settings` are introduced in Task 1 and used consistently later.
- `commandCatalog`, `localUi`, and `runtime` naming is consistent across backend and frontend tasks.
- `sourceType` uses only `local-ui` and `claude-runtime` throughout the plan.
