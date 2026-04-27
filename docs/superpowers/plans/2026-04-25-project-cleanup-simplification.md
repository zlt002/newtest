# Project Cleanup & Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove unused/redundant code, complete hooks directory migration, delete deprecated modules (Cursor, multi-Provider, TaskMaster, LangSmith), and split oversized files.

**Architecture:** Three-phase approach: (1) safe deletions, (2) hooks migration + module removal, (3) giant file splitting. Each phase ends with typecheck + test + lint validation.

**Tech Stack:** React/TypeScript frontend, Express/Node.js backend, WebSocket, Vite

**Spec:** `docs/superpowers/specs/2026-04-25-project-cleanup-simplification-design.md`

---

## Phase 1: Safe Cleanup

### Task 1: Delete empty directories

**Files:**
- Delete: `src/utils/chat/`, `src/utils/editor/`, `src/utils/shared/`, `src/components/common/`, `src/hooks/editor/`
- Delete: `server/models/schemas/` (only `.gitkeep`), `server/websocket/middleware/` (only `.gitkeep`)

- [ ] **Step 1: Delete the empty frontend directories**

```bash
rm -rf src/utils/chat/ src/utils/editor/ src/utils/shared/ src/components/common/ src/hooks/editor/
```

- [ ] **Step 2: Delete the empty server directories**

```bash
rm -rf server/models/schemas/ server/websocket/middleware/
```

- [ ] **Step 3: Verify they are gone**

```bash
ls src/utils/chat/ 2>&1 || echo "OK: removed"
ls src/hooks/editor/ 2>&1 || echo "OK: removed"
```

---

### Task 2: Delete deprecated cursor route + clean route registration

**Files:**
- Delete: `server/routes/cursor.js`
- Modify: `server/routes/index.js`

- [ ] **Step 1: Delete the deprecated cursor route file**

```bash
rm server/routes/cursor.js
```

- [ ] **Step 2: Update `server/routes/index.js` — remove cursor import and export**

The file currently has no cursor import (cursor was never in the aggregator). Verify:

```bash
grep -n "cursor" server/routes/index.js
```

Expected: no matches. If there are matches, remove them.

- [ ] **Step 3: Verify `server/index.js` has no cursor route mount**

```bash
grep -n "cursor" server/index.js
```

Expected: no matches. If there is an `app.use('/api/cursor', ...)` line, remove it.

---

### Task 3: Delete unused constants files

**Files:**
- Delete: `src/constants/config.ts`, `src/constants/models.ts`, `src/constants/index.ts`
- Keep: `src/constants/keys.ts` (used by 6 files)

- [ ] **Step 1: Verify these files have no active imports**

```bash
grep -rn "constants/config" src/ --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx"
grep -rn "constants/models" src/ --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx"
grep -rn "from.*@/constants['\"/]$" src/ --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx"
```

Expected: no matches for config, models, or bare `@/constants` import (all go to `@/constants/keys`).

- [ ] **Step 2: Delete the unused files**

```bash
rm src/constants/config.ts src/constants/models.ts src/constants/index.ts
```

- [ ] **Step 3: Verify keys.ts still works**

```bash
grep -rn "constants/keys" src/ --include="*.ts" --include="*.tsx" | head -5
```

Expected: 5-6 matches showing `@/constants/keys` or `../constants/keys` imports still intact.

---

### Task 4: Commit and validate Phase 1

- [ ] **Step 1: Run typecheck**

```bash
npm run typecheck
```

Expected: same 1 pre-existing TS5097 error in `src/components/sidebar/utils/utils.ts`.

- [ ] **Step 2: Run tests**

```bash
npm run test
```

Expected: same 5 pre-existing test failures, no new failures.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove empty directories, deprecated cursor route, and unused constants

Phase 1 of project cleanup. Deleted:
- 7 empty directories (src/utils/chat, editor, shared; src/components/common;
  src/hooks/editor; server/models/schemas; server/websocket/middleware)
- Deprecated server/routes/cursor.js (returned 410)
- Unused src/constants/{config,models,index}.ts

