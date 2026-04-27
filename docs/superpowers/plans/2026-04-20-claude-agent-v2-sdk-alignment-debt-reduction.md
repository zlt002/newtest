# Claude Agent V2 SDK Alignment Debt Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Claude Agent V2 into full semantic alignment with the official Claude Agent SDK by wiring real SDK inputs, preserving richer SDK event metadata, separating AskUserQuestion from permission approval, tightening permission semantics, locking the preview dependency, and adding contract coverage that catches upstream SDK drift.

**Architecture:** We will split the work into seven bounded tasks. Task 1 adds a shared input adapter so the SDK receives real prompt, image, MCP, and permission inputs. Task 2 preserves the richer SDK event payloads instead of flattening them too early. Task 3 separates interactive user questions from security permissions. Task 4 upgrades permission results to the official `PermissionResult` shape. Task 5 narrows skip-permission behavior so bypassing is explicit. Task 6 locks the SDK dependency and adds an upgrade guard. Task 7 adds a smoke/contract test layer against the installed SDK so future drift is visible immediately.

**Tech Stack:** Node.js, React, TypeScript, WebSocket transport, SQLite, Claude Agent SDK, node:test, npm lockfile management

---

## File Structure

### Runtime and SDK-adapter files

- Create: `server/agent-v2/runtime/claude-v2-request-builder.js`
- Create: `server/agent-v2/runtime/claude-v2-permissions.js`
- Modify: `server/agent-v2/runtime/claude-v2-session-pool.js`
- Modify: `server/agent-v2/runtime/claude-v2-event-translator.js`
- Modify: `server/agent-v2/application/start-conversation-run.js`
- Modify: `server/agent-v2/application/continue-conversation-run.js`
- Modify: `server/agent-v2/application/create-agent-v2-services.js`
- Modify: `server/index.js`
- Modify: `server/utils/claude-mcp-runtime.js`
- Modify: `server/utils/claude-latency-trace.js`

### Front-end protocol files

- Modify: `src/components/chat/view/ChatInterface.tsx`
- Modify: `src/components/chat/view/agentV2Realtime.ts`
- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.ts`
- Modify: `src/components/chat/hooks/useChatMessages.ts`
- Modify: `src/components/chat/hooks/useChatProviderState.ts`
- Modify: `src/components/chat/hooks/useChatComposerState.ts`
- Modify: `src/components/chat/hooks/useChatSessionState.ts`
- Modify: `src/components/chat/view/subcomponents/PermissionRequestsBanner.tsx`
- Create: `src/components/chat/view/subcomponents/InteractiveRequestsBanner.tsx`
- Create: `src/components/chat/tools/configs/interactivePanelRegistry.ts`
- Modify: `src/components/chat/tools/configs/permissionPanelRegistry.ts`
- Modify: `src/components/chat/tools/components/InteractiveRenderers/AskUserQuestionPanel.tsx`
- Modify: `src/components/chat/view/subcomponents/ChatComposer.tsx`
- Modify: `src/components/chat/types/types.ts`
- Modify: `src/components/chat/utils/chatPermissions.ts`
- Modify: `src/components/chat/utils/chatStorage.ts`
- Modify: `src/components/chat-v2/types/agentEvents.ts`
- Modify: `src/components/chat-v2/projection/projectRunExecution.ts`
- Modify: `src/components/chat-v2/store/createAgentEventStore.ts`

### Tests

- Create: `server/agent-v2/runtime/claude-v2-request-builder.test.mjs`
- Create: `server/agent-v2/runtime/claude-v2-permissions.test.mjs`
- Create: `server/agent-v2/runtime/claude-v2-sdk-contract.test.mjs`
- Modify: `server/agent-v2/runtime/claude-v2-session-pool.test.mjs`
- Modify: `server/agent-v2/runtime/claude-v2-event-translator.test.mjs`
- Modify: `server/agent-v2/application/start-conversation-run.test.mjs`
- Modify: `server/agent-v2/application/continue-conversation-run.test.mjs`
- Modify: `server/agent-v2/application/create-agent-v2-services.test.mjs`
- Modify: `server/agent-v2/application/handle-claude-command.test.mjs`
- Modify: `src/components/chat/view/agentV2Realtime.test.mjs`
- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.test.mjs`
- Modify: `src/components/chat/hooks/useChatMessages.test.mjs`
- Create: `src/components/chat/view/subcomponents/InteractiveRequestsBanner.test.mjs`
- Modify: `src/components/chat-v2/projection/projectRunExecution.test.mjs`
- Modify: `src/components/chat-v2/store/createAgentEventStore.test.mjs`
- Modify: `server/utils/claude-latency-trace.test.mjs`
- Modify: `src/components/settings/hooks/useSettingsController.test.mjs`
- Modify: `src/components/chat/utils/chatPermissions.test.mjs`

