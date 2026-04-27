# Claude Agent V2 Official MCP Runtime Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove application-controlled MCP runtime toggles from Agent V2 so Claude SDK discovers MCP purely through official file-based configuration and `cwd`.

**Architecture:** The implementation narrows the Agent V2 runtime contract to standard Claude session parameters only. Frontend submit flow, websocket transport, and runtime option builders stop sending `mcpEnabled`, while existing `mcp_servers` init-event observation stays intact for read-only diagnostics.

**Tech Stack:** React, TypeScript/JS, Node.js, WebSocket, `@anthropic-ai/claude-agent-sdk`, Node test runner

---

## File Structure

- Modify: `src/components/chat/hooks/useChatComposerState.ts`
  Remove `chatMcpEnabled` lookup and stop attaching `mcpEnabled` to Agent V2 submit payloads.
- Modify: `src/components/chat/view/agentV2Realtime.ts`
  Remove `mcpEnabled` from the realtime coordinator input contract and outbound websocket payload.
- Modify: `src/components/chat/view/agentV2Realtime.test.mjs`
  Update coordinator tests to assert payloads no longer include `mcpEnabled`.
- Modify: `src/components/chat/hooks/useChatComposerState.test.mjs`
  Update composer submit tests to stop expecting `mcpEnabled`.
- Modify: `server/index.js`
  Remove `mcpEnabled` from websocket `agent-run` normalization.
- Modify: `server/agent-v2/runtime/claude-v2-request-builder.js`
  Remove `mcpEnabled` normalization from runtime options.
- Modify: `server/agent-v2/runtime/claude-v2-request-builder.test.mjs`
  Update option-builder expectations to verify `cwd` survives and `mcpEnabled` is absent.
- Modify: `server/agent-v2/runtime/claude-v2-session-pool.js`
  Remove `mcpEnabled` from session option construction.
- Modify: `server/agent-v2/runtime/claude-v2-session-pool.test.mjs`
  Update captured SDK option expectations to verify no `mcpEnabled` is passed.
- Modify: `server/agent-v2/application/start-conversation-run.js`
  Remove `mcpEnabled` from use-case input shape and runtime option construction.
- Modify: `server/agent-v2/application/continue-conversation-run.js`
  Remove `mcpEnabled` from use-case input shape and runtime option construction.
- Modify: `server/agent-v2/application/create-agent-v2-services.js`
  Remove `mcpEnabled` from service-layer signatures and forwarding.
- Modify: `server/agent-v2/application/handle-claude-command.js`
  Remove `mcpEnabled` forwarding from Agent V2 command handling.
- Modify: `server/utils/claude-latency-trace.test.mjs`
  Update snapshots or assertions that still expect requested options to contain `mcpEnabled`.

## Task 1: Remove MCP Toggle From Frontend Submit Flow

**Files:**
- Modify: `src/components/chat/hooks/useChatComposerState.ts`
- Modify: `src/components/chat/view/agentV2Realtime.ts`
- Test: `src/components/chat/hooks/useChatComposerState.test.mjs`
- Test: `src/components/chat/view/agentV2Realtime.test.mjs`

- [ ] **Step 1: Write the failing frontend assertions**

```js
assert.deepEqual(submitCalls[0], {
  prompt: 'hello',
  projectPath: '/tmp/project',
  sessionId: null,
  model: 'sonnet',
  effort: 'high',
  permissionMode: 'default',
  sessionSummary: null,
  images: [],
  toolsSettings: {
    allowedTools: ['Read'],
    disallowedTools: [],
    skipPermissions: true,
  },
  traceId: 'trace-1',
});

assert.deepEqual(sentMessages[0], {
  type: 'agent-run',
  prompt: 'hello',
  projectPath: '/tmp/project',
  sessionId: null,
  model: 'sonnet',
  effort: 'high',
  permissionMode: 'default',
  sessionSummary: null,
  images: [],
  toolsSettings: { allowedTools: ['Read'] },
  traceId: 'trace-1',
});
```