No active imports affected.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Phase 2: Hooks Migration + Module Removal

### Task 5: Complete hooks directory migration

**Context:** `src/hooks/chat/` has 28 hook files (the migration target, imports already use aliases). `src/components/chat/hooks/` has 28 identical hook files (the old location, currently active). We need to update 9 files that import from the old location, then delete the old directory.

**Files to modify (import paths):**
- `src/components/chat/view/ChatInterface.tsx`
- `src/components/chat/types/types.ts`
- `src/components/chat/view/subcomponents/MessageComponent.tsx`
- `src/components/chat/view/subcomponents/MessageComponent.jobTree.test.mjs`
- `src/components/main-content/types/types.ts`
- `src/components/code-editor/hooks/useEditorSidebar.ts`
- `src/components/app/AppContent.tsx`
- `src/components/app/utils/draftPreviewFollowAlong.ts`
- `src/components/app/utils/fileChangeFollowAlong.ts`

- [ ] **Step 1: Update ChatInterface.tsx — change 6 imports from `../hooks/` to `@hooks/chat/`**

In `src/components/chat/view/ChatInterface.tsx`, replace:

```typescript
import { useChatProviderState } from '../hooks/useChatProviderState';
import { useChatSessionState } from '../hooks/useChatSessionState';
import { useChatRealtimeHandlers } from '../hooks/useChatRealtimeHandlers';
import { useChatComposerState } from '../hooks/useChatComposerState';
import { useAgentConversation } from '../hooks/useAgentConversation';
// @ts-expect-error -- Node test runner resolves explicit .ts extensions for direct execution.
import { useHistoricalAgentConversation } from '../hooks/useHistoricalAgentConversation.ts';
```

with:

```typescript
import { useChatProviderState } from '@hooks/chat/useChatProviderState';
import { useChatSessionState } from '@hooks/chat/useChatSessionState';
import { useChatRealtimeHandlers } from '@hooks/chat/useChatRealtimeHandlers';
import { useChatComposerState } from '@hooks/chat/useChatComposerState';
import { useAgentConversation } from '@hooks/chat/useAgentConversation';
// @ts-expect-error -- Node test runner resolves explicit .ts extensions for direct execution.
import { useHistoricalAgentConversation } from '@hooks/chat/useHistoricalAgentConversation.ts';
```

- [ ] **Step 2: Update types.ts — change 2 imports from `../hooks/` to `@hooks/chat/`**

In `src/components/chat/types/types.ts`, replace:

```typescript
import type { FileChangeEvent } from '../hooks/chatFileChangeEvents';
import type { DraftPreviewEvent } from '../hooks/chatDraftPreviewEvents';
```

with:

```typescript
import type { FileChangeEvent } from '@hooks/chat/chatFileChangeEvents';
import type { DraftPreviewEvent } from '@hooks/chat/chatDraftPreviewEvents';
```

- [ ] **Step 3: Update MessageComponent.tsx — change 1 import from `../../hooks/` to `@hooks/chat/`**

In `src/components/chat/view/subcomponents/MessageComponent.tsx`, replace:

```typescript
import { getToolUseLeadText } from '../../hooks/chatMessagePresentation.js';
```

with:

```typescript
import { getToolUseLeadText } from '@hooks/chat/chatMessagePresentation.js';
```

- [ ] **Step 4: Update MessageComponent.jobTree.test.mjs — update stub mapping**

In `src/components/chat/view/subcomponents/MessageComponent.jobTree.test.mjs`, find the stub mapping that contains `../../hooks/chatMessagePresentation.js` and update it to `@hooks/chat/chatMessagePresentation.js`.

Search for the exact line:
```bash
grep -n "chatMessagePresentation" src/components/chat/view/subcomponents/MessageComponent.jobTree.test.mjs
```

Update the stub URL path from `../../hooks/chatMessagePresentation.js` to `@hooks/chat/chatMessagePresentation.js`.

- [ ] **Step 5: Update main-content types.ts — change 2 imports from `../../chat/hooks/` to `@hooks/chat/`**