### Documentation

- Modify: `docs/superpowers/specs/2026-04-20-claude-agent-v2-sdk-alignment-debt-reduction-design.md`

## Task 1: Build a Shared Claude V2 Input Adapter

**Files:**
- Create: `server/agent-v2/runtime/claude-v2-request-builder.js`
- Modify: `server/index.js`
- Modify: `server/agent-v2/application/start-conversation-run.js`
- Modify: `server/agent-v2/application/continue-conversation-run.js`
- Modify: `server/agent-v2/application/create-agent-v2-services.js`
- Modify: `server/agent-v2/runtime/claude-v2-session-pool.js`
- Modify: `server/utils/claude-mcp-runtime.js`
- Test: `server/agent-v2/runtime/claude-v2-request-builder.test.mjs`
- Test: `server/agent-v2/application/start-conversation-run.test.mjs`
- Test: `server/agent-v2/application/continue-conversation-run.test.mjs`
- Test: `server/agent-v2/runtime/claude-v2-session-pool.test.mjs`

- [ ] **Step 1: Write failing tests that prove images, MCP, and session summary are currently lost before the SDK sees them**

```js
test('buildClaudeV2Request maps prompt, images, sessionSummary, and MCP into SDK-facing inputs', () => {
  const request = buildClaudeV2Request({
    prompt: 'Summarize this repo',
    sessionSummary: 'last turn asked for a repo overview',
    images: [{ data: 'data:image/png;base64,AAAA', name: 'diagram.png' }],
    projectPath: '/workspace/demo',
    model: 'claude-sonnet-4-6',
    permissionMode: 'default',
    toolsSettings: { allowedTools: ['Read'], disallowedTools: [], skipPermissions: false },
    mcpEnabled: true,
  });

  assert.equal(request.sessionOptions.model, 'claude-sonnet-4-6');
  assert.equal(request.sessionOptions.cwd, '/workspace/demo');
  assert.equal(request.sessionOptions.includePartialMessages, true);
  assert.equal(request.initialUserMessage.message.role, 'user');
  assert.equal(request.initialUserMessage.message.content.some((part) => part.type === 'image'), true);
  assert.equal(request.sessionSummary, 'last turn asked for a repo overview');
});
```

- [ ] **Step 2: Run the focused tests and verify they fail because the adapter does not exist yet**

Run: `node --test server/agent-v2/runtime/claude-v2-request-builder.test.mjs server/agent-v2/application/start-conversation-run.test.mjs server/agent-v2/application/continue-conversation-run.test.mjs server/agent-v2/runtime/claude-v2-session-pool.test.mjs`

Expected: FAIL with `ReferenceError` or `TypeError` because `buildClaudeV2Request` and the new session option plumbing are not implemented yet.

- [ ] **Step 3: Implement the minimal adapter that returns one SDK session-options object plus one normalized user message**

```js
export function buildClaudeV2Request({
  prompt,
  sessionSummary,
  images,
  projectPath,
  model,
  permissionMode,
  toolsSettings,
  mcpEnabled,
}) {
  return {
    sessionOptions: {
      model,
      cwd: projectPath,
      permissionMode,
      allowDangerouslySkipPermissions: permissionMode === 'bypassPermissions',
      allowedTools: Array.isArray(toolsSettings?.allowedTools) ? toolsSettings.allowedTools : [],
      disallowedTools: Array.isArray(toolsSettings?.disallowedTools) ? toolsSettings.disallowedTools : [],
      includePartialMessages: true,
      mcpServers: mcpEnabled ? loadClaudeMcpServers(projectPath) : {},
    },
    initialUserMessage: buildClaudeUserMessage(prompt, images, sessionSummary),
    sessionSummary: typeof sessionSummary === 'string' ? sessionSummary.trim() : null,
  };
}
```