- [ ] **Step 2: Run frontend tests to verify they fail**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/agentV2Realtime.test.mjs src/components/chat/hooks/useChatComposerState.test.mjs
```

Expected: FAIL because current payloads still include `mcpEnabled`.

- [ ] **Step 3: Remove `mcpEnabled` from the frontend contracts and payloads**

```ts
type SubmitAgentRunRealtimeInput = {
  prompt: string;
  projectPath: string;
  sessionId: string | null;
  model: string;
  effort?: ClaudeEffortLevel;
  permissionMode: string;
  sessionSummary: string | null;
  images: unknown[];
  toolsSettings: Record<string, unknown>;
  traceId: string;
};
```

```ts
const toolsSettings = getToolsSettings();
const sessionSummary = getNotificationSessionSummary(selectedSession, currentInput);

await submitAgentRun({
  prompt: messageContent,
  projectPath: resolvedProjectPath,
  sessionId: effectiveSessionId,
  model: claudeModel,
  effort,
  permissionMode,
  sessionSummary,
  images: uploadedImages,
  toolsSettings,
  traceId,
});
```

```ts
sendMessage({
  type: 'agent-run',
  prompt,
  projectPath,
  sessionId,
  model,
  effort,
  permissionMode,
  sessionSummary,
  images,
  toolsSettings,
  traceId,
});
```

- [ ] **Step 4: Run frontend tests to verify they pass**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/agentV2Realtime.test.mjs src/components/chat/hooks/useChatComposerState.test.mjs
```

Expected: PASS with updated payload expectations and no `mcpEnabled`.

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/hooks/useChatComposerState.ts src/components/chat/view/agentV2Realtime.ts src/components/chat/hooks/useChatComposerState.test.mjs src/components/chat/view/agentV2Realtime.test.mjs
git commit -m "refactor: remove frontend MCP runtime toggle"
```

## Task 2: Remove MCP Toggle From WebSocket And Service Transport

**Files:**
- Modify: `server/index.js`
- Modify: `server/agent-v2/application/start-conversation-run.js`
- Modify: `server/agent-v2/application/continue-conversation-run.js`
- Modify: `server/agent-v2/application/create-agent-v2-services.js`
- Modify: `server/agent-v2/application/handle-claude-command.js`
- Test: `server/routes/agent-v2.test.mjs`

- [ ] **Step 1: Write the failing transport expectation**

```js
assert.deepEqual(normalizedOptions, {
  projectPath: '/tmp/project',
  cwd: '/tmp/project',
  sessionId: null,
  resume: false,
  toolsSettings: { allowedTools: ['Read'] },
  permissionMode: 'default',
  model: 'sonnet',
  effort: 'high',
  sessionSummary: null,
  images: [],
  traceId: 'trace-1',
});
```

- [ ] **Step 2: Run the backend transport tests to verify they fail**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/routes/agent-v2.test.mjs
```

Expected: FAIL because transport code still forwards `mcpEnabled`.

- [ ] **Step 3: Remove `mcpEnabled` from websocket normalization and service signatures**

```js
const normalizedOptions = {
  projectPath: data.projectPath,
  cwd: data.projectPath,
  sessionId: data.sessionId || null,
  resume: Boolean(data.sessionId),
  toolsSettings: data.toolsSettings || {},
  permissionMode: data.permissionMode,
  model: data.model,
  effort: data.effort,
  sessionSummary: data.sessionSummary,
  images: data.images || [],
  traceId: data.traceId,
};
```

```js
async function startSessionRun({
  title,
  prompt,
  images = [],
  model,
  projectPath,
  effort,
  permissionMode,
  toolsSettings,
  traceId,
  writer,
  onEvent,
  onSessionReady,
}) {
  // ...
}
```

```js
return startConversationRunUseCase({
  repo,
  runtime,
  title,
  prompt,
  model,
  projectPath,
  effort,
  permissionMode,
  toolsSettings,
  writer,
});
```