In `src/components/main-content/types/types.ts`, replace:

```typescript
import type { FileChangeEvent } from '../../chat/hooks/chatFileChangeEvents';
import type { DraftPreviewEvent } from '../../chat/hooks/chatDraftPreviewEvents';
```

with:

```typescript
import type { FileChangeEvent } from '@hooks/chat/chatFileChangeEvents';
import type { DraftPreviewEvent } from '@hooks/chat/chatDraftPreviewEvents';
```

- [ ] **Step 6: Update useEditorSidebar.ts — change 2 imports from `../../chat/hooks/` to `@hooks/chat/`**

In `src/components/code-editor/hooks/useEditorSidebar.ts`, replace:

```typescript
import type { FileChangeLineRange } from '../../chat/hooks/chatFileChangeEvents';
import type { DraftPreviewEvent } from '../../chat/hooks/chatDraftPreviewEvents';
```

with:

```typescript
import type { FileChangeLineRange } from '@hooks/chat/chatFileChangeEvents';
import type { DraftPreviewEvent } from '@hooks/chat/chatDraftPreviewEvents';
```

- [ ] **Step 7: Update AppContent.tsx — change 2 imports from `../chat/hooks/` to `@hooks/chat/`**

In `src/components/app/AppContent.tsx`, replace:

```typescript
import type { FileChangeEvent } from '../chat/hooks/chatFileChangeEvents';
import type { DraftPreviewEvent } from '../chat/hooks/chatDraftPreviewEvents';
```

with:

```typescript
import type { FileChangeEvent } from '@hooks/chat/chatFileChangeEvents';
import type { DraftPreviewEvent } from '@hooks/chat/chatDraftPreviewEvents';
```

- [ ] **Step 8: Update draftPreviewFollowAlong.ts — change 1 import**

In `src/components/app/utils/draftPreviewFollowAlong.ts`, replace:

```typescript
import type { FileChangeEvent } from '../../chat/hooks/chatFileChangeEvents';
```

with:

```typescript
import type { FileChangeEvent } from '@hooks/chat/chatFileChangeEvents';
```

- [ ] **Step 9: Update fileChangeFollowAlong.ts — change 1 import**

In `src/components/app/utils/fileChangeFollowAlong.ts`, replace:

```typescript
import type { DraftPreviewEvent } from '../../chat/hooks/chatDraftPreviewEvents';
```

with:

```typescript
import type { DraftPreviewEvent } from '@hooks/chat/chatDraftPreviewEvents';
```

- [ ] **Step 10: Verify no remaining imports point to the old hooks location**

```bash
grep -rn "from.*['\"].*chat/hooks/" src/ --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.mjs" | grep -v "node_modules" | grep -v "src/hooks/chat/"
```

Expected: zero matches. If any remain, update them.

- [ ] **Step 11: Delete the old hooks directory**

```bash
rm -rf src/components/chat/hooks/
```

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor: migrate all chat hook imports to @hooks/chat/ alias

Delete src/components/chat/hooks/ (old location). All imports now
point to src/hooks/chat/ via the @hooks/chat/ path alias.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Remove multi-Provider server-side

**Files to delete:**
- `server/providers/` (entire directory — registry.js, claude/adapter.js, types.js, utils.js)
- `server/routes/gemini.js`
- `server/routes/messages.js`
- `server/services/notification-orchestrator.js`

**Files to modify:**
- `server/routes/index.js` — remove gemini, messages imports/exports

- [ ] **Step 1: Delete provider infrastructure**

```bash
rm -rf server/providers/
rm server/routes/gemini.js
rm server/routes/messages.js
rm server/services/notification-orchestrator.js
```

- [ ] **Step 2: Update `server/routes/index.js` — remove gemini and messages**

Remove the `messagesRoutes` import line and all references. The file should only keep: auth, projects, git, mcp, commands, settings, agent, cli-auth, user routes.

Remove these specific lines:
- `import messagesRoutes from './messages.js';`
- `messagesRoutes,` from the named exports
- `'messages': messagesRoutes,` from the default export