- [ ] **Step 4: Thread the adapter through `startConversationRun`, `continueConversationRun`, and `createClaudeV2SessionPool`**

```js
const request = buildClaudeV2Request(input);
const session = runtime.create({
  ...request.sessionOptions,
  writer,
});
await session.send(request.initialUserMessage);
```

- [ ] **Step 5: Re-run the focused tests, then run the broader agent-v2 and chat smoke tests**

Run: `node --test server/agent-v2/runtime/claude-v2-request-builder.test.mjs server/agent-v2/application/start-conversation-run.test.mjs server/agent-v2/application/continue-conversation-run.test.mjs server/agent-v2/runtime/claude-v2-session-pool.test.mjs`

Expected: PASS

Run: `node --test server/agent-v2/application/create-agent-v2-services.test.mjs server/agent-v2/application/handle-claude-command.test.mjs src/components/chat/view/agentV2Realtime.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/agent-v2/runtime/claude-v2-request-builder.js server/agent-v2/runtime/claude-v2-request-builder.test.mjs server/agent-v2/runtime/claude-v2-session-pool.js server/agent-v2/application/start-conversation-run.js server/agent-v2/application/continue-conversation-run.js server/agent-v2/application/create-agent-v2-services.js server/index.js server/utils/claude-mcp-runtime.js
git commit -m "feat: align v2 sdk inputs with runtime contract"
```

## Task 2: Preserve Richer SDK Event Metadata

**Files:**
- Modify: `server/agent-v2/runtime/claude-v2-event-translator.js`
- Modify: `server/agent-v2/domain/agent-event.js`
- Modify: `server/agent-v2/domain/run-state-machine.js`
- Modify: `server/utils/claude-latency-trace.js`
- Modify: `src/components/chat-v2/types/agentEvents.ts`
- Modify: `src/components/chat-v2/projection/projectRunExecution.ts`
- Test: `server/agent-v2/runtime/claude-v2-event-translator.test.mjs`
- Test: `src/components/chat-v2/projection/projectRunExecution.test.mjs`

- [ ] **Step 1: Write failing tests that assert the translator currently drops official SDK fields**

```js
test('translator preserves init metadata and result usage details', () => {
  const translate = createClaudeV2EventTranslator({ conversationId: 'conv-1', runId: 'run-1', sessionId: 'sess-1' });

  const init = translate({
    type: 'system',
    subtype: 'init',
    apiKeySource: 'anthropic_api_key',
    claude_code_version: '2.1.59',
    cwd: '/workspace/demo',
    model: 'claude-sonnet-4-6',
    permissionMode: 'default',
    tools: ['Read'],
    mcp_servers: [{ name: 'context7', status: 'connected' }],
    plugins: [{ name: 'local-plugin', path: '/plugin' }],
    skills: ['brainstorming'],
    session_id: 'sess-1',
  }, 1);

  assert.equal(init.type, 'sdk.system.init');
  assert.equal(init.payload.apiKeySource, 'anthropic_api_key');
  assert.equal(init.payload.claudeCodeVersion, '2.1.59');
  assert.equal(init.payload.skills.includes('brainstorming'), true);
});

test('translator preserves result usage and cost metadata', () => {
  const translate = createClaudeV2EventTranslator({ conversationId: 'conv-1', runId: 'run-1', sessionId: 'sess-1' });
  const result = translate({
    type: 'result',
    subtype: 'success',
    duration_ms: 1200,
    total_cost_usd: 0.42,
    permission_denials: [],
    usage: { input_tokens: 10, output_tokens: 20 },
    modelUsage: { 'claude-sonnet-4-6': { input_tokens: 10, output_tokens: 20 } },
    stop_reason: 'end_turn',
    session_id: 'sess-1',
  }, 2);

  assert.equal(result.payload.totalCostUsd, 0.42);
  assert.equal(result.payload.stopReason, 'end_turn');
});
```

- [ ] **Step 2: Run the translator and projection tests to verify the missing fields are still invisible**

Run: `node --test server/agent-v2/runtime/claude-v2-event-translator.test.mjs src/components/chat-v2/projection/projectRunExecution.test.mjs`

Expected: FAIL because the translator still flattens the event payload too aggressively.

