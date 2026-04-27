# `/model` Command Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/model` appear reliably in the slash command menu under Claude runtime commands, execute locally through the existing command route, and keep the selected Claude model in sync with the existing chat provider state.

**Architecture:** Keep the official runtime catalog as the primary source, then inject a single `/model` runtime entry server-side only when the SDK catalog does not already expose it. Bridge that injected runtime command back into the existing local command execution path with explicit metadata, then propagate successful model changes into `useChatProviderState` so subsequent new runs use the updated model.

**Tech Stack:** Express router handlers, Node.js tests, React hooks, TypeScript, existing slash command menu plumbing, browser localStorage-backed provider state.

---

## File Structure

### Existing files to modify

- `server/routes/commands.js`
  - Add a helper that injects `/model` into the `runtime` catalog only when missing.
  - Tag the injected command with metadata that lets the frontend execute it locally while still rendering it as a runtime command.
  - Tighten `/model` builtin execution so it validates the requested model and returns structured data for UI state sync.

- `server/routes/agent-v2.test.mjs`
  - Extend the existing `/api/commands/list` integration coverage to assert `/model` injection and duplicate prevention.

- `src/hooks/chat/useChatProviderState.ts`
  - Persist `claudeModel` updates through a setter wrapper instead of exposing raw `setState`.
  - Keep the existing initial read from `localStorage('claude-model')`.

- `src/hooks/chat/useChatProviderState.test.mjs`
  - Add source-level assertions for the new persisted setter.

- `src/components/chat/view/ChatInterface.tsx`
  - Thread the persisted `setClaudeModel` callback into composer state.

- `src/hooks/chat/useChatComposerState.ts`
  - Recognize injected runtime commands that should still execute through `/api/commands/execute`.
  - Update the local model state after `/model` succeeds.

- `src/hooks/chat/useChatComposerState.test.mjs`
  - Extend the current source assertions so the local/runtime split allows injected runtime commands to execute locally.
  - Add a lightweight VM-backed behavioral test that `/model` updates the provided setter.

- `src/hooks/chat/slashCommandData.test.mjs`
  - Assert that runtime entries with `metadata.group = 'claude-runtime'` and `sourceType = 'claude-runtime'` stay in the runtime group instead of being reclassified.

### No new files needed

- This feature can fit inside the existing command router, provider hook, and composer hook without introducing new modules.

## Task 1: Inject `/model` into the runtime command catalog

**Files:**
- Modify: `server/routes/commands.js`
- Test: `server/routes/agent-v2.test.mjs`

- [ ] **Step 1: Write the failing integration test for missing `/model` injection**

Add this test near the existing `"commands list returns local UI commands and runtime command catalog entries"` coverage in `server/routes/agent-v2.test.mjs`:

```js
test('commands list injects /model into runtime commands when the SDK catalog does not expose it', async () => {
  const originalGetCommandCatalog = defaultAgentV2Runtime.getCommandCatalog;
  defaultAgentV2Runtime.getCommandCatalog = async () => ({
    localUi: [],
    runtime: [
      { name: '/compact', description: 'Compact conversation', argumentHint: '' },
    ],
    skills: [],
  });

  const app = express();
  app.use(express.json());
  app.use('/api/commands', commandsRouter);
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/commands/list`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        projectPath: '/tmp/project',
        sessionId: 'sess-1',
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(
      body.runtime.map((command) => command.name),
      ['/compact', '/model'],
    );
    assert.deepEqual(body.runtime[1].metadata, {
      group: 'claude-runtime',
      executeLocally: true,
      injected: true,
    });
  } finally {
    defaultAgentV2Runtime.getCommandCatalog = originalGetCommandCatalog;
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
```

- [ ] **Step 2: Run the new integration test and verify it fails**

Run:

```bash
node --test server/routes/agent-v2.test.mjs --test-name-pattern="injects /model into runtime commands"
```

Expected: `FAIL` because `/api/commands/list` currently returns only the SDK-provided runtime commands.

- [ ] **Step 3: Write the failing integration test for duplicate prevention**

Add this second test immediately after the previous one:

```js
test('commands list does not inject a duplicate /model when the SDK catalog already includes it', async () => {
  const originalGetCommandCatalog = defaultAgentV2Runtime.getCommandCatalog;
  defaultAgentV2Runtime.getCommandCatalog = async () => ({
    localUi: [],
    runtime: [
      { name: '/compact', description: 'Compact conversation', argumentHint: '' },
      { name: '/model', description: 'Switch model', argumentHint: '[model]' },
    ],
    skills: [],
  });

  const app = express();
  app.use(express.json());
  app.use('/api/commands', commandsRouter);
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/commands/list`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        projectPath: '/tmp/project',
        sessionId: 'sess-1',
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.runtime.filter((command) => command.name === '/model').length, 1);
    assert.equal(body.runtime[1].description, 'Switch model');
  } finally {
    defaultAgentV2Runtime.getCommandCatalog = originalGetCommandCatalog;
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
```

- [ ] **Step 4: Run the duplicate-prevention test and verify it fails**

Run:

```bash
node --test server/routes/agent-v2.test.mjs --test-name-pattern="does not inject a duplicate /model"
```

Expected: `FAIL` because no injection helper exists yet.

- [ ] **Step 5: Implement runtime-catalog injection in `server/routes/commands.js`**

Add these helpers above the `/list` route:

```js
function normalizeRuntimeCommandName(command) {
  const rawName = typeof command === 'string' ? command : command?.name;
  return typeof rawName === 'string' ? rawName.trim() : '';
}

function buildInjectedModelRuntimeCommand() {
  return {
    name: '/model',
    description: 'View or switch the active Claude model',
    argumentHint: '[model]',
    metadata: {
      group: 'claude-runtime',
      executeLocally: true,
      injected: true,
    },
  };
}

function ensureModelRuntimeCommand(runtimeCommands) {
  const commands = Array.isArray(runtimeCommands) ? [...runtimeCommands] : [];
  const hasModel = commands.some((command) => normalizeRuntimeCommandName(command) === '/model');
  if (!hasModel) {
    commands.push(buildInjectedModelRuntimeCommand());
  }
  return commands;
}
```

Then change the `/list` route setup from:

```js
const runtimeCommands = Array.isArray(runtimeCatalog.runtime) ? runtimeCatalog.runtime : [];
```

to:

```js
const runtimeCommands = ensureModelRuntimeCommand(runtimeCatalog.runtime);
```

- [ ] **Step 6: Run the route tests and verify they pass**

Run:

```bash
node --test server/routes/agent-v2.test.mjs --test-name-pattern="commands list"
```

Expected: `PASS` for the existing command-list tests plus the two new `/model` coverage cases.

- [ ] **Step 7: Commit the route-catalog work**

Run:

```bash
git add server/routes/commands.js server/routes/agent-v2.test.mjs
git commit -m "feat: inject /model into runtime command catalog"
```

## Task 2: Make `/model` locally executable while validating model names

**Files:**
- Modify: `server/routes/commands.js`
- Test: `server/routes/agent-v2.test.mjs`

- [ ] **Step 1: Write the failing execute test for `/model` read mode**

Add this integration test in `server/routes/agent-v2.test.mjs` near the existing `/api/commands/execute` coverage:

```js
test('commands execute returns the current and available models for /model', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/commands', commandsRouter);
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/commands/execute`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        commandName: '/model',
        args: [],
        context: {
          provider: 'claude',
          model: 'sonnet',
        },
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.action, 'model');
    assert.equal(body.data.current.model, 'sonnet');
    assert.deepEqual(body.data.available.claude, ['sonnet', 'opus', 'haiku', 'opusplan', 'sonnet[1m]']);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
```

- [ ] **Step 2: Write the failing execute test for `/model <name>` validation**

Add this companion test:

```js
test('commands execute rejects unknown Claude models for /model', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/commands', commandsRouter);
  const server = app.listen(0);

  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/commands/execute`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        commandName: '/model',
        args: ['not-a-real-model'],
        context: {
          provider: 'claude',
          model: 'sonnet',
        },
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.match(body.message, /Unknown Claude model/i);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
```

- [ ] **Step 3: Run the `/model` execute tests and verify they fail**

Run:

```bash
node --test server/routes/agent-v2.test.mjs --test-name-pattern="/model"
```

Expected: `FAIL` because `/api/commands/execute` does not currently treat `/model` as an executable builtin command.

- [ ] **Step 4: Implement `/model` builtin execution in `server/routes/commands.js`**

First, add a shared helper near `builtInHandlers`:

```js
const CLAUDE_MODEL_VALUES = CLAUDE_MODELS.OPTIONS.map((option) => option.value);

function resolveRequestedClaudeModel(args = []) {
  const requestedModel = String(args[0] || '').trim();
  if (!requestedModel) {
    return null;
  }

  if (!CLAUDE_MODEL_VALUES.includes(requestedModel)) {
    throw new Error(`Unknown Claude model: ${requestedModel}`);
  }

  return requestedModel;
}
```

Then replace the `/model` handler with:

```js
'/model': async (args, context) => {
  const currentProvider = context?.provider || 'claude';
  const currentModel = context?.model || CLAUDE_MODELS.DEFAULT;
  const nextModel = resolveRequestedClaudeModel(args) || currentModel;

  return {
    type: 'builtin',
    action: 'model',
    data: {
      current: {
        provider: currentProvider,
        model: nextModel,
      },
      previous: {
        provider: currentProvider,
        model: currentModel,
      },
      available: {
        claude: CLAUDE_MODEL_VALUES,
      },
      changed: nextModel !== currentModel,
      requestedModel: resolveRequestedClaudeModel(args),
      message: args.length > 0
        ? `Switching to model: ${nextModel}`
        : `Current model: ${currentModel}`,
    },
  };
},
```

Finally, relax builtin resolution in `/api/commands/execute` so handlers that exist in `builtInHandlers` still run even when the command is not part of `getBuiltInCommands()`:

```js
const resolvedBuiltInCommand = findBuiltInCommand(commandName);
const handler =
  resolvedBuiltInCommand
    ? builtInHandlers[resolvedBuiltInCommand.name]
    : builtInHandlers[commandName];

if (handler && resolvedBuiltInCommand?.metadata?.type !== 'skill') {
  // existing execution path
}

if (handler && !resolvedBuiltInCommand) {
  const result = await handler(args, context);
  return res.json({
    ...result,
    command: commandName,
  });
}
```

- [ ] **Step 5: Run the execute tests and verify they pass**

Run:

```bash
node --test server/routes/agent-v2.test.mjs --test-name-pattern="/model|commands execute"
```

Expected: `PASS` for the new `/model` execute coverage and no regressions in the surrounding execute-route tests.

- [ ] **Step 6: Commit the `/model` execution work**

Run:

```bash
git add server/routes/commands.js server/routes/agent-v2.test.mjs
git commit -m "feat: add local /model command handling"
```

## Task 3: Bridge injected runtime commands into the existing local execution path

**Files:**
- Modify: `src/hooks/chat/useChatProviderState.ts`
- Modify: `src/components/chat/view/ChatInterface.tsx`
- Modify: `src/hooks/chat/useChatComposerState.ts`
- Test: `src/hooks/chat/useChatProviderState.test.mjs`
- Test: `src/hooks/chat/useChatComposerState.test.mjs`

- [ ] **Step 1: Write the failing source-level test for persisted model setter**

Append this check to `src/hooks/chat/useChatProviderState.test.mjs`:

```js
test('useChatProviderState persists claude model changes through a dedicated setter', async () => {
  const sourcePath = path.join(process.cwd(), 'src/hooks/chat/useChatProviderState.ts');
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /const \[claudeModel, setClaudeModelState\] = useState<string>/);
  assert.match(source, /const setClaudeModel = useCallback/);
  assert.match(source, /localStorage\.setItem\('claude-model', nextModel\)/);
  assert.match(source, /claudeModel,\s+setClaudeModel,/s);
});
```

- [ ] **Step 2: Write the failing source-level test for locally executable runtime commands**

Add this test to `src/hooks/chat/useChatComposerState.test.mjs`:

```js
test('injected runtime commands can execute through the local command endpoint', async () => {
  const source = await fs.readFile(sourcePath, 'utf8');

  assert.match(source, /const shouldExecuteLocally = Boolean\(/);
  assert.match(source, /matchedCommand\.sourceType === 'local-ui'/);
  assert.match(source, /matchedCommand\.metadata\?\.executeLocally === true/);
  assert.match(source, /if \(shouldExecuteLocally\) \{/);
});
```

- [ ] **Step 3: Write the failing behavioral test for syncing `/model` back into provider state**

Add this VM-backed test to `src/hooks/chat/useChatComposerState.test.mjs`:

```js
test('executing /model updates the provided Claude model setter from builtin command results', async () => {
  let capturedSetModel = null;

  const { exports } = await loadUseChatComposerStateModule({
    slashCommands: [
      {
        name: '/model',
        sourceType: 'claude-runtime',
        metadata: {
          executeLocally: true,
          group: 'claude-runtime',
        },
      },
    ],
    authenticatedFetch: async (url, options) => {
      if (String(url).includes('/api/commands/execute')) {
        return {
          ok: true,
          json: async () => ({
            type: 'builtin',
            action: 'model',
            data: {
              current: { provider: 'claude', model: 'opus' },
              previous: { provider: 'claude', model: 'sonnet' },
              available: { claude: ['sonnet', 'opus', 'haiku', 'opusplan', 'sonnet[1m]'] },
              changed: true,
              requestedModel: 'opus',
            },
          }),
        };
      }

      return { ok: true, json: async () => ({}) };
    },
  });

  const state = exports.useChatComposerState({
    selectedProject: {
      id: 'proj-1',
      name: 'demo',
      path: '/tmp/project',
      fullPath: '/tmp/project',
    },
    selectedSession: { id: 'sess-1' },
    currentSessionId: 'sess-1',
    setCurrentSessionId: () => undefined,
    provider: 'claude',
    permissionMode: 'default',
    cyclePermissionMode: () => undefined,
    claudeModel: 'sonnet',
    setClaudeModel: (nextModel) => {
      capturedSetModel = nextModel;
    },
    isLoading: false,
    canAbortSession: false,
    tokenBudget: null,
    chatMessages: [],
    sendMessage: () => undefined,
    scrollToBottom: () => undefined,
    addMessage: () => undefined,
    clearMessages: () => undefined,
    rewindMessages: () => undefined,
    setIsLoading: () => undefined,
    setCanAbortSession: () => undefined,
    setClaudeStatus: () => undefined,
    setIsUserScrolledUp: () => undefined,
    pendingDecisionRequests: [],
    setPendingDecisionRequests: () => undefined,
  });

  await state.handleSubmit({ preventDefault() {} });
  assert.equal(capturedSetModel, 'opus');
});
```

- [ ] **Step 4: Run the hook tests and verify they fail**

Run:

```bash
node --test src/hooks/chat/useChatProviderState.test.mjs src/hooks/chat/useChatComposerState.test.mjs
```

Expected: `FAIL` because the provider hook exposes raw `setClaudeModel`, and the composer hook still routes only `local-ui` commands through `/api/commands/execute`.

- [ ] **Step 5: Implement persisted model state in `useChatProviderState.ts`**

Change the model state setup to:

```ts
const [claudeModel, setClaudeModelState] = useState<string>(() => {
  return localStorage.getItem('claude-model') || CLAUDE_MODELS.DEFAULT;
});

const setClaudeModel = useCallback((nextValue: SetStateAction<string>) => {
  setClaudeModelState((previous) => {
    const nextModel = typeof nextValue === 'function' ? nextValue(previous) : nextValue;
    localStorage.setItem('claude-model', nextModel);
    return nextModel;
  });
}, []);
```

Keep returning:

```ts
return {
  provider: 'claude' as const,
  claudeModel,
  setClaudeModel,
  // ...
};
```

- [ ] **Step 6: Thread `setClaudeModel` through `ChatInterface.tsx` and `useChatComposerState.ts`**

In `ChatInterface.tsx`, destructure the setter:

```ts
const {
  provider,
  claudeModel,
  setClaudeModel,
  permissionMode,
  pendingDecisionRequests,
  setPendingDecisionRequests,
  cyclePermissionMode,
} = useChatProviderState({
  selectedSession,
});
```

Then pass it into the composer hook:

```ts
  setClaudeModel,
```

Extend `UseChatComposerStateArgs` in `useChatComposerState.ts`:

```ts
  setClaudeModel: Dispatch<SetStateAction<string>>;
```

- [ ] **Step 7: Allow injected runtime commands to execute locally in `useChatComposerState.ts`**

Inside `handleSubmit`, replace the current local-only branch:

```ts
if (matchedCommand) {
  if (matchedCommand.sourceType === 'local-ui') {
    await executeCommand(matchedCommand, trimmedInput);
    // reset code
    return;
  }
}
```

with:

```ts
if (matchedCommand) {
  const shouldExecuteLocally = Boolean(
    matchedCommand.sourceType === 'local-ui'
      || matchedCommand.metadata?.executeLocally === true,
  );

  if (shouldExecuteLocally) {
    await executeCommand(matchedCommand, trimmedInput);
    setAttachedImages([]);
    setUploadingImages(new Map());
    setImageErrors(new Map());
    resetCommandMenuState();
    setIsTextareaExpanded(false);
    if (shouldResetComposerImmediatelyAfterSlashCommandIntercept()) {
      setInput('');
      inputValueRef.current = '';
    }
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    return;
  }
}
```

Also update the raw-submit flag so injected runtime commands do not fall through:

```ts
const shouldSubmitRawSlashCommand = Boolean(
  matchedCommand
  && matchedCommand.sourceType !== 'local-ui'
  && matchedCommand.metadata?.executeLocally !== true
);
```

- [ ] **Step 8: Sync successful `/model` results back into chat provider state**

Update the `'model'` branch in `handleBuiltInCommand` to:

```ts
case 'model': {
  const nextModel =
    typeof data?.current?.model === 'string' && data.current.model.trim()
      ? data.current.model.trim()
      : null;

  if (nextModel) {
    setClaudeModel(nextModel);
  }

  addMessage({
    type: 'assistant',
    content: `**Current Model**: ${data.current.model}\n\n**Available Models**:\n\nClaude: ${data.available.claude.join(', ')}`,
    timestamp: Date.now(),
  });
  break;
}
```

- [ ] **Step 9: Run the hook tests and verify they pass**

Run:

```bash
node --test src/hooks/chat/useChatProviderState.test.mjs src/hooks/chat/useChatComposerState.test.mjs
```

Expected: `PASS`, including the new source-level assertions and the `/model` behavioral sync check.

- [ ] **Step 10: Commit the hook-bridge work**

Run:

```bash
git add src/hooks/chat/useChatProviderState.ts src/hooks/chat/useChatProviderState.test.mjs src/components/chat/view/ChatInterface.tsx src/hooks/chat/useChatComposerState.ts src/hooks/chat/useChatComposerState.test.mjs
git commit -m "feat: route injected runtime commands through local execution"
```

## Task 4: Lock the menu grouping and end-to-end invariants with focused tests

**Files:**
- Test: `src/hooks/chat/slashCommandData.test.mjs`
- Modify: `src/hooks/chat/slashCommandData.ts` only if the new test exposes a grouping regression

- [ ] **Step 1: Write the failing menu-grouping test for injected runtime commands**

Add this test to `src/hooks/chat/slashCommandData.test.mjs`:

```js
test('buildSlashCommandsFromResponse keeps injected /model entries in the runtime command group', () => {
  const commands = buildSlashCommandsFromResponse({
    runtime: [
      {
        name: '/model',
        description: 'View or switch the active Claude model',
        metadata: {
          group: 'claude-runtime',
          executeLocally: true,
          injected: true,
        },
      },
    ],
  });

  assert.deepEqual(commands, [
    {
      name: '/model',
      description: 'View or switch the active Claude model',
      type: 'claude-runtime',
      sourceType: 'claude-runtime',
      metadata: {
        group: 'claude-runtime',
        executeLocally: true,
        injected: true,
      },
    },
  ]);
});
```

- [ ] **Step 2: Run the slash-command transformation test and verify the current behavior**

Run:

```bash
node --test src/hooks/chat/slashCommandData.test.mjs
```

Expected: ideally `PASS` immediately. If it fails because metadata is being rewritten, continue to the next step and fix only the specific regression.

- [ ] **Step 3: If needed, apply the minimal normalization fix in `src/hooks/chat/slashCommandData.ts`**

Only if Step 2 fails, preserve injected runtime metadata by keeping the existing runtime branch shape:

```ts
return {
  ...command,
  type: 'claude-runtime',
  sourceType: 'claude-runtime',
  metadata: runtimeSkill
    ? {
        ...(command.metadata && typeof command.metadata === 'object' ? command.metadata : {}),
        type: 'skill',
        group: 'skills',
        skillName: normalizedName || command.name,
      }
    : command.metadata,
};
```

Do not add extra rewriting for `/model`; the goal is simply to confirm the injected metadata survives unchanged when `runtimeSkill` is false.

- [ ] **Step 4: Run the focused frontend tests plus the route suite together**

Run:

```bash
node --test server/routes/agent-v2.test.mjs src/hooks/chat/slashCommandData.test.mjs src/hooks/chat/useChatProviderState.test.mjs src/hooks/chat/useChatComposerState.test.mjs
```

Expected: `PASS` across all targeted tests for command listing, command execution, provider state sync, and menu transformation.

- [ ] **Step 5: Commit the invariant tests**

Run:

```bash
git add src/hooks/chat/slashCommandData.test.mjs src/hooks/chat/slashCommandData.ts server/routes/agent-v2.test.mjs src/hooks/chat/useChatProviderState.test.mjs src/hooks/chat/useChatComposerState.test.mjs
git commit -m "test: lock /model command menu behavior"
```

## Self-Review Checklist

- Spec coverage:
  - Runtime catalog injection is covered by Task 1.
  - Local `/model` execution and model validation are covered by Task 2.
  - Provider-state sync and frontend execution bridging are covered by Task 3.
  - Runtime-group preservation is covered by Task 4.

- Placeholder scan:
  - No `TODO`, `TBD`, or “implement later” markers remain.
  - Every code-changing step includes a concrete snippet.
  - Every verification step includes an exact command and expected outcome.

- Type consistency:
  - `metadata.executeLocally` is used consistently in the route injection, command menu item, and composer hook.
  - `setClaudeModel` remains a `Dispatch<SetStateAction<string>>` all the way from provider state into composer state.
  - `/model` remains a `claude-runtime` menu entry even though execution is local.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-26-model-command-menu-implementation-plan.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