Note: `taskmasterRoutes` and `mcpUtilsRoutes` will be removed in Task 8.

- [ ] **Step 3: Check server/index.js for direct references**

```bash
grep -n "messagesRoutes\|notification-orchestrator\|provider.*registry\|gemini" server/index.js
```

Remove any `import` and `app.use()` lines referencing these modules.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove multi-provider server infrastructure

Delete server/providers/, routes/gemini.js, routes/messages.js,
and services/notification-orchestrator.js. Claude conversations
use the V2 agent WebSocket route exclusively.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Remove multi-Provider client-side

**Files to delete:**
- `src/components/provider-auth/` (entire directory)

**Files to modify:**
- `src/components/onboarding/view/utils.ts` — simplify cliProviders to Claude only
- `src/components/onboarding/view/Onboarding.tsx` — remove ProviderLoginModal
- `src/components/settings/view/tabs/AgentsSettingsTab.tsx` — remove provider-auth import
- `src/components/llm-logo-provider/SessionProviderLogo.tsx` — simplify to Claude only

- [ ] **Step 1: Delete provider-auth directory**

```bash
rm -rf src/components/provider-auth/
```

- [ ] **Step 2: Simplify `src/components/onboarding/view/utils.ts`**

Find the `cliProviders` array and reduce it to Claude only:

```typescript
// Before:
export const cliProviders: CliProvider[] = ['claude', 'cursor', 'codex', 'gemini'];

// After:
export const cliProviders: CliProvider[] = ['claude'];
```

Also simplify `createInitialProviderStatuses` to only handle Claude, removing cursor/codex/gemini cases.

- [ ] **Step 3: Simplify `src/components/onboarding/view/Onboarding.tsx`**

Remove the `ProviderLoginModal` import:
```typescript
// Remove this line:
import ProviderLoginModal from '../../provider-auth/view/ProviderLoginModal';
```

Remove any usage of `<ProviderLoginModal ... />` in the JSX. If the onboarding flow opens the modal for provider login, replace with a direct Claude auth check.

- [ ] **Step 4: Simplify `src/components/settings/view/tabs/AgentsSettingsTab.tsx`**

Remove the `ProviderLoginModal` import and any multi-provider logic. Search first:

```bash
grep -n "provider-auth\|ProviderLoginModal" src/components/settings/view/tabs/AgentsSettingsTab.tsx
```

Remove those imports and any associated JSX/logic. Keep only Claude-related settings.

- [ ] **Step 5: Review and simplify `src/components/llm-logo-provider/SessionProviderLogo.tsx`**

Read the file. If it renders different logos based on provider type, simplify to always render the Claude logo. If it's just a wrapper around ClaudeLogo, consider inlining it.

- [ ] **Step 6: Search for any remaining provider-auth imports**

```bash
grep -rn "provider-auth" src/ --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx"
```

Expected: zero matches. Remove any remaining references.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove multi-provider client-side code

Delete src/components/provider-auth/. Simplify onboarding and
settings to Claude-only. Remove non-Claude provider logos.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 8: Remove TaskMaster integration

**Files to delete:**
- `server/routes/taskmaster.js` (65KB)
- `server/routes/mcp-utils.js`
- `server/utils/taskmaster-websocket.js`
- `server/utils/mcp-detector.js`
- `src/components/task-master/` (entire directory)
- `src/contexts/TaskMasterContext.ts`
- `src/i18n/zh-CN/tasks.json`

**Files to modify:**
- `server/routes/index.js` — remove taskmaster, mcp-utils imports
- `server/index.js` — remove taskmaster route mount and any TaskMaster references

- [ ] **Step 1: Delete TaskMaster server files**

```bash
rm server/routes/taskmaster.js
rm server/routes/mcp-utils.js
rm server/utils/taskmaster-websocket.js
rm server/utils/mcp-detector.js
```

- [ ] **Step 2: Delete TaskMaster client files**

```bash
rm -rf src/components/task-master/
rm src/contexts/TaskMasterContext.ts
```