- [ ] **Step 4: Run the backend transport tests to verify they pass**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/routes/agent-v2.test.mjs
```

Expected: PASS with normalized options no longer containing `mcpEnabled`.

- [ ] **Step 5: Commit**

```bash
git add server/index.js server/agent-v2/application/start-conversation-run.js server/agent-v2/application/continue-conversation-run.js server/agent-v2/application/create-agent-v2-services.js server/agent-v2/application/handle-claude-command.js server/routes/agent-v2.test.mjs
git commit -m "refactor: remove MCP toggle from agent transport"
```

## Task 3: Remove MCP Toggle From Runtime Option Builders

**Files:**
- Modify: `server/agent-v2/runtime/claude-v2-request-builder.js`
- Modify: `server/agent-v2/runtime/claude-v2-session-pool.js`
- Test: `server/agent-v2/runtime/claude-v2-request-builder.test.mjs`
- Test: `server/agent-v2/runtime/claude-v2-session-pool.test.mjs`

- [ ] **Step 1: Write the failing runtime expectations**

```js
assert.deepEqual(options, {
  model: 'sonnet',
  cwd: '/Users/demo/project',
  env: {
    PATH: '/usr/bin',
  },
  toolsSettings: {
    allowedTools: ['Read'],
    disallowedTools: ['Bash(rm -rf /:*)'],
    skipPermissions: true,
  },
  settingSources: ['user', 'project', 'local'],
});
```

```js
assert.equal('mcpEnabled' in capturedOptions, false);
```

- [ ] **Step 2: Run runtime tests to verify they fail**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/agent-v2/runtime/claude-v2-request-builder.test.mjs server/agent-v2/runtime/claude-v2-session-pool.test.mjs
```

Expected: FAIL because builder and pool still preserve `mcpEnabled`.

- [ ] **Step 3: Remove `mcpEnabled` normalization and SDK forwarding**

```js
export function buildClaudeV2RuntimeOptions({
  model,
  cwd,
  projectPath,
  env,
  settingsEnv,
  effort,
  permissionMode,
  toolsSettings,
  writer,
  settingSources,
  plugins,
  settings,
  hooks,
} = {}) {
  const normalized = {};
  // keep cwd, env, permissionMode, toolsSettings, settingSources, plugins, settings, hooks
  return normalized;
}
```

```js
const {
  model,
  cwd,
  env,
  effort,
  settingSources,
  plugins,
  settings,
  hooks,
  toolsSettings,
} = runtimeOptions;

return {
  model,
  cwd,
  env,
  ...(typeof effort === 'string' ? { effort } : {}),
  permissionMode,
  ...(Array.isArray(settingSources) ? { settingSources } : {}),
  ...(Array.isArray(plugins) ? { plugins } : {}),
  ...(settings && typeof settings === 'object' ? { settings } : {}),
  ...(hooks && typeof hooks === 'object' && !Array.isArray(hooks) ? { hooks } : {}),
  ...(toolsSettings && typeof toolsSettings === 'object' ? { toolsSettings } : {}),
  allowDangerouslySkipPermissions: permissionHandlers.allowDangerouslySkipPermissions,
  allowedTools: permissionHandlers.allowedTools,
  disallowedTools: permissionHandlers.disallowedTools,
  includePartialMessages: true,
  canUseTool: permissionHandlers.canUseTool,
};
```

- [ ] **Step 4: Run runtime tests to verify they pass**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/agent-v2/runtime/claude-v2-request-builder.test.mjs server/agent-v2/runtime/claude-v2-session-pool.test.mjs
```

Expected: PASS with runtime options preserving `cwd` and omitting `mcpEnabled`.

- [ ] **Step 5: Commit**

```bash
git add server/agent-v2/runtime/claude-v2-request-builder.js server/agent-v2/runtime/claude-v2-session-pool.js server/agent-v2/runtime/claude-v2-request-builder.test.mjs server/agent-v2/runtime/claude-v2-session-pool.test.mjs
git commit -m "refactor: align Claude runtime with official MCP discovery"
```

## Task 4: Preserve Diagnostic Coverage Without Runtime Control

**Files:**
- Modify: `server/utils/claude-latency-trace.test.mjs`
- Modify: `server/utils/claude-latency-trace.js`
- Test: `server/utils/claude-latency-trace.test.mjs`

- [ ] **Step 1: Write the failing diagnostic assertion**

```js
assert.deepEqual(snapshot.requestedOptions, {
  permissionMode: 'default',
  allowedTools: ['Read'],
  disallowedTools: ['Bash'],
  skipPermissions: false,
});
```

- [ ] **Step 2: Run the diagnostic test to verify it fails**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/utils/claude-latency-trace.test.mjs
```