- [ ] **Step 3: Extend the translator so it keeps the important SDK payloads intact and remove the legacy-only branch that no longer exists in the official message set**

```js
if (sdkMessage.type === 'result') {
  return buildEvent(base, sequence, sdkMessage.subtype === 'success' ? 'run.completed' : 'run.failed', {
    result: sdkMessage.result || '',
    durationMs: sdkMessage.duration_ms ?? null,
    totalCostUsd: sdkMessage.total_cost_usd ?? null,
    usage: sdkMessage.usage || null,
    modelUsage: sdkMessage.modelUsage || null,
    permissionDenials: Array.isArray(sdkMessage.permission_denials) ? sdkMessage.permission_denials : [],
    stopReason: sdkMessage.stop_reason || null,
    subtype: sdkMessage.subtype || 'unknown',
  });
}
```

- [ ] **Step 4: Expand the event envelope types and projection so the new metadata survives storage and replay**

```ts
export type RunCompletedPayload = {
  result: string;
  durationMs: number | null;
  totalCostUsd: number | null;
  usage: Record<string, unknown> | null;
  modelUsage: Record<string, unknown> | null;
  permissionDenials: unknown[];
  stopReason: string | null;
  subtype: string;
};
```

- [ ] **Step 5: Re-run the translator and projection tests, then run the chat-v2 smoke tests**

Run: `node --test server/agent-v2/runtime/claude-v2-event-translator.test.mjs src/components/chat-v2/projection/projectRunExecution.test.mjs src/components/chat-v2/store/createAgentEventStore.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/agent-v2/runtime/claude-v2-event-translator.js server/agent-v2/domain/agent-event.js server/agent-v2/domain/run-state-machine.js server/utils/claude-latency-trace.js src/components/chat-v2/types/agentEvents.ts src/components/chat-v2/projection/projectRunExecution.ts server/agent-v2/runtime/claude-v2-event-translator.test.mjs src/components/chat-v2/projection/projectRunExecution.test.mjs
git commit -m "feat: preserve richer claude sdk event metadata"
```

## Task 3: Separate AskUserQuestion From Permission Approval

**Files:**
- Create: `src/components/chat/tools/configs/interactivePanelRegistry.ts`
- Create: `src/components/chat/view/subcomponents/InteractiveRequestsBanner.tsx`
- Create: `src/components/chat/view/subcomponents/InteractiveRequestsBanner.test.mjs`
- Modify: `src/components/chat/view/subcomponents/PermissionRequestsBanner.tsx`
- Modify: `src/components/chat/view/ChatInterface.tsx`
- Modify: `src/components/chat/view/subcomponents/ChatComposer.tsx`
- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.ts`
- Modify: `src/components/chat/hooks/useChatMessages.ts`
- Modify: `src/components/chat/hooks/useChatProviderState.ts`
- Modify: `src/components/chat/types/types.ts`
- Modify: `src/components/chat/tools/components/InteractiveRenderers/AskUserQuestionPanel.tsx`
- Modify: `server/agent-v2/runtime/claude-v2-session-pool.js`
- Test: `src/components/chat/hooks/useChatRealtimeHandlers.test.mjs`
- Test: `server/agent-v2/runtime/claude-v2-session-pool.test.mjs`

- [ ] **Step 1: Write failing tests that show AskUserQuestion is still treated like a permission request**

```js
test('AskUserQuestion is routed to interactive prompts instead of permission requests', () => {
  const interactive = getInteractivePanel('AskUserQuestion');
  const permission = getPermissionPanel('AskUserQuestion');

  assert.equal(typeof interactive, 'function');
  assert.equal(permission, null);
});
```

- [ ] **Step 2: Run the focused tests and verify the current implementation still mixes the two flows**

Run: `node --test src/components/chat/hooks/useChatRealtimeHandlers.test.mjs server/agent-v2/runtime/claude-v2-session-pool.test.mjs`

Expected: FAIL because AskUserQuestion still uses the permission request path.

- [ ] **Step 3: Introduce a separate interactive-request registry and banner, and route AskUserQuestion to it with existing `interactive_prompt` semantics**

```tsx
registerInteractivePanel('AskUserQuestion', AskUserQuestionPanel);

<InteractiveRequestsBanner
  pendingInteractiveRequests={pendingInteractiveRequests}
  onDecision={handleInteractiveDecision}