- [ ] **Step 3: Delete TaskMaster translations**

```bash
rm src/i18n/zh-CN/tasks.json
```

Also check and remove from other locale directories:
```bash
find src/i18n -name "tasks.json" -delete
```

- [ ] **Step 4: Update `server/routes/index.js` — remove taskmaster and mcp-utils**

Remove these specific lines:
- `import taskmasterRoutes from './taskmaster.js';`
- `import mcpUtilsRoutes from './mcp-utils.js';`
- `taskmasterRoutes,` from named exports
- `mcpUtilsRoutes,` from named exports
- `'taskmaster': taskmasterRoutes,` from default export
- `'mcp-utils': mcpUtilsRoutes,` from default export

- [ ] **Step 5: Update `server/index.js` — remove TaskMaster route mount**

Find and remove:
```bash
grep -n "taskmaster" server/index.js
```

Remove the import line (`import taskmasterRoutes from './routes/taskmaster.js'`) and the `app.use('/api/taskmaster', ...)` line.

Also search for any `taskmaster-websocket` or `mcp-detector` references in server/index.js and remove them.

- [ ] **Step 6: Remove TaskMaster context from frontend app tree**

Search for where TaskMasterContext is used:
```bash
grep -rn "TaskMasterContext\|task-master" src/ --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" | grep -v "node_modules"
```

Remove any imports and provider wrapping in App.tsx or main entry files.

- [ ] **Step 7: Verify no remaining references**

```bash
grep -rn "taskmaster\|task-master\|TaskMaster" src/ server/ --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.mjs" | grep -v "node_modules" | grep -v ".test."
```

Expected: zero matches (or only in test files that will be removed).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: remove TaskMaster integration

Delete 65KB server/routes/taskmaster.js, TaskMaster UI components,
context, translations, and MCP utilities. Claude-only build does
not need task management integration.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 9: Remove LangSmith integration

**Files to delete:**
- `server/utils/langsmith-claude-sdk.js`
- `server/utils/langsmith-claude-sdk.test.mjs`

**Files to modify:**
- `server/index.js` — remove LangSmith import and observability endpoint
- `server/routes/git.js` — replace `getClaudeAgentSdk` with direct SDK import
- `server/services/agent/runtime/claude-v2-session-pool.js` — replace `getClaudeAgentSdk` with direct SDK import

- [ ] **Step 1: Delete LangSmith files**

```bash
rm server/utils/langsmith-claude-sdk.js
rm server/utils/langsmith-claude-sdk.test.mjs
```

- [ ] **Step 2: Update `server/index.js` — remove LangSmith references**

Remove the import (line 74):
```javascript
// Remove this line:
import { getLangSmithDashboardUrl, isLangSmithTracingEnabled } from './utils/langsmith-claude-sdk.js';
```

Find and remove the observability status endpoint (around lines 658-663):
```javascript
// Remove this entire endpoint block:
const enabled = isLangSmithTracingEnabled(process.env);
// ... and the res.json() with dashboardUrl
```

Search for the exact block:
```bash
grep -n "isLangSmithTracingEnabled\|getLangSmithDashboardUrl\|observab" server/index.js
```

Remove all related lines.

- [ ] **Step 3: Update `server/routes/git.js` — replace LangSmith SDK wrapper**

At line 6, replace:
```javascript
// Before:
import { getClaudeAgentSdk } from '../utils/langsmith-claude-sdk.js';
```
with:
```javascript
// After:
import * as ClaudeAgentSDK from '@anthropic-ai/claude-agent-sdk';
```

At line 944, replace:
```javascript
// Before:
const claudeSdk = getClaudeAgentSdk(process.env);
```
with:
```javascript
// After:
const claudeSdk = ClaudeAgentSDK;
```

- [ ] **Step 4: Update `server/services/agent/runtime/claude-v2-session-pool.js`**

At line 5, replace:
```javascript
// Before:
import { getClaudeAgentSdk } from '../../../utils/langsmith-claude-sdk.js';
```
with:
```javascript
// After:
import * as ClaudeAgentSDK from '@anthropic-ai/claude-agent-sdk';
```

