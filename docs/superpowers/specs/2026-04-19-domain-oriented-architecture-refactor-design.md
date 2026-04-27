# Domain-Oriented Architecture Refactor Design

## Goal

Reorganize the project around stable top-level containers and explicit business domains so the codebase can continue evolving without `src/components`, `server/routes`, and a few oversized files remaining the de facto architecture.

This design is intentionally limited to directory structure, layering rules, domain boundaries, migration order, and acceptance criteria. It does not redefine product capabilities.

## Scope

This refactor covers:

- Frontend top-level structure
- Backend top-level structure
- Business domain boundaries for `chat`, `workspace`, `git`, `settings`, and `onboarding`
- Layering rules for `app`, `platform`, `infrastructure`, and `shared`
- Migration strategy from the current structure to the target structure
- Constraints, risks, and acceptance criteria for the refactor

This refactor does not cover:

- Functional redesign of chat, file editing, Git, or settings behavior
- Provider strategy changes
- Taskmaster/plugin extraction
- Windows release packaging cleanup beyond noting it as later work

## Design Choice

The chosen approach is **layered containers with business domains**.

Instead of a pure technical layout or a pure page-layout structure, the codebase will adopt:

- Frontend: `app / domains / platform / shared`
- Backend: `app / domains / infrastructure / shared`

This option was selected because it provides:

- Clear placement for current core product capabilities
- Stable top-level structure even if business domains are added or removed later
- Better separation between product logic and runtime/system integration logic
- A path to split existing oversized files without turning new folders into another dumping ground

## Architecture Overview

### Frontend Target Structure

```text
src/
  app/
    bootstrap/
    layout/
    providers/
    routes/

  domains/
    chat/
      components/
      hooks/
      services/
      stores/
      types/
      utils/

    workspace/
      components/
      file-tree/
      code-editor/
      markdown/
      html-visual-editor/
      hooks/
      services/
      stores/
      types/
      utils/

    git/
      components/
      hooks/
      services/
      stores/
      types/
      utils/

    settings/
      components/
      provider-auth/
      mcp/
      commands/
      hooks/
      services/
      stores/
      types/
      utils/

    onboarding/
      components/
      hooks/
      types/

  platform/
    api/
    websocket/
    auth/
    routing/
    state/
    storage/

  shared/
    components/
    hooks/
    utils/
    types/
    constants/
    i18n/
```

### Backend Target Structure

```text
server/
  app/
    index.js
    http-server.js
    websocket-server.js
    route-registry.js

  domains/
    chat/
      routes/
      services/
      runtime/
      adapters/
      repositories/
      types/

    workspace/
      routes/
      services/
      repositories/
      filesystem/
      types/

    git/
      routes/
      services/
      repositories/
      types/

    settings/
      routes/
      services/
      repositories/
      types/

    auth/
      routes/
      services/
      types/

  infrastructure/
    database/
    filesystem/
    process/
    notifications/
    providers/
      claude/

  shared/
    utils/
    constants/
    types/
```

## Layer Responsibilities

### `app`

`app` is the assembly layer.

Frontend responsibilities:

- App bootstrap
- Root layout
- Root providers
- Route composition
- Global navigation shells

Backend responsibilities:

- Server bootstrap
- Express initialization
- WebSocket server setup
- Route registration
- Middleware wiring

`app` must not contain domain rules.

### `domains`

`domains` holds product capabilities. Each domain owns its own UI, state, services, and domain-local types.

Domains should be the default destination for any new product behavior.

### `platform` (frontend)

`platform` contains frontend integration and runtime access layers:

- API client
- WebSocket client
- Auth integration
- Routing integration
- Global state infrastructure
- Storage wrappers

`platform` should not contain domain-specific business rules.

### `infrastructure` (backend)

`infrastructure` contains backend technical capabilities:

- Database setup and access primitives
- Filesystem primitives
- External process execution
- Notification integration
- Claude provider runtime integration

`infrastructure` should not encode product semantics like “project list”, “chat session state”, or “Git workflow policy”.

### `shared`

`shared` contains stable cross-domain utilities and definitions.

A module may enter `shared` only if:

1. It is reused by multiple domains in a stable way.
2. It does not express a specific business concept.

This rule is intentionally strict to prevent `shared` from becoming a new dumping ground.

## Domain Boundaries

### `chat`

`chat` owns the Claude Code conversation experience.

Includes:

- Session creation, resume, abort, and lifecycle state
- Realtime message flow
- Thinking/tool/result/complete rendering state
- Composer input, slash commands, image attachments, and permission approval UX
- Run timeline, job tree, execution messages
- Chat-specific presentation and message transformation

Excludes:

- File tree and editor behavior
- Markdown editing
- HTML visual editing
- Git panel behavior
- Settings pages and configuration flows

### `workspace`

`workspace` owns the project file workbench.

Includes:

- Project/file tree
- File open/close/switch flows
- Code editor
- Markdown editor
- HTML preview and visual editing
- Right-side workspace containers
- Workspace-scoped document read/write state

Excludes:

- Claude chat runtime
- Git workflow logic
- Provider/MCP configuration
- Login/configuration UX

### `git`

`git` owns version-control workflows.

Includes:

- Diff and status views
- Commit message assistance
- Commit/revert/branch/push/PR helper flows
- Git panel state and Git-specific error handling

Excludes:

- File editing
- Chat runtime
- Provider config
- Workspace container concerns

### `settings`

`settings` owns configuration and environment setup.

Includes:

- Provider login/status
- MCP configuration
- Commands configuration
- Tool/permission preferences
- User preferences and environment-oriented settings

Excludes:

- Chat runtime state
- Editor logic
- Git operations
- Project browsing logic

### `onboarding`

`onboarding` is a lightweight domain for first-use flows.

Includes:

- First-use guidance
- Initial setup walkthroughs
- Early project/provider entry flows

Excludes:

- Persistent main workbench logic
- Long-term system configuration ownership

### Special Rule for `right-pane`

`right-pane` must stop being treated as a top-level architectural concept.

After the refactor it becomes:

- A workspace UI container concept
- Not a business domain
- Not a general-purpose place for unrelated features

## Frontend Rules

### Domain-Local Organization

Within a domain:

- `components/` contains UI components
- `hooks/` contains React composition/state logic
- `services/` contains business actions and orchestration helpers
- `stores/` contains domain state containers
- `types/` contains domain-local types
- `utils/` contains pure helpers, selectors, and transformations

### Workspace Subdomains

`workspace` is large enough to justify explicit subareas:

- `file-tree/`
- `code-editor/`
- `markdown/`
- `html-visual-editor/`
- `components/` for cross-workspace containers and shells

This is an intentional exception to avoid `workspace` becoming a second monolith.

### Frontend Dependency Direction

- `app` may depend on `domains`, `platform`, and `shared`
- `domains` may depend on `platform` and `shared`
- `platform` may depend only on `shared`
- `shared` must not depend on business domains

## Backend Rules

### Route / Service / Repository Split

Backend domains must follow these responsibilities:

- `routes/`: request/response handling only
- `services/`: business orchestration and decisions
- `repositories/`: persistence, JSONL/DB/file-backed reads and writes
- `runtime/`: long-lived session/runtime orchestration where applicable
- `adapters/`: protocol normalization and conversion

### Backend Dependency Direction

- `app` may depend on `domains`, `infrastructure`, and `shared`
- `domains` may depend on `infrastructure` and `shared`
- `infrastructure` may depend only on `shared`
- `shared` must not depend on domains

### Important File-Level Consequences

This design implies:

- `server/index.js` must be split into `app/*`
- `server/projects.js` must be split into `workspace/services` and `workspace/repositories`
- `server/claude-sdk.js` must be split into `chat/runtime` and `chat/services`, with Claude-specific technical integration moved into `infrastructure/providers/claude`
- `server/providers/claude/*` belongs under `infrastructure/providers/claude`

## Migration Strategy

### Guiding Principle

Use **skeleton-first migration, low-risk moves first, high-coupling splits later**.

This prevents the most complex runtime paths from destabilizing before the new structure exists.

### Phase 1: Establish Skeleton and Move Low-Risk Modules

Do:

- Create the new top-level structure
- Move frontend app shell modules
- Move frontend platform/shared modules
- Move lower-risk domains:
  - settings
  - provider-auth
  - git-panel
  - file-tree
  - code-editor
  - prd-editor

Do not:

- Split chat runtime yet
- Move `right-pane` wholesale
- Split the largest chat hooks yet

### Phase 2: Split Backend Assembly and Workspace Core

Do:

- Split `server/index.js` into backend app assembly modules
- Split `server/projects.js` into workspace services/repositories/filesystem layers
- Move workspace routes under `server/domains/workspace/routes`

### Phase 3: Split `right-pane` and Close the Workspace Domain

Do:

- Move workspace container shell into `workspace/components/right-pane`
- Move Markdown-related panes into `workspace/markdown`
- Move HTML visual editing into `workspace/html-visual-editor`
- Move browser preview into workspace browser-preview area
- Move Git-specific pane pieces into the `git` domain

### Phase 4: Split Chat Core Last

Do:

- Move `src/components/chat/*` into `src/domains/chat/*`
- Split oversized chat hooks by transport/session/composer/realtime responsibilities
- Split `server/claude-sdk.js`
- Move provider-specific technical integration down into `infrastructure/providers/claude`

### Modules That Must Be Split Before Moving

- `server/index.js`
- `server/projects.js`
- `server/claude-sdk.js`
- `src/components/right-pane/view/RightPane.tsx`
- `src/components/right-pane/view/RightPaneContentRouter.tsx`
- `src/components/chat/hooks/useChatMessages.ts`
- `src/components/chat/hooks/useChatComposerState.ts`
- `src/components/chat/hooks/useChatSessionState.ts`
- `src/components/chat/hooks/useChatRealtimeHandlers.ts`

### Modules That Can Be Moved Early

- `src/components/app/*`
- `src/components/sidebar/*`
- `src/components/main-content/*`
- `src/components/file-tree/*`
- `src/components/code-editor/*`
- `src/components/prd-editor/*`
- `src/components/git-panel/*`
- `src/components/settings/*`
- `src/components/provider-auth/*`
- `src/contexts/WebSocketContext.tsx`
- `src/utils/api.js`
- most shared constants/types/i18n modules
- `server/routes/mcp.js`
- `server/routes/mcp-utils.js`
- `server/routes/cli-auth.js`
- `server/routes/commands.js`
- `server/routes/settings.js`
- `server/routes/auth.js`
- `server/routes/user.js`

## Constraints

### Hard Constraints

1. Do not mix large-scale directory moves with behavior changes in the same batch.
2. Oversized, high-coupling files must be reduced before relocation.
3. New code must land in the new structure as soon as the skeleton exists.
4. `shared` must remain limited to truly cross-domain modules.
5. `right-pane` must not continue as a pseudo-domain.
6. Backend route files must stop owning complex business flows.

## Risks and Mitigations

### Risk: Large Import Churn

Moving modules will create wide import changes, especially in frontend domain clusters.

Mitigation:

- Migrate one domain cluster at a time
- Keep batches small enough to verify independently
- Run typecheck/build/tests after each batch

### Risk: Chat and Workspace Re-Couple

Because chat and workspace currently cross-reference each other in several flows, the same coupling could reappear in the new structure.

Mitigation:

- Keep chat focused on conversation semantics
- Keep workspace focused on file/workbench semantics
- Use explicit services/interfaces for cross-domain interaction

### Risk: `shared` Becomes a New Junk Drawer

Mitigation:

- Enforce the two-entry rule for `shared`
- Prefer domain-local duplication over premature abstraction

### Risk: Backend Layering Regresses

Mitigation:

- Route files remain thin
- Repositories do not hold business decisions
- Infrastructure owns process/database/provider access

### Risk: Chat Runtime Regression

Mitigation:

- Split chat last
- Preserve end-to-end verification paths during migration
- Avoid mixing runtime changes with structural changes

## Acceptance Criteria

### Structural Acceptance

- Frontend top-level structure is `app / domains / platform / shared`
- Backend top-level structure is `app / domains / infrastructure / shared`
- `src/components` and `server/routes` are no longer the long-term architectural center
- `chat`, `workspace`, `git`, and `settings` have explicit ownership boundaries

### Boundary Acceptance

- `app` contains assembly only
- `platform` and `infrastructure` contain integration concerns only
- `shared` is not used as a catch-all
- `right-pane` is reduced to a workspace container concept
- Backend route files no longer own large business workflows

### Engineering Acceptance

- Local startup still works
- Claude chat main flow still works
- File tree, code editor, Markdown, and HTML visual editing still work
- Git panel primary workflows still work
- Settings/provider-auth/MCP primary flows still work
- Typecheck/build/tests return to at least pre-refactor health

## Recommended Outcome

The project should be refactored into a **domain-centered architecture with explicit assembly layers, explicit integration layers, and a tightly controlled shared layer**.

The recommended execution order is:

1. Create skeleton
2. Move low-risk modules
3. Split backend assembly
4. Consolidate workspace
5. Split `right-pane`
6. Split chat runtime and oversized chat hooks
7. Clean historical packaging/secondary-module debt