/>
```

- [ ] **Step 4: Update the runtime so AskUserQuestion creates an interactive prompt payload instead of a permission payload**

```js
writer?.send?.(createNormalizedMessage({
  kind: 'interactive_prompt',
  requestId,
  toolName: 'AskUserQuestion',
  input: normalizedToolInput,
  sessionId: currentSessionId,
  provider: 'claude',
}));
```

- [ ] **Step 5: Re-run the interactive and realtime handler tests**

Run: `node --test src/components/chat/view/subcomponents/InteractiveRequestsBanner.test.mjs src/components/chat/hooks/useChatRealtimeHandlers.test.mjs server/agent-v2/runtime/claude-v2-session-pool.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/tools/configs/interactivePanelRegistry.ts src/components/chat/view/subcomponents/InteractiveRequestsBanner.tsx src/components/chat/view/subcomponents/PermissionRequestsBanner.tsx src/components/chat/view/ChatInterface.tsx src/components/chat/view/subcomponents/ChatComposer.tsx src/components/chat/hooks/useChatRealtimeHandlers.ts src/components/chat/hooks/useChatMessages.ts src/components/chat/hooks/useChatProviderState.ts src/components/chat/types/types.ts src/components/chat/tools/components/InteractiveRenderers/AskUserQuestionPanel.tsx server/agent-v2/runtime/claude-v2-session-pool.js
git commit -m "feat: separate ask-user-question from permission approvals"
```

## Task 4: Upgrade Permission Handling to the Official `PermissionResult` Shape

**Files:**
- Create: `server/agent-v2/runtime/claude-v2-permissions.js`
- Modify: `server/agent-v2/runtime/claude-v2-session-pool.js`
- Modify: `server/index.js`
- Modify: `src/components/chat/utils/chatPermissions.ts`
- Modify: `src/components/chat/view/subcomponents/PermissionRequestsBanner.tsx`
- Modify: `src/components/chat/hooks/useChatRealtimeHandlers.ts`
- Modify: `src/components/chat/hooks/useChatProviderState.ts`
- Modify: `src/components/chat/view/subcomponents/ChatComposer.tsx`
- Modify: `src/components/chat/types/types.ts`
- Test: `server/agent-v2/runtime/claude-v2-permissions.test.mjs`
- Test: `server/agent-v2/runtime/claude-v2-session-pool.test.mjs`
- Test: `src/components/chat/utils/chatPermissions.test.mjs`

- [ ] **Step 1: Write failing tests that prove we still only return allow/deny and do not emit updatedPermissions or toolUseID**

```js
test('permission result includes updatedPermissions when the user chooses remember', async () => {
  const result = buildPermissionResult({
    allow: true,
    toolUseID: 'tool-1',
    rememberEntry: 'Bash(git):*',
    updatedInput: { command: 'git status' },
    updatedPermissions: [{ type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'git' }], behavior: 'allow', destination: 'user' }],
  });

  assert.equal(result.behavior, 'allow');
  assert.equal(result.toolUseID, 'tool-1');
  assert.equal(Array.isArray(result.updatedPermissions), true);
});
```

- [ ] **Step 2: Run the focused tests and verify the current code path is missing the official shape**

Run: `node --test server/agent-v2/runtime/claude-v2-permissions.test.mjs server/agent-v2/runtime/claude-v2-session-pool.test.mjs src/components/chat/utils/chatPermissions.test.mjs`

Expected: FAIL because `updatedPermissions` is not propagated yet.

- [ ] **Step 3: Implement a shared permission helper that maps the SDK callback data to a full `PermissionResult`**

```js
export function buildPermissionResult({
  allow,
  message,
  updatedInput,
  updatedPermissions,
  toolUseID,
}) {
  if (allow) {
    return {
      behavior: 'allow',
      updatedInput,
      updatedPermissions: Array.isArray(updatedPermissions) ? updatedPermissions : undefined,
      toolUseID,
    };
  }

  return {
    behavior: 'deny',
    message: message || 'User denied tool use',
    toolUseID,
  };
}
```

- [ ] **Step 4: Update the front-end permission UI so "remember" emits permission updates instead of only local allow-lists**

```ts
handlePermissionDecision(matchingRequestIds, {
  allow: true,
  updatedPermissions: permissionUpdate,
  updatedInput: rawInput,
});
```

- [ ] **Step 5: Re-run the permission tests and the full chat permission suite**

Run: `node --test server/agent-v2/runtime/claude-v2-permissions.test.mjs server/agent-v2/runtime/claude-v2-session-pool.test.mjs src/components/chat/utils/chatPermissions.test.mjs src/components/chat/view/subcomponents/PermissionRequestsBanner.test.mjs`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/agent-v2/runtime/claude-v2-permissions.js server/agent-v2/runtime/claude-v2-session-pool.js server/index.js src/components/chat/utils/chatPermissions.ts src/components/chat/view/subcomponents/PermissionRequestsBanner.tsx src/components/chat/hooks/useChatRealtimeHandlers.ts src/components/chat/hooks/useChatProviderState.ts src/components/chat/view/subcomponents/ChatComposer.tsx src/components/chat/types/types.ts
git commit -m "feat: align permission handling with sdk result shape"
```