At line 327, replace:
```javascript
// Before:
export function createClaudeV2SessionPool(sdk = getClaudeAgentSdk(process.env)) {
```
with:
```javascript
// After:
export function createClaudeV2SessionPool(sdk = ClaudeAgentSDK) {
```

- [ ] **Step 5: Verify no remaining LangSmith references**

```bash
grep -rn "langsmith\|getClaudeAgentSdk\|LANGSMITH" server/ src/ --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.mjs" | grep -v "node_modules" | grep -v ".test."
```

Expected: zero matches.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove LangSmith integration

Delete langsmith-claude-sdk.js wrapper. Replace getClaudeAgentSdk()
calls with direct @anthropic-ai/claude-agent-sdk imports in git.js
and claude-v2-session-pool.js. Remove observability status endpoint.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 10: Clean up remaining route registrations and provider-specific code

**Files to modify:**
- `server/index.js` — remove any remaining deprecated route mounts
- `server/projects.js` — remove Gemini/Codex/Cursor session functions

- [ ] **Step 1: Audit remaining deprecated route mounts in server/index.js**

```bash
grep -n "app.use.*gemini\|app.use.*messages\|app.use.*cursor\|app.use.*taskmaster" server/index.js
```

Remove any remaining `app.use()` lines for deleted routes.

- [ ] **Step 2: Audit server/index.js imports for deleted modules**

```bash
grep -n "gemini\|messages\|cursor\|taskmaster\|notification-orchestrator" server/index.js | grep "import"
```

Remove any remaining import lines for deleted modules.

- [ ] **Step 3: Remove multi-provider session functions from `server/projects.js`**

The following functions are provider-specific and should be removed:
- `getCursorSessions` (lines ~1321-1429)
- `getCodexSessions` (lines ~1523-1545)
- `getCodexSessionMessages` (lines ~1637-1880)
- `deleteCodexSession` (lines ~1882-1917)
- `getGeminiCliSessions` (lines ~2458-2532)
- `getGeminiCliSessionMessages` (lines ~2534-2586)

Also clean up `searchConversations` to remove Cursor/Codex/Gemini search paths.
And clean up `deleteProject` to remove Codex/Cursor session deletion.

- [ ] **Step 4: Verify server still starts**

```bash
timeout 5 npm run server 2>&1 || true
```

Check for import errors or missing module errors in the output.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove multi-provider session functions from projects.js

Remove getCursorSessions, getCodexSessions, getCodexSessionMessages,
deleteCodexSession, getGeminiCliSessions, getGeminiCliSessionMessages.
Clean searchConversations and deleteProject for Claude-only.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 11: Remove unused npm dependencies

**Files to modify:**
- `package.json`
- `.gitignore`

- [ ] **Step 1: Remove langsmith dependency**

```bash
npm uninstall langsmith
```

- [ ] **Step 2: Check for other unused dependencies**

After removing modules, check if these packages are still imported anywhere:

```bash
grep -rn "from 'langsmith" server/ src/ --include="*.ts" --include="*.js"
```

Expected: zero matches (already removed).

- [ ] **Step 3: Clean up .gitignore**

Remove entries that are no longer relevant:
- `.taskmaster/` — TaskMaster removed
- `.gemini/` — Gemini removed

```bash
grep -n "taskmaster\|\.gemini" .gitignore
```

Remove those lines.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove langsmith dependency and cleanup gitignore

Remove langsmith from package.json. Remove .taskmaster/ and .gemini/
entries from .gitignore.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 12: Validate Phase 2

- [ ] **Step 1: Run typecheck**

```bash
npm run typecheck
```

Expected: no NEW errors beyond the 1 pre-existing TS5097.

- [ ] **Step 2: Run tests**

```bash
npm run test
```

Expected: no NEW failures beyond the 5 pre-existing.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: no NEW errors beyond the pre-existing baseline.

- [ ] **Step 4: Verify server starts**

```bash
timeout 8 npm run server 2>&1 || true
```

