# Project Cleanup & Simplification Design

Date: 2026-04-25

## Goal

Reduce codebase complexity by removing unused/redundant code, completing the hooks directory migration, deleting deprecated feature modules (Cursor, multi-Provider, TaskMaster, LangSmith), and splitting oversized files.

## Approach

Three phases, each independently committable and reversible:

1. **Safe cleanup** — remove dead files and empty directories
2. **Hooks migration + module removal** — complete the migration and delete deprecated modules
3. **Giant file splitting** — decompose oversized files

Testing strategy: validate once at the end of each phase (typecheck + test + lint).

---

## Phase 1: Safe Cleanup

Zero-risk deletions. No active imports affected.

### Empty directories to delete

- `src/utils/chat/`
- `src/utils/editor/`
- `src/utils/shared/`
- `src/components/common/`
- `src/hooks/editor/`
- `server/models/schemas/` (only `.gitkeep`)
- `server/websocket/middleware/`

### Deprecated files to delete

- `server/routes/cursor.js` — returns HTTP 410, Cursor not supported

### Unused constants to delete

- `src/constants/config.ts` — zero imports across the codebase
- `src/constants/models.ts` — content duplicated in `shared/modelConstants.js`; all imports use the latter
- `src/constants/index.ts` — only re-exports from the two files above, both unused

### Route registration cleanup

- `server/routes/index.js` — remove the `cursor` route import and `app.use('/api/cursor', ...)` line

### Expected outcome

~8 files/directories deleted, 0 active imports broken.

---

## Phase 2: Hooks Migration + Module Removal

### 2a. Complete hooks directory migration

**Current state:**
- `src/hooks/chat/` — migration target (files exist, import paths already use aliases from prior refactoring)
- `src/components/chat/hooks/` — old location (currently active, ~45+ relative imports point here)

**Steps:**

1. Update all imports referencing `components/chat/hooks/` (via relative paths like `../hooks/`, `../../hooks/`) to use `@hooks/chat/` alias
2. Key files needing import updates:
   - `src/components/chat/view/ChatInterface.tsx` and other view files
   - `src/components/chat/types/types.ts`
   - `src/components/app/AppContent.tsx` and related utils
3. Verify `src/hooks/chat/` files use alias imports (already done in prior refactoring)
4. Delete `src/components/chat/hooks/` directory

**Import count:** ~45+ references to update.

### 2b. Remove Cursor integration

Already covered in Phase 1 (route file). Check for any frontend references to Cursor-specific UI and remove.

### 2c. Remove multi-Provider system

**Risk note:** The provider system is deeply embedded in onboarding, settings, and message routing. The V2 agent route (`server/routes/agent.js`) handles Claude conversations via WebSocket; `server/routes/messages.js` is the legacy multi-provider HTTP endpoint. Cleanup must preserve Claude functionality.

**Files to delete:**

| Path | Reason |
|------|--------|
| `server/providers/` (entire directory) | Provider registry, adapter, types — multi-provider infrastructure |
| `server/routes/gemini.js` | Gemini-specific routes |
| `server/routes/messages.js` | Unified messages endpoint for multi-provider (Claude uses agent.js/WS) |
| `server/services/notification-orchestrator.js` | Event system for provider notifications |

**Frontend cleanup (remove non-Claude provider references):**

| Path | Action |
|------|--------|
| `src/components/provider-auth/` | Delete entirely — multi-provider login UI |
| `src/components/onboarding/view/utils.ts` | Remove Cursor/Codex/Gemini from `cliProviders` array, keep Claude only |
| `src/components/onboarding/view/Onboarding.tsx` | Remove ProviderLoginModal import and usage |
| `src/components/settings/view/tabs/AgentsSettingsTab.tsx` | Remove provider-auth import, simplify to Claude-only settings |
| `src/components/llm-logo-provider/` | Keep directory but remove non-Claude provider logos if any |

**Route registration:** Remove gemini, messages imports from `server/routes/index.js`.

**Do NOT delete:** `src/components/onboarding/` — still needed for Claude onboarding flow, just simplify to single provider.

### 2d. Remove TaskMaster integration

**Files to delete:**