## Task 5: Tighten `skipPermissions` and `bypassPermissions` Semantics

**Files:**
- Modify: `server/agent-v2/runtime/claude-v2-session-pool.js`
- Modify: `server/utils/claude-latency-trace.js`
- Modify: `src/components/chat/hooks/useChatComposerState.ts`
- Modify: `src/components/settings/hooks/useSettingsController.ts`
- Modify: `src/components/chat/utils/chatStorage.ts`
- Test: `server/utils/claude-latency-trace.test.mjs`
- Test: `server/agent-v2/runtime/claude-v2-session-pool.test.mjs`
- Test: `src/components/settings/hooks/useSettingsController.test.mjs`

- [ ] **Step 1: Write failing tests that prove skipPermissions is currently acting like a second bypass knob**

```js
test('allowDangerouslySkipPermissions is only true when permissionMode is bypassPermissions', () => {
  const trace = buildClaudeInvocationSnapshot({
    permissionMode: 'default',
    toolsSettings: { skipPermissions: true, allowedTools: [], disallowedTools: [] },
  });

  assert.equal(trace.permissionMode, 'default');
  assert.equal(trace.skipPermissions, true);
  assert.equal(trace.mcpEnabled, true);
});
```

- [ ] **Step 2: Run the focused tests and verify the current runtime still conflates the two controls**

Run: `node --test server/utils/claude-latency-trace.test.mjs server/agent-v2/runtime/claude-v2-session-pool.test.mjs src/components/settings/hooks/useSettingsController.test.mjs`

Expected: FAIL because `skipPermissions` still bleeds into bypass behavior.

- [ ] **Step 3: Make bypass explicit in the runtime helper and stop treating `skipPermissions` as an independent permission bypass**

```js
const allowDangerouslySkipPermissions = permissionMode === 'bypassPermissions';
```

- [ ] **Step 4: Update the settings controller so the UI maps skip-permissions choices into permissionMode instead of silently widening runtime authority**

```ts
if (next.skipPermissions) {
  next.permissionMode = 'bypassPermissions';
}
```

- [ ] **Step 5: Re-run the runtime and settings tests, then run `npm run typecheck`**

Run: `node --test server/utils/claude-latency-trace.test.mjs server/agent-v2/runtime/claude-v2-session-pool.test.mjs src/components/settings/hooks/useSettingsController.test.mjs`

Expected: PASS

Run: `npm run typecheck`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/agent-v2/runtime/claude-v2-session-pool.js server/utils/claude-latency-trace.js src/components/chat/hooks/useChatComposerState.ts src/components/settings/hooks/useSettingsController.ts src/components/chat/utils/chatStorage.ts
git commit -m "fix: tighten skip permission semantics"
```

## Task 6: Lock the Claude Agent SDK Version and Add an Upgrade Guard

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `scripts/check-claude-agent-sdk-version.mjs`
- Modify: `README.md` if the repo documents dependency management there
- Test: `scripts/check-claude-agent-sdk-version.mjs`

- [ ] **Step 1: Write a guard test that proves the dependency is still floating**

```js
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const lockfile = JSON.parse(await fs.readFile('package-lock.json', 'utf8'));
assert.equal(lockfile.packages['node_modules/@anthropic-ai/claude-agent-sdk'].version, '0.2.59');
```

- [ ] **Step 2: Run the guard and verify the lockfile still allows drift today**

Run: `node scripts/check-claude-agent-sdk-version.mjs`

Expected: FAIL if `package.json` still uses a caret range or if the lockfile version is not exact.

- [ ] **Step 3: Pin the SDK dependency and make the version guard explicit**

```json
{
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "0.2.59"
  }
}
```

- [ ] **Step 4: Refresh the lockfile and keep the guard green**

Run: `npm install --package-lock-only`

Expected: `package-lock.json` records `0.2.59` exactly with no caret range in `package.json`.

- [ ] **Step 5: Re-run the guard, full test suite, and typecheck**

Run: `node scripts/check-claude-agent-sdk-version.mjs`

Expected: PASS

Run: `npm test`

Expected: PASS

Run: `npm run typecheck`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json scripts/check-claude-agent-sdk-version.mjs
git commit -m "chore: pin claude agent sdk version"
```

