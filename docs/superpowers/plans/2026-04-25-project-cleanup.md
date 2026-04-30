# Project Cleanup Implementation Plan

> **档案状态：历史计划（已归档）** 本文档是历史执行计划，当前代码库在后续清理迭代中已演进，文中清单主要用于工程决策追溯。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove dead code, migrate remaining JS→TS, and simplify project structure in one pass.

**Architecture:** Three sequential phases executed atomically. Phase 1 removes confirmed dead files. Phase 2 migrates all remaining .js/.jsx files to TypeScript. Phase 3 handles structural cleanup. Each phase ends with a verification commit.

**Tech Stack:** TypeScript, React 18, Express 4, Vite 7, Node.js test runner

---

## File Structure

### Files to DELETE
```
server/controllers/projectController.js
server/controllers/gitController.js
server/controllers/.gitkeep
server/controllers/                          # entire directory
server/models/Session.js
server/routes/cli-auth.js
server/routes/agent.js
src/components/chat/components/AssistantRuntimeTurn.ts
src/components/chat/components/AssistantRuntimeTurn.test.mjs
src/components/chat/components/ConversationStream.tsx
src/components/chat/components/ConversationStream.test.mjs
src/components/chat/components/InlineRuntimeActivity.ts
src/components/chat/components/InlineRuntimeActivity.test.mjs
src/components/chat/components/RunCard.tsx
src/components/chat/components/RunCard.test.mjs
src/components/chat/components/RunCardInteraction.tsx
src/components/chat/components/RunCardProcessTimeline.tsx
src/components/chat/components/RuntimeMarkdown.ts
src/components/chat/components/RuntimeMarkdown.test.mjs
src/components/chat/components/ComposerContextBar.test.mjs
src/components/chat/components/stream-blocks/    # entire directory
src/contexts/AuthContext.jsx                   # re-export only, real one is in components/auth/
```

### Files to MODIFY
```
server/index.js                               # remove dead route imports + registrations
server/routes/index.js                        # remove dead route exports
package.json                                  # remove dead test paths
index.html                                    # main.jsx → main.tsx
src/contexts/WebSocketContext.tsx              # update socketSendQueue import
src/stores/useSessionStore.ts                 # update sessionStoreRebind import
CLAUDE.md                                     # fix outdated directory descriptions
```

### Files to RENAME + MIGRATE (JS→TS)
```
src/main.jsx                                  → src/main.tsx
src/contexts/ThemeContext.jsx                  → src/contexts/ThemeContext.tsx
src/contexts/socketSendQueue.js                → src/contexts/socketSendQueue.ts
src/hooks/chat/builtInCommandBehavior.js       → src/hooks/chat/builtInCommandBehavior.ts
src/hooks/chat/chatComposerSessionTarget.js    → src/hooks/chat/chatComposerSessionTarget.ts
src/hooks/chat/chatMessagePresentation.js      → src/hooks/chat/chatMessagePresentation.ts
src/hooks/chat/chatRealtimeFileChangeEvents.js → src/hooks/chat/chatRealtimeFileChangeEvents.ts
src/hooks/chat/pendingUserMessage.js           → src/hooks/chat/pendingUserMessage.ts
src/hooks/chat/sessionCompletionSync.js        → src/hooks/chat/sessionCompletionSync.ts
src/hooks/chat/sessionStreamingRouting.js      → src/hooks/chat/sessionStreamingRouting.ts
src/hooks/chat/sessionTranscript.js            → src/hooks/chat/sessionTranscript.ts
src/hooks/chat/slashCommandData.js             → src/hooks/chat/slashCommandData.ts
src/hooks/shared/useLocalStorage.jsx           → src/hooks/shared/useLocalStorage.tsx
src/components/chat/projection/runFailureMessage.js    → .ts
src/components/chat/projection/taskBlockGrouping.js    → .ts
src/components/chat/utils/chatFormatting.js            → .ts
src/components/chat/utils/chatStorage.js               → .ts
src/components/chat/tools/utils/questionNormalization.js → .ts  (merge .d.ts into this)
src/components/chat/tools/utils/questionNormalization.d.ts → DELETE (merged into .ts)
src/components/chat/view/subcomponents/commandMenuGroups.js → .ts
src/components/git-panel/utils/gitPanelErrorText.js    → .ts
src/components/right-pane/utils/rightPaneTargetIdentity.js → .ts
src/components/settings/utils/settingsStorage.js       → .ts
src/lib/utils.js                                       → src/lib/utils.ts
src/stores/sessionStoreRebind.js                       → src/stores/sessionStoreRebind.ts
src/utils/api.js                                       → src/utils/api.ts
```