| Path | Size | Reason |
|------|------|--------|
| `server/routes/taskmaster.js` | 65KB | TaskMaster API routes |
| `server/routes/mcp-utils.js` | — | TaskMaster MCP utility endpoints |
| `server/utils/taskmaster-websocket.js` | — | TaskMaster WebSocket bridge |
| `server/utils/mcp-detector.js` | — | MCP server detection (TaskMaster-specific) |
| `src/components/task-master/` (entire directory) | — | TaskMaster UI components |
| `src/contexts/TaskMasterContext.ts` | — | TaskMaster React context |
| `src/i18n/zh-CN/tasks.json` | — | TaskMaster translations |

**Route registration:** Remove taskmaster, mcp-utils imports from `server/routes/index.js`.

**Frontend cleanup:** Remove TaskMaster context provider from app tree, remove task-master component imports.

**Dependencies to remove from package.json:**
- Any `taskmaster`-related packages
- Review `mcp` related packages for TaskMaster-only usage

### 2e. Remove LangSmith integration

**Files to delete:**

| Path | Reason |
|------|--------|
| `server/utils/langsmith-claude-sdk.js` | LangSmith SDK wrapper |

**Code cleanup:**
- Remove all `LANGSMITH_*` environment variable references from `server/index.js` and any config files
- Remove LangSmith initialization calls from agent execution pipeline

**Dependencies to remove from package.json:**
- `langsmith`

### 2f. Clean up route registration

`server/routes/index.js` must be updated to remove imports and `app.use()` calls for:
- gemini
- messages
- taskmaster
- mcp-utils

Note: cursor route removal is already covered in Phase 1.

### Expected outcome

- ~15 files/directories deleted
- ~45+ imports updated (hooks migration)
- ~130KB+ of server code removed (taskmaster.js alone is 65KB)
- 1+ npm dependencies removed

---

## Phase 3: Giant File Splitting

### 3a. Split `server/index.js` (2919 lines → ~5 files)

**Current responsibilities (all in one file):**
- Express server setup and middleware
- Database initialization
- WebSocket server creation
- Chat WebSocket handler logic
- Shell WebSocket handler logic
- Service initialization (agent, hooks, projects)
- Route mounting
- Environment configuration

**Target structure:**

| File | Responsibility | Est. Lines |
|------|----------------|------------|
| `server/index.js` | Entry point — imports and starts server | ~100 |
| `server/websocket/setup.js` | WebSocket server init + event routing | ~150 |
| `server/websocket/handlers/chatHandler.js` | Chat WS message handling | ~400 |
| `server/websocket/handlers/shellHandler.js` | Shell WS message handling | ~200 |
| `server/app-setup.js` | Express app creation, middleware, route mounting | ~200 |

**Note:** `server/websocket/handlers/` already contains `chatHandler.js` and `shellHandler.js` — verify their current state (may already have some logic, or may be stubs awaiting migration from index.js).

### 3b. Split `server/projects.js` (86KB)

**Current responsibilities:**
- Project discovery (filesystem scanning)
- Session listing and management
- File search within projects
- Project metadata operations

**Target structure:**

| File | Responsibility |
|------|----------------|
| `server/projects.js` | Entry point — re-exports for backward compatibility |
| `server/controllers/projectController.js` | Already exists from recent refactoring — verify coverage |
| `server/services/projectDiscovery.js` | Project filesystem scanning |
| `server/sessionManager.js` | Already exists — consolidate session logic here |

**Approach:** Verify what `projectController.js` already covers, then incrementally move remaining logic out of `projects.js` into focused service modules.

### Expected outcome

- No file over 500 lines
- Clear separation of concerns
- Backward-compatible exports maintained where needed

---

## Scope Exclusions

The following are explicitly NOT in scope:

- Frontend component refactoring (chat component structure, sidebar components, etc.)
- UI/UX improvements
- New feature development
- Test file cleanup (beyond removing tests for deleted modules)
- i18n cleanup beyond removing tasks.json

## Risk Mitigation

- Each phase ends with: `npm run typecheck && npm run test && npm run lint`
- Pre-existing failures (5 test failures, 1 TS error, 22 lint errors) are baseline — only NEW failures block progress
- Each phase is a separate git commit for easy rollback
- Import updates use automated search-and-replace where possible

## Success Criteria

1. Zero NEW TypeScript errors, test failures, or lint errors
2. `src/components/chat/hooks/` directory no longer exists
3. All deprecated modules (Cursor, multi-Provider, TaskMaster, LangSmith) fully removed
4. No file in `server/` over 500 lines
5. All imports consistently use path aliases (`@hooks/chat/`) for hooks
