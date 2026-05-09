# Lite Independent Mode With Claude CLI Compatibility

## Goal

CC UI Lite should work without requiring Claude Code CLI to be installed, while still interoperating with existing Claude Code CLI configuration when it is present.

The product direction is:

- Claude Agent SDK is the runtime.
- Claude-compatible configuration files are the interoperability layer.
- The web UI is the management surface.
- Claude Code CLI is an optional compatibility and diagnostics layer, not a hard dependency.

## Non-Goals

- Do not require users to authenticate through `claude login`.
- Do not make core MCP, command, skill, or plugin management depend on `claude mcp ...`.
- Do not replace every Claude Code CLI feature in the first release.
- Do not implement remote plugin marketplace installation before local plugin import and SDK loading are stable.

## Current Findings

The current project already supports much of this direction:

- Chat execution uses `@anthropic-ai/claude-agent-sdk`, not direct `claude` process execution.
- Claude auth status can be satisfied by `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` in `~/.claude/settings.json`.
- MCP listing in the current settings tab reads config files through `/api/mcp/config/read`.
- SDK types support `plugins: [{ type: "local", path }]`.
- SDK session types expose `getContextUsage()` and `reloadPlugins()`.
- `/compact` is intentionally not a local UI command and should flow to the SDK runtime.
- `/context` is a local UI command that can call `getContextUsage()` on a live SDK session.

Remaining CLI-dependent areas:

- `claude login` is still the account modal guidance.
- Legacy MCP add/list/remove/get endpoints spawn `claude mcp ...`.
- Plugin resolution currently relies on `~/.claude/plugins/installed_plugins.json`, which is usually produced by Claude Code CLI.
- Some edge SDK calls should be audited to ensure they receive the same settings-derived env as the main chat runtime.

## Architecture

Add a Lite-independent management layer with five backend modules.

### ClaudeConfigService

Responsibilities:

- Read and write Claude-compatible settings.
- Manage API key, auth token, base URL, model defaults, and model tier mappings.
- Return non-secret values for UI readback.
- Mask secret values and report only whether they are configured.

Primary files:

- `~/.claude/settings.json`
- Project `.claude/settings.json`
- Project `.claude/settings.local.json`

### McpConfigService

Responsibilities:

- Read, normalize, create, update, and delete MCP server definitions.
- Avoid invoking `claude mcp ...` for core management.
- Preserve source paths and scopes so the UI can show where each server is defined.

Primary files:

- `~/.claude/settings.json`
- `~/.claude.json`
- Project `.mcp.json`
- Project `.claude/settings.json`
- Project `.claude/settings.local.json`

### PluginRegistryService

Responsibilities:

- Read Claude CLI installed plugin records when present.
- Maintain CC UI Lite plugin registry metadata.
- Import local plugin directories.
- Import plugin zip archives.
- Later, install plugins from URL or marketplace.
- Produce SDK-ready plugin configs: `[{ type: "local", path }]`.

Primary files:

- `~/.ccui/lite-registry.json`
- `~/.ccui/plugins/...`
- `~/.claude/plugins/installed_plugins.json`
- `~/.claude/settings.json`
- Project `.claude/settings.json`

### CommandSkillService

Responsibilities:

- Read local UI commands, user commands, project commands, plugin commands, and SDK runtime commands.
- Manage editable user and project markdown commands.
- Display plugin and runtime commands as read-only unless their source is editable.
- Provide a unified commands and skills catalog for the UI.

Primary files and sources:

- `shared/claudeCommandRegistry.js`
- `~/.claude/commands/**/*.md`
- Project `.claude/commands/**/*.md`
- Plugin `commands/**/*.md`
- Plugin `skills/**`
- SDK initialization command and skill metadata

### ClaudeRuntimeBridge

Responsibilities:

- Resolve runtime config for each session.
- Build SDK options from config, MCP, plugins, hooks, commands, permissions, and project path.
- Refresh runtime state after plugin, MCP, or command changes where the SDK supports it.
- Provide a runtime status view.

SDK options should include:

```ts
{
  cwd: projectPath,
  env,
  model,
  settingSources: ["user", "project", "local"],
  plugins: [{ type: "local", path: "/path/to/plugin" }],
  hooks,
  permissionMode,
  toolsSettings
}
```

## Configuration Strategy

Use Claude-compatible files as the source of interoperability. Use a CC UI Lite registry only for management metadata that Claude settings do not naturally store.

### Claude-Compatible Files

- User settings: `~/.claude/settings.json`
- Legacy user MCP: `~/.claude.json`
- Project settings: `<project>/.claude/settings.json`
- Local project settings: `<project>/.claude/settings.local.json`
- Project MCP: `<project>/.mcp.json`

### Lite Registry