---

## Task 1: Delete Dead Backend Files

**Files:**
- Delete: `server/controllers/` (entire directory)
- Delete: `server/models/Session.js`
- Delete: `server/routes/cli-auth.js`
- Delete: `server/routes/agent.js`

- [ ] **Step 1: Delete controllers directory**

```bash
rm -rf server/controllers/
```

- [ ] **Step 2: Delete unused model**

```bash
rm server/models/Session.js
```

- [ ] **Step 3: Delete unused routes**

```bash
rm server/routes/cli-auth.js server/routes/agent.js
```

- [ ] **Step 4: Remove dead imports from server/index.js**

In `server/index.js`, remove these lines:
- Line 52: `import agentRoutes from './routes/agent.js';`
- Line 55: `import cliAuthRoutes from './routes/cli-auth.js';`
- Line 321: `app.use('/api/cli', authenticateToken, cliAuthRoutes);`
- Line 328: `app.use('/api/agent', agentRoutes);`

- [ ] **Step 5: Remove dead exports from server/routes/index.js**

In `server/routes/index.js`, remove:
- `import agentRoutes from './agent.js';`
- `import cliAuthRoutes from './cli-auth.js';`
- All references to `agentRoutes` and `cliAuthRoutes` in both the named export block and the default export object

The file should end up exporting only: `authRoutes, projectsRoutes, gitRoutes, mcpRoutes, commandsRoutes, settingsRoutes, userRoutes, filesRoutes, sessionsRoutes, systemRoutes`

- [ ] **Step 6: Verify server starts**