## Task 7: Add Real Claude Agent SDK Contract Coverage

**Files:**
- Create: `server/agent-v2/runtime/claude-v2-sdk-contract.test.mjs`
- Modify: `server/agent-v2/runtime/claude-v2-session-pool.test.mjs`
- Modify: `server/agent-v2/runtime/claude-v2-event-translator.test.mjs`
- Modify: `server/agent-v2/runtime/claude-v2-request-builder.test.mjs`
- Modify: `server/utils/claude-sdk-error.test.mjs`

- [ ] **Step 1: Write a smoke test that checks the installed SDK really exposes the V2 API surface we depend on**

```js
test('installed claude agent sdk exposes unstable v2 session entrypoints', async () => {
  const sdk = await import('@anthropic-ai/claude-agent-sdk');

  assert.equal(typeof sdk.unstable_v2_createSession, 'function');
  assert.equal(typeof sdk.unstable_v2_resumeSession, 'function');
  assert.equal(typeof sdk.unstable_v2_prompt, 'function');
});
```

- [ ] **Step 2: Add an opt-in smoke prompt test that only runs when credentials are available**

```js
test('unstable_v2_prompt returns a result message in smoke mode', { skip: process.env.CLAUDE_AGENT_SDK_SMOKE !== '1' }, async () => {
  const sdk = await import('@anthropic-ai/claude-agent-sdk');
  const result = await sdk.unstable_v2_prompt('Reply with exactly: ok', {
    model: process.env.CLAUDE_AGENT_SDK_SMOKE_MODEL || 'claude-sonnet-4-6',
  });

  assert.equal(result.type, 'result');
  assert.equal(result.subtype, 'success');
});
```

- [ ] **Step 3: Run the new contract test and verify the smoke test is skipped by default**

Run: `node --test server/agent-v2/runtime/claude-v2-sdk-contract.test.mjs`

Expected: PASS, with the smoke prompt test skipped unless `CLAUDE_AGENT_SDK_SMOKE=1` is set.

- [ ] **Step 4: Fold the smoke test into the existing session-pool and translator tests where the installed SDK shape matters**

```js
const sdk = await import('@anthropic-ai/claude-agent-sdk');
assert.equal(typeof sdk.unstable_v2_createSession, 'function');
```

- [ ] **Step 5: Run the focused runtime suite and then the full suite**

Run: `node --test server/agent-v2/runtime/claude-v2-sdk-contract.test.mjs server/agent-v2/runtime/claude-v2-session-pool.test.mjs server/agent-v2/runtime/claude-v2-event-translator.test.mjs server/agent-v2/runtime/claude-v2-request-builder.test.mjs server/utils/claude-sdk-error.test.mjs`

Expected: PASS

Run: `npm test`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/agent-v2/runtime/claude-v2-sdk-contract.test.mjs server/agent-v2/runtime/claude-v2-session-pool.test.mjs server/agent-v2/runtime/claude-v2-event-translator.test.mjs server/agent-v2/runtime/claude-v2-request-builder.test.mjs server/utils/claude-sdk-error.test.mjs
git commit -m "test: add claude agent sdk contract coverage"
```

## Final Verification

After all seven tasks land, run the whole verification set once:

Run: `npm test`
Expected: PASS

Run: `npm run typecheck`
Expected: PASS

Run: `git status --short`
Expected: Only the intended plan and code changes remain.