Store CC UI management metadata in:

```text
~/.ccui/lite-registry.json
```

Example:

```json
{
  "plugins": [
    {
      "id": "superpowers@claude-plugins-official",
      "name": "Superpowers",
      "version": "5.0.7",
      "path": "/Users/me/.ccui/plugins/superpowers/5.0.7",
      "source": "marketplace",
      "enabled": true,
      "installedAt": "2026-05-09T00:00:00.000Z"
    }
  ],
  "managedMcpServers": [
    {
      "name": "repowise",
      "scope": "project",
      "sourcePath": "/path/to/project/.mcp.json"
    }
  ]
}
```

### Write Rules

All writes must be read-merge-write:

1. Read the current JSON.
2. Validate the current JSON is an object.
3. Modify only the targeted key or section.
4. Preserve unknown fields.
5. Validate the next shape.
6. Write formatted JSON.

Secret values must not be returned to the browser. The UI can show `configured: true` for API keys or tokens.

## MCP Manager

MCP management should not require Claude Code CLI.

### Read

Return a normalized list:

```ts
{
  id: "project:repowise",
  name: "repowise",
  scope: "project" | "user" | "local" | "legacy",
  sourcePath: "/path/to/.mcp.json",
  type: "stdio" | "sse" | "http",
  config: {
    command?: string,
    args?: string[],
    env?: Record<string, string>,
    url?: string,
    headers?: Record<string, string>
  },
  enabled: true,
  managedBy: "ccui" | "external" | "unknown"
}
```

### Write

- User MCP can write to `~/.claude/settings.json` or `~/.claude.json`.
- Project MCP should prefer `<project>/.mcp.json`.
- Editing an MCP server modifies the server in its `sourcePath`.
- Deleting an MCP server removes only the selected source entry.
- Duplicate names across scopes are displayed as multiple entries with their source paths.

### Test and Status

Do not use `claude mcp list` or `claude mcp get` as the primary test path.

Use:

- Static validation for config shape.
- SDK session `mcpServerStatus()` when available.
- Runtime probe sessions when needed.
- A clear "saved but not runtime-tested" state when no SDK session is active.

## Plugin Manager

SDK supports local plugin paths. CLI is not required to load plugins.

### Supported Sources

Phase 1:

- Import local directory.
- Import zip archive.
- Read Claude CLI installed plugin paths.
- Enable, disable, reload, and uninstall Lite-managed plugins.

Phase 2:

- Install from URL.
- Install from marketplace.
- Update marketplace-installed plugins.

### Plugin Storage

Lite-managed plugins are stored in:

```text
~/.ccui/plugins/<plugin-id>/<version>/
```

Required validation:

- `.claude-plugin/plugin.json` exists.
- Plugin directory is inside the expected destination after zip extraction.
- Zip import prevents path traversal.
- Existing versions are not overwritten unless explicitly confirmed.

### Enable and Disable

Enabling a plugin:

- Marks the Lite registry entry enabled.
- Optionally writes `enabledPlugins[pluginId] = true` to `~/.claude/settings.json`.
- Adds `{ type: "local", path }` to SDK runtime plugin config.
- Calls `reloadPlugins()` on active SDK sessions when possible.

Disabling a plugin:

- Marks the Lite registry entry disabled.
- Optionally writes `enabledPlugins[pluginId] = false`.
- Removes the plugin path from SDK runtime config on new sessions.
- Calls `reloadPlugins()` on active sessions when possible.

### CLI Compatibility

When `~/.claude/plugins/installed_plugins.json` exists, read its install records and surface them in the UI as Claude CLI-installed plugins. If an install record has an `installPath`, it can be passed directly to the SDK as a local plugin.

## Commands and Skills

Commands and skills should be managed as files and runtime catalog entries.

### Command Sources

- Local UI commands from `shared/claudeCommandRegistry.js`.
- User commands from `~/.claude/commands/**/*.md`.
- Project commands from `<project>/.claude/commands/**/*.md`.
- Plugin commands from `<plugin>/commands/**/*.md`.
- Runtime commands from SDK initialization or supported command metadata.

### Skill Sources

- Lite built-in skills.
- User skills.
- Project skills.
- Plugin `skills/`.
- SDK initialization skills.

### Execution Rules

- Local UI commands execute through CC UI handlers.
- `/context` remains a local UI command and uses SDK `getContextUsage()` when possible.
- `/compact` remains a runtime command and is sent raw to the SDK session.
- SDK runtime commands are not routed through `/api/commands/execute`.
- User and project markdown commands can be edited in the UI.
- Plugin and SDK runtime commands are read-only unless their source is editable.

## Runtime Refresh

Different changes have different refresh behavior.

