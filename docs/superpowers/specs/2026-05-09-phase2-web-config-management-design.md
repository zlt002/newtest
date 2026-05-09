# Phase 2 Web Config Management For Claude Runtime

## Goal

CC UI should let users maintain the local Claude Code runtime configuration from the web UI without requiring Claude Code CLI for daily configuration work.

Phase 2 builds on Lite CLI-independent Phase 1. Phase 1 proved that CC UI can read and write JSON config files, resolve Lite and Claude CLI plugins into Claude Agent SDK options, and show MCP/plugins in settings. Phase 2 turns those backend capabilities into a real web management surface.

The product goal is:

- Web UI is the primary management surface.
- Claude Agent SDK remains the runtime.
- Claude-compatible config files remain the interoperability layer.
- Claude Code CLI remains compatible, but optional.

## Non-Goals

Phase 2 does not implement remote marketplace installation yet.

Specifically, this phase will not:

- Install plugins from remote marketplaces.
- Publish plugins.
- Auto-update plugins from marketplace sources.
- Replace every Claude Code interactive diagnostic screen.
- Delete Claude CLI plugin cache directories that CC UI did not create.
- Expose secret values in clear text after they are saved.

Marketplace install, plugin update, and remote source trust controls should be a later phase after local configuration management is stable.

## User Outcomes

After Phase 2, a user can:

- Add, edit, and delete MCP servers from the web UI.
- Manage user, project, and local MCP scopes without `claude mcp`.
- View CLI-installed plugins and Lite-managed plugins in one list.
- Import a local plugin directory through the web UI.
- Enable or disable plugins through the web UI where the source is writable.
- Remove Lite-managed plugins through the web UI.
- View skills and commands from user, project, and plugin sources.
- Create, edit, and delete user/project skills and commands.
- View plugin-provided skills and commands as read-only.
- Reach hooks management from the same Claude settings area.
- Configure Claude runtime env/model/permission settings from the web UI.
- Understand which config file each item comes from.

## Information Architecture

The Claude/Agent settings area should become a runtime management console with these sections:

1. Account and Runtime
2. Permissions
3. MCP
4. Plugins
5. Skills
6. Commands
7. Hooks

The current compact `AgentsSettingsTab.tsx` should not keep growing indefinitely. Phase 2 should split the settings surface into focused sections and shared hooks:

- `ClaudeRuntimeSettingsSection`
- `McpManagementSection`
- `PluginManagementSection`
- `SkillManagementSection`
- `CommandManagementSection`
- `HooksEntrySection`

The existing hooks pages can stay as detailed editors. The Claude settings surface should link into them and show a compact effective summary.

## Data Model

### Managed Source

Every item returned to the UI should include source metadata:

```ts
type ManagedSource = {
  kind: "user" | "project" | "local" | "legacy" | "lite" | "cli" | "plugin";
  path: string;
  writable: boolean;
  reason?: string;
};
```

`writable` means CC UI can safely mutate the item through its JSON/file service. Plugin-provided entries are normally read-only.

### MCP Item

```ts
type ManagedMcpServer = {
  id: string;
  name: string;
  scope: "user" | "project" | "local" | "legacy";
  type: "stdio" | "http" | "sse";
  source: ManagedSource;
  config: {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
  };
  enabled: boolean;
};
```

### Plugin Item

```ts
type ManagedPlugin = {
  id: string;
  name: string;
  version?: string;
  path: string;
  enabled: boolean;
  source: ManagedSource;
  sdkResolved: boolean;
  removable: boolean;
};
```

CLI plugins are writable for enable/disable when the setting lives in `~/.claude/settings.json`. CLI cache deletion is not part of Phase 2.

Lite plugins are writable and removable through `~/.ccui/lite-registry.json`.

### Skill And Command Item

```ts
type ManagedCapability = {
  id: string;
  type: "skill" | "command";
  name: string;
  description?: string;
  path: string;
  source: ManagedSource;
  pluginId?: string;
  editable: boolean;
  enabled: boolean;
};
```