Check for successful startup message (listening on port).

- [ ] **Step 5: Verify frontend builds**

```bash
npm run build
```

Expected: successful build with no errors.

- [ ] **Step 6: Verify old hooks directory is gone**

```bash
ls src/components/chat/hooks/ 2>&1 || echo "OK: old hooks directory removed"
```

---

## Phase 3: Giant File Splitting

### Task 13: Extract WebSocket handlers from server/index.js

**Context:** `server/index.js` is 2919 lines. WebSocket handlers (`handleChatConnection` at lines ~1800-1932 and `handleShellConnection` at lines ~1935-2291) are the largest single blocks. The existing `server/websocket/handlers/chatHandler.js` and `shellHandler.js` are stubs.

**Files to create/modify:**
- Modify: `server/websocket/handlers/chatHandler.js` — move chat WS logic here
- Modify: `server/websocket/handlers/shellHandler.js` — move shell WS logic here
- Create: `server/websocket/setup.js` — WS server init + event routing
- Modify: `server/index.js` — remove extracted code, import from new modules

- [ ] **Step 1: Read the current stub handlers**

```bash
cat server/websocket/handlers/chatHandler.js
cat server/websocket/handlers/shellHandler.js
```

Understand their current state (likely just error-throwing stubs).

- [ ] **Step 2: Extract handleChatConnection to chatHandler.js**

Move the `handleChatConnection` function (lines ~1800-1932) from `server/index.js` into `server/websocket/handlers/chatHandler.js`. Export it as a named export.

The handler needs these dependencies passed in or imported:
- `handleClaudeCommandWithAgentV2` from agent services
- `connectedClients` state
- `projects` from `server/projects.js`
- Any other state it references

Use dependency injection: export a factory function that receives the dependencies and returns the handler:

```javascript
export function createChatHandler(deps) {
  const { handleClaudeCommandWithAgentV2, connectedClients, projects } = deps;
  return function handleChatConnection(ws, req) {
    // ... existing logic
  };
}
```

- [ ] **Step 3: Extract handleShellConnection to shellHandler.js**

Move the `handleShellConnection` function (lines ~1935-2291) from `server/index.js` into `server/websocket/handlers/shellHandler.js`. Same factory pattern:

```javascript
export function createShellHandler(deps) {
  const { ptySessionsMap, projects } = deps;
  return function handleShellConnection(ws, req) {
    // ... existing logic
  };
}
```

- [ ] **Step 4: Create `server/websocket/setup.js`**

Extract the WebSocket server initialization and event binding:

```javascript
import { createChatHandler } from './handlers/chatHandler.js';
import { createShellHandler } from './handlers/shellHandler.js';

export function setupWebSocket(server, deps) {
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws, req) => { /* routing logic */ });
  return wss;
}
```

- [ ] **Step 5: Update server/index.js — replace inline handlers with imports**

Remove the inline `handleChatConnection`, `handleShellConnection`, and `WebSocketWriter` class. Import from the new modules:

```javascript
import { createChatHandler } from './websocket/handlers/chatHandler.js';
import { createShellHandler } from './websocket/handlers/shellHandler.js';
import { setupWebSocket } from './websocket/setup.js';
```

- [ ] **Step 6: Verify server starts**