- API key, base URL, and model defaults: new sessions always see them. Active session refresh should be conservative unless the SDK supports dynamic changes.
- MCP changes: static config updates immediately; runtime status updates after SDK status refresh or new session.
- Plugin changes: call `reloadPlugins()` when there is an active SDK session.
- Command changes: refresh the command catalog after file writes.
- Hook changes: new sessions always see them; active session behavior should be treated as next-request or next-session unless verified.

The UI should include a runtime status panel:

- Active session id.
- Model.
- API config source.
- Setting sources.
- Loaded plugin count.
- Runtime command count.
- Skill count.
- MCP status.
- Hook sources.
- Last reload time.
- Warnings and errors.

## User Experience

### No Claude CLI Installed

The UI should show Lite independent mode:

- Configure API key, base URL, and models.
- Manage MCP servers.
- Import local plugins in Phase 1, with remote installation added later.
- Manage user and project commands.
- View skills.
- Use `/compact`, `/context`, MCP, plugins, and runtime commands through SDK.

No core action should require `claude`.

### Claude CLI Installed

The UI should show compatibility mode:

- Detect CLI status.
- Read CLI-created settings and plugin install records.
- Display sources as "Claude CLI", "User settings", "Project settings", or "CC UI Lite".
- Keep writes compatible with Claude config files.
- Offer CLI login guidance as an optional action, not the primary setup path.

## API Sketch

### Config

- `GET /api/cli/claude/settings`
- `POST /api/cli/claude/settings`

### MCP

- `GET /api/mcp/config`
- `POST /api/mcp/config`
- `PATCH /api/mcp/config/:id`
- `DELETE /api/mcp/config/:id`
- `POST /api/mcp/config/import`
- `POST /api/mcp/status/probe`

### Plugins

- `GET /api/plugins`
- `POST /api/plugins/import-directory`
- `POST /api/plugins/import-zip`
- `POST /api/plugins/install-url`
- `POST /api/plugins/install-marketplace`
- `PATCH /api/plugins/:id`
- `DELETE /api/plugins/:id`
- `POST /api/plugins/reload`
- `GET /api/plugins/runtime-status`

### Commands and Skills

- `GET /api/commands/catalog`
- `POST /api/commands/custom`
- `PATCH /api/commands/custom/:id`
- `DELETE /api/commands/custom/:id`
- `GET /api/skills/catalog`
- `POST /api/skills/import`
- `PATCH /api/skills/:id`
- `DELETE /api/skills/:id`

## Implementation Phases

### Phase 1: Remove Core CLI Dependency

- Keep account setup API-key-first.
- Replace MCP CLI add/remove paths with JSON file read/write services.
- Add plugin local directory import.
- Add plugin zip import.
- Load Lite-managed and CLI-installed local plugins into SDK options.
- Add runtime plugin reload.
- Add command and skill catalog read-only views.

### Phase 2: Management UI

- Add editable MCP manager UI.
- Add plugin manager UI.
- Add user and project markdown command editor.
- Add runtime status panel.
- Add source badges and conflict display.

### Phase 3: Remote Plugin Installation

- Add URL install.
- Add marketplace browsing.
- Add plugin update checks.
- Add trust and safety prompts for remote plugin installation.

## Testing Plan

Automated tests:

- No CLI plus API settings can create SDK runtime options.
- No CLI plus MCP create/edit/delete writes the expected JSON.
- Existing CLI MCP config is read and shown.
- Existing CLI plugin install records are resolved to SDK local plugin paths.
- Lite plugin registry entries are resolved to SDK local plugin paths.
- `/compact` is not executed through local command API.
- `/context` uses SDK `getContextUsage()` when available and fallback otherwise.
- Plugin enable/disable changes runtime plugin config.
- `reloadPlugins()` result updates runtime status.
- Secret values are not returned to the browser.

Manual tests:

- Fresh machine without Claude CLI.
- Machine with Claude CLI and existing settings.
- Windows Lite package without Claude CLI in PATH.
- Mac Lite package without Claude CLI in PATH.
- Existing CLI-created MCP and plugin config appears in UI.
- Web-created MCP and commands can be read by Claude-compatible paths.

## Initial Decisions

- User-level MCP should default to `~/.claude/settings.json`. Existing `~/.claude.json` remains readable and editable when it is the source of an existing server.
- Plugin enabled state should be recorded in the Lite registry first. Syncing to `~/.claude/settings.json` is allowed when the user opts into Claude CLI interoperability for that plugin.
- Remote marketplace installation is Phase 3. Phase 1 supports local directory import, zip import, and reading existing CLI-installed plugin paths.
- Active sessions should not be automatically restarted after API or model config changes. The UI should tell users the change applies to new sessions unless a specific SDK hot-reload path is verified.