Run: `node server/index.js &` then kill it after 3 seconds (or just check it doesn't throw on import).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: remove dead backend code (controllers, Session model, cli-auth and agent routes)"
```

---

## Task 2: Delete Dead Frontend Components

**Files:**
- Delete: `src/components/chat/components/AssistantRuntimeTurn.ts`
- Delete: `src/components/chat/components/AssistantRuntimeTurn.test.mjs`
- Delete: `src/components/chat/components/ConversationStream.tsx`
- Delete: `src/components/chat/components/ConversationStream.test.mjs`
- Delete: `src/components/chat/components/InlineRuntimeActivity.ts`
- Delete: `src/components/chat/components/InlineRuntimeActivity.test.mjs`
- Delete: `src/components/chat/components/RunCard.tsx`
- Delete: `src/components/chat/components/RunCard.test.mjs`
- Delete: `src/components/chat/components/RunCardInteraction.tsx`
- Delete: `src/components/chat/components/RunCardProcessTimeline.tsx`
- Delete: `src/components/chat/components/RuntimeMarkdown.ts`
- Delete: `src/components/chat/components/RuntimeMarkdown.test.mjs`
- Delete: `src/components/chat/components/ComposerContextBar.test.mjs`
- Delete: `src/components/chat/components/stream-blocks/` (entire directory)
- Delete: `src/contexts/AuthContext.jsx`

- [ ] **Step 1: Delete unused chat components and tests**

```bash
rm src/components/chat/components/AssistantRuntimeTurn.ts
rm src/components/chat/components/AssistantRuntimeTurn.test.mjs
rm src/components/chat/components/ConversationStream.tsx
rm src/components/chat/components/ConversationStream.test.mjs
rm src/components/chat/components/InlineRuntimeActivity.ts
rm src/components/chat/components/InlineRuntimeActivity.test.mjs
rm src/components/chat/components/RunCard.tsx
rm src/components/chat/components/RunCard.test.mjs
rm src/components/chat/components/RunCardInteraction.tsx
rm src/components/chat/components/RunCardProcessTimeline.tsx
rm src/components/chat/components/RuntimeMarkdown.ts
rm src/components/chat/components/RuntimeMarkdown.test.mjs
rm src/components/chat/components/ComposerContextBar.test.mjs
rm -rf src/components/chat/components/stream-blocks/
```

- [ ] **Step 2: Delete dead AuthContext re-export**

```bash
rm src/contexts/AuthContext.jsx
```

- [ ] **Step 3: Search for any dangling imports of deleted files**

Search the codebase for imports referencing any deleted file. If found, remove those import lines.

Key patterns to search:
- `AssistantRuntimeTurn`
- `ConversationStream`
- `InlineRuntimeActivity` (type exports may still be referenced — keep type-only imports if they point to still-existing files)
- `RunCard` (excluding `RunCard` types that are defined elsewhere)
- `RunCardInteraction`
- `RunCardProcessTimeline`
- `RuntimeMarkdown`
- `stream-blocks`
- `ArtifactBlock`, `DecisionBlock`, `RecoveryBlock`, `StatusInline`, `TaskBlock`, `TurnBlock`

- [ ] **Step 4: Clean up package.json test script**

In `package.json` "test" script, remove these non-existent test paths:
- `src/components/chat-v2/store/createAgentEventStore.test.mjs`
- `src/components/chat-v2/projection/projectRunExecution.test.mjs`
- `src/components/chat-v2/components/ConversationTimeline.test.mjs`
- `src/components/chat-v2/components/RunExecutionPanel.test.mjs`
- `src/components/chat-v2/components/ComposerContextBar.test.mjs`

- [ ] **Step 5: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS (or same errors as before, no new errors)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove dead frontend components and fix test script"
```

---

## Task 3: Migrate Entry Point (main.jsx → main.tsx)

**Files:**
- Rename: `src/main.jsx` → `src/main.tsx`
- Modify: `index.html`

- [ ] **Step 1: Rename main.jsx to main.tsx**

```bash
git mv src/main.jsx src/main.tsx
```

- [ ] **Step 2: Update index.html**

In `index.html` line 14, change:
```html
<script type="module" src="/src/main.jsx"></script>
```
to:
```html
<script type="module" src="/src/main.tsx"></script>
```

- [ ] **Step 3: Verify dev server starts**

Run: `npm run dev` briefly to confirm Vite resolves the new entry point.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: migrate main.jsx to main.tsx"
```

---

## Task 4: Migrate contexts/ Files

**Files:**
- Rename + migrate: `src/contexts/ThemeContext.jsx` → `src/contexts/ThemeContext.tsx`
- Rename + migrate: `src/contexts/socketSendQueue.js` → `src/contexts/socketSendQueue.ts`
- Modify: `src/contexts/WebSocketContext.tsx` (update import)

- [ ] **Step 1: Migrate ThemeContext.jsx to ThemeContext.tsx**

Read `src/contexts/ThemeContext.jsx`, add proper TypeScript types (ReactNode for children, string literals for theme values), rename to `.tsx`.

- [ ] **Step 2: Migrate socketSendQueue.js to socketSendQueue.ts**

Read `src/contexts/socketSendQueue.js`, add TypeScript types for the queue items and functions, rename to `.ts`.

- [ ] **Step 3: Update WebSocketContext.tsx import**

In `src/contexts/WebSocketContext.tsx` line 13, change:
```typescript
} from './socketSendQueue.js';
```
to:
```typescript
} from './socketSendQueue';
```
(Or keep `.js` extension if project convention requires it — check other imports in the same file.)

- [ ] **Step 4: Verify typecheck**

Run: `npm run typecheck`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: migrate contexts/ files from JS/JSX to TS/TSX"
```

---

## Task 5: Migrate hooks/chat/ Files

**Files:**
- Rename + migrate 9 `.js` files in `src/hooks/chat/` to `.ts`

These files are pure logic (no JSX), so they all become `.ts`:

```
builtInCommandBehavior.js      → .ts
chatComposerSessionTarget.js   → .ts
chatMessagePresentation.js     → .ts
chatRealtimeFileChangeEvents.js → .ts
pendingUserMessage.js          → .ts
sessionCompletionSync.js       → .ts
sessionStreamingRouting.js     → .ts
sessionTranscript.js           → .ts
slashCommandData.js            → .ts
```

- [ ] **Step 1: Migrate each file**

For each file:
1. Read the `.js` file
2. Add TypeScript type annotations to all function parameters and return types
3. Write the new `.ts` file
4. Delete the old `.js` file

Key: Preserve all exports and function signatures exactly. Only add types.

- [ ] **Step 2: Update any imports referencing these files**