```bash
timeout 8 npm run server 2>&1 || true
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: extract WebSocket handlers from server/index.js

Move handleChatConnection and handleShellConnection into
server/websocket/handlers/. Create server/websocket/setup.js
for WS server initialization. server/index.js reduced by ~500 lines.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 14: Extract API endpoints from server/index.js

**Context:** After extracting WS handlers, `server/index.js` still has many inline API endpoint definitions. Move them into route files.

**Files to modify:**
- `server/index.js` — remove inline endpoints
- `server/routes/` — move endpoint handlers here

- [ ] **Step 1: Identify remaining inline endpoints in server/index.js**

After the WS extraction, list all `app.get`, `app.post`, `app.put`, `app.delete` handlers still in the file:

```bash
grep -n "app\.\(get\|post\|put\|delete\)" server/index.js
```

- [ ] **Step 2: Group endpoints by domain**

Group the remaining endpoints into logical domains:
- File operations (browse, create folder, file save, etc.)
- Audio/transcription endpoints
- Token usage endpoints
- System endpoints (health, update)

- [ ] **Step 3: Move file operation endpoints to a dedicated route file**

Create or update a route file (e.g., `server/routes/files.js`) for file-system-related endpoints. Move the handlers from `server/index.js`.

- [ ] **Step 4: Move other endpoints to appropriate route files**

Move each group of endpoints to their corresponding route files. Update `server/routes/index.js` to register the new routes.

- [ ] **Step 5: Verify server/index.js is under 500 lines**

```bash
wc -l server/index.js
```

Expected: under 500 lines.

- [ ] **Step 6: Verify server starts**

```bash
timeout 8 npm run server 2>&1 || true
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: extract inline API endpoints from server/index.js

Move file operations, audio, token usage, and system endpoints
into dedicated route files. server/index.js reduced to ~500 lines.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 15: Split server/projects.js

**Context:** `server/projects.js` is 2612 lines with mixed responsibilities. After Phase 2's removal of multi-provider functions, it should be significantly smaller. Split the remaining Claude-specific functions into focused modules.

**Files to modify:**
- `server/projects.js` — reduce to re-exports
- `server/controllers/projectController.js` — expand with project discovery
- `server/sessionManager.js` — consolidate session management
- Create: `server/services/sessionParsing.js` — JSONL parsing logic

- [ ] **Step 1: Measure post-cleanup size**

After removing multi-provider functions (Task 10), check:

```bash
wc -l server/projects.js
```

- [ ] **Step 2: Extract session parsing logic**

Move `parseJsonlSessions` and related parsing functions to `server/services/sessionParsing.js`.

- [ ] **Step 3: Extract session management functions**

Move `getSessions`, `getSessionMessages`, `deleteSession`, `findSessionLocation` to `server/sessionManager.js`.

- [ ] **Step 4: Update `server/projects.js` to re-export from new modules**

```javascript
export { getProjects, addProjectManually, renameProject, deleteProject, isProjectEmpty } from './services/projectDiscovery.js';
export { getSessions, getSessionMessages, deleteSession, findSessionLocation } from './sessionManager.js';
```

Or keep as re-exports if many files import from `server/projects.js`.

- [ ] **Step 5: Verify no broken imports**

```bash
grep -rn "from.*projects" server/ --include="*.js" | head -20
```

Ensure all consumers still resolve correctly.

- [ ] **Step 6: Verify server starts**

```bash
timeout 8 npm run server 2>&1 || true
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: split server/projects.js into focused modules

Extract session parsing to services/sessionParsing.js.
Consolidate session management in sessionManager.js.
projects.js reduced to core project discovery and re-exports.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 16: Final validation

- [ ] **Step 1: Run full typecheck**

```bash
npm run typecheck
```

Expected: no NEW errors.

- [ ] **Step 2: Run full test suite**

```bash
npm run test
```

Expected: no NEW failures.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: no NEW errors.

- [ ] **Step 4: Run full build**

```bash
npm run build
```

Expected: successful build.

- [ ] **Step 5: Verify success criteria from spec**

1. `ls src/components/chat/hooks/` — should not exist
2. `ls server/providers/` — should not exist
3. `ls src/components/task-master/` — should not exist
4. `ls server/utils/langsmith-claude-sdk.js` — should not exist
5. `wc -l server/index.js` — should be under 500 lines
6. `grep -rn "@hooks/chat/" src/` — all hook imports should use the alias

---

## Self-Review Checklist

- [x] **Spec coverage:** Each section in the spec maps to a task (Phase 1 = Tasks 1-4, Phase 2 = Tasks 5-12, Phase 3 = Tasks 13-16)
- [x] **Placeholder scan:** No "TBD", "TODO", "implement later" patterns
- [x] **Type consistency:** All import paths use correct aliases; SDK replacement uses `@anthropic-ai/claude-agent-sdk`