User/project skills and commands are editable Markdown files. Plugin-provided skills and commands are read-only.

## Backend Architecture

Phase 2 should add a unified management layer rather than wiring the UI directly to unrelated route modules.

### ClaudeRuntimeConfigService

Responsibilities:

- Read and write `~/.claude/settings.json`.
- Manage env keys:
  - `ANTHROPIC_AUTH_TOKEN`
  - `ANTHROPIC_API_KEY`
  - `ANTHROPIC_BASE_URL`
  - `ANTHROPIC_MODEL`
  - `ANTHROPIC_DEFAULT_HAIKU_MODEL`
  - `ANTHROPIC_DEFAULT_SONNET_MODEL`
  - `ANTHROPIC_DEFAULT_OPUS_MODEL`
  - `ANTHROPIC_REASONING_MODEL`
- Manage permission defaults where this project already supports them.
- Return secret status as `configured: true`, not secret values.
- Preserve unknown settings fields.

### McpConfigService

Phase 1 already created the core service. Phase 2 should add:

- Validation endpoint for proposed config.
- UI-oriented list response with source metadata and `writable`.
- Add/edit/delete routes that are stable for UI use.
- Duplicate-name detection across scopes.
- Safer env/header editors with structured key/value arrays in the UI.

### PluginManagementService

Responsibilities:

- List Lite-managed plugins from `~/.ccui/lite-registry.json`.
- List CLI-installed plugins from `~/.claude/plugins/installed_plugins.json`.
- Read enabled state from `~/.claude/settings.json.enabledPlugins`.
- Merge both into `ManagedPlugin[]`.
- Import a local plugin directory into Lite registry.
- Enable/disable Lite plugins.
- Enable/disable CLI plugins by updating `enabledPlugins`.
- Remove Lite-managed plugins from Lite registry.
- Produce SDK plugin options.

Deletion rule:

- Removing a Lite plugin removes the Lite registry entry.
- Removing a CLI plugin only disables it in Phase 2. It must not delete CLI-managed cache folders.

### CapabilityCatalogService

Responsibilities:

- Scan user skills and commands.
- Scan project skills and commands.
- Scan enabled plugin directories for skills and commands.
- Parse `SKILL.md` frontmatter or first heading/description where available.
- Parse command Markdown metadata where available.
- Return normalized `ManagedCapability[]`.
- Create/edit/delete user/project skills and commands.

Initial source paths:

- User commands: `~/.claude/commands/**/*.md`
- Project commands: `<project>/.claude/commands/**/*.md`
- User skills: `~/.claude/skills/**/SKILL.md`
- Project skills: `<project>/.claude/skills/**/SKILL.md`
- Plugin skills/commands: enabled plugin paths resolved by `PluginManagementService`

The service should avoid assuming only one ecosystem directory. If existing project conventions include `.codex/skills` or `.agents/skills`, Phase 2 may show them as read-only or separately labeled external sources, but the primary write targets should remain Claude-compatible paths.

### Hooks Integration

The repo already has hooks discovery, overview, effective view, source detail, mutation routes, and hook pages. Phase 2 should integrate rather than rewrite.

Required work:

- Add a compact Hooks section to Claude settings.
- Show effective hook sources and writable/read-only status.
- Link to existing hooks editor/source pages.
- Keep plugin-provided hooks read-only.

## API Shape

### Runtime Config

```text
GET   /api/claude-config/runtime
PATCH /api/claude-config/runtime
```

### MCP

Use and refine Phase 1 routes:

```text
GET    /api/mcp/config/read
POST   /api/mcp/config
PATCH  /api/mcp/config/:name
DELETE /api/mcp/config/:name
POST   /api/mcp/config/validate
```

### Plugins

Extend Phase 1 routes:

```text
GET    /api/plugins
POST   /api/plugins/import-directory
PATCH  /api/plugins/:id
DELETE /api/plugins/:id
POST   /api/plugins/reload
```

`DELETE /api/plugins/:id` should:

- Remove Lite plugins.
- Disable CLI plugins and return `removed: false, disabled: true` unless the plugin is Lite-managed.

### Capabilities

```text
GET    /api/capabilities?type=skill|command&projectPath=...
POST   /api/capabilities
GET    /api/capabilities/:id
PATCH  /api/capabilities/:id
DELETE /api/capabilities/:id
```

IDs should be stable, URL-safe, and include source kind plus relative path.

## UI Design

### MCP Section

The MCP section should move from read-only cards to a management table/list:

- Add MCP button.
- Edit and delete actions for writable entries.
- Scope badge.
- Type badge.
- Source path disclosure.
- Duplicate-name warning when the same MCP name appears across scopes.
- Form modes:
  - stdio: command, args, env
  - http/sse: url, headers

### Plugins Section

The plugin section should show two groups in one list:

- Lite-managed plugins.
- CLI-discovered plugins.

Each row shows:

- Name/id
- Version
- Source badge: Lite or CLI
- SDK loaded status
- Path
- Enable/disable action if writable
- Remove action if Lite-managed

Actions:

- Import local directory.
- Enable/disable.
- Remove Lite plugin.
- Reload active sessions, with skipped sessions shown as informational.

### Skills Section

The skills section should show:

- Search/filter.
- Source filter: user/project/plugin/external.
- New skill button.
- Read-only badge for plugin skills.
- Description preview.
- View/edit drawer.

Creation target:

- User skill by default.
- Project skill when a project is selected.

### Commands Section

The commands section mirrors skills, but creates command Markdown files.

Command names should normalize to slash-command style in display, but filenames should remain safe and predictable.

### Runtime Config Section

The runtime section should include:

- API auth token/key configured status.
- Base URL.
- Model fields.
- Permission mode.
- Save button.
- Clear secret button for configured secrets.

Secret inputs should not prefill saved secret values.

## Error Handling

All mutation routes should return:

```json
{
  "success": false,
  "message": "Human readable message",
  "error": "Machine/debug detail when useful"
}
```

The UI should distinguish:

- Validation error.
- Read-only source.
- File parse error.
- Runtime reload unsupported.
- Saved but not active until new session.

Plugin reload unsupported is informational, not a hard error.

## Testing Strategy

Backend tests:

- Runtime config read/write with secret masking.
- MCP create/edit/delete per scope.
- Plugin list merge from Lite + CLI.
- Plugin enable/disable for Lite and CLI.
- Lite plugin removal.
- Capability catalog scanning for user/project/plugin skills and commands.
- Capability create/edit/delete for user/project sources.
- Read-only rejection for plugin sources.

Frontend/source tests:

- Settings UI references non-CLI routes.
- MCP section exposes add/edit/delete controls.
- Plugin section exposes import/enable/disable/remove controls.
- Skills and commands sections expose create/edit/delete controls.
- Runtime config section masks secrets.
- Hooks section links to existing hooks pages.

Build:

- `npm run build`

## Rollout Plan

Implement Phase 2 in smaller slices:

1. Runtime config service and UI.
2. MCP management UI on top of Phase 1 service.
3. Plugin management service extensions and UI actions.
4. Capability catalog service for skills and commands.
5. Skills and commands management UI.
6. Hooks settings integration.
7. Final verification and manual acceptance guide.

Each slice should be reviewable and independently testable.

## Acceptance Criteria

Phase 2 is complete when:

- A user can configure API/base URL/models from Web.
- A user can add/edit/delete MCP servers from Web without CLI.
- A user can import a local plugin directory from Web.
- A user can enable/disable both Lite and CLI-discovered plugins from Web where safe.
- A user can remove Lite-managed plugins from Web.
- A user can list, create, edit, and delete user/project skills.
- A user can list, create, edit, and delete user/project commands.
- Plugin-provided skills/commands/hooks are visible and marked read-only.
- Hooks management is reachable from Claude settings.
- Existing CLI configuration remains readable and compatible.
- No core management action spawns `claude`.