Expected: FAIL if requested option snapshots still expect `mcpEnabled`.

- [ ] **Step 3: Update diagnostic snapshots while preserving `mcp_servers` observation**

```js
return {
  permissionMode: options.permissionMode || 'default',
  allowedTools: [...(settings.allowedTools || [])],
  disallowedTools: [...(settings.disallowedTools || [])],
  skipPermissions: Boolean(settings.skipPermissions),
};
```

```js
assert.deepEqual(summarizeMcpServersForTrace({
  figma: { status: 'connected' },
  browser: { status: 'failed' },
}), [
  { name: 'browser', status: 'failed', target: null },
  { name: 'figma', status: 'connected', target: null },
]);
```

- [ ] **Step 4: Run the diagnostic test to verify it passes**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test server/utils/claude-latency-trace.test.mjs
```

Expected: PASS with `mcp_servers` observation preserved and `mcpEnabled` removed from snapshots.

- [ ] **Step 5: Commit**

```bash
git add server/utils/claude-latency-trace.js server/utils/claude-latency-trace.test.mjs
git commit -m "test: keep MCP diagnostics read-only"
```

## Task 5: Run End-To-End Verification For Official MCP Discovery

**Files:**
- Modify: `docs/superpowers/specs/2026-04-22-claude-agent-v2-official-mcp-runtime-alignment-design.md`
  Add an implementation status note only if execution discovers a necessary clarification.

- [ ] **Step 1: Run the focused automated test suite**

Run:

```bash
node --experimental-strip-types --experimental-specifier-resolution=node --test src/components/chat/view/agentV2Realtime.test.mjs src/components/chat/hooks/useChatComposerState.test.mjs server/routes/agent-v2.test.mjs server/agent-v2/runtime/claude-v2-request-builder.test.mjs server/agent-v2/runtime/claude-v2-session-pool.test.mjs server/utils/claude-latency-trace.test.mjs
```

Expected: PASS for all updated frontend, transport, runtime, and diagnostic tests.

- [ ] **Step 2: Run a manual discovery smoke check in a project with `.mcp.json`**

Run:

```bash
npm run server
```

Expected: server starts successfully and a chat run from a project containing `.mcp.json` shows `mcp_servers` in the Claude init event without any app-level MCP toggle.

- [ ] **Step 3: Run a manual smoke check without `.mcp.json`**

Run:

```bash
mv .mcp.json .mcp.json.bak
```

Expected: the same chat flow still runs, but Claude init no longer reports project-level MCP servers.

- [ ] **Step 4: Restore local test state**

Run:

```bash
mv .mcp.json.bak .mcp.json
```

Expected: project configuration is restored exactly to its original state.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-04-22-claude-agent-v2-official-mcp-runtime-alignment-design.md
git commit -m "chore: verify official MCP runtime alignment"
```

## Self-Review

### Spec coverage

- Remove `mcpEnabled` from frontend, transport, service layer, and runtime: covered by Tasks 1-3.
- Preserve read-only diagnostic observation of `mcp_servers`: covered by Task 4.
- Verify official discovery behavior via `cwd` and file-based config: covered by Task 5.

No uncovered spec requirements remain.

### Placeholder scan

- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Each code-edit step contains concrete code or assertion snippets.
- Each verification step includes an exact command and expected result.

### Type consistency

- `mcpEnabled` is removed consistently from frontend payloads, websocket normalization, service inputs, runtime options, and SDK session options.
- `projectPath -> cwd` remains the only MCP-related runtime input across all tasks.
- Diagnostic assertions still refer to `mcp_servers`, not a new custom payload name.