Search for imports with `.js` extension pointing to these files. Update to `.ts` or remove extension per project convention.

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: migrate hooks/chat/ files from JS to TS"
```

---

## Task 6: Migrate hooks/shared/ Files

**Files:**
- Rename + migrate: `src/hooks/shared/useLocalStorage.jsx` → `.tsx`

- [ ] **Step 1: Migrate useLocalStorage**

Read `src/hooks/shared/useLocalStorage.jsx`, add generic TypeScript types for the hook, rename to `.tsx`.

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: migrate useLocalStorage from JSX to TSX"
```

---

## Task 7: Migrate components/chat/ JS Files

**Files:**
```
src/components/chat/projection/runFailureMessage.js    → .ts
src/components/chat/projection/taskBlockGrouping.js    → .ts
src/components/chat/utils/chatFormatting.js            → .ts
src/components/chat/utils/chatStorage.js               → .ts
src/components/chat/view/subcomponents/commandMenuGroups.js → .ts
```

- [ ] **Step 1: Migrate each file**

For each file:
1. Read the `.js` file
2. Add TypeScript type annotations
3. Write the new `.ts` file
4. Delete the old `.js` file

- [ ] **Step 2: Update imports referencing these files**

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: migrate components/chat/ JS files to TS"
```

---

## Task 8: Migrate questionNormalization (.js + .d.ts → single .ts)

**Files:**
- Merge: `src/components/chat/tools/utils/questionNormalization.js` + `questionNormalization.d.ts` → `questionNormalization.ts`
- Delete: `src/components/chat/tools/utils/questionNormalization.d.ts`

- [ ] **Step 1: Read both files and merge**

Read `questionNormalization.js` (implementation) and `questionNormalization.d.ts` (types). Merge the type definitions directly into the implementation file as a single `.ts` file.

- [ ] **Step 2: Delete old files**

```bash
rm src/components/chat/tools/utils/questionNormalization.js
rm src/components/chat/tools/utils/questionNormalization.d.ts
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: merge questionNormalization .js+.d.ts into single .ts"
```

---

## Task 9: Migrate Remaining Component JS Files

**Files:**
```
src/components/git-panel/utils/gitPanelErrorText.js          → .ts
src/components/right-pane/utils/rightPaneTargetIdentity.js   → .ts
src/components/settings/utils/settingsStorage.js             → .ts
```

- [ ] **Step 1: Migrate each file**

For each: read, add types, write `.ts`, delete `.js`.

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: migrate git-panel, right-pane, settings JS files to TS"
```

---

## Task 10: Migrate Utility and Store JS Files

**Files:**
```
src/lib/utils.js                    → src/lib/utils.ts
src/stores/sessionStoreRebind.js    → src/stores/sessionStoreRebind.ts
src/utils/api.js                    → src/utils/api.ts
```

Also update `src/stores/useSessionStore.ts` import of `sessionStoreRebind`.

- [ ] **Step 1: Migrate each file**

For each: read, add types, write `.ts`, delete `.js`.

- [ ] **Step 2: Update useSessionStore.ts import**

In `src/stores/useSessionStore.ts` line 13, change:
```typescript
import { rebindSessionSlotData } from './sessionStoreRebind.js';
```
to:
```typescript
import { rebindSessionSlotData } from './sessionStoreRebind';
```

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: migrate utils, stores, and lib JS files to TS"
```

---

## Task 11: Structural Cleanup — Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Fix directory descriptions**

In `CLAUDE.md`, the "前端目录结构" section references:
- `components-v2/` — does not exist. Remove this entry.
- `store/` under chat — verify description is accurate.
- Update any other outdated descriptions to match current state.

Specifically, update the `src/components/chat/` subtree description to reflect that `components/` now only contains `ComposerContextBar.ts`.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md to reflect current project structure"
```

---

## Task 12: Final Verification

- [ ] **Step 1: Run full typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 2: Run all tests**

Run: `npm run test`
Expected: All existing tests pass (dead test files already removed)

- [ ] **Step 3: Run linter**

Run: `npm run lint`
Expected: No new errors

- [ ] **Step 4: Build production bundle**

Run: `npm run build`
Expected: SUCCESS

- [ ] **Step 5: Verify no .js/.jsx files remain in src/**`

```bash
find src/ -name "*.js" -o -name "*.jsx" | grep -v node_modules | grep -v ".test.mjs" | grep -v ".d.ts"
```

Expected: Empty (all JS/JSX migrated to TS/TSX, except `.test.mjs` test files which use Node.js test runner convention).

- [ ] **Step 6: Final commit (if any last fixes needed)**

```bash
git add -A
git commit -m "chore: final cleanup verification"
```
